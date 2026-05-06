const express = require('express');
const router = express.Router();
const db = require('../database/db');

// GET /api/vendedores — retorna todos os campos exceto salario_base (ocultado no frontend)
router.get('/', (req, res) => {
    const list = db.prepare('SELECT * FROM vendedores WHERE ativo = 1 ORDER BY nome').all();
    res.json(list);
});

// POST /api/vendedores
router.post('/', (req, res) => {
    const { nome, telefone, percentual_comissao, salario_base, meta, bonus_meta } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    const perc = parseFloat(percentual_comissao) || 0;
    const sal  = parseFloat(salario_base) || 0;
    const m    = parseFloat(meta) || 0;
    const bm   = parseFloat(bonus_meta) || 0;
    const result = db.prepare(
        'INSERT INTO vendedores (nome, telefone, percentual_comissao, salario_base, meta, bonus_meta) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(nome, telefone || null, perc, sal, m, bm);
    res.status(201).json({ id: result.lastInsertRowid, nome, telefone: telefone || null, percentual_comissao: perc, meta: m, bonus_meta: bm });
});

// PUT /api/vendedores/:id
router.put('/:id', (req, res) => {
    const { nome, telefone, percentual_comissao, salario_base, meta, bonus_meta } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    const perc = parseFloat(percentual_comissao) || 0;
    const m    = parseFloat(meta) || 0;
    const bm   = parseFloat(bonus_meta) || 0;

    if (salario_base !== undefined) {
        // Salário foi revelado e enviado — atualiza junto
        const sal = parseFloat(salario_base) || 0;
        db.prepare(
            'UPDATE vendedores SET nome = ?, telefone = ?, percentual_comissao = ?, salario_base = ?, meta = ?, bonus_meta = ? WHERE id = ?'
        ).run(nome, telefone || null, perc, sal, m, bm, req.params.id);
    } else {
        // Salário não revelado — preserva o valor atual no banco
        db.prepare(
            'UPDATE vendedores SET nome = ?, telefone = ?, percentual_comissao = ?, meta = ?, bonus_meta = ? WHERE id = ?'
        ).run(nome, telefone || null, perc, m, bm, req.params.id);
    }
    res.json({ ok: true });
});

// DELETE /api/vendedores/:id
router.delete('/:id', (req, res) => {
    db.prepare('UPDATE vendedores SET ativo = 0 WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

module.exports = router;
