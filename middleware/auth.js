const jwt = require('jsonwebtoken');
const db = require('../database/db');

function authMiddleware(req, res, next) {
    const authHeader = req.headers['authorization'];
    let token = authHeader && authHeader.split(' ')[1];

    // Fallback to query parameter for PDFs and other direct window.open calls
    if (!token) token = req.query.token || req.query.t || null;

    if (!token) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = db.prepare('SELECT id FROM usuarios WHERE id = ? AND ativo = 1').get(decoded.id);
        if (!user) return res.status(401).json({ error: 'Sessão inválida, faça login novamente' });
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token inválido ou expirado' });
    }
}

module.exports = authMiddleware;
