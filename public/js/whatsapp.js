let _waPolling = null;

async function whatsappPage(el) {
  el.innerHTML = `
  <div style="max-width:500px;margin:0 auto">
    <div class="card">
      <div class="card-header"><span class="card-title">Integração WhatsApp</span></div>
      <div class="card-body" id="wa-body">
        <div class="empty-state"><p>Carregando...</p></div>
      </div>
    </div>
    <div class="card" style="margin-top:20px">
      <div class="card-header"><span class="card-title">Como funciona</span></div>
      <div class="card-body" style="font-size:13px;color:#475569;line-height:1.7">
        <p>📱 <strong>Ao criar uma OS</strong> com funcionário atribuído, ele recebe uma mensagem automática no WhatsApp.</p>
        <p>⏰ <strong>30 minutos antes</strong> do horário agendado, o funcionário recebe um lembrete.</p>
        <p>🔒 Use um número <strong>secundário</strong> (chip barato) como bot — não o número oficial da loja.</p>
        <p>✅ Após escanear o QR, a sessão fica salva e <strong>não precisa escanear novamente</strong> após reiniciar.</p>
      </div>
    </div>
  </div>`;

  _iniciarPollingWA();
}

function _renderWAStatus({ status, qr }) {
  const body = document.getElementById('wa-body');
  if (!body) { _pararPollingWA(); return; }

  const statusInfo = {
    conectado:    { cor: '#16a34a', bg: '#f0fdf4', borda: '#bbf7d0', texto: '● Conectado',     sub: 'Bot ativo e enviando mensagens.' },
    conectando:   { cor: '#d97706', bg: '#fffbeb', borda: '#fde68a', texto: '◌ Conectando...', sub: 'Aguarde, inicializando o WhatsApp.' },
    qr_pendente:  { cor: '#1a56db', bg: '#eff6ff', borda: '#bfdbfe', texto: '◉ QR Code pronto', sub: 'Escaneie com o WhatsApp do número do bot.' },
    desconectado: { cor: '#dc2626', bg: '#fef2f2', borda: '#fecaca', texto: '○ Desconectado',  sub: 'Clique em Conectar para iniciar.' },
  };
  const s = statusInfo[status] || statusInfo.desconectado;

  body.innerHTML = `
    <div style="background:${s.bg};border:1px solid ${s.borda};border-radius:10px;padding:14px 18px;margin-bottom:20px">
      <div style="font-size:15px;font-weight:700;color:${s.cor}">${s.texto}</div>
      <div style="font-size:12px;color:#64748b;margin-top:2px">${s.sub}</div>
    </div>

    ${status === 'qr_pendente' && qr ? `
      <div style="text-align:center;margin-bottom:20px">
        <p style="font-size:13px;color:#475569;margin-bottom:12px">Abra o WhatsApp no celular → <strong>Dispositivos conectados</strong> → <strong>Conectar dispositivo</strong></p>
        <img src="${qr}" style="border:3px solid #e2e8f0;border-radius:12px;width:240px;height:240px">
        <p style="font-size:11px;color:#94a3b8;margin-top:8px">O QR expira em ~20 segundos. Se expirar, clique em Reconectar.</p>
      </div>` : ''}

    <div style="display:flex;gap:10px;justify-content:center">
      ${status === 'desconectado' ? `
        <button class="btn btn-primary" onclick="waConectar()">Conectar WhatsApp</button>` : ''}
      ${status === 'qr_pendente' ? `
        <button class="btn btn-secondary" onclick="waConectar()">↺ Reconectar</button>` : ''}
      ${status === 'conectado' ? `
        <button class="btn btn-danger" onclick="waDesconectar()">Desconectar</button>
        <button class="btn btn-secondary" onclick="waTrocarConta()" style="background:#f59e0b;border-color:#f59e0b;color:#fff">↔ Trocar Conta</button>` : ''}
      ${status === 'desconectado' ? `
        <button class="btn btn-secondary" onclick="waTrocarConta()" style="background:#f59e0b;border-color:#f59e0b;color:#fff">↔ Trocar Conta</button>` : ''}
    </div>`;
}

function _iniciarPollingWA() {
  _pararPollingWA();
  const tick = async () => {
    try {
      const data = await api('GET', '/whatsapp/status');
      if (data) _renderWAStatus(data);
      // Polling mais frequente enquanto aguarda QR ou conexão
      const delay = (data?.status === 'conectado') ? 10000 : 3000;
      _waPolling = setTimeout(tick, delay);
    } catch (_) {
      _waPolling = setTimeout(tick, 5000);
    }
  };
  tick();
}

function _pararPollingWA() {
  if (_waPolling) { clearTimeout(_waPolling); _waPolling = null; }
}

async function waConectar() {
  try {
    await api('POST', '/whatsapp/conectar');
    _iniciarPollingWA();
  } catch (e) { toast(e.message, 'error'); }
}

async function waDesconectar() {
  if (!await modalConfirmar({ titulo: 'Desconectar WhatsApp', mensagem: 'Deseja desconectar o bot do WhatsApp?', icone: '⚠️', corBotao: '#dc2626', textoBotao: 'Desconectar' })) return;
  try {
    await api('POST', '/whatsapp/desconectar');
    toast('WhatsApp desconectado');
    _iniciarPollingWA();
  } catch (e) { toast(e.message, 'error'); }
}

async function waTrocarConta() {
  if (!await modalConfirmar({ titulo: 'Trocar Conta', mensagem: 'Isso vai desconectar o bot atual e gerar um novo QR Code para escanear com outra conta. Continuar?', icone: '⚠️', corBotao: '#dc2626', textoBotao: 'Trocar Conta' })) return;
  try {
    await api('POST', '/whatsapp/trocar-conta');
    toast('Sessão apagada. Aguarde o novo QR Code...');
    _iniciarPollingWA();
  } catch (e) { toast(e.message, 'error'); }
}
