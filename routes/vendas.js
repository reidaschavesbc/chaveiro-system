const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { ajustarEstoqueUsuario, getQtdUsuario } = require('./estoque');
const { verificarEstoqueBaixo } = require('./pedidos');

function gerarNumeroVenda() {
    const now = new Date();
    const ano = now.getFullYear().toString().slice(2);
    const mes = String(now.getMonth() + 1).padStart(2, '0');
    const prefix = `V${ano}${mes}`;
    const last = db.prepare("SELECT numero FROM vendas WHERE numero LIKE ? ORDER BY numero DESC LIMIT 1").get(prefix + '%');
    const seq = last ? (parseInt(last.numero.slice(prefix.length)) || 0) + 1 : 1;
    return `${prefix}${String(seq).padStart(4, '0')}`;
}

// GET /api/vendas
router.get('/', (req, res) => {
    const { data_inicio, data_fim, cliente_id } = req.query;
    const { loja_id: lojaId, id: userId, principal } = req.user;
    let query = `SELECT v.*, c.nome as cliente_nome, ven.nome as vendedor_nome FROM vendas v
    LEFT JOIN clientes c ON v.cliente_id = c.id
    LEFT JOIN vendedores ven ON v.vendedor_id = ven.id
    WHERE v.loja_id = ?`;
    const params = [lojaId];
    query += ' AND v.usuario_id = ?'; params.push(userId);
    if (data_inicio) { query += ' AND date(v.data) >= ?'; params.push(data_inicio); }
    if (data_fim) { query += ' AND date(v.data) <= ?'; params.push(data_fim); }
    if (cliente_id) { query += ' AND v.cliente_id = ?'; params.push(cliente_id); }
    query += ' ORDER BY v.data DESC';
    res.json(db.prepare(query).all(...params));
});

// GET /api/vendas/:id
router.get('/:id', (req, res) => {
    const venda = db.prepare(`SELECT v.*,
        c.nome as cliente_nome, c.telefone as cliente_telefone, c.email as cliente_email,
        c.endereco as cliente_endereco, c.numero as cliente_numero, c.bairro as cliente_bairro,
        c.cidade as cliente_cidade, c.cep as cliente_cep, c.complemento as cliente_complemento,
        c.cpf as cliente_cpf, c.cnpj as cliente_cnpj,
        ven.nome as vendedor_nome
    FROM vendas v
    LEFT JOIN clientes c ON v.cliente_id = c.id
    LEFT JOIN vendedores ven ON v.vendedor_id = ven.id
    WHERE v.id = ? AND v.loja_id = ?`).get(req.params.id, req.user.loja_id);
    if (!venda) return res.status(404).json({ error: 'Venda não encontrada' });
    // itens/pagamentos seguem FK de venda_id, que já está filtrada por loja_id acima
    const itens = db.prepare(`
        SELECT iv.*,
            p.nome as produto_nome,
            ts.nome as servico_nome
        FROM itens_venda iv
        LEFT JOIN produtos p ON iv.produto_id = p.id
        LEFT JOIN tipos_servico ts ON iv.servico_id = ts.id
        WHERE iv.venda_id = ?`).all(req.params.id);
    const pagamentos = db.prepare('SELECT * FROM pagamentos_venda WHERE venda_id = ?').all(req.params.id);
    res.json({ ...venda, itens, pagamentos });
});

// POST /api/vendas
router.post('/', (req, res) => {
    const { cliente_id, cliente_nome_avulso, vendedor_id, itens, desconto, pagamentos, observacoes } = req.body;
    if (!itens || itens.length === 0) return res.status(400).json({ error: 'Itens são obrigatórios' });

    const numero = gerarNumeroVenda();
    const lojaId = req.user.loja_id;
    let total = 0;

    // Calculate total
    itens.forEach(item => {
        total += item.quantidade * item.preco_unitario;
    });
    const totalFinal = total - (desconto || 0);

    const insertVenda = db.transaction(() => {
        // Use primary payment method as principal if provided, otherwise 'dinheiro'
        const formaPagamentoPrincipal = pagamentos && pagamentos.length > 0 ? pagamentos[0].metodo : 'dinheiro';

        const result = db.prepare(`
            INSERT INTO vendas (numero, cliente_id, cliente_nome_avulso, vendedor_id, total, desconto, total_final, forma_pagamento, observacoes, usuario_id, loja_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(numero, cliente_id || null, cliente_nome_avulso || null, vendedor_id || null, total, desconto || 0, totalFinal, formaPagamentoPrincipal, observacoes || null, req.user?.id || null, lojaId);

        const vendaId = result.lastInsertRowid;

        // Save items
        itens.forEach(item => {
            const subtotal = item.quantidade * item.preco_unitario;
            db.prepare(`INSERT INTO itens_venda (venda_id, produto_id, servico_id, descricao, quantidade, preco_unitario, subtotal)
                VALUES (?, ?, ?, ?, ?, ?, ?)`).run(vendaId, item.produto_id || null, item.servico_id || null, item.descricao, item.quantidade, item.preco_unitario, subtotal);

            if (item.produto_id) {
                if (req.user.principal) {
                    const p = db.prepare('SELECT estoque FROM produtos WHERE id = ?').get(item.produto_id);
                    if (p) {
                        const novoEstoque = p.estoque - item.quantidade;
                        db.prepare('UPDATE produtos SET estoque = ? WHERE id = ?').run(novoEstoque, item.produto_id);
                        db.prepare(`INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, estoque_anterior, estoque_posterior, referencia, observacao, usuario_id, loja_id)
                            VALUES (?, 'saida', ?, ?, ?, ?, 'Venda', ?, ?)`).run(item.produto_id, item.quantidade, p.estoque, novoEstoque, `Venda ${numero}`, req.user?.id||null, req.user.loja_id);
                        verificarEstoqueBaixo(item.produto_id);
                    }
                } else {
                    const anterior = getQtdUsuario(req.user.id, item.produto_id);
                    ajustarEstoqueUsuario(req.user.id, item.produto_id, req.user.loja_id, -item.quantidade);
                    const posterior = getQtdUsuario(req.user.id, item.produto_id);
                    db.prepare(`INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, estoque_anterior, estoque_posterior, referencia, observacao, usuario_id, loja_id)
                        VALUES (?, 'saida', ?, ?, ?, ?, 'Venda sub-usuário', ?, ?)`)
                        .run(item.produto_id, item.quantidade, anterior, posterior, `Venda ${numero}`, req.user?.id||null, req.user.loja_id);
                }
            }
        });

        // Save payments
        if (pagamentos && pagamentos.length > 0) {
            const stmtPay = db.prepare(`INSERT INTO pagamentos_venda (venda_id, metodo, valor) VALUES (?, ?, ?)`);
            pagamentos.forEach(p => {
                stmtPay.run(vendaId, p.metodo, p.valor);
            });
        }

        return vendaId;
    });

    try {
        const vendaId = insertVenda();
        res.status(201).json({ id: vendaId, numero, total: totalFinal });
    } catch (e) {
        res.status(500).json({ error: e.message || 'Erro ao salvar venda' });
    }
});

// DELETE /api/vendas/:id/excluir (exclusão física com senha)
router.delete('/:id/excluir', (req, res) => {
    const { senha } = req.body;
    if (!senha) return res.status(400).json({ error: 'Senha é obrigatória' });

    const cfg = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'senha_gerente'").get();
    if (!cfg || !cfg.valor) return res.status(400).json({ error: 'Senha do gerente não configurada. Acesse Configurações para definir.' });
    if (senha !== cfg.valor) return res.status(422).json({ error: 'Senha incorreta' });

    const excluirVenda = db.transaction(() => {
        const venda = db.prepare('SELECT * FROM vendas WHERE id = ? AND loja_id = ?').get(req.params.id, req.user.loja_id);
        if (!venda) throw new Error('Venda não encontrada');

        if (venda.status !== 'cancelada') {
            const vendedor = venda.usuario_id ? db.prepare('SELECT principal FROM usuarios WHERE id = ?').get(venda.usuario_id) : null;
            const vendedorPrincipal = vendedor ? vendedor.principal : true;
            const itens = db.prepare('SELECT * FROM itens_venda WHERE venda_id = ?').all(req.params.id);
            itens.forEach(item => {
                if (item.produto_id) {
                    if (vendedorPrincipal) {
                        const p = db.prepare('SELECT estoque FROM produtos WHERE id = ?').get(item.produto_id);
                        if (p) {
                            const novoEstoque = p.estoque + item.quantidade;
                            db.prepare('UPDATE produtos SET estoque = ? WHERE id = ?').run(novoEstoque, item.produto_id);
                            db.prepare(`INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, estoque_anterior, estoque_posterior, referencia, observacao, usuario_id, loja_id)
                                VALUES (?, 'entrada', ?, ?, ?, ?, 'Exclusão Venda', ?, ?)`).run(item.produto_id, item.quantidade, p.estoque, novoEstoque, `Venda ${venda.numero}`, req.user?.id||null, req.user.loja_id);
                        }
                    } else {
                        const anterior = getQtdUsuario(venda.usuario_id, item.produto_id);
                        ajustarEstoqueUsuario(venda.usuario_id, item.produto_id, req.user.loja_id, item.quantidade);
                        const posterior = getQtdUsuario(venda.usuario_id, item.produto_id);
                        db.prepare(`INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, estoque_anterior, estoque_posterior, referencia, observacao, usuario_id, loja_id)
                            VALUES (?, 'entrada', ?, ?, ?, ?, 'Exclusão Venda sub-usuário', ?, ?)`)
                            .run(item.produto_id, item.quantidade, anterior, posterior, `Venda ${venda.numero}`, req.user?.id||null, req.user.loja_id);
                    }
                }
            });
        }

        db.prepare('DELETE FROM pagamentos_venda WHERE venda_id = ?').run(req.params.id);
        db.prepare('DELETE FROM itens_venda WHERE venda_id = ?').run(req.params.id);
        db.prepare('DELETE FROM vendas WHERE id = ? AND loja_id = ?').run(req.params.id, req.user.loja_id);

        return venda.numero;
    });

    try {
        const numero = excluirVenda();
        res.json({ ok: true, numero });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// DELETE /api/vendas/:id (cancel)
router.delete('/:id', (req, res) => {
    const { motivo } = req.body;
    if (!motivo) return res.status(400).json({ error: 'Motivo é obrigatório para cancelamento' });

    const cancelVenda = db.transaction(() => {
        const venda = db.prepare('SELECT * FROM vendas WHERE id = ? AND loja_id = ?').get(req.params.id, req.user.loja_id);
        if (!venda) throw new Error('Venda não encontrada');
        if (venda.status === 'cancelada') throw new Error('Venda já está cancelada');

        const itens = db.prepare('SELECT * FROM itens_venda WHERE venda_id = ?').all(req.params.id);

        // Update status and reason
        db.prepare("UPDATE vendas SET status = 'cancelada', motivo_cancelamento = ? WHERE id = ? AND loja_id = ?").run(motivo, req.params.id, req.user.loja_id);

        // Return stock to correct location based on who made the sale
        const vendedor = venda.usuario_id ? db.prepare('SELECT principal FROM usuarios WHERE id = ?').get(venda.usuario_id) : null;
        const vendedorPrincipal = vendedor ? vendedor.principal : true;
        itens.forEach(item => {
            if (item.produto_id) {
                if (vendedorPrincipal) {
                    const p = db.prepare('SELECT estoque FROM produtos WHERE id = ?').get(item.produto_id);
                    if (p) {
                        const novoEstoque = p.estoque + item.quantidade;
                        db.prepare('UPDATE produtos SET estoque = ? WHERE id = ?').run(novoEstoque, item.produto_id);
                        db.prepare(`INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, estoque_anterior, estoque_posterior, referencia, observacao, usuario_id, loja_id)
                            VALUES (?, 'entrada', ?, ?, ?, ?, 'Cancelamento Venda', ?, ?)`).run(item.produto_id, item.quantidade, p.estoque, novoEstoque, `Venda ${venda.numero}`, req.user?.id||null, req.user.loja_id);
                    }
                } else {
                    const anterior = getQtdUsuario(venda.usuario_id, item.produto_id);
                    ajustarEstoqueUsuario(venda.usuario_id, item.produto_id, req.user.loja_id, item.quantidade);
                    const posterior = getQtdUsuario(venda.usuario_id, item.produto_id);
                    db.prepare(`INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, estoque_anterior, estoque_posterior, referencia, observacao, usuario_id, loja_id)
                        VALUES (?, 'entrada', ?, ?, ?, ?, 'Cancelamento Venda sub-usuário', ?, ?)`)
                        .run(item.produto_id, item.quantidade, anterior, posterior, `Venda ${venda.numero}`, req.user?.id||null, req.user.loja_id);
                }
            }
        });
    });

    try {
        cancelVenda();
        res.json({ ok: true });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

module.exports = router;
