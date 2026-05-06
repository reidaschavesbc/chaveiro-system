const router = require('express').Router()
const db = require('../database/db')
const Anthropic = require('@anthropic-ai/sdk')
const { verificarEstoqueBaixo } = require('./pedidos')
const { executarFechamento: _fecharComissoes, MESES } = require('./comissoes')

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDateRange(periodo, data_inicio, data_fim) {
  const hoje = new Date()
  const pad = n => String(n).padStart(2, '0')
  const hojeStr = `${hoje.getFullYear()}-${pad(hoje.getMonth()+1)}-${pad(hoje.getDate())}`
  if (periodo === 'hoje') return { di: hojeStr, df: hojeStr }
  if (periodo === 'semana') {
    const ini = new Date(hoje); ini.setDate(hoje.getDate() - 6)
    return { di: `${ini.getFullYear()}-${pad(ini.getMonth()+1)}-${pad(ini.getDate())}`, df: hojeStr }
  }
  if (periodo === 'mes') return { di: `${hoje.getFullYear()}-${pad(hoje.getMonth()+1)}-01`, df: hojeStr }
  return { di: data_inicio || hojeStr.slice(0, 7) + '-01', df: data_fim || hojeStr }
}

function gerarNumeroOS() {
  const now = new Date()
  const ano = now.getFullYear().toString().slice(2)
  const mes = String(now.getMonth() + 1).padStart(2, '0')
  const count = db.prepare("SELECT COUNT(*) as c FROM ordens_servico WHERE strftime('%Y-%m', data_entrada) = ?").get(`${now.getFullYear()}-${mes}`)
  return `OS${ano}${mes}${String(count.c + 1).padStart(4, '0')}`
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

const tools = [
  {
    name: 'resumo_geral',
    description: 'Retorna visão completa do negócio: caixa de hoje, OS abertas, a receber, estoque baixo, resultado do mês, pedidos e lembretes pendentes. Use para "como tá o negócio?", "tudo certo?", "resumo do dia", "overview", "situação geral".',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'fechamento_caixa',
    description: 'Retorna fechamento de caixa: total de vendas e OS concluídas num período, separado por forma de pagamento. Use para "fechar o caixa", "quanto entrou hoje/semana/mês", "faturamento", "resumo financeiro".',
    input_schema: {
      type: 'object',
      properties: {
        periodo: { type: 'string', enum: ['hoje', 'semana', 'mes', 'personalizado'], description: 'Período do fechamento' },
        data_inicio: { type: 'string', description: 'YYYY-MM-DD (só para personalizado)' },
        data_fim: { type: 'string', description: 'YYYY-MM-DD (só para personalizado)' }
      },
      required: ['periodo']
    }
  },
  {
    name: 'buscar_os',
    description: 'Busca ordens de serviço por número, cliente ou status. Use para ver uma OS específica, listar OS de um cliente, listar por status.',
    input_schema: {
      type: 'object',
      properties: {
        numero: { type: 'string', description: 'Número da OS (ex: OS2504001)' },
        cliente_nome: { type: 'string', description: 'Nome parcial do cliente' },
        status: { type: 'string', enum: ['aberta', 'em_andamento', 'concluida', 'cancelada'], description: 'Filtrar por status' },
        limite: { type: 'number', description: 'Máximo de resultados (padrão 10)' }
      }
    }
  },
  {
    name: 'cobrancas_abertas',
    description: 'Lista OS abertas ou em andamento (não concluídas). Use para "OS em aberto", "serviços pendentes", "o que X tem em aberto".',
    input_schema: {
      type: 'object',
      properties: {
        cliente_nome: { type: 'string', description: 'Nome parcial do cliente para filtrar' }
      }
    }
  },
  {
    name: 'historico_cliente',
    description: 'Histórico completo de um cliente: OS, vendas, total gasto e em aberto. Use para "histórico do cliente X", "quanto X gastou", "o que X comprou".',
    input_schema: {
      type: 'object',
      properties: { cliente_nome: { type: 'string', description: 'Nome do cliente (pode ser parcial)' } },
      required: ['cliente_nome']
    }
  },
  {
    name: 'estoque_baixo',
    description: 'Lista produtos com estoque abaixo do mínimo. Use para "estoque baixo", "o que precisa repor", "produtos acabando".',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'buscar_produto',
    description: 'Busca produto por nome ou código: estoque, preços e situação. Use para "quanto tem de X", "preço do produto Y", "estoque de chave".',
    input_schema: {
      type: 'object',
      properties: { busca: { type: 'string', description: 'Nome ou código do produto' } },
      required: ['busca']
    }
  },
  {
    name: 'a_receber_pendente',
    description: 'Lista OS marcadas como "A Receber" ainda não pagas: vencidas, vencendo hoje e futuras. Use para "a receber", "quem deve", "cobranças pendentes", "OS não pagas".',
    input_schema: {
      type: 'object',
      properties: {
        apenas_vencidas: { type: 'boolean', description: 'Se true, retorna apenas vencidas e que vencem hoje' }
      }
    }
  },
  {
    name: 'gastos_periodo',
    description: 'Gastos/despesas num período, agrupados por categoria. Use para "quanto gastei", "despesas do mês", "gastos com combustível", "resultado do mês".',
    input_schema: {
      type: 'object',
      properties: {
        periodo: { type: 'string', enum: ['hoje', 'semana', 'mes', 'personalizado'] },
        categoria: { type: 'string', enum: ['material', 'combustivel', 'alimentacao', 'manutencao', 'servicos', 'outros'], description: 'Filtrar por categoria. Omita para ver todas.' },
        data_inicio: { type: 'string', description: 'YYYY-MM-DD (só para personalizado)' },
        data_fim: { type: 'string', description: 'YYYY-MM-DD (só para personalizado)' }
      },
      required: ['periodo']
    }
  },
  {
    name: 'desempenho_vendedor',
    description: 'Desempenho dos funcionários: OS concluídas, faturamento e comissão estimada. Use para "como está o João", "desempenho dos funcionários", "ranking", "comissão do mês".',
    input_schema: {
      type: 'object',
      properties: {
        periodo: { type: 'string', enum: ['hoje', 'semana', 'mes'] },
        vendedor_nome: { type: 'string', description: 'Nome do funcionário para filtrar. Omita para ver todos.' }
      },
      required: ['periodo']
    }
  },
  {
    name: 'resultado_liquido',
    description: 'Calcula o resultado líquido completo de um período: faturamento bruto (OS + vendas), gastos/despesas por categoria, comissões de cada funcionário, e lucro líquido final já descontando tudo. Use para "resultado do mês", "lucro líquido", "quanto sobrou", "DRE", "quanto entrou menos o que saiu", "resultado descontando comissão".',
    input_schema: {
      type: 'object',
      properties: {
        periodo: { type: 'string', enum: ['hoje', 'semana', 'mes', 'personalizado'], description: 'Período da análise' },
        data_inicio: { type: 'string', description: 'YYYY-MM-DD (só para personalizado)' },
        data_fim: { type: 'string', description: 'YYYY-MM-DD (só para personalizado)' }
      },
      required: ['periodo']
    }
  },
  {
    name: 'consumo_periodo',
    description: 'Histórico de consumo interno: materiais usados sem cobrança (erro de corte, garantia, uso interno). Use para "quanto consumi", "perdas do mês", "consumo interno", "materiais gastos".',
    input_schema: {
      type: 'object',
      properties: {
        periodo: { type: 'string', enum: ['hoje', 'semana', 'mes', 'personalizado'] },
        categoria: { type: 'string', enum: ['erro_corte', 'garantia', 'uso_interno', 'outros'] },
        data_inicio: { type: 'string', description: 'YYYY-MM-DD (só para personalizado)' },
        data_fim: { type: 'string', description: 'YYYY-MM-DD (só para personalizado)' }
      }
    }
  },
  {
    name: 'listar_pedidos',
    description: 'Lista pedidos de compra. Use para "o que precisa comprar", "pedidos pendentes", "lista de compras", "o que tá faltando".',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pendente', 'comprado', 'cancelado'], description: 'Filtrar por status. Omita para pendentes.' }
      }
    }
  },
  {
    name: 'listar_lembretes',
    description: 'Lista lembretes agendados. Use para "meus lembretes", "lembretes pendentes", "o que está agendado", "lembretes de hoje".',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pendente', 'enviado', 'cancelado'], description: 'Filtrar por status (padrão: pendente)' }
      }
    }
  },
  {
    name: 'registrar_gasto',
    description: 'Registra um gasto/despesa no sistema. IMPORTANTE: antes de chamar, sempre apresente o resumo e aguarde confirmação do usuário.',
    input_schema: {
      type: 'object',
      properties: {
        descricao: { type: 'string', description: 'Descrição curta do gasto' },
        valor: { type: 'number', description: 'Valor em reais' },
        categoria: { type: 'string', enum: ['material', 'combustivel', 'alimentacao', 'manutencao', 'servicos', 'outros'] },
        data: { type: 'string', description: 'YYYY-MM-DD (padrão: hoje)' },
        observacoes: { type: 'string' }
      },
      required: ['descricao', 'valor', 'categoria']
    }
  },
  {
    name: 'criar_os',
    description: 'Cria uma nova Ordem de Serviço. Para cliente cadastrado use cliente_nome; para avulso use cliente_avulso_nome. IMPORTANTE: sempre confirme os dados com o usuário antes de chamar.',
    input_schema: {
      type: 'object',
      properties: {
        cliente_nome: { type: 'string', description: 'Nome do cliente cadastrado (busca parcial)' },
        cliente_avulso_nome: { type: 'string', description: 'Nome do cliente avulso (não cadastrado)' },
        descricao: { type: 'string', description: 'Descrição do serviço' },
        valor: { type: 'number', description: 'Valor em reais (use 0 se não definido)' },
        vendedor_nome: { type: 'string', description: 'Nome do funcionário responsável (busca parcial)' },
        data_prevista: { type: 'string', description: 'Data prevista no formato YYYY-MM-DD' },
        a_receber: { type: 'boolean', description: 'Marcar para cobrança posterior' },
        forma_pagamento: { type: 'string', enum: ['dinheiro', 'pix', 'debito', 'credito'] },
        observacoes: { type: 'string' }
      },
      required: ['descricao']
    }
  },
  {
    name: 'atualizar_status_os',
    description: 'Atualiza status de uma OS: concluir, cancelar, reabrir ou marcar como a receber. IMPORTANTE: sempre confirme com o usuário antes de chamar.',
    input_schema: {
      type: 'object',
      properties: {
        numero_os: { type: 'string', description: 'Número da OS (ex: OS2504001)' },
        novo_status: { type: 'string', enum: ['aberta', 'em_andamento', 'concluida', 'cancelada', 'a_receber'], description: '"a_receber" apenas marca a flag sem mudar o status da OS' },
        forma_pagamento: { type: 'string', enum: ['dinheiro', 'pix', 'debito', 'credito'], description: 'Forma de pagamento (ao concluir)' },
        valor: { type: 'number', description: 'Atualizar o valor da OS' }
      },
      required: ['numero_os', 'novo_status']
    }
  },
  {
    name: 'registrar_consumo_interno',
    description: 'Registra consumo interno de material (erro de corte, garantia, uso interno). Desconta do estoque sem gerar venda. IMPORTANTE: sempre confirme antes de chamar.',
    input_schema: {
      type: 'object',
      properties: {
        produto_nome: { type: 'string', description: 'Nome do produto (busca parcial)' },
        quantidade: { type: 'number', description: 'Quantidade consumida' },
        categoria: { type: 'string', enum: ['erro_corte', 'garantia', 'uso_interno', 'outros'] },
        os_referencia: { type: 'string', description: 'Número da OS relacionada (opcional)' },
        observacao: { type: 'string', description: 'Observação adicional' }
      },
      required: ['produto_nome', 'quantidade', 'categoria']
    }
  },
  {
    name: 'criar_lembrete',
    description: 'Cria um lembrete para enviar via WhatsApp numa data/hora específica. IMPORTANTE: sempre confirme antes de chamar.',
    input_schema: {
      type: 'object',
      properties: {
        mensagem: { type: 'string', description: 'Texto do lembrete' },
        data_hora: { type: 'string', description: 'Data e hora no formato YYYY-MM-DD HH:MM' },
        destinatarios: { type: 'string', description: '"todos" para todos os funcionários, ou nome de um funcionário específico' }
      },
      required: ['mensagem', 'data_hora']
    }
  },
  {
    name: 'adicionar_pedido_compra',
    description: 'Adiciona item à lista de pedidos de compra. IMPORTANTE: sempre confirme antes de chamar.',
    input_schema: {
      type: 'object',
      properties: {
        produto_nome: { type: 'string', description: 'Nome do produto (busca no cadastro)' },
        quantidade: { type: 'number', description: 'Quantidade a pedir (padrão 1)' },
        descricao: { type: 'string', description: 'Descrição alternativa se o produto não estiver cadastrado' }
      },
      required: ['produto_nome']
    }
  },
  {
    name: 'editar_os',
    description: 'Edita campos de uma OS existente: descrição, valor, cliente, funcionário, data prevista, observações, forma de pagamento, etc. Use quando o usuário quiser corrigir ou atualizar qualquer informação de uma OS já criada. IMPORTANTE: sempre confirme as alterações antes de chamar.',
    input_schema: {
      type: 'object',
      properties: {
        numero_os: { type: 'string', description: 'Número da OS (ex: OS2504001)' },
        descricao: { type: 'string', description: 'Nova descrição do serviço' },
        valor: { type: 'number', description: 'Novo valor em reais' },
        cliente_nome: { type: 'string', description: 'Nome do novo cliente cadastrado (busca parcial)' },
        cliente_avulso_nome: { type: 'string', description: 'Nome do cliente avulso' },
        vendedor_nome: { type: 'string', description: 'Nome do funcionário responsável (busca parcial)' },
        data_prevista: { type: 'string', description: 'Nova data prevista YYYY-MM-DD' },
        observacoes: { type: 'string', description: 'Novas observações' },
        forma_pagamento: { type: 'string', enum: ['dinheiro', 'pix', 'debito', 'credito'] },
        a_receber: { type: 'boolean', description: 'Marcar ou desmarcar para cobrança' },
        data_vencimento: { type: 'string', description: 'Data de vencimento YYYY-MM-DD' }
      },
      required: ['numero_os']
    }
  },
  {
    name: 'ajustar_estoque',
    description: 'Ajusta o estoque de um produto: define o valor exato ou soma/subtrai uma quantidade. Use para corrigir estoque, registrar entrada de mercadoria, etc. IMPORTANTE: sempre confirme antes de chamar.',
    input_schema: {
      type: 'object',
      properties: {
        produto_nome: { type: 'string', description: 'Nome do produto (busca parcial)' },
        modo: { type: 'string', enum: ['definir', 'adicionar', 'subtrair'], description: '"definir" seta o estoque exato; "adicionar" soma; "subtrair" diminui' },
        quantidade: { type: 'number', description: 'Quantidade (sempre positiva)' },
        motivo: { type: 'string', description: 'Motivo do ajuste (ex: compra de estoque, inventário, devolução)' }
      },
      required: ['produto_nome', 'modo', 'quantidade']
    }
  },
  {
    name: 'marcar_pedido_comprado',
    description: 'Marca um pedido de compra como comprado/recebido. Use quando o usuário disser que comprou ou recebeu um item da lista de compras. IMPORTANTE: sempre confirme antes de chamar.',
    input_schema: {
      type: 'object',
      properties: {
        produto_nome: { type: 'string', description: 'Nome do produto do pedido (busca parcial)' },
        quantidade_recebida: { type: 'number', description: 'Quantidade efetivamente recebida (opcional, para atualizar estoque junto)' },
        atualizar_estoque: { type: 'boolean', description: 'Se true, soma a quantidade ao estoque do produto' }
      },
      required: ['produto_nome']
    }
  },
  {
    name: 'excluir_gasto',
    description: 'Exclui um gasto lançado incorretamente. Use apenas quando o usuário pedir para remover/estornar um gasto. IMPORTANTE: sempre confirme antes de chamar — é irreversível.',
    input_schema: {
      type: 'object',
      properties: {
        descricao: { type: 'string', description: 'Descrição do gasto a excluir (busca parcial)' },
        data: { type: 'string', description: 'Data do gasto YYYY-MM-DD para ajudar a identificar' },
        valor: { type: 'number', description: 'Valor do gasto para confirmar qual é o correto' }
      },
      required: ['descricao']
    }
  },
  {
    name: 'fechar_mes_comissoes',
    description: 'Executa o fechamento oficial de comissões de um mês: calcula salário + comissão + bônus (se meta atingida) - vales = total a pagar por funcionário. Registra no histórico e não pode ser desfeito. Use quando o usuário pedir "fechar o mês", "fechamento de comissões", "calcular comissões do mês X". IMPORTANTE: sempre confirme o mês/ano antes de executar.',
    input_schema: {
      type: 'object',
      properties: {
        mes: { type: 'number', description: 'Mês (1-12)' },
        ano: { type: 'number', description: 'Ano (ex: 2025)' }
      },
      required: ['mes', 'ano']
    }
  }
]

// ─── Executors — Consultas ────────────────────────────────────────────────────

function executarResumoGeral() {
  const hoje = new Date().toLocaleDateString('en-CA')
  const mes = hoje.slice(0, 7)

  const osConcluídasHoje = db.prepare(`
    SELECT COUNT(*) as c, COALESCE(SUM(valor), 0) as total
    FROM ordens_servico WHERE status = 'concluida' AND date(COALESCE(data_conclusao, data_entrada)) = ?
  `).get(hoje)

  const vendasHoje = db.prepare(`
    SELECT COUNT(*) as c, COALESCE(SUM(total_final), 0) as total
    FROM vendas WHERE date(data) = ? AND status != 'cancelada'
  `).get(hoje)

  const osAbertas = db.prepare(`SELECT COUNT(*) as c FROM ordens_servico WHERE status IN ('aberta', 'em_andamento')`).get()

  const aReceberTotal = db.prepare(`
    SELECT COUNT(*) as c, COALESCE(SUM(valor - valor_pago), 0) as total
    FROM ordens_servico WHERE a_receber = 1 AND a_receber_pago = 0
  `).get()

  const aReceberVencido = db.prepare(`
    SELECT COUNT(*) as c, COALESCE(SUM(valor - valor_pago), 0) as total
    FROM ordens_servico WHERE a_receber = 1 AND a_receber_pago = 0 AND data_vencimento < ?
  `).get(hoje)

  const estoqueBaixo = db.prepare(`SELECT COUNT(*) as c FROM produtos WHERE ativo = 1 AND estoque <= estoque_minimo`).get()

  const gastosMes = db.prepare(`SELECT COALESCE(SUM(valor), 0) as total FROM gastos WHERE strftime('%Y-%m', data) = ?`).get(mes)

  const fatMesOS = db.prepare(`
    SELECT COALESCE(SUM(valor), 0) as total FROM ordens_servico
    WHERE status = 'concluida' AND strftime('%Y-%m', COALESCE(data_conclusao, data_entrada)) = ?
  `).get(mes)

  const fatMesVendas = db.prepare(`
    SELECT COALESCE(SUM(total_final), 0) as total FROM vendas
    WHERE strftime('%Y-%m', data) = ? AND status != 'cancelada'
  `).get(mes)

  const faturamentoMes = fatMesOS.total + fatMesVendas.total

  const pedidosPendentes = db.prepare(`SELECT COUNT(*) as c FROM pedidos_compra WHERE status = 'pendente'`).get()
  const lembretesPendentes = db.prepare(`SELECT COUNT(*) as c FROM lembretes WHERE status = 'pendente' AND date(data_envio) <= ?`).get(hoje)

  return {
    hoje,
    caixa_hoje: {
      os_concluidas_qtd: osConcluídasHoje.c,
      os_concluidas_valor: osConcluídasHoje.total,
      vendas_qtd: vendasHoje.c,
      vendas_valor: vendasHoje.total,
      total: osConcluídasHoje.total + vendasHoje.total
    },
    os_abertas: osAbertas.c,
    a_receber: { quantidade: aReceberTotal.c, total: aReceberTotal.total },
    a_receber_vencido: { quantidade: aReceberVencido.c, total: aReceberVencido.total },
    estoque_baixo_qtd: estoqueBaixo.c,
    mes_atual: {
      faturamento: faturamentoMes,
      gastos: gastosMes.total,
      resultado_liquido: faturamentoMes - gastosMes.total
    },
    pedidos_compra_pendentes: pedidosPendentes.c,
    lembretes_pendentes_hoje: lembretesPendentes.c
  }
}

function executarFechamentoCaixa({ periodo, data_inicio, data_fim }) {
  const { di, df } = getDateRange(periodo, data_inicio, data_fim)

  const whereV = `v.status != 'cancelada' AND date(v.data) BETWEEN '${di}' AND '${df}'`
  const whereO = `os.status = 'concluida' AND date(COALESCE(os.data_conclusao, os.data_entrada)) BETWEEN '${di}' AND '${df}'`

  const vendas = db.prepare(`SELECT COUNT(*) as qtd, COALESCE(SUM(v.total_final), 0) as total FROM vendas v WHERE ${whereV}`).get()
  const ordens = db.prepare(`SELECT COUNT(*) as qtd, COALESCE(SUM(os.valor), 0) as total FROM ordens_servico os WHERE ${whereO}`).get()

  const pgVendas = db.prepare(`SELECT p.metodo, SUM(p.valor) as total FROM pagamentos_venda p JOIN vendas v ON p.venda_id = v.id WHERE ${whereV} GROUP BY p.metodo`).all()
  const pgOrdens = db.prepare(`SELECT os.forma_pagamento as metodo, SUM(os.valor) as total FROM ordens_servico os WHERE ${whereO} AND os.forma_pagamento IS NOT NULL GROUP BY os.forma_pagamento`).all()

  const pgMap = {}
  ;[...pgVendas, ...pgOrdens].forEach(r => { if (r.metodo) pgMap[r.metodo] = (pgMap[r.metodo] || 0) + r.total })
  const pagamentos = Object.entries(pgMap).map(([metodo, total]) => ({ metodo, total }))

  return {
    periodo, data_inicio: di, data_fim: df,
    vendas: { quantidade: vendas.qtd, total: vendas.total },
    ordens: { quantidade: ordens.qtd, total: ordens.total },
    total_geral: vendas.total + ordens.total,
    por_forma_pagamento: pagamentos
  }
}

function executarBuscarOS({ numero, cliente_nome, status, limite = 10 } = {}) {
  let sql = `
    SELECT os.id, os.numero, os.descricao, os.valor, os.valor_pago, os.status,
           os.data_entrada, os.data_prevista, os.data_conclusao,
           os.a_receber, os.a_receber_pago, os.data_vencimento, os.forma_pagamento, os.observacoes,
           COALESCE(c.nome, os.cliente_nome_avulso, 'Avulso') as cliente_nome,
           v.nome as vendedor_nome
    FROM ordens_servico os
    LEFT JOIN clientes c ON os.cliente_id = c.id
    LEFT JOIN vendedores v ON os.vendedor_id = v.id
    WHERE 1=1`
  const params = []

  if (numero) { sql += ` AND os.numero LIKE ?`; params.push(`%${numero}%`) }
  if (cliente_nome) { sql += ` AND (norm(c.nome) LIKE norm(?) OR norm(os.cliente_nome_avulso) LIKE norm(?))`; params.push(`%${cliente_nome}%`, `%${cliente_nome}%`) }
  if (status) { sql += ` AND os.status = ?`; params.push(status) }

  sql += ` ORDER BY os.data_entrada DESC LIMIT ?`
  params.push(limite)

  const rows = db.prepare(sql).all(...params)
  return { ordens: rows, quantidade: rows.length }
}

function executarCobrancasAbertas({ cliente_nome } = {}) {
  let sql = `
    SELECT os.numero, os.descricao, os.valor, os.data_entrada, os.data_prevista, os.status,
           COALESCE(c.nome, os.cliente_nome_avulso, 'Avulso') as cliente_nome,
           v.nome as vendedor_nome
    FROM ordens_servico os
    LEFT JOIN clientes c ON os.cliente_id = c.id
    LEFT JOIN vendedores v ON os.vendedor_id = v.id
    WHERE os.status IN ('aberta', 'em_andamento')`
  const params = []
  if (cliente_nome) { sql += ` AND (norm(c.nome) LIKE norm(?) OR norm(os.cliente_nome_avulso) LIKE norm(?))`; params.push(`%${cliente_nome}%`, `%${cliente_nome}%`) }
  sql += ` ORDER BY os.data_prevista ASC, os.data_entrada DESC LIMIT 50`

  const rows = db.prepare(sql).all(...params)
  return { cobrancas: rows, total_em_aberto: rows.reduce((s, r) => s + (r.valor || 0), 0), quantidade: rows.length }
}

function executarHistoricoCliente({ cliente_nome }) {
  const cliente = db.prepare(`SELECT * FROM clientes WHERE norm(nome) LIKE norm(?) AND ativo = 1 LIMIT 1`).get(`%${cliente_nome}%`)
  if (!cliente) return { encontrado: false, mensagem: `Nenhum cliente encontrado com "${cliente_nome}"` }

  const ordens = db.prepare(`SELECT numero, descricao, valor, valor_pago, status, data_entrada, data_conclusao, forma_pagamento FROM ordens_servico WHERE cliente_id = ? ORDER BY data_entrada DESC LIMIT 20`).all(cliente.id)
  const vendas = db.prepare(`SELECT numero, total_final, status, data FROM vendas WHERE cliente_id = ? AND status != 'cancelada' ORDER BY data DESC LIMIT 20`).all(cliente.id)

  const totalGasto =
    vendas.reduce((s, v) => s + v.total_final, 0) +
    ordens.filter(o => o.status === 'concluida').reduce((s, o) => s + (o.valor || 0), 0)
  const emAberto = ordens
    .filter(o => ['aberta', 'em_andamento'].includes(o.status))
    .reduce((s, o) => s + (o.valor || 0), 0)

  return { encontrado: true, cliente: { nome: cliente.nome, telefone: cliente.telefone }, ordens, vendas, total_gasto: totalGasto, total_em_aberto: emAberto }
}

function executarEstoqueBaixo() {
  const rows = db.prepare(`SELECT nome, codigo, estoque, estoque_minimo, preco_venda, unidade FROM produtos WHERE ativo = 1 AND estoque <= estoque_minimo ORDER BY (estoque_minimo - estoque) DESC`).all()
  return { produtos: rows, quantidade: rows.length }
}

function executarBuscarProduto({ busca }) {
  const rows = db.prepare(`SELECT nome, codigo, preco_custo, preco_venda, estoque, estoque_minimo, unidade FROM produtos WHERE ativo = 1 AND (norm(nome) LIKE norm(?) OR norm(codigo) LIKE norm(?)) ORDER BY nome LIMIT 10`).all(`%${busca}%`, `%${busca}%`)
  return { produtos: rows, quantidade: rows.length }
}

function executarAReceberPendente({ apenas_vencidas } = {}) {
  const hoje = new Date().toLocaleDateString('en-CA')
  let sql = `
    SELECT os.numero, os.valor, os.valor_pago, os.data_vencimento,
           COALESCE(c.nome, os.cliente_nome_avulso, 'Avulso') as cliente_nome
    FROM ordens_servico os
    LEFT JOIN clientes c ON os.cliente_id = c.id
    WHERE os.a_receber = 1 AND os.a_receber_pago = 0`
  if (apenas_vencidas) sql += ` AND (os.data_vencimento IS NULL OR os.data_vencimento <= '${hoje}')`
  sql += ` ORDER BY os.data_vencimento ASC`

  const rows = db.prepare(sql).all()
  const hoje2 = hoje
  return {
    total_pendente: rows.reduce((s, r) => s + (r.valor - (r.valor_pago || 0)), 0),
    quantidade: rows.length,
    vencidas: rows.filter(r => r.data_vencimento && r.data_vencimento < hoje2),
    vencem_hoje: rows.filter(r => r.data_vencimento && r.data_vencimento === hoje2),
    futuras: rows.filter(r => r.data_vencimento && r.data_vencimento > hoje2),
    sem_data: rows.filter(r => !r.data_vencimento)
  }
}

function executarGastosPeriodo({ periodo, categoria, data_inicio, data_fim }) {
  const { di, df } = getDateRange(periodo, data_inicio, data_fim)
  let sql = `SELECT * FROM gastos WHERE date(data) BETWEEN ? AND ?`
  const params = [di, df]
  if (categoria) { sql += ` AND categoria = ?`; params.push(categoria) }
  sql += ` ORDER BY data DESC`

  const gastos = db.prepare(sql).all(...params)
  let catSql = `SELECT categoria, COALESCE(SUM(valor), 0) as total, COUNT(*) as qtd FROM gastos WHERE date(data) BETWEEN ? AND ?`
  const catParams = [di, df]
  if (categoria) { catSql += ` AND categoria = ?`; catParams.push(categoria) }
  catSql += ` GROUP BY categoria ORDER BY total DESC`

  return {
    periodo, data_inicio: di, data_fim: df,
    gastos: gastos.slice(0, 20), total: gastos.reduce((s, g) => s + g.valor, 0),
    por_categoria: db.prepare(catSql).all(...catParams),
    quantidade: gastos.length
  }
}

function executarDesempenhoVendedor({ periodo, vendedor_nome }) {
  const { di, df } = getDateRange(periodo)
  const where = `os.status = 'concluida' AND date(COALESCE(os.data_conclusao, os.data_entrada)) BETWEEN '${di}' AND '${df}'`
  let sql = `
    SELECT v.nome, v.percentual_comissao, v.salario_base, v.meta, v.bonus_meta,
           COUNT(os.id) as qtd_os,
           COALESCE(SUM(os.valor), 0) as total_os,
           COALESCE(SUM(os.valor * v.percentual_comissao / 100.0), 0) as comissao_estimada
    FROM vendedores v
    LEFT JOIN ordens_servico os ON os.vendedor_id = v.id AND ${where}
    WHERE v.ativo = 1`
  const params2 = []
  if (vendedor_nome) { sql += ` AND norm(v.nome) LIKE norm(?)`; params2.push(`%${vendedor_nome}%`) }
  sql += ` GROUP BY v.id ORDER BY total_os DESC`
  const vendedores = db.prepare(sql).all(...params2).map(v => ({
    ...v,
    atingiu_meta: v.meta > 0 && v.total_os >= v.meta
  }))
  return { periodo, data_inicio: di, data_fim: df, vendedores }
}

function executarResultadoLiquido({ periodo, data_inicio, data_fim }) {
  const { di, df } = getDateRange(periodo, data_inicio, data_fim)

  // Faturamento OS concluídas
  const fatOS = db.prepare(`
    SELECT COALESCE(SUM(valor), 0) as total, COUNT(*) as qtd
    FROM ordens_servico
    WHERE status = 'concluida' AND date(COALESCE(data_conclusao, data_entrada)) BETWEEN ? AND ?
  `).get(di, df)

  // Faturamento Vendas
  const fatVendas = db.prepare(`
    SELECT COALESCE(SUM(total_final), 0) as total, COUNT(*) as qtd
    FROM vendas WHERE date(data) BETWEEN ? AND ? AND status != 'cancelada'
  `).get(di, df)

  const faturamento_bruto = fatOS.total + fatVendas.total

  // Gastos por categoria
  const gastos = db.prepare(`
    SELECT categoria, COALESCE(SUM(valor), 0) as total, COUNT(*) as qtd
    FROM gastos WHERE date(data) BETWEEN ? AND ?
    GROUP BY categoria ORDER BY total DESC
  `).all(di, df)
  const total_gastos = gastos.reduce((s, g) => s + g.total, 0)

  // Todos os funcionários ativos com comissão, salário, meta e bônus no período
  const funcionarios = db.prepare(`
    SELECT v.id, v.nome, v.salario_base, v.percentual_comissao, v.meta, v.bonus_meta,
           COUNT(os.id) as qtd_os,
           COALESCE(SUM(os.valor), 0) as total_os,
           COALESCE(SUM(os.valor * v.percentual_comissao / 100.0), 0) as comissao
    FROM vendedores v
    LEFT JOIN ordens_servico os ON os.vendedor_id = v.id
        AND os.status = 'concluida'
        AND date(COALESCE(os.data_conclusao, os.data_entrada)) BETWEEN ? AND ?
    WHERE v.ativo = 1
    GROUP BY v.id
    ORDER BY v.nome
  `).all(di, df)

  const valesMap = {}
  db.prepare(`
    SELECT vd.nome as nome, COALESCE(SUM(v.valor), 0) as total
    FROM vales v JOIN vendedores vd ON vd.id = v.vendedor_id
    WHERE date(v.data) BETWEEN ? AND ?
    GROUP BY v.vendedor_id
  `).all(di, df).forEach(v => { valesMap[v.nome] = v.total })

  const por_funcionario = funcionarios.map(f => {
    const bonus = (f.meta > 0 && f.total_os >= f.meta) ? f.bonus_meta : 0
    const vales = valesMap[f.nome] || 0
    return {
      nome: f.nome,
      salario_base: f.salario_base,
      percentual_comissao: f.percentual_comissao,
      qtd_os: f.qtd_os,
      total_os: f.total_os,
      comissao: f.comissao,
      meta: f.meta,
      bonus_meta: f.bonus_meta,
      bonus,
      vales,
      total_a_pagar: Math.max(0, f.salario_base + f.comissao + bonus - vales),
      devendo: vales > f.salario_base + f.comissao + bonus
    }
  })

  const total_salarios  = por_funcionario.reduce((s, f) => s + f.salario_base, 0)
  const total_comissoes = por_funcionario.reduce((s, f) => s + f.comissao, 0)
  const total_bonus     = por_funcionario.reduce((s, f) => s + f.bonus, 0)
  const total_vales     = Object.values(valesMap).reduce((s, v) => s + v, 0)

  const resultado_liquido = faturamento_bruto - total_gastos - total_salarios - total_comissoes - total_bonus

  // Pagamentos OS por forma
  const pagosOS = db.prepare(`
    SELECT COALESCE(forma_pagamento, 'outros') as metodo, COALESCE(SUM(valor), 0) as total
    FROM ordens_servico
    WHERE status = 'concluida' AND date(COALESCE(data_conclusao, data_entrada)) BETWEEN ? AND ?
    GROUP BY forma_pagamento
  `).all(di, df)

  // Pagamentos Vendas por forma
  const pagosVendas = db.prepare(`
    SELECT COALESCE(pv.metodo, 'outros') as metodo, COALESCE(SUM(pv.valor), 0) as total
    FROM pagamentos_venda pv
    JOIN vendas v ON pv.venda_id = v.id
    WHERE date(v.data) BETWEEN ? AND ? AND v.status != 'cancelada'
    GROUP BY pv.metodo
  `).all(di, df)

  // Merge por método
  const mapaMetodos = {}
  ;[...pagosOS, ...pagosVendas].forEach(p => {
    const m = p.metodo || 'outros'
    mapaMetodos[m] = (mapaMetodos[m] || 0) + p.total
  })
  const pagamentos_por_metodo = Object.entries(mapaMetodos).map(([metodo, total]) => ({ metodo, total }))

  // A receber em aberto (fora do período — é posição atual)
  const aReceber = db.prepare(`
    SELECT COUNT(*) as qtd, COALESCE(SUM(valor - COALESCE(valor_pago, 0)), 0) as total
    FROM ordens_servico WHERE a_receber = 1 AND a_receber_pago = 0
  `).get()

  return {
    periodo, data_inicio: di, data_fim: df,
    receitas: {
      os_concluidas: { total: fatOS.total, quantidade: fatOS.qtd },
      vendas: { total: fatVendas.total, quantidade: fatVendas.qtd },
      total: faturamento_bruto
    },
    pagamentos_por_metodo,
    a_receber_aberto: { qtd: aReceber.qtd, total: aReceber.total },
    deducoes: {
      gastos_por_categoria: gastos,
      total_gastos,
      por_funcionario,
      total_salarios,
      total_comissoes,
      total_bonus,
      total_vales,
      total_deducoes: total_gastos + total_salarios + total_comissoes + total_bonus
    },
    resultado_liquido,
    margem_percentual: faturamento_bruto > 0 ? ((resultado_liquido / faturamento_bruto) * 100).toFixed(1) : 0
  }
}

function executarConsumoPeriodo({ periodo = 'mes', categoria, data_inicio, data_fim } = {}) {
  const { di, df } = getDateRange(periodo, data_inicio, data_fim)
  let sql = `
    SELECT m.id, m.quantidade, m.estoque_anterior, m.estoque_posterior, m.referencia, m.observacao, m.data,
           p.nome as produto_nome, p.unidade
    FROM movimentacoes_estoque m
    JOIN produtos p ON m.produto_id = p.id
    WHERE m.tipo = 'consumo_interno' AND date(m.data) BETWEEN ? AND ?`
  const params = [di, df]
  if (categoria) { sql += ` AND m.referencia = ?`; params.push(categoria) }
  sql += ` ORDER BY m.data DESC LIMIT 50`

  const rows = db.prepare(sql).all(...params)
  const CATS = ['erro_corte', 'garantia', 'uso_interno', 'outros']
  const catLabels = { erro_corte: 'Erro de Corte', garantia: 'Garantia', uso_interno: 'Uso Interno', outros: 'Outros' }
  return {
    consumos: rows,
    total_unidades: rows.reduce((s, r) => s + r.quantidade, 0),
    por_categoria: CATS.map(cat => ({
      categoria: cat, label: catLabels[cat],
      qtd: rows.filter(r => r.referencia === cat).length,
      total_unidades: rows.filter(r => r.referencia === cat).reduce((s, r) => s + r.quantidade, 0)
    })).filter(c => c.qtd > 0),
    data_inicio: di, data_fim: df
  }
}

function executarListarPedidos({ status } = {}) {
  const st = status || 'pendente'
  const rows = db.prepare(`
    SELECT pc.id, pc.descricao, pc.quantidade, pc.status, pc.origem, pc.criado_em,
           p.nome as produto_nome, p.estoque, p.unidade, p.estoque_minimo
    FROM pedidos_compra pc
    LEFT JOIN produtos p ON pc.produto_id = p.id
    WHERE pc.status = ?
    ORDER BY pc.criado_em DESC LIMIT 50
  `).all(st)
  return { pedidos: rows, quantidade: rows.length, status: st }
}

function executarListarLembretes({ status = 'pendente' } = {}) {
  const rows = db.prepare(`SELECT * FROM lembretes WHERE status = ? ORDER BY data_envio ASC LIMIT 30`).all(status)
  return { lembretes: rows, quantidade: rows.length }
}

// ─── Executors — Ações ────────────────────────────────────────────────────────

function executarRegistrarGasto({ descricao, valor, categoria, data, observacoes }) {
  const CATS = ['material', 'combustivel', 'alimentacao', 'manutencao', 'servicos', 'outros']
  const cat = CATS.includes(categoria) ? categoria : 'outros'
  const dataGasto = data || new Date().toLocaleDateString('en-CA')
  const result = db.prepare(`INSERT INTO gastos (descricao, valor, categoria, data, observacoes) VALUES (?, ?, ?, ?, ?)`).run(descricao.trim(), parseFloat(valor), cat, dataGasto, observacoes?.trim() || null)
  const catLabels = { material: 'Material', combustivel: 'Combustível', alimentacao: 'Alimentação', manutencao: 'Manutenção', servicos: 'Serviços', outros: 'Outros' }
  return { ok: true, status_execucao: 'CONCLUIDO', id: result.lastInsertRowid, registrado: { descricao, valor: parseFloat(valor), categoria: catLabels[cat], data: dataGasto } }
}

function executarCriarOS({ cliente_nome, cliente_avulso_nome, descricao, valor, vendedor_nome, data_prevista, a_receber, forma_pagamento, observacoes }) {
  if (!descricao?.trim()) return { error: 'Descrição é obrigatória' }

  let cliente_id = null
  let clienteEncontrado = null
  if (cliente_nome) {
    clienteEncontrado = db.prepare(`SELECT id, nome FROM clientes WHERE norm(nome) LIKE norm(?) AND ativo = 1 LIMIT 1`).get(`%${cliente_nome}%`)
    if (!clienteEncontrado) return { error: `Cliente "${cliente_nome}" não encontrado no cadastro. Se for avulso, use o campo cliente_avulso_nome.` }
    cliente_id = clienteEncontrado.id
  }

  let vendedor_id = null
  if (vendedor_nome) {
    const v = db.prepare(`SELECT id, nome FROM vendedores WHERE norm(nome) LIKE norm(?) AND ativo = 1 LIMIT 1`).get(`%${vendedor_nome}%`)
    if (v) vendedor_id = v.id
  }

  const numero = gerarNumeroOS()
  const result = db.prepare(`
    INSERT INTO ordens_servico (numero, cliente_id, cliente_nome_avulso, descricao, valor, vendedor_id, data_prevista, a_receber, forma_pagamento, observacoes, usuario_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(numero, cliente_id, cliente_id ? null : (cliente_avulso_nome?.trim() || null), descricao.trim(), valor || 0, vendedor_id, data_prevista || null, a_receber ? 1 : 0, forma_pagamento || null, observacoes?.trim() || null)

  return {
    ok: true, status_execucao: 'CONCLUIDO',
    numero, id: result.lastInsertRowid,
    cliente: clienteEncontrado?.nome || cliente_avulso_nome || 'Avulso',
    descricao: descricao.trim(), valor: valor || 0
  }
}

function executarAtualizarStatusOS({ numero_os, novo_status, forma_pagamento, valor }) {
  const os = db.prepare(`SELECT * FROM ordens_servico WHERE numero = ?`).get(numero_os)
  if (!os) return { error: `OS ${numero_os} não encontrada` }

  if (novo_status === 'a_receber') {
    db.prepare(`UPDATE ordens_servico SET a_receber = 1 WHERE id = ?`).run(os.id)
    return { ok: true, status_execucao: 'CONCLUIDO', numero: numero_os, acao: 'Marcada como A Receber', status_atual: os.status }
  }

  const STATUSES = ['aberta', 'em_andamento', 'concluida', 'cancelada']
  if (!STATUSES.includes(novo_status)) return { error: `Status inválido: ${novo_status}` }

  let dc = null
  if (novo_status === 'concluida' && !os.data_conclusao) {
    const now = new Date()
    dc = now.toLocaleDateString('en-CA') + ' ' + now.toLocaleTimeString('pt-BR')
  }

  db.prepare(`
    UPDATE ordens_servico SET status = ?,
      forma_pagamento = COALESCE(?, forma_pagamento),
      valor = COALESCE(?, valor),
      data_conclusao = COALESCE(?, data_conclusao)
    WHERE id = ?
  `).run(novo_status, forma_pagamento || null, valor || null, dc, os.id)

  return { ok: true, status_execucao: 'CONCLUIDO', numero: numero_os, status_anterior: os.status, status_novo: novo_status, valor_registrado: valor || os.valor }
}

function executarRegistrarConsumoInterno({ produto_nome, quantidade, categoria, os_referencia, observacao }) {
  const CATS = ['erro_corte', 'garantia', 'uso_interno', 'outros']
  const cat = CATS.includes(categoria) ? categoria : 'outros'

  const produto = db.prepare(`SELECT * FROM produtos WHERE norm(nome) LIKE norm(?) AND ativo = 1 LIMIT 1`).get(`%${produto_nome}%`)
  if (!produto) return { error: `Produto "${produto_nome}" não encontrado no cadastro` }
  if (produto.estoque < quantidade) return { error: `Estoque insuficiente para "${produto.nome}". Disponível: ${produto.estoque} ${produto.unidade}` }

  const novoEstoque = produto.estoque - quantidade
  const obs = [observacao, os_referencia ? `OS: ${os_referencia}` : null].filter(Boolean).join(' | ') || null

  db.prepare(`UPDATE produtos SET estoque = ? WHERE id = ?`).run(novoEstoque, produto.id)
  db.prepare(`
    INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, estoque_anterior, estoque_posterior, referencia, observacao, usuario_id)
    VALUES (?, 'consumo_interno', ?, ?, ?, ?, ?, 1)
  `).run(produto.id, quantidade, produto.estoque, novoEstoque, cat, obs)

  verificarEstoqueBaixo(produto.id)

  return { ok: true, status_execucao: 'CONCLUIDO', produto: produto.nome, quantidade, estoque_anterior: produto.estoque, estoque_atual: novoEstoque, unidade: produto.unidade }
}

function executarCriarLembrete({ mensagem, data_hora, destinatarios }) {
  if (!mensagem?.trim()) return { error: 'Mensagem é obrigatória' }
  if (!data_hora) return { error: 'Data/hora é obrigatória' }

  let dest = 'todos'
  if (destinatarios && destinatarios !== 'todos') {
    const v = db.prepare(`SELECT id FROM vendedores WHERE norm(nome) LIKE norm(?) AND ativo = 1 LIMIT 1`).get(`%${destinatarios}%`)
    if (v) dest = String(v.id)
  }

  const r = db.prepare(`INSERT INTO lembretes (mensagem, data_envio, destinatarios) VALUES (?, ?, ?)`).run(mensagem.trim(), data_hora, dest)
  return { ok: true, status_execucao: 'CONCLUIDO', id: r.lastInsertRowid, mensagem: mensagem.trim(), data_hora, destinatarios: dest }
}

function executarAdicionarPedidoCompra({ produto_nome, quantidade, descricao }) {
  let produto_id = null
  let nomeFinal = descricao || produto_nome

  if (produto_nome) {
    const p = db.prepare(`SELECT id, nome FROM produtos WHERE norm(nome) LIKE norm(?) AND ativo = 1 LIMIT 1`).get(`%${produto_nome}%`)
    if (p) { produto_id = p.id; nomeFinal = descricao || p.nome }
  }

  if (produto_id) {
    const existente = db.prepare(`SELECT id FROM pedidos_compra WHERE produto_id = ? AND status = 'pendente'`).get(produto_id)
    if (existente) return { aviso: `Já existe um pedido pendente para "${nomeFinal}"`, pedido_id: existente.id }
  }

  const r = db.prepare(`INSERT INTO pedidos_compra (produto_id, descricao, quantidade, status, origem) VALUES (?, ?, ?, 'pendente', 'manual')`).run(produto_id, nomeFinal, quantidade || 1)
  return { ok: true, status_execucao: 'CONCLUIDO', id: r.lastInsertRowid, produto: nomeFinal, quantidade: quantidade || 1 }
}

function executarEditarOS({ numero_os, descricao, valor, cliente_nome, cliente_avulso_nome, vendedor_nome, data_prevista, observacoes, forma_pagamento, a_receber, data_vencimento }) {
  const os = db.prepare(`
    SELECT os.*, c.nome as cliente_nome_cat FROM ordens_servico os
    LEFT JOIN clientes c ON os.cliente_id = c.id
    WHERE os.numero = ?
  `).get(numero_os)
  if (!os) return { error: `OS ${numero_os} não encontrada` }

  let novo_cliente_id = os.cliente_id
  let novo_avulso = os.cliente_nome_avulso
  if (cliente_nome) {
    const cli = db.prepare(`SELECT id, nome FROM clientes WHERE norm(nome) LIKE norm(?) AND ativo = 1 LIMIT 1`).get(`%${cliente_nome}%`)
    if (!cli) return { error: `Cliente "${cliente_nome}" não encontrado no cadastro` }
    novo_cliente_id = cli.id
    novo_avulso = null
  } else if (cliente_avulso_nome) {
    novo_cliente_id = null
    novo_avulso = cliente_avulso_nome.trim()
  }

  let novo_vendedor_id = os.vendedor_id
  if (vendedor_nome !== undefined) {
    if (!vendedor_nome) {
      novo_vendedor_id = null
    } else {
      const v = db.prepare(`SELECT id, nome FROM vendedores WHERE norm(nome) LIKE norm(?) AND ativo = 1 LIMIT 1`).get(`%${vendedor_nome}%`)
      if (v) novo_vendedor_id = v.id
      else return { error: `Funcionário "${vendedor_nome}" não encontrado` }
    }
  }

  db.prepare(`
    UPDATE ordens_servico SET
      cliente_id = ?, cliente_nome_avulso = ?, vendedor_id = ?,
      descricao = ?, valor = ?, data_prevista = ?,
      observacoes = ?, forma_pagamento = ?,
      a_receber = ?, data_vencimento = ?
    WHERE id = ?
  `).run(
    novo_cliente_id,
    novo_avulso || null,
    novo_vendedor_id,
    descricao ?? os.descricao,
    valor ?? os.valor,
    data_prevista !== undefined ? (data_prevista || null) : os.data_prevista,
    observacoes !== undefined ? (observacoes || null) : os.observacoes,
    forma_pagamento !== undefined ? (forma_pagamento || null) : os.forma_pagamento,
    a_receber !== undefined ? (a_receber ? 1 : 0) : os.a_receber,
    data_vencimento !== undefined ? (data_vencimento || null) : os.data_vencimento,
    os.id
  )

  return { ok: true, status_execucao: 'CONCLUIDO', numero: numero_os, mensagem: 'OS atualizada com sucesso' }
}

function executarAjustarEstoque({ produto_nome, modo, quantidade, motivo }) {
  const produto = db.prepare(`SELECT * FROM produtos WHERE norm(nome) LIKE norm(?) AND ativo = 1 LIMIT 1`).get(`%${produto_nome}%`)
  if (!produto) return { error: `Produto "${produto_nome}" não encontrado` }

  let novoEstoque
  if (modo === 'definir') novoEstoque = quantidade
  else if (modo === 'adicionar') novoEstoque = produto.estoque + quantidade
  else if (modo === 'subtrair') novoEstoque = produto.estoque - quantidade
  else return { error: 'Modo inválido' }

  if (novoEstoque < 0) return { error: `Estoque ficaria negativo (atual: ${produto.estoque})` }

  db.prepare(`UPDATE produtos SET estoque = ? WHERE id = ?`).run(novoEstoque, produto.id)
  db.prepare(`
    INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, estoque_anterior, estoque_posterior, referencia, observacao, usuario_id)
    VALUES (?, 'ajuste_manual', ?, ?, ?, 'ajuste', ?, 1)
  `).run(produto.id, Math.abs(novoEstoque - produto.estoque), produto.estoque, novoEstoque, motivo || 'Ajuste via assistente')

  verificarEstoqueBaixo(produto.id)
  return { ok: true, status_execucao: 'CONCLUIDO', produto: produto.nome, estoque_anterior: produto.estoque, estoque_atual: novoEstoque }
}

function executarMarcarPedidoComprado({ produto_nome, quantidade_recebida, atualizar_estoque }) {
  const produto = db.prepare(`SELECT id, nome, estoque FROM produtos WHERE norm(nome) LIKE norm(?) AND ativo = 1 LIMIT 1`).get(`%${produto_nome}%`)
  const pedido = produto
    ? db.prepare(`SELECT * FROM pedidos_compra WHERE produto_id = ? AND status = 'pendente' LIMIT 1`).get(produto.id)
    : db.prepare(`SELECT * FROM pedidos_compra WHERE norm(descricao) LIKE norm(?) AND status = 'pendente' LIMIT 1`).get(`%${produto_nome}%`)

  if (!pedido) return { error: `Nenhum pedido pendente encontrado para "${produto_nome}"` }

  db.prepare(`UPDATE pedidos_compra SET status = 'comprado' WHERE id = ?`).run(pedido.id)

  if (atualizar_estoque && produto && quantidade_recebida > 0) {
    const novoEstoque = produto.estoque + quantidade_recebida
    db.prepare(`UPDATE produtos SET estoque = ? WHERE id = ?`).run(novoEstoque, produto.id)
    db.prepare(`
      INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, estoque_anterior, estoque_posterior, referencia, observacao, usuario_id)
      VALUES (?, 'entrada', ?, ?, ?, 'pedido_compra', 'Recebimento via pedido de compra', 1)
    `).run(produto.id, quantidade_recebida, produto.estoque, novoEstoque)
    return { ok: true, status_execucao: 'CONCLUIDO', pedido_id: pedido.id, produto: produto.nome, estoque_anterior: produto.estoque, estoque_atual: novoEstoque }
  }

  return { ok: true, status_execucao: 'CONCLUIDO', pedido_id: pedido.id, descricao: pedido.descricao }
}

function executarFecharMesComissoes({ mes, ano }) {
  mes = parseInt(mes); ano = parseInt(ano)
  if (!mes || !ano || mes < 1 || mes > 12) return { error: 'Mês ou ano inválido' }

  const resultado = _fecharComissoes(mes, ano)
  if (resultado.jaExistia) {
    return { error: `Fechamento de ${MESES[mes-1]}/${ano} já foi realizado anteriormente (id: ${resultado.fechamento_id})` }
  }

  // Busca detalhes por vendedor
  const itens = db.prepare(`
    SELECT ci.vendedor_id, ci.vendedor_nome, ci.percentual,
           SUM(ci.valor_os) as total_os, SUM(ci.valor_comissao) as total_comissao, COUNT(*) as qtd_os
    FROM comissoes_itens ci WHERE ci.fechamento_id = ? GROUP BY ci.vendedor_id
  `).all(resultado.fechamento_id)

  const valesMap = {}
  db.prepare(`SELECT vendedor_id, SUM(valor) as total FROM vales WHERE fechamento_id = ? GROUP BY vendedor_id`).all(resultado.fechamento_id)
    .forEach(v => { valesMap[v.vendedor_id] = v.total })

  const vendedoresDB = db.prepare(`SELECT id, nome, salario_base, meta, bonus_meta FROM vendedores WHERE ativo = 1`).all()
  const vendMap = {}
  vendedoresDB.forEach(v => { vendMap[v.id] = v })

  const idsComOS = new Set(itens.map(i => i.vendedor_id))

  const vendedores = itens.map(v => {
    const info = vendMap[v.vendedor_id] || {}
    const salario = info.salario_base || 0
    const meta = info.meta || 0
    const bonus_meta = info.bonus_meta || 0
    const bonus_aplicado = (meta > 0 && v.total_os >= meta) ? bonus_meta : 0
    const total_vales = valesMap[v.vendedor_id] || 0
    return {
      nome: v.vendedor_nome,
      salario_base: salario,
      qtd_os: v.qtd_os,
      total_os: v.total_os,
      percentual_comissao: v.percentual,
      total_comissao: v.total_comissao,
      meta_atingida: meta > 0 && v.total_os >= meta,
      bonus_aplicado,
      total_vales,
      total_a_pagar: Math.max(0, salario + v.total_comissao + bonus_aplicado - total_vales)
    }
  })

  // Inclui vendedores com salário que não tiveram OS no mês
  vendedoresDB.filter(v => v.salario_base > 0 && !idsComOS.has(v.id)).forEach(v => {
    const total_vales = valesMap[v.id] || 0
    vendedores.push({
      nome: v.nome,
      salario_base: v.salario_base,
      qtd_os: 0,
      total_os: 0,
      percentual_comissao: 0,
      total_comissao: 0,
      meta_atingida: false,
      bonus_aplicado: 0,
      total_vales,
      total_a_pagar: Math.max(0, v.salario_base - total_vales)
    })
  })

  return {
    ok: true,
    status_execucao: 'CONCLUIDO',
    mes, ano, mes_nome: MESES[mes - 1],
    fechamento_id: resultado.fechamento_id,
    vendedores,
    totais: {
      total_comissoes: resultado.total_geral,
      total_salarios: resultado.total_salarios,
      total_bonus: resultado.total_bonus,
      total_vales: resultado.total_vales,
      total_a_pagar: resultado.total_a_pagar
    }
  }
}

function executarExcluirGasto({ descricao, data, valor }) {
  let sql = `SELECT * FROM gastos WHERE norm(descricao) LIKE norm(?)`
  const params = [`%${descricao}%`]
  if (data) { sql += ` AND date(data) = ?`; params.push(data) }
  if (valor) { sql += ` AND ABS(valor - ?) < 0.01`; params.push(valor) }
  sql += ` ORDER BY data DESC LIMIT 5`

  const gastos = db.prepare(sql).all(...params)
  if (!gastos.length) return { error: `Nenhum gasto encontrado com "${descricao}"` }
  if (gastos.length > 1) return { multiplos: true, gastos, mensagem: 'Encontrei mais de um gasto. Informe a data e o valor para identificar o correto.' }

  const g = gastos[0]
  db.prepare(`DELETE FROM gastos WHERE id = ?`).run(g.id)
  return { ok: true, status_execucao: 'CONCLUIDO', excluido: { id: g.id, descricao: g.descricao, valor: g.valor, data: g.data } }
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

function executarFerramenta(name, input) {
  switch (name) {
    case 'resumo_geral':              return executarResumoGeral()
    case 'fechamento_caixa':          return executarFechamentoCaixa(input)
    case 'buscar_os':                 return executarBuscarOS(input)
    case 'cobrancas_abertas':         return executarCobrancasAbertas(input)
    case 'historico_cliente':         return executarHistoricoCliente(input)
    case 'estoque_baixo':             return executarEstoqueBaixo()
    case 'buscar_produto':            return executarBuscarProduto(input)
    case 'a_receber_pendente':        return executarAReceberPendente(input)
    case 'gastos_periodo':            return executarGastosPeriodo(input)
    case 'desempenho_vendedor':       return executarDesempenhoVendedor(input)
    case 'resultado_liquido':         return executarResultadoLiquido(input)
    case 'consumo_periodo':           return executarConsumoPeriodo(input)
    case 'listar_pedidos':            return executarListarPedidos(input)
    case 'listar_lembretes':          return executarListarLembretes(input)
    case 'registrar_gasto':           return executarRegistrarGasto(input)
    case 'criar_os':                  return executarCriarOS(input)
    case 'atualizar_status_os':       return executarAtualizarStatusOS(input)
    case 'registrar_consumo_interno': return executarRegistrarConsumoInterno(input)
    case 'criar_lembrete':            return executarCriarLembrete(input)
    case 'adicionar_pedido_compra':   return executarAdicionarPedidoCompra(input)
    case 'editar_os':                 return executarEditarOS(input)
    case 'ajustar_estoque':           return executarAjustarEstoque(input)
    case 'marcar_pedido_comprado':    return executarMarcarPedidoComprado(input)
    case 'excluir_gasto':             return executarExcluirGasto(input)
    case 'fechar_mes_comissoes':      return executarFecharMesComissoes(input)
    default: return { error: `Ferramenta desconhecida: ${name}` }
  }
}

// ─── Route ────────────────────────────────────────────────────────────────────

router.post('/', async (req, res) => {
  const { mensagem, historico = [] } = req.body
  if (!mensagem?.trim()) return res.status(400).json({ error: 'mensagem é obrigatória' })

  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'sua_chave_aqui') {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada. Edite o arquivo .env e reinicie o servidor.' })
  }

  const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const hojeISO = new Date().toLocaleDateString('en-CA')
  const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  const system = `Você é o assistente inteligente de gestão de uma empresa de chaveiro e serviços.
Hoje é ${hoje}, ${hora}.
Data para usar em datas (ISO): ${hojeISO}.

Você tem acesso completo e em tempo real a todo o sistema. Pode consultar qualquer dado e executar ações diretamente.

CAPACIDADES DE CONSULTA:
• Resumo geral do negócio (caixa, OS, recebimentos, estoque, resultados)
• Fechamento de caixa por período (hoje, semana, mês ou personalizado)
• Busca e listagem de OS por número, cliente ou status
• Histórico completo de qualquer cliente
• Situação do estoque (baixo, busca por produto)
• Contas a receber (pendentes, vencidas, por cliente)
• Gastos e despesas por período e categoria
• Desempenho dos funcionários e comissões
• Histórico de consumo interno de material
• Pedidos de compra pendentes
• Lembretes agendados

CAPACIDADES DE AÇÃO (controle total do sistema — só não altera senhas ou permissões):
• Criar e EDITAR OS (qualquer campo: descrição, valor, cliente, funcionário, data, observações, etc.)
• Atualizar status de OS (concluir, cancelar, reabrir, marcar como a receber)
• Registrar e excluir gastos e despesas
• Registrar consumo interno de material
• Ajustar estoque de qualquer produto (definir valor exato, adicionar ou subtrair)
• Marcar pedidos de compra como comprados (com ou sem atualização de estoque)
• Adicionar itens à lista de pedidos de compra
• Criar lembretes para funcionários via WhatsApp
• Fechar o mês de comissões (calcula salário + comissão + bônus - vales = total a pagar por funcionário)

IMPORTANTE: Você TEM acesso para editar qualquer dado do sistema acima. Nunca diga ao usuário que "não tem acesso" ou "precisa ser feito no cadastro" para operações cobertas pelas ferramentas acima. Se a ferramenta existe, USE.

REGRAS IMPORTANTES:
1. Para qualquer ação que modifica dados, SEMPRE apresente um resumo claro antes de executar:
   "📝 Vou registrar: [resumo]. Confirma?"
   Só execute a ferramenta após confirmação explícita (sim, ok, pode, confirma, vai, certo, etc.).

2. REGRA CRÍTICA para ações que envolvem produtos (registrar_consumo_interno, adicionar_pedido_compra):
   Antes de mostrar o resumo de confirmação, OBRIGATORIAMENTE chame buscar_produto para encontrar o produto exato no cadastro.
   No resumo de confirmação, use SEMPRE o nome exato como está cadastrado no sistema — nunca o termo genérico que o usuário usou.
   Se encontrar mais de um produto parecido, liste as opções e pergunte qual é o correto ANTES de confirmar.
   Se não encontrar nenhum produto, avise o usuário antes de continuar.

2b. REGRA PARA ERRO DE CORTE COM SUBSTITUIÇÃO DE PRODUTO:
   Quando o usuário descrever um cenário com DUAS chaves/produtos diferentes (ex: "cortei uma 590 errada, a certa era 595"), entenda a lógica:
   - A chave ERRADA (590) = a que foi desperdiçada, pode já estar no histórico ou precisar ser registrada
   - A chave CERTA/NOVA (595) = a que foi usada para REFAZER o serviço, essa é a que precisa sair do estoque agora
   NUNCA assuma automaticamente qual produto retirar quando dois produtos diferentes são mencionados.
   SEMPRE pergunte explicitamente antes de confirmar:
   "Qual produto precisa sair do estoque agora: a [chave errada] que foi desperdiçada ou a [chave certa] que foi usada para refazer? Ou as duas?"
   Só após a resposta do usuário esclarecer qual produto (ou ambos), siga para a busca e confirmação.

3. REGRA DE EXECUÇÃO — nunca negar, nunca repetir:
   Quando uma ferramenta retornar { ok: true } ou { id: ... }, a ação FOI EXECUTADA com sucesso.
   Neste caso, sua resposta DEVE confirmar que foi feito (ex: "✅ Registrado!", "✅ OS criada: OS2504001").
   NUNCA diga "não foi possível", "não executei" ou "vou tentar fazer" se o resultado já mostrou ok: true.
   NUNCA chame a mesma ferramenta duas vezes para a mesma ação — se já executou e deu ok, encerre.
   Se o resultado trouxer { error: ... }, aí sim informe o problema e pergunte como proceder.

4. Seja proativo com insights. Se perceber algo relevante nos dados (OS vencida há muito tempo, estoque crítico, cliente com várias OS abertas), mencione sem ser mandado.

5. Quando a pergunta for vaga ("como tá?", "tudo certo?", "situação?"), chame resumo_geral automaticamente.

6. Se o usuário mencionar uma OS, cliente ou produto, busque os dados reais antes de responder.

7. Ao responder, seja direto e prático — o dono quer informações para tomar decisões rápidas, não dissertações.

8. Formate valores como R$ X.XXX,XX.
   NUNCA use tabelas markdown para mostrar resultados financeiros — elas não renderizam bem.
   Para resultados financeiros (resultado_liquido, fechamento_caixa, gastos), use SEMPRE este formato de texto simples:

   🔧 OS Concluídas (6): R$ 1.180,00
   🛒 Vendas (1): R$ 45,00
   **Total Faturado: R$ 1.225,00**

   💳 Por forma de pagamento:
   PIX: R$ 800,00
   Dinheiro: R$ 380,00
   Cartão: R$ 45,00
   (Se houver a_receber_aberto.total > 0): ⚠️ A Receber em Aberto (X cobranças): R$ XXX,00

   ➖ Material: R$ 300,00
   ➖ Alimentação: R$ 72,00

   👥 **Funcionários:**
   👤 **Márcio**
      💼 Salário: R$ 2.000,00
      💰 Comissão (5%, 1 OS): +R$ 59,00
      🏆 Bônus meta: +R$ 200,00
      ➖ Vale: -R$ 100,00
      → **A receber: R$ 2.159,00**
   👤 **Flávio**
      💼 Salário: R$ 2.000,00
      🎯 Meta: R$ 800,00 / R$ 1.000,00 (não atingida)
      → **A receber: R$ 2.000,00**

   **Total Deduções: R$ 4.371,00**

   Regras para o bloco de funcionários (usa deducoes.por_funcionario):
   - Mostre cada funcionário separado, com título "👤 **[Nome]**"
   - Mostre só as linhas com valor > 0: salario_base, comissao (com % e qtd_os), bonus
   - Se bonus > 0: mostre "🏆 Bônus meta: +R$ X"
   - Se meta > 0 e bonus = 0: mostre "🎯 Meta: R$ total_os / R$ meta (não atingida)"
   - Se vales > 0: mostre "➖ Vale: -R$ X"
   - Sempre mostre "→ A receber: R$ X" (ou "→ ⚠️ Devendo: R$ X" se devendo=true)
   - Se por_funcionario estiver vazio, omita o bloco de funcionários

   ✅ **Lucro Líquido: R$ 694,00** (margem 56,7%)

   Mostre SEMPRE a seção "Por forma de pagamento" quando houver dados. Se a_receber_aberto.total > 0, mostre a linha de A Receber logo abaixo dos pagamentos.
   Cada item em sua própria linha, valor ao lado. Simples, direto, sem tabela.

   Para desempenho_vendedor: se meta > 0, mostre "Meta: R$ X — ✅ Atingida" ou "❌ Faltam R$ Y". Se bonus_meta > 0 e atingiu_meta: "Bônus: R$ X".

   Para fechar_mes_comissoes, use SEMPRE este formato por funcionário:
   👷 **[Nome]**
   💼 Salário: R$ 1.200,00
   💰 Comissão ([%]%, [N] OS): R$ 59,00
   🎯 Bônus meta: R$ 200,00  ← só se bonus_aplicado > 0
   ➖ Vales: R$ 100,00  ← só se total_vales > 0
   **= Total a pagar: R$ 1.359,00**

   Ao final do fechamento, mostre o resumo:
   **Fechamento [Mês/Ano] concluído ✅**
   💰 Total comissões: R$ X
   💼 Total salários: R$ X
   🎯 Total bônus: R$ X  ← só se > 0
   ➖ Total vales: R$ X  ← só se > 0
   **= Total a pagar: R$ X**

9. Responda em português brasileiro informal e natural — como um sócio de confiança que entende do negócio, não como um robô.`

  const messages = [
    ...historico.slice(-20).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: mensagem }
  ]

  try {
    let response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system,
      tools,
      messages
    })

    while (response.stop_reason === 'tool_use') {
      const toolBlocks = response.content.filter(b => b.type === 'tool_use')
      messages.push({ role: 'assistant', content: response.content })

      const toolResults = []
      for (const block of toolBlocks) {
        let result
        try { result = executarFerramenta(block.name, block.input) }
        catch (e) { result = { error: e.message } }
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) })
      }

      messages.push({ role: 'user', content: toolResults })

      response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system,
        tools,
        messages
      })
    }

    const texto = response.content.find(b => b.type === 'text')?.text || 'Não consegui processar sua solicitação.'
    res.json({ resposta: texto })
  } catch (e) {
    console.error('Assistente erro:', e.message)
    res.status(500).json({ error: e.message || 'Erro interno no assistente' })
  }
})

module.exports = router
