const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const wa = require('../services/whatsapp');
const { consultarDanfse } = require('../services/nfse');

const nfsePdfsDir = path.join(__dirname, '..', 'database', 'nfse-pdfs');

// GET /api/whatsapp/status
router.get('/status', (req, res) => {
    res.json(wa.getStatus());
});

// POST /api/whatsapp/conectar
router.post('/conectar', async (req, res) => {
    try {
        await wa.iniciar();
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/whatsapp/desconectar
router.post('/desconectar', async (req, res) => {
    try {
        await wa.desconectar();
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/whatsapp/trocar-conta — logout, apaga sessão e gera novo QR
router.post('/trocar-conta', async (req, res) => {
    try {
        await wa.trocarConta();
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/whatsapp/enviar-nfse — envia NF via WhatsApp (PDF local ou busca do governo)
router.post('/enviar-nfse', async (req, res) => {
    try {
        const { telefone, chave_acesso, numero_nf, valor, descricao, data_emissao } = req.body;
        if (!telefone || !chave_acesso) return res.status(400).json({ error: 'Telefone e chave de acesso são obrigatórios' });

        const localPath = path.join(nfsePdfsDir, `${chave_acesso}.pdf`);
        let pdfBase64 = null;

        // 1. Tenta PDF local
        if (fs.existsSync(localPath)) {
            pdfBase64 = fs.readFileSync(localPath).toString('base64');
        } else {
            // 2. Busca do servidor do governo
            const pdfBuffer = await consultarDanfse(chave_acesso, req.user.loja_id);
            fs.writeFileSync(localPath, Buffer.from(pdfBuffer));
            pdfBase64 = Buffer.from(pdfBuffer).toString('base64');
        }

        if (!pdfBase64) {
            return res.status(422).json({ error: 'Não foi possível obter o PDF da NFS-e.' });
        }
        console.log(`[WA] Enviando NFS-e ${numero_nf} para ${telefone}, PDF size: ${pdfBase64.length}`);
        await wa.enviarArquivo(telefone, 'application/pdf', pdfBase64, `NFS-e-${numero_nf}.pdf`, `📄 NFS-e Nº ${numero_nf}`);
        console.log(`[WA] Envio concluído para ${telefone}`);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
