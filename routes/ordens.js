const express = require('express');
const router = express.Router();
const db = require('../database/db');
const bcrypt = require('bcryptjs');
const wa = require('../services/whatsapp');
const { ajustarEstoqueUsuario, getQtdUsuario } = require('./estoque');
const { notificarFuncionario } = require('./app-mobile');
const { fmtVal, fmtDH, fmtAddr } = require('../utils/formatters');
const gerarNumeroOS = require('../utils/gerarNumeroOS');

// Deduz estoque de produtos diretos e produtos vinculados a serviços
// Itens com perguntar_estoque=1 são pulados — serão tratados via modal de consumo
function deduzirEstoqueOS(osId, osNumero, user) {
    const itens = db.prepare(`
        SELECT ios.produto_id, ios.servico_id, ios.quantidade,
               ts.produto_id as serv_produto_id, ts.produto_quantidade as serv_produto_qtd,
               COALESCE(p.perguntar_estoque, 0) as produto_perguntar,
               COALESCE(ts.perguntar_estoque, 0) as servico_perguntar
        FROM itens_ordem_servico ios
        LEFT JOIN tipos_servico ts ON ts.id = ios.servico_id
        LEFT JOIN produtos p ON p.id = ios.produto_id
        WHERE ios.ordem_id = ?
    `).all(osId);

    const stmtMov = db.prepare(`INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, estoque_anterior, estoque_posterior, referencia, observacao, usuario_id, loja_id) VALUES (?, 'saida', ?, ?, ?, ?, 'OS concluída', ?, ?)`);

    // Agrupa por produto_id para somar deduções do mesmo produto (exceto perguntar_estoque)
    const deducoes = {};
    itens.forEach(it => {
        if (it.produto_id && !it.produto_perguntar) {
            deducoes[it.produto_id] = (deducoes[it.produto_id] || 0) + it.quantidade;
        }
        if (it.servico_id && it.serv_produto_id && !it.servico_perguntar) {
            const qtd = it.quantidade * (it.serv_produto_qtd || 1);
            deducoes[it.serv_produto_id] = (deducoes[it.serv_produto_id] || 0) + qtd;
        }
    });

    const userId = user?.id || null;
    const lojaId = user?.loja_id || null;
    const isPrincipal = user?.principal;

    Object.entries(deducoes).forEach(([prodId, qtd]) => {
        const pid = parseInt(prodId);
        if (isPrincipal) {
            const p = db.prepare('SELECT estoque FROM produtos WHERE id = ?').get(pid);
            if (!p) return;
            const novoEstoque = Math.max(0, p.estoque - qtd);
            db.prepare('UPDATE produtos SET estoque = MAX(0, estoque - ?) WHERE id = ?').run(qtd, pid);
            stmtMov.run(pid, qtd, p.estoque, novoEstoque, `OS ${osNumero}`, userId, lojaId);
        } else {
            const anterior = getQtdUsuario(userId, pid);
            ajustarEstoqueUsuario(userId, pid, lojaId, -qtd);
            const posterior = getQtdUsuario(userId, pid);
            stmtMov.run(pid, qtd, anterior, posterior, `OS ${osNumero}`, userId, lojaId);
        }
    });
}

function verificarPerguntaEstoque(osId) {
    const row = db.prepare(`
        SELECT COUNT(*) as cnt FROM itens_ordem_servico ios
        LEFT JOIN produtos p ON ios.produto_id = p.id
        LEFT JOIN tipos_servico ts ON ios.servico_id = ts.id
        WHERE ios.ordem_id = ? AND (COALESCE(p.perguntar_estoque, 0) = 1 OR COALESCE(ts.perguntar_estoque, 0) = 1)
    `).get(osId);
    return row.cnt > 0;
}

// GET /api/ordens
router.get('/', (req, res) => {
    const { status, cliente_id, q, a_receber, data_inicio, data_fim, is_plantao } = req.query;
    const { loja_id: lojaId, id: userId, principal, perfil } = req.user;
    let query = `SELECT os.*, c.nome as cliente_nome, c.telefone as cliente_telefone, ts.nome as servico_nome, ven.nome as vendedor_nome
    FROM ordens_servico os
    LEFT JOIN clientes c ON os.cliente_id = c.id
    LEFT JOIN tipos_servico ts ON os.tipo_servico_id = ts.id
    LEFT JOIN vendedores ven ON os.vendedor_id = ven.id
    WHERE os.loja_id = ?`;
    const params = [lojaId];
    if (!principal && perfil !== 'admin') {
        query += ' AND os.usuario_id = ?'; params.push(userId);
    } else if (req.query.usuario_id && req.query.usuario_id !== 'all') {
        query += ' AND os.usuario_id = ?'; params.push(parseInt(req.query.usuario_id));
    }
    if (status) { query += ' AND os.status = ?'; params.push(status); }
    if (cliente_id) { query += ' AND os.cliente_id = ?'; params.push(cliente_id); }
    if (q) { query += ' AND (os.numero LIKE ? OR c.nome LIKE ? OR os.descricao LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    if (a_receber === '1') { query += ' AND os.a_receber = 1 AND os.a_receber_pago = 0'; }
    if (is_plantao === '1') { query += ' AND os.is_plantao = 1'; }
    else if (is_plantao === '0') { query += ' AND COALESCE(os.is_plantao, 0) = 0'; }
    if (data_inicio) { query += ' AND date(os.data_entrada) >= ?'; params.push(data_inicio); }
    if (data_fim) { query += ' AND date(os.data_entrada) <= ?'; params.push(data_fim); }
    query += ' ORDER BY os.data_entrada DESC';
    res.json(db.prepare(query).all(...params));
});

// GET /api/ordens/:id
router.get('/:id', (req, res) => {
    const os = db.prepare(`SELECT os.*,
        c.nome as cliente_nome, c.telefone as cliente_telefone, c.email as cliente_email,
        c.endereco as cliente_endereco, c.numero as cliente_numero, c.bairro as cliente_bairro,
        c.cidade as cliente_cidade, c.cep as cliente_cep, c.complemento as cliente_complemento,
        c.cpf as cliente_cpf, c.cnpj as cliente_cnpj,
        ts.nome as servico_nome, ven.nome as vendedor_nome
    FROM ordens_servico os
    LEFT JOIN clientes c ON os.cliente_id = c.id
    LEFT JOIN tipos_servico ts ON os.tipo_servico_id = ts.id
    LEFT JOIN vendedores ven ON os.vendedor_id = ven.id
    WHERE os.id = ? AND os.loja_id = ?`).get(req.params.id, req.user.loja_id);
    if (!os) return res.status(404).json({ error: 'OS não encontrada' });
    const itens = db.prepare(`
        SELECT ios.*,
            p.nome as produto_nome,
            ts.nome as servico_nome
        FROM itens_ordem_servico ios
        LEFT JOIN produtos p ON ios.produto_id = p.id
        LEFT JOIN tipos_servico ts ON ios.servico_id = ts.id
        WHERE ios.ordem_id = ?`).all(req.params.id);
    res.json({ ...os, itens });
});

// POST /api/ordens
router.post('/', (req, res) => {
    const { cliente_id, cliente_nome_avulso, cliente_avulso_rua, cliente_avulso_numero, cliente_avulso_complemento, cliente_avulso_cidade, cliente_avulso_referencia, tipo_servico_id, vendedor_id, descricao, valor, data_prevista, observacoes, forma_pagamento, itens, a_receber, data_vencimento, solicitado_por, chave_auto, orcamento, status, is_plantao, contato_cliente } = req.body;
    const lojaId = req.user.loja_id;
    const STATUSES = ['aberta', 'em_andamento', 'reagendar', 'concluida', 'cancelada'];
    const statusFinal = STATUSES.includes(status) ? status : 'aberta';
    const dc = statusFinal === 'concluida' ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null;

    const insertOS = db.transaction(() => {
        const numero = gerarNumeroOS(); // dentro da transação para garantir unicidade
        const result = db.prepare(`
            INSERT INTO ordens_servico (numero, cliente_id, cliente_nome_avulso, cliente_avulso_rua, cliente_avulso_numero, cliente_avulso_complemento, cliente_avulso_cidade, cliente_avulso_referencia, tipo_servico_id, vendedor_id, descricao, status, valor, data_prevista, data_conclusao, observacoes, forma_pagamento, a_receber, data_vencimento, solicitado_por, chave_auto, orcamento, is_plantao, contato_cliente, usuario_id, loja_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(numero, cliente_id || null, cliente_nome_avulso || null, cliente_avulso_rua || null, cliente_avulso_numero || null, cliente_avulso_complemento || null, cliente_avulso_cidade || null, cliente_avulso_referencia || null, tipo_servico_id || null, vendedor_id || null, descricao, statusFinal, valor || 0, data_prevista || null, dc, observacoes || null, forma_pagamento || null, a_receber ? 1 : 0, data_vencimento || null, solicitado_por || null, chave_auto ? 1 : 0, orcamento ? 1 : 0, is_plantao ? 1 : 0, contato_cliente || null, req.user?.id || null, lojaId);

        const osId = result.lastInsertRowid;

        if (itens && itens.length > 0) {
            const stmt = db.prepare(`INSERT INTO itens_ordem_servico (ordem_id, produto_id, servico_id, descricao, quantidade, preco_unitario, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)`);
            itens.forEach(item => {
                stmt.run(osId, item.produto_id || null, item.servico_id || null, item.descricao, item.quantidade, item.preco_unitario, item.quantidade * item.preco_unitario);
            });
        }

        return { osId, numero };
    });

    const { osId, numero } = insertOS();

    // Notificação WhatsApp ao funcionário
    if (vendedor_id) {
        try {
            const vendedor = db.prepare('SELECT nome, telefone FROM vendedores WHERE id = ?').get(vendedor_id);
            if (vendedor?.telefone) {
                const cli = cliente_id ? db.prepare('SELECT nome, endereco, numero, complemento, bairro, cidade, referencia FROM clientes WHERE id = ?').get(cliente_id) : null;
                const nomeCliente = cli?.nome || cliente_nome_avulso || '????';
                const enderecoWA = cli
                    ? fmtAddr(cli.endereco, cli.numero, cli.complemento, cli.bairro, cli.cidade, cli.referencia)
                    : fmtAddr(cliente_avulso_rua, cliente_avulso_numero, cliente_avulso_complemento, null, cliente_avulso_cidade, cliente_avulso_referencia);

                const pgLabels = { dinheiro: 'Dinheiro 💵', pix: 'PIX 📱', debito: 'Cartão Débito 💳', credito: 'Cartão Crédito 💳' };

                const itensOS = db.prepare(`
                    SELECT ios.descricao, ios.quantidade, ios.preco_unitario, ios.subtotal,
                           ios.servico_id, ios.produto_id
                    FROM itens_ordem_servico ios WHERE ios.ordem_id = ?
                `).all(osId);

                const itensTexto = itensOS.length
                    ? itensOS.map(it => {
                        const tipo = it.servico_id ? '🔧' : '📦';
                        const qtd = it.quantidade > 1 ? ` x${it.quantidade}` : '';
                        return `  ${tipo} ${it.descricao}${qtd} — ${fmtVal(it.subtotal)}`;
                    }).join('\n')
                    : '  (sem itens)';

                const previsto = data_prevista
                    ? `\n📅 *Previsto:* ${fmtDH(data_prevista)}`
                    : '';
                const pagamento = forma_pagamento
                    ? `\n💳 *Pagamento:* ${pgLabels[forma_pagamento] || forma_pagamento}`
                    : '';
                const obs = observacoes
                    ? `\n📌 *Obs:* ${observacoes}`
                    : '';

                const msg = [
                    `🔧 *Nova OS Atribuída!*`,
                    ``,
                    `Olá ${vendedor.nome}! Você tem uma nova ordem de serviço.`,
                    ``,
                    `📋 OS: *${numero}*`,
                    `👤 Cliente: ${nomeCliente}${enderecoWA}`,
                    `📝 Descrição: ${descricao}${previsto}`,
                    ``,
                    `*Serviços e Produtos:*`,
                    itensTexto,
                    ``,
                    `💰 *Total: ${fmtVal(valor)}*${pagamento}${obs}`,
                    ``,
                    `Acesse o sistema para mais detalhes.`
                ].join('\n');

                wa.enviarMensagem(vendedor.telefone, msg).catch(e => console.error('WA OS criada:', e.message));
            }
            // Push notification no app do funcionário
            notificarFuncionario(vendedor_id, '🔧 Nova OS', `${numero} — ${cliente_id ? db.prepare('SELECT nome FROM clientes WHERE id = ?').get(cliente_id)?.nome : (cliente_nome_avulso || 'Avulso')}: ${descricao}`).catch(() => {});
        } catch (_) {}
    }

    res.status(201).json({ id: osId, numero });
});

// PUT /api/ordens/:id
router.put('/:id', (req, res) => {
    const os = db.prepare('SELECT * FROM ordens_servico WHERE id = ? AND loja_id = ?').get(req.params.id, req.user.loja_id);
    if (!os) return res.status(404).json({ error: 'OS não encontrada' });
    const { cliente_id, cliente_nome_avulso, cliente_avulso_rua, cliente_avulso_numero, cliente_avulso_complemento, cliente_avulso_cidade, cliente_avulso_referencia, tipo_servico_id, vendedor_id, descricao, status, valor, data_prevista, data_conclusao, observacoes, forma_pagamento, itens, a_receber, data_vencimento, solicitado_por, chave_auto, orcamento, is_plantao, contato_cliente } = req.body;

    // Preserva data_conclusao existente; só define se está concluindo pela primeira vez;
    // limpa se estiver saindo do status concluida
    let dc = os.data_conclusao || null;
    if (status === 'concluida' && !os.data_conclusao) {
        const now = new Date();
        dc = now.toLocaleDateString('en-CA') + ' ' + now.toLocaleTimeString('pt-BR');
    } else if (status !== 'concluida') {
        dc = null;
    }

    const updateOS = db.transaction(() => {
        db.prepare(`UPDATE ordens_servico SET cliente_id=?, cliente_nome_avulso=?, cliente_avulso_rua=?, cliente_avulso_numero=?, cliente_avulso_complemento=?, cliente_avulso_cidade=?, cliente_avulso_referencia=?, tipo_servico_id=?, vendedor_id=?, descricao=?, status=?, valor=?, data_prevista=?, data_conclusao=?, observacoes=?, forma_pagamento=?, a_receber=?, data_vencimento=?, solicitado_por=?, chave_auto=?, orcamento=?, is_plantao=?, contato_cliente=? WHERE id=? AND loja_id=?`)
            .run(cliente_id || null, cliente_nome_avulso || null, cliente_avulso_rua || null, cliente_avulso_numero || null, cliente_avulso_complemento || null, cliente_avulso_cidade || null, cliente_avulso_referencia || null, tipo_servico_id || null, vendedor_id || null, descricao, status || 'aberta', valor || 0, data_prevista || null, dc || null, observacoes || null, forma_pagamento || null, a_receber ? 1 : 0, data_vencimento || null, solicitado_por || null, chave_auto ? 1 : 0, orcamento ? 1 : 0, is_plantao ? 1 : 0, contato_cliente || null, req.params.id, req.user.loja_id);

        if (itens) {
            db.prepare('DELETE FROM itens_ordem_servico WHERE ordem_id = ?').run(req.params.id);
            const stmt = db.prepare(`INSERT INTO itens_ordem_servico (ordem_id, produto_id, servico_id, descricao, quantidade, preco_unitario, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)`);
            itens.forEach(item => {
                stmt.run(req.params.id, item.produto_id || null, item.servico_id || null, item.descricao, item.quantidade, item.preco_unitario, item.quantidade * item.preco_unitario);
            });
        }

        // Deduz estoque ao concluir via edição (somente na primeira vez)
        if (status === 'concluida' && os.status !== 'concluida') {
            deduzirEstoqueOS(req.params.id, os.numero, req.user);
        }
    });

    updateOS();
    const foi_concluida = status === 'concluida' && os.status !== 'concluida';
    const tem_pergunta_estoque = foi_concluida ? verificarPerguntaEstoque(req.params.id) : false;
    res.json({ ok: true, tem_pergunta_estoque });
});

// PUT /api/ordens/:id/receber — marca o pagamento pendente como recebido (quitação total)
router.put('/:id/receber', (req, res) => {
    const os = db.prepare('SELECT * FROM ordens_servico WHERE id = ? AND loja_id = ?').get(req.params.id, req.user.loja_id);
    if (!os) return res.status(404).json({ error: 'OS não encontrada' });
    if (!os.a_receber) return res.status(400).json({ error: 'Esta OS não está marcada como A Receber' });
    if (os.a_receber_pago) return res.status(400).json({ error: 'Esta OS já foi marcada como recebida' });

    const now = new Date();
    const dataRecebimento = now.toLocaleDateString('en-CA') + ' ' + now.toLocaleTimeString('pt-BR');
    const { forma_pagamento } = req.body;
    const restante = os.valor - (os.valor_pago || 0);

    if (restante > 0) {
        db.prepare('INSERT INTO pagamentos_cobranca (ordem_id, valor, forma_pagamento) VALUES (?, ?, ?)')
            .run(os.id, restante, forma_pagamento || 'dinheiro');
    }
    db.prepare(`UPDATE ordens_servico SET a_receber_pago = 1, valor_pago = valor, data_recebimento = ?${forma_pagamento ? ', forma_pagamento = ?' : ''} WHERE id = ? AND loja_id = ?`)
        .run(dataRecebimento, ...(forma_pagamento ? [forma_pagamento, req.params.id, req.user.loja_id] : [req.params.id, req.user.loja_id]));

    res.json({ ok: true });
});

// PATCH /api/ordens/:id/status — atualização rápida de status sem sobrescrever outros campos
router.patch('/:id/status', (req, res) => {
    const os = db.prepare('SELECT * FROM ordens_servico WHERE id = ? AND loja_id = ?').get(req.params.id, req.user.loja_id);
    if (!os) return res.status(404).json({ error: 'OS não encontrada' });

    const { status, forma_pagamento, pagamentos } = req.body;
    const STATUSES = ['aberta', 'em_andamento', 'reagendar', 'concluida', 'cancelada'];
    if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Status inválido' });

    let dc = os.data_conclusao;
    if (status === 'concluida' && !os.data_conclusao) {
        const now = new Date();
        dc = now.toLocaleDateString('en-CA') + ' ' + now.toLocaleTimeString('pt-BR');
    }

    // forma_pagamento fica com o método principal (ou o único)
    let fp = forma_pagamento || os.forma_pagamento || null;
    if (pagamentos && pagamentos.length === 1) fp = pagamentos[0].metodo;
    else if (pagamentos && pagamentos.length > 1) fp = pagamentos[0].metodo;

    db.transaction(() => {
        db.prepare(`UPDATE ordens_servico SET status = ?, data_conclusao = ?, forma_pagamento = ? WHERE id = ? AND loja_id = ?`)
            .run(status, dc, fp, req.params.id, req.user.loja_id);

        // Registra pagamentos split se fornecidos
        if (pagamentos && pagamentos.length > 0) {
            db.prepare('DELETE FROM pagamentos_os WHERE ordem_id = ?').run(req.params.id);
            const stmtPg = db.prepare('INSERT INTO pagamentos_os (ordem_id, metodo, valor) VALUES (?, ?, ?)');
            pagamentos.forEach(p => stmtPg.run(req.params.id, p.metodo, parseFloat(p.valor)));
        }

        // Deduz estoque ao concluir (somente na primeira vez que vira concluida)
        if (status === 'concluida' && os.status !== 'concluida') {
            deduzirEstoqueOS(req.params.id, os.numero, req.user);
        }
    })();

    const tem_pergunta_estoque = (status === 'concluida' && os.status !== 'concluida') ? verificarPerguntaEstoque(req.params.id) : false;
    res.json({ ok: true, status, data_conclusao: dc, tem_pergunta_estoque });
});

// PUT /api/ordens/:id/pausar-cobranca
router.put('/:id/pausar-cobranca', (req, res) => {
    const hoje = new Date().toLocaleDateString('en-CA');
    db.prepare('UPDATE ordens_servico SET cobranca_pausado_em = ? WHERE id = ? AND loja_id = ?').run(hoje, req.params.id, req.user.loja_id);
    res.json({ ok: true });
});

// PUT /api/ordens/:id/retomar-cobranca
router.put('/:id/retomar-cobranca', (req, res) => {
    db.prepare('UPDATE ordens_servico SET cobranca_pausado_em = NULL WHERE id = ? AND loja_id = ?').run(req.params.id, req.user.loja_id);
    res.json({ ok: true });
});

// POST /api/ordens/:id/pagamento-parcial
router.post('/:id/pagamento-parcial', (req, res) => {
    const { valor, forma_pagamento, observacoes } = req.body;
    const os = db.prepare('SELECT * FROM ordens_servico WHERE id = ? AND loja_id = ?').get(req.params.id, req.user.loja_id);
    if (!os) return res.status(404).json({ error: 'OS não encontrada' });
    const valorParcial = parseFloat(valor);
    if (!valorParcial || valorParcial <= 0) return res.status(400).json({ error: 'Valor inválido' });
    const restanteAtual = os.valor - (os.valor_pago || 0);
    if (valorParcial > restanteAtual + 0.01) return res.status(400).json({ error: `Valor maior que o restante (R$ ${restanteAtual.toFixed(2)})` });

    const novoValorPago = (os.valor_pago || 0) + valorParcial;
    const quitado = novoValorPago >= os.valor - 0.01;
    const now = new Date();
    const agora = now.toLocaleDateString('en-CA') + ' ' + now.toLocaleTimeString('pt-BR');

    db.prepare('INSERT INTO pagamentos_cobranca (ordem_id, valor, forma_pagamento, observacoes) VALUES (?, ?, ?, ?)')
        .run(os.id, valorParcial, forma_pagamento || 'dinheiro', observacoes || null);
    db.prepare('UPDATE ordens_servico SET valor_pago = ?, a_receber_pago = ?, data_recebimento = ? WHERE id = ? AND loja_id = ?')
        .run(novoValorPago, quitado ? 1 : 0, quitado ? agora : null, os.id, req.user.loja_id);

    res.json({ ok: true, quitado, valor_pago: novoValorPago, valor_restante: Math.max(0, os.valor - novoValorPago) });
});

// POST /api/ordens/pagamento-cliente — distribui pagamento entre OS do cliente (FIFO)
router.post('/pagamento-cliente', (req, res) => {
    const { cliente_id, valor, forma_pagamento } = req.body;
    if (!cliente_id || !valor) return res.status(400).json({ error: 'Dados incompletos' });
    let restante = parseFloat(valor);
    const pendentes = db.prepare(`
        SELECT * FROM ordens_servico
        WHERE cliente_id = ? AND loja_id = ? AND a_receber = 1 AND a_receber_pago = 0
        ORDER BY data_vencimento IS NULL, data_vencimento ASC, data_entrada ASC
    `).all(cliente_id, req.user.loja_id);
    if (!pendentes.length) return res.status(400).json({ error: 'Nenhuma cobrança pendente para este cliente' });

    const now = new Date();
    const agora = now.toLocaleDateString('en-CA') + ' ' + now.toLocaleTimeString('pt-BR');

    const aplicar = db.transaction(() => {
        const resultados = [];
        for (const os of pendentes) {
            if (restante <= 0.01) break;
            const restanteOS = os.valor - (os.valor_pago || 0);
            const valorAplicar = Math.min(restante, restanteOS);
            const novoValorPago = (os.valor_pago || 0) + valorAplicar;
            const quitado = novoValorPago >= os.valor - 0.01;
            db.prepare('INSERT INTO pagamentos_cobranca (ordem_id, valor, forma_pagamento) VALUES (?, ?, ?)')
                .run(os.id, valorAplicar, forma_pagamento || 'dinheiro');
            db.prepare('UPDATE ordens_servico SET valor_pago = ?, a_receber_pago = ?, data_recebimento = ? WHERE id = ? AND loja_id = ?')
                .run(novoValorPago, quitado ? 1 : 0, quitado ? agora : null, os.id, req.user.loja_id);
            resultados.push({ numero: os.numero, valor_aplicado: valorAplicar, quitado });
            restante -= valorAplicar;
        }
        return resultados;
    });

    const resultados = aplicar();
    res.json({ ok: true, aplicados: resultados, sobrou: Math.max(0, restante) });
});

// GET /api/ordens/historico-pagamentos
router.get('/historico-pagamentos', (req, res) => {
    const rows = db.prepare(`
        SELECT pc.*, os.numero, COALESCE(c.nome, os.cliente_nome_avulso, '????') as cliente_nome
        FROM pagamentos_cobranca pc
        JOIN ordens_servico os ON pc.ordem_id = os.id
        LEFT JOIN clientes c ON os.cliente_id = c.id
        WHERE os.loja_id = ?
        ORDER BY pc.criado_em DESC
        LIMIT 50
    `).all(req.user.loja_id);
    res.json(rows);
});

// POST /api/ordens/:id/consumo-estoque — registra consumo adicional de estoque após finalizar OS
router.post('/:id/consumo-estoque', (req, res) => {
    const os = db.prepare('SELECT * FROM ordens_servico WHERE id = ? AND loja_id = ?').get(req.params.id, req.user.loja_id);
    if (!os) return res.status(404).json({ error: 'OS não encontrada' });
    const { itens, registrar_custo } = req.body;
    if (!itens || !itens.length) return res.json({ ok: true });

    const { id: userId, loja_id: lojaId, principal } = req.user;
    const stmtMov = db.prepare(`INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, estoque_anterior, estoque_posterior, referencia, observacao, usuario_id, loja_id) VALUES (?, 'saida', ?, ?, ?, ?, 'Consumo OS', ?, ?)`);

    let totalCusto = 0;
    db.transaction(() => {
        for (const { produto_id, quantidade } of itens) {
            const qtd = parseFloat(quantidade) || 0;
            if (!produto_id || qtd <= 0) continue;
            const pid = parseInt(produto_id);
            if (principal) {
                const p = db.prepare('SELECT estoque, preco_custo FROM produtos WHERE id = ?').get(pid);
                if (!p) continue;
                totalCusto += (p.preco_custo || 0) * qtd;
                const novoEstoque = Math.max(0, p.estoque - qtd);
                db.prepare('UPDATE produtos SET estoque = MAX(0, estoque - ?) WHERE id = ?').run(qtd, pid);
                stmtMov.run(pid, qtd, p.estoque, novoEstoque, `OS ${os.numero}`, userId, lojaId);
            } else {
                const p = db.prepare('SELECT preco_custo FROM produtos WHERE id = ?').get(pid);
                totalCusto += (p?.preco_custo || 0) * qtd;
                const anterior = getQtdUsuario(userId, pid);
                ajustarEstoqueUsuario(userId, pid, lojaId, -qtd);
                const posterior = getQtdUsuario(userId, pid);
                stmtMov.run(pid, qtd, anterior, posterior, `OS ${os.numero}`, userId, lojaId);
            }
        }
        if (os.is_plantao && registrar_custo && totalCusto > 0) {
            db.prepare('UPDATE ordens_servico SET custo_materiais = COALESCE(custo_materiais,0) + ? WHERE id = ?').run(totalCusto, os.id);
        }
    })();

    res.json({ ok: true });
});

// DELETE /api/ordens/:id
router.delete('/:id', (req, res) => {
    const { motivo } = req.body;
    if (!motivo) return res.status(400).json({ error: 'Motivo é obrigatório para cancelamento' });
    db.prepare("UPDATE ordens_servico SET status = 'cancelada', motivo_cancelamento = ? WHERE id = ? AND loja_id = ?").run(motivo, req.params.id, req.user.loja_id);
    res.json({ ok: true });
});

// DELETE /api/ordens/:id/excluir (exclusão física com senha — somente usuário principal)
router.delete('/:id/excluir', (req, res) => {
    if (!req.user.principal) return res.status(403).json({ error: 'Apenas o usuário principal pode excluir OS permanentemente' });

    const { senha } = req.body;
    if (!senha) return res.status(400).json({ error: 'Senha é obrigatória' });

    const cfg = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'senha_gerente'").get();
    if (!cfg || !cfg.valor) return res.status(400).json({ error: 'Senha do gerente não configurada. Acesse Configurações para definir.' });

    const senhaCorreta = cfg.valor.startsWith('$2')
        ? bcrypt.compareSync(senha, cfg.valor)
        : senha === cfg.valor; // compatibilidade com senhas legadas em texto plano
    if (!senhaCorreta) return res.status(422).json({ error: 'Senha incorreta' });

    const os = db.prepare('SELECT * FROM ordens_servico WHERE id = ? AND loja_id = ?').get(req.params.id, req.user.loja_id);
    if (!os) return res.status(404).json({ error: 'OS não encontrada' });

    db.transaction(() => {
        db.prepare('DELETE FROM itens_ordem_servico WHERE ordem_id = ?').run(req.params.id);
        db.prepare('DELETE FROM comissoes_itens WHERE ordem_id = ?').run(req.params.id);
        db.prepare('DELETE FROM pagamentos_cobranca WHERE ordem_id = ?').run(req.params.id);
        db.prepare('DELETE FROM pagamentos_os WHERE ordem_id = ?').run(req.params.id);
        db.prepare('DELETE FROM ordens_servico WHERE id = ? AND loja_id = ?').run(req.params.id, req.user.loja_id);
    })();

    res.json({ ok: true, numero: os.numero });
});

module.exports = router;
