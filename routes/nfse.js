const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { emitirNfse, consultarDanfse, previewNfse } = require('../services/nfse');

// GET /api/nfse/preview/:osId — pré-visualização sem emitir
router.get('/preview/:osId', (req, res) => {
  try {
    const dados = previewNfse(parseInt(req.params.osId));
    res.json(dados);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST /api/nfse/emitir/:osId
router.post('/emitir/:osId', async (req, res) => {
  try {
    const resultado = await emitirNfse(parseInt(req.params.osId));
    res.json({ ok: true, ...resultado });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// GET /api/nfse/danfse/:chave — baixar PDF da nota
router.get('/danfse/:chave', async (req, res) => {
  try {
    const pdfBuffer = await consultarDanfse(req.params.chave);
    const download = req.query.download === '1';
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="NFS-e-${req.params.chave}.pdf"`);
    res.send(Buffer.from(pdfBuffer));
  } catch (e) {
    const status = /indisponível|502|503/.test(e.message) ? 502 : 400;
    res.status(status).json({ error: e.message });
  }
});

// GET /api/nfse/lista — listar todas NFS-e emitidas
router.get('/lista', (req, res) => {
  const { data_inicio, data_fim } = req.query;
  let query = `
    SELECT os.id, os.numero as os_numero, os.valor, os.nfse_numero, os.nfse_chave_acesso,
           os.nfse_status, os.nfse_emitida_em, os.nfse_ambiente,
           COALESCE(c.nome, os.cliente_nome_avulso, 'Avulso') as cliente_nome,
           c.cpf as cliente_cpf, c.cnpj as cliente_cnpj
    FROM ordens_servico os
    LEFT JOIN clientes c ON os.cliente_id = c.id
    WHERE os.nfse_status IS NOT NULL AND os.loja_id = ?`;
  const params = [req.user.loja_id];
  if (data_inicio) { query += ' AND date(os.nfse_emitida_em) >= ?'; params.push(data_inicio); }
  if (data_fim)    { query += ' AND date(os.nfse_emitida_em) <= ?'; params.push(data_fim); }
  query += ' ORDER BY os.nfse_emitida_em DESC';
  res.json(db.prepare(query).all(...params));
});

// GET /api/nfse/os/:osId — status da NFS-e de uma OS
router.get('/os/:osId', (req, res) => {
  const os = db.prepare(`
    SELECT id, numero, nfse_numero, nfse_chave_acesso, nfse_status, nfse_emitida_em, nfse_ambiente
    FROM ordens_servico WHERE id = ?
  `).get(req.params.osId);
  if (!os) return res.status(404).json({ error: 'OS não encontrada' });
  res.json(os);
});

// GET /api/nfse/config — ler configurações NFS-e
router.get('/config', (req, res) => {
  const rows = db.prepare(`SELECT chave, valor FROM configuracoes WHERE chave LIKE 'nfse_%'`).all();
  const cfg = {};
  for (const r of rows) cfg[r.chave] = r.valor;
  res.json(cfg);
});

// POST /api/nfse/config — salvar configurações NFS-e
router.post('/config', (req, res) => {
  const campos = [
    'nfse_cnpj', 'nfse_inscricao_municipal', 'nfse_aliquota_iss',
    'nfse_cod_trib_nac', 'nfse_cod_trib_mun', 'nfse_cnae',
    'nfse_regime_tributario', 'nfse_ambiente', 'nfse_pfx_path', 'nfse_pfx_senha'
  ];
  const stmt = db.prepare(`INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES (?, ?)`);
  for (const campo of campos) {
    if (req.body[campo] !== undefined) {
      stmt.run(campo, req.body[campo]);
    }
  }
  res.json({ ok: true });
});

module.exports = router;
