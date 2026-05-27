const express = require('express');
const router = express.Router();
const db = require('../database/db');
const bcrypt = require('bcryptjs');

function verificarSenhaGerente(senha, hash) {
    if (!hash) return true;
    if (hash.startsWith('$2')) return bcrypt.compareSync(senha, hash);
    return senha === hash;
}

const CATEGORIAS = ['material', 'combustivel', 'alimentacao', 'manutencao', 'servicos', 'outros'];
const FORMAS_PAG = ['dinheiro', 'cartao', 'pix'];

router.get('/', (req, res) => {
    const loja_id = req.user.loja_id;
    const { data_inicio, data_fim, categoria } = req.query;
    const hoje = new Date().toLocaleDateString('en-CA');
    const di = data_inicio || hoje.slice(0, 7) + '-01';
    const df = data_fim || hoje;

    let sql = `SELECT * FROM gastos WHERE loja_id = ? AND date(data) BETWEEN ? AND ?`;
    const params = [loja_id, di, df];
    if (categoria) { sql += ` AND categoria = ?`; params.push(categoria); }
    sql += ` ORDER BY data DESC, id DESC`;

    const gastos = db.prepare(sql).all(...params);
    const total = gastos.reduce((s, g) => s + g.valor, 0);

    let catSql = `SELECT categoria, COALESCE(SUM(valor), 0) as total, COUNT(*) as qtd FROM gastos WHERE loja_id = ? AND date(data) BETWEEN ? AND ?`;
    const catParams = [loja_id, di, df];
    if (categoria) { catSql += ` AND categoria = ?`; catParams.push(categoria); }
    catSql += ` GROUP BY categoria ORDER BY total DESC`;

    const por_categoria = db.prepare(catSql).all(...catParams);
    res.json({ gastos, total, por_categoria, data_inicio: di, data_fim: df });
});

router.post('/', (req, res) => {
    const { descricao, valor, categoria, forma_pagamento, data, observacoes } = req.body;
    if (!descricao?.trim()) return res.status(400).json({ error: 'Descrição é obrigatória' });
    const v = parseFloat(valor);
    if (!v || v <= 0) return res.status(400).json({ error: 'Valor deve ser maior que zero' });

    const cat = CATEGORIAS.includes(categoria) ? categoria : 'outros';
    const fp  = FORMAS_PAG.includes(forma_pagamento) ? forma_pagamento : 'dinheiro';
    const dataGasto = data || new Date().toLocaleDateString('en-CA');

    const result = db.prepare(
        `INSERT INTO gastos (descricao, valor, categoria, forma_pagamento, data, observacoes, loja_id) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(descricao.trim(), v, cat, fp, dataGasto, observacoes?.trim()||null, req.user.loja_id);

    res.json({ id: result.lastInsertRowid, ok: true });
});

router.put('/:id', (req, res) => {
    const loja_id = req.user.loja_id;
    const g = db.prepare('SELECT id FROM gastos WHERE id = ? AND loja_id = ?').get(req.params.id, loja_id);
    if (!g) return res.status(404).json({ error: 'Gasto não encontrado' });

    const { descricao, valor, categoria, forma_pagamento, data, observacoes } = req.body;
    if (!descricao?.trim()) return res.status(400).json({ error: 'Descrição é obrigatória' });
    const v = parseFloat(valor);
    if (!v || v <= 0) return res.status(400).json({ error: 'Valor deve ser maior que zero' });

    const cat = CATEGORIAS.includes(categoria) ? categoria : 'outros';
    const fp  = FORMAS_PAG.includes(forma_pagamento) ? forma_pagamento : 'dinheiro';
    db.prepare(`UPDATE gastos SET descricao=?,valor=?,categoria=?,forma_pagamento=?,data=?,observacoes=? WHERE id=? AND loja_id=?`)
        .run(descricao.trim(), v, cat, fp, data, observacoes?.trim()||null, req.params.id, loja_id);

    res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
    const loja_id = req.user.loja_id;
    const g = db.prepare('SELECT id FROM gastos WHERE id = ? AND loja_id = ?').get(req.params.id, loja_id);
    if (!g) return res.status(404).json({ error: 'Gasto não encontrado' });
    db.prepare('DELETE FROM gastos WHERE id = ? AND loja_id = ?').run(req.params.id, loja_id);
    res.json({ ok: true });
});

module.exports = router;
