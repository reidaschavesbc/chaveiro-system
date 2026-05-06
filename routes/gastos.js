const express = require('express');
const router = express.Router();
const db = require('../database/db');

const CATEGORIAS = ['material', 'combustivel', 'alimentacao', 'manutencao', 'servicos', 'outros'];

// GET /api/gastos
router.get('/', (req, res) => {
    const { data_inicio, data_fim, categoria } = req.query;
    const hoje = new Date().toLocaleDateString('en-CA');
    const di = data_inicio || hoje.slice(0, 7) + '-01';
    const df = data_fim || hoje;

    let sql = `SELECT * FROM gastos WHERE date(data) BETWEEN ? AND ?`;
    const params = [di, df];
    if (categoria) { sql += ` AND categoria = ?`; params.push(categoria); }
    sql += ` ORDER BY data DESC, id DESC`;

    const gastos = db.prepare(sql).all(...params);
    const total = gastos.reduce((s, g) => s + g.valor, 0);

    let catSql = `SELECT categoria, COALESCE(SUM(valor), 0) as total, COUNT(*) as qtd FROM gastos WHERE date(data) BETWEEN ? AND ?`;
    const catParams = [di, df];
    if (categoria) { catSql += ` AND categoria = ?`; catParams.push(categoria); }
    catSql += ` GROUP BY categoria ORDER BY total DESC`;

    const por_categoria = db.prepare(catSql).all(...catParams);

    res.json({ gastos, total, por_categoria, data_inicio: di, data_fim: df });
});

// POST /api/gastos
router.post('/', (req, res) => {
    const { descricao, valor, categoria, data, observacoes } = req.body;
    if (!descricao?.trim()) return res.status(400).json({ error: 'Descrição é obrigatória' });
    const v = parseFloat(valor);
    if (!v || v <= 0) return res.status(400).json({ error: 'Valor deve ser maior que zero' });

    const cat = CATEGORIAS.includes(categoria) ? categoria : 'outros';
    const dataGasto = data || new Date().toLocaleDateString('en-CA');

    const result = db.prepare(
        `INSERT INTO gastos (descricao, valor, categoria, data, observacoes) VALUES (?, ?, ?, ?, ?)`
    ).run(descricao.trim(), v, cat, dataGasto, observacoes?.trim() || null);

    res.json({ id: result.lastInsertRowid, ok: true });
});

// PUT /api/gastos/:id
router.put('/:id', (req, res) => {
    const g = db.prepare('SELECT id FROM gastos WHERE id = ?').get(req.params.id);
    if (!g) return res.status(404).json({ error: 'Gasto não encontrado' });

    const { descricao, valor, categoria, data, observacoes } = req.body;
    if (!descricao?.trim()) return res.status(400).json({ error: 'Descrição é obrigatória' });
    const v = parseFloat(valor);
    if (!v || v <= 0) return res.status(400).json({ error: 'Valor deve ser maior que zero' });

    const cat = CATEGORIAS.includes(categoria) ? categoria : 'outros';

    db.prepare(
        `UPDATE gastos SET descricao = ?, valor = ?, categoria = ?, data = ?, observacoes = ? WHERE id = ?`
    ).run(descricao.trim(), v, cat, data, observacoes?.trim() || null, req.params.id);

    res.json({ ok: true });
});

// DELETE /api/gastos/:id
router.delete('/:id', (req, res) => {
    const { senha } = req.body;
    const cfg = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'senha_gerente'").get();
    if (!cfg || !cfg.valor) return res.status(403).json({ error: 'Configure a senha do gerente primeiro (Configurações)' });
    if (senha !== cfg.valor) return res.status(403).json({ error: 'Senha incorreta' });

    const g = db.prepare('SELECT id FROM gastos WHERE id = ?').get(req.params.id);
    if (!g) return res.status(404).json({ error: 'Gasto não encontrado' });

    db.prepare('DELETE FROM gastos WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

module.exports = router;
