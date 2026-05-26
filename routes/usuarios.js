const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../database/db');

function apenasAdmin(req, res, next) {
    if (req.user.perfil !== 'admin') return res.status(403).json({ error: 'Acesso restrito a administradores' });
    next();
}

// GET /api/usuarios — lista todos os usuários (exceto afiadores, gerenciados pela aba Afiação)
router.get('/', apenasAdmin, (req, res) => {
    const usuarios = db.prepare(`
        SELECT id, nome, email, perfil, ativo, loja_id, principal, criado_em
        FROM usuarios WHERE perfil != 'afiador'
        ORDER BY nome ASC
    `).all();
    res.json(usuarios);
});

// GET /api/usuarios/pontos — sub-usuários da loja do token (para filtro no painel financeiro)
router.get('/pontos', (req, res) => {
    if (req.user.perfil !== 'admin' && !req.user.principal) return res.status(403).json({ error: 'Acesso negado' });
    const lojaId = req.user.loja_id;
    const pontos = db.prepare(`
        SELECT id, nome, email, principal FROM usuarios
        WHERE loja_id = ? AND ativo = 1 AND perfil != 'afiador'
        ORDER BY principal DESC, nome ASC
    `).all(lojaId);
    res.json(pontos);
});

// POST /api/usuarios — cria novo usuário
router.post('/', apenasAdmin, (req, res) => {
    const { nome, email, senha, perfil } = req.body;
    if (!nome || !email || !senha) return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios' });
    if (!['admin', 'operador'].includes(perfil)) return res.status(400).json({ error: 'Perfil inválido' });

    const existe = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email);
    if (existe) return res.status(409).json({ error: 'Já existe um usuário com este e-mail' });

    const hash = bcrypt.hashSync(senha, 10);
    const result = db.prepare(
        'INSERT INTO usuarios (nome, email, senha, perfil) VALUES (?, ?, ?, ?)'
    ).run(nome, email.toLowerCase().trim(), hash, perfil);

    res.status(201).json({ id: result.lastInsertRowid, ok: true });
});

// PUT /api/usuarios/:id — atualiza nome, e-mail e perfil
router.put('/:id', apenasAdmin, (req, res) => {
    const { nome, email, perfil, ativo } = req.body;
    const { id } = req.params;

    if (Number(id) === req.user.id) return res.status(400).json({ error: 'Você não pode editar seu próprio usuário por aqui' });

    const usuario = db.prepare('SELECT id FROM usuarios WHERE id = ?').get(id);
    if (!usuario) return res.status(404).json({ error: 'Usuário não encontrado' });

    if (email) {
        const conflito = db.prepare('SELECT id FROM usuarios WHERE email = ? AND id != ?').get(email, id);
        if (conflito) return res.status(409).json({ error: 'E-mail já utilizado por outro usuário' });
    }

    db.prepare(`
        UPDATE usuarios SET
            nome = COALESCE(?, nome),
            email = COALESCE(?, email),
            perfil = COALESCE(?, perfil),
            ativo = COALESCE(?, ativo)
        WHERE id = ?
    `).run(nome || null, email ? email.toLowerCase().trim() : null, perfil || null, ativo !== undefined ? (ativo ? 1 : 0) : null, id);

    res.json({ ok: true });
});

// PUT /api/usuarios/:id/senha — redefine senha do usuário
router.put('/:id/senha', apenasAdmin, (req, res) => {
    const { senha } = req.body;
    const { id } = req.params;
    if (!senha || senha.length < 4) return res.status(400).json({ error: 'A senha deve ter pelo menos 4 caracteres' });

    const usuario = db.prepare('SELECT id FROM usuarios WHERE id = ?').get(id);
    if (!usuario) return res.status(404).json({ error: 'Usuário não encontrado' });

    const hash = bcrypt.hashSync(senha, 10);
    db.prepare('UPDATE usuarios SET senha = ? WHERE id = ?').run(hash, id);
    res.json({ ok: true });
});

module.exports = router;
