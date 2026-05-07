const express = require('express');
const router = express.Router();
const db = require('../database/db');

// GET /api/relatorios/dashboard
router.get('/dashboard', (req, res) => {
    // Use local time for consistency with SQLite 'localtime'
    const now = new Date();
    const hoje = now.toLocaleDateString('en-CA'); // YYYY-MM-DD
    const mesAtual = hoje.slice(0, 7); // YYYY-MM

    const vendasHoje = db.prepare(`SELECT 
        (SELECT COUNT(*) FROM vendas WHERE date(data) = ? AND status != 'cancelada') + 
        (SELECT COUNT(*) FROM ordens_servico WHERE COALESCE(date(data_conclusao), date(data_entrada)) = ? AND status = 'concluida') as qtd,
        (SELECT COALESCE(SUM(total_final), 0) FROM vendas WHERE date(data) = ? AND status != 'cancelada') +
        (SELECT COALESCE(SUM(valor), 0) FROM ordens_servico WHERE COALESCE(date(data_conclusao), date(data_entrada)) = ? AND status = 'concluida') as total
    `).get(hoje, hoje, hoje, hoje);

    const vendasMes = db.prepare(`SELECT 
        (SELECT COUNT(*) FROM vendas WHERE strftime('%Y-%m', data) = ? AND status != 'cancelada') +
        (SELECT COUNT(*) FROM ordens_servico WHERE strftime('%Y-%m', COALESCE(data_conclusao, data_entrada)) = ? AND status = 'concluida') as qtd,
        (SELECT COALESCE(SUM(total_final), 0) FROM vendas WHERE strftime('%Y-%m', data) = ? AND status != 'cancelada') +
        (SELECT COALESCE(SUM(valor), 0) FROM ordens_servico WHERE strftime('%Y-%m', COALESCE(data_conclusao, data_entrada)) = ? AND status = 'concluida') as total
    `).get(mesAtual, mesAtual, mesAtual, mesAtual);
    const osAbertas = db.prepare(`SELECT COUNT(*) as qtd FROM ordens_servico WHERE status IN ('aberta', 'em_andamento')`).get();
    const osConcluidas = db.prepare(`SELECT COUNT(*) as qtd FROM ordens_servico WHERE status = 'concluida' AND strftime('%Y-%m', COALESCE(data_conclusao, data_entrada)) = ?`).get(mesAtual);
    const produtosBaixoEstoque = db.prepare('SELECT COUNT(*) as qtd FROM produtos WHERE ativo = 1 AND estoque <= estoque_minimo').get();
    const totalClientes = db.prepare('SELECT COUNT(*) as qtd FROM clientes WHERE ativo = 1').get();
    const aReceber = db.prepare(`SELECT COUNT(*) as qtd, COALESCE(SUM(valor - COALESCE(valor_pago,0)),0) as total FROM ordens_servico WHERE a_receber = 1 AND a_receber_pago = 0`).get();
    const aReceberVencido = db.prepare(`SELECT COUNT(*) as qtd FROM ordens_servico WHERE a_receber = 1 AND a_receber_pago = 0 AND data_vencimento < ?`).get(hoje);
    const gastosMes = db.prepare(`SELECT COALESCE(SUM(valor), 0) as total, COUNT(*) as qtd FROM gastos WHERE strftime('%Y-%m', data) = ?`).get(mesAtual);

    const ultimasVendas = db.prepare(`SELECT v.*, c.nome as cliente_nome, ven.nome as vendedor_nome FROM vendas v
    LEFT JOIN clientes c ON v.cliente_id = c.id
    LEFT JOIN vendedores ven ON v.vendedor_id = ven.id
    WHERE status != 'cancelada' ORDER BY v.data DESC LIMIT 5`).all();
    const ultimasOS = db.prepare(`SELECT os.*, c.nome as cliente_nome, ven.nome as vendedor_nome FROM ordens_servico os
    LEFT JOIN clientes c ON os.cliente_id = c.id
    LEFT JOIN vendedores ven ON os.vendedor_id = ven.id
    ORDER BY os.data_entrada DESC LIMIT 5`).all();

    res.json({
        vendas_hoje: vendasHoje,
        vendas_mes: vendasMes,
        os_abertas: osAbertas.qtd,
        os_concluidas_mes: osConcluidas.qtd,
        produtos_baixo_estoque: produtosBaixoEstoque.qtd,
        total_clientes: totalClientes.qtd,
        ultimas_vendas: ultimasVendas,
        ultimas_os: ultimasOS,
        a_receber: { qtd: aReceber.qtd, total: aReceber.total, vencidos: aReceberVencido.qtd },
        gastos_mes: { total: gastosMes.total, qtd: gastosMes.qtd }
    });
});

// GET /api/relatorios/vendas
router.get('/vendas', (req, res) => {
    const { data_inicio, data_fim } = req.query;
    const di = data_inicio || new Date().toLocaleDateString('en-CA').slice(0, 7) + '-01';
    const df = data_fim || new Date().toLocaleDateString('en-CA');
    const vendas = db.prepare(`SELECT v.*, c.nome as cliente_nome, ven.nome as vendedor_nome FROM vendas v
    LEFT JOIN clientes c ON v.cliente_id = c.id
    LEFT JOIN vendedores ven ON v.vendedor_id = ven.id
    WHERE date(v.data) BETWEEN ? AND ? AND v.status != 'cancelada' ORDER BY v.data DESC`).all(di, df);

    // ONLY Sales totals
    const totais = db.prepare(`SELECT metodo as forma_pagamento, COALESCE(SUM(valor), 0) as total 
        FROM pagamentos_venda pv
        JOIN vendas v ON pv.venda_id = v.id
        WHERE date(v.data) BETWEEN ? AND ? AND v.status != 'cancelada' GROUP BY metodo`).all(di, df);

    res.json({ vendas, totais });
});

// GET /api/relatorios/estoque
router.get('/estoque', (req, res) => {
    const produtos = db.prepare(`SELECT *, (estoque * preco_venda) as valor_total FROM produtos WHERE ativo = 1 ORDER BY estoque ASC`).all();
    const valorTotal = db.prepare(`SELECT COALESCE(SUM(estoque * preco_venda), 0) as total FROM produtos WHERE ativo = 1`).get();
    res.json({ produtos, valor_total: valorTotal.total });
});

// GET /api/relatorios/os
router.get('/os', (req, res) => {
    const { data_inicio, data_fim, status } = req.query;
    const di = data_inicio || new Date().toLocaleDateString('en-CA').slice(0, 7) + '-01';
    const df = data_fim || new Date().toLocaleDateString('en-CA');
    let query = `SELECT os.*, c.nome as cliente_nome, ts.nome as servico_nome, v.nome as vendedor_nome FROM ordens_servico os
    LEFT JOIN clientes c ON os.cliente_id = c.id
    LEFT JOIN tipos_servico ts ON os.tipo_servico_id = ts.id
    LEFT JOIN vendedores v ON os.vendedor_id = v.id
    WHERE date(COALESCE(os.data_conclusao, os.data_entrada)) BETWEEN ? AND ?`;
    const params = [di, df];
    if (status) { query += ' AND os.status = ?'; params.push(status); }
    query += ' ORDER BY os.data_entrada DESC';
    const os = db.prepare(query).all(...params);

    // Totais por forma de pagamento (usa pagamentos_os quando disponível, fallback para forma_pagamento)
    const totais = db.prepare(`
        SELECT COALESCE(metodo, 'outros') as forma_pagamento, SUM(valor) as total FROM (
            SELECT po.metodo, po.valor FROM pagamentos_os po
            JOIN ordens_servico os ON po.ordem_id = os.id
            WHERE date(COALESCE(os.data_conclusao, os.data_entrada)) BETWEEN ? AND ? AND os.status = 'concluida'
            UNION ALL
            SELECT os.forma_pagamento, os.valor FROM ordens_servico os
            WHERE date(COALESCE(os.data_conclusao, os.data_entrada)) BETWEEN ? AND ? AND os.status = 'concluida'
            AND os.id NOT IN (SELECT DISTINCT ordem_id FROM pagamentos_os)
        ) GROUP BY COALESCE(metodo, 'outros')
    `).all(di, df, di, df);

    res.json({ os, totais });
});

// GET /api/relatorios/geral
router.get('/geral', (req, res) => {
    const { data_inicio, data_fim } = req.query;
    const di = data_inicio || new Date().toLocaleDateString('en-CA').slice(0, 7) + '-01';
    const df = data_fim || new Date().toLocaleDateString('en-CA');

    const vendas = db.prepare(`SELECT v.id, v.numero, v.data, v.total_final as valor, v.forma_pagamento, 'venda' as tipo, c.nome as cliente_nome, ven.nome as vendedor_nome 
        FROM vendas v
        LEFT JOIN clientes c ON v.cliente_id = c.id
        LEFT JOIN vendedores ven ON v.vendedor_id = ven.id
        WHERE date(v.data) BETWEEN ? AND ? AND v.status != 'cancelada'`).all(di, df);

    const os = db.prepare(`SELECT os.id, os.numero, COALESCE(os.data_conclusao, os.data_entrada) as data, os.valor, os.forma_pagamento, 'os' as tipo, c.nome as cliente_nome, ven.nome as vendedor_nome 
        FROM ordens_servico os
        LEFT JOIN clientes c ON os.cliente_id = c.id
        LEFT JOIN vendedores ven ON os.vendedor_id = ven.id
        WHERE date(COALESCE(os.data_conclusao, os.data_entrada)) BETWEEN ? AND ? AND os.status = 'concluida'`).all(di, df);

    const list = [...vendas, ...os].sort((a, b) => new Date(b.data) - new Date(a.data));

    // Totals by payment method (Combined)
    const totaisVendas = db.prepare(`SELECT metodo as forma_pagamento, SUM(valor) as total 
        FROM pagamentos_venda pv
        JOIN vendas v ON pv.venda_id = v.id
        WHERE date(v.data) BETWEEN ? AND ? AND v.status != 'cancelada' GROUP BY metodo`).all(di, df);

    const totaisOS = db.prepare(`
        SELECT COALESCE(metodo, 'outros') as forma_pagamento, SUM(valor) as total FROM (
            SELECT po.metodo, po.valor FROM pagamentos_os po
            JOIN ordens_servico os ON po.ordem_id = os.id
            WHERE date(COALESCE(os.data_conclusao, os.data_entrada)) BETWEEN ? AND ? AND os.status = 'concluida'
            UNION ALL
            SELECT os.forma_pagamento, os.valor FROM ordens_servico os
            WHERE date(COALESCE(os.data_conclusao, os.data_entrada)) BETWEEN ? AND ? AND os.status = 'concluida'
            AND os.id NOT IN (SELECT DISTINCT ordem_id FROM pagamentos_os)
        ) GROUP BY COALESCE(metodo, 'outros')
    `).all(di, df, di, df);

    const map = {};
    [...totaisVendas, ...totaisOS].forEach(t => {
        const met = t.forma_pagamento || 'outros';
        map[met] = (map[met] || 0) + t.total;
    });
    const totais = Object.keys(map).map(met => ({ forma_pagamento: met, total: map[met] }));

    // faturamentoBruto direto do banco — não depende da quebra por forma de pagamento
    const _sumOS = db.prepare(`SELECT COALESCE(SUM(valor),0) as t FROM ordens_servico WHERE date(COALESCE(data_conclusao,data_entrada)) BETWEEN ? AND ? AND status='concluida'`).get(di, df);
    const _sumVendas = db.prepare(`SELECT COALESCE(SUM(total_final),0) as t FROM vendas WHERE date(data) BETWEEN ? AND ? AND status != 'cancelada'`).get(di, df);
    const faturamentoBruto = _sumOS.t + _sumVendas.t;

    // Gastos por categoria no período
    const gastos = db.prepare(`
        SELECT categoria, COALESCE(SUM(valor), 0) as total, COUNT(*) as qtd
        FROM gastos WHERE date(data) BETWEEN ? AND ?
        GROUP BY categoria ORDER BY total DESC
    `).all(di, df);
    const totalGastos = gastos.reduce((s, g) => s + g.total, 0);

    // Todos os funcionários ativos com comissão, salário, meta e bônus no período
    const funcionarios = db.prepare(`
        SELECT v.id, v.nome, v.salario_base, v.percentual_comissao, v.meta, v.bonus_meta,
               COUNT(os.id) as qtd_os,
               COALESCE(SUM(os.valor), 0) as total_os,
               COALESCE(SUM(os.valor * v.percentual_comissao / 100.0), 0) as comissao
        FROM vendedores v
        LEFT JOIN ordens_servico os ON os.vendedor_id = v.id
            AND os.status = 'concluida'
            AND date(COALESCE(os.data_conclusao, os.data_entrada)) BETWEEN ? AND ?
        WHERE v.ativo = 1
        GROUP BY v.id
        ORDER BY v.nome
    `).all(di, df).map(f => ({
        ...f,
        bonus: (f.meta > 0 && f.total_os >= f.meta) ? f.bonus_meta : 0
    }));

    // Vales no período por funcionário
    const valesMap = {};
    db.prepare(`
        SELECT vd.nome as nome, COALESCE(SUM(v.valor), 0) as total_vales
        FROM vales v JOIN vendedores vd ON vd.id = v.vendedor_id
        WHERE date(v.data) BETWEEN ? AND ?
        GROUP BY v.vendedor_id
    `).all(di, df).forEach(v => { valesMap[v.nome] = v.total_vales; });

    const funcionariosComVales = funcionarios.map(f => ({
        ...f,
        vales: valesMap[f.nome] || 0,
        total_a_pagar: Math.max(0, f.salario_base + f.comissao + ((f.meta > 0 && f.total_os >= f.meta) ? f.bonus_meta : 0) - (valesMap[f.nome] || 0))
    }));

    const totalSalarios   = funcionarios.reduce((s, f) => s + f.salario_base, 0);
    const totalComissoes  = funcionarios.reduce((s, f) => s + f.comissao, 0);
    const totalBonus      = funcionarios.reduce((s, f) => s + f.bonus, 0);
    const totalVales      = Object.values(valesMap).reduce((s, v) => s + v, 0);

    const resultadoLiquido = faturamentoBruto - totalGastos - totalSalarios - totalComissoes - totalBonus;

    res.json({
        list, totais,
        resultado: {
            faturamento_bruto: faturamentoBruto,
            gastos, total_gastos: totalGastos,
            funcionarios: funcionariosComVales,
            total_salarios: totalSalarios,
            total_comissoes: totalComissoes,
            total_bonus: totalBonus,
            total_vales: totalVales,
            resultado_liquido: resultadoLiquido,
            margem: faturamentoBruto > 0 ? ((resultadoLiquido / faturamentoBruto) * 100).toFixed(1) : 0
        }
    });
});

module.exports = router;
