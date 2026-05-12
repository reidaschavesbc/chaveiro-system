const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../database/db');

function apenasAdmin(req, res, next) {
    if (req.user.perfil !== 'admin') return res.status(403).json({ error: 'Acesso restrito a administradores' });
    next();
}

// GET /api/lojas — lista lojas com seus usuários
router.get('/', apenasAdmin, (req, res) => {
    const lojas = db.prepare('SELECT * FROM lojas ORDER BY nome ASC').all();
    const usuarios = db.prepare(`
        SELECT id, nome, email, perfil, ativo, loja_id, principal, criado_em
        FROM usuarios WHERE loja_id IS NOT NULL ORDER BY principal DESC, nome ASC
    `).all();

    const resultado = lojas.map(l => ({
        ...l,
        usuarios: usuarios.filter(u => u.loja_id === l.id)
    }));

    res.json(resultado);
});

// POST /api/lojas — cria loja + usuário principal
router.post('/', apenasAdmin, (req, res) => {
    const { nome_loja, nome_usuario, email, senha } = req.body;
    if (!nome_loja || !nome_usuario || !email || !senha)
        return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    if (senha.length < 4)
        return res.status(400).json({ error: 'A senha deve ter pelo menos 4 caracteres' });

    const existe = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email);
    if (existe) return res.status(409).json({ error: 'Este e-mail já está em uso' });

    const hash = bcrypt.hashSync(senha, 10);

    const criarLoja = db.transaction(() => {
        const loja = db.prepare('INSERT INTO lojas (nome) VALUES (?)').run(nome_loja);
        db.prepare(`
            INSERT INTO usuarios (nome, email, senha, perfil, loja_id, principal)
            VALUES (?, ?, ?, 'operador', ?, 1)
        `).run(nome_usuario, email.toLowerCase().trim(), hash, loja.lastInsertRowid);
        return loja.lastInsertRowid;
    });

    const loja_id = criarLoja();
    res.status(201).json({ id: loja_id, ok: true });
});

// PUT /api/lojas/:id — edita nome ou status da loja
router.put('/:id', apenasAdmin, (req, res) => {
    const { nome, ativo } = req.body;
    const loja = db.prepare('SELECT id FROM lojas WHERE id = ?').get(req.params.id);
    if (!loja) return res.status(404).json({ error: 'Loja não encontrada' });

    db.prepare(`
        UPDATE lojas SET
            nome  = COALESCE(?, nome),
            ativo = COALESCE(?, ativo)
        WHERE id = ?
    `).run(nome || null, ativo !== undefined ? (ativo ? 1 : 0) : null, req.params.id);

    res.json({ ok: true });
});

// DELETE /api/lojas/:id — exclui loja e seus usuários
router.delete('/:id', apenasAdmin, (req, res) => {
    const loja = db.prepare('SELECT id FROM lojas WHERE id = ?').get(req.params.id);
    if (!loja) return res.status(404).json({ error: 'Loja não encontrada' });
    const id = req.params.id;
    db.transaction(() => {
        const sub = 'SELECT id FROM usuarios WHERE loja_id = ?';
        db.prepare(`UPDATE ordens_servico       SET usuario_id = NULL WHERE usuario_id IN (${sub})`).run(id);
        db.prepare(`UPDATE vendas               SET usuario_id = NULL WHERE usuario_id IN (${sub})`).run(id);
        db.prepare(`UPDATE movimentacoes_estoque SET usuario_id = NULL WHERE usuario_id IN (${sub})`).run(id);
        db.prepare(`UPDATE vales                SET usuario_id = NULL WHERE usuario_id IN (${sub})`).run(id);
        db.prepare(`UPDATE orcamentos           SET usuario_id = NULL WHERE usuario_id IN (${sub})`).run(id);
        db.prepare(`DELETE FROM estoque_usuario  WHERE usuario_id IN (${sub})`).run(id);
        db.prepare('DELETE FROM usuarios WHERE loja_id = ?').run(id);
        db.prepare('DELETE FROM lojas WHERE id = ?').run(id);
    })();
    res.json({ ok: true });
});

// POST /api/lojas/:id/usuarios — cria sub-usuário dentro de uma loja
router.post('/:id/usuarios', apenasAdmin, (req, res) => {
    const { nome, email, senha } = req.body;
    const loja_id = req.params.id;

    if (!nome || !email || !senha)
        return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios' });
    if (senha.length < 4)
        return res.status(400).json({ error: 'A senha deve ter pelo menos 4 caracteres' });

    const loja = db.prepare('SELECT id FROM lojas WHERE id = ?').get(loja_id);
    if (!loja) return res.status(404).json({ error: 'Loja não encontrada' });

    const existe = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email);
    if (existe) return res.status(409).json({ error: 'Este e-mail já está em uso' });

    const hash = bcrypt.hashSync(senha, 10);
    const result = db.prepare(`
        INSERT INTO usuarios (nome, email, senha, perfil, loja_id, principal)
        VALUES (?, ?, ?, 'operador', ?, 0)
    `).run(nome, email.toLowerCase().trim(), hash, loja_id);

    res.status(201).json({ id: result.lastInsertRowid, ok: true });
});

module.exports = router;
