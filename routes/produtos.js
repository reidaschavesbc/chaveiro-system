const express = require('express');
const router = express.Router();
const db = require('../database/db');
const fs = require('fs');
const path = require('path');
const { verificarEstoqueBaixo } = require('./pedidos');

const UPLOADS_DIR = path.join(__dirname, '../public/uploads/produtos');
function ensureUploadsDir() {
    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

router.get('/', (req, res) => {
    const { id: usuario_id, loja_id, principal } = req.user;
    const { q, baixo_estoque } = req.query;

    if (principal) {
        let query = 'SELECT * FROM produtos WHERE ativo = 1 AND loja_id = ?';
        const params = [loja_id];
        if (q) { query += ' AND (nome LIKE ? OR codigo LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
        if (baixo_estoque === '1') query += ' AND estoque <= estoque_minimo';
        query += ' ORDER BY nome';
        return res.json(db.prepare(query).all(...params));
    }

    // Sub-usuário: estoque = saldo próprio em estoque_usuario
    let query = `SELECT p.id, p.nome, p.descricao, p.codigo, p.preco_custo, p.preco_venda,
        p.estoque_minimo, p.unidade, p.ativo, p.criado_em, p.imagem, p.loja_id,
        COALESCE(eu.quantidade, 0) as estoque
        FROM produtos p
        LEFT JOIN estoque_usuario eu ON eu.produto_id = p.id AND eu.usuario_id = ?
        WHERE p.ativo = 1 AND p.loja_id = ?`;
    const params = [usuario_id, loja_id];
    if (q) { query += ' AND (p.nome LIKE ? OR p.codigo LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
    query += ' ORDER BY p.nome';
    res.json(db.prepare(query).all(...params));
});

router.get('/:id', (req, res) => {
    const { id: usuario_id, loja_id, principal } = req.user;

    if (principal) {
        const produto = db.prepare('SELECT * FROM produtos WHERE id = ? AND loja_id = ?').get(req.params.id, loja_id);
        if (!produto) return res.status(404).json({ error: 'Produto não encontrado' });
        const movs = db.prepare('SELECT * FROM movimentacoes_estoque WHERE produto_id = ? AND loja_id = ? ORDER BY data DESC LIMIT 30').all(req.params.id, loja_id);
        return res.json({ ...produto, movimentacoes: movs });
    }

    // Sub-usuário: estoque = saldo próprio
    const produto = db.prepare(`
        SELECT p.id, p.nome, p.descricao, p.codigo, p.preco_custo, p.preco_venda,
            p.estoque_minimo, p.unidade, p.ativo, p.criado_em, p.imagem, p.loja_id,
            COALESCE(eu.quantidade, 0) as estoque
        FROM produtos p
        LEFT JOIN estoque_usuario eu ON eu.produto_id = p.id AND eu.usuario_id = ?
        WHERE p.id = ? AND p.loja_id = ?
    `).get(usuario_id, req.params.id, loja_id);
    if (!produto) return res.status(404).json({ error: 'Produto não encontrado' });
    const movs = db.prepare('SELECT * FROM movimentacoes_estoque WHERE produto_id = ? AND usuario_id = ? ORDER BY data DESC LIMIT 30').all(req.params.id, usuario_id);
    res.json({ ...produto, movimentacoes: movs });
});

router.post('/', (req, res) => {
    if (!req.user.principal) return res.status(403).json({ error: 'Apenas o usuário principal pode criar produtos' });
    const loja_id = req.user.loja_id;
    const { nome, descricao, codigo, preco_custo, preco_venda, estoque, estoque_minimo, unidade, perguntar_estoque } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    try {
        const result = db.prepare(`
            INSERT INTO produtos (nome, descricao, codigo, preco_custo, preco_venda, estoque, estoque_minimo, unidade, loja_id, perguntar_estoque)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(nome, descricao||null, codigo||null, preco_custo||0, preco_venda||0, estoque||0, estoque_minimo||5, unidade||'un', loja_id, perguntar_estoque ? 1 : 0);
        res.status(201).json({ id: result.lastInsertRowid });
    } catch (e) {
        if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Código já cadastrado' });
        throw e;
    }
});

router.put('/:id', (req, res) => {
    if (!req.user.principal) return res.status(403).json({ error: 'Apenas o usuário principal pode editar produtos' });
    const loja_id = req.user.loja_id;
    const { nome, descricao, codigo, preco_custo, preco_venda, estoque, estoque_minimo, unidade, perguntar_estoque } = req.body;
    const p = db.prepare('SELECT * FROM produtos WHERE id = ? AND loja_id = ?').get(req.params.id, loja_id);
    if (!p) return res.status(404).json({ error: 'Produto não encontrado' });

    const estoqueAnterior = p.estoque;
    db.prepare(`UPDATE produtos SET nome=?,descricao=?,codigo=?,preco_custo=?,preco_venda=?,estoque=?,estoque_minimo=?,unidade=?,perguntar_estoque=? WHERE id=? AND loja_id=?`)
        .run(nome, descricao||null, codigo||null, preco_custo||0, preco_venda||0, estoque??p.estoque, estoque_minimo||5, unidade||'un', perguntar_estoque ? 1 : 0, req.params.id, loja_id);

    if (estoque !== undefined && estoque !== p.estoque) {
        db.prepare(`INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, estoque_anterior, estoque_posterior, observacao, usuario_id, loja_id)
            VALUES (?, 'ajuste', ?, ?, ?, 'Ajuste manual', ?, ?)`)
            .run(req.params.id, Math.abs(estoque - estoqueAnterior), estoqueAnterior, estoque, req.user?.id||null, loja_id);
        verificarEstoqueBaixo(parseInt(req.params.id));
    }
    res.json({ ok: true });
});

router.post('/:id/estoque', (req, res) => {
    if (!req.user.principal) return res.status(403).json({ error: 'Apenas o usuário principal pode ajustar estoque diretamente' });
    const loja_id = req.user.loja_id;
    const { quantidade, observacao } = req.body;
    const p = db.prepare('SELECT * FROM produtos WHERE id = ? AND loja_id = ?').get(req.params.id, loja_id);
    if (!p) return res.status(404).json({ error: 'Produto não encontrado' });
    const novoEstoque = p.estoque + parseInt(quantidade);
    db.prepare('UPDATE produtos SET estoque = ? WHERE id = ? AND loja_id = ?').run(novoEstoque, req.params.id, loja_id);
    db.prepare(`INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, estoque_anterior, estoque_posterior, observacao, usuario_id, loja_id)
        VALUES (?, 'entrada', ?, ?, ?, ?, ?, ?)`)
        .run(req.params.id, quantidade, p.estoque, novoEstoque, observacao||null, req.user?.id||null, loja_id);
    res.json({ ok: true, estoque: novoEstoque });
});

router.delete('/:id', (req, res) => {
    if (!req.user.principal) return res.status(403).json({ error: 'Apenas o usuário principal pode excluir produtos' });
    db.prepare('UPDATE produtos SET ativo = 0 WHERE id = ? AND loja_id = ?').run(req.params.id, req.user.loja_id);
    res.json({ ok: true });
});

router.put('/:id/imagem', (req, res) => {
    const loja_id = req.user.loja_id;
    const { imagem } = req.body;
    if (!imagem) return res.status(400).json({ error: 'Imagem é obrigatória' });
    const produto = db.prepare('SELECT * FROM produtos WHERE id = ? AND loja_id = ?').get(req.params.id, loja_id);
    if (!produto) return res.status(404).json({ error: 'Produto não encontrado' });

    const matches = imagem.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    if (!matches) return res.status(400).json({ error: 'Formato de imagem inválido' });
    ensureUploadsDir();
    if (produto.imagem) {
        const oldPath = path.join(__dirname, '../public', produto.imagem);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    const mimeType = matches[1];
    const ext = mimeType.includes('png') ? 'png' : mimeType.includes('gif') ? 'gif' : mimeType.includes('webp') ? 'webp' : 'jpg';
    const buffer = Buffer.from(matches[2], 'base64');
    const filename = `${req.params.id}_${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
    const imagemPath = `/uploads/produtos/${filename}`;
    db.prepare('UPDATE produtos SET imagem = ? WHERE id = ? AND loja_id = ?').run(imagemPath, req.params.id, loja_id);
    res.json({ ok: true, imagem: imagemPath });
});

router.delete('/:id/imagem', (req, res) => {
    const produto = db.prepare('SELECT * FROM produtos WHERE id = ? AND loja_id = ?').get(req.params.id, req.user.loja_id);
    if (!produto) return res.status(404).json({ error: 'Produto não encontrado' });
    if (produto.imagem) {
        const filepath = path.join(__dirname, '../public', produto.imagem);
        if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    }
    db.prepare('UPDATE produtos SET imagem = NULL WHERE id = ? AND loja_id = ?').run(req.params.id, req.user.loja_id);
    res.json({ ok: true });
});

module.exports = router;
