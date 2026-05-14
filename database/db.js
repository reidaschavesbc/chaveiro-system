const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'chaveiro.db');
const db = new Database(dbPath);

// WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      senha TEXT NOT NULL,
      perfil TEXT NOT NULL DEFAULT 'operador',
      ativo INTEGER NOT NULL DEFAULT 1,
      criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      cpf TEXT,
      telefone TEXT,
      email TEXT,
      endereco TEXT,
      cidade TEXT,
      observacoes TEXT,
      ativo INTEGER NOT NULL DEFAULT 1,
      criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS produtos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      descricao TEXT,
      codigo TEXT UNIQUE,
      preco_custo REAL NOT NULL DEFAULT 0,
      preco_venda REAL NOT NULL DEFAULT 0,
      estoque INTEGER NOT NULL DEFAULT 0,
      estoque_minimo INTEGER NOT NULL DEFAULT 5,
      unidade TEXT NOT NULL DEFAULT 'un',
      ativo INTEGER NOT NULL DEFAULT 1,
      criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS tipos_servico (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      descricao TEXT,
      preco_base REAL NOT NULL DEFAULT 0,
      ativo INTEGER NOT NULL DEFAULT 1,
      criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS ordens_servico (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero TEXT UNIQUE NOT NULL,
      cliente_id INTEGER,
      tipo_servico_id INTEGER,
      descricao TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'aberta',
      valor REAL NOT NULL DEFAULT 0,
      data_entrada TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      data_prevista TEXT,
      data_conclusao TEXT,
      forma_pagamento TEXT,
      observacoes TEXT,
      usuario_id INTEGER,
      vendedor_id INTEGER,
      motivo_cancelamento TEXT,
      FOREIGN KEY (vendedor_id) REFERENCES vendedores(id),
      FOREIGN KEY (cliente_id) REFERENCES clientes(id),
      FOREIGN KEY (tipo_servico_id) REFERENCES tipos_servico(id),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    );

    CREATE TABLE IF NOT EXISTS vendas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero TEXT UNIQUE NOT NULL,
      cliente_id INTEGER,
      total REAL NOT NULL DEFAULT 0,
      desconto REAL NOT NULL DEFAULT 0,
      total_final REAL NOT NULL DEFAULT 0,
      forma_pagamento TEXT NOT NULL DEFAULT 'dinheiro',
      status TEXT NOT NULL DEFAULT 'concluida',
      observacoes TEXT,
      usuario_id INTEGER,
      data TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      motivo_cancelamento TEXT,
      FOREIGN KEY (cliente_id) REFERENCES clientes(id),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    );

    CREATE TABLE IF NOT EXISTS itens_venda (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venda_id INTEGER NOT NULL,
      produto_id INTEGER,
      servico_id INTEGER,
      descricao TEXT NOT NULL,
      quantidade REAL NOT NULL DEFAULT 1,
      preco_unitario REAL NOT NULL DEFAULT 0,
      subtotal REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (venda_id) REFERENCES vendas(id),
      FOREIGN KEY (produto_id) REFERENCES produtos(id),
      FOREIGN KEY (servico_id) REFERENCES tipos_servico(id)
    );

    CREATE TABLE IF NOT EXISTS movimentacoes_estoque (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produto_id INTEGER NOT NULL,
      tipo TEXT NOT NULL,
      quantidade INTEGER NOT NULL,
      estoque_anterior INTEGER NOT NULL,
      estoque_posterior INTEGER NOT NULL,
      referencia TEXT,
      observacao TEXT,
      usuario_id INTEGER,
      data TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (produto_id) REFERENCES produtos(id),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    );

    CREATE TABLE IF NOT EXISTS configuracoes (
      chave TEXT PRIMARY KEY,
      valor TEXT
    );

    CREATE TABLE IF NOT EXISTS itens_ordem_servico (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ordem_id INTEGER NOT NULL,
      produto_id INTEGER,
      servico_id INTEGER,
      descricao TEXT NOT NULL,
      quantidade REAL NOT NULL DEFAULT 1,
      preco_unitario REAL NOT NULL DEFAULT 0,
      subtotal REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (ordem_id) REFERENCES ordens_servico(id) ON DELETE CASCADE,
      FOREIGN KEY (produto_id) REFERENCES produtos(id),
      FOREIGN KEY (servico_id) REFERENCES tipos_servico(id)
    );

    CREATE TABLE IF NOT EXISTS pagamentos_venda (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venda_id INTEGER NOT NULL,
      metodo TEXT NOT NULL, -- 'dinheiro', 'pix', 'cartao1', 'cartao2'
      valor REAL NOT NULL,
      FOREIGN KEY (venda_id) REFERENCES vendas(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS vendedores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      ativo INTEGER NOT NULL DEFAULT 1,
      criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
  `);

  // Seed admin user if not exists
  const admin = db.prepare('SELECT id FROM usuarios WHERE email = ?').get('admin');
  if (!admin) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare("INSERT INTO usuarios (nome, email, senha, perfil) VALUES (?, ?, ?, ?)").run('Administrador', 'admin', hash, 'admin');
  }


  db.exec(`
    CREATE TABLE IF NOT EXISTS gastos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      descricao TEXT NOT NULL,
      valor REAL NOT NULL DEFAULT 0,
      categoria TEXT NOT NULL DEFAULT 'outros',
      data TEXT NOT NULL DEFAULT (date('now','localtime')),
      observacoes TEXT
    );

    CREATE TABLE IF NOT EXISTS fechamentos_comissao (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mes INTEGER NOT NULL,
      ano INTEGER NOT NULL,
      data_fechamento TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      total_geral REAL NOT NULL DEFAULT 0,
      enviado_whatsapp INTEGER NOT NULL DEFAULT 0,
      UNIQUE(mes, ano)
    );

    CREATE TABLE IF NOT EXISTS comissoes_itens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fechamento_id INTEGER NOT NULL,
      vendedor_id INTEGER NOT NULL,
      vendedor_nome TEXT NOT NULL,
      percentual REAL NOT NULL DEFAULT 0,
      ordem_id INTEGER NOT NULL,
      ordem_numero TEXT NOT NULL,
      valor_os REAL NOT NULL DEFAULT 0,
      valor_comissao REAL NOT NULL DEFAULT 0,
      data_conclusao TEXT NOT NULL,
      FOREIGN KEY (fechamento_id) REFERENCES fechamentos_comissao(id),
      FOREIGN KEY (vendedor_id) REFERENCES vendedores(id),
      FOREIGN KEY (ordem_id) REFERENCES ordens_servico(id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS lembretes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mensagem TEXT NOT NULL,
      data_envio TEXT NOT NULL,
      destinatarios TEXT NOT NULL DEFAULT 'todos',
      status TEXT NOT NULL DEFAULT 'pendente',
      enviado_em TEXT,
      erros TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
  `);

  // Migrações incrementais (ALTER TABLE ignora erro se coluna já existir)
  try { db.exec('ALTER TABLE vendedores ADD COLUMN telefone TEXT'); } catch (_) {}
  try { db.exec('ALTER TABLE ordens_servico ADD COLUMN lembrete_enviado INTEGER NOT NULL DEFAULT 0'); } catch (_) {}
  try { db.exec('ALTER TABLE ordens_servico ADD COLUMN cliente_nome_avulso TEXT'); } catch (_) {}
  try { db.exec('ALTER TABLE vendas ADD COLUMN cliente_nome_avulso TEXT'); } catch (_) {}
  // Clientes - campos de endereço detalhado e CNPJ
  try { db.exec('ALTER TABLE clientes ADD COLUMN cnpj TEXT'); } catch (_) {}
  try { db.exec('ALTER TABLE clientes ADD COLUMN cep TEXT'); } catch (_) {}
  try { db.exec('ALTER TABLE clientes ADD COLUMN numero TEXT'); } catch (_) {}
  try { db.exec('ALTER TABLE clientes ADD COLUMN complemento TEXT'); } catch (_) {}
  try { db.exec('ALTER TABLE clientes ADD COLUMN bairro TEXT'); } catch (_) {}
  try { db.exec('ALTER TABLE clientes ADD COLUMN referencia TEXT'); } catch (_) {}
  // OS - endereço de cliente avulso
  try { db.exec('ALTER TABLE ordens_servico ADD COLUMN cliente_avulso_rua TEXT'); } catch (_) {}
  try { db.exec('ALTER TABLE ordens_servico ADD COLUMN cliente_avulso_numero TEXT'); } catch (_) {}
  try { db.exec('ALTER TABLE ordens_servico ADD COLUMN cliente_avulso_complemento TEXT'); } catch (_) {}
  try { db.exec('ALTER TABLE ordens_servico ADD COLUMN cliente_avulso_cidade TEXT'); } catch (_) {}
  try { db.exec('ALTER TABLE ordens_servico ADD COLUMN cliente_avulso_referencia TEXT'); } catch (_) {}
  try { db.exec('ALTER TABLE vendedores ADD COLUMN percentual_comissao REAL NOT NULL DEFAULT 0'); } catch (_) {}
  try { db.exec('ALTER TABLE vendedores ADD COLUMN salario_base REAL NOT NULL DEFAULT 0'); } catch (_) {}
  try { db.exec("ALTER TABLE pedidos_compra ADD COLUMN prioridade TEXT NOT NULL DEFAULT 'media'"); } catch (_) {}
  try { db.exec('ALTER TABLE pedidos_compra ADD COLUMN confirmado INTEGER NOT NULL DEFAULT 0'); } catch (_) {}
  try { db.exec('ALTER TABLE pedidos_compra ADD COLUMN confirmado_em TEXT'); } catch (_) {}
  try { db.exec('ALTER TABLE pedidos_compra ADD COLUMN ultimo_aviso TEXT'); } catch (_) {}
  try { db.exec('ALTER TABLE pedidos_compra ADD COLUMN silenciado_ate TEXT'); } catch (_) {}
  try { db.exec('ALTER TABLE vendedores ADD COLUMN meta REAL NOT NULL DEFAULT 0'); } catch (_) {}
  try { db.exec('ALTER TABLE vendedores ADD COLUMN bonus_meta REAL NOT NULL DEFAULT 0'); } catch (_) {}
  try { db.exec('ALTER TABLE ordens_servico ADD COLUMN a_receber INTEGER NOT NULL DEFAULT 0'); } catch (_) {}
  try { db.exec('ALTER TABLE ordens_servico ADD COLUMN data_vencimento TEXT'); } catch (_) {}
  try { db.exec('ALTER TABLE ordens_servico ADD COLUMN a_receber_pago INTEGER NOT NULL DEFAULT 0'); } catch (_) {}
  try { db.exec('ALTER TABLE ordens_servico ADD COLUMN data_recebimento TEXT'); } catch (_) {}
  try { db.exec('ALTER TABLE ordens_servico ADD COLUMN solicitado_por TEXT'); } catch (_) {}
  try { db.exec('ALTER TABLE ordens_servico ADD COLUMN cobranca_pausado_em TEXT'); } catch (_) {}
  try { db.exec('ALTER TABLE ordens_servico ADD COLUMN valor_pago REAL NOT NULL DEFAULT 0'); } catch (_) {}
  try { db.exec('ALTER TABLE produtos ADD COLUMN imagem TEXT'); } catch (_) {}
  try { db.exec('ALTER TABLE ordens_servico ADD COLUMN chave_auto INTEGER NOT NULL DEFAULT 0'); } catch (_) {}
  try { db.exec('ALTER TABLE tipos_servico ADD COLUMN produto_id INTEGER'); } catch (_) {}
  try { db.exec('ALTER TABLE tipos_servico ADD COLUMN produto_quantidade REAL NOT NULL DEFAULT 1'); } catch (_) {}
  try { db.exec('ALTER TABLE ordens_servico ADD COLUMN orcamento INTEGER NOT NULL DEFAULT 0'); } catch (_) {}
  try { db.exec('ALTER TABLE ordens_servico ADD COLUMN desconto REAL NOT NULL DEFAULT 0'); } catch (_) {}
  try { db.exec('ALTER TABLE produtos ADD COLUMN perguntar_estoque INTEGER NOT NULL DEFAULT 0'); } catch (_) {}
  try { db.exec('ALTER TABLE tipos_servico ADD COLUMN perguntar_estoque INTEGER NOT NULL DEFAULT 0'); } catch (_) {}
  try { db.exec('ALTER TABLE fechamentos_comissao ADD COLUMN total_vales REAL NOT NULL DEFAULT 0'); } catch (_) {}
  try { db.exec('ALTER TABLE fechamentos_comissao ADD COLUMN total_liquido REAL NOT NULL DEFAULT 0'); } catch (_) {}
  try { db.exec('ALTER TABLE fechamentos_comissao ADD COLUMN total_salarios REAL NOT NULL DEFAULT 0'); } catch (_) {}
  try { db.exec('ALTER TABLE fechamentos_comissao ADD COLUMN total_bonus REAL NOT NULL DEFAULT 0'); } catch (_) {}
  try { db.exec('ALTER TABLE fechamentos_comissao ADD COLUMN total_a_pagar REAL NOT NULL DEFAULT 0'); } catch (_) {}
  db.exec(`
    CREATE TABLE IF NOT EXISTS pagamentos_os (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ordem_id INTEGER NOT NULL,
      metodo TEXT NOT NULL,
      valor REAL NOT NULL,
      criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (ordem_id) REFERENCES ordens_servico(id)
    );
  `);
  // Corrige OS concluídas que tiveram data_conclusao apagada por bug no PUT
  db.exec(`UPDATE ordens_servico SET data_conclusao = data_entrada WHERE status = 'concluida' AND data_conclusao IS NULL`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS vales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendedor_id INTEGER NOT NULL,
      valor REAL NOT NULL,
      descricao TEXT,
      data TEXT NOT NULL DEFAULT (date('now','localtime')),
      fechamento_id INTEGER,
      usuario_id INTEGER,
      criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (vendedor_id) REFERENCES vendedores(id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS orcamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero TEXT UNIQUE NOT NULL,
      cliente_id INTEGER,
      cliente_nome_avulso TEXT,
      cliente_telefone_avulso TEXT,
      descricao TEXT NOT NULL,
      validade_dias INTEGER NOT NULL DEFAULT 7,
      status TEXT NOT NULL DEFAULT 'pendente',
      observacoes TEXT,
      vendedor_id INTEGER,
      total REAL NOT NULL DEFAULT 0,
      usuario_id INTEGER,
      criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (cliente_id) REFERENCES clientes(id),
      FOREIGN KEY (vendedor_id) REFERENCES vendedores(id),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    );
    CREATE TABLE IF NOT EXISTS itens_orcamento (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orcamento_id INTEGER NOT NULL,
      produto_id INTEGER,
      servico_id INTEGER,
      descricao TEXT NOT NULL,
      quantidade REAL NOT NULL DEFAULT 1,
      preco_unitario REAL NOT NULL DEFAULT 0,
      subtotal REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (orcamento_id) REFERENCES orcamentos(id) ON DELETE CASCADE,
      FOREIGN KEY (produto_id) REFERENCES produtos(id),
      FOREIGN KEY (servico_id) REFERENCES tipos_servico(id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS pagamentos_cobranca (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ordem_id INTEGER NOT NULL,
      valor REAL NOT NULL,
      forma_pagamento TEXT NOT NULL DEFAULT 'dinheiro',
      observacoes TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (ordem_id) REFERENCES ordens_servico(id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS clientes_autorizados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER NOT NULL,
      nome TEXT NOT NULL,
      telefone TEXT,
      cargo TEXT,
      ativo INTEGER NOT NULL DEFAULT 1,
      criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS pedidos_compra (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produto_id INTEGER,
      descricao TEXT NOT NULL,
      quantidade INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'pendente',
      origem TEXT NOT NULL DEFAULT 'manual',
      observacoes TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      comprado_em TEXT,
      FOREIGN KEY (produto_id) REFERENCES produtos(id)
    );
  `);

  // Lojas e multi-usuário
  db.exec(`
    CREATE TABLE IF NOT EXISTS lojas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      ativo INTEGER NOT NULL DEFAULT 1,
      criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
  `);

  // Migrations seguras — adiciona loja_id em todas as tabelas operacionais
  const addCol = (tabela, col, def = 'INTEGER') => {
    const cols = db.pragma(`table_info(${tabela})`).map(c => c.name);
    if (!cols.includes(col)) db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${col} ${def}`);
  };

  addCol('usuarios',             'loja_id',  'INTEGER REFERENCES lojas(id)');
  addCol('usuarios',             'principal','INTEGER NOT NULL DEFAULT 0');
  addCol('clientes',             'loja_id',  'INTEGER');
  addCol('clientes_autorizados', 'loja_id',  'INTEGER');
  addCol('produtos',             'loja_id',  'INTEGER');
  addCol('tipos_servico',        'loja_id',  'INTEGER');
  addCol('vendedores',           'loja_id',  'INTEGER');
  addCol('ordens_servico',       'loja_id',  'INTEGER');
  addCol('vendas',               'loja_id',  'INTEGER');
  addCol('gastos',               'loja_id',  'INTEGER');
  addCol('vales',                'loja_id',  'INTEGER');
  addCol('fechamentos_comissao', 'loja_id',  'INTEGER');
  addCol('lembretes',            'loja_id',  'INTEGER');
  addCol('pedidos_compra',       'loja_id',  'INTEGER');
  addCol('orcamentos',           'loja_id',  'INTEGER');
  addCol('movimentacoes_estoque','loja_id',  'INTEGER');

  // App mobile — funcionários
  addCol('vendedores', 'email',           'TEXT');
  addCol('vendedores', 'senha',           'TEXT');
  addCol('vendedores', 'expo_push_token', 'TEXT');

  // Estoque por sub-usuário
  db.exec(`
    CREATE TABLE IF NOT EXISTS estoque_usuario (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      produto_id INTEGER NOT NULL,
      loja_id INTEGER NOT NULL,
      quantidade INTEGER NOT NULL DEFAULT 0,
      UNIQUE(usuario_id, produto_id)
    );
    CREATE TABLE IF NOT EXISTS pedidos_estoque (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loja_id INTEGER NOT NULL,
      solicitante_id INTEGER NOT NULL,
      produto_id INTEGER NOT NULL,
      quantidade INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendente',
      observacao TEXT,
      respondido_por INTEGER,
      resposta TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      respondido_em TEXT
    );
  `);

  // Default config
  db.prepare("INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('empresa_nome', 'Chaveiro')").run();
  db.prepare("INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('empresa_telefone', '')").run();
  db.prepare("INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('empresa_endereco', '')").run();
  db.prepare("INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('empresa_cnpj', '')").run();
  db.prepare("INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('whatsapp_comissao', '')").run();
  db.prepare("INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('whatsapp_cobrancas', '')").run();
  db.prepare("INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('senha_gerente', '')").run();
  db.prepare("INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('whatsapp_pedidos', '')").run();

  // NFS-e config
  db.prepare("INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('nfse_cnpj', '41370832000187')").run();
  db.prepare("INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('nfse_inscricao_municipal', '184784')").run();
  db.prepare("INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('nfse_aliquota_iss', '2.00')").run();
  db.prepare("INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('nfse_cod_trib_nac', '14.01')").run();
  db.prepare("INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('nfse_cod_trib_mun', '')").run();
  db.prepare("INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('nfse_cnae', '4744005')").run();
  db.prepare("INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('nfse_regime_tributario', 'simples')").run();
  db.prepare("INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('nfse_ambiente', '2')").run();
  db.prepare("INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('nfse_pfx_senha', '123456')").run();

  // Colunas NFS-e na tabela ordens_servico
  try { db.exec('ALTER TABLE ordens_servico ADD COLUMN nfse_numero TEXT'); } catch (_) {}
  try { db.exec('ALTER TABLE ordens_servico ADD COLUMN nfse_chave_acesso TEXT'); } catch (_) {}
  try { db.exec('ALTER TABLE ordens_servico ADD COLUMN nfse_status TEXT'); } catch (_) {}
  try { db.exec('ALTER TABLE ordens_servico ADD COLUMN nfse_xml_dps TEXT'); } catch (_) {}
  try { db.exec('ALTER TABLE ordens_servico ADD COLUMN nfse_emitida_em TEXT'); } catch (_) {}
  try { db.exec('ALTER TABLE ordens_servico ADD COLUMN nfse_ambiente TEXT'); } catch (_) {}
  try { db.exec('ALTER TABLE ordens_servico ADD COLUMN nfse_numero_seq INTEGER'); } catch (_) {}

  console.log('✅ Banco de dados inicializado com sucesso!');
}

migrate();

// Função customizada para busca sem acento e sem diferença de maiúsculas
db.function('norm', s => {
  if (!s) return '';
  // Remove combining diacritical marks (U+0300 to U+036F) after NFD decomposition
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
});

module.exports = db;
