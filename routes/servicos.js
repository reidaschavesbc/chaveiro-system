const express = require('express');
const router = express.Router();
const db = require('../database/db');

// GET /api/servicos
router.get('/', (req, res) => {
    const rows = db.prepare(`
        SELECT ts.*, p.nome as produto_nome, p.estoque as produto_estoque, p.unidade as produto_unidade
        FROM tipos_servico ts
        LEFT JOIN produtos p ON p.id = ts.produto_id
        WHERE ts.ativo = 1
        ORDER BY ts.nome
    `).all();
    res.json(rows);
});

// POST /api/servicos
router.post('/', (req, res) => {
    const { nome, descricao, preco_base, produto_id, produto_quantidade } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    const result = db.prepare('INSERT INTO tipos_servico (nome, descricao, preco_base, produto_id, produto_quantidade) VALUES (?, ?, ?, ?, ?)')
        .run(nome, descricao || null, preco_base || 0, produto_id || null, produto_quantidade || 1);
    res.status(201).json({ id: result.lastInsertRowid });
});

// PUT /api/servicos/:id
router.put('/:id', (req, res) => {
    const { nome, descricao, preco_base, produto_id, produto_quantidade } = req.body;
    const s = db.prepare('SELECT id FROM tipos_servico WHERE id = ?').get(req.params.id);
    if (!s) return res.status(404).json({ error: 'Serviço não encontrado' });
    db.prepare('UPDATE tipos_servico SET nome=?, descricao=?, preco_base=?, produto_id=?, produto_quantidade=? WHERE id=?')
        .run(nome, descricao || null, preco_base || 0, produto_id || null, produto_quantidade || 1, req.params.id);
    res.json({ ok: true });
});

// DELETE /api/servicos/:id
router.delete('/:id', (req, res) => {
    db.prepare('UPDATE tipos_servico SET ativo = 0 WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

module.exports = router;
