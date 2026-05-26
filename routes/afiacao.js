const express = require('express');
const router = express.Router();
const db = require('../database/db');
const wa = require('../services/whatsapp');

function gerarNumeroAfiacao(lojaId) {
  const row = db.prepare('SELECT MAX(numero) as max FROM afiacao WHERE loja_id = ?').get(lojaId);
  return (row?.max || 0) + 1;
}

function getConfig(chave) {
  const row = db.prepare('SELECT valor FROM configuracoes WHERE chave = ?').get(chave);
  return row?.valor || '';
}

function normalizePhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return (digits.startsWith('55') && digits.length >= 12) ? digits : '55' + digits;
}

async function notificarAfiador(ficha) {
  const tel = normalizePhone(getConfig('whatsapp_afiador'));
  if (!tel) return;
  const obs = ficha.observacao ? `\n📝 Obs: ${ficha.observacao}` : '';
  const cliente = ficha.cliente_nome ? `\n👤 Cliente: ${ficha.cliente_nome}` : '';
  const msg = `✂️ *Nova ficha de Afiação #${ficha.numero}*\n`
    + `🔢 Qtd: ${ficha.quantidade}${obs}${cliente}\n`
    + `💰 Valor: R$ ${Number(ficha.valor).toFixed(2).replace('.', ',')}`;
  try { await wa.enviarMensagem(tel, msg); } catch (_) {}
}

async function notificarCliente(ficha) {
  const tel = normalizePhone(ficha.cliente_telefone);
  if (!tel) return;
  const empresa = getConfig('empresa_nome') || 'Chaveiro';
  const msg = `✂️ Olá${ficha.cliente_nome ? ', ' + ficha.cliente_nome : ''}! Sua afiação (ficha #${ficha.numero}) está pronta para retirada. Obrigado, ${empresa}!`;
  try { await wa.enviarMensagem(tel, msg); } catch (_) {}
}

// GET /api/afiacao
router.get('/', (req, res) => {
  const lojaId = req.user.loja_id;
  const { status } = req.query;
  let sql = `SELECT * FROM afiacao WHERE loja_id = ?`;
  const params = [lojaId];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY criado_em DESC';
  res.json(db.prepare(sql).all(...params));
});

// GET /api/afiacao/relatorio?data_inicio&data_fim
router.get('/relatorio', (req, res) => {
  const lojaId = req.user.loja_id;
  const hoje = new Date().toLocaleDateString('en-CA');
  const inicioMes = hoje.slice(0, 7) + '-01';
  const di = req.query.data_inicio || inicioMes;
  const df = req.query.data_fim    || hoje;

  const fichas = db.prepare(`
    SELECT * FROM afiacao WHERE loja_id = ? AND date(data_entrega) BETWEEN ? AND ? AND status = 'entregue'
    ORDER BY data_entrega DESC
  `).all(lojaId, di, df);

  const totalCobrado = fichas.reduce((s, f) => s + Number(f.valor), 0);
  const valorAfiador = parseFloat(db.prepare(`SELECT valor FROM configuracoes WHERE chave = 'valor_afiador'`).get()?.valor) || 0;
  const totalAfiador = fichas.length * valorAfiador;

  const emFila = db.prepare(`SELECT COUNT(*) as n FROM afiacao WHERE loja_id = ? AND status != 'entregue'`).get(lojaId).n;

  res.json({
    fichas,
    total_cobrado: totalCobrado,
    total_afiador: totalAfiador,
    lucro: totalCobrado - totalAfiador,
    qtd_entregues: fichas.length,
    em_fila: emFila,
  });
});

// POST /api/afiacao
router.post('/', async (req, res) => {
  const lojaId = req.user.loja_id;
  const { cliente_nome, cliente_telefone, quantidade, observacao, valor } = req.body;
  if (!quantidade || quantidade < 1) return res.status(400).json({ erro: 'Quantidade obrigatória' });

  const numero = gerarNumeroAfiacao(lojaId);
  const info = db.prepare(`
    INSERT INTO afiacao (numero, cliente_nome, cliente_telefone, quantidade, observacao, valor, status, loja_id)
    VALUES (?, ?, ?, ?, ?, ?, 'aguardando', ?)
  `).run(numero, cliente_nome || null, cliente_telefone || null, quantidade, observacao || null, valor || 0, lojaId);

  const ficha = db.prepare('SELECT * FROM afiacao WHERE id = ?').get(info.lastInsertRowid);
  notificarAfiador(ficha);
  res.json(ficha);
});

// PUT /api/afiacao/:id/status
router.put('/:id/status', async (req, res) => {
  const lojaId = req.user.loja_id;
  const { status } = req.body;
  const validos = ['aguardando', 'afiando', 'pronto', 'entregue'];
  if (!validos.includes(status)) return res.status(400).json({ erro: 'Status inválido' });

  const agora = new Date().toLocaleDateString('en-CA') + ' ' + new Date().toLocaleTimeString('pt-BR');
  const dataEntrega = status === 'entregue' ? agora : null;

  db.prepare(`
    UPDATE afiacao SET status = ?, atualizado_em = datetime('now','localtime')
    ${status === 'entregue' ? ", data_entrega = ?" : ""}
    WHERE id = ? AND loja_id = ?
  `).run(...(status === 'entregue' ? [status, dataEntrega, req.params.id, lojaId] : [status, req.params.id, lojaId]));

  const ficha = db.prepare('SELECT * FROM afiacao WHERE id = ?').get(req.params.id);
  if (!ficha) return res.status(404).json({ erro: 'Ficha não encontrada' });

  if (status === 'entregue') notificarCliente(ficha);
  res.json(ficha);
});

// DELETE /api/afiacao/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM afiacao WHERE id = ? AND loja_id = ?').run(req.params.id, req.user.loja_id);
  res.json({ ok: true });
});

// GET /api/afiacao/:id/recibo
router.get('/:id/recibo', (req, res) => {
  const ficha = db.prepare('SELECT * FROM afiacao WHERE id = ? AND loja_id = ?').get(req.params.id, req.user.loja_id);
  if (!ficha) return res.status(404).send('Ficha não encontrada');

  const empresa = getConfig('empresa_nome') || 'Chaveiro';
  const empresaTel = getConfig('empresa_telefone') || '';
  const dt = new Date(ficha.criado_em).toLocaleString('pt-BR');
  const obs = ficha.observacao ? `<p><strong>Obs:</strong> ${ficha.observacao}</p>` : '';
  const cliente = ficha.cliente_nome ? `<p><strong>Cliente:</strong> ${ficha.cliente_nome}</p>` : '';
  const telCliente = ficha.cliente_telefone ? `<p><strong>Tel:</strong> ${ficha.cliente_telefone}</p>` : '';

  res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Recibo Afiação #${ficha.numero}</title>
<style>
  body { font-family: monospace; font-size: 13px; max-width: 300px; margin: 0 auto; padding: 16px; }
  h2 { text-align: center; font-size: 15px; margin: 0 0 4px; }
  .center { text-align: center; }
  .linha { border-top: 1px dashed #000; margin: 10px 0; }
  .ficha { font-size: 28px; font-weight: bold; text-align: center; margin: 10px 0; }
  .valor { font-size: 16px; font-weight: bold; margin-top: 8px; }
  p { margin: 3px 0; }
  @media print { button { display: none; } }
</style></head><body>
<h2>${empresa}</h2>
${empresaTel ? `<p class="center">${empresaTel}</p>` : ''}
<div class="linha"></div>
<p class="center"><strong>✂️ FICHA DE AFIAÇÃO</strong></p>
<div class="ficha">#${ficha.numero}</div>
<div class="linha"></div>
${cliente}${telCliente}
<p><strong>Qtd:</strong> ${ficha.quantidade} item(s)</p>
${obs}
<p class="valor">Valor: R$ ${Number(ficha.valor).toFixed(2).replace('.', ',')}</p>
<div class="linha"></div>
<p class="center" style="font-size:11px">${dt}</p>
<p class="center" style="font-size:11px;margin-top:6px">Guarde este comprovante</p>
<div style="margin-top:16px;text-align:center">
  <button onclick="window.print()">🖨️ Imprimir</button>
</div>
</body></html>`);
});

module.exports = router;
