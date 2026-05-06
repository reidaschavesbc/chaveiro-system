const express = require('express');
const router = express.Router();
const db = require('../database/db');
const wa = require('../services/whatsapp');

// Deduz estoque de produtos diretos e produtos vinculados a serviços
function deduzirEstoqueOS(osId, osNumero, userId) {
    const itens = db.prepare(`
        SELECT ios.produto_id, ios.servico_id, ios.quantidade,
               ts.produto_id as serv_produto_id, ts.produto_quantidade as serv_produto_qtd
        FROM itens_ordem_servico ios
        LEFT JOIN tipos_servico ts ON ts.id = ios.servico_id
        WHERE ios.ordem_id = ?
    `).all(osId);

    const stmtUpd = db.prepare('UPDATE produtos SET estoque = MAX(0, estoque - ?) WHERE id = ?');
    const stmtMov = db.prepare(`INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, estoque_anterior, estoque_posterior, referencia, observacao, usuario_id) VALUES (?, 'saida', ?, ?, ?, ?, 'OS concluída', ?)`);

    // Agrupa por produto_id para somar deduções do mesmo produto
    const deducoes = {};
    itens.forEach(it => {
        // Item com produto direto
        if (it.produto_id) {
            deducoes[it.produto_id] = (deducoes[it.produto_id] || 0) + it.quantidade;
        }
        // Item de serviço com produto vinculado
        if (it.servico_id && it.serv_produto_id) {
            const qtd = it.quantidade * (it.serv_produto_qtd || 1);
            deducoes[it.serv_produto_id] = (deducoes[it.serv_produto_id] || 0) + qtd;
        }
    });

    Object.entries(deducoes).forEach(([prodId, qtd]) => {
        const p = db.prepare('SELECT estoque FROM produtos WHERE id = ?').get(parseInt(prodId));
        if (!p) return;
        const novoEstoque = Math.max(0, p.estoque - qtd);
        stmtUpd.run(qtd, parseInt(prodId));
        stmtMov.run(parseInt(prodId), qtd, p.estoque, novoEstoque, `OS ${osNumero}`, userId || 1);
    });
}

function gerarNumeroOS() {
    const now = new Date();
    const ano = now.getFullYear().toString().slice(2);
    const mes = String(now.getMonth() + 1).padStart(2, '0');
    const count = db.prepare("SELECT COUNT(*) as c FROM ordens_servico WHERE strftime('%Y-%m', data_entrada) = ?").get(`${now.getFullYear()}-${mes}`);
    const seq = String(count.c + 1).padStart(4, '0');
    return `OS${ano}${mes}${seq}`;
}

// GET /api/ordens
router.get('/', (req, res) => {
    const { status, cliente_id, q, a_receber } = req.query;
    let query = `SELECT os.*, c.nome as cliente_nome, ts.nome as servico_nome
    FROM ordens_servico os
    LEFT JOIN clientes c ON os.cliente_id = c.id
    LEFT JOIN tipos_servico ts ON os.tipo_servico_id = ts.id
    WHERE 1=1`;
    const params = [];
    if (status) { query += ' AND os.status = ?'; params.push(status); }
    if (cliente_id) { query += ' AND os.cliente_id = ?'; params.push(cliente_id); }
    if (q) { query += ' AND (os.numero LIKE ? OR c.nome LIKE ? OR os.descricao LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    if (a_receber === '1') { query += ' AND os.a_receber = 1 AND os.a_receber_pago = 0'; }
    query += ' ORDER BY os.data_entrada DESC';
    res.json(db.prepare(query).all(...params));
});

// GET /api/ordens/:id
router.get('/:id', (req, res) => {
    const os = db.prepare(`SELECT os.*, c.nome as cliente_nome, c.telefone as cliente_telefone,
    ts.nome as servico_nome, ven.nome as vendedor_nome FROM ordens_servico os
    LEFT JOIN clientes c ON os.cliente_id = c.id
    LEFT JOIN tipos_servico ts ON os.tipo_servico_id = ts.id
    LEFT JOIN vendedores ven ON os.vendedor_id = ven.id
    WHERE os.id = ?`).get(req.params.id);
    if (!os) return res.status(404).json({ error: 'OS não encontrada' });
    const itens = db.prepare('SELECT * FROM itens_ordem_servico WHERE ordem_id = ?').all(req.params.id);
    res.json({ ...os, itens });
});

// POST /api/ordens
router.post('/', (req, res) => {
    const { cliente_id, cliente_nome_avulso, cliente_avulso_rua, cliente_avulso_numero, cliente_avulso_complemento, cliente_avulso_cidade, cliente_avulso_referencia, tipo_servico_id, vendedor_id, descricao, valor, data_prevista, observacoes, forma_pagamento, itens, a_receber, data_vencimento, solicitado_por, chave_auto, orcamento } = req.body;
const numero = gerarNumeroOS();

    const insertOS = db.transaction(() => {
        const result = db.prepare(`
            INSERT INTO ordens_servico (numero, cliente_id, cliente_nome_avulso, cliente_avulso_rua, cliente_avulso_numero, cliente_avulso_complemento, cliente_avulso_cidade, cliente_avulso_referencia, tipo_servico_id, vendedor_id, descricao, valor, data_prevista, observacoes, forma_pagamento, a_receber, data_vencimento, solicitado_por, chave_auto, orcamento, usuario_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(numero, cliente_id || null, cliente_nome_avulso || null, cliente_avulso_rua || null, cliente_avulso_numero || null, cliente_avulso_complemento || null, cliente_avulso_cidade || null, cliente_avulso_referencia || null, tipo_servico_id || null, vendedor_id || null, descricao, valor || 0, data_prevista || null, observacoes || null, forma_pagamento || null, a_receber ? 1 : 0, data_vencimento || null, solicitado_por || null, chave_auto ? 1 : 0, orcamento ? 1 : 0, req.user?.id || 1);

        const osId = result.lastInsertRowid;

        if (itens && itens.length > 0) {
            const stmt = db.prepare(`INSERT INTO itens_ordem_servico (ordem_id, produto_id, servico_id, descricao, quantidade, preco_unitario, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)`);
            itens.forEach(item => {
                stmt.run(osId, item.produto_id || null, item.servico_id || null, item.descricao, item.quantidade, item.preco_unitario, item.quantidade * item.preco_unitario);
            });
        }

        return osId;
    });

    const osId = insertOS();

    // Notificação WhatsApp ao funcionário
    if (vendedor_id) {
        try {
            const vendedor = db.prepare('SELECT nome, telefone FROM vendedores WHERE id = ?').get(vendedor_id);
            if (vendedor?.telefone) {
                const cli = cliente_id ? db.prepare('SELECT nome, endereco, numero, complemento, bairro, cidade, referencia FROM clientes WHERE id = ?').get(cliente_id) : null;
                const nomeCliente = cli?.nome || cliente_nome_avulso || '????';
                const fmtAddr = (rua, num, comp, bairro, cidade, ref) => {
                    if (!rua && !cidade) return '';
                    let linha = rua || '';
                    if (num) linha += `, ${num}`;
                    if (comp) linha += ` - ${comp}`;
                    if (bairro) linha += (linha ? ', ' : '') + bairro;
                    if (cidade) linha += (linha ? ' - ' : '') + cidade;
                    return `\n📍 *Endereço:* ${linha}${ref ? '\n🗺️ *Ref:* ' + ref : ''}`;
                };
                const enderecoWA = cli
                    ? fmtAddr(cli.endereco, cli.numero, cli.complemento, cli.bairro, cli.cidade, cli.referencia)
                    : fmtAddr(cliente_avulso_rua, cliente_avulso_numero, cliente_avulso_complemento, null, cliente_avulso_cidade, cliente_avulso_referencia);

                const pgLabels = { dinheiro: 'Dinheiro 💵', pix: 'PIX 📱', debito: 'Cartão Débito 💳', credito: 'Cartão Crédito 💳' };
                const fmtVal = v => 'R$ ' + parseFloat(v || 0).toFixed(2).replace('.', ',');

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

                const fmtDH = dp => {
                    const s = String(dp).replace('T', ' ').slice(0, 16);
                    const [dt, hr] = s.split(' ');
                    const [y, m, d] = dt.split('-');
                    return `${d}/${m}/${y}${hr ? ' ' + hr : ''}`;
                };
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
        } catch (_) {}
    }

    res.status(201).json({ id: osId, numero });
});

// PUT /api/ordens/:id
router.put('/:id', (req, res) => {
    const os = db.prepare('SELECT * FROM ordens_servico WHERE id = ?').get(req.params.id);
    if (!os) return res.status(404).json({ error: 'OS não encontrada' });
    const { cliente_id, cliente_nome_avulso, cliente_avulso_rua, cliente_avulso_numero, cliente_avulso_complemento, cliente_avulso_cidade, cliente_avulso_referencia, tipo_servico_id, vendedor_id, descricao, status, valor, data_prevista, data_conclusao, observacoes, forma_pagamento, itens, a_receber, data_vencimento, solicitado_por, chave_auto, orcamento } = req.body;

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
        db.prepare(`UPDATE ordens_servico SET cliente_id=?, cliente_nome_avulso=?, cliente_avulso_rua=?, cliente_avulso_numero=?, cliente_avulso_complemento=?, cliente_avulso_cidade=?, cliente_avulso_referencia=?, tipo_servico_id=?, vendedor_id=?, descricao=?, status=?, valor=?, data_prevista=?, data_conclusao=?, observacoes=?, forma_pagamento=?, a_receber=?, data_vencimento=?, solicitado_por=?, chave_auto=?, orcamento=? WHERE id=?`)
            .run(cliente_id || null, cliente_nome_avulso || null, cliente_avulso_rua || null, cliente_avulso_numero || null, cliente_avulso_complemento || null, cliente_avulso_cidade || null, cliente_avulso_referencia || null, tipo_servico_id || null, vendedor_id || null, descricao, status || 'aberta', valor || 0, data_prevista || null, dc || null, observacoes || null, forma_pagamento || null, a_receber ? 1 : 0, data_vencimento || null, solicitado_por || null, chave_auto ? 1 : 0, orcamento ? 1 : 0, req.params.id);

        if (itens) {
            db.prepare('DELETE FROM itens_ordem_servico WHERE ordem_id = ?').run(req.params.id);
            const stmt = db.prepare(`INSERT INTO itens_ordem_servico (ordem_id, produto_id, servico_id, descricao, quantidade, preco_unitario, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)`);
            itens.forEach(item => {
                stmt.run(req.params.id, item.produto_id || null, item.servico_id || null, item.descricao, item.quantidade, item.preco_unitario, item.quantidade * item.preco_unitario);
            });
        }

        // Deduz estoque ao concluir via edição (somente na primeira vez)
        if (status === 'concluida' && os.status !== 'concluida') {
            deduzirEstoqueOS(req.params.id, os.numero, req.user?.id);
        }
    });

    updateOS();
    res.json({ ok: true });
});

// PUT /api/ordens/:id/receber — marca o pagamento pendente como recebido (quitação total)
router.put('/:id/receber', (req, res) => {
    const os = db.prepare('SELECT * FROM ordens_servico WHERE id = ?').get(req.params.id);
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
    db.prepare(`UPDATE ordens_servico SET a_receber_pago = 1, valor_pago = valor, data_recebimento = ?${forma_pagamento ? ', forma_pagamento = ?' : ''} WHERE id = ?`)
        .run(dataRecebimento, ...(forma_pagamento ? [forma_pagamento, req.params.id] : [req.params.id]));

    res.json({ ok: true });
});

// PATCH /api/ordens/:id/status — atualização rápida de status sem sobrescrever outros campos
router.patch('/:id/status', (req, res) => {
    const os = db.prepare('SELECT * FROM ordens_servico WHERE id = ?').get(req.params.id);
    if (!os) return res.status(404).json({ error: 'OS não encontrada' });

    const { status, forma_pagamento, pagamentos } = req.body;
    const STATUSES = ['aberta', 'em_andamento', 'concluida', 'cancelada'];
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
        db.prepare(`UPDATE ordens_servico SET status = ?, data_conclusao = ?, forma_pagamento = ? WHERE id = ?`)
            .run(status, dc, fp, req.params.id);

        // Registra pagamentos split se fornecidos
        if (pagamentos && pagamentos.length > 0) {
            db.prepare('DELETE FROM pagamentos_os WHERE ordem_id = ?').run(req.params.id);
            const stmtPg = db.prepare('INSERT INTO pagamentos_os (ordem_id, metodo, valor) VALUES (?, ?, ?)');
            pagamentos.forEach(p => stmtPg.run(req.params.id, p.metodo, parseFloat(p.valor)));
        }

        // Deduz estoque ao concluir (somente na primeira vez que vira concluida)
        if (status === 'concluida' && os.status !== 'concluida') {
            deduzirEstoqueOS(req.params.id, os.numero, req.user?.id);
        }
    })();

    res.json({ ok: true, status, data_conclusao: dc });
});

// PUT /api/ordens/:id/pausar-cobranca
router.put('/:id/pausar-cobranca', (req, res) => {
    const hoje = new Date().toLocaleDateString('en-CA');
    db.prepare('UPDATE ordens_servico SET cobranca_pausado_em = ? WHERE id = ?').run(hoje, req.params.id);
    res.json({ ok: true });
});

// PUT /api/ordens/:id/retomar-cobranca
router.put('/:id/retomar-cobranca', (req, res) => {
    db.prepare('UPDATE ordens_servico SET cobranca_pausado_em = NULL WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

// POST /api/ordens/:id/pagamento-parcial
router.post('/:id/pagamento-parcial', (req, res) => {
    const { valor, forma_pagamento, observacoes } = req.body;
    const os = db.prepare('SELECT * FROM ordens_servico WHERE id = ?').get(req.params.id);
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
    db.prepare('UPDATE ordens_servico SET valor_pago = ?, a_receber_pago = ?, data_recebimento = ? WHERE id = ?')
        .run(novoValorPago, quitado ? 1 : 0, quitado ? agora : null, os.id);

    res.json({ ok: true, quitado, valor_pago: novoValorPago, valor_restante: Math.max(0, os.valor - novoValorPago) });
});

// POST /api/ordens/pagamento-cliente — distribui pagamento entre OS do cliente (FIFO)
router.post('/pagamento-cliente', (req, res) => {
    const { cliente_id, valor, forma_pagamento } = req.body;
    if (!cliente_id || !valor) return res.status(400).json({ error: 'Dados incompletos' });
    let restante = parseFloat(valor);
    const pendentes = db.prepare(`
        SELECT * FROM ordens_servico
        WHERE cliente_id = ? AND a_receber = 1 AND a_receber_pago = 0
        ORDER BY data_vencimento IS NULL, data_vencimento ASC, data_entrada ASC
    `).all(cliente_id);
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
            db.prepare('UPDATE ordens_servico SET valor_pago = ?, a_receber_pago = ?, data_recebimento = ? WHERE id = ?')
                .run(novoValorPago, quitado ? 1 : 0, quitado ? agora : null, os.id);
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
        ORDER BY pc.criado_em DESC
        LIMIT 50
    `).all();
    res.json(rows);
});

// DELETE /api/ordens/:id
router.delete('/:id', (req, res) => {
    const { motivo } = req.body;
    if (!motivo) return res.status(400).json({ error: 'Motivo é obrigatório para cancelamento' });
    db.prepare("UPDATE ordens_servico SET status = 'cancelada', motivo_cancelamento = ? WHERE id = ?").run(motivo, req.params.id);
    res.json({ ok: true });
});

// DELETE /api/ordens/:id/excluir (exclusão física com senha)
router.delete('/:id/excluir', (req, res) => {
    const { senha } = req.body;
    if (!senha) return res.status(400).json({ error: 'Senha é obrigatória' });

    const cfg = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'senha_gerente'").get();
    if (!cfg || !cfg.valor) return res.status(400).json({ error: 'Senha do gerente não configurada. Acesse Configurações para definir.' });
    if (senha !== cfg.valor) return res.status(422).json({ error: 'Senha incorreta' });

    const os = db.prepare('SELECT * FROM ordens_servico WHERE id = ?').get(req.params.id);
    if (!os) return res.status(404).json({ error: 'OS não encontrada' });

    db.transaction(() => {
        db.prepare('DELETE FROM itens_ordem_servico WHERE ordem_id = ?').run(req.params.id);
        db.prepare('DELETE FROM comissoes_itens WHERE ordem_id = ?').run(req.params.id);
        db.prepare('DELETE FROM pagamentos_cobranca WHERE ordem_id = ?').run(req.params.id);
        db.prepare('DELETE FROM pagamentos_os WHERE ordem_id = ?').run(req.params.id);
        db.prepare('DELETE FROM ordens_servico WHERE id = ?').run(req.params.id);
    })();

    res.json({ ok: true, numero: os.numero });
});

module.exports = router;
