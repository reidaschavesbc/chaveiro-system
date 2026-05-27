const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../database/db');

function apenasAdmin(req, res, next) {
    if (req.user.perfil !== 'admin') return res.status(403).json({ error: 'Acesso restrito a administradores' });
    next();
}

function whereLoja(lojaId, alias) {
    if (lojaId == null) return { cond: '', params: [] };
    const col = alias ? `${alias}.loja_id` : 'loja_id';
    return { cond: ` AND ${col} = ?`, params: [lojaId] };
}

// GET /api/ponto/funcionarios — lista funcionários ativos para a tela de hoje
router.get('/funcionarios', (req, res) => {
    const { cond, params } = whereLoja(req.user.loja_id);
    const rows = db.prepare(`
        SELECT id, nome FROM vendedores
        WHERE ativo = 1${cond}
        ORDER BY nome ASC
    `).all(...params);
    res.json(rows);
});

// GET /api/ponto/hoje — status de hoje (admin vê todos, operador vê só ele)
router.get('/hoje', (req, res) => {
    const lojaId = req.user.loja_id;
    const hoje = new Date().toISOString().slice(0, 10);

    const { cond, params } = whereLoja(lojaId);
    const funcionarios = db.prepare(`
        SELECT id, nome FROM vendedores
        WHERE ativo = 1 AND senha_ponto IS NOT NULL${cond}
        ORDER BY nome ASC
    `).all(...params);

    const { cond: cP, params: pP } = whereLoja(lojaId, 'p');
    const registros = db.prepare(`
        SELECT p.id, p.vendedor_id, p.tipo, p.data_hora
        FROM ponto p
        JOIN vendedores v ON v.id = p.vendedor_id
        WHERE date(p.data_hora) = ? AND p.vendedor_id IS NOT NULL AND v.senha_ponto IS NOT NULL${cP}
        ORDER BY p.data_hora ASC
    `).all(hoje, ...pP);

    const porFuncionario = {};
    for (const f of funcionarios) {
        porFuncionario[f.id] = { id: f.id, nome: f.nome, registros: [] };
    }
    for (const r of registros) {
        if (porFuncionario[r.vendedor_id]) {
            porFuncionario[r.vendedor_id].registros.push(r);
        }
    }

    res.json(Object.values(porFuncionario));
});

// POST /api/ponto/registrar — admin registra ponto para um funcionário
router.post('/registrar', (req, res) => {
    const { usuario_id, tipo } = req.body;

    const TIPOS = ['entrada', 'saida_almoco', 'retorno_almoco', 'saida'];
    if (!TIPOS.includes(tipo)) return res.status(400).json({ error: 'Tipo de registro inválido' });
    if (!usuario_id) return res.status(400).json({ error: 'Funcionário não informado' });

    const func = db.prepare('SELECT id, nome, loja_id FROM vendedores WHERE id = ? AND ativo = 1').get(usuario_id);
    if (!func) return res.status(404).json({ error: 'Funcionário não encontrado' });
    if (req.user.loja_id != null && func.loja_id !== req.user.loja_id) return res.status(403).json({ error: 'Acesso negado' });

    const dataHora = new Date().toLocaleString('sv', { timeZone: 'America/Sao_Paulo' }).replace('T', ' ').slice(0, 16);
    const result = db.prepare(`
        INSERT INTO ponto (vendedor_id, usuario_id, tipo, data_hora, registrado_por, loja_id)
        VALUES (?, NULL, ?, ?, ?, ?)
    `).run(func.id, tipo, dataHora, req.user.id, func.loja_id);

    res.json({ id: result.lastInsertRowid, ok: true, nome: func.nome, tipo, data_hora: dataHora });
});

// POST /api/ponto/liberar-todos — admin registra saída para todos que não saíram
router.post('/liberar-todos', apenasAdmin, (req, res) => {
    const lojaId = req.user.loja_id;
    const hoje = new Date().toISOString().slice(0, 10);
    const dataHora = new Date().toLocaleString('sv', { timeZone: 'America/Sao_Paulo' }).replace('T', ' ').slice(0, 16);

    const { cond, params } = whereLoja(lojaId);
    const funcionarios = db.prepare(`
        SELECT id, loja_id FROM vendedores WHERE ativo = 1${cond}
    `).all(...params);

    let liberados = 0;
    const inserir = db.prepare(`
        INSERT INTO ponto (vendedor_id, usuario_id, tipo, data_hora, registrado_por, loja_id)
        VALUES (?, ?, 'saida', ?, ?, ?)
    `);

    const liberarTodos = db.transaction(() => {
        for (const f of funcionarios) {
            const { cond: cP, params: pP } = whereLoja(f.loja_id, '');
            const ultimo = db.prepare(`
                SELECT tipo FROM ponto
                WHERE vendedor_id = ? AND date(data_hora) = ?${cP}
                ORDER BY data_hora DESC LIMIT 1
            `).get(f.id, hoje, ...pP);

            if (ultimo && ultimo.tipo !== 'saida') {
                inserir.run(f.id, f.id, dataHora, req.user.id, f.loja_id);
                liberados++;
            }
        }
    });

    liberarTodos();
    res.json({ ok: true, liberados });
});

// GET /api/ponto/relatorio — relatório por período
router.get('/relatorio', apenasAdmin, (req, res) => {
    const lojaId = req.user.loja_id;
    const { data_inicio, data_fim, usuario_id } = req.query;

    if (!data_inicio || !data_fim) return res.status(400).json({ error: 'Período obrigatório' });

    const { cond, params } = whereLoja(lojaId, 'p');
    let sql = `
        SELECT p.id, p.vendedor_id AS usuario_id, v.nome, p.tipo, p.data_hora, p.registrado_por,
               adm.nome AS adm_nome
        FROM ponto p
        JOIN vendedores v ON v.id = p.vendedor_id
        LEFT JOIN usuarios adm ON adm.id = p.registrado_por
        WHERE date(p.data_hora) BETWEEN ? AND ? AND p.vendedor_id IS NOT NULL${cond}
    `;
    const allParams = [data_inicio, data_fim, ...params];

    if (usuario_id) { sql += ' AND p.vendedor_id = ?'; allParams.push(usuario_id); }
    sql += ' ORDER BY p.vendedor_id, p.data_hora ASC';

    const registros = db.prepare(sql).all(...allParams);
    res.json(registros);
});

// DELETE /api/ponto/:id — admin remove um registro
router.delete('/:id', apenasAdmin, (req, res) => {
    const reg = db.prepare('SELECT id, loja_id FROM ponto WHERE id = ?').get(req.params.id);
    if (!reg) return res.status(404).json({ error: 'Registro não encontrado' });
    if (req.user.loja_id != null && reg.loja_id !== req.user.loja_id) return res.status(403).json({ error: 'Acesso negado' });
    db.prepare('DELETE FROM ponto WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

// PUT /api/ponto/:id — admin corrige data_hora ou tipo
router.put('/:id', apenasAdmin, (req, res) => {
    const { data_hora, tipo } = req.body;
    const reg = db.prepare('SELECT id, loja_id FROM ponto WHERE id = ?').get(req.params.id);
    if (!reg) return res.status(404).json({ error: 'Registro não encontrado' });
    if (req.user.loja_id != null && reg.loja_id !== req.user.loja_id) return res.status(403).json({ error: 'Acesso negado' });
    db.prepare('UPDATE ponto SET data_hora = COALESCE(?, data_hora), tipo = COALESCE(?, tipo) WHERE id = ?')
        .run(data_hora || null, tipo || null, req.params.id);
    res.json({ ok: true });
});

// PUT /api/ponto/funcionario/:id/pin — define PIN do funcionário
router.put('/funcionario/:id/pin', (req, res) => {
    const { pin } = req.body;
    if (!pin || !/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: 'PIN deve ter 4 a 6 dígitos numéricos' });
    const func = db.prepare('SELECT id, loja_id FROM vendedores WHERE id = ?').get(req.params.id);
    if (!func) return res.status(404).json({ error: 'Funcionário não encontrado' });
    if (req.user.loja_id != null && func.loja_id !== req.user.loja_id) return res.status(403).json({ error: 'Acesso negado' });
    const hash = bcrypt.hashSync(pin, 10);
    db.prepare('UPDATE vendedores SET senha_ponto = ? WHERE id = ?').run(hash, func.id);
    res.json({ ok: true });
});

module.exports = router;
