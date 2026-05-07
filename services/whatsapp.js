const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');

const SESSION_PATH = path.join(__dirname, '..', 'whatsapp-session');

let client = null;
let _status = 'desconectado';
let _qrDataUrl = null;
let _desconectandoManualmente = false;

function normalizePhone(phone) {
    const digits = phone.replace(/\D/g, '');
    return (digits.startsWith('55') && digits.length >= 12) ? digits : '55' + digits;
}

function limparLocks() {
    ['SingletonLock', 'SingletonCookie', 'SingletonSocket'].forEach(f => {
        try { fs.unlinkSync(path.join(SESSION_PATH, 'session', f)); } catch (_) {}
    });
}

function criarCliente() {
    limparLocks();
    return new Client({
        authStrategy: new LocalAuth({ dataPath: SESSION_PATH }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-extensions',
                '--disable-background-networking',
                '--disable-default-apps',
                '--no-first-run',
                '--no-zygote',
                '--single-process'
            ]
        },
        restartOnAuthFail: false
    });
}

async function iniciar() {
    if (client) return;
    _status = 'conectando';
    _qrDataUrl = null;
    client = criarCliente();

    client.on('qr', async (qr) => {
        _status = 'qr_pendente';
        _qrDataUrl = await qrcode.toDataURL(qr, { width: 280 });
        console.log('📱 WhatsApp: QR gerado, aguardando leitura...');
    });

    client.on('loading_screen', () => { _status = 'conectando'; });
    client.on('authenticated', () => {
        _status = 'conectando';
        _qrDataUrl = null;
        console.log('🔐 WhatsApp: autenticado, carregando...');
    });

    client.on('ready', () => {
        _status = 'conectado';
        _qrDataUrl = null;
        console.log('✅ WhatsApp conectado!');
    });

    client.on('auth_failure', async () => {
        console.error('❌ WhatsApp: sessão inválida, limpando para novo QR...');
        const inst = client;
        client = null;
        _status = 'desconectado';
        _qrDataUrl = null;
        try { await inst.destroy(); } catch (_) {}
        // Limpa sessão corrompida e aguarda novo QR do usuário
        try { fs.rmSync(path.join(SESSION_PATH, 'session'), { recursive: true, force: true }); } catch (_) {}
    });

    client.on('disconnected', async (reason) => {
        console.log('⚠️  WhatsApp desconectado:', reason);
        const inst = client;
        client = null;
        _status = 'desconectado';
        _qrDataUrl = null;
        try { await inst.destroy(); } catch (_) {}

        if (!_desconectandoManualmente) {
            const delay = reason === 'LOGOUT' ? 3000 : 10000;
            console.log(`🔄 Reconectando em ${delay / 1000}s...`);
            setTimeout(() => iniciar().catch(e => console.error('WhatsApp reconexão:', e.message)), delay);
        }
        _desconectandoManualmente = false;
    });

    try {
        await client.initialize();
    } catch (e) {
        console.error('WhatsApp init erro:', e.message);
        try { await client?.destroy(); } catch (_) {}
        client = null;
        _status = 'desconectado';
        // Tenta de novo em 15s se não foi manual
        if (!_desconectandoManualmente) {
            setTimeout(() => iniciar().catch(e => console.error('WhatsApp retry:', e.message)), 15000);
        }
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
        try { await client.logout(); } catch (_) {}
        try { await client.destroy(); } catch (_) {}
        client = null;
    }
    _status = 'desconectado';
    _qrDataUrl = null;
    await new Promise(r => setTimeout(r, 800));
    try { fs.rmSync(SESSION_PATH, { recursive: true, force: true }); } catch (_) {}
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

setTimeout(() => {
    iniciar().catch(e => console.error('WhatsApp init:', e.message));
}, 8000);

module.exports = { iniciar, desconectar, trocarConta, enviarMensagem, enviarArquivo, getStatus };
