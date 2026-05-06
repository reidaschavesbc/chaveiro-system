const express = require('express');
const router = express.Router();
const db = require('../database/db');

// GET /api/clientes
router.get('/', (req, res) => {
    const { q } = req.query;
    let rows;
    if (q) {
        const like = `%${q}%`;
        rows = db.prepare(`SELECT * FROM clientes WHERE ativo = 1 AND (nome LIKE ? OR cpf LIKE ? OR telefone LIKE ? OR email LIKE ?) ORDER BY nome`).all(like, like, like, like);
    } else {
        rows = db.prepare('SELECT * FROM clientes WHERE ativo = 1 ORDER BY nome').all();
    }
    res.json(rows);
});

// GET /api/clientes/:id
router.get('/:id', (req, res) => {
    const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
    if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });

    const ordens = db.prepare(`SELECT os.*, ts.nome as servico_nome FROM ordens_servico os
    LEFT JOIN tipos_servico ts ON os.tipo_servico_id = ts.id
    WHERE os.cliente_id = ? ORDER BY os.data_entrada DESC LIMIT 20`).all(req.params.id);

    const vendas = db.prepare('SELECT * FROM vendas WHERE cliente_id = ? ORDER BY data DESC LIMIT 20').all(req.params.id);

    res.json({ ...cliente, ordens, vendas });
});

// POST /api/clientes
router.post('/', (req, res) => {
    const { nome, cpf, cnpj, telefone, email, cep, endereco, numero, complemento, bairro, cidade, referencia, observacoes } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });

    const result = db.prepare(`
    INSERT INTO clientes (nome, cpf, cnpj, telefone, email, cep, endereco, numero, complemento, bairro, cidade, referencia, observacoes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(nome, cpf || null, cnpj || null, telefone || null, email || null, cep || null, endereco || null, numero || null, complemento || null, bairro || null, cidade || null, referencia || null, observacoes || null);

    res.status(201).json({ id: result.lastInsertRowid, nome });
});

// PUT /api/clientes/:id
router.put('/:id', (req, res) => {
    const { nome, cpf, cnpj, telefone, email, cep, endereco, numero, complemento, bairro, cidade, referencia, observacoes } = req.body;
    const exists = db.prepare('SELECT id FROM clientes WHERE id = ?').get(req.params.id);
    if (!exists) return res.status(404).json({ error: 'Cliente não encontrado' });

    db.prepare(`UPDATE clientes SET nome=?, cpf=?, cnpj=?, telefone=?, email=?, cep=?, endereco=?, numero=?, complemento=?, bairro=?, cidade=?, referencia=?, observacoes=? WHERE id=?`)
        .run(nome, cpf || null, cnpj || null, telefone || null, email || null, cep || null, endereco || null, numero || null, complemento || null, bairro || null, cidade || null, referencia || null, observacoes || null, req.params.id);

    res.json({ ok: true });
});

// DELETE /api/clientes/:id (soft delete)
router.delete('/:id', (req, res) => {
    db.prepare('UPDATE clientes SET ativo = 0 WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

// GET /api/clientes/:id/autorizados
router.get('/:id/autorizados', (req, res) => {
    const rows = db.prepare('SELECT * FROM clientes_autorizados WHERE cliente_id = ? AND ativo = 1 ORDER BY nome').all(req.params.id);
    res.json(rows);
});

// POST /api/clientes/:id/autorizados
router.post('/:id/autorizados', (req, res) => {
    const { nome, telefone, cargo } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    const result = db.prepare('INSERT INTO clientes_autorizados (cliente_id, nome, telefone, cargo) VALUES (?, ?, ?, ?)')
        .run(req.params.id, nome.trim(), telefone || null, cargo || null);
    res.status(201).json({ id: result.lastInsertRowid });
});

// DELETE /api/clientes/:id/autorizados/:autId
router.delete('/:id/autorizados/:autId', (req, res) => {
    db.prepare('UPDATE clientes_autorizados SET ativo = 0 WHERE id = ? AND cliente_id = ?').run(req.params.autId, req.params.id);
    res.json({ ok: true });
});

module.exports = router;
