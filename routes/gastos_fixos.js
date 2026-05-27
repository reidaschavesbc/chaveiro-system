const express = require('express');
const router = express.Router();
const db = require('../database/db');

const CATEGORIAS = ['material', 'combustivel', 'alimentacao', 'manutencao', 'servicos', 'outros'];

function apenasAdmin(req, res, next) {
    if (req.user.perfil !== 'admin') return res.status(403).json({ error: 'Acesso restrito a administradores' });
    next();
}

// GET /api/gastos-fixos
router.get('/', apenasAdmin, (req, res) => {
    const gastos = db.prepare(
        `SELECT * FROM gastos_fixos WHERE loja_id = ? ORDER BY ativo DESC, descricao ASC`
    ).all(req.user.loja_id);
    const totalAtivo = gastos.filter(g => g.ativo).reduce((s, g) => s + g.valor, 0);
    res.json({ gastos, total_ativo: totalAtivo });
});

// POST /api/gastos-fixos
router.post('/', apenasAdmin, (req, res) => {
    const { descricao, valor, categoria } = req.body;
    if (!descricao?.trim()) return res.status(400).json({ error: 'Descrição é obrigatória' });
    const v = parseFloat(valor);
    if (!v || v <= 0) return res.status(400).json({ error: 'Valor deve ser maior que zero' });
    const cat = CATEGORIAS.includes(categoria) ? categoria : 'outros';
    const result = db.prepare(
        `INSERT INTO gastos_fixos (descricao, valor, categoria, loja_id) VALUES (?, ?, ?, ?)`
    ).run(descricao.trim(), v, cat, req.user.loja_id);
    res.status(201).json({ id: result.lastInsertRowid, ok: true });
});

// PUT /api/gastos-fixos/:id
router.put('/:id', apenasAdmin, (req, res) => {
    const { descricao, valor, categoria, ativo } = req.body;
    const g = db.prepare('SELECT id FROM gastos_fixos WHERE id = ? AND loja_id = ?').get(req.params.id, req.user.loja_id);
    if (!g) return res.status(404).json({ error: 'Gasto fixo não encontrado' });

    if (ativo !== undefined) {
        db.prepare('UPDATE gastos_fixos SET ativo = ? WHERE id = ? AND loja_id = ?')
            .run(ativo ? 1 : 0, req.params.id, req.user.loja_id);
        return res.json({ ok: true });
    }

    if (!descricao?.trim()) return res.status(400).json({ error: 'Descrição é obrigatória' });
    const v = parseFloat(valor);
    if (!v || v <= 0) return res.status(400).json({ error: 'Valor deve ser maior que zero' });
    const cat = CATEGORIAS.includes(categoria) ? categoria : 'outros';
    db.prepare('UPDATE gastos_fixos SET descricao=?,valor=?,categoria=? WHERE id=? AND loja_id=?')
        .run(descricao.trim(), v, cat, req.params.id, req.user.loja_id);
    res.json({ ok: true });
});

// DELETE /api/gastos-fixos/:id
router.delete('/:id', apenasAdmin, (req, res) => {
    const g = db.prepare('SELECT id FROM gastos_fixos WHERE id = ? AND loja_id = ?').get(req.params.id, req.user.loja_id);
    if (!g) return res.status(404).json({ error: 'Gasto fixo não encontrado' });
    db.prepare('DELETE FROM gastos_fixos WHERE id = ? AND loja_id = ?').run(req.params.id, req.user.loja_id);
    res.json({ ok: true });
});

module.exports = router;
