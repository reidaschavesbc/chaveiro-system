const express = require('express');
const router = express.Router();
const db = require('../database/db');
const wa = require('../services/whatsapp');
const { registrarExclusao } = require('../utils/historico');

const PRIORIDADES = ['alta', 'media', 'baixa'];

function fmtVal(v) { return 'R$ ' + parseFloat(v||0).toFixed(2).replace('.', ','); }
function fmtDate(s) { if (!s) return ''; const d = String(s).slice(0,10); const [y,m,dd] = d.split('-'); return `${dd}/${m}/${y}`; }

function getWhatsappPedidosLista() {
    const lista = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'whatsapp_pedidos_lista'").get();
    if (lista && lista.valor) {
        try {
            const parsed = JSON.parse(lista.valor);
            if (Array.isArray(parsed) && parsed.length) return parsed;
        } catch (_) {}
    }
    // fallback para número legado único
    const cfg = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'whatsapp_pedidos'").get();
    if (cfg && cfg.valor) return [{ nome: 'Principal', numero: cfg.valor }];
    return [];
}

// enviarAvisoPedido: chamado por cron e por rotas — opera sem req.user (nível sistema)
// numerosAlvo: array de strings com números específicos; null = todos configurados
async function enviarAvisoPedido(pedido, tipo = 'criacao', numerosAlvo = null) {
    const lista = numerosAlvo
        ? numerosAlvo.map(n => ({ numero: n }))
        : getWhatsappPedidosLista();
    if (!lista.length) return;
    const priLabel = { alta: '🔴 ALTA', media: '🟡 MÉDIA', baixa: '🟢 BAIXA' };
    let msg;
    if (tipo === 'criacao') {
        msg = `🆕 *Novo Pedido de Compra*\n\n📦 *${pedido.descricao}*\n🔢 Quantidade: ${pedido.quantidade}\n⚡ Prioridade: ${priLabel[pedido.prioridade] || pedido.prioridade}\n📅 Criado em: ${fmtDate(pedido.criado_em || new Date().toISOString())}`;
        if (pedido.observacoes) msg += `\n📝 Obs: ${pedido.observacoes}`;
        msg += `\n\nAcesse o sistema para confirmar o recebimento deste aviso.`;
    } else {
        msg = `⏰ *Lembrete — Pedido Pendente*\n\n📦 *${pedido.descricao}*\n🔢 Quantidade: ${pedido.quantidade}\n⚡ Prioridade: ${priLabel[pedido.prioridade] || pedido.prioridade}\n📅 Criado em: ${fmtDate(pedido.criado_em)}\n\n⚠️ Este pedido ainda não foi confirmado.`;
    }
    for (const item of lista) {
        try { await wa.enviarMensagem(item.numero, msg); } catch (e) { console.error('WhatsApp pedido:', e.message); }
    }
    db.prepare("UPDATE pedidos_compra SET ultimo_aviso = datetime('now','localtime') WHERE id = ?").run(pedido.id);
}

// enviarResumoDiario: chamado por cron — opera sem req.user, abrange TODAS as lojas
async function enviarResumoDiario() {
    const lista = getWhatsappPedidosLista();
    if (!lista.length) return;
    const pedidos = db.prepare(`
        SELECT * FROM pedidos_compra
        WHERE status = 'pendente' AND confirmado = 0 AND alertas_ativos = 1
          AND (silenciado_ate IS NULL OR datetime(silenciado_ate) <= datetime('now','localtime'))
        ORDER BY CASE prioridade WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END, criado_em ASC
    `).all();
    if (!pedidos.length) return;

    const hoje = new Date();
    const pad = n => String(n).padStart(2, '0');
    const dataHoje = `${pad(hoje.getDate())}/${pad(hoje.getMonth()+1)}/${hoje.getFullYear()}`;

    const grupos = { alta: [], media: [], baixa: [] };
    pedidos.forEach(p => (grupos[p.prioridade] || grupos.baixa).push(p));

    let msg = `📋 *Pedidos Pendentes — ${dataHoje}*\n`;
    if (grupos.alta.length) {
        msg += `\n🔴 *Alta prioridade (${grupos.alta.length}):*\n`;
        grupos.alta.forEach(p => { msg += `  • ${p.descricao} — qtd: ${p.quantidade}\n`; });
    }
    if (grupos.media.length) {
        msg += `\n🟡 *Média prioridade (${grupos.media.length}):*\n`;
        grupos.media.forEach(p => { msg += `  • ${p.descricao} — qtd: ${p.quantidade}\n`; });
    }
    if (grupos.baixa.length) {
        msg += `\n🟢 *Baixa prioridade (${grupos.baixa.length}):*\n`;
        grupos.baixa.forEach(p => { msg += `  • ${p.descricao} — qtd: ${p.quantidade}\n`; });
    }
    msg += `\n📊 *Total: ${pedidos.length} pedido(s) aguardando*`;

    for (const item of lista) {
        try { await wa.enviarMensagem(item.numero, msg); } catch (e) { console.error('WhatsApp resumo diário:', e.message); }
    }
    // Atualiza ultimo_aviso de todos (para não duplicar reminders logo após)
    const ids = pedidos.map(p => p.id);
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`UPDATE pedidos_compra SET ultimo_aviso = datetime('now','localtime') WHERE id IN (${placeholders})`).run(...ids);
}

// verificarEstoqueBaixo: chamado por cron e por rotas de venda/OS
// silencioso=true: só cria o pedido, não envia WhatsApp (usado pelo botão "Verificar Estoque")
function verificarEstoqueBaixo(produto_id, loja_id, silencioso = false) {
    const p = db.prepare('SELECT id, nome, estoque, estoque_minimo, loja_id FROM produtos WHERE id = ? AND ativo = 1').get(produto_id);
    if (!p || p.estoque > p.estoque_minimo) return;
    const lojaId = loja_id || p.loja_id;
    if (!lojaId) return;
    const existente = db.prepare("SELECT id FROM pedidos_compra WHERE produto_id = ? AND status = 'pendente' AND loja_id = ?").get(produto_id, lojaId);
    if (existente) return;
    const result = db.prepare(`INSERT INTO pedidos_compra (produto_id, descricao, quantidade, status, origem, prioridade, loja_id) VALUES (?, ?, 1, 'pendente', 'automatico', 'alta', ?)`)
        .run(produto_id, p.nome, lojaId);
    if (!silencioso) {
        const pedido = db.prepare('SELECT * FROM pedidos_compra WHERE id = ?').get(result.lastInsertRowid);
        enviarAvisoPedido(pedido, 'criacao').catch(() => {});
    }
}

// GET /api/pedidos/numeros-alertas — retorna lista de números configurados para pedidos
router.get('/numeros-alertas', (req, res) => {
    res.json(getWhatsappPedidosLista());
});

// POST /api/pedidos/disparar-alertas — ativa alertas repetidos para os pedidos selecionados
router.post('/disparar-alertas', async (req, res) => {
    const lojaId = req.user.loja_id;
    const numerosAlvo = Array.isArray(req.body.numeros) && req.body.numeros.length ? req.body.numeros : null;
    const idsAlvo = Array.isArray(req.body.ids) && req.body.ids.length ? req.body.ids : null;

    let pendentes;
    if (idsAlvo) {
        const placeholders = idsAlvo.map(() => '?').join(',');
        pendentes = db.prepare(`SELECT * FROM pedidos_compra WHERE status = 'pendente' AND loja_id = ? AND id IN (${placeholders})`).all(lojaId, ...idsAlvo);
    } else {
        pendentes = db.prepare(`SELECT * FROM pedidos_compra WHERE status = 'pendente' AND loja_id = ?`).all(lojaId);
    }

    if (!pendentes.length) return res.json({ enviados: 0 });

    // Ativa alertas_ativos para os selecionados e envia aviso imediato
    const ids = pendentes.map(p => p.id);
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`UPDATE pedidos_compra SET alertas_ativos = 1 WHERE id IN (${placeholders})`).run(...ids);

    let enviados = 0;
    for (const pedido of pendentes) {
        try { await enviarAvisoPedido(pedido, 'lembrete', numerosAlvo); enviados++; } catch (_) {}
    }
    res.json({ enviados, total: pendentes.length });
});

// GET /api/pedidos/count — badge sidebar (filtrado por loja)
router.get('/count', (req, res) => {
    const row = db.prepare("SELECT COUNT(*) as total FROM pedidos_compra WHERE status = 'pendente' AND loja_id = ?").get(req.user.loja_id);
    res.json({ total: row.total });
});

// POST /api/pedidos/verificar-estoque (filtrado por loja)
router.post('/verificar-estoque', (req, res) => {
    const lojaId = req.user.loja_id;
    const baixos = db.prepare(`SELECT id FROM produtos WHERE ativo = 1 AND estoque <= estoque_minimo AND loja_id = ?`).all(lojaId);
    let adicionados = 0;
    baixos.forEach(p => {
        const antes = db.prepare("SELECT id FROM pedidos_compra WHERE produto_id = ? AND status = 'pendente' AND loja_id = ?").get(p.id, lojaId);
        if (!antes) { verificarEstoqueBaixo(p.id, lojaId, true); adicionados++; }
    });
    res.json({ verificados: baixos.length, adicionados });
});

// GET /api/pedidos (filtrado por loja)
router.get('/', (req, res) => {
    const { status, prioridade } = req.query;
    const lojaId = req.user.loja_id;
    let query = `
        SELECT pc.*, p.nome as produto_nome, p.estoque as produto_estoque, p.estoque_minimo as produto_estoque_minimo
        FROM pedidos_compra pc
        LEFT JOIN produtos p ON pc.produto_id = p.id
        WHERE pc.loja_id = ?
    `;
    const params = [lojaId];
    if (status)     { query += ' AND pc.status = ?';     params.push(status); }
    if (prioridade) { query += ' AND pc.prioridade = ?'; params.push(prioridade); }
    query += " ORDER BY CASE pc.prioridade WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END, pc.status ASC, pc.criado_em DESC";
    res.json(db.prepare(query).all(...params));
});

// POST /api/pedidos (salva loja_id do usuário)
router.post('/', async (req, res) => {
    const { produto_id, descricao, quantidade, observacoes, prioridade } = req.body;
    if (!descricao) return res.status(400).json({ error: 'Descrição é obrigatória' });
    const pri = PRIORIDADES.includes(prioridade) ? prioridade : 'media';
    const lojaId = req.user.loja_id;
    const result = db.prepare(`
        INSERT INTO pedidos_compra (produto_id, descricao, quantidade, observacoes, status, origem, prioridade, loja_id)
        VALUES (?, ?, ?, ?, 'pendente', 'manual', ?, ?)
    `).run(produto_id || null, descricao.trim(), quantidade || 1, observacoes || null, pri, lojaId);
    const pedido = db.prepare('SELECT * FROM pedidos_compra WHERE id = ?').get(result.lastInsertRowid);
    enviarAvisoPedido(pedido, 'criacao').catch(() => {});
    res.status(201).json({ id: result.lastInsertRowid });
});

// PUT /api/pedidos/:id/confirmar — marca aviso como confirmado e para alertas
router.put('/:id/confirmar', (req, res) => {
    db.prepare(`UPDATE pedidos_compra SET confirmado = 1, confirmado_em = datetime('now','localtime'), alertas_ativos = 0 WHERE id = ? AND loja_id = ?`).run(req.params.id, req.user.loja_id);
    res.json({ ok: true });
});

// PUT /api/pedidos/:id/silenciar — silencia avisos até às 9h do próximo dia
router.put('/:id/silenciar', (req, res) => {
    // Calcula amanhã às 09:00 no fuso de São Paulo
    const agora = new Date();
    const amanha = new Date(agora);
    amanha.setDate(amanha.getDate() + 1);
    amanha.setHours(9, 0, 0, 0);
    const iso = amanha.toISOString().slice(0, 19).replace('T', ' ');
    db.prepare(`UPDATE pedidos_compra SET silenciado_ate = ? WHERE id = ? AND loja_id = ?`).run(iso, req.params.id, req.user.loja_id);
    res.json({ ok: true });
});

// PUT /api/pedidos/:id
router.put('/:id', (req, res) => {
    const { descricao, quantidade, observacoes, status, prioridade } = req.body;
    const pedido = db.prepare('SELECT * FROM pedidos_compra WHERE id = ? AND loja_id = ?').get(req.params.id, req.user.loja_id);
    if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' });

    const comprado_em = status === 'comprado' && pedido.status !== 'comprado'
        ? new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }).replace(',', '')
        : (status !== 'comprado' ? null : pedido.comprado_em);

    const pri = PRIORIDADES.includes(prioridade) ? prioridade : pedido.prioridade;

    const novoStatus = status ?? pedido.status;
    db.prepare(`
        UPDATE pedidos_compra SET descricao=?, quantidade=?, observacoes=?, status=?, comprado_em=?, prioridade=?,
        confirmado = CASE WHEN ? = 'pendente' AND status != 'pendente' THEN 0 ELSE confirmado END,
        alertas_ativos = CASE WHEN ? IN ('comprado','cancelado') THEN 0 ELSE alertas_ativos END
        WHERE id=? AND loja_id=?
    `).run(
        descricao ?? pedido.descricao,
        quantidade ?? pedido.quantidade,
        observacoes ?? pedido.observacoes,
        novoStatus,
        comprado_em,
        pri,
        novoStatus,
        novoStatus,
        req.params.id,
        req.user.loja_id
    );
    res.json({ ok: true });
});

// DELETE /api/pedidos/:id
router.delete('/:id', (req, res) => {
    const p = db.prepare('SELECT id, descricao, quantidade FROM pedidos_compra WHERE id = ? AND loja_id = ?').get(req.params.id, req.user.loja_id);
    db.prepare('DELETE FROM pedidos_compra WHERE id = ? AND loja_id = ?').run(req.params.id, req.user.loja_id);
    if (p) {
        registrarExclusao({
            loja_id: req.user.loja_id,
            tipo: 'pedido_compra',
            registro_id: p.id,
            descricao: `Pedido #${p.id}: ${p.produto_nome || p.descricao || '?'} (${p.quantidade})`,
            usuario_id: req.user.id,
            usuario_nome: req.user.nome,
        req
    });
    }
    res.json({ ok: true });
});

// DELETE /api/pedidos — exclui múltiplos
router.delete('/', (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'Nenhum id informado' });
    const placeholders = ids.map(() => '?').join(',');
    const pedidos = db.prepare(`SELECT id, produto_nome, descricao, quantidade FROM pedidos_compra WHERE id IN (${placeholders}) AND loja_id = ?`).all(...ids, req.user.loja_id);
    db.prepare(`DELETE FROM pedidos_compra WHERE id IN (${placeholders}) AND loja_id = ?`).run(...ids, req.user.loja_id);
    for (const p of pedidos) {
        registrarExclusao({
            loja_id: req.user.loja_id,
            tipo: 'pedido_compra',
            registro_id: p.id,
            descricao: `Pedido #${p.id}: ${p.produto_nome || p.descricao || '?'} (${p.quantidade})`,
            usuario_id: req.user.id,
            usuario_nome: req.user.nome,
        req
    });
    }
    res.json({ ok: true, removidos: ids.length });
});

module.exports = { router, verificarEstoqueBaixo, enviarAvisoPedido, enviarResumoDiario };
