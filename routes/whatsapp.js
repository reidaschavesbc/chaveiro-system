const express = require('express');
const router = express.Router();
const wa = require('../services/whatsapp');

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

module.exports = router;
