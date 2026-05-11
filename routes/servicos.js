const express = require('express');
const router = express.Router();
const db = require('../database/db');

router.get('/', (req, res) => {
    const rows = db.prepare(`
        SELECT ts.*, p.nome as produto_nome, p.estoque as produto_estoque, p.unidade as produto_unidade
        FROM tipos_servico ts
        LEFT JOIN produtos p ON p.id = ts.produto_id
        WHERE ts.ativo = 1 AND ts.loja_id = ?
        ORDER BY ts.nome
    `).all(req.user.loja_id);
    res.json(rows);
});

router.post('/', (req, res) => {
    const { nome, descricao, preco_base, produto_id, produto_quantidade } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    const result = db.prepare('INSERT INTO tipos_servico (nome, descricao, preco_base, produto_id, produto_quantidade, loja_id) VALUES (?, ?, ?, ?, ?, ?)')
        .run(nome, descricao||null, preco_base||0, produto_id||null, produto_quantidade||1, req.user.loja_id);
    res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
    const { nome, descricao, preco_base, produto_id, produto_quantidade } = req.body;
    const s = db.prepare('SELECT id FROM tipos_servico WHERE id = ? AND loja_id = ?').get(req.params.id, req.user.loja_id);
    if (!s) return res.status(404).json({ error: 'Serviço não encontrado' });
    db.prepare('UPDATE tipos_servico SET nome=?,descricao=?,preco_base=?,produto_id=?,produto_quantidade=? WHERE id=? AND loja_id=?')
        .run(nome, descricao||null, preco_base||0, produto_id||null, produto_quantidade||1, req.params.id, req.user.loja_id);
    res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
    db.prepare('UPDATE tipos_servico SET ativo = 0 WHERE id = ? AND loja_id = ?').run(req.params.id, req.user.loja_id);
    res.json({ ok: true });
});

module.exports = router;
