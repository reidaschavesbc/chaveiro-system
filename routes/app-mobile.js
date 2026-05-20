const express = require('express');
const router = express.Router();
const db = require('../database/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');

const JWT_SECRET = process.env.JWT_SECRET;

// Inicializa Firebase Admin com service account
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
    if (serviceAccount.project_id) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
  } catch (e) {
    console.error('Firebase Admin não inicializado:', e.message);
  }
}

function authFuncionario(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token não fornecido' });
  try {
    req.funcionario = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

function gerarNumeroOS() {
  const now = new Date();
  const ano = now.getFullYear().toString().slice(2);
  const mes = String(now.getMonth() + 1).padStart(2, '0');
  const count = db.prepare("SELECT COUNT(*) as c FROM ordens_servico WHERE strftime('%Y-%m', data_entrada) = ?").get(`${now.getFullYear()}-${mes}`);
  const seq = String(count.c + 1).padStart(4, '0');
  return `OS${ano}${mes}${seq}`;
}

function recalcularValorOS(osId) {
  const { total } = db.prepare(`SELECT COALESCE(SUM(subtotal), 0) as total FROM itens_ordem_servico WHERE ordem_id = ?`).get(osId);
  const os = db.prepare(`SELECT COALESCE(desconto, 0) as desconto FROM ordens_servico WHERE id = ?`).get(osId);
  const valor = Math.max(0, total - (os?.desconto || 0));
  db.prepare(`UPDATE ordens_servico SET valor = ? WHERE id = ?`).run(valor, osId);
  return valor;
}

// POST /api/app/login
router.post('/login', (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ error: 'Email e senha são obrigatórios' });

  const func = db.prepare(`SELECT * FROM vendedores WHERE email = ? AND ativo = 1`).get(email);
  if (!func || !func.senha) return res.status(401).json({ error: 'Credenciais inválidas' });
  if (!bcrypt.compareSync(senha, func.senha)) return res.status(401).json({ error: 'Credenciais inválidas' });

  const isAdmin = !!func.is_admin;
  const podeTrabalhar = func.is_admin ? !!func.pode_trabalhar : true;
  const token = jwt.sign(
    { id: func.id, nome: func.nome, loja_id: func.loja_id, tipo: 'funcionario', is_admin: isAdmin, pode_trabalhar: podeTrabalhar },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
  res.json({ token, funcionario: { id: func.id, nome: func.nome, email: func.email, loja_id: func.loja_id, is_admin: isAdmin, pode_trabalhar: podeTrabalhar } });
});

// POST /api/app/push-token
router.post('/push-token', authFuncionario, (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token é obrigatório' });
  db.prepare(`UPDATE vendedores SET expo_push_token = ? WHERE id = ?`).run(token, req.funcionario.id);
  res.json({ ok: true });
});

// POST /api/app/os — criar nova OS pelo app
router.post('/os', authFuncionario, (req, res) => {
  const { cliente_nome_avulso, cliente_telefone_avulso, cliente_avulso_rua, cliente_avulso_numero, cliente_avulso_cidade, descricao, is_plantao, chave_auto, valor } = req.body;
  const isPlantao = is_plantao ? 1 : 0;
  const isChaveAuto = chave_auto ? 1 : 0;
  if (!isPlantao && !isChaveAuto && !descricao?.trim()) return res.status(400).json({ error: 'Descrição é obrigatória' });
  if (isPlantao && !cliente_avulso_rua?.trim()) return res.status(400).json({ error: 'Endereço é obrigatório para plantão' });

  const numero = gerarNumeroOS();
  const lojaId = req.funcionario.loja_id;
  const vendedorId = req.funcionario.id;

  const result = db.prepare(`
    INSERT INTO ordens_servico
      (numero, cliente_nome_avulso, cliente_avulso_rua, cliente_avulso_numero, cliente_avulso_cidade,
       descricao, status, valor, is_plantao, chave_auto, vendedor_id, loja_id)
    VALUES (?, ?, ?, ?, ?, ?, 'aberta', ?, ?, ?, ?, ?)
  `).run(
    numero,
    cliente_nome_avulso?.trim() || null,
    cliente_avulso_rua?.trim() || null,
    cliente_avulso_numero?.trim() || null,
    cliente_avulso_cidade?.trim() || null,
    descricao?.trim() || (isPlantao ? 'Plantão' : isChaveAuto ? 'Chave Auto' : ''),
    parseFloat(valor) || 0,
    isPlantao,
    isChaveAuto,
    vendedorId,
    lojaId
  );

  if (cliente_telefone_avulso?.trim()) {
    db.prepare(`UPDATE ordens_servico SET observacoes = ? WHERE id = ?`)
      .run(`Tel: ${cliente_telefone_avulso.trim()}`, result.lastInsertRowid);
  }

  res.status(201).json({ id: result.lastInsertRowid, numero });
});

// GET /api/app/os
router.get('/os', authFuncionario, (req, res) => {
  const { status } = req.query;
  let sql = `
    SELECT os.id, os.numero, os.descricao, os.valor, os.status, os.is_plantao,
           os.data_entrada, os.data_prevista, os.data_conclusao,
           os.forma_pagamento, os.observacoes, os.a_receber, os.a_receber_pago,
           COALESCE(c.nome, os.cliente_nome_avulso, 'Avulso') as cliente_nome,
           c.telefone as cliente_telefone
    FROM ordens_servico os
    LEFT JOIN clientes c ON os.cliente_id = c.id
    WHERE os.loja_id = ? AND os.vendedor_id = ?`;
  const params = [req.funcionario.loja_id, req.funcionario.id];
  if (status) { sql += ` AND os.status = ?`; params.push(status); }
  else { sql += ` AND os.status IN ('aberta', 'em_andamento')`; }
  sql += ` ORDER BY os.data_entrada DESC LIMIT 50`;
  res.json(db.prepare(sql).all(...params));
});

// GET /api/app/os/:id
router.get('/os/:id', authFuncionario, (req, res) => {
  const os = db.prepare(`
    SELECT os.*,
           COALESCE(c.nome, os.cliente_nome_avulso, 'Avulso') as cliente_nome,
           c.telefone as cliente_telefone,
           c.endereco as cliente_endereco
    FROM ordens_servico os
    LEFT JOIN clientes c ON os.cliente_id = c.id
    WHERE os.id = ? AND os.loja_id = ? AND os.vendedor_id = ?
  `).get(req.params.id, req.funcionario.loja_id, req.funcionario.id);
  if (!os) return res.status(404).json({ error: 'OS não encontrada' });

  const itens = db.prepare(`
    SELECT iv.*, p.nome as produto_nome, ts.nome as servico_nome,
           COALESCE(p.perguntar_estoque, ts.perguntar_estoque, 0) as perguntar_estoque
    FROM itens_ordem_servico iv
    LEFT JOIN produtos p ON iv.produto_id = p.id
    LEFT JOIN tipos_servico ts ON iv.servico_id = ts.id
    WHERE iv.ordem_id = ?
  `).all(os.id);

  const pagamentos = db.prepare(`SELECT * FROM pagamentos_os WHERE ordem_id = ? ORDER BY id`).all(os.id);

  res.json({ ...os, itens, pagamentos });
});

// PUT /api/app/os/:id — atualiza campos gerais
router.put('/os/:id', authFuncionario, (req, res) => {
  const os = db.prepare(`SELECT * FROM ordens_servico WHERE id = ? AND loja_id = ? AND vendedor_id = ?`)
    .get(req.params.id, req.funcionario.loja_id, req.funcionario.id);
  if (!os) return res.status(404).json({ error: 'OS não encontrada' });

  const { status, observacoes, descricao, desconto, pagamentos, a_receber, data_vencimento } = req.body;

  const STATUSES = ['aberta', 'em_andamento', 'concluida', 'cancelada'];
  if (status && !STATUSES.includes(status)) return res.status(400).json({ error: 'Status inválido' });

  let data_conclusao = os.data_conclusao;
  if (status === 'concluida' && !os.data_conclusao) {
    const now = new Date();
    data_conclusao = now.toLocaleDateString('en-CA') + ' ' + now.toLocaleTimeString('pt-BR');
  }

  // Handle multiple payments
  let formaFinal = null;
  if (pagamentos && pagamentos.length > 0) {
    formaFinal = pagamentos.length === 1 ? pagamentos[0].metodo : 'misto';
    db.prepare(`DELETE FROM pagamentos_os WHERE ordem_id = ?`).run(os.id);
    for (const p of pagamentos) {
      db.prepare(`INSERT INTO pagamentos_os (ordem_id, metodo, valor) VALUES (?, ?, ?)`).run(os.id, p.metodo, Number(p.valor));
    }
  }

  const novoAReceber = a_receber !== undefined ? (a_receber ? 1 : 0) : null;
  if (a_receber) formaFinal = 'a_receber';

  const novoDesconto = desconto !== undefined ? Number(desconto) : null;

  db.prepare(`
    UPDATE ordens_servico SET
      status           = COALESCE(?, status),
      observacoes      = COALESCE(?, observacoes),
      descricao        = COALESCE(?, descricao),
      desconto         = COALESCE(?, desconto),
      forma_pagamento  = COALESCE(?, forma_pagamento),
      a_receber        = COALESCE(?, a_receber),
      data_vencimento  = COALESCE(?, data_vencimento),
      data_conclusao   = ?
    WHERE id = ?
  `).run(
    status || null,
    observacoes || null,
    descricao || null,
    novoDesconto,
    formaFinal,
    novoAReceber,
    data_vencimento || null,
    data_conclusao,
    os.id
  );

  if (desconto !== undefined) recalcularValorOS(os.id);

  res.json({ ok: true });
});

// GET /api/app/produtos
router.get('/produtos', authFuncionario, (req, res) => {
  const produtos = db.prepare(`
    SELECT id, nome, preco_venda, unidade, estoque, estoque_minimo, descricao, imagem
    FROM produtos
    WHERE (loja_id = ? OR loja_id IS NULL) AND ativo = 1
    ORDER BY nome
  `).all(req.funcionario.loja_id);
  res.json(produtos);
});

// GET /api/app/servicos
router.get('/servicos', authFuncionario, (req, res) => {
  const servicos = db.prepare(`
    SELECT id, nome, preco_base, descricao
    FROM tipos_servico
    WHERE (loja_id = ? OR loja_id IS NULL) AND ativo = 1
    ORDER BY nome
  `).all(req.funcionario.loja_id);
  res.json(servicos);
});

// POST /api/app/os/:id/item
router.post('/os/:id/item', authFuncionario, (req, res) => {
  const os = db.prepare(`SELECT * FROM ordens_servico WHERE id = ? AND loja_id = ? AND vendedor_id = ?`)
    .get(req.params.id, req.funcionario.loja_id, req.funcionario.id);
  if (!os) return res.status(404).json({ error: 'OS não encontrada' });
  if (['concluida', 'cancelada'].includes(os.status)) return res.status(400).json({ error: 'OS já finalizada' });

  const { produto_id, servico_id, descricao, quantidade, preco_unitario } = req.body;
  if (!descricao && !produto_id && !servico_id) return res.status(400).json({ error: 'Descrição obrigatória' });

  const qty = Math.max(0.01, Number(quantidade) || 1);
  const preco = Math.max(0, Number(preco_unitario) || 0);
  const subtotal = qty * preco;

  let desc = descricao;
  if (!desc && produto_id) desc = db.prepare(`SELECT nome FROM produtos WHERE id = ?`).get(produto_id)?.nome;
  if (!desc && servico_id) desc = db.prepare(`SELECT nome FROM tipos_servico WHERE id = ?`).get(servico_id)?.nome;
  if (!desc) desc = 'Item';

  db.prepare(`
    INSERT INTO itens_ordem_servico (ordem_id, produto_id, servico_id, descricao, quantidade, preco_unitario, subtotal)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(os.id, produto_id || null, servico_id || null, desc, qty, preco, subtotal);

  const novoValor = recalcularValorOS(os.id);
  res.json({ ok: true, valor: novoValor });
});

// PUT /api/app/os/:id/item/:itemId
router.put('/os/:id/item/:itemId', authFuncionario, (req, res) => {
  const os = db.prepare(`SELECT * FROM ordens_servico WHERE id = ? AND loja_id = ? AND vendedor_id = ?`)
    .get(req.params.id, req.funcionario.loja_id, req.funcionario.id);
  if (!os) return res.status(404).json({ error: 'OS não encontrada' });
  if (['concluida', 'cancelada'].includes(os.status)) return res.status(400).json({ error: 'OS já finalizada' });

  const { quantidade, preco_unitario } = req.body;
  const qty = Math.max(0.01, Number(quantidade) || 1);
  const preco = Math.max(0, Number(preco_unitario) || 0);
  db.prepare(`UPDATE itens_ordem_servico SET quantidade = ?, preco_unitario = ?, subtotal = ? WHERE id = ? AND ordem_id = ?`)
    .run(qty, preco, qty * preco, req.params.itemId, os.id);
  const novoValor = recalcularValorOS(os.id);
  res.json({ ok: true, valor: novoValor });
});

// DELETE /api/app/os/:id/item/:itemId
router.delete('/os/:id/item/:itemId', authFuncionario, (req, res) => {
  const os = db.prepare(`SELECT * FROM ordens_servico WHERE id = ? AND loja_id = ? AND vendedor_id = ?`)
    .get(req.params.id, req.funcionario.loja_id, req.funcionario.id);
  if (!os) return res.status(404).json({ error: 'OS não encontrada' });
  if (['concluida', 'cancelada'].includes(os.status)) return res.status(400).json({ error: 'OS já finalizada' });

  db.prepare(`DELETE FROM itens_ordem_servico WHERE id = ? AND ordem_id = ?`).run(req.params.itemId, os.id);
  const novoValor = recalcularValorOS(os.id);
  res.json({ ok: true, valor: novoValor });
});

// POST /api/app/os/:id/consumo-estoque
router.post('/os/:id/consumo-estoque', authFuncionario, (req, res) => {
  const os = db.prepare(`SELECT * FROM ordens_servico WHERE id = ? AND loja_id = ? AND vendedor_id = ?`)
    .get(req.params.id, req.funcionario.loja_id, req.funcionario.id);
  if (!os) return res.status(404).json({ error: 'OS não encontrada' });
  const { itens, registrar_custo } = req.body;
  if (!itens || !itens.length) return res.json({ ok: true });

  const lojaId = req.funcionario.loja_id;
  const stmtMov = db.prepare(`INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, estoque_anterior, estoque_posterior, referencia, observacao, usuario_id, loja_id) VALUES (?, 'saida', ?, ?, ?, ?, 'Consumo OS', NULL, ?)`);

  let totalCusto = 0;
  db.transaction(() => {
    for (const { produto_id, quantidade } of itens) {
      const qtd = parseFloat(quantidade) || 0;
      if (!produto_id || qtd <= 0) continue;
      const pid = parseInt(produto_id);
      const p = db.prepare('SELECT estoque, preco_custo FROM produtos WHERE id = ?').get(pid);
      if (!p) continue;
      totalCusto += (p.preco_custo || 0) * qtd;
      const novoEstoque = Math.max(0, p.estoque - qtd);
      db.prepare('UPDATE produtos SET estoque = MAX(0, estoque - ?) WHERE id = ?').run(qtd, pid);
      stmtMov.run(pid, qtd, p.estoque, novoEstoque, `OS ${os.numero}`, lojaId);
    }
    if (os.is_plantao && registrar_custo && totalCusto > 0) {
      db.prepare('UPDATE ordens_servico SET custo_materiais = COALESCE(custo_materiais,0) + ? WHERE id = ?').run(totalCusto, os.id);
    }
  })();

  res.json({ ok: true });
});

// ── Admin middleware ────────────────────────────────────────────────────────
function authAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token não fornecido' });
  try {
    req.funcionario = jwt.verify(token, JWT_SECRET);
    if (!req.funcionario.is_admin) return res.status(403).json({ error: 'Acesso restrito a administradores' });
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

// GET /api/app/admin/resumo
router.get('/admin/resumo', authAdmin, (req, res) => {
  const loja_id = req.funcionario.loja_id;
  const hoje = new Date().toISOString().slice(0, 10);

  const abertas      = db.prepare(`SELECT COUNT(*) as c FROM ordens_servico WHERE loja_id = ? AND status = 'aberta'`).get(loja_id).c;
  const em_andamento = db.prepare(`SELECT COUNT(*) as c FROM ordens_servico WHERE loja_id = ? AND status = 'em_andamento'`).get(loja_id).c;
  const concluidas_hoje = db.prepare(`SELECT COUNT(*) as c FROM ordens_servico WHERE loja_id = ? AND status = 'concluida' AND date(data_conclusao) = ?`).get(loja_id, hoje).c;
  const faturado_hoje   = db.prepare(`SELECT COALESCE(SUM(valor),0) as t FROM ordens_servico WHERE loja_id = ? AND status = 'concluida' AND date(data_conclusao) = ?`).get(loja_id, hoje).t;

  const funcionarios = db.prepare(`
    SELECT v.id, v.nome, v.is_admin, v.pode_trabalhar,
      COUNT(CASE WHEN os.status IN ('aberta','em_andamento') THEN 1 END) as os_abertas,
      COUNT(CASE WHEN os.status = 'concluida' AND date(os.data_conclusao) = ? THEN 1 END) as os_hoje
    FROM vendedores v
    LEFT JOIN ordens_servico os ON os.vendedor_id = v.id AND os.loja_id = v.loja_id
    WHERE v.loja_id = ? AND v.ativo = 1
    GROUP BY v.id ORDER BY v.nome
  `).all(hoje, loja_id);

  res.json({ abertas, em_andamento, concluidas_hoje, faturado_hoje, funcionarios });
});

// GET /api/app/admin/os
router.get('/admin/os', authAdmin, (req, res) => {
  const loja_id = req.funcionario.loja_id;
  const { status, vendedor_id } = req.query;

  let query = `
    SELECT os.*, v.nome as vendedor_nome
    FROM ordens_servico os
    LEFT JOIN vendedores v ON v.id = os.vendedor_id
    WHERE os.loja_id = ?`;
  const params = [loja_id];

  if (status) { query += ` AND os.status = ?`; params.push(status); }
  else { query += ` AND os.status IN ('aberta','em_andamento')`; }
  if (vendedor_id) { query += ` AND os.vendedor_id = ?`; params.push(vendedor_id); }

  query += ` ORDER BY os.data_entrada DESC LIMIT 100`;
  res.json(db.prepare(query).all(...params));
});

// GET /api/app/perfil
router.get('/perfil', authFuncionario, (req, res) => {
  const func = db.prepare(`SELECT id, nome, email, telefone FROM vendedores WHERE id = ?`).get(req.funcionario.id);
  if (!func) return res.status(404).json({ error: 'Funcionário não encontrado' });
  res.json(func);
});

// Função exportada para notificar funcionário quando OS é criada/atribuída
async function notificarFuncionario(vendedorId, titulo, mensagem) {
  const func = db.prepare(`SELECT expo_push_token FROM vendedores WHERE id = ?`).get(vendedorId);
  if (!func?.expo_push_token) return;
  if (!admin.apps.length) { console.error('Firebase Admin não inicializado'); return; }
  try {
    await admin.messaging().send({
      token: func.expo_push_token,
      notification: { title: titulo, body: mensagem },
      android: {
        priority: 'high',
        notification: { channelId: 'chaveiro_alerts', sound: 'default' }
      }
    });
  } catch (e) {
    console.error('Erro ao enviar FCM:', e.message);
  }
}

module.exports = { router, notificarFuncionario };
