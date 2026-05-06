const express = require('express');
const router = express.Router();
const db = require('../database/db');
const wa = require('../services/whatsapp');

function gerarNumero() {
    const now = new Date();
    const yy = now.getFullYear().toString().slice(2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const count = db.prepare("SELECT COUNT(*) as c FROM orcamentos WHERE strftime('%Y-%m', criado_em) = ?").get(`${now.getFullYear()}-${mm}`);
    return `ORC${yy}${mm}${String(count.c + 1).padStart(4, '0')}`;
}

function fmtVal(v) { return 'R$ ' + parseFloat(v || 0).toFixed(2).replace('.', ','); }
function fmtData(dt) {
    if (!dt) return '-';
    const [y, m, d] = String(dt).slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
}
function dataValidade(criadoEm, dias) {
    const d = new Date(criadoEm);
    d.setDate(d.getDate() + parseInt(dias || 7));
    return d.toLocaleDateString('en-CA');
}

// GET /api/orcamentos
router.get('/', (req, res) => {
    const { status, q } = req.query;
    let query = `SELECT o.*, c.nome as cliente_nome, c.telefone as cliente_telefone,
        v.nome as vendedor_nome
        FROM orcamentos o
        LEFT JOIN clientes c ON o.cliente_id = c.id
        LEFT JOIN vendedores v ON o.vendedor_id = v.id
        WHERE 1=1`;
    const params = [];
    if (status) { query += ' AND o.status = ?'; params.push(status); }
    if (q) { query += ' AND (o.numero LIKE ? OR c.nome LIKE ? OR o.descricao LIKE ? OR o.cliente_nome_avulso LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`); }
    query += ' ORDER BY o.criado_em DESC';
    res.json(db.prepare(query).all(...params));
});

// GET /api/orcamentos/:id
router.get('/:id', (req, res) => {
    const orc = db.prepare(`SELECT o.*, c.nome as cliente_nome, c.telefone as cliente_telefone,
        v.nome as vendedor_nome
        FROM orcamentos o
        LEFT JOIN clientes c ON o.cliente_id = c.id
        LEFT JOIN vendedores v ON o.vendedor_id = v.id
        WHERE o.id = ?`).get(req.params.id);
    if (!orc) return res.status(404).json({ error: 'Orçamento não encontrado' });
    const itens = db.prepare('SELECT * FROM itens_orcamento WHERE orcamento_id = ? ORDER BY id').all(req.params.id);
    res.json({ ...orc, itens });
});

// POST /api/orcamentos
router.post('/', (req, res) => {
    const { cliente_id, cliente_nome_avulso, cliente_telefone_avulso, descricao, validade_dias, observacoes, vendedor_id, itens } = req.body;
    if (!descricao) return res.status(400).json({ error: 'Descrição é obrigatória' });
    const numero = gerarNumero();
    const total = (itens || []).reduce((s, i) => s + (i.quantidade * i.preco_unitario), 0);

    const tx = db.transaction(() => {
        const r = db.prepare(`
            INSERT INTO orcamentos (numero, cliente_id, cliente_nome_avulso, cliente_telefone_avulso, descricao, validade_dias, observacoes, vendedor_id, total, usuario_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(numero, cliente_id || null, cliente_nome_avulso || null, cliente_telefone_avulso || null, descricao, validade_dias || 7, observacoes || null, vendedor_id || null, total, req.user?.id || 1);

        if (itens && itens.length) {
            const stmt = db.prepare('INSERT INTO itens_orcamento (orcamento_id, produto_id, servico_id, descricao, quantidade, preco_unitario, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)');
            itens.forEach(it => stmt.run(r.lastInsertRowid, it.produto_id || null, it.servico_id || null, it.descricao, it.quantidade, it.preco_unitario, it.quantidade * it.preco_unitario));
        }
        return r.lastInsertRowid;
    });

    const id = tx();
    res.status(201).json({ id, numero });
});

// PUT /api/orcamentos/:id
router.put('/:id', (req, res) => {
    const orc = db.prepare('SELECT * FROM orcamentos WHERE id = ?').get(req.params.id);
    if (!orc) return res.status(404).json({ error: 'Orçamento não encontrado' });
    const { cliente_id, cliente_nome_avulso, cliente_telefone_avulso, descricao, validade_dias, observacoes, vendedor_id, itens, status } = req.body;
    const total = (itens || []).reduce((s, i) => s + (i.quantidade * i.preco_unitario), 0);

    db.transaction(() => {
        db.prepare(`UPDATE orcamentos SET cliente_id=?, cliente_nome_avulso=?, cliente_telefone_avulso=?, descricao=?, validade_dias=?, observacoes=?, vendedor_id=?, total=?, status=? WHERE id=?`)
            .run(cliente_id || null, cliente_nome_avulso || null, cliente_telefone_avulso || null, descricao, validade_dias || 7, observacoes || null, vendedor_id || null, total, status || orc.status, req.params.id);
        if (itens !== undefined) {
            db.prepare('DELETE FROM itens_orcamento WHERE orcamento_id = ?').run(req.params.id);
            const stmt = db.prepare('INSERT INTO itens_orcamento (orcamento_id, produto_id, servico_id, descricao, quantidade, preco_unitario, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)');
            (itens || []).forEach(it => stmt.run(req.params.id, it.produto_id || null, it.servico_id || null, it.descricao, it.quantidade, it.preco_unitario, it.quantidade * it.preco_unitario));
        }
    })();
    res.json({ ok: true });
});

// PATCH /api/orcamentos/:id/status
router.patch('/:id/status', (req, res) => {
    const { status } = req.body;
    if (!['pendente', 'aprovado', 'recusado', 'expirado'].includes(status)) return res.status(400).json({ error: 'Status inválido' });
    db.prepare('UPDATE orcamentos SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ ok: true });
});

// DELETE /api/orcamentos/:id
router.delete('/:id', (req, res) => {
    db.prepare('DELETE FROM itens_orcamento WHERE orcamento_id = ?').run(req.params.id);
    db.prepare('DELETE FROM orcamentos WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

// POST /api/orcamentos/:id/enviar  — envia via WhatsApp (texto, pdf ou ambos)
router.post('/:id/enviar', async (req, res) => {
    const { telefone, tipo } = req.body; // tipo: 'texto' | 'pdf' | 'ambos'
    if (!telefone) return res.status(400).json({ error: 'Telefone é obrigatório' });

    const orc = db.prepare(`SELECT o.*, c.nome as cliente_nome
        FROM orcamentos o LEFT JOIN clientes c ON o.cliente_id = c.id WHERE o.id = ?`).get(req.params.id);
    if (!orc) return res.status(404).json({ error: 'Orçamento não encontrado' });
    const itens = db.prepare('SELECT * FROM itens_orcamento WHERE orcamento_id = ? ORDER BY id').all(req.params.id);
    const cfg = db.prepare('SELECT chave, valor FROM configuracoes').all().reduce((o, r) => { o[r.chave] = r.valor; return o; }, {});

    const nomeCliente = orc.cliente_nome || orc.cliente_nome_avulso || '????';
    const validade = dataValidade(orc.criado_em, orc.validade_dias);
    const itensTexto = itens.length
        ? itens.map(it => `  ${it.servico_id ? '🔧' : '📦'} ${it.descricao}${it.quantidade > 1 ? ` x${it.quantidade}` : ''} — ${fmtVal(it.subtotal)}`).join('\n')
        : '  (sem itens detalhados)';

    const msgTexto = [
        `📋 *Orçamento ${orc.numero}*`,
        `${cfg.empresa_nome || 'Chaveiro'}`,
        ``,
        `👤 *Cliente:* ${nomeCliente}`,
        `📅 *Válido até:* ${fmtData(validade)}`,
        ``,
        `*Itens:*`,
        itensTexto,
        ``,
        `💰 *Total: ${fmtVal(orc.total)}*`,
        orc.observacoes ? `\n📝 *Obs:* ${orc.observacoes}` : '',
        ``,
        `Para aprovar ou mais informações, entre em contato!`,
        cfg.empresa_telefone ? `📞 ${cfg.empresa_telefone}` : '',
    ].filter(l => l !== undefined).join('\n').replace(/\n{3,}/g, '\n\n');

    try {
        if (tipo === 'texto' || tipo === 'ambos') {
            await wa.enviarMensagem(telefone, msgTexto);
        }
        if (tipo === 'pdf' || tipo === 'ambos') {
            const { gerarBufferPdfOrcamento } = require('./pdf');
            const buffer = await gerarBufferPdfOrcamento(req.params.id);
            await wa.enviarArquivo(telefone, 'application/pdf', buffer.toString('base64'), `Orcamento-${orc.numero}.pdf`, `📋 Orçamento ${orc.numero} — ${fmtVal(orc.total)}`);
        }
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
