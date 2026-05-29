const express = require('express');
const router = express.Router();
const db = require('../database/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');
const gerarNumeroOS = require('../utils/gerarNumeroOS');
const wa = require('../services/whatsapp');

function _normalizeFone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return (digits.startsWith('55') && digits.length >= 12) ? digits : '55' + digits;
}

function _getConfig(chave) {
  const row = db.prepare('SELECT valor FROM configuracoes WHERE chave = ?').get(chave);
  return row?.valor || '';
}

async function _notificarClienteAfiacao(ficha) {
  const tel = _normalizeFone(ficha.cliente_telefone);
  if (!tel) return;
  const empresa = _getConfig('empresa_nome') || 'Chaveiro';
  const msg = `✂️ Olá${ficha.cliente_nome ? ', ' + ficha.cliente_nome : ''}! Sua afiação (ficha #${ficha.numero}) está pronta para retirada. Obrigado, ${empresa}!`;
  await wa.enviarMensagem(tel, msg);
}

const JWT_SECRET = process.env.JWT_SECRET || 'chaveiro_super_secret_key_2024';

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

function verificarAcessoAdm(req, lojaId) {
  if (!req.funcionario.is_admin) return false;
  if (req.funcionario.loja_id === lojaId) return true;
  return !!db.prepare(`SELECT 1 FROM adm_acesso_externo WHERE funcionario_id = ? AND loja_id = ?`).get(req.funcionario.id, lojaId);
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

  // Tenta vendedores primeiro
  const func = db.prepare(`SELECT * FROM vendedores WHERE email = ? AND ativo = 1`).get(email);
  if (func && func.senha && bcrypt.compareSync(senha, func.senha)) {
    const token = jwt.sign(
      { id: func.id, nome: func.nome, loja_id: func.loja_id, tipo: 'funcionario', is_admin: func.is_admin },
      JWT_SECRET, { expiresIn: '30d' }
    );
    const lojasAdm = db.prepare(`
      SELECT l.id, l.nome FROM adm_acesso_externo a JOIN lojas l ON a.loja_id = l.id WHERE a.funcionario_id = ?
    `).all(func.id);
    return res.json({ token, funcionario: { id: func.id, nome: func.nome, email: func.email, loja_id: func.loja_id, is_admin: func.is_admin, lojas_adm: lojasAdm } });
  }

  // Tenta afiador (tabela usuarios com perfil = 'afiador')
  const afiador = db.prepare(`SELECT * FROM usuarios WHERE (email = ? OR nome = ?) AND perfil = 'afiador' AND ativo = 1`).get(email, email);
  if (!afiador || !afiador.senha) return res.status(401).json({ error: 'Credenciais inválidas' });
  if (!bcrypt.compareSync(senha, afiador.senha)) return res.status(401).json({ error: 'Credenciais inválidas' });

  const token = jwt.sign(
    { id: afiador.id, nome: afiador.nome, loja_id: afiador.loja_id, tipo: 'afiador', perfil: 'afiador', is_admin: false },
    JWT_SECRET, { expiresIn: '30d' }
  );
  res.json({
    token,
    funcionario: {
      id: afiador.id, nome: afiador.nome, email: afiador.email,
      loja_id: afiador.loja_id, is_admin: false, perfil: 'afiador', lojas_adm: []
    }
  });
});

// POST /api/app/push-token
router.post('/push-token', authFuncionario, (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token é obrigatório' });
  if (req.funcionario.tipo === 'afiador') {
    db.prepare(`UPDATE usuarios SET expo_push_token = ? WHERE id = ?`).run(token, req.funcionario.id);
  } else {
    db.prepare(`UPDATE vendedores SET expo_push_token = ? WHERE id = ?`).run(token, req.funcionario.id);
  }
  res.json({ ok: true });
});

// GET /api/app/os
router.get('/os', authFuncionario, (req, res) => {
  const { status, todas, dias, adm, loja_id, funcionario_id } = req.query;

  if (adm === '1' && req.funcionario.is_admin) {
    const lojaAlvo = loja_id ? parseInt(loja_id) : req.funcionario.loja_id;
    if (!verificarAcessoAdm(req, lojaAlvo)) return res.status(403).json({ error: 'Sem permissão' });
    let sql = `
      SELECT os.id, os.numero, os.descricao, os.valor, os.status,
             os.data_entrada, os.data_prevista, os.data_conclusao,
             os.forma_pagamento, os.observacoes, os.a_receber, os.a_receber_pago,
             COALESCE(c.nome, os.cliente_nome_avulso, 'Avulso') as cliente_nome,
             c.nome_fantasia as cliente_nome_fantasia,
             c.telefone as cliente_telefone,
             v.nome as vendedor_nome
      FROM ordens_servico os
      LEFT JOIN clientes c ON os.cliente_id = c.id
      LEFT JOIN vendedores v ON os.vendedor_id = v.id
      WHERE os.loja_id = ?`;
    const params = [lojaAlvo];
    const numDias = Math.min(3, Math.max(1, parseInt(dias) || 1));
    const dateFilter = numDias === 1
      ? `= date('now', 'localtime')`
      : `>= date('now', '-${numDias - 1} days', 'localtime')`;
    if (status === 'concluida') {
      sql += ` AND os.status = 'concluida' AND date(os.data_conclusao) ${dateFilter}`;
    } else if (status === 'cancelada') {
      sql += ` AND os.status = 'cancelada' AND date(os.data_entrada) ${dateFilter}`;
    } else if (status === 'cobrancas') {
      sql += ` AND os.a_receber = 1 AND os.a_receber_pago = 1 AND date(os.data_recebimento) ${dateFilter}`;
    } else if (status === 'aberta' || status === 'em_andamento') {
      sql += ` AND os.status = ?`;
      params.push(status);
    } else {
      sql += ` AND os.status IN ('aberta', 'em_andamento')`;
    }
    if (funcionario_id) {
      sql += ` AND os.vendedor_id = ?`;
      params.push(parseInt(funcionario_id));
    }
    sql += ` ORDER BY os.data_entrada DESC LIMIT 200`;
    return res.json(db.prepare(sql).all(...params));
  }

  let sql = `
    SELECT os.id, os.numero, os.descricao, os.valor, os.status,
           os.data_entrada, os.data_prevista, os.data_conclusao,
           os.forma_pagamento, os.observacoes, os.a_receber, os.a_receber_pago,
           COALESCE(c.nome, os.cliente_nome_avulso, 'Avulso') as cliente_nome,
           c.nome_fantasia as cliente_nome_fantasia,
           c.telefone as cliente_telefone
    FROM ordens_servico os
    LEFT JOIN clientes c ON os.cliente_id = c.id
    WHERE os.loja_id = ?`;
  const params = [req.funcionario.loja_id];

  sql += ` AND os.vendedor_id = ?`;
  params.push(req.funcionario.id);
  if (status) { sql += ` AND os.status = ?`; params.push(status); }
  else { sql += ` AND os.status IN ('aberta', 'em_andamento')`; }

  sql += ` ORDER BY os.data_entrada DESC LIMIT 200`;
  res.json(db.prepare(sql).all(...params));
});

// POST /api/app/os — criar nova OS
router.post('/os', authFuncionario, (req, res) => {
  const {
    cliente_nome_avulso, cliente_telefone_avulso,
    cliente_avulso_rua, cliente_avulso_numero, cliente_avulso_complemento,
    cliente_avulso_cidade, cliente_avulso_referencia,
    descricao, contato_cliente, is_plantao, chave_auto, vendedor_id,
  } = req.body;

  const lojaId = req.funcionario.loja_id;
  const vidFinal = (req.funcionario.is_admin && vendedor_id) ? vendedor_id : req.funcionario.id;

  if (!is_plantao && !descricao?.trim()) return res.status(400).json({ error: 'Descrição obrigatória' });
  if (is_plantao && !cliente_avulso_rua?.trim()) return res.status(400).json({ error: 'Endereço obrigatório para plantão' });

  try {
    const inserir = db.transaction(() => {
      const numero = gerarNumeroOS();
      const result = db.prepare(`
        INSERT INTO ordens_servico (
          numero, cliente_nome_avulso, cliente_telefone_avulso,
          cliente_avulso_rua, cliente_avulso_numero, cliente_avulso_complemento,
          cliente_avulso_cidade, cliente_avulso_referencia,
          descricao, contato_cliente, is_plantao, chave_auto,
          vendedor_id, status, valor, loja_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'aberta', 0, ?)
      `).run(
        numero,
        cliente_nome_avulso || null, cliente_telefone_avulso || null,
        cliente_avulso_rua || null, cliente_avulso_numero || null,
        cliente_avulso_complemento || null, cliente_avulso_cidade || null,
        cliente_avulso_referencia || null,
        descricao?.trim() || null, contato_cliente || null,
        is_plantao ? 1 : 0, chave_auto ? 1 : 0,
        vidFinal, lojaId
      );
      return { id: result.lastInsertRowid, numero };
    });

    const { id, numero } = inserir();

    if (req.funcionario.is_admin && vendedor_id && vendedor_id !== req.funcionario.id) {
      notificarFuncionario(vendedor_id, '🔧 Nova OS', `${numero} — ${cliente_nome_avulso || 'Avulso'}: ${descricao || 'Plantão'}`).catch(() => {});
    }

    res.status(201).json({ id, numero });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao criar OS' });
  }
});

// GET /api/app/adm-stats
router.get('/adm-stats', authFuncionario, (req, res) => {
  const lojaAlvo = req.query.loja_id ? parseInt(req.query.loja_id) : req.funcionario.loja_id;
  if (!verificarAcessoAdm(req, lojaAlvo)) return res.status(403).json({ error: 'Sem permissão' });
  const hoje = new Date().toLocaleDateString('en-CA');
  const loja = db.prepare(`SELECT nome FROM lojas WHERE id = ?`).get(lojaAlvo);
  const funcionarios = db.prepare(`
    SELECT v.id, v.nome, v.is_admin,
      (SELECT COUNT(*) FROM ordens_servico WHERE vendedor_id = v.id AND status IN ('aberta','em_andamento') AND loja_id = ?) as os_abertas,
      (SELECT COUNT(*) FROM ordens_servico WHERE vendedor_id = v.id AND status = 'concluida' AND date(data_conclusao) = ? AND loja_id = ?) as os_hoje
    FROM vendedores v WHERE v.loja_id = ? AND v.ativo = 1 ORDER BY v.nome
  `).all(lojaAlvo, hoje, lojaAlvo, lojaAlvo);
  const stats = {
    loja_nome: loja?.nome || 'Minha Loja',
    funcionarios,
    em_andamento:  db.prepare(`SELECT COUNT(*) as n FROM ordens_servico WHERE loja_id = ? AND status = 'em_andamento'`).get(lojaAlvo).n,
    abertas:       db.prepare(`SELECT COUNT(*) as n FROM ordens_servico WHERE loja_id = ? AND status = 'aberta'`).get(lojaAlvo).n,
    finalizadas:   db.prepare(`SELECT COUNT(*) as n FROM ordens_servico WHERE loja_id = ? AND status = 'concluida' AND date(data_conclusao) = ?`).get(lojaAlvo, hoje).n,
    canceladas:    db.prepare(`SELECT COUNT(*) as n FROM ordens_servico WHERE loja_id = ? AND status = 'cancelada' AND date(data_entrada) = ?`).get(lojaAlvo, hoje).n,
    valor_hoje: (() => {
      const direto   = db.prepare(`SELECT COALESCE(SUM(valor),0) as t FROM ordens_servico WHERE loja_id=? AND status='concluida' AND a_receber=0 AND date(data_conclusao)=?`).get(lojaAlvo, hoje).t;
      const cobranca = db.prepare(`SELECT COALESCE(SUM(valor),0) as t FROM ordens_servico WHERE loja_id=? AND a_receber=1 AND a_receber_pago=1 AND date(data_recebimento)=?`).get(lojaAlvo, hoje).t;
      return direto + cobranca;
    })(),
    cobrancas_hoje: db.prepare(`SELECT COALESCE(SUM(valor), 0) as t FROM ordens_servico WHERE loja_id = ? AND a_receber = 1 AND a_receber_pago = 1 AND date(data_recebimento) = ?`).get(lojaAlvo, hoje).t,
  };
  res.json(stats);
});

// GET /api/app/os/:id
router.get('/os/:id', authFuncionario, (req, res) => {
  const os = db.prepare(`
    SELECT os.*,
           COALESCE(c.nome, os.cliente_nome_avulso, 'Avulso') as cliente_nome,
           c.nome_fantasia as cliente_nome_fantasia,
           c.telefone as cliente_telefone,
           c.endereco as cliente_endereco
    FROM ordens_servico os
    LEFT JOIN clientes c ON os.cliente_id = c.id
    WHERE os.id = ? AND os.loja_id = ?${req.funcionario.is_admin ? '' : ' AND os.vendedor_id = ?'}
  `).get(req.params.id, req.funcionario.loja_id, ...(req.funcionario.is_admin ? [] : [req.funcionario.id]));
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
  const os = req.funcionario.is_admin
    ? db.prepare(`SELECT * FROM ordens_servico WHERE id = ? AND loja_id = ?`).get(req.params.id, req.funcionario.loja_id)
    : db.prepare(`SELECT * FROM ordens_servico WHERE id = ? AND loja_id = ? AND vendedor_id = ?`).get(req.params.id, req.funcionario.loja_id, req.funcionario.id);
  if (!os) return res.status(404).json({ error: 'OS não encontrada' });

  const {
    status, observacoes, descricao, desconto, pagamentos, a_receber, data_vencimento,
    contato_cliente,
    cliente_avulso_rua, cliente_avulso_numero, cliente_avulso_cidade, cliente_avulso_referencia,
  } = req.body;

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

  // Para campos opcionais que podem ser limpos (enviados como null/vazio),
  // usamos 'in req.body' para distinguir "não enviado" de "enviado como vazio".
  const b = req.body;
  const novoContato      = 'contato_cliente'           in b ? (contato_cliente?.trim() || null)           : undefined;
  const novaRua          = 'cliente_avulso_rua'        in b ? (cliente_avulso_rua?.trim() || null)        : undefined;
  const novoNumero       = 'cliente_avulso_numero'     in b ? (cliente_avulso_numero?.trim() || null)     : undefined;
  const novaCidade       = 'cliente_avulso_cidade'     in b ? (cliente_avulso_cidade?.trim() || null)     : undefined;
  const novaReferencia   = 'cliente_avulso_referencia' in b ? (cliente_avulso_referencia?.trim() || null) : undefined;

  const setClauses = [
    'status          = COALESCE(?, status)',
    'observacoes     = COALESCE(?, observacoes)',
    'descricao       = COALESCE(?, descricao)',
    'desconto        = COALESCE(?, desconto)',
    'forma_pagamento = COALESCE(?, forma_pagamento)',
    'a_receber       = COALESCE(?, a_receber)',
    'data_vencimento = COALESCE(?, data_vencimento)',
    'data_conclusao  = ?',
  ];
  const params = [
    status || null, observacoes || null, descricao || null,
    novoDesconto, formaFinal, novoAReceber,
    data_vencimento || null, data_conclusao,
  ];

  if (novoContato !== undefined)    { setClauses.push('contato_cliente           = ?'); params.push(novoContato); }
  if (novaRua !== undefined)        { setClauses.push('cliente_avulso_rua        = ?'); params.push(novaRua); }
  if (novoNumero !== undefined)     { setClauses.push('cliente_avulso_numero     = ?'); params.push(novoNumero); }
  if (novaCidade !== undefined)     { setClauses.push('cliente_avulso_cidade     = ?'); params.push(novaCidade); }
  if (novaReferencia !== undefined) { setClauses.push('cliente_avulso_referencia = ?'); params.push(novaReferencia); }

  params.push(os.id);
  db.prepare(`UPDATE ordens_servico SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);

  if (desconto !== undefined) recalcularValorOS(os.id);

  res.json({ ok: true });
});

// GET /api/app/produtos
router.get('/produtos', authFuncionario, (req, res) => {
  const produtos = db.prepare(`
    SELECT id, nome, preco_venda, unidade
    FROM produtos
    WHERE (loja_id = ? OR loja_id IS NULL) AND ativo = 1
    ORDER BY nome
  `).all(req.funcionario.loja_id);
  res.json(produtos);
});

// GET /api/app/servicos
router.get('/servicos', authFuncionario, (req, res) => {
  const servicos = db.prepare(`
    SELECT id, nome, preco_base
    FROM tipos_servico
    WHERE (loja_id = ? OR loja_id IS NULL) AND ativo = 1
    ORDER BY nome
  `).all(req.funcionario.loja_id);
  res.json(servicos);
});

// POST /api/app/os/:id/item
router.post('/os/:id/item', authFuncionario, (req, res) => {
  const os = req.funcionario.is_admin
    ? db.prepare(`SELECT * FROM ordens_servico WHERE id = ? AND loja_id = ?`).get(req.params.id, req.funcionario.loja_id)
    : db.prepare(`SELECT * FROM ordens_servico WHERE id = ? AND loja_id = ? AND vendedor_id = ?`).get(req.params.id, req.funcionario.loja_id, req.funcionario.id);
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
  const os = req.funcionario.is_admin
    ? db.prepare(`SELECT * FROM ordens_servico WHERE id = ? AND loja_id = ?`).get(req.params.id, req.funcionario.loja_id)
    : db.prepare(`SELECT * FROM ordens_servico WHERE id = ? AND loja_id = ? AND vendedor_id = ?`).get(req.params.id, req.funcionario.loja_id, req.funcionario.id);
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
  const os = req.funcionario.is_admin
    ? db.prepare(`SELECT * FROM ordens_servico WHERE id = ? AND loja_id = ?`).get(req.params.id, req.funcionario.loja_id)
    : db.prepare(`SELECT * FROM ordens_servico WHERE id = ? AND loja_id = ? AND vendedor_id = ?`).get(req.params.id, req.funcionario.loja_id, req.funcionario.id);
  if (!os) return res.status(404).json({ error: 'OS não encontrada' });
  if (['concluida', 'cancelada'].includes(os.status)) return res.status(400).json({ error: 'OS já finalizada' });

  db.prepare(`DELETE FROM itens_ordem_servico WHERE id = ? AND ordem_id = ?`).run(req.params.itemId, os.id);
  const novoValor = recalcularValorOS(os.id);
  res.json({ ok: true, valor: novoValor });
});

// POST /api/app/os/:id/consumo-estoque
router.post('/os/:id/consumo-estoque', authFuncionario, (req, res) => {
  const os = req.funcionario.is_admin
    ? db.prepare(`SELECT * FROM ordens_servico WHERE id = ? AND loja_id = ?`).get(req.params.id, req.funcionario.loja_id)
    : db.prepare(`SELECT * FROM ordens_servico WHERE id = ? AND loja_id = ? AND vendedor_id = ?`).get(req.params.id, req.funcionario.loja_id, req.funcionario.id);
  if (!os) return res.status(404).json({ error: 'OS não encontrada' });
  const { itens } = req.body;
  if (!itens || !itens.length) return res.json({ ok: true });

  const lojaId = req.funcionario.loja_id;
  const stmtMov = db.prepare(`INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, estoque_anterior, estoque_posterior, referencia, observacao, usuario_id, loja_id) VALUES (?, 'saida', ?, ?, ?, ?, 'Consumo OS', NULL, ?)`);

  db.transaction(() => {
    for (const { produto_id, quantidade } of itens) {
      const qtd = parseFloat(quantidade) || 0;
      if (!produto_id || qtd <= 0) continue;
      const pid = parseInt(produto_id);
      const p = db.prepare('SELECT estoque FROM produtos WHERE id = ?').get(pid);
      if (!p) continue;
      const novoEstoque = Math.max(0, p.estoque - qtd);
      db.prepare('UPDATE produtos SET estoque = MAX(0, estoque - ?) WHERE id = ?').run(qtd, pid);
      stmtMov.run(pid, qtd, p.estoque, novoEstoque, `OS ${os.numero}`, lojaId);
    }
  })();

  res.json({ ok: true });
});

// GET /api/app/perfil
router.get('/perfil', authFuncionario, (req, res) => {
  const func = db.prepare(`SELECT id, nome, email, telefone FROM vendedores WHERE id = ?`).get(req.funcionario.id);
  if (!func) return res.status(404).json({ error: 'Funcionário não encontrado' });
  res.json(func);
});

// GET /api/app/afiacao — lista fichas de afiação da loja (admin ou afiador)
router.get('/afiacao', authFuncionario, (req, res) => {
  const lojaAlvo = req.funcionario.loja_id;
  if (req.funcionario.tipo !== 'afiador' && !verificarAcessoAdm(req, lojaAlvo)) return res.status(403).json({ error: 'Sem permissão' });
  const fichas = db.prepare(`
    SELECT * FROM afiacao WHERE loja_id = ? ORDER BY criado_em DESC
  `).all(lojaAlvo);
  res.json(fichas);
});

// PUT /api/app/afiacao/:id/status — avança status de uma ficha (admin ou afiador)
router.put('/afiacao/:id/status', authFuncionario, async (req, res) => {
  const lojaAlvo = req.funcionario.loja_id;
  if (req.funcionario.tipo !== 'afiador' && !verificarAcessoAdm(req, lojaAlvo)) return res.status(403).json({ error: 'Sem permissão' });
  const { status } = req.body;
  const validos = ['aguardando', 'afiando', 'pronto', 'entregue'];
  if (!validos.includes(status)) return res.status(400).json({ error: 'Status inválido' });
  const agora = new Date().toLocaleDateString('en-CA') + ' ' + new Date().toLocaleTimeString('pt-BR');
  db.prepare(`
    UPDATE afiacao SET status = ?, atualizado_em = datetime('now','localtime')
    ${status === 'entregue' ? ", data_entrega = ?" : ""}
    WHERE id = ? AND loja_id = ?
  `).run(...(status === 'entregue' ? [status, agora, req.params.id, lojaAlvo] : [status, req.params.id, lojaAlvo]));
  const ficha = db.prepare('SELECT * FROM afiacao WHERE id = ?').get(req.params.id);
  if (!ficha) return res.status(404).json({ error: 'Ficha não encontrada' });
  if (status === 'entregue') _notificarClienteAfiacao(ficha).catch(() => {});
  res.json(ficha);
});

// GET /api/app/afiacao-historico — histórico de pagamentos ao afiador (admin ou afiador)
router.get('/afiacao-historico', authFuncionario, (req, res) => {
  const lojaAlvo = req.funcionario.loja_id;
  if (req.funcionario.tipo !== 'afiador' && !verificarAcessoAdm(req, lojaAlvo)) return res.status(403).json({ error: 'Sem permissão' });
  res.json(db.prepare(`
    SELECT * FROM pagamentos_afiador WHERE loja_id = ? ORDER BY pago_em DESC LIMIT 20
  `).all(lojaAlvo));
});

// GET /api/app/afiacao-pendente — afiador pendente de pagamento (admin ou afiador)
router.get('/afiacao-pendente', authFuncionario, (req, res) => {
  const lojaAlvo = req.funcionario.loja_id;
  if (req.funcionario.tipo !== 'afiador' && !verificarAcessoAdm(req, lojaAlvo)) return res.status(403).json({ error: 'Sem permissão' });
  const fichas = db.prepare(`
    SELECT * FROM afiacao WHERE loja_id = ? AND status = 'entregue' AND afiador_pago = 0
    ORDER BY COALESCE(data_entrega, criado_em) ASC
  `).all(lojaAlvo);
  const valorAfiador = parseFloat(db.prepare(`SELECT valor FROM configuracoes WHERE chave = 'valor_afiador'`).get()?.valor) || 0;
  const totalQtd = fichas.reduce((s, f) => s + Number(f.quantidade || 0), 0);
  res.json({ qtd: fichas.length, total: totalQtd * valorAfiador, valor_por_ficha: valorAfiador });
});

// POST /api/app/afiacao-pagar — registra pagamento ao afiador (admin only)
router.post('/afiacao-pagar', authFuncionario, (req, res) => {
  const lojaAlvo = req.funcionario.loja_id;
  if (!verificarAcessoAdm(req, lojaAlvo)) return res.status(403).json({ error: 'Sem permissão' });
  const fichas = db.prepare(`
    SELECT * FROM afiacao WHERE loja_id = ? AND status = 'entregue' AND afiador_pago = 0
  `).all(lojaAlvo);
  if (!fichas.length) return res.status(400).json({ erro: 'Nenhuma ficha pendente' });
  const valorAfiador = parseFloat(db.prepare(`SELECT valor FROM configuracoes WHERE chave = 'valor_afiador'`).get()?.valor) || 0;
  const total = fichas.reduce((s, f) => s + Number(f.quantidade || 0), 0) * valorAfiador;
  const datas = fichas.map(f => f.data_entrega || f.criado_em).filter(Boolean).sort();
  const info = db.prepare(`
    INSERT INTO pagamentos_afiador (loja_id, valor, qtd_fichas, data_inicio, data_fim)
    VALUES (?, ?, ?, ?, ?)
  `).run(lojaAlvo, total, fichas.length, datas[0]?.slice(0, 10) || null, datas[datas.length - 1]?.slice(0, 10) || null);
  db.prepare(`
    UPDATE afiacao SET afiador_pago = 1, pagamento_id = ?
    WHERE loja_id = ? AND status = 'entregue' AND afiador_pago = 0
  `).run(info.lastInsertRowid, lojaAlvo);
  res.json({ ok: true, total, qtd: fichas.length });
});

// ── Lembretes mobile ─────────────────────────────────────────────────────────

// GET /api/app/lembretes
router.get('/lembretes', authFuncionario, (req, res) => {
  const { status } = req.query;
  const isAdmin = req.funcionario.is_admin;
  const meuId = String(req.funcionario.id);

  // ADM vê todos da loja; técnico vê só os seus próprios
  let sql = `SELECT * FROM lembretes WHERE loja_id = ? AND origem = 'mobile'`;
  const params = [req.funcionario.loja_id];
  if (!isAdmin) { sql += ` AND destinatarios = ?`; params.push(meuId); }
  if (status) { sql += ` AND status = ?`; params.push(status); }
  sql += ` ORDER BY data_envio DESC`;
  const lembretes = db.prepare(sql).all(...params);

  // ADM recebe lista de vendedores para seleção; técnico recebe vazio
  const vendedores = isAdmin
    ? db.prepare(`SELECT id, nome, telefone FROM vendedores WHERE ativo = 1 AND loja_id = ? ORDER BY nome`).all(req.funcionario.loja_id)
    : [];

  const result = lembretes.map(l => {
    let destinatarios_nomes;
    if (l.destinatarios === 'todos') {
      destinatarios_nomes = 'Todos os funcionários';
    } else {
      const ids = l.destinatarios.split(',').map(Number);
      const nomes = vendedores.filter(v => ids.includes(v.id)).map(v => v.nome);
      destinatarios_nomes = nomes.length ? nomes.join(', ') : 'Eu mesmo';
    }
    return { ...l, destinatarios_nomes };
  });

  res.json({ lembretes: result, vendedores });
});

// POST /api/app/lembretes
router.post('/lembretes', authFuncionario, (req, res) => {
  const { mensagem, data_envio, destinatarios } = req.body;
  if (!mensagem?.trim()) return res.status(400).json({ error: 'Mensagem é obrigatória' });
  if (!data_envio) return res.status(400).json({ error: 'Data e hora são obrigatórias' });

  // Técnico só pode agendar para si mesmo
  const dest = req.funcionario.is_admin
    ? (destinatarios === 'todos' || !destinatarios ? 'todos' : destinatarios)
    : String(req.funcionario.id);

  const r = db.prepare(
    `INSERT INTO lembretes (mensagem, data_envio, destinatarios, loja_id, origem) VALUES (?, ?, ?, ?, 'mobile')`
  ).run(mensagem.trim(), data_envio, dest, req.funcionario.loja_id);
  res.json({ id: r.lastInsertRowid, ok: true });
});

// DELETE /api/app/lembretes/:id
router.delete('/lembretes/:id', authFuncionario, (req, res) => {
  const meuId = String(req.funcionario.id);
  const l = db.prepare(
    `SELECT * FROM lembretes WHERE id = ? AND loja_id = ? AND origem = 'mobile'`
  ).get(req.params.id, req.funcionario.loja_id);
  if (!l) return res.status(404).json({ error: 'Lembrete não encontrado' });
  // Técnico só pode excluir os próprios
  if (!req.funcionario.is_admin && l.destinatarios !== meuId) return res.status(403).json({ error: 'Sem permissão' });
  if (l.status === 'pendente') {
    db.prepare(`UPDATE lembretes SET status = 'cancelado' WHERE id = ?`).run(req.params.id);
    res.json({ ok: true, acao: 'cancelado' });
  } else {
    db.prepare('DELETE FROM lembretes WHERE id = ?').run(req.params.id);
    res.json({ ok: true, acao: 'excluido' });
  }
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

// Função exportada para notificar afiador (tabela usuarios) quando nova ficha chega
async function notificarAfiadorApp(lojaId, titulo, mensagem) {
  const afiador = db.prepare(
    `SELECT expo_push_token FROM usuarios WHERE loja_id = ? AND perfil = 'afiador' AND ativo = 1 AND expo_push_token IS NOT NULL LIMIT 1`
  ).get(lojaId);
  if (!afiador?.expo_push_token) return;
  if (!admin.apps.length) { console.error('Firebase Admin não inicializado'); return; }
  try {
    await admin.messaging().send({
      token: afiador.expo_push_token,
      notification: { title: titulo, body: mensagem },
      android: {
        priority: 'high',
        notification: { channelId: 'chaveiro_alerts', sound: 'default' }
      }
    });
  } catch (e) {
    console.error('Erro ao enviar FCM para afiador:', e.message);
  }
}

module.exports = { router, notificarFuncionario, notificarAfiadorApp };
