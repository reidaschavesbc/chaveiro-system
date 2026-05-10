const express = require('express');
const router = express.Router();
const db = require('../database/db');
const bcrypt = require('bcryptjs');

router.get('/', (req, res) => {
    const list = db.prepare('SELECT * FROM vendedores WHERE ativo = 1 AND loja_id = ? ORDER BY nome').all(req.user.loja_id);
    res.json(list);
});

router.post('/', (req, res) => {
    const { nome, telefone, percentual_comissao, salario_base, meta, bonus_meta } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    const perc = parseFloat(percentual_comissao) || 0;
    const sal  = parseFloat(salario_base) || 0;
    const m    = parseFloat(meta) || 0;
    const bm   = parseFloat(bonus_meta) || 0;
    const result = db.prepare(
        'INSERT INTO vendedores (nome, telefone, percentual_comissao, salario_base, meta, bonus_meta, loja_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(nome, telefone||null, perc, sal, m, bm, req.user.loja_id);
    res.status(201).json({ id: result.lastInsertRowid, nome, telefone: telefone||null, percentual_comissao: perc, meta: m, bonus_meta: bm });
});

router.put('/:id', (req, res) => {
    const { nome, telefone, percentual_comissao, salario_base, meta, bonus_meta } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    const perc = parseFloat(percentual_comissao) || 0;
    const m    = parseFloat(meta) || 0;
    const bm   = parseFloat(bonus_meta) || 0;

    if (salario_base !== undefined) {
        const sal = parseFloat(salario_base) || 0;
        db.prepare('UPDATE vendedores SET nome=?,telefone=?,percentual_comissao=?,salario_base=?,meta=?,bonus_meta=? WHERE id=? AND loja_id=?')
            .run(nome, telefone||null, perc, sal, m, bm, req.params.id, req.user.loja_id);
    } else {
        db.prepare('UPDATE vendedores SET nome=?,telefone=?,percentual_comissao=?,meta=?,bonus_meta=? WHERE id=? AND loja_id=?')
            .run(nome, telefone||null, perc, m, bm, req.params.id, req.user.loja_id);
    }
    res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
    db.prepare('UPDATE vendedores SET ativo = 0 WHERE id = ? AND loja_id = ?').run(req.params.id, req.user.loja_id);
    res.json({ ok: true });
});

// PUT /api/vendedores/:id/acesso-app — define email e senha para o app
router.put('/:id/acesso-app', (req, res) => {
    const { email, senha } = req.body;
    if (!email) return res.status(400).json({ error: 'E-mail é obrigatório' });

    const existe = db.prepare('SELECT id FROM vendedores WHERE email = ? AND id != ? AND loja_id = ?').get(email, req.params.id, req.user.loja_id);
    if (existe) return res.status(400).json({ error: 'Este e-mail já está em uso por outro funcionário' });

    if (senha) {
        const hash = bcrypt.hashSync(senha, 10);
        db.prepare('UPDATE vendedores SET email = ?, senha = ? WHERE id = ? AND loja_id = ?').run(email, hash, req.params.id, req.user.loja_id);
    } else {
        db.prepare('UPDATE vendedores SET email = ? WHERE id = ? AND loja_id = ?').run(email, req.params.id, req.user.loja_id);
    }
    res.json({ ok: true });
});

module.exports = router;
