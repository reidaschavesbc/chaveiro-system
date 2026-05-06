const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const db = require('../database/db');

function getConfig() {
    const rows = db.prepare('SELECT chave, valor FROM configuracoes').all();
    const cfg = {};
    rows.forEach(r => cfg[r.chave] = r.valor);
    return cfg;
}

function formatCurrency(val) {
    return 'R$ ' + parseFloat(val || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function formatDate(str) {
    if (!str) return '-';
    return str.slice(0, 10).split('-').reverse().join('/');
}

function drawHeader(doc, cfg, title) {
    doc.rect(0, 0, doc.page.width, 80).fill('#1a56db');
    doc.fillColor('white').fontSize(20).font('Helvetica-Bold').text(cfg.empresa_nome || 'Chaveiro', 40, 20);

    // Format full address
    let address = '';
    if (cfg.empresa_rua) {
        address = `${cfg.empresa_rua}${cfg.empresa_numero ? ', ' + cfg.empresa_numero : ''}`;
        if (cfg.empresa_bairro) address += ` - ${cfg.empresa_bairro}`;
        if (cfg.empresa_cidade) address += ` | ${cfg.empresa_cidade}-${cfg.empresa_estado || ''}`;
        if (cfg.empresa_cep) address += ` | CEP: ${cfg.empresa_cep}`;
    } else {
        address = cfg.empresa_endereco || '';
    }

    if (cfg.empresa_telefone) doc.fontSize(9).font('Helvetica').text(`Tel: ${cfg.empresa_telefone}`, 40, 44);
    if (address) doc.fontSize(9).text(address, 40, 56);
    doc.fontSize(14).font('Helvetica-Bold').text(title, 0, 25, { align: 'right', width: doc.page.width - 40 });
    doc.fillColor('#333').moveDown();
}

function drawLine(doc) {
    doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).stroke('#dee2e6').moveDown(0.5);
}

function labelValue(doc, label, value, x, y, w) {
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#555').text(label, x, y, { width: w });
    doc.fontSize(10).font('Helvetica').fillColor('#222').text(value || '-', x, doc.y, { width: w });
}

// GET /api/pdf/os/:id
router.get('/os/:id', (req, res) => {
    const os = db.prepare(`SELECT os.*, c.nome as cliente_nome, c.telefone as cliente_telefone,
    c.cpf as cliente_cpf, c.endereco as cliente_endereco, c.cidade as cliente_cidade,
    ts.nome as servico_nome FROM ordens_servico os
    LEFT JOIN clientes c ON os.cliente_id = c.id
    LEFT JOIN tipos_servico ts ON os.tipo_servico_id = ts.id
    WHERE os.id = ?`).get(req.params.id);

    if (!os) return res.status(404).json({ error: 'OS não encontrada' });
    const cfg = getConfig();

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="OS-${os.numero}.pdf"`);
    doc.pipe(res);

    drawHeader(doc, cfg, 'ORDEM DE SERVIÇO');
    doc.moveDown(3);

    // OS Info box
    doc.rect(40, doc.y, doc.page.width - 80, 40).fill('#f0f4ff').stroke('#1a56db');
    const boxY = doc.y + 10;
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1a56db').text(`Nº ${os.numero}`, 50, boxY);
    const statusMap = { aberta: 'ABERTA', em_andamento: 'EM ANDAMENTO', concluida: 'CONCLUÍDA', cancelada: 'CANCELADA' };
    const statusColors = { aberta: '#f59e0b', em_andamento: '#3b82f6', concluida: '#10b981', cancelada: '#ef4444' };
    doc.fillColor(statusColors[os.status] || '#888').text(statusMap[os.status] || os.status, 0, boxY, { align: 'right', width: doc.page.width - 50 });
    doc.moveDown(3);

    // Client data
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a56db').text('DADOS DO CLIENTE', 40);
    drawLine(doc);
    const col1 = 40, col2 = 300;
    const row1Y = doc.y;
    labelValue(doc, 'NOME', os.cliente_nome || os.cliente_nome_avulso || '????', col1, row1Y, 220);
    labelValue(doc, 'TELEFONE', os.cliente_telefone, col2, row1Y, 200);
    doc.moveDown();
    labelValue(doc, 'CPF', os.cliente_cpf, col1, doc.y, 220);
    labelValue(doc, 'CIDADE', os.cliente_cidade, col2, doc.y, 200);
    doc.moveDown(1.5);

    // Service data
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a56db').text('DADOS DO SERVIÇO', 40);
    drawLine(doc);
    const row2Y = doc.y;
    labelValue(doc, 'TIPO DE SERVIÇO', os.servico_nome, col1, row2Y, 220);
    labelValue(doc, 'VALOR', formatCurrency(os.valor), col2, row2Y, 200);
    doc.moveDown();
    labelValue(doc, 'DATA DE ENTRADA', formatDate(os.data_entrada), col1, doc.y, 220);
    labelValue(doc, 'DATA PREVISTA', formatDate(os.data_prevista), col2, doc.y, 200);
    doc.moveDown();
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#555').text('DESCRIÇÃO', col1, doc.y, { width: doc.page.width - 80 });
    doc.fontSize(10).font('Helvetica').fillColor('#222').text(os.descricao, col1, doc.y, { width: doc.page.width - 80 });
    if (os.observacoes) {
        doc.moveDown(0.5);
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#555').text('OBSERVAÇÕES', col1, doc.y, { width: doc.page.width - 80 });
        doc.fontSize(10).font('Helvetica').fillColor('#666').text(os.observacoes, col1, doc.y, { width: doc.page.width - 80 });
    }
    doc.moveDown(1.5);

    // Signature area
    if (os.status === 'concluida') {
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a56db').text('CONCLUSÃO', 40);
        drawLine(doc);
        labelValue(doc, 'DATA DE CONCLUSÃO', formatDate(os.data_conclusao), col1, doc.y, 220);
        if (os.forma_pagamento) labelValue(doc, 'FORMA DE PAGAMENTO', os.forma_pagamento.toUpperCase(), col2, doc.y - doc.currentLineHeight(), 200);
        doc.moveDown(2);
    }

    // Footer signature lines
    const sigY = doc.page.height - 120;
    doc.moveTo(80, sigY).lineTo(240, sigY).stroke('#333');
    doc.moveTo(350, sigY).lineTo(510, sigY).stroke('#333');
    doc.fontSize(9).fillColor('#555')
        .text('Assinatura do Cliente', 80, sigY + 5, { width: 160, align: 'center' })
        .text('Responsável', 350, sigY + 5, { width: 160, align: 'center' });

    // Footer date
    doc.fontSize(8).fillColor('#999').text(`Emitido em ${new Date().toLocaleString('pt-BR')}`, 40, doc.page.height - 40, { align: 'center', width: doc.page.width - 80 });

    doc.end();
});

// GET /api/pdf/venda/:id
router.get('/venda/:id', (req, res) => {
    const venda = db.prepare(`SELECT v.*, c.nome as cliente_nome, c.telefone as cliente_telefone
    FROM vendas v LEFT JOIN clientes c ON v.cliente_id = c.id WHERE v.id = ?`).get(req.params.id);
    const nomeVenda = venda && (venda.cliente_nome || venda.cliente_nome_avulso);
    if (!venda) return res.status(404).json({ error: 'Venda não encontrada' });
    const itens = db.prepare('SELECT * FROM itens_venda WHERE venda_id = ?').all(req.params.id);
    const cfg = getConfig();

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Recibo-${venda.numero}.pdf"`);
    doc.pipe(res);

    drawHeader(doc, cfg, 'RECIBO DE VENDA');
    doc.moveDown(3);

    // Venda info
    doc.rect(40, doc.y, doc.page.width - 80, 40).fill('#f0f4ff').stroke('#1a56db');
    const bY = doc.y + 10;
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1a56db').text(`Nº ${venda.numero}`, 50, bY);
    doc.fillColor('#555').fontSize(10).text(`Data: ${formatDate(venda.data)}`, 0, bY + 4, { align: 'right', width: doc.page.width - 50 });
    doc.moveDown(3);

    if (nomeVenda) {
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a56db').text('CLIENTE', 40);
        drawLine(doc);
        doc.fontSize(10).font('Helvetica').fillColor('#222').text(`${nomeVenda}${venda.cliente_telefone ? '  |  Tel: ' + venda.cliente_telefone : ''}`, 40);
        doc.moveDown(1);
    }

    // Items table
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a56db').text('ITENS', 40);
    drawLine(doc);
    const th = doc.y;
    doc.rect(40, th, doc.page.width - 80, 22).fill('#1a56db');
    doc.fillColor('white').fontSize(9).font('Helvetica-Bold')
        .text('DESCRIÇÃO', 50, th + 6, { width: 250 })
        .text('QTD', 300, th + 6, { width: 60, align: 'right' })
        .text('UNIT.', 360, th + 6, { width: 80, align: 'right' })
        .text('SUBTOTAL', 440, th + 6, { width: 80, align: 'right' });
    doc.moveDown(1.5);

    itens.forEach((item, i) => {
        const rowY = doc.y;
        if (i % 2 === 0) doc.rect(40, rowY - 3, doc.page.width - 80, 18).fill('#f8f9ff');
        doc.fillColor('#222').fontSize(9).font('Helvetica')
            .text(item.descricao, 50, rowY, { width: 250 })
            .text(item.quantidade.toString(), 300, rowY, { width: 60, align: 'right' })
            .text(formatCurrency(item.preco_unitario), 360, rowY, { width: 80, align: 'right' })
            .text(formatCurrency(item.subtotal), 440, rowY, { width: 80, align: 'right' });
        doc.moveDown(0.8);
    });

    doc.moveDown(0.5);
    drawLine(doc);

    // Totals
    const totX = 350;
    if (venda.desconto > 0) {
        doc.fontSize(10).fillColor('#555').text('Subtotal:', totX, doc.y, { width: 90, align: 'right' }).text(formatCurrency(venda.total), totX + 90, doc.y - doc.currentLineHeight(), { width: 90, align: 'right' });
        doc.fontSize(10).fillColor('#ef4444').text('Desconto:', totX, doc.y, { width: 90, align: 'right' }).text(`- ${formatCurrency(venda.desconto)}`, totX + 90, doc.y - doc.currentLineHeight(), { width: 90, align: 'right' });
        doc.moveDown(0.3);
    }
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#1a56db').text('TOTAL:', totX, doc.y, { width: 90, align: 'right' }).text(formatCurrency(venda.total_final), totX + 90, doc.y - doc.currentLineHeight(), { width: 90, align: 'right' });
    doc.moveDown(0.5);
    const fpMap = { dinheiro: 'Dinheiro', pix: 'PIX', debito: 'Cartão Débito', credito: 'Cartão Crédito' };
    doc.fontSize(10).font('Helvetica').fillColor('#555').text(`Forma de Pagamento: ${fpMap[venda.forma_pagamento] || venda.forma_pagamento}`, 40);

    doc.fontSize(8).fillColor('#999').text(`Emitido em ${new Date().toLocaleString('pt-BR')}`, 40, doc.page.height - 40, { align: 'center', width: doc.page.width - 80 });
    doc.end();
});

// GET /api/pdf/caixa
router.get('/caixa', (req, res) => {
    const { data_inicio, data_fim, tipo } = req.query;
    const di = data_inicio || new Date().toLocaleDateString('en-CA');
    const df = data_fim || di;
    const cfg = getConfig();

    let vendas = [];
    let os = [];
    let totaisVendas = [];
    let totaisOS = [];

    // 1. Get Sales (if tipo is 'venda' or 'geral')
    if (!tipo || tipo === 'geral' || tipo === 'venda') {
        vendas = db.prepare(`SELECT v.numero, v.data, v.total_final as valor, v.forma_pagamento, 'VENDA' as tipo, c.nome as cliente_nome, v.cliente_nome_avulso
            FROM vendas v LEFT JOIN clientes c ON v.cliente_id = c.id
            WHERE date(v.data) BETWEEN ? AND ? AND v.status != 'cancelada'`).all(di, df);

        totaisVendas = db.prepare(`SELECT metodo as forma_pagamento, SUM(valor) as total 
            FROM pagamentos_venda pv JOIN vendas v ON pv.venda_id = v.id
            WHERE date(v.data) BETWEEN ? AND ? AND v.status != 'cancelada' GROUP BY metodo`).all(di, df);
    }

    // 2. Get OS (if tipo is 'os' or 'geral')
    if (!tipo || tipo === 'geral' || tipo === 'os') {
        os = db.prepare(`SELECT os.numero, COALESCE(os.data_conclusao, os.data_entrada) as data, os.valor, os.forma_pagamento, 'OS' as tipo, c.nome as cliente_nome, os.cliente_nome_avulso
            FROM ordens_servico os LEFT JOIN clientes c ON os.cliente_id = c.id
            WHERE date(COALESCE(os.data_conclusao, os.data_entrada)) BETWEEN ? AND ? AND os.status = 'concluida'`).all(di, df);

        totaisOS = db.prepare(`SELECT forma_pagamento, SUM(valor) as total 
            FROM ordens_servico WHERE date(COALESCE(data_conclusao, data_entrada)) BETWEEN ? AND ? AND status = 'concluida' GROUP BY forma_pagamento`).all(di, df);
    }

    const list = [...vendas, ...os].sort((a, b) => new Date(a.data) - new Date(b.data));

    const map = {};
    [...totaisVendas, ...totaisOS].forEach(t => {
        const met = t.forma_pagamento || 'outros';
        map[met] = (map[met] || 0) + t.total;
    });

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');

    let reportTitle = 'FECHAMENTO DE CAIXA';
    if (tipo === 'venda') reportTitle += ' - VENDAS';
    if (tipo === 'os') reportTitle += ' - ORDENS DE SERVIÇO';

    res.setHeader('Content-Disposition', `attachment; filename="Fechamento-Caixa-${tipo || 'geral'}-${di}.pdf"`);
    doc.pipe(res);

    drawHeader(doc, cfg, reportTitle);
    doc.moveDown(2);

    // Summary Header
    doc.fontSize(10).font('Helvetica-Bold').text('PERÍODO:', 40);
    doc.fontSize(10).font('Helvetica').text(`${di.split('-').reverse().join('/')} até ${df.split('-').reverse().join('/')}`, 100, doc.y - doc.currentLineHeight());
    doc.moveDown();

    // Stats Grid
    const startY = doc.y;
    const totalGeral = Object.values(map).reduce((a, b) => a + b, 0);

    doc.rect(40, startY, 515, 60).fill('#f8f9fa').stroke('#dee2e6');
    doc.fillColor('#1a56db').fontSize(14).font('Helvetica-Bold').text('TOTAL GERAL:', 55, startY + 15);
    doc.text(formatCurrency(totalGeral), 0, startY + 15, { align: 'right', width: doc.page.width - 60 });

    doc.fontSize(9).fillColor('#666').font('Helvetica').text('Soma de todas as entradas no período', 55, startY + 35);
    doc.moveDown(4);

    // Breakdown per method
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a56db').text('RESUMO POR FORMA DE PAGAMENTO', 40);
    drawLine(doc);

    const fpLabels = { dinheiro: 'Dinheiro', pix: 'PIX', debito: 'Cartão Débito', credito: 'Cartão Crédito', cartao1: 'Cartão 1', cartao2: 'Cartão 2', outros: 'Outros' };
    Object.keys(map).forEach(met => {
        const rowY = doc.y;
        doc.fontSize(10).font('Helvetica').fillColor('#333').text(fpLabels[met] || met.toUpperCase(), 50, rowY);
        doc.font('Helvetica-Bold').text(formatCurrency(map[met]), 0, rowY, { align: 'right', width: doc.page.width - 60 });
        doc.moveDown(0.5);
    });

    doc.moveDown(2);

    // Detailed Table
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a56db').text('DETALHAMENTO DE MOVIMENTAÇÕES', 40);
    drawLine(doc);

    const th = doc.y;
    doc.rect(40, th, doc.page.width - 80, 20).fill('#1a56db');
    doc.fillColor('white').fontSize(8).font('Helvetica-Bold')
        .text('HORA', 45, th + 6, { width: 40 })
        .text('TIPO', 85, th + 6, { width: 40 })
        .text('Nº', 125, th + 6, { width: 60 })
        .text('CLIENTE', 185, th + 6, { width: 180 })
        .text('METODO', 365, th + 6, { width: 80 })
        .text('VALOR', 445, th + 6, { width: 70, align: 'right' });

    doc.moveDown(1.5);

    list.forEach((it, i) => {
        const rowY = doc.y;
        if (rowY > doc.page.height - 60) doc.addPage(), drawHeader(doc, cfg, 'FECHAMENTO DE CAIXA (CONT.)'), doc.moveDown(2);

        if (i % 2 === 0) doc.rect(40, doc.y - 2, doc.page.width - 80, 15).fill('#f8f9ff');

        doc.fillColor('#333').fontSize(8).font('Helvetica')
            .text(new Date(it.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), 45, doc.y)
            .text(it.tipo, 85, rowY)
            .text(it.numero, 125, rowY)
            .text(it.cliente_nome || it.cliente_nome_avulso || '????', 185, rowY, { width: 170 })
            .text(fpLabels[it.forma_pagamento] || it.forma_pagamento, 365, rowY)
            .text(formatCurrency(it.valor), 445, rowY, { width: 70, align: 'right' });
        doc.moveDown(0.8);
    });

    doc.fontSize(8).fillColor('#999').text(`Emitido em ${new Date().toLocaleString('pt-BR')}`, 40, doc.page.height - 40, { align: 'center', width: doc.page.width - 80 });
    doc.end();
});

// ─── Gerador de PDF de Orçamento (compartilhado) ──────────────────────────────

function gerarBufferPdfOrcamento(id) {
    return new Promise((resolve, reject) => {
        const orc = db.prepare(`SELECT o.*, c.nome as cliente_nome, c.telefone as cliente_telefone
            FROM orcamentos o LEFT JOIN clientes c ON o.cliente_id = c.id WHERE o.id = ?`).get(id);
        if (!orc) return reject(new Error('Orçamento não encontrado'));
        const itens = db.prepare('SELECT * FROM itens_orcamento WHERE orcamento_id = ? ORDER BY id').all(id);
        const cfg = getConfig();

        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        const chunks = [];
        doc.on('data', c => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        drawHeader(doc, cfg, 'ORÇAMENTO');
        doc.moveDown(3);

        // Número + Status
        const statusLabels = { pendente: 'PENDENTE', aprovado: 'APROVADO', recusado: 'RECUSADO', expirado: 'EXPIRADO' };
        const statusColors = { pendente: '#f59e0b', aprovado: '#10b981', recusado: '#ef4444', expirado: '#94a3b8' };
        doc.rect(40, doc.y, doc.page.width - 80, 40).fill('#f0f4ff').stroke('#1a56db');
        const boxY = doc.y + 10;
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#1a56db').text(`Nº ${orc.numero}`, 50, boxY);
        doc.fillColor(statusColors[orc.status] || '#888').text(statusLabels[orc.status] || orc.status, 0, boxY, { align: 'right', width: doc.page.width - 50 });
        doc.moveDown(3);

        // Validade
        const dtVal = new Date(orc.criado_em);
        dtVal.setDate(dtVal.getDate() + parseInt(orc.validade_dias || 7));
        const validadeStr = dtVal.toLocaleDateString('pt-BR');
        doc.fontSize(9).font('Helvetica').fillColor('#555').text(`Emitido: ${formatDate(orc.criado_em)}    Válido até: ${validadeStr}`, 40, doc.y);
        doc.moveDown(1);

        // Cliente
        const nomeCliente = orc.cliente_nome || orc.cliente_nome_avulso || '????';
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a56db').text('CLIENTE', 40);
        drawLine(doc);
        doc.fontSize(10).font('Helvetica').fillColor('#222').text(`${nomeCliente}${orc.cliente_telefone ? '  |  Tel: ' + orc.cliente_telefone : ''}`, 40);
        doc.moveDown(1);

        // Descrição
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a56db').text('DESCRIÇÃO', 40);
        drawLine(doc);
        doc.fontSize(10).font('Helvetica').fillColor('#333').text(orc.descricao, 40, doc.y, { width: doc.page.width - 80 });
        doc.moveDown(1.5);

        // Itens
        if (itens.length) {
            doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a56db').text('ITENS', 40);
            drawLine(doc);
            const th = doc.y;
            doc.rect(40, th, doc.page.width - 80, 22).fill('#1a56db');
            doc.fillColor('white').fontSize(9).font('Helvetica-Bold')
                .text('DESCRIÇÃO', 50, th + 6, { width: 260 })
                .text('QTD', 310, th + 6, { width: 50, align: 'right' })
                .text('UNIT.', 360, th + 6, { width: 80, align: 'right' })
                .text('SUBTOTAL', 440, th + 6, { width: 75, align: 'right' });
            doc.moveDown(1.5);

            itens.forEach((it, i) => {
                const rowY = doc.y;
                if (i % 2 === 0) doc.rect(40, rowY - 2, doc.page.width - 80, 16).fill('#f8f9ff');
                doc.fillColor('#222').fontSize(9).font('Helvetica')
                    .text(it.descricao, 50, rowY, { width: 260 })
                    .text(String(it.quantidade), 310, rowY, { width: 50, align: 'right' })
                    .text(formatCurrency(it.preco_unitario), 360, rowY, { width: 80, align: 'right' })
                    .text(formatCurrency(it.subtotal), 440, rowY, { width: 75, align: 'right' });
                doc.moveDown(0.8);
            });
            doc.moveDown(0.5);
            drawLine(doc);
        }

        // Total
        doc.fontSize(13).font('Helvetica-Bold').fillColor('#1a56db')
            .text('TOTAL:', 350, doc.y, { width: 90, align: 'right' })
            .text(formatCurrency(orc.total), 440, doc.y - doc.currentLineHeight(), { width: 75, align: 'right' });
        doc.moveDown(1.5);

        // Observações
        if (orc.observacoes) {
            doc.fontSize(9).font('Helvetica-Bold').fillColor('#555').text('OBSERVAÇÕES', 40);
            doc.fontSize(9).font('Helvetica').fillColor('#666').text(orc.observacoes, 40, doc.y, { width: doc.page.width - 80 });
            doc.moveDown(1);
        }

        // Aprovação
        const sigY = doc.page.height - 110;
        doc.moveTo(80, sigY).lineTo(240, sigY).stroke('#333');
        doc.moveTo(350, sigY).lineTo(510, sigY).stroke('#333');
        doc.fontSize(9).fillColor('#555')
            .text('Assinatura do Cliente', 80, sigY + 5, { width: 160, align: 'center' })
            .text('Aprovado por', 350, sigY + 5, { width: 160, align: 'center' });

        doc.fontSize(8).fillColor('#999').text(`Emitido em ${new Date().toLocaleString('pt-BR')}`, 40, doc.page.height - 40, { align: 'center', width: doc.page.width - 80 });
        doc.end();
    });
}

// GET /api/pdf/orcamento/:id
router.get('/orcamento/:id', async (req, res) => {
    try {
        const orc = db.prepare('SELECT numero FROM orcamentos WHERE id = ?').get(req.params.id);
        const buffer = await gerarBufferPdfOrcamento(req.params.id);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Orcamento-${orc?.numero || req.params.id}.pdf"`);
        res.send(buffer);
    } catch (e) {
        res.status(404).json({ error: e.message });
    }
});

module.exports = { router, gerarBufferPdfOrcamento };
