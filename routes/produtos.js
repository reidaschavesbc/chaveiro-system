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

// GET /api/produtos
router.get('/', (req, res) => {
    const { q, baixo_estoque } = req.query;
    let query = 'SELECT * FROM produtos WHERE ativo = 1';
    const params = [];
    if (q) {
        query += ' AND (nome LIKE ? OR codigo LIKE ?)';
        params.push(`%${q}%`, `%${q}%`);
    }
    if (baixo_estoque === '1') {
        query += ' AND estoque <= estoque_minimo';
    }
    query += ' ORDER BY nome';
    res.json(db.prepare(query).all(...params));
});

// GET /api/produtos/:id
router.get('/:id', (req, res) => {
    const produto = db.prepare('SELECT * FROM produtos WHERE id = ?').get(req.params.id);
    if (!produto) return res.status(404).json({ error: 'Produto não encontrado' });
    const movs = db.prepare('SELECT * FROM movimentacoes_estoque WHERE produto_id = ? ORDER BY data DESC LIMIT 30').all(req.params.id);
    res.json({ ...produto, movimentacoes: movs });
});

// POST /api/produtos
router.post('/', (req, res) => {
    const { nome, descricao, codigo, preco_custo, preco_venda, estoque, estoque_minimo, unidade } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    try {
        const result = db.prepare(`
      INSERT INTO produtos (nome, descricao, codigo, preco_custo, preco_venda, estoque, estoque_minimo, unidade)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(nome, descricao || null, codigo || null, preco_custo || 0, preco_venda || 0, estoque || 0, estoque_minimo || 5, unidade || 'un');
        res.status(201).json({ id: result.lastInsertRowid });
    } catch (e) {
        if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Código já cadastrado' });
        throw e;
    }
});

// PUT /api/produtos/:id
router.put('/:id', (req, res) => {
    const { nome, descricao, codigo, preco_custo, preco_venda, estoque, estoque_minimo, unidade } = req.body;
    const p = db.prepare('SELECT * FROM produtos WHERE id = ?').get(req.params.id);
    if (!p) return res.status(404).json({ error: 'Produto não encontrado' });

    const estoqueAnterior = p.estoque;
    db.prepare(`UPDATE produtos SET nome=?, descricao=?, codigo=?, preco_custo=?, preco_venda=?, estoque=?, estoque_minimo=?, unidade=? WHERE id=?`)
        .run(nome, descricao || null, codigo || null, preco_custo || 0, preco_venda || 0, estoque ?? p.estoque, estoque_minimo || 5, unidade || 'un', req.params.id);

    if (estoque !== undefined && estoque !== p.estoque) {
        db.prepare(`INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, estoque_anterior, estoque_posterior, observacao, usuario_id)
      VALUES (?, 'ajuste', ?, ?, ?, 'Ajuste manual', ?)`).run(req.params.id, Math.abs(estoque - estoqueAnterior), estoqueAnterior, estoque, req.user?.id || 1);
        verificarEstoqueBaixo(parseInt(req.params.id));
    }
    res.json({ ok: true });
});

// POST /api/produtos/:id/estoque - entrada de estoque
router.post('/:id/estoque', (req, res) => {
    const { quantidade, observacao } = req.body;
    const p = db.prepare('SELECT * FROM produtos WHERE id = ?').get(req.params.id);
    if (!p) return res.status(404).json({ error: 'Produto não encontrado' });
    const novoEstoque = p.estoque + parseInt(quantidade);
    db.prepare('UPDATE produtos SET estoque = ? WHERE id = ?').run(novoEstoque, req.params.id);
    db.prepare(`INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, estoque_anterior, estoque_posterior, observacao, usuario_id)
    VALUES (?, 'entrada', ?, ?, ?, ?, ?)`).run(req.params.id, quantidade, p.estoque, novoEstoque, observacao || null, req.user?.id || 1);
    res.json({ ok: true, estoque: novoEstoque });
});

// DELETE /api/produtos/:id
router.delete('/:id', (req, res) => {
    db.prepare('UPDATE produtos SET ativo = 0 WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

// PUT /api/produtos/:id/imagem - salva imagem (base64)
router.put('/:id/imagem', (req, res) => {
    const { imagem } = req.body;
    if (!imagem) return res.status(400).json({ error: 'Imagem é obrigatória' });
    const produto = db.prepare('SELECT * FROM produtos WHERE id = ?').get(req.params.id);
    if (!produto) return res.status(404).json({ error: 'Produto não encontrado' });

    const matches = imagem.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    if (!matches) return res.status(400).json({ error: 'Formato de imagem inválido' });

    ensureUploadsDir();

    // Remove imagem antiga se existir
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
    db.prepare('UPDATE produtos SET imagem = ? WHERE id = ?').run(imagemPath, req.params.id);
    res.json({ ok: true, imagem: imagemPath });
});

// DELETE /api/produtos/:id/imagem - remove imagem
router.delete('/:id/imagem', (req, res) => {
    const produto = db.prepare('SELECT * FROM produtos WHERE id = ?').get(req.params.id);
    if (!produto) return res.status(404).json({ error: 'Produto não encontrado' });
    if (produto.imagem) {
        const filepath = path.join(__dirname, '../public', produto.imagem);
        if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    }
    db.prepare('UPDATE produtos SET imagem = NULL WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

module.exports = router;
