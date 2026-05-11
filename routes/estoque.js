const express = require('express');
const router = express.Router();
const db = require('../database/db');

// Retorna quantidade do usuário para um produto
function getQtdUsuario(usuario_id, produto_id) {
    const r = db.prepare('SELECT quantidade FROM estoque_usuario WHERE usuario_id = ? AND produto_id = ?').get(usuario_id, produto_id);
    return r ? r.quantidade : 0;
}

// Ajusta estoque de um usuário (cria ou atualiza)
function ajustarEstoqueUsuario(usuario_id, produto_id, loja_id, delta) {
    const atual = getQtdUsuario(usuario_id, produto_id);
    const novo = Math.max(0, atual + delta);
    db.prepare(`
        INSERT INTO estoque_usuario (usuario_id, produto_id, loja_id, quantidade)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(usuario_id, produto_id) DO UPDATE SET quantidade = ?
    `).run(usuario_id, produto_id, loja_id, novo, novo);
    return novo;
}

module.exports.ajustarEstoqueUsuario = ajustarEstoqueUsuario;
module.exports.getQtdUsuario = getQtdUsuario;

// GET /api/estoque — produtos com estoque do usuário atual
router.get('/', (req, res) => {
    const { id: usuario_id, loja_id, principal } = req.user;

    if (principal) {
        // Principal vê produtos.estoque normalmente
        const produtos = db.prepare('SELECT * FROM produtos WHERE ativo = 1 AND loja_id = ? ORDER BY nome').all(loja_id);
        return res.json(produtos);
    }

    // Sub-usuário vê seu saldo em estoque_usuario
    const produtos = db.prepare(`
        SELECT p.id, p.nome, p.descricao, p.codigo, p.preco_custo, p.preco_venda,
               p.estoque_minimo, p.unidade, p.ativo, p.criado_em, p.imagem, p.loja_id,
               COALESCE(eu.quantidade, 0) as estoque
        FROM produtos p
        LEFT JOIN estoque_usuario eu ON eu.produto_id = p.id AND eu.usuario_id = ?
        WHERE p.ativo = 1 AND p.loja_id = ?
        ORDER BY p.nome
    `).all(usuario_id, loja_id);
    res.json(produtos);
});

// GET /api/estoque/pedidos — lista pedidos
// Principal: vê todos pendentes da loja
// Sub-usuário: vê os seus próprios
router.get('/pedidos', (req, res) => {
    const { id: usuario_id, loja_id, principal } = req.user;

    let rows;
    if (principal) {
        rows = db.prepare(`
            SELECT pe.*, p.nome as produto_nome, p.unidade, u.nome as solicitante_nome
            FROM pedidos_estoque pe
            JOIN produtos p ON p.id = pe.produto_id
            JOIN usuarios u ON u.id = pe.solicitante_id
            WHERE pe.loja_id = ?
            ORDER BY CASE pe.status WHEN 'pendente' THEN 0 ELSE 1 END, pe.criado_em DESC
        `).all(loja_id);
    } else {
        rows = db.prepare(`
            SELECT pe.*, p.nome as produto_nome, p.unidade
            FROM pedidos_estoque pe
            JOIN produtos p ON p.id = pe.produto_id
            WHERE pe.solicitante_id = ? AND pe.loja_id = ?
            ORDER BY pe.criado_em DESC
        `).all(usuario_id, loja_id);
    }

    // Conta pendentes para badge
    const pendentes = principal
        ? db.prepare("SELECT COUNT(*) as n FROM pedidos_estoque WHERE loja_id = ? AND status = 'pendente'").get(loja_id).n
        : rows.filter(r => r.status === 'pendente').length;

    res.json({ pedidos: rows, pendentes });
});

// POST /api/estoque/pedido — sub-usuário solicita estoque
router.post('/pedido', (req, res) => {
    const { id: usuario_id, loja_id, principal } = req.user;
    if (principal) return res.status(400).json({ error: 'Usuário principal não precisa solicitar estoque' });

    const { produto_id, quantidade, observacao } = req.body;
    if (!produto_id || !quantidade || quantidade <= 0) return res.status(400).json({ error: 'Produto e quantidade são obrigatórios' });

    const produto = db.prepare('SELECT id FROM produtos WHERE id = ? AND loja_id = ? AND ativo = 1').get(produto_id, loja_id);
    if (!produto) return res.status(404).json({ error: 'Produto não encontrado' });

    const result = db.prepare(`
        INSERT INTO pedidos_estoque (loja_id, solicitante_id, produto_id, quantidade, observacao)
        VALUES (?, ?, ?, ?, ?)
    `).run(loja_id, usuario_id, produto_id, quantidade, observacao || null);

    res.status(201).json({ id: result.lastInsertRowid, ok: true });
});

// PUT /api/estoque/pedidos/:id/aprovar — principal aprova e transfere estoque
router.put('/pedidos/:id/aprovar', (req, res) => {
    const { id: usuario_id, loja_id, principal } = req.user;
    if (!principal) return res.status(403).json({ error: 'Apenas o usuário principal pode aprovar pedidos' });

    const pedido = db.prepare('SELECT * FROM pedidos_estoque WHERE id = ? AND loja_id = ?').get(req.params.id, loja_id);
    if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' });
    if (pedido.status !== 'pendente') return res.status(400).json({ error: 'Pedido já foi respondido' });

    const produto = db.prepare('SELECT * FROM produtos WHERE id = ? AND loja_id = ?').get(pedido.produto_id, loja_id);
    if (!produto) return res.status(404).json({ error: 'Produto não encontrado' });
    if (produto.estoque < pedido.quantidade) return res.status(400).json({ error: `Estoque insuficiente (disponível: ${produto.estoque} ${produto.unidade})` });

    db.transaction(() => {
        // Deduz do estoque principal
        const novoEstoque = produto.estoque - pedido.quantidade;
        db.prepare('UPDATE produtos SET estoque = ? WHERE id = ?').run(novoEstoque, produto.id);
        db.prepare(`INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, estoque_anterior, estoque_posterior, referencia, observacao, usuario_id, loja_id)
            VALUES (?, 'transferencia', ?, ?, ?, ?, 'Transferência para sub-usuário', ?, ?)`)
            .run(produto.id, pedido.quantidade, produto.estoque, novoEstoque, `Pedido #${pedido.id}`, usuario_id, loja_id);

        // Adiciona ao estoque do sub-usuário
        ajustarEstoqueUsuario(pedido.solicitante_id, produto.id, loja_id, pedido.quantidade);

        // Atualiza pedido
        db.prepare(`UPDATE pedidos_estoque SET status = 'aprovado', respondido_por = ?, respondido_em = datetime('now','localtime') WHERE id = ?`)
            .run(usuario_id, pedido.id);
    })();

    res.json({ ok: true });
});

// PUT /api/estoque/pedidos/:id/rejeitar — principal rejeita
router.put('/pedidos/:id/rejeitar', (req, res) => {
    const { id: usuario_id, loja_id, principal } = req.user;
    if (!principal) return res.status(403).json({ error: 'Apenas o usuário principal pode rejeitar pedidos' });

    const pedido = db.prepare('SELECT * FROM pedidos_estoque WHERE id = ? AND loja_id = ?').get(req.params.id, loja_id);
    if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' });
    if (pedido.status !== 'pendente') return res.status(400).json({ error: 'Pedido já foi respondido' });

    const { resposta } = req.body;
    db.prepare(`UPDATE pedidos_estoque SET status = 'rejeitado', respondido_por = ?, resposta = ?, respondido_em = datetime('now','localtime') WHERE id = ?`)
        .run(usuario_id, resposta || null, pedido.id);

    res.json({ ok: true });
});

// POST /api/estoque/enviar — principal envia diretamente para sub-usuário
router.post('/enviar', (req, res) => {
    const { id: usuario_id, loja_id, principal } = req.user;
    if (!principal) return res.status(403).json({ error: 'Apenas o usuário principal pode enviar estoque' });

    const { sub_usuario_id, produto_id, quantidade } = req.body;
    if (!sub_usuario_id || !produto_id || !quantidade || quantidade <= 0)
        return res.status(400).json({ error: 'Sub-usuário, produto e quantidade são obrigatórios' });

    const sub = db.prepare('SELECT id FROM usuarios WHERE id = ? AND loja_id = ? AND principal = 0 AND ativo = 1').get(sub_usuario_id, loja_id);
    if (!sub) return res.status(404).json({ error: 'Sub-usuário não encontrado' });

    const produto = db.prepare('SELECT * FROM produtos WHERE id = ? AND loja_id = ?').get(produto_id, loja_id);
    if (!produto) return res.status(404).json({ error: 'Produto não encontrado' });
    if (produto.estoque < quantidade) return res.status(400).json({ error: `Estoque insuficiente (disponível: ${produto.estoque} ${produto.unidade})` });

    db.transaction(() => {
        const novoEstoque = produto.estoque - quantidade;
        db.prepare('UPDATE produtos SET estoque = ? WHERE id = ?').run(novoEstoque, produto.id);
        db.prepare(`INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, estoque_anterior, estoque_posterior, referencia, observacao, usuario_id, loja_id)
            VALUES (?, 'transferencia', ?, ?, ?, 'Envio direto', 'Envio para sub-usuário', ?, ?)`)
            .run(produto.id, quantidade, produto.estoque, novoEstoque, usuario_id, loja_id);
        ajustarEstoqueUsuario(sub_usuario_id, produto.id, loja_id, quantidade);
    })();

    res.json({ ok: true });
});

// GET /api/estoque/sub-usuarios — principal lista sub-usuários da loja (para envio direto)
router.get('/sub-usuarios', (req, res) => {
    const { loja_id, principal } = req.user;
    if (!principal) return res.status(403).json({ error: 'Acesso negado' });
    const subs = db.prepare('SELECT id, nome, email FROM usuarios WHERE loja_id = ? AND principal = 0 AND ativo = 1 ORDER BY nome').all(loja_id);
    res.json(subs);
});

module.exports.router = router;
