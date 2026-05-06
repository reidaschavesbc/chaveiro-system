const express = require('express');
const router = express.Router();
const db = require('../database/db');

// GET /api/vales?vendedor_id=X&mes=Y&ano=Z
router.get('/', (req, res) => {
    const { vendedor_id, mes, ano } = req.query;
    let query = `
        SELECT v.*, vd.nome as vendedor_nome
        FROM vales v
        JOIN vendedores vd ON vd.id = v.vendedor_id
        WHERE 1=1
    `;
    const params = [];
    if (vendedor_id) { query += ' AND v.vendedor_id = ?'; params.push(vendedor_id); }
    if (mes && ano) {
        const inicio = `${ano}-${String(mes).padStart(2,'0')}-01`;
        const fim    = `${ano}-${String(mes).padStart(2,'0')}-31`;
        query += ' AND v.data >= ? AND v.data <= ?';
        params.push(inicio, fim);
    }
    query += ' ORDER BY v.data DESC, v.criado_em DESC';
    res.json(db.prepare(query).all(...params));
});

// GET /api/vales/resumo?mes=X&ano=Y — total por vendedor no período
router.get('/resumo', (req, res) => {
    const { mes, ano } = req.query;
    if (!mes || !ano) return res.json([]);
    const inicio = `${ano}-${String(mes).padStart(2,'0')}-01`;
    const fim    = `${ano}-${String(mes).padStart(2,'0')}-31`;
    const rows = db.prepare(`
        SELECT v.vendedor_id, vd.nome as vendedor_nome, SUM(v.valor) as total_vales
        FROM vales v
        JOIN vendedores vd ON vd.id = v.vendedor_id
        WHERE v.data >= ? AND v.data <= ?
        GROUP BY v.vendedor_id
    `).all(inicio, fim);
    res.json(rows);
});

// POST /api/vales
router.post('/', (req, res) => {
    const { vendedor_id, valor, descricao, data } = req.body;
    if (!vendedor_id) return res.status(400).json({ error: 'Funcionário é obrigatório' });
    if (!valor || valor <= 0) return res.status(400).json({ error: 'Valor inválido' });
    const vend = db.prepare('SELECT id FROM vendedores WHERE id = ? AND ativo = 1').get(vendedor_id);
    if (!vend) return res.status(404).json({ error: 'Funcionário não encontrado' });
    const result = db.prepare(`
        INSERT INTO vales (vendedor_id, valor, descricao, data, usuario_id)
        VALUES (?, ?, ?, ?, ?)
    `).run(vendedor_id, valor, descricao || null, data || new Date().toLocaleDateString('en-CA'), req.user?.id || 1);
    res.status(201).json({ id: result.lastInsertRowid });
});

// DELETE /api/vales/:id
router.delete('/:id', (req, res) => {
    const vale = db.prepare('SELECT * FROM vales WHERE id = ?').get(req.params.id);
    if (!vale) return res.status(404).json({ error: 'Vale não encontrado' });
    if (vale.fechamento_id) return res.status(400).json({ error: 'Vale já incluído em um fechamento, não pode ser excluído' });
    db.prepare('DELETE FROM vales WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

module.exports = router;
