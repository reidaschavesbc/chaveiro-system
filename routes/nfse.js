const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../database/db');
const { emitirNfse, consultarDanfse, previewNfse } = require('../services/nfse');

const certsDir = path.join(__dirname, '..', 'certs');
if (!fs.existsSync(certsDir)) fs.mkdirSync(certsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: certsDir,
  filename: (req, file, cb) => cb(null, `loja_${req.params.lojaId}.pfx`),
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.originalname.toLowerCase().endsWith('.pfx')) cb(null, true);
    else cb(new Error('Somente arquivos .pfx são aceitos'));
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

// GET /api/nfse/preview/:osId — pré-visualização sem emitir
router.get('/preview/:osId', (req, res) => {
  try {
    const dados = previewNfse(parseInt(req.params.osId));
    res.json(dados);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

const nfsePdfsDir = path.join(__dirname, '..', 'database', 'nfse-pdfs');
if (!fs.existsSync(nfsePdfsDir)) fs.mkdirSync(nfsePdfsDir, { recursive: true });

// POST /api/nfse/emitir/:osId
router.post('/emitir/:osId', async (req, res) => {
  try {
    const resultado = await emitirNfse(parseInt(req.params.osId));
    // Salva PDF localmente após emissão para uso futuro (ex: envio WhatsApp)
    try {
      const pdfBuffer = await consultarDanfse(resultado.chave_acesso, req.user.loja_id);
      fs.writeFileSync(path.join(nfsePdfsDir, `${resultado.chave_acesso}.pdf`), Buffer.from(pdfBuffer));
    } catch (_) {}
    res.json({ ok: true, ...resultado });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// GET /api/nfse/danfse/:chave — visualizar/baixar PDF da nota
router.get('/danfse/:chave', async (req, res) => {
  try {
    const chave = req.params.chave;
    const localPath = path.join(nfsePdfsDir, `${chave}.pdf`);
    let pdfBuffer;
    if (fs.existsSync(localPath)) {
      pdfBuffer = fs.readFileSync(localPath);
    } else {
      pdfBuffer = Buffer.from(await consultarDanfse(chave, req.user.loja_id));
      fs.writeFileSync(localPath, pdfBuffer);
    }
    const download = req.query.download === '1';
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="NFS-e-${chave}.pdf"`);
    res.send(pdfBuffer);
  } catch (e) {
    res.status(400).json({ error: e.message });
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

// GET /api/nfse/config — ler configurações NFS-e da loja do usuário logado
router.get('/config', (req, res) => {
  const lojaId = req.user.loja_id;
  if (!lojaId) return res.status(400).json({ error: 'Usuário sem loja associada' });
  const rows = db.prepare(`SELECT chave, valor FROM nfse_config WHERE loja_id = ?`).all(lojaId);
  const cfg = {};
  for (const r of rows) cfg['nfse_' + r.chave] = r.valor;
  res.json(cfg);
});

// POST /api/nfse/config — salvar configurações NFS-e da loja do usuário logado
router.post('/config', (req, res) => {
  const lojaId = req.user.loja_id;
  if (!lojaId) return res.status(400).json({ error: 'Usuário sem loja associada' });
  const campos = [
    'nfse_cnpj', 'nfse_inscricao_municipal', 'nfse_aliquota_iss',
    'nfse_cod_trib_nac', 'nfse_cod_trib_mun', 'nfse_cnae',
    'nfse_regime_tributario', 'nfse_ambiente', 'nfse_pfx_path', 'nfse_pfx_senha'
  ];
  const stmt = db.prepare(`INSERT OR REPLACE INTO nfse_config (loja_id, chave, valor) VALUES (?, ?, ?)`);
  for (const campo of campos) {
    if (req.body[campo] !== undefined) {
      stmt.run(lojaId, campo.replace('nfse_', ''), req.body[campo]);
    }
  }
  res.json({ ok: true });
});

// GET /api/nfse/admin-config/:lojaId — ler config de qualquer loja (admin only)
router.get('/admin-config/:lojaId', (req, res) => {
  if (req.user.perfil !== 'admin') return res.status(403).json({ error: 'Acesso restrito a administradores' });
  const lojaId = parseInt(req.params.lojaId);
  const rows = db.prepare(`SELECT chave, valor FROM nfse_config WHERE loja_id = ?`).all(lojaId);
  const cfg = {};
  for (const r of rows) cfg['nfse_' + r.chave] = r.valor;
  res.json(cfg);
});

// POST /api/nfse/admin-config/:lojaId — salvar config de qualquer loja (admin only)
router.post('/admin-config/:lojaId', (req, res) => {
  if (req.user.perfil !== 'admin') return res.status(403).json({ error: 'Acesso restrito a administradores' });
  const lojaId = parseInt(req.params.lojaId);
  const campos = [
    'nfse_cnpj', 'nfse_inscricao_municipal', 'nfse_aliquota_iss',
    'nfse_cod_trib_nac', 'nfse_cod_trib_mun', 'nfse_cnae',
    'nfse_regime_tributario', 'nfse_ambiente', 'nfse_pfx_path', 'nfse_pfx_senha'
  ];
  const stmt = db.prepare(`INSERT OR REPLACE INTO nfse_config (loja_id, chave, valor) VALUES (?, ?, ?)`);
  for (const campo of campos) {
    if (req.body[campo] !== undefined) {
      stmt.run(lojaId, campo.replace('nfse_', ''), req.body[campo]);
    }
  }
  res.json({ ok: true });
});

// POST /api/nfse/admin-config/:lojaId/pfx — upload do certificado .pfx (admin only)
router.post('/admin-config/:lojaId/pfx', (req, res, next) => {
  if (req.user.perfil !== 'admin') return res.status(403).json({ error: 'Acesso restrito a administradores' });
  next();
}, upload.single('pfx'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo recebido' });
  const lojaId = parseInt(req.params.lojaId);
  const pfxPath = req.file.path;
  db.prepare(`INSERT OR REPLACE INTO nfse_config (loja_id, chave, valor) VALUES (?, 'pfx_path', ?)`).run(lojaId, pfxPath);
  res.json({ ok: true, pfx_path: pfxPath, nome: req.file.originalname });
}, (err, req, res, next) => {
  res.status(400).json({ error: err.message });
});

module.exports = router;
