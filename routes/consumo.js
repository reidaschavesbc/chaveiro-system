const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { verificarEstoqueBaixo } = require('./pedidos');

const CATEGORIAS = ['erro_corte', 'garantia', 'uso_interno', 'outros'];

// GET /api/consumo - histórico de consumos internos
router.get('/', (req, res) => {
    const { data_inicio, data_fim, categoria } = req.query;
    let sql = `
        SELECT m.*, p.nome as produto_nome, p.unidade
        FROM movimentacoes_estoque m
        JOIN produtos p ON m.produto_id = p.id
        WHERE m.tipo = 'consumo_interno'
    `;
    const params = [];
    if (data_inicio) { sql += ' AND date(m.data) >= ?'; params.push(data_inicio); }
    if (data_fim)    { sql += ' AND date(m.data) <= ?'; params.push(data_fim); }
    if (categoria)   { sql += ' AND m.referencia = ?'; params.push(categoria); }
    sql += ' ORDER BY m.data DESC LIMIT 200';

    const rows = db.prepare(sql).all(...params);

    const total_itens = rows.reduce((s, r) => s + r.quantidade, 0);
    const por_categoria = CATEGORIAS.map(cat => ({
        categoria: cat,
        qtd: rows.filter(r => r.referencia === cat).length,
        total_unidades: rows.filter(r => r.referencia === cat).reduce((s, r) => s + r.quantidade, 0)
    })).filter(c => c.qtd > 0);

    res.json({ consumos: rows, total_itens, por_categoria });
});

// POST /api/consumo - registrar consumo interno
router.post('/', (req, res) => {
    const { produto_id, quantidade, categoria, observacao, os_referencia } = req.body;
    if (!produto_id) return res.status(400).json({ error: 'Produto é obrigatório' });
    if (!quantidade || quantidade <= 0) return res.status(400).json({ error: 'Quantidade inválida' });
    if (!CATEGORIAS.includes(categoria)) return res.status(400).json({ error: 'Categoria inválida' });

    const p = db.prepare('SELECT * FROM produtos WHERE id = ? AND ativo = 1').get(produto_id);
    if (!p) return res.status(404).json({ error: 'Produto não encontrado' });
    if (p.estoque < quantidade) return res.status(400).json({ error: `Estoque insuficiente (disponível: ${p.estoque})` });

    const novoEstoque = p.estoque - quantidade;
    const obs = [observacao, os_referencia ? `OS: ${os_referencia}` : null].filter(Boolean).join(' | ') || null;

    db.prepare('UPDATE produtos SET estoque = ? WHERE id = ?').run(novoEstoque, produto_id);
    db.prepare(`
        INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, estoque_anterior, estoque_posterior, referencia, observacao, usuario_id)
        VALUES (?, 'consumo_interno', ?, ?, ?, ?, ?, ?)
    `).run(produto_id, quantidade, p.estoque, novoEstoque, categoria, obs, req.user?.id || null);

    verificarEstoqueBaixo(produto_id);

    res.status(201).json({ ok: true, estoque_anterior: p.estoque, estoque_atual: novoEstoque });
});

module.exports = router;
