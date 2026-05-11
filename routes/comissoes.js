const express = require('express');
const router = express.Router();
const db = require('../database/db');

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// executarFechamento: chamado por cron e manualmente via rota POST /fechar
// Aceita loja_id opcional; quando chamado por cron sem contexto de usuário,
// pode ser invocado por todas as lojas iterando externamente.
function executarFechamento(mes, ano, loja_id) {
    const jaExiste = loja_id
        ? db.prepare('SELECT id FROM fechamentos_comissao WHERE mes = ? AND ano = ? AND loja_id = ?').get(mes, ano, loja_id)
        : db.prepare('SELECT id FROM fechamentos_comissao WHERE mes = ? AND ano = ?').get(mes, ano);
    if (jaExiste) return { jaExistia: true, fechamento_id: jaExiste.id };

    // OS concluídas no mês/ano com vendedor atribuído
    const inicio = `${ano}-${String(mes).padStart(2,'0')}-01 00:00:00`;
    const fim    = `${ano}-${String(mes).padStart(2,'0')}-31 23:59:59`;

    const ordensQuery = loja_id
        ? `SELECT os.id, os.numero, os.valor, os.data_conclusao,
               v.id as vendedor_id, v.nome as vendedor_nome, v.percentual_comissao,
               v.salario_base, v.meta, v.bonus_meta
        FROM ordens_servico os
        JOIN vendedores v ON os.vendedor_id = v.id
        WHERE os.status = 'concluida'
          AND os.data_conclusao >= ? AND os.data_conclusao <= ?
          AND v.ativo = 1
          AND os.loja_id = ?
          AND os.id NOT IN (SELECT ordem_id FROM comissoes_itens)`
        : `SELECT os.id, os.numero, os.valor, os.data_conclusao,
               v.id as vendedor_id, v.nome as vendedor_nome, v.percentual_comissao,
               v.salario_base, v.meta, v.bonus_meta
        FROM ordens_servico os
        JOIN vendedores v ON os.vendedor_id = v.id
        WHERE os.status = 'concluida'
          AND os.data_conclusao >= ? AND os.data_conclusao <= ?
          AND v.ativo = 1
          AND os.id NOT IN (SELECT ordem_id FROM comissoes_itens)`;

    const ordens = loja_id
        ? db.prepare(ordensQuery).all(inicio, fim, loja_id)
        : db.prepare(ordensQuery).all(inicio, fim);

    // Agrupa por vendedor para calcular total_os (meta)
    const porVendFech = {};
    for (const o of ordens) {
        if (!porVendFech[o.vendedor_id]) porVendFech[o.vendedor_id] = { total_os: 0, total_comissao: 0, salario_base: o.salario_base || 0, meta: o.meta || 0, bonus_meta: o.bonus_meta || 0 };
        porVendFech[o.vendedor_id].total_os += o.valor;
        porVendFech[o.vendedor_id].total_comissao += o.valor * o.percentual_comissao / 100;
    }
    // Vendedores com salário sem OS
    const vendedoresAtivos = loja_id
        ? db.prepare(`SELECT id, salario_base, meta, bonus_meta FROM vendedores WHERE ativo = 1 AND salario_base > 0 AND loja_id = ?`).all(loja_id)
        : db.prepare(`SELECT id, salario_base, meta, bonus_meta FROM vendedores WHERE ativo = 1 AND salario_base > 0`).all();
    vendedoresAtivos.forEach(v => { if (!porVendFech[v.id]) porVendFech[v.id] = { total_os: 0, total_comissao: 0, salario_base: v.salario_base, meta: v.meta || 0, bonus_meta: v.bonus_meta || 0 }; });

    const totalGeral    = Object.values(porVendFech).reduce((s, v) => s + v.total_comissao, 0);
    const totalSalarios = Object.values(porVendFech).reduce((s, v) => s + v.salario_base, 0);
    const totalBonus    = Object.values(porVendFech).reduce((s, v) => s + ((v.meta > 0 && v.total_os >= v.meta) ? v.bonus_meta : 0), 0);

    // Vales do período
    const inicio2 = `${ano}-${String(mes).padStart(2,'0')}-01`;
    const fim2    = `${ano}-${String(mes).padStart(2,'0')}-31`;
    const valesDoMes = loja_id
        ? db.prepare(`SELECT vl.vendedor_id, SUM(vl.valor) as total FROM vales vl JOIN vendedores vd ON vd.id = vl.vendedor_id WHERE vl.data >= ? AND vl.data <= ? AND vl.fechamento_id IS NULL AND vd.loja_id = ? GROUP BY vl.vendedor_id`).all(inicio2, fim2, loja_id)
        : db.prepare(`SELECT vendedor_id, SUM(valor) as total FROM vales WHERE data >= ? AND data <= ? AND fechamento_id IS NULL GROUP BY vendedor_id`).all(inicio2, fim2);
    const totalVales = valesDoMes.reduce((s, v) => s + v.total, 0);
    const totalLiquido  = Math.max(0, totalGeral - totalVales);
    const totalAPagar   = Math.max(0, totalSalarios + totalGeral + totalBonus - totalVales);

    const insertFech = loja_id
        ? db.prepare(`INSERT INTO fechamentos_comissao (mes, ano, total_geral, total_vales, total_liquido, total_salarios, total_bonus, total_a_pagar, loja_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        : db.prepare(`INSERT INTO fechamentos_comissao (mes, ano, total_geral, total_vales, total_liquido, total_salarios, total_bonus, total_a_pagar) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertItem = db.prepare(`
        INSERT INTO comissoes_itens
          (fechamento_id, vendedor_id, vendedor_nome, percentual, ordem_id, ordem_numero, valor_os, valor_comissao, data_conclusao)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const fechId = db.transaction(() => {
        const r = loja_id
            ? insertFech.run(mes, ano, totalGeral, totalVales, totalLiquido, totalSalarios, totalBonus, totalAPagar, loja_id)
            : insertFech.run(mes, ano, totalGeral, totalVales, totalLiquido, totalSalarios, totalBonus, totalAPagar);
        const fid = r.lastInsertRowid;
        for (const o of ordens) {
            const valComissao = o.valor * o.percentual_comissao / 100;
            insertItem.run(fid, o.vendedor_id, o.vendedor_nome, o.percentual_comissao, o.id, o.numero, o.valor, valComissao, o.data_conclusao);
        }
        // Marca os vales como pertencentes a este fechamento
        if (loja_id) {
            db.prepare(`UPDATE vales SET fechamento_id = ? WHERE data >= ? AND data <= ? AND fechamento_id IS NULL AND vendedor_id IN (SELECT id FROM vendedores WHERE loja_id = ?)`)
                .run(fid, inicio2, fim2, loja_id);
        } else {
            db.prepare(`UPDATE vales SET fechamento_id = ? WHERE data >= ? AND data <= ? AND fechamento_id IS NULL`)
                .run(fid, inicio2, fim2);
        }
        return fid;
    })();

    return { jaExistia: false, fechamento_id: fechId, total_geral: totalGeral, total_salarios: totalSalarios, total_bonus: totalBonus, total_vales: totalVales, total_a_pagar: totalAPagar, qtd_os: ordens.length };
}

function montarMensagemWhatsapp(mes, ano, fechamento_id) {
    const fmtVal = v => 'R$ ' + parseFloat(v || 0).toFixed(2).replace('.', ',');
    const itens = db.prepare(`
        SELECT * FROM comissoes_itens WHERE fechamento_id = ? ORDER BY vendedor_nome, data_conclusao
    `).all(fechamento_id);

    if (!itens.length) {
        return `📊 *Fechamento de Comissões - ${MESES[mes-1]}/${ano}*\n\nNenhuma OS concluída no período.`;
    }

    // Agrupa por vendedor
    const porVendedor = {};
    for (const item of itens) {
        if (!porVendedor[item.vendedor_id]) {
            porVendedor[item.vendedor_id] = { nome: item.vendedor_nome, percentual: item.percentual, ordens: [], total: 0, vales: 0 };
        }
        porVendedor[item.vendedor_id].ordens.push(item);
        porVendedor[item.vendedor_id].total += item.valor_comissao;
    }
    // Vales do fechamento por vendedor
    const valesWA = db.prepare(`SELECT vendedor_id, SUM(valor) as total FROM vales WHERE fechamento_id = ? GROUP BY vendedor_id`).all(fechamento_id);
    valesWA.forEach(v => { if (porVendedor[v.vendedor_id]) porVendedor[v.vendedor_id].vales = v.total; });

    const totalGeral = Object.values(porVendedor).reduce((s, v) => s + v.total, 0);
    const totalVales = Object.values(porVendedor).reduce((s, v) => s + v.vales, 0);

    let msg = `📊 *Fechamento de Comissões - ${MESES[mes-1]}/${ano}*\n\n`;
    for (const v of Object.values(porVendedor)) {
        const liquido = Math.max(0, v.total - v.vales);
        msg += `👷 *${v.nome}* — ${v.percentual}%\n`;
        for (const o of v.ordens) {
            msg += `  • ${o.ordem_numero} — ${fmtVal(o.valor_os)} → ${fmtVal(o.valor_comissao)}\n`;
        }
        msg += `  💰 Comissão: ${fmtVal(v.total)}`;
        if (v.vales > 0) msg += `\n  ➖ Vales: ${fmtVal(v.vales)}\n  ✅ *Líquido: ${fmtVal(liquido)}*`;
        msg += '\n\n';
    }
    msg += `💰 *Total comissões: ${fmtVal(totalGeral)}*`;
    if (totalVales > 0) msg += `\n➖ *Total vales: ${fmtVal(totalVales)}*\n✅ *Líquido geral: ${fmtVal(Math.max(0, totalGeral - totalVales))}*`;
    return msg;
}

// GET /api/comissoes/parcial?mes=X&ano=Y — prévia sem fechar (padrão: mês atual), filtrado por loja
router.get('/parcial', (req, res) => {
    const lojaId = req.user.loja_id;
    const hoje = new Date();
    const mes = parseInt(req.query.mes) || (hoje.getMonth() + 1);
    const ano = parseInt(req.query.ano) || hoje.getFullYear();

    const inicio = `${ano}-${String(mes).padStart(2,'0')}-01 00:00:00`;
    const fim    = `${ano}-${String(mes).padStart(2,'0')}-31 23:59:59`;

    const ordens = db.prepare(`
        SELECT os.id, os.numero, os.valor, os.data_conclusao,
               v.id as vendedor_id, v.nome as vendedor_nome, v.percentual_comissao,
               v.salario_base, v.meta, v.bonus_meta
        FROM ordens_servico os
        JOIN vendedores v ON os.vendedor_id = v.id
        WHERE os.status = 'concluida'
          AND os.data_conclusao >= ? AND os.data_conclusao <= ?
          AND v.ativo = 1
          AND os.loja_id = ?
        ORDER BY v.nome, os.data_conclusao
    `).all(inicio, fim, lojaId);

    // Inclui vendedores com salário mesmo sem OS no período (filtrado por loja)
    const todosVendedores = db.prepare(`SELECT id as vendedor_id, nome as vendedor_nome, percentual_comissao, salario_base, meta, bonus_meta FROM vendedores WHERE ativo = 1 AND loja_id = ?`).all(lojaId);

    const jaFechado = !!db.prepare('SELECT id FROM fechamentos_comissao WHERE mes = ? AND ano = ? AND loja_id = ?').get(mes, ano, lojaId);

    const porVendedor = {};
    // Inicializa todos os vendedores com salário
    for (const v of todosVendedores) {
        if (v.salario_base > 0) {
            porVendedor[v.vendedor_id] = {
                vendedor_id: v.vendedor_id, vendedor_nome: v.vendedor_nome,
                percentual: v.percentual_comissao, salario_base: v.salario_base,
                meta: v.meta, bonus_meta: v.bonus_meta,
                ordens: [], total_os: 0, total_comissao: 0
            };
        }
    }
    for (const o of ordens) {
        if (!porVendedor[o.vendedor_id]) {
            porVendedor[o.vendedor_id] = {
                vendedor_id: o.vendedor_id, vendedor_nome: o.vendedor_nome,
                percentual: o.percentual_comissao, salario_base: o.salario_base || 0,
                meta: o.meta || 0, bonus_meta: o.bonus_meta || 0,
                ordens: [], total_os: 0, total_comissao: 0
            };
        }
        const valComissao = o.valor * o.percentual_comissao / 100;
        porVendedor[o.vendedor_id].ordens.push({ ...o, valor_comissao: valComissao });
        porVendedor[o.vendedor_id].total_os += o.valor;
        porVendedor[o.vendedor_id].total_comissao += valComissao;
    }

    // Vales por vendedor no período (filtrado por loja via join)
    const inicioD = inicio.slice(0, 10);
    const fimD    = fim.slice(0, 10);
    const valesResumo = db.prepare(`SELECT vl.vendedor_id, SUM(vl.valor) as total FROM vales vl JOIN vendedores vd ON vd.id = vl.vendedor_id WHERE vl.data >= ? AND vl.data <= ? AND vd.loja_id = ? GROUP BY vl.vendedor_id`).all(inicioD, fimD, lojaId);
    const valesMap = {};
    valesResumo.forEach(v => { valesMap[v.vendedor_id] = v.total; });

    Object.values(porVendedor).forEach(v => {
        v.total_vales  = valesMap[v.vendedor_id] || 0;
        v.bonus_aplicado = (v.meta > 0 && v.total_os >= v.meta) ? (v.bonus_meta || 0) : 0;
        v.meta_atingida  = v.meta > 0 && v.total_os >= v.meta;
        v.total_a_pagar  = Math.max(0, v.salario_base + v.total_comissao + v.bonus_aplicado - v.total_vales);
    });

    const total_geral    = Object.values(porVendedor).reduce((s, v) => s + v.total_comissao, 0);
    const total_salarios = Object.values(porVendedor).reduce((s, v) => s + v.salario_base, 0);
    const total_bonus    = Object.values(porVendedor).reduce((s, v) => s + v.bonus_aplicado, 0);
    const total_vales    = valesResumo.reduce((s, v) => s + v.total, 0);
    const total_a_pagar  = Object.values(porVendedor).reduce((s, v) => s + v.total_a_pagar, 0);

    res.json({ mes, ano, ja_fechado: jaFechado, total_geral, total_salarios, total_bonus, total_vales, total_a_pagar, vendedores: Object.values(porVendedor) });
});

// GET /api/comissoes — lista todos os fechamentos da loja
router.get('/', (req, res) => {
    const list = db.prepare(`
        SELECT * FROM fechamentos_comissao WHERE loja_id = ? ORDER BY ano DESC, mes DESC
    `).all(req.user.loja_id);
    res.json(list);
});

// GET /api/comissoes/:id — detalhe de um fechamento (agrupado por vendedor), filtrado por loja
router.get('/:id', (req, res) => {
    const fech = db.prepare('SELECT * FROM fechamentos_comissao WHERE id = ? AND loja_id = ?').get(req.params.id, req.user.loja_id);
    if (!fech) return res.status(404).json({ error: 'Fechamento não encontrado' });

    const itens = db.prepare(`
        SELECT * FROM comissoes_itens WHERE fechamento_id = ? ORDER BY vendedor_nome, data_conclusao
    `).all(req.params.id);

    // Agrupa por vendedor
    const porVendedor = {};
    for (const item of itens) {
        if (!porVendedor[item.vendedor_id]) {
            porVendedor[item.vendedor_id] = {
                vendedor_id: item.vendedor_id,
                vendedor_nome: item.vendedor_nome,
                percentual: item.percentual,
                ordens: [],
                total_os: 0,
                total_comissao: 0
            };
        }
        porVendedor[item.vendedor_id].ordens.push(item);
        porVendedor[item.vendedor_id].total_os += item.valor_os;
        porVendedor[item.vendedor_id].total_comissao += item.valor_comissao;
    }

    // Vales por vendedor deste fechamento
    const valesDoFech = db.prepare(`
        SELECT vendedor_id, SUM(valor) as total FROM vales WHERE fechamento_id = ? GROUP BY vendedor_id
    `).all(req.params.id);
    const valesMap2 = {};
    valesDoFech.forEach(v => { valesMap2[v.vendedor_id] = v.total; });
    Object.values(porVendedor).forEach(v => {
        v.total_vales = valesMap2[v.vendedor_id] || 0;
        v.total_liquido = Math.max(0, v.total_comissao - v.total_vales);
    });

    res.json({ ...fech, vendedores: Object.values(porVendedor) });
});

// DELETE /api/comissoes/:id — remove um fechamento do histórico (filtrado por loja)
router.delete('/:id', (req, res) => {
    const fech = db.prepare('SELECT id FROM fechamentos_comissao WHERE id = ? AND loja_id = ?').get(req.params.id, req.user.loja_id);
    if (!fech) return res.status(404).json({ error: 'Fechamento não encontrado' });
    db.transaction(() => {
        db.prepare('UPDATE vales SET fechamento_id = NULL WHERE fechamento_id = ?').run(req.params.id);
        db.prepare('DELETE FROM comissoes_itens WHERE fechamento_id = ?').run(req.params.id);
        db.prepare('DELETE FROM fechamentos_comissao WHERE id = ? AND loja_id = ?').run(req.params.id, req.user.loja_id);
    })();
    res.json({ ok: true });
});

// POST /api/comissoes/fechar — fechamento manual (body: { mes, ano }), usa loja_id do usuário
router.post('/fechar', (req, res) => {
    let { mes, ano } = req.body;
    if (!mes || !ano) return res.status(400).json({ error: 'mes e ano são obrigatórios' });
    mes = parseInt(mes); ano = parseInt(ano);
    if (mes < 1 || mes > 12) return res.status(400).json({ error: 'Mês inválido' });
    const lojaId = req.user.loja_id;

    try {
        const resultado = executarFechamento(mes, ano, lojaId);
        if (resultado.jaExistia) {
            return res.status(409).json({ error: `Fechamento de ${MESES[mes-1]}/${ano} já foi realizado` });
        }

        // Envia WhatsApp se número configurado
        const cfgWa = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'whatsapp_comissao'").get();
        let whatsappEnviado = false;
        if (cfgWa && cfgWa.valor) {
            const wa = require('../services/whatsapp');
            const msg = montarMensagemWhatsapp(mes, ano, resultado.fechamento_id);
            wa.enviarMensagem(cfgWa.valor, msg)
                .then(() => {
                    db.prepare('UPDATE fechamentos_comissao SET enviado_whatsapp = 1 WHERE id = ?').run(resultado.fechamento_id);
                })
                .catch(e => console.error('WhatsApp comissao:', e.message));
            whatsappEnviado = true;
        }

        res.json({ ...resultado, whatsapp_enviado: whatsappEnviado });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = { router, executarFechamento, montarMensagemWhatsapp, MESES };
