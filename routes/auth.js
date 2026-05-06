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

// PUT /api/auth/senha (change password)
router.put('/senha', require('../middleware/auth'), (req, res) => {
    const { senha_atual, senha_nova } = req.body;
    const user = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.user.id);
    if (!bcrypt.compareSync(senha_atual, user.senha)) return res.status(400).json({ error: 'Senha atual incorreta' });
    const hash = bcrypt.hashSync(senha_nova, 10);
    db.prepare('UPDATE usuarios SET senha = ? WHERE id = ?').run(hash, req.user.id);
    res.json({ ok: true });
});

module.exports = router;
