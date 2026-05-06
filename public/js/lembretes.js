// === LEMBRETES ===

let lembretesVendedores = [];

const LEMBRETE_STATUS = {
    pendente:  { label: 'Pendente',  bg: '#fef3c7', color: '#92400e' },
    enviado:   { label: 'Enviado',   bg: '#d1fae5', color: '#065f46' },
    falha:     { label: 'Falha',     bg: '#fee2e2', color: '#991b1b' },
    cancelado: { label: 'Cancelado', bg: '#f1f5f9', color: '#475569' },
};

function badgeLembrete(status) {
    const s = LEMBRETE_STATUS[status] || LEMBRETE_STATUS.pendente;
    return `<span style="display:inline-flex;align-items:center;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:600;background:${s.bg};color:${s.color}">${s.label}</span>`;
}

const fmtDH = dt => {
    if (!dt) return '—';
    const [d, h] = dt.slice(0, 16).split(' ');
    return d.split('-').reverse().join('/') + (h ? ' ' + h : '');
};

async function lembretes(el) {
    el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px">
            <div style="display:flex;gap:8px">
                <button class="btn btn-secondary btn-sm" onclick="lembretesCarregar()" id="lb-btn-todos" style="font-weight:600">Todos</button>
                <button class="btn btn-secondary btn-sm" onclick="lembretesCarregar('pendente')">Pendentes</button>
                <button class="btn btn-secondary btn-sm" onclick="lembretesCarregar('enviado')">Enviados</button>
            </div>
            <button class="btn btn-primary" onclick="lembretesAbrir()">+ Novo Lembrete</button>
        </div>
        <div class="card">
            <div id="lb-lista"><div class="empty-state"><p>Carregando...</p></div></div>
        </div>
        ${lembretesModalHtml()}
    `;
    await lembretesCarregar();
}

async function lembretesCarregar(status) {
    try {
        const url = status ? `/lembretes?status=${status}` : '/lembretes';
        const data = await api('GET', url);
        lembretesVendedores = data.vendedores || [];
        lembretesRenderLista(data.lembretes || []);
    } catch (e) {
        toast(e.message, 'error');
    }
}

function lembretesRenderLista(lista) {
    const el = document.getElementById('lb-lista');
    if (!el) return;

    if (!lista.length) {
        el.innerHTML = `<div style="text-align:center;padding:40px;color:#94a3b8;font-size:13px">Nenhum lembrete encontrado.</div>`;
        return;
    }

    el.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th style="width:140px">Data / Hora</th>
                    <th>Mensagem</th>
                    <th style="width:180px">Destinatários</th>
                    <th style="width:90px">Status</th>
                    <th style="width:60px"></th>
                </tr>
            </thead>
            <tbody>
                ${lista.map(l => `
                    <tr style="${l.status === 'pendente' ? 'background:#fffbeb' : ''}">
                        <td>
                            <div style="font-weight:600;color:#1e293b;font-size:13px">${fmtDH(l.data_envio)}</div>
                            ${l.enviado_em ? `<div style="font-size:11px;color:#94a3b8">Enviado ${fmtDH(l.enviado_em)}</div>` : ''}
                        </td>
                        <td>
                            <div style="font-size:13px;max-width:300px;white-space:pre-wrap">${l.mensagem}</div>
                            ${l.erros ? `<div style="font-size:11px;color:#ef4444;margin-top:2px">⚠ ${l.erros}</div>` : ''}
                        </td>
                        <td style="font-size:12px;color:#475569">${l.destinatarios_nomes || '—'}</td>
                        <td>${badgeLembrete(l.status)}</td>
                        <td>
                            <button class="btn btn-sm"
                                style="padding:4px 8px;background:${l.status==='pendente'?'#fee2e2':'#f1f5f9'};color:${l.status==='pendente'?'#dc2626':'#64748b'};border:none"
                                title="${l.status==='pendente'?'Cancelar':'Excluir'}"
                                onclick="lembretesExcluir(${l.id}, '${l.status}')">
                                ${l.status === 'pendente' ? '✕' : '🗑️'}
                            </button>
                        </td>
                    </tr>`).join('')}
            </tbody>
        </table>`;
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function lembretesModalHtml() {
    return `
        <div id="lb-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;align-items:center;justify-content:center" onclick="if(event.target===this)lembretesFecharModal()">
            <div style="background:#fff;border-radius:16px;padding:28px;width:100%;max-width:520px;box-shadow:0 20px 60px rgba(0,0,0,.2)" onclick="event.stopPropagation()">
                <div style="font-size:17px;font-weight:700;margin-bottom:20px">Novo Lembrete</div>

                <div class="form-group" style="margin-bottom:16px">
                    <label>Mensagem *</label>
                    <textarea id="lb-mensagem" rows="3" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;resize:vertical;font-family:inherit" placeholder="Digite a mensagem que será enviada pelo WhatsApp..."></textarea>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
                    <div class="form-group">
                        <label>Data *</label>
                        <input type="date" id="lb-data">
                    </div>
                    <div class="form-group">
                        <label>Hora *</label>
                        <input type="time" id="lb-hora">
                    </div>
                </div>

                <div class="form-group" style="margin-bottom:20px">
                    <label style="margin-bottom:10px;display:block">Enviar para *</label>
                    <div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:8px">
                        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:600;color:#1a56db">
                            <input type="checkbox" id="lb-dest-todos" onchange="lembretesToggleTodos(this.checked)" style="width:15px;height:15px">
                            Todos os funcionários
                        </label>
                        <div style="height:1px;background:#f1f5f9;margin:2px 0"></div>
                        <div id="lb-dest-lista"></div>
                    </div>
                </div>

                <div style="display:flex;gap:10px;justify-content:flex-end">
                    <button class="btn btn-secondary" onclick="lembretesFecharModal()">Cancelar</button>
                    <button class="btn btn-primary" onclick="lembretesSalvar()">Agendar Lembrete</button>
                </div>
            </div>
        </div>`;
}

function lembretesAbrir() {
    // Preenche data e hora padrão (+1 hora a partir de agora)
    const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0);
    const pad = n => String(n).padStart(2, '0');
    document.getElementById('lb-data').value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    document.getElementById('lb-hora').value = `${pad(d.getHours())}:00`;
    document.getElementById('lb-mensagem').value = '';
    document.getElementById('lb-dest-todos').checked = true;

    // Renderiza lista de funcionários
    const lista = document.getElementById('lb-dest-lista');
    if (lembretesVendedores.length) {
        lista.innerHTML = lembretesVendedores.map(v => `
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;color:#374151;opacity:.5">
                <input type="checkbox" class="lb-dest-vend" data-id="${v.id}" disabled style="width:14px;height:14px">
                <span style="font-size:13px">${v.nome}</span>
                ${v.telefone ? `<span style="font-size:11px;color:#94a3b8">${v.telefone}</span>` : '<span style="font-size:11px;color:#ef4444">sem telefone</span>'}
            </label>`).join('');
    } else {
        lista.innerHTML = `<div style="font-size:12px;color:#94a3b8">Nenhum funcionário cadastrado.</div>`;
    }

    document.getElementById('lb-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('lb-mensagem').focus(), 80);
}

function lembretesToggleTodos(checked) {
    document.querySelectorAll('.lb-dest-vend').forEach(cb => {
        cb.disabled = checked;
        cb.checked = false;
        cb.closest('label').style.opacity = checked ? '.5' : '1';
    });
}

function lembretesFecharModal() {
    document.getElementById('lb-modal').style.display = 'none';
}

async function lembretesSalvar() {
    const mensagem = document.getElementById('lb-mensagem').value.trim();
    const data = document.getElementById('lb-data').value;
    const hora = document.getElementById('lb-hora').value;
    const todos = document.getElementById('lb-dest-todos').checked;

    if (!mensagem) { toast('Digite a mensagem', 'warning'); return; }
    if (!data || !hora) { toast('Informe data e hora', 'warning'); return; }

    const data_envio = `${data} ${hora}`;

    let destinatarios;
    if (todos) {
        destinatarios = 'todos';
    } else {
        const selecionados = [...document.querySelectorAll('.lb-dest-vend:checked')].map(cb => cb.dataset.id);
        if (!selecionados.length) { toast('Selecione ao menos um destinatário', 'warning'); return; }
        destinatarios = selecionados.join(',');
    }

    // Valida que a data é futura
    const agora = new Date();
    const dataHoraEnvio = new Date(data + 'T' + hora);
    if (dataHoraEnvio <= agora) { toast('A data/hora deve ser no futuro', 'warning'); return; }

    try {
        await api('POST', '/lembretes', { mensagem, data_envio, destinatarios });
        toast('Lembrete agendado!');
        lembretesFecharModal();
        await lembretesCarregar();
    } catch (e) {
        toast(e.message, 'error');
    }
}

async function lembretesExcluir(id, status) {
    const acao = status === 'pendente' ? 'cancelar este lembrete' : 'excluir este lembrete';
    if (!await modalConfirmar({ titulo: 'Confirmar', mensagem: `Deseja ${acao}?`, icone: '❓', corBotao: '#dc2626', textoBotao: 'Confirmar' })) return;
    try {
        await api('DELETE', `/lembretes/${id}`);
        toast(status === 'pendente' ? 'Lembrete cancelado' : 'Lembrete excluído');
        await lembretesCarregar();
    } catch (e) {
        toast(e.message, 'error');
    }
}
