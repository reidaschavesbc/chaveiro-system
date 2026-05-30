const express = require('express');
const router = express.Router();
const db = require('../database/db');
const bcrypt = require('bcryptjs');
const { registrarExclusao } = require('../utils/historico');

router.get('/', (req, res) => {
    const soTecnico = req.query.tecnico === '1';
    const sql = `SELECT *, CASE WHEN senha_ponto IS NOT NULL THEN 1 ELSE 0 END AS tem_pin FROM vendedores WHERE ativo = 1 AND loja_id = ?${soTecnico ? ' AND tecnico = 1' : ''} ORDER BY nome`;
    res.json(db.prepare(sql).all(req.user.loja_id));
});

router.post('/', (req, res) => {
    const { nome, telefone, percentual_comissao, percentual_plantao, salario_base, meta, bonus_meta, tecnico } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    const perc = parseFloat(percentual_comissao) || 0;
    const percP = parseFloat(percentual_plantao) || 0;
    const sal  = parseFloat(salario_base) || 0;
    const m    = parseFloat(meta) || 0;
    const bm   = parseFloat(bonus_meta) || 0;
    const tec  = tecnico ? 1 : 0;
    const result = db.prepare(
        'INSERT INTO vendedores (nome, telefone, percentual_comissao, percentual_plantao, salario_base, meta, bonus_meta, tecnico, loja_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(nome, telefone||null, perc, percP, sal, m, bm, tec, req.user.loja_id);
    res.status(201).json({ id: result.lastInsertRowid, nome, telefone: telefone||null, percentual_comissao: perc, percentual_plantao: percP, meta: m, bonus_meta: bm, tecnico: tec });
});

router.put('/:id', (req, res) => {
    const { nome, telefone, percentual_comissao, percentual_plantao, salario_base, meta, bonus_meta, tecnico, is_admin, pode_trabalhar } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    const perc  = parseFloat(percentual_comissao) || 0;
    const percP = parseFloat(percentual_plantao) || 0;
    const m     = parseFloat(meta) || 0;
    const bm    = parseFloat(bonus_meta) || 0;
    const tec   = tecnico ? 1 : 0;
    const adm   = is_admin ? 1 : 0;
    const trab  = pode_trabalhar !== undefined ? (pode_trabalhar ? 1 : 0) : 1;

    if (salario_base !== undefined) {
        const sal = parseFloat(salario_base) || 0;
        db.prepare('UPDATE vendedores SET nome=?,telefone=?,percentual_comissao=?,percentual_plantao=?,salario_base=?,meta=?,bonus_meta=?,tecnico=?,is_admin=?,pode_trabalhar=? WHERE id=? AND loja_id=?')
            .run(nome, telefone||null, perc, percP, sal, m, bm, tec, adm, trab, req.params.id, req.user.loja_id);
    } else {
        db.prepare('UPDATE vendedores SET nome=?,telefone=?,percentual_comissao=?,percentual_plantao=?,meta=?,bonus_meta=?,tecnico=?,is_admin=?,pode_trabalhar=? WHERE id=? AND loja_id=?')
            .run(nome, telefone||null, perc, percP, m, bm, tec, adm, trab, req.params.id, req.user.loja_id);
    }
    res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
    const v = db.prepare('SELECT id, nome FROM vendedores WHERE id = ? AND loja_id = ?').get(req.params.id, req.user.loja_id);
    db.prepare('UPDATE vendedores SET ativo = 0, email = NULL, senha = NULL, expo_push_token = NULL WHERE id = ? AND loja_id = ?').run(req.params.id, req.user.loja_id);
    if (v) {
        registrarExclusao({
            loja_id: req.user.loja_id,
            tipo: 'vendedor',
            registro_id: v.id,
            descricao: `Vendedor: ${v.nome}`,
            usuario_id: req.user.id,
            usuario_nome: req.user.nome,
        req
    });
    }
    res.json({ ok: true });
});

// PUT /api/vendedores/:id/admin — altera permissões admin (só admin do sistema)
router.put('/:id/admin', (req, res) => {
    if (!req.user.principal) return res.status(403).json({ error: 'Acesso negado' });
    const { is_admin, pode_trabalhar } = req.body;
    const v = db.prepare('SELECT id FROM vendedores WHERE id = ? AND loja_id = ?').get(req.params.id, req.user.loja_id);
    if (!v) return res.status(404).json({ error: 'Funcionário não encontrado' });
    if (is_admin !== undefined) db.prepare('UPDATE vendedores SET is_admin = ? WHERE id = ? AND loja_id = ?').run(is_admin ? 1 : 0, req.params.id, req.user.loja_id);
    if (pode_trabalhar !== undefined) db.prepare('UPDATE vendedores SET pode_trabalhar = ? WHERE id = ? AND loja_id = ?').run(pode_trabalhar ? 1 : 0, req.params.id, req.user.loja_id);
    res.json({ ok: true });
});

// PUT /api/vendedores/:id/acesso-app — define email e senha para o app
router.put('/:id/acesso-app', (req, res) => {
    const { email, senha } = req.body;
    if (!email) return res.status(400).json({ error: 'E-mail é obrigatório' });

    const existe = db.prepare('SELECT id FROM vendedores WHERE email = ? AND id != ? AND loja_id = ?').get(email, req.params.id, req.user.loja_id);
    if (existe) return res.status(400).json({ error: 'Este e-mail já está em uso por outro funcionário' });

    if (senha) {
        const hash = bcrypt.hashSync(senha, 10);
        db.prepare('UPDATE vendedores SET email = ?, senha = ? WHERE id = ? AND loja_id = ?').run(email, hash, req.params.id, req.user.loja_id);
    } else {
        db.prepare('UPDATE vendedores SET email = ? WHERE id = ? AND loja_id = ?').run(email, req.params.id, req.user.loja_id);
    }
    res.json({ ok: true });
});

router.get('/disponibilidade', (req, res) => {
    const lojaId = req.user.loja_id;
    const vendedores = db.prepare(`SELECT id, nome FROM vendedores WHERE loja_id = ? AND ativo = 1 AND pode_trabalhar = 1 AND tecnico = 1 ORDER BY nome`).all(lojaId);
    const agora = new Date();
    const hoje = agora.toLocaleDateString('en-CA');

    const result = vendedores.map(v => {
        // 1. OS efetivamente em andamento agora (usa data_inicio_real como base real)
        const osEmAndamento = db.prepare(`
            SELECT numero, data_inicio_real, tempo_estimado
            FROM ordens_servico
            WHERE vendedor_id = ? AND loja_id = ? AND status = 'em_andamento'
            ORDER BY data_entrada DESC LIMIT 1
        `).get(v.id, lojaId);

        if (osEmAndamento) {
            if (osEmAndamento.data_inicio_real && osEmAndamento.tempo_estimado > 0) {
                const inicio = new Date(osEmAndamento.data_inicio_real.replace(' ', 'T'));
                const livreEm = new Date(inicio.getTime() + osEmAndamento.tempo_estimado * 60000);
                if (livreEm > agora) {
                    const hh = String(livreEm.getHours()).padStart(2, '0');
                    const mm = String(livreEm.getMinutes()).padStart(2, '0');
                    return { id: v.id, nome: v.nome, status: 'ocupado', livre_as: `${hh}:${mm}`, os_numero: osEmAndamento.numero };
                }
            }
            // em andamento mas sem previsão de término (sem horário ou tempo indefinido)
            return { id: v.id, nome: v.nome, status: 'ocupado', livre_as: null, os_numero: osEmAndamento.numero };
        }

        // 2. OS agendada para hoje ainda não iniciada (data_prevista com hora no futuro)
        const osAgendada = db.prepare(`
            SELECT numero, data_prevista
            FROM ordens_servico
            WHERE vendedor_id = ? AND loja_id = ? AND status = 'aberta'
              AND data_prevista IS NOT NULL AND length(data_prevista) > 10
              AND date(data_prevista) = ?
              AND data_prevista > datetime('now', 'localtime')
            ORDER BY data_prevista ASC LIMIT 1
        `).get(v.id, lojaId, hoje);

        if (osAgendada) {
            const dp = new Date(osAgendada.data_prevista.replace(' ', 'T'));
            const umHoraAntes = new Date(dp.getTime() - 60 * 60000);
            if (agora >= umHoraAntes) {
                const hh = String(dp.getHours()).padStart(2, '0');
                const mm = String(dp.getMinutes()).padStart(2, '0');
                return { id: v.id, nome: v.nome, status: 'agendado', agendado_as: `${hh}:${mm}`, os_numero: osAgendada.numero };
            }
        }

        return { id: v.id, nome: v.nome, status: 'livre' };
    });
    res.json(result);
});

module.exports = router;
