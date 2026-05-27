const express = require('express');
const router = express.Router();
const db = require('../database/db');

// Resolve qual usuario_id filtrar com base nos parâmetros e perfil do usuário
function resolverFiltroUsuario(req) {
    const { id: userId, loja_id: lojaId, principal } = req.user;
    const param = req.query.usuario_id;

    if (!principal) return { filtroId: userId, lojaId }; // sub-usuário: sempre o próprio

    if (!param || param === 'all') return { filtroId: null, lojaId }; // principal sem filtro: todos
    return { filtroId: parseInt(param), lojaId };
}

function sqlUsuario(filtroId, alias = 'v') {
    if (!filtroId) return '';
    return alias ? ` AND ${alias}.usuario_id = ?` : ' AND usuario_id = ?';
}

// GET /api/relatorios/dashboard
router.get('/dashboard', (req, res) => {
    const { filtroId, lojaId } = resolverFiltroUsuario(req);
    const now = new Date();
    const hoje = now.toLocaleDateString('en-CA');
    const mesAtual = hoje.slice(0, 7);
    const fU_v   = sqlUsuario(filtroId, 'v');   // para queries com alias 'v' (JOIN vendas v)
    const fU_os  = sqlUsuario(filtroId, 'os');  // para queries com alias 'os' (JOIN ordens_servico os)
    const fU_sub = sqlUsuario(filtroId, '');    // para sub-queries sem alias
    const ph = filtroId ? [filtroId] : []; // parâmetro opcional para queries com filtroId

    const vendasHoje = db.prepare(`SELECT
        (SELECT COUNT(*) FROM vendas WHERE date(data) = ? AND status != 'cancelada' AND loja_id = ?${fU_sub}) +
        (SELECT COUNT(*) FROM ordens_servico WHERE date(data_entrada) = ? AND status = 'concluida' AND COALESCE(is_plantao,0)=0 AND loja_id = ?${fU_sub}) as qtd,
        (SELECT COALESCE(SUM(total_final), 0) FROM vendas WHERE date(data) = ? AND status != 'cancelada' AND loja_id = ?${fU_sub}) +
        (SELECT COALESCE(SUM(valor), 0) FROM ordens_servico WHERE date(data_entrada) = ? AND status = 'concluida' AND COALESCE(is_plantao,0)=0 AND loja_id = ?${fU_sub}) as total
    `).get(hoje, lojaId, ...ph, hoje, lojaId, ...ph, hoje, lojaId, ...ph, hoje, lojaId, ...ph);

    const vendasMes = db.prepare(`SELECT
        (SELECT COUNT(*) FROM vendas WHERE strftime('%Y-%m', data) = ? AND status != 'cancelada' AND loja_id = ?${fU_sub}) +
        (SELECT COUNT(*) FROM ordens_servico WHERE strftime('%Y-%m', data_entrada) = ? AND status = 'concluida' AND COALESCE(is_plantao,0)=0 AND loja_id = ?${fU_sub}) as qtd,
        (SELECT COALESCE(SUM(total_final), 0) FROM vendas WHERE strftime('%Y-%m', data) = ? AND status != 'cancelada' AND loja_id = ?${fU_sub}) +
        (SELECT COALESCE(SUM(valor), 0) FROM ordens_servico WHERE strftime('%Y-%m', data_entrada) = ? AND status = 'concluida' AND COALESCE(is_plantao,0)=0 AND loja_id = ?${fU_sub}) as total
    `).get(mesAtual, lojaId, ...ph, mesAtual, lojaId, ...ph, mesAtual, lojaId, ...ph, mesAtual, lojaId, ...ph);

    const osAbertas      = db.prepare(`SELECT COUNT(*) as qtd FROM ordens_servico WHERE status IN ('aberta', 'em_andamento') AND loja_id = ?${fU_sub}`).get(lojaId, ...ph);
    const osConcluidas   = db.prepare(`SELECT COUNT(*) as qtd FROM ordens_servico WHERE status = 'concluida' AND strftime('%Y-%m', data_entrada) = ? AND loja_id = ?${fU_sub}`).get(mesAtual, lojaId, ...ph);
    const produtosBaixoEstoque = db.prepare('SELECT COUNT(*) as qtd FROM produtos WHERE ativo = 1 AND estoque <= estoque_minimo AND loja_id = ?').get(lojaId);
    const totalClientes  = db.prepare('SELECT COUNT(*) as qtd FROM clientes WHERE ativo = 1 AND loja_id = ?').get(lojaId);
    const aReceber       = db.prepare(`SELECT COUNT(*) as qtd, COALESCE(SUM(valor - COALESCE(valor_pago,0)),0) as total FROM ordens_servico WHERE a_receber = 1 AND a_receber_pago = 0 AND loja_id = ?${fU_sub}`).get(lojaId, ...ph);
    const aReceberVencido = db.prepare(`SELECT COUNT(*) as qtd FROM ordens_servico WHERE a_receber = 1 AND a_receber_pago = 0 AND data_vencimento < ? AND loja_id = ?${fU_sub}`).get(hoje, lojaId, ...ph);
    const gastosMesVar   = db.prepare(`SELECT COALESCE(SUM(valor), 0) as total, COUNT(*) as qtd FROM gastos WHERE strftime('%Y-%m', data) = ? AND loja_id = ?`).get(mesAtual, lojaId);
    const gastosMesFixo  = db.prepare(`SELECT COALESCE(SUM(valor), 0) as total, COUNT(*) as qtd FROM gastos_fixos WHERE ativo = 1 AND loja_id = ?`).get(lojaId);
    const gastosMes      = { total: gastosMesVar.total + gastosMesFixo.total, qtd: gastosMesVar.qtd + gastosMesFixo.qtd };

    const plantaoMes = db.prepare(`
        SELECT
            COALESCE(SUM(os.valor), 0) as faturamento,
            COALESCE(SUM(os.custo_materiais), 0) as custo,
            COALESCE(SUM(os.valor * COALESCE(v.percentual_plantao, 0) / 100.0), 0) as comissao,
            COUNT(*) as qtd
        FROM ordens_servico os
        LEFT JOIN vendedores v ON os.vendedor_id = v.id
        WHERE os.is_plantao = 1 AND os.status = 'concluida'
          AND strftime('%Y-%m', os.data_entrada) = ? AND os.loja_id = ?
    `).get(mesAtual, lojaId);

    const valorAfiador = parseFloat(db.prepare(`SELECT valor FROM configuracoes WHERE chave = 'valor_afiador'`).get()?.valor) || 0;
    const afiacaoMes = db.prepare(`
        SELECT COALESCE(SUM(valor), 0) as faturamento, COALESCE(SUM(quantidade), 0) as qtd_pecas, COUNT(*) as qtd
        FROM afiacao
        WHERE status = 'entregue' AND strftime('%Y-%m', data_entrega) = ? AND loja_id = ?
    `).get(mesAtual, lojaId);

    const ultimasVendas = db.prepare(`SELECT v.*, c.nome as cliente_nome, ven.nome as vendedor_nome FROM vendas v
    LEFT JOIN clientes c ON v.cliente_id = c.id
    LEFT JOIN vendedores ven ON v.vendedor_id = ven.id
    WHERE v.status != 'cancelada' AND v.loja_id = ?${fU_v} ORDER BY v.data DESC LIMIT 5`).all(lojaId, ...ph);
    const ultimasOS = db.prepare(`SELECT os.*, c.nome as cliente_nome, ven.nome as vendedor_nome FROM ordens_servico os
    LEFT JOIN clientes c ON os.cliente_id = c.id
    LEFT JOIN vendedores ven ON os.vendedor_id = ven.id
    WHERE os.loja_id = ?${fU_os} ORDER BY os.data_entrada DESC LIMIT 5`).all(lojaId, ...ph);

    res.json({
        vendas_hoje: vendasHoje, vendas_mes: vendasMes,
        os_abertas: osAbertas.qtd, os_concluidas_mes: osConcluidas.qtd,
        produtos_baixo_estoque: produtosBaixoEstoque.qtd, total_clientes: totalClientes.qtd,
        ultimas_vendas: ultimasVendas, ultimas_os: ultimasOS,
        a_receber: { qtd: aReceber.qtd, total: aReceber.total, vencidos: aReceberVencido.qtd },
        gastos_mes: { total: gastosMes.total, qtd: gastosMes.qtd },
        lucro_plantao_mes: {
            lucro: plantaoMes.faturamento - plantaoMes.custo - plantaoMes.comissao,
            qtd: plantaoMes.qtd
        },
        lucro_afiacao_mes: {
            lucro: afiacaoMes.faturamento - (afiacaoMes.qtd_pecas * valorAfiador),
            qtd: afiacaoMes.qtd
        }
    });
});

// GET /api/relatorios/vendas
router.get('/vendas', (req, res) => {
    const { filtroId, lojaId } = resolverFiltroUsuario(req);
    const { data_inicio, data_fim } = req.query;
    const di = data_inicio || new Date().toLocaleDateString('en-CA').slice(0, 7) + '-01';
    const df = data_fim || new Date().toLocaleDateString('en-CA');
    const fU = sqlUsuario(filtroId, 'v');
    const ph = filtroId ? [filtroId] : [];

    const vendas = db.prepare(`SELECT v.*, c.nome as cliente_nome, ven.nome as vendedor_nome FROM vendas v
    LEFT JOIN clientes c ON v.cliente_id = c.id
    LEFT JOIN vendedores ven ON v.vendedor_id = ven.id
    WHERE date(v.data) BETWEEN ? AND ? AND v.status != 'cancelada' AND v.loja_id = ?${fU} ORDER BY v.data DESC`).all(di, df, lojaId, ...ph);

    const totais = db.prepare(`SELECT metodo as forma_pagamento, COALESCE(SUM(pv.valor), 0) as total
        FROM pagamentos_venda pv
        JOIN vendas v ON pv.venda_id = v.id
        WHERE date(v.data) BETWEEN ? AND ? AND v.status != 'cancelada' AND v.loja_id = ?${fU} GROUP BY metodo`).all(di, df, lojaId, ...ph);

    res.json({ vendas, totais });
});

// GET /api/relatorios/estoque
router.get('/estoque', (req, res) => {
    const lojaId = req.user.loja_id;
    const produtos = db.prepare(`SELECT *, (estoque * preco_venda) as valor_total FROM produtos WHERE ativo = 1 AND loja_id = ? ORDER BY estoque ASC`).all(lojaId);
    const valorTotal = db.prepare(`SELECT COALESCE(SUM(estoque * preco_venda), 0) as total FROM produtos WHERE ativo = 1 AND loja_id = ?`).get(lojaId);
    res.json({ produtos, valor_total: valorTotal.total });
});

// GET /api/relatorios/os
router.get('/os', (req, res) => {
    const { filtroId, lojaId } = resolverFiltroUsuario(req);
    const { data_inicio, data_fim, status } = req.query;
    const di = data_inicio || new Date().toLocaleDateString('en-CA').slice(0, 7) + '-01';
    const df = data_fim || new Date().toLocaleDateString('en-CA');
    const fU = sqlUsuario(filtroId, 'os');
    const ph = filtroId ? [filtroId] : [];

    let query = `SELECT os.*, c.nome as cliente_nome, ts.nome as servico_nome, v.nome as vendedor_nome FROM ordens_servico os
    LEFT JOIN clientes c ON os.cliente_id = c.id
    LEFT JOIN tipos_servico ts ON os.tipo_servico_id = ts.id
    LEFT JOIN vendedores v ON os.vendedor_id = v.id
    WHERE date(os.data_entrada) BETWEEN ? AND ? AND os.loja_id = ?${fU}`;
    const params = [di, df, lojaId, ...ph];
    if (status) { query += ' AND os.status = ?'; params.push(status); }
    query += ' ORDER BY os.data_entrada DESC';
    const os = db.prepare(query).all(...params);

    const totais = db.prepare(`
        SELECT COALESCE(metodo, 'outros') as forma_pagamento, SUM(valor) as total FROM (
            SELECT po.metodo, po.valor FROM pagamentos_os po
            JOIN ordens_servico os ON po.ordem_id = os.id
            WHERE date(os.data_entrada) BETWEEN ? AND ? AND os.status = 'concluida' AND os.loja_id = ?${fU}
            UNION ALL
            SELECT os.forma_pagamento, os.valor FROM ordens_servico os
            WHERE date(os.data_entrada) BETWEEN ? AND ? AND os.status = 'concluida' AND os.loja_id = ?${fU}
            AND os.id NOT IN (SELECT DISTINCT ordem_id FROM pagamentos_os)
        ) GROUP BY COALESCE(metodo, 'outros')
    `).all(di, df, lojaId, ...ph, di, df, lojaId, ...ph);

    res.json({ os, totais });
});

// GET /api/relatorios/geral
router.get('/geral', (req, res) => {
    const { filtroId, lojaId } = resolverFiltroUsuario(req);
    const { data_inicio, data_fim } = req.query;
    const di = data_inicio || new Date().toLocaleDateString('en-CA').slice(0, 7) + '-01';
    const df = data_fim || new Date().toLocaleDateString('en-CA');
    const fU_v  = sqlUsuario(filtroId, 'v');
    const fU_os = sqlUsuario(filtroId, 'os');
    const ph = filtroId ? [filtroId] : [];

    const vendas = db.prepare(`SELECT v.id, v.numero, v.data, v.total_final as valor, v.forma_pagamento, 'venda' as tipo, c.nome as cliente_nome, ven.nome as vendedor_nome
        FROM vendas v
        LEFT JOIN clientes c ON v.cliente_id = c.id
        LEFT JOIN vendedores ven ON v.vendedor_id = ven.id
        WHERE date(v.data) BETWEEN ? AND ? AND v.status != 'cancelada' AND v.loja_id = ?${fU_v}`).all(di, df, lojaId, ...ph);

    // OS pagas na hora (sem cobrança): data_entrada
    // OS cobranças pagas: data_recebimento (só entra quando pago)
    const osBase = `SELECT os.id, os.numero, os.valor, os.forma_pagamento, 'os' as tipo, c.nome as cliente_nome, ven.nome as vendedor_nome
        FROM ordens_servico os
        LEFT JOIN clientes c ON os.cliente_id = c.id
        LEFT JOIN vendedores ven ON os.vendedor_id = ven.id`;
    const osDir = db.prepare(`${osBase}
        WHERE date(os.data_entrada) BETWEEN ? AND ? AND os.status = 'concluida' AND COALESCE(os.is_plantao,0) = 0 AND COALESCE(os.a_receber,0) = 0 AND os.loja_id = ?${fU_os}`)
        .all(di, df, lojaId, ...ph).map(r => ({ ...r, data: r.data_entrada || di }));
    const osCob = db.prepare(`${osBase}
        WHERE date(os.data_recebimento) BETWEEN ? AND ? AND os.status = 'concluida' AND COALESCE(os.is_plantao,0) = 0 AND os.a_receber = 1 AND os.a_receber_pago = 1 AND os.loja_id = ?${fU_os}`)
        .all(di, df, lojaId, ...ph).map(r => ({ ...r, data: r.data_recebimento || di }));
    const os = [...osDir, ...osCob];

    const list = [...vendas, ...os].sort((a, b) => new Date(b.data) - new Date(a.data));

    const totaisVendas = db.prepare(`SELECT metodo as forma_pagamento, SUM(pv.valor) as total
        FROM pagamentos_venda pv
        JOIN vendas v ON pv.venda_id = v.id
        WHERE date(v.data) BETWEEN ? AND ? AND v.status != 'cancelada' AND v.loja_id = ?${fU_v} GROUP BY metodo`).all(di, df, lojaId, ...ph);

    const totaisOS = db.prepare(`
        SELECT COALESCE(metodo, 'outros') as forma_pagamento, SUM(valor) as total FROM (
            -- OS sem cobrança: usa data_entrada
            SELECT po.metodo, po.valor FROM pagamentos_os po
            JOIN ordens_servico os ON po.ordem_id = os.id
            WHERE date(os.data_entrada) BETWEEN ? AND ? AND os.status = 'concluida' AND COALESCE(os.is_plantao,0) = 0 AND COALESCE(os.a_receber,0) = 0 AND os.loja_id = ?${fU_os}
            UNION ALL
            SELECT os.forma_pagamento, os.valor FROM ordens_servico os
            WHERE date(os.data_entrada) BETWEEN ? AND ? AND os.status = 'concluida' AND COALESCE(os.is_plantao,0) = 0 AND COALESCE(os.a_receber,0) = 0 AND os.loja_id = ?${fU_os}
            AND os.id NOT IN (SELECT DISTINCT ordem_id FROM pagamentos_os)
            UNION ALL
            -- OS cobranças pagas: usa data_recebimento
            SELECT os.forma_pagamento, os.valor FROM ordens_servico os
            WHERE date(os.data_recebimento) BETWEEN ? AND ? AND os.status = 'concluida' AND COALESCE(os.is_plantao,0) = 0 AND os.a_receber = 1 AND os.a_receber_pago = 1 AND os.loja_id = ?${fU_os}
        ) GROUP BY COALESCE(metodo, 'outros')
    `).all(di, df, lojaId, ...ph, di, df, lojaId, ...ph, di, df, lojaId, ...ph);

    const map = {};
    [...totaisVendas, ...totaisOS].forEach(t => {
        const met = t.forma_pagamento || 'outros';
        map[met] = (map[met] || 0) + t.total;
    });
    const totais = Object.keys(map).map(met => ({ forma_pagamento: met, total: map[met] }));

    const fU_sum = filtroId ? ' AND usuario_id = ?' : '';
    const _sumOSDir  = db.prepare(`SELECT COALESCE(SUM(valor),0) as t FROM ordens_servico WHERE date(data_entrada) BETWEEN ? AND ? AND status='concluida' AND COALESCE(is_plantao,0) = 0 AND COALESCE(a_receber,0) = 0 AND loja_id = ?${fU_sum}`).get(di, df, lojaId, ...ph);
    const _sumOSCob  = db.prepare(`SELECT COALESCE(SUM(valor),0) as t FROM ordens_servico WHERE date(data_recebimento) BETWEEN ? AND ? AND status='concluida' AND COALESCE(is_plantao,0) = 0 AND a_receber = 1 AND a_receber_pago = 1 AND loja_id = ?${fU_sum}`).get(di, df, lojaId, ...ph);
    const _sumOS     = { t: _sumOSDir.t + _sumOSCob.t };
    const _sumVendas  = db.prepare(`SELECT COALESCE(SUM(total_final),0) as t FROM vendas WHERE date(data) BETWEEN ? AND ? AND status != 'cancelada' AND loja_id = ?${fU_sum}`).get(di, df, lojaId, ...ph);
    const _sumAfiacao = db.prepare(`SELECT COALESCE(SUM(valor),0) as t FROM afiacao WHERE date(data_entrega) BETWEEN ? AND ? AND status='entregue' AND loja_id = ?`).get(di, df, lojaId);
    const faturamentoBruto = _sumOS.t + _sumVendas.t + _sumAfiacao.t;

    const gastos = db.prepare(`
        SELECT categoria, COALESCE(SUM(valor), 0) as total, COUNT(*) as qtd
        FROM gastos WHERE date(data) BETWEEN ? AND ? AND loja_id = ?
        GROUP BY categoria ORDER BY total DESC
    `).all(di, df, lojaId);
    const totalGastosVar = gastos.reduce((s, g) => s + g.total, 0);
    const gastosFixos = db.prepare(`SELECT COALESCE(SUM(valor), 0) as total, COUNT(*) as qtd FROM gastos_fixos WHERE ativo = 1 AND loja_id = ?`).get(lojaId);
    const totalGastos = totalGastosVar + gastosFixos.total;

    const funcionarios = db.prepare(`
        SELECT v.id, v.nome, v.salario_base, v.percentual_comissao, v.meta, v.bonus_meta,
               COUNT(os.id) as qtd_os,
               COALESCE(SUM(os.valor), 0) as total_os,
               COALESCE(SUM(os.valor * v.percentual_comissao / 100.0), 0) as comissao
        FROM vendedores v
        LEFT JOIN ordens_servico os ON os.vendedor_id = v.id
            AND os.status = 'concluida'
            AND COALESCE(os.is_plantao, 0) = 0
            AND os.loja_id = ?
            AND (
                (COALESCE(os.a_receber, 0) = 0 AND date(COALESCE(os.data_conclusao, os.data_entrada)) BETWEEN ? AND ?)
                OR
                (os.a_receber = 1 AND os.a_receber_pago = 1 AND date(os.data_recebimento) BETWEEN ? AND ?)
            )
        WHERE v.ativo = 1 AND v.loja_id = ?
        GROUP BY v.id ORDER BY v.nome
    `).all(lojaId, di, df, di, df, lojaId).map(f => ({ ...f, bonus: (f.meta > 0 && f.total_os >= f.meta) ? f.bonus_meta : 0 }));

    const valesMap = {};
    db.prepare(`
        SELECT vd.nome as nome, COALESCE(SUM(v.valor), 0) as total_vales
        FROM vales v JOIN vendedores vd ON vd.id = v.vendedor_id
        WHERE date(v.data) BETWEEN ? AND ? AND vd.loja_id = ?
        GROUP BY v.vendedor_id
    `).all(di, df, lojaId).forEach(v => { valesMap[v.nome] = v.total_vales; });

    const extrasMap = {};
    const extrasDetalhe = {};
    db.prepare(`
        SELECT ef.vendedor_id, ef.id, ef.descricao, ef.valor, ef.data
        FROM extras_funcionario ef
        WHERE date(ef.data) BETWEEN ? AND ? AND ef.loja_id = ?
        ORDER BY ef.data DESC
    `).all(di, df, lojaId).forEach(e => {
        extrasMap[e.vendedor_id] = (extrasMap[e.vendedor_id] || 0) + e.valor;
        if (!extrasDetalhe[e.vendedor_id]) extrasDetalhe[e.vendedor_id] = [];
        extrasDetalhe[e.vendedor_id].push(e);
    });

    const funcionariosComVales = funcionarios.map(f => {
        const vales = valesMap[f.nome] || 0;
        const extras = extrasMap[f.id] || 0;
        const bruto = f.salario_base + f.comissao + ((f.meta > 0 && f.total_os >= f.meta) ? f.bonus_meta : 0) + extras;
        const excedente = Math.max(0, vales - bruto);
        return { ...f, vales, extras, extras_detalhe: extrasDetalhe[f.id] || [], total_a_pagar: Math.max(0, bruto - vales), excedente };
    });

    const totalSalarios  = funcionarios.reduce((s, f) => s + f.salario_base, 0);
    const totalComissoes = funcionarios.reduce((s, f) => s + f.comissao, 0);
    const totalBonus     = funcionarios.reduce((s, f) => s + f.bonus, 0);
    const totalExtras    = Object.values(extrasMap).reduce((s, v) => s + v, 0);
    const totalVales     = Object.values(valesMap).reduce((s, v) => s + v, 0);
    const totalExcedenteVales = funcionariosComVales.reduce((s, f) => s + f.excedente, 0);
    const resultadoLiquido = faturamentoBruto - totalGastos - totalSalarios - totalComissoes - totalBonus - totalExtras - totalExcedenteVales;

    res.json({
        list, totais,
        resultado: {
            faturamento_bruto: faturamentoBruto,
            faturamento_afiacao: _sumAfiacao.t,
            gastos, gastos_fixos_total: gastosFixos.total, total_gastos: totalGastos,
            funcionarios: funcionariosComVales,
            total_salarios: totalSalarios, total_comissoes: totalComissoes,
            total_bonus: totalBonus, total_extras: totalExtras, total_vales: totalVales, total_excedente_vales: totalExcedenteVales,
            resultado_liquido: resultadoLiquido,
            margem: faturamentoBruto > 0 ? ((resultadoLiquido / faturamentoBruto) * 100).toFixed(1) : 0
        }
    });
});

// GET /api/relatorios/usuarios — lista usuários da loja para o filtro
router.get('/usuarios', (req, res) => {
    const { loja_id, principal } = req.user;
    if (!principal) return res.json([]);
    const users = db.prepare('SELECT id, nome, principal FROM usuarios WHERE loja_id = ? AND ativo = 1 AND perfil != \'admin\' ORDER BY principal DESC, nome').all(loja_id);
    res.json(users);
});

module.exports = router;
