const express = require('express');
const router = express.Router();
const db = require('../database/db');

router.get('/', (req, res) => {
    const loja_id = req.user.loja_id;
    const { status } = req.query;
    let sql = `SELECT * FROM lembretes WHERE loja_id = ?`;
    const params = [loja_id];
    if (status) { sql += ` AND status = ?`; params.push(status); }
    sql += ` ORDER BY data_envio DESC`;

    const lembretes = db.prepare(sql).all(...params);
    const vendedores = db.prepare(`SELECT id, nome, telefone FROM vendedores WHERE ativo = 1 AND loja_id = ? ORDER BY nome`).all(loja_id);

    const result = lembretes.map(l => {
        let destinatarios_nomes;
        if (l.destinatarios === 'todos') {
            destinatarios_nomes = 'Todos os funcionários';
        } else {
            const ids = l.destinatarios.split(',').map(Number);
            const nomes = vendedores.filter(v => ids.includes(v.id)).map(v => v.nome);
            destinatarios_nomes = nomes.length ? nomes.join(', ') : '—';
        }
        return { ...l, destinatarios_nomes };
    });

    res.json({ lembretes: result, vendedores });
});

router.post('/', (req, res) => {
    const { mensagem, data_envio, destinatarios } = req.body;
    if (!mensagem?.trim()) return res.status(400).json({ error: 'Mensagem é obrigatória' });
    if (!data_envio) return res.status(400).json({ error: 'Data e hora são obrigatórias' });
    const dest = destinatarios === 'todos' || !destinatarios ? 'todos' : destinatarios;
    const r = db.prepare(`INSERT INTO lembretes (mensagem, data_envio, destinatarios, loja_id) VALUES (?, ?, ?, ?)`)
        .run(mensagem.trim(), data_envio, dest, req.user.loja_id);
    res.json({ id: r.lastInsertRowid, ok: true });
});

router.delete('/:id', (req, res) => {
    const l = db.prepare('SELECT * FROM lembretes WHERE id = ? AND loja_id = ?').get(req.params.id, req.user.loja_id);
    if (!l) return res.status(404).json({ error: 'Lembrete não encontrado' });
    if (l.status === 'pendente') {
        db.prepare(`UPDATE lembretes SET status = 'cancelado' WHERE id = ?`).run(req.params.id);
        res.json({ ok: true, acao: 'cancelado' });
    } else {
        db.prepare('DELETE FROM lembretes WHERE id = ?').run(req.params.id);
        res.json({ ok: true, acao: 'excluido' });
    }
});

module.exports = router;
