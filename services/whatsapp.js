const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const pino = require('pino');

const SESSION_PATH = path.join(__dirname, '..', 'whatsapp-session');

let sock = null;
let _status = 'desconectado';
let _qrDataUrl = null;
let _desconectandoManualmente = false;

function normalizePhone(phone) {
    const digits = phone.replace(/\D/g, '');
    return (digits.startsWith('55') && digits.length >= 12) ? digits : '55' + digits;
}

async function iniciar() {
    if (sock) return;
    _status = 'conectando';
    _qrDataUrl = null;

    try {
        const { version } = await fetchLatestBaileysVersion();
        const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);

        sock = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            browser: ['ChaveiroSystem', 'Chrome', '10.0'],
            generateHighQualityLinkPreview: false,
            syncFullHistory: false,
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
            if (qr) {
                _status = 'qr_pendente';
                _qrDataUrl = await qrcode.toDataURL(qr, { width: 280 });
                console.log('📱 WhatsApp: QR gerado, aguardando leitura...');
            }

            if (connection === 'open') {
                _status = 'conectado';
                _qrDataUrl = null;
                console.log('✅ WhatsApp conectado!');
            }

            if (connection === 'close') {
                const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
                const loggedOut = code === DisconnectReason.loggedOut;
                console.log('⚠️  WhatsApp desconectado, código:', code, loggedOut ? '(logout)' : '');

                sock = null;
                _status = 'desconectado';
                _qrDataUrl = null;

                if (loggedOut) {
                    try { fs.rmSync(SESSION_PATH, { recursive: true, force: true }); } catch (_) {}
                }

                if (!_desconectandoManualmente) {
                    const delay = loggedOut ? 2000 : 10000;
                    console.log(`🔄 Reconectando em ${delay / 1000}s...`);
                    setTimeout(() => iniciar().catch(e => console.error('WhatsApp reconexão:', e.message)), delay);
                }
                _desconectandoManualmente = false;
            }
        });

    } catch (e) {
        console.error('WhatsApp init erro:', e.message);
        sock = null;
        _status = 'desconectado';
        if (!_desconectandoManualmente) {
            setTimeout(() => iniciar().catch(e => console.error('WhatsApp retry:', e.message)), 15000);
        }
    }
}

async function desconectar() {
    if (!sock) return;
    _desconectandoManualmente = true;
    try { await sock.logout(); } catch (_) {}
    try { sock.end(); } catch (_) {}
    sock = null;
    _status = 'desconectado';
    _qrDataUrl = null;
}

async function trocarConta() {
    _desconectandoManualmente = true;
    if (sock) {
        try { await sock.logout(); } catch (_) {}
        try { sock.end(); } catch (_) {}
        sock = null;
    }
    _status = 'desconectado';
    _qrDataUrl = null;
    await new Promise(r => setTimeout(r, 800));
    try { fs.rmSync(SESSION_PATH, { recursive: true, force: true }); } catch (_) {}
    _desconectandoManualmente = false;
    await iniciar();
}

async function resolverJid(telefone) {
    const num = normalizePhone(telefone);
    // Verifica se o número existe no WhatsApp
    const [result] = await sock.onWhatsApp(num);
    if (result?.exists) return result.jid;
    // Tenta com 9 na frente (números BR antigos sem o dígito 9)
    const digits = num.replace(/\D/g, '');
    if (digits.length === 12) {
        const com9 = digits.slice(0, 4) + '9' + digits.slice(4);
        const [result9] = await sock.onWhatsApp(com9);
        if (result9?.exists) return result9.jid;
    }
    throw new Error(`Número ${telefone} não encontrado no WhatsApp`);
}

async function enviarMensagem(telefone, texto) {
    if (_status !== 'conectado' || !sock) throw new Error('WhatsApp não está conectado');
    const jid = await resolverJid(telefone);
    await sock.sendMessage(jid, { text: texto });
}

async function enviarArquivo(telefone, mimeType, base64Data, filename, caption) {
    if (_status !== 'conectado' || !sock) throw new Error('WhatsApp não está conectado');
    const jid = await resolverJid(telefone);
    const buffer = Buffer.from(base64Data, 'base64');
    console.log(`[WA] sendMessage jid=${jid} fileName=${filename} bufferSize=${buffer.length}`);
    const result = await sock.sendMessage(jid, {
        document: buffer,
        mimetype: mimeType,
        fileName: filename,
        caption: caption || '',
    });
    console.log(`[WA] sendMessage resultado status=${result?.status}`);
}

function getStatus() {
    return { status: _status, qr: _qrDataUrl };
}

setTimeout(() => {
    iniciar().catch(e => console.error('WhatsApp init:', e.message));
}, 5000);

module.exports = { iniciar, desconectar, trocarConta, enviarMensagem, enviarArquivo, getStatus };
