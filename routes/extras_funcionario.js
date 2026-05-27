const express = require('express');
const router = express.Router();
const db = require('../database/db');

function apenasAdmin(req, res, next) {
    if (req.user.perfil !== 'admin') return res.status(403).json({ error: 'Acesso restrito a administradores' });
    next();
}

// GET /api/extras-funcionario?data_inicio=&data_fim=
router.get('/', apenasAdmin, (req, res) => {
    const lojaId = req.user.loja_id;
    const hoje = new Date().toLocaleDateString('en-CA');
    const di = req.query.data_inicio || hoje.slice(0, 7) + '-01';
    const df = req.query.data_fim || hoje;
    const extras = db.prepare(`
        SELECT ef.*, v.nome as vendedor_nome
        FROM extras_funcionario ef
        JOIN vendedores v ON v.id = ef.vendedor_id
        WHERE date(ef.data) BETWEEN ? AND ? AND ef.loja_id = ?
        ORDER BY ef.data DESC, ef.id DESC
    `).all(di, df, lojaId);
    res.json(extras);
});

// POST /api/extras-funcionario
router.post('/', apenasAdmin, (req, res) => {
    const { vendedor_id, descricao, valor, data } = req.body;
    if (!vendedor_id) return res.status(400).json({ error: 'Funcionário obrigatório' });
    if (!descricao?.trim()) return res.status(400).json({ error: 'Descrição obrigatória' });
    const v = parseFloat(valor);
    if (!v || v <= 0) return res.status(400).json({ error: 'Valor deve ser maior que zero' });

    const vend = db.prepare('SELECT id FROM vendedores WHERE id = ? AND loja_id = ?').get(vendedor_id, req.user.loja_id);
    if (!vend) return res.status(404).json({ error: 'Funcionário não encontrado' });

    const result = db.prepare(
        `INSERT INTO extras_funcionario (vendedor_id, descricao, valor, data, loja_id) VALUES (?, ?, ?, ?, ?)`
    ).run(vendedor_id, descricao.trim(), v, data || new Date().toLocaleDateString('en-CA'), req.user.loja_id);

    res.status(201).json({ id: result.lastInsertRowid, ok: true });
});

// DELETE /api/extras-funcionario/:id
router.delete('/:id', apenasAdmin, (req, res) => {
    const e = db.prepare('SELECT id FROM extras_funcionario WHERE id = ? AND loja_id = ?').get(req.params.id, req.user.loja_id);
    if (!e) return res.status(404).json({ error: 'Extra não encontrado' });
    db.prepare('DELETE FROM extras_funcionario WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

module.exports = router;
