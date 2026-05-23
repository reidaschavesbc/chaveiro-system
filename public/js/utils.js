// === UTILS ===
const API = '/api';

// Máscara de telefone BR: (DD) DDDD-DDDD ou (DD) DDDDD-DDDD
function mascaraTelefone(input) {
    let v = input.value.replace(/\D/g, '');
    // Remove código do país 55 se o número tiver mais de 11 dígitos
    if (v.startsWith('55') && v.length > 11) v = v.slice(2);
    v = v.slice(0, 11);
    if (!v) { input.value = ''; return; }
    if (v.length <= 2)       input.value = '(' + v;
    else if (v.length <= 6)  input.value = '(' + v.slice(0,2) + ') ' + v.slice(2);
    else if (v.length <= 10) input.value = '(' + v.slice(0,2) + ') ' + v.slice(2,6) + '-' + v.slice(6);
    else                     input.value = '(' + v.slice(0,2) + ') ' + v.slice(2,7) + '-' + v.slice(7);
}

// Aplica a máscara a um valor já salvo (para preencher campos ao editar)
function aplicarMascaraTelefone(valor) {
    const el = { value: valor || '' };
    mascaraTelefone(el);
    return el.value;
}

function getToken() { return localStorage.getItem('token'); }
function getUser() { try { return JSON.parse(localStorage.getItem('user')); } catch { return null; } }
function authHeaders() { return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() }; }

async function api(method, path, body, timeoutMs = 10000) {
    const opts = { method, headers: authHeaders(), signal: AbortSignal.timeout(timeoutMs) };
    if (body) opts.body = JSON.stringify(body);
    let res;
    try {
        res = await fetch(API + path, opts);
    } catch (e) {
        if (e.name === 'TimeoutError' || e.name === 'AbortError') throw new Error('Servidor não respondeu — verifique se está rodando');
        throw new Error('Não foi possível conectar ao servidor');
    }
    if (res.status === 401) { logout(); return null; }
    if (res.status === 403) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Acesso negado'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const msg = data.error;
        throw new Error(typeof msg === 'string' ? msg : (msg ? JSON.stringify(msg) : 'Erro na requisição'));
    }
    return data;
}

function toast(msg, type = 'success') {
    const el = document.getElementById('toast');
    const inner = document.getElementById('toast-inner');
    const colors = { success: '#16a34a', error: '#dc2626', warning: '#d97706', info: '#1a56db' };
    inner.style.background = colors[type] || colors.info;
    inner.textContent = msg;
    el.style.display = 'block';
    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => el.style.display = 'none', 3500);
}

function formatCurrency(val) {
    return 'R$ ' + parseFloat(val || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function formatDate(str) {
    if (!str) return '-';
    return str.slice(0, 10).split('-').reverse().join('/');
}
function today() { return new Date().toISOString().slice(0, 10); }
function monthStart() { return new Date().toISOString().slice(0, 7) + '-01'; }

function badgeStatus(status) {
    const labels = { aberta: 'Aberta', em_andamento: 'Em Andamento', concluida: 'Concluída', cancelada: 'Cancelada', reagendar: 'Reagendar' };
    return `<span class="badge badge-${status}">${labels[status] || status}</span>`;
}
function badgePagamento(fp) {
    const labels = { dinheiro: 'Dinheiro', pix: 'PIX', credito: 'Cartão Crédito', debito: 'Cartão Débito', cartao1: 'Cartão 1', cartao2: 'Cartão 2' };
    return `<span class="badge badge-${fp}">${labels[fp] || fp}</span>`;
}

function confirmDialog(msg) { return modalConfirmar({ titulo: 'Confirmar', mensagem: msg }); }

function modalPrompt({ titulo, mensagem, placeholder = '', obrigatorio = true }) {
    return new Promise(resolve => {
        let overlay = document.getElementById('modal-prompt-generico');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'modal-prompt-generico';
            overlay.className = 'modal-overlay';
            document.body.appendChild(overlay);
        }
        overlay.innerHTML = `
        <div class="modal" style="max-width:440px;width:100%" onclick="event.stopPropagation()">
            <div class="modal-header">
                <span class="modal-title">✏️ ${titulo}</span>
                <button class="modal-close" id="btn-mp-fechar">&times;</button>
            </div>
            <div class="modal-body">
                <p style="font-size:13px;color:#374151;margin:0 0 12px">${mensagem}</p>
                <input type="text" id="input-mp-valor" style="width:100%;box-sizing:border-box">
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" id="btn-mp-cancelar">Cancelar</button>
                <button class="btn btn-danger" id="btn-mp-ok">Confirmar</button>
            </div>
        </div>`;

        openModal('modal-prompt-generico');
        setTimeout(() => document.getElementById('input-mp-valor')?.focus(), 80);

        const fechar = (val) => { closeModal('modal-prompt-generico'); resolve(val); };

        const confirmar = () => {
            const val = document.getElementById('input-mp-valor').value.trim();
            if (obrigatorio && !val) {
                document.getElementById('input-mp-valor').style.borderColor = '#dc2626';
                return;
            }
            fechar(val || null);
        };

        overlay.onclick = () => fechar(null);
        overlay.querySelector('.modal').onclick = e => e.stopPropagation();
        document.getElementById('btn-mp-fechar').onclick   = () => fechar(null);
        document.getElementById('btn-mp-cancelar').onclick = () => fechar(null);
        document.getElementById('btn-mp-ok').onclick       = confirmar;
        document.getElementById('input-mp-valor').onkeydown = e => { if (e.key === 'Enter') confirmar(); if (e.key === 'Escape') fechar(null); };
    });
}
function nomeCliente(obj) { return obj.cliente_nome || obj.cliente_nome_avulso || '????'; }

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// Modal de confirmação genérico — retorna Promise<boolean>
function modalConfirmar({ titulo, mensagem, icone = '❓', corBotao = '#2563eb', textoBotao = 'Confirmar' }) {
    return new Promise(resolve => {
        let overlay = document.getElementById('modal-confirmar-generico');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'modal-confirmar-generico';
            overlay.className = 'modal-overlay';
            document.body.appendChild(overlay);
        }
        overlay.innerHTML = `
        <div class="modal" style="max-width:420px;width:100%" onclick="event.stopPropagation()">
            <div class="modal-header">
                <span class="modal-title">${icone} ${titulo}</span>
                <button class="modal-close" id="btn-mc-fechar">&times;</button>
            </div>
            <div class="modal-body">
                <p style="font-size:14px;color:#374151;margin:0">${mensagem}</p>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" id="btn-mc-cancelar">Cancelar</button>
                <button class="btn" id="btn-mc-ok" style="background:${corBotao};color:#fff;border:none">${textoBotao}</button>
            </div>
        </div>`;

        openModal('modal-confirmar-generico');

        const fechar = (val) => { closeModal('modal-confirmar-generico'); resolve(val); };

        overlay.onclick = () => fechar(false);
        overlay.querySelector('.modal').onclick = e => e.stopPropagation();
        document.getElementById('btn-mc-fechar').onclick   = () => fechar(false);
        document.getElementById('btn-mc-cancelar').onclick = () => fechar(false);
        document.getElementById('btn-mc-ok').onclick       = () => fechar(true);
        document.getElementById('btn-mc-ok').focus();
    });
}

// Modal de confirmação de envio WhatsApp com campo de telefone editável — retorna Promise<string|null>
function modalConfirmarEnvioWA({ telefone = '', titulo = 'Enviar via WhatsApp', icone = '📱' } = {}) {
    return new Promise(resolve => {
        let overlay = document.getElementById('modal-confirmar-wa');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'modal-confirmar-wa';
            overlay.className = 'modal-overlay';
            document.body.appendChild(overlay);
        }
        overlay.innerHTML = `
        <div class="modal" style="max-width:400px;width:100%" onclick="event.stopPropagation()">
            <div class="modal-header">
                <span class="modal-title">${icone} ${titulo}</span>
                <button class="modal-close" id="btn-wa-fechar">&times;</button>
            </div>
            <div class="modal-body">
                <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:6px">Número de destino</label>
                <input id="input-wa-telefone" type="tel"
                    value="${telefone}"
                    placeholder="Ex: 48999998888"
                    style="width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:15px;outline:none"
                    oninput="this.style.borderColor='#2563eb'"
                />
                <p style="font-size:12px;color:#6b7280;margin:8px 0 0">Confirme ou altere o número antes de enviar.</p>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" id="btn-wa-cancelar">Cancelar</button>
                <button class="btn" id="btn-wa-ok" style="background:#25d366;color:#fff;border:none;gap:6px">
                    📲 Enviar
                </button>
            </div>
        </div>`;

        openModal('modal-confirmar-wa');
        const input = document.getElementById('input-wa-telefone');
        input.focus();
        input.select();

        const fechar = (val) => { closeModal('modal-confirmar-wa'); resolve(val); };

        overlay.onclick = () => fechar(null);
        overlay.querySelector('.modal').onclick = e => e.stopPropagation();
        document.getElementById('btn-wa-fechar').onclick   = () => fechar(null);
        document.getElementById('btn-wa-cancelar').onclick = () => fechar(null);
        document.getElementById('btn-wa-ok').onclick = () => {
            const num = input.value.trim();
            if (!num) { input.style.borderColor = '#ef4444'; input.focus(); return; }
            fechar(num);
        };
        input.onkeydown = e => { if (e.key === 'Enter') document.getElementById('btn-wa-ok').click(); };
    });
}

function pedirSenhaExclusao(descricao) {
    return new Promise((resolve) => {
        let overlay = document.getElementById('modal-senha-excl');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'modal-senha-excl';
            overlay.className = 'modal-overlay';
            document.body.appendChild(overlay);
        }

        overlay.innerHTML = `
        <div class="modal" style="max-width:460px;width:100%">
            <div class="modal-header">
                <span class="modal-title" style="color:#dc2626">Excluir Permanentemente</span>
                <button class="modal-close" id="btn-excl-fechar">&times;</button>
            </div>
            <div class="modal-body">
                <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;margin-bottom:16px">
                    <strong style="color:#dc2626">&#9888;&#65039; Atenção: Ação Irreversível!</strong>
                    <p style="color:#7f1d1d;margin:6px 0 0;font-size:13px"><strong>${descricao}</strong> será excluído(a) permanentemente e não poderá ser recuperado(a).</p>
                </div>
                <div class="form-group">
                    <label>Senha do gerente</label>
                    <input type="password" id="input-senha-excl">
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" id="btn-excl-cancelar">Cancelar</button>
                <button class="btn btn-danger" id="btn-excl-confirmar">Excluir Permanentemente</button>
            </div>
        </div>`;

        openModal('modal-senha-excl');
        setTimeout(() => document.getElementById('input-senha-excl')?.focus(), 100);

        const fechar = (val) => { closeModal('modal-senha-excl'); resolve(val); };

        document.getElementById('btn-excl-fechar').onclick = () => fechar(null);
        document.getElementById('btn-excl-cancelar').onclick = () => fechar(null);
        document.getElementById('btn-excl-confirmar').onclick = () => fechar(document.getElementById('input-senha-excl').value);
        document.getElementById('input-senha-excl').onkeydown = (e) => {
            if (e.key === 'Enter') fechar(document.getElementById('input-senha-excl').value);
        };
    });
}

function abrirVisualizadorImagem(url, titulo) {
    let overlay = document.getElementById('modal-viz-imagem');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'modal-viz-imagem';
        overlay.className = 'modal-overlay';
        overlay.onclick = () => closeModal('modal-viz-imagem');
        document.body.appendChild(overlay);
    }
    overlay.innerHTML = `
    <div class="modal" style="max-width:640px;width:100%" onclick="event.stopPropagation()">
      <div class="modal-header">
        <span class="modal-title">📷 ${titulo || 'Foto do Produto'}</span>
        <button class="modal-close" onclick="closeModal('modal-viz-imagem')">&times;</button>
      </div>
      <div class="modal-body" style="text-align:center;padding:20px 24px">
        <img src="${url}" alt="${titulo || ''}" style="max-width:100%;max-height:70vh;border-radius:10px;object-fit:contain;box-shadow:0 4px 20px rgba(0,0,0,0.15)">
      </div>
    </div>`;
    openModal('modal-viz-imagem');
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/';
}

document.addEventListener('focusin', e => {
    if (e.target.type === 'number') e.target.select();
});

// Padroniza toda digitação em maiúsculas (exceto senha, email, número, data)
const _skipUppercase = new Set(['password', 'email', 'number', 'date', 'time', 'month', 'color', 'file', 'range', 'checkbox', 'radio']);
document.addEventListener('input', e => {
    const el = e.target;
    if ((el.tagName === 'INPUT' && !_skipUppercase.has(el.type)) || el.tagName === 'TEXTAREA') {
        const start = el.selectionStart;
        const end = el.selectionEnd;
        el.value = el.value.toUpperCase();
        try { el.setSelectionRange(start, end); } catch (_) {}
    }
});
