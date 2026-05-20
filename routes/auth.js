const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/db');

// POST /api/auth/login
router.post('/login', (req, res) => {
    const { usuario, senha } = req.body;
    if (!usuario || !senha) return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });

    const user = db.prepare('SELECT * FROM usuarios WHERE email = ? AND ativo = 1').get(usuario);
    if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });

    const valid = bcrypt.compareSync(senha, user.senha);
    if (!valid) return res.status(401).json({ error: 'Credenciais inválidas' });

    if (user.perfil === 'admin') return res.status(403).json({ error: 'Acesso negado. Administradores devem entrar pelo painel admin.' });
    if (!user.loja_id) return res.status(403).json({ error: 'Usuário sem loja vinculada. Contate o administrador.' });

    const token = jwt.sign(
        { id: user.id, nome: user.nome, email: user.email, perfil: user.perfil, loja_id: user.loja_id, principal: user.principal },
        process.env.JWT_SECRET,
        { expiresIn: '12h' }
    );

    res.json({ token, user: { id: user.id, nome: user.nome, email: user.email, perfil: user.perfil, loja_id: user.loja_id, principal: user.principal } });
});

// POST /api/auth/admin-login — exclusivo para o painel /admin
router.post('/admin-login', (req, res) => {
    const { usuario, senha } = req.body;
    if (!usuario || !senha) return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });

    const user = db.prepare('SELECT * FROM usuarios WHERE email = ? AND ativo = 1').get(usuario);
    if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });

    const valid = bcrypt.compareSync(senha, user.senha);
    if (!valid) return res.status(401).json({ error: 'Credenciais inválidas' });

    if (user.perfil !== 'admin') return res.status(403).json({ error: 'Acesso negado — apenas administradores' });

    const token = jwt.sign(
        { id: user.id, nome: user.nome, email: user.email, perfil: user.perfil },
        process.env.JWT_SECRET,
        { expiresIn: '12h' }
    );

    res.json({ token, user: { id: user.id, nome: user.nome, email: user.email, perfil: user.perfil } });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Não autenticado' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        res.json(decoded);
    } catch {
        res.status(403).json({ error: 'Token inválido' });
    }
});

// POST /api/auth/acesso-loja — admin gera token com acesso financeiro a uma loja
router.post('/acesso-loja', require('../middleware/auth'), (req, res) => {
    if (req.user.perfil !== 'admin') return res.status(403).json({ error: 'Acesso restrito a administradores' });
    const { loja_id } = req.body;
    if (!loja_id) return res.status(400).json({ error: 'loja_id é obrigatório' });
    const loja = db.prepare('SELECT id, nome FROM lojas WHERE id = ?').get(loja_id);
    if (!loja) return res.status(404).json({ error: 'Loja não encontrada' });
    const token = jwt.sign(
        { id: req.user.id, nome: req.user.nome, email: req.user.email, perfil: 'admin', loja_id: loja.id, principal: 1 },
        process.env.JWT_SECRET,
        { expiresIn: '4h' }
    );
    res.json({ token, loja });
});

// PUT /api/auth/senha (change password)
router.put('/senha', require('../middleware/auth'), (req, res) => {
    const { senha_atual, senha_nova } = req.body;
    const user = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.user.id);
    if (!bcrypt.compareSync(senha_atual, user.senha)) return res.status(400).json({ error: 'Senha atual incorreta' });
    const hash = bcrypt.hashSync(senha_nova, 10);
    db.prepare('UPDATE usuarios SET senha = ? WHERE id = ?').run(hash, req.user.id);
    res.json({ ok: true });
});

// PUT /api/auth/admin-senha — troca senha do admin (autenticado pelo token do painel admin)
router.put('/admin-senha', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Não autenticado' });
    let decoded;
    try { decoded = require('jsonwebtoken').verify(token, process.env.JWT_SECRET); }
    catch { return res.status(401).json({ error: 'Token inválido' }); }
    if (decoded.perfil !== 'admin') return res.status(403).json({ error: 'Acesso negado' });

    const { senha_atual, senha_nova } = req.body;
    if (!senha_atual || !senha_nova) return res.status(400).json({ error: 'Preencha todos os campos' });
    if (senha_nova.length < 6) return res.status(400).json({ error: 'Senha nova deve ter pelo menos 6 caracteres' });

    const user = db.prepare('SELECT * FROM usuarios WHERE id = ? AND perfil = ?').get(decoded.id, 'admin');
    if (!user || !bcrypt.compareSync(senha_atual, user.senha)) return res.status(400).json({ error: 'Senha atual incorreta' });

    db.prepare('UPDATE usuarios SET senha = ? WHERE id = ?').run(bcrypt.hashSync(senha_nova, 10), user.id);
    res.json({ ok: true });
});

module.exports = router;
