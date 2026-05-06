const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');

const SESSION_PATH = path.join(__dirname, '..', 'whatsapp-session');

let client = null;
let _status = 'desconectado'; // desconectado | conectando | qr_pendente | conectado
let _qrDataUrl = null;
let _desconectandoManualmente = false; // true quando desconectar()/trocarConta() foi chamado

function normalizePhone(phone) {
    const digits = phone.replace(/\D/g, '');
    return (digits.startsWith('55') && digits.length >= 12) ? digits : '55' + digits;
}

function criarCliente() {
    const c = new Client({
        authStrategy: new LocalAuth({ dataPath: path.join(__dirname, '..', 'whatsapp-session') }),
        puppeteer: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
        }
    });

    c.on('qr', async (qr) => {
        _status = 'qr_pendente';
        _qrDataUrl = await qrcode.toDataURL(qr, { width: 280 });
    });

    c.on('loading_screen', () => { _status = 'conectando'; });
    c.on('authenticated', () => { _status = 'conectando'; _qrDataUrl = null; });

    c.on('ready', () => {
        _status = 'conectado';
        _qrDataUrl = null;
        console.log('✅ WhatsApp Bot conectado!');
    });

    c.on('disconnected', async (reason) => {
        console.log('⚠️  WhatsApp desconectado:', reason);
        const instancia = client;
        client = null;
        _status = 'desconectado';
        _qrDataUrl = null;
        // Mata o Chrome antes de qualquer outra coisa
        try { await instancia.destroy(); } catch (_) {}
        if (!_desconectandoManualmente) {
            console.log('🔄 Tentando reconectar em 15s...');
            setTimeout(() => iniciar().catch(e => console.error('WhatsApp reconexão:', e.message)), 15000);
        }
        _desconectandoManualmente = false;
    });

    c.on('auth_failure', () => {
        _status = 'desconectado';
        _qrDataUrl = null;
        client = null;
        console.error('❌ WhatsApp: falha de autenticação');
        // Não tenta reconectar em falha de auth — precisa de novo QR
    });

    return c;
}

async function iniciar() {
    if (client) return;
    _status = 'conectando';
    _qrDataUrl = null;
    client = criarCliente();
    try {
        await client.initialize();
    } catch (e) {
        _status = 'desconectado';
        client = null;
        throw e;
    }
}

async function desconectar() {
    if (!client) return;
    _desconectandoManualmente = true;
    try { await client.destroy(); } catch (_) {}
    client = null;
    _status = 'desconectado';
    _qrDataUrl = null;
}

async function trocarConta() {
    if (client) {
        _desconectandoManualmente = true;
        // logout() apaga a sessão local via whatsapp-web.js antes de fechar o browser
        try { await client.logout(); } catch (_) {}
        try { await client.destroy(); } catch (_) {}
        client = null;
    }
    _status = 'desconectado';
    _qrDataUrl = null;
    // Apaga a pasta como garantia extra (logout já deveria limpar)
    await new Promise(r => setTimeout(r, 800));
    try { fs.rmSync(SESSION_PATH, { recursive: true, force: true }); } catch (_) {}
    // Reinicia sem sessão — vai gerar novo QR
    await iniciar();
}

async function enviarMensagem(telefone, texto) {
    if (_status !== 'conectado' || !client) throw new Error('WhatsApp não está conectado');
    const num = normalizePhone(telefone);
    const numId = await client.getNumberId(num);
    if (!numId) throw new Error(`Número ${telefone} não encontrado no WhatsApp`);
    await client.sendMessage(numId._serialized, texto);
}

async function enviarArquivo(telefone, mimeType, base64Data, filename, caption) {
    if (_status !== 'conectado' || !client) throw new Error('WhatsApp não está conectado');
    const num = normalizePhone(telefone);
    const numId = await client.getNumberId(num);
    if (!numId) throw new Error(`Número ${telefone} não encontrado no WhatsApp`);
    const media = new MessageMedia(mimeType, base64Data, filename);
    await client.sendMessage(numId._serialized, media, caption ? { caption } : {});
}

function getStatus() {
    return { status: _status, qr: _qrDataUrl };
}

// Aguarda 8s após o servidor subir antes de iniciar o Puppeteer/WhatsApp
// Evita que a inicialização pesada do Puppeteer deixe o servidor lento no arranque
setTimeout(() => {
    iniciar().catch(e => console.error('WhatsApp init:', e.message));
}, 8000);

module.exports = { iniciar, desconectar, trocarConta, enviarMensagem, enviarArquivo, getStatus };
