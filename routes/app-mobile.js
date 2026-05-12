const express = require('express');
const router = express.Router();
const db = require('../database/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Expo } = require('expo-server-sdk');

const expo = new Expo();
const JWT_SECRET = process.env.JWT_SECRET || 'chaveiro_super_secret_key_2024';

// Middleware auth para funcionários
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

// POST /api/app/login
router.post('/login', (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ error: 'Email e senha são obrigatórios' });

  const func = db.prepare(`SELECT * FROM vendedores WHERE email = ? AND ativo = 1`).get(email);
  if (!func || !func.senha) return res.status(401).json({ error: 'Credenciais inválidas' });

  if (!bcrypt.compareSync(senha, func.senha)) return res.status(401).json({ error: 'Credenciais inválidas' });

  const token = jwt.sign(
    { id: func.id, nome: func.nome, loja_id: func.loja_id, tipo: 'funcionario' },
    JWT_SECRET,
    { expiresIn: '30d' }
  );

  res.json({ token, funcionario: { id: func.id, nome: func.nome, email: func.email, loja_id: func.loja_id } });
});

// POST /api/app/push-token — salva token de notificação do celular
router.post('/push-token', authFuncionario, (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token é obrigatório' });
  db.prepare(`UPDATE vendedores SET expo_push_token = ? WHERE id = ?`).run(token, req.funcionario.id);
  res.json({ ok: true });
});

// GET /api/app/os — lista OS do funcionário
router.get('/os', authFuncionario, (req, res) => {
  const { status } = req.query;
  let sql = `
    SELECT os.id, os.numero, os.descricao, os.valor, os.status,
           os.data_entrada, os.data_prevista, os.data_conclusao,
           os.forma_pagamento, os.observacoes, os.a_receber, os.a_receber_pago,
           COALESCE(c.nome, os.cliente_nome_avulso, 'Avulso') as cliente_nome,
           c.telefone as cliente_telefone
    FROM ordens_servico os
    LEFT JOIN clientes c ON os.cliente_id = c.id
    WHERE os.loja_id = ? AND os.vendedor_id = ?`
  const params = [req.funcionario.loja_id, req.funcionario.id];

  if (status) { sql += ` AND os.status = ?`; params.push(status); }
  else { sql += ` AND os.status IN ('aberta', 'em_andamento')`; }

  sql += ` ORDER BY os.data_entrada DESC LIMIT 50`;
  res.json(db.prepare(sql).all(...params));
});

// GET /api/app/os/:id — detalhe da OS
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
    SELECT iv.*, p.nome as produto_nome, ts.nome as servico_nome
    FROM itens_ordem_servico iv
    LEFT JOIN produtos p ON iv.produto_id = p.id
    LEFT JOIN tipos_servico ts ON iv.servico_id = ts.id
    WHERE iv.ordem_id = ?
  `).all(os.id);

  res.json({ ...os, itens });
});

// PUT /api/app/os/:id — atualiza OS
router.put('/os/:id', authFuncionario, (req, res) => {
  const os = db.prepare(`SELECT * FROM ordens_servico WHERE id = ? AND loja_id = ? AND vendedor_id = ?`)
    .get(req.params.id, req.funcionario.loja_id, req.funcionario.id);
  if (!os) return res.status(404).json({ error: 'OS não encontrada' });

  const { status, observacoes, forma_pagamento, valor } = req.body;

  const STATUSES = ['aberta', 'em_andamento', 'concluida', 'cancelada'];
  if (status && !STATUSES.includes(status)) return res.status(400).json({ error: 'Status inválido' });

  let data_conclusao = os.data_conclusao;
  if (status === 'concluida' && !os.data_conclusao) {
    const now = new Date();
    data_conclusao = now.toLocaleDateString('en-CA') + ' ' + now.toLocaleTimeString('pt-BR');
  }

  db.prepare(`
    UPDATE ordens_servico SET
      status = COALESCE(?, status),
      observacoes = COALESCE(?, observacoes),
      forma_pagamento = COALESCE(?, forma_pagamento),
      valor = COALESCE(?, valor),
      data_conclusao = ?
    WHERE id = ?
  `).run(status || null, observacoes || null, forma_pagamento || null, valor || null, data_conclusao, os.id);

  res.json({ ok: true });
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
  if (!func?.expo_push_token || !Expo.isExpoPushToken(func.expo_push_token)) return;

  try {
    await expo.sendPushNotificationsAsync([{
      to: func.expo_push_token,
      sound: 'default',
      title: titulo,
      body: mensagem,
      data: { tipo: 'nova_os' }
    }]);
  } catch (e) {
    console.error('Erro ao enviar push notification:', e.message);
  }
}

module.exports = { router, notificarFuncionario };
