const express = require('express');
const router = express.Router();
const db = require('../database/db');

router.get('/', (req, res) => {
    const loja_id = req.user.loja_id;
    const { q } = req.query;
    let rows;
    if (q) {
        const like = `%${q}%`;
        rows = db.prepare(`SELECT * FROM clientes WHERE ativo = 1 AND loja_id = ? AND (nome LIKE ? OR nome_fantasia LIKE ? OR cpf LIKE ? OR telefone LIKE ? OR email LIKE ?) ORDER BY nome`).all(loja_id, like, like, like, like, like);
    } else {
        rows = db.prepare('SELECT * FROM clientes WHERE ativo = 1 AND loja_id = ? ORDER BY nome').all(loja_id);
    }
    res.json(rows);
});

router.get('/:id', (req, res) => {
    const loja_id = req.user.loja_id;
    const cliente = db.prepare('SELECT * FROM clientes WHERE id = ? AND loja_id = ?').get(req.params.id, loja_id);
    if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });

    const ordens = db.prepare(`SELECT os.*, ts.nome as servico_nome FROM ordens_servico os
        LEFT JOIN tipos_servico ts ON os.tipo_servico_id = ts.id
        WHERE os.cliente_id = ? AND os.loja_id = ? ORDER BY os.data_entrada DESC LIMIT 20`).all(req.params.id, loja_id);

    const vendas = db.prepare('SELECT * FROM vendas WHERE cliente_id = ? AND loja_id = ? ORDER BY data DESC LIMIT 20').all(req.params.id, loja_id);

    res.json({ ...cliente, ordens, vendas });
});

router.post('/', (req, res) => {
    const loja_id = req.user.loja_id;
    const { nome, nome_fantasia, cpf, cnpj, telefone, email, cep, endereco, numero, complemento, bairro, cidade, referencia, observacoes } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });

    const result = db.prepare(`
        INSERT INTO clientes (nome, nome_fantasia, cpf, cnpj, telefone, email, cep, endereco, numero, complemento, bairro, cidade, referencia, observacoes, loja_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(nome, nome_fantasia||null, cpf||null, cnpj||null, telefone||null, email||null, cep||null, endereco||null, numero||null, complemento||null, bairro||null, cidade||null, referencia||null, observacoes||null, loja_id);

    res.status(201).json({ id: result.lastInsertRowid, nome });
});

router.put('/:id', (req, res) => {
    const loja_id = req.user.loja_id;
    const { nome, nome_fantasia, cpf, cnpj, telefone, email, cep, endereco, numero, complemento, bairro, cidade, referencia, observacoes } = req.body;
    const exists = db.prepare('SELECT id FROM clientes WHERE id = ? AND loja_id = ?').get(req.params.id, loja_id);
    if (!exists) return res.status(404).json({ error: 'Cliente não encontrado' });

    db.prepare(`UPDATE clientes SET nome=?,nome_fantasia=?,cpf=?,cnpj=?,telefone=?,email=?,cep=?,endereco=?,numero=?,complemento=?,bairro=?,cidade=?,referencia=?,observacoes=? WHERE id=? AND loja_id=?`)
        .run(nome, nome_fantasia||null, cpf||null, cnpj||null, telefone||null, email||null, cep||null, endereco||null, numero||null, complemento||null, bairro||null, cidade||null, referencia||null, observacoes||null, req.params.id, loja_id);

    res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
    db.prepare('UPDATE clientes SET ativo = 0 WHERE id = ? AND loja_id = ?').run(req.params.id, req.user.loja_id);
    res.json({ ok: true });
});

router.get('/:id/autorizados', (req, res) => {
    const rows = db.prepare('SELECT * FROM clientes_autorizados WHERE cliente_id = ? AND ativo = 1 ORDER BY nome').all(req.params.id);
    res.json(rows);
});

router.post('/:id/autorizados', (req, res) => {
    const { nome, telefone, cargo } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    const result = db.prepare('INSERT INTO clientes_autorizados (cliente_id, nome, telefone, cargo, loja_id) VALUES (?, ?, ?, ?, ?)')
        .run(req.params.id, nome.trim(), telefone||null, cargo||null, req.user.loja_id);
    res.status(201).json({ id: result.lastInsertRowid });
});

router.delete('/:id/autorizados/:autId', (req, res) => {
    db.prepare('UPDATE clientes_autorizados SET ativo = 0 WHERE id = ? AND cliente_id = ?').run(req.params.autId, req.params.id);
    res.json({ ok: true });
});

module.exports = router;
