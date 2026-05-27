// === CARTÃO PONTO ===

const TIPO_LABEL = {
    entrada:        { label: 'Entrada',      cor: '#15803d', bg: '#dcfce7', border: '#86efac', svg: '<path d="M8 5v14l11-7z"/>' },
    saida_almoco:   { label: 'Saída Almoço', cor: '#92400e', bg: '#fef3c7', border: '#fcd34d', svg: '<path d="M18.3 5.71a.996.996 0 0 0-1.41 0L12 10.59 7.11 5.7A.996.996 0 1 0 5.7 7.11L10.59 12 5.7 16.89a.996.996 0 1 0 1.41 1.41L12 13.41l4.89 4.89a.996.996 0 1 0 1.41-1.41L13.41 12l4.89-4.89c.38-.38.38-1.02 0-1.4z"/>' },
    retorno_almoco: { label: 'Retorno',      cor: '#1e40af', bg: '#dbeafe', border: '#93c5fd', svg: '<path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>' },
    saida:          { label: 'Saída',        cor: '#b91c1c', bg: '#fee2e2', border: '#fca5a5', svg: '<path d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5c-1.11 0-2 .9-2 2v4h2V5h14v14H5v-4H3v4c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>'},
};

const STATUS_MAP = {
    entrada:        { label: 'Trabalhando', cor: '#16a34a', dot: '#22c55e' },
    saida_almoco:   { label: 'No almoço',   cor: '#b45309', dot: '#f59e0b' },
    retorno_almoco: { label: 'Trabalhando', cor: '#1d4ed8', dot: '#3b82f6' },
    saida:          { label: 'Saiu',        cor: '#dc2626', dot: '#ef4444' },
};

function fmtHora(dh) { return dh ? dh.slice(11, 16) : '—'; }
function fmtData(dh) { return dh ? dh.slice(8,10)+'/'+dh.slice(5,7)+'/'+dh.slice(0,4) : '—'; }

function calcHoras(registros) {
    let total = 0, entrada = null;
    for (const r of registros) {
        const t = new Date(r.data_hora.replace(' ', 'T'));
        if (r.tipo === 'entrada' || r.tipo === 'retorno_almoco') entrada = t;
        else if ((r.tipo === 'saida_almoco' || r.tipo === 'saida') && entrada) { total += t - entrada; entrada = null; }
    }
    if (entrada) total += Date.now() - entrada;
    if (total <= 0) return null;
    const h = Math.floor(total / 3600000);
    const m = Math.floor((total % 3600000) / 60000);
    return `${h}h${String(m).padStart(2,'0')}`;
}

function statusAtual(registros) {
    if (!registros.length) return null;
    return STATUS_MAP[registros[registros.length - 1].tipo] || null;
}

function inicialAvatar(nome) {
    return nome.trim().charAt(0).toUpperCase();
}

let _pontoAbaAtiva = 'hoje';
let _pontoFuncionarios = [];

async function ponto(el) {
    const user = getUser();
    const isAdmin = user?.perfil === 'admin';

    el.innerHTML = `
        <style>
            .pt-tabs { display:flex; gap:4px; background:#f1f5f9; border-radius:10px; padding:4px; width:fit-content; margin-bottom:20px; }
            .pt-tab { padding:7px 18px; border-radius:8px; border:none; font-size:13px; font-weight:600; cursor:pointer; background:transparent; color:#64748b; transition:all .15s; }
            .pt-tab.ativo { background:#fff; color:#1e293b; box-shadow:0 1px 4px rgba(0,0,0,.10); }
            .pt-tab:hover:not(.ativo) { color:#1e293b; }
            .pt-card { background:#fff; border-radius:16px; border:1px solid #e8edf3; box-shadow:0 2px 8px rgba(0,0,0,.06); padding:20px; transition:box-shadow .15s; }
            .pt-card:hover { box-shadow:0 4px 16px rgba(0,0,0,.10); }
            .pt-avatar { width:44px; height:44px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:18px; font-weight:800; color:#fff; flex-shrink:0; }
            .pt-dot { width:8px; height:8px; border-radius:50%; display:inline-block; margin-right:5px; }
            .pt-dot.pulse { animation:ptPulse 1.8s ease-in-out infinite; }
            @keyframes ptPulse { 0%,100%{opacity:1} 50%{opacity:.4} }
            .pt-timeline { display:flex; align-items:center; gap:0; margin:12px 0 14px; }
            .pt-tl-item { display:flex; flex-direction:column; align-items:center; flex:1; position:relative; }
            .pt-tl-item:not(:last-child)::after { content:''; position:absolute; top:10px; left:50%; width:100%; height:2px; background:#e2e8f0; z-index:0; }
            .pt-tl-item.done::after { background:#2563eb22; }
            .pt-tl-dot { width:20px; height:20px; border-radius:50%; border:2.5px solid #e2e8f0; background:#fff; z-index:1; display:flex; align-items:center; justify-content:center; font-size:9px; }
            .pt-tl-item.done .pt-tl-dot { border-color:currentColor; background:currentColor; }
            .pt-tl-label { font-size:9px; color:#94a3b8; margin-top:4px; text-align:center; font-weight:600; letter-spacing:.3px; }
            .pt-tl-hora { font-size:10px; color:#475569; font-weight:700; margin-top:1px; }
            .pt-btn-reg { padding:10px 6px; border-radius:12px; border:1.5px solid; font-size:11px; font-weight:700; cursor:pointer; transition:all .15s; display:flex; flex-direction:column; align-items:center; gap:5px; flex:1; min-width:0; }
            .pt-btn-reg:hover { filter:brightness(.93); transform:translateY(-2px); box-shadow:0 4px 12px rgba(0,0,0,.12); }
            .pt-btn-reg:active { transform:scale(.96); }
            .pt-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(270px,1fr)); gap:16px; }
        </style>
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:4px">
            <div class="pt-tabs">
                <button id="pt-aba-hoje" class="pt-tab ativo" onclick="pontoAba('hoje')">Hoje</button>
                ${isAdmin ? `
                <button id="pt-aba-rel" class="pt-tab" onclick="pontoAba('relatorio')">Relatório</button>
                ` : ''}
            </div>
            ${isAdmin ? `
            <button onclick="pontoLiberarTodos()" style="padding:8px 16px;background:#fff;border:1.5px solid #fca5a5;color:#dc2626;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px">
                <svg viewBox="0 0 24 24" style="width:15px;height:15px;fill:#dc2626"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm-3-9V6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9z"/></svg>
                Liberar Todos
            </button>` : ''}
        </div>
        <div id="pt-conteudo"></div>
    `;

    if (isAdmin) {
        try { _pontoFuncionarios = await api('GET', '/ponto/funcionarios'); } catch { _pontoFuncionarios = []; }
    }
    pontoAba('hoje');
}

function pontoAba(aba) {
    _pontoAbaAtiva = aba;
    document.querySelectorAll('.pt-tab').forEach(b => {
        b.classList.toggle('ativo', b.id === 'pt-aba-' + aba);
    });
    const el = document.getElementById('pt-conteudo');
    if (aba === 'hoje') pontoRenderHoje(el);
    else if (aba === 'relatorio') pontoRenderRelatorio(el);
}

const TL_STEPS = [
    { tipo: 'entrada',        label: 'ENTRADA' },
    { tipo: 'saida_almoco',   label: 'ALMOÇO' },
    { tipo: 'retorno_almoco', label: 'RETORNO' },
    { tipo: 'saida',          label: 'SAÍDA' },
];

function renderTimeline(registros) {
    return TL_STEPS.map(step => {
        const reg = registros.find(r => r.tipo === step.tipo);
        const cor = reg ? TIPO_LABEL[step.tipo].cor : '#cbd5e1';
        return `
        <div class="pt-tl-item ${reg ? 'done' : ''}" style="color:${cor}">
            <div class="pt-tl-dot" style="${reg ? `border-color:${cor};background:${cor}` : ''}">
                ${reg ? '<svg viewBox="0 0 24 24" style="width:10px;height:10px;fill:#fff"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>' : ''}
            </div>
            <div class="pt-tl-label" style="color:${reg ? cor : '#94a3b8'}">${step.label}</div>
            <div class="pt-tl-hora">${reg ? fmtHora(reg.data_hora) : ''}</div>
        </div>`;
    }).join('');
}

async function pontoRenderHoje(el) {
    el.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:32px">Carregando...</p>';
    let dados;
    try { dados = await api('GET', '/ponto/hoje'); } catch (e) { el.innerHTML = `<p style="color:#ef4444;padding:16px">${e.message}</p>`; return; }

    if (!dados.length) {
        el.innerHTML = `<div style="text-align:center;padding:48px 16px;color:#94a3b8">
            <svg viewBox="0 0 24 24" style="width:48px;height:48px;fill:#cbd5e1;margin-bottom:12px"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/></svg>
            <p style="font-size:14px;font-weight:600">Nenhum funcionário com PIN cadastrado</p>
        </div>`;
        return;
    }

    const isAdmin = getUser()?.perfil === 'admin';
    const CORES_AVATAR = ['#6366f1','#0891b2','#059669','#d97706','#dc2626','#7c3aed','#db2777'];

    el.innerHTML = `<div class="pt-grid">${dados.map((f, i) => {
        const st = statusAtual(f.registros);
        const hs = calcHoras(f.registros);
        const corAv = CORES_AVATAR[i % CORES_AVATAR.length];
        const trabalhando = st && (st.label === 'Trabalhando');

        return `
        <div class="pt-card">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
                <div class="pt-avatar" style="background:${corAv}">${inicialAvatar(f.nome)}</div>
                <div style="flex:1;min-width:0">
                    <div style="font-weight:800;color:#0f172a;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f.nome}</div>
                    <div style="font-size:12px;margin-top:2px;display:flex;align-items:center">
                        ${st ? `<span class="pt-dot ${trabalhando ? 'pulse' : ''}" style="background:${st.dot}"></span><span style="color:${st.cor};font-weight:600">${st.label}</span>` : `<span style="color:#94a3b8">Não registrou</span>`}
                        ${hs ? `<span style="color:#cbd5e1;margin:0 6px">·</span><span style="color:#475569;font-weight:700">${hs}</span>` : ''}
                    </div>
                </div>
            </div>

            <div class="pt-timeline">${renderTimeline(f.registros)}</div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding-top:12px;border-top:1px solid #f1f5f9">
                ${Object.entries(TIPO_LABEL).map(([k, v]) => `
                    <button class="pt-btn-reg" onclick="pontoBater(${f.id},'${k}')"
                        style="border-color:${v.border};color:${v.cor};background:${v.bg}">
                        <svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:${v.cor}">${v.svg}</svg>
                        ${v.label}
                    </button>`).join('')}
            </div>

            ${isAdmin && f.registros.length ? `
            <div style="margin-top:10px;padding-top:8px;border-top:1px solid #f8fafc;display:flex;flex-wrap:wrap;gap:6px">
                ${f.registros.map(r => `
                    <div style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:${TIPO_LABEL[r.tipo]?.bg||'#f1f5f9'};color:${TIPO_LABEL[r.tipo]?.cor||'#64748b'}">
                        ${fmtHora(r.data_hora)}
                        <span onclick="pontoExcluir(${r.id})" style="cursor:pointer;opacity:.6;margin-left:2px;font-size:13px;line-height:1" title="Remover">×</span>
                    </div>`).join('')}
            </div>` : ''}
        </div>`;
    }).join('')}</div>`;
}

async function pontoBater(vendedorId, tipo) {
    try {
        const r = await api('POST', '/ponto/registrar', { usuario_id: vendedorId, tipo });
        toast(`${TIPO_LABEL[tipo].label} — ${r.nome} às ${fmtHora(r.data_hora)}`);
        pontoAba('hoje');
    } catch (e) { toast(e.message, 'error'); }
}

async function pontoExcluir(id) {
    if (!confirm('Remover este registro de ponto?')) return;
    try {
        await api('DELETE', `/ponto/${id}`);
        toast('Registro removido');
        pontoAba('hoje');
    } catch (e) { toast(e.message, 'error'); }
}

async function pontoLiberarTodos() {
    if (!confirm('Registrar SAÍDA para todos os funcionários que ainda não saíram?')) return;
    try {
        const r = await api('POST', '/ponto/liberar-todos');
        toast(`${r.liberados} funcionário(s) liberado(s)`);
        pontoAba('hoje');
    } catch (e) { toast(e.message, 'error'); }
}

async function pontoRenderRelatorio(el) {
    const hoje = new Date().toLocaleDateString('en-CA');
    const inicio = hoje.slice(0, 7) + '-01';

    el.innerHTML = `
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:18px;padding:16px;background:#fff;border-radius:12px;border:1px solid #e8edf3;box-shadow:0 1px 4px rgba(0,0,0,.05)">
            <input type="date" id="pt-di" value="${inicio}" style="padding:8px 12px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px;outline:none">
            <span style="color:#94a3b8;font-weight:600">até</span>
            <input type="date" id="pt-df" value="${hoje}" style="padding:8px 12px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px;outline:none">
            <select id="pt-func" style="padding:8px 12px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px;background:#fff;outline:none">
                <option value="">Todos os funcionários</option>
                ${_pontoFuncionarios.map(f => `<option value="${f.id}">${f.nome}</option>`).join('')}
            </select>
            <button onclick="pontoCarregarRelatorio()" style="padding:8px 18px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">Filtrar</button>
        </div>
        <div id="pt-rel-conteudo"></div>
    `;
    await pontoCarregarRelatorio();
}

async function pontoCarregarRelatorio() {
    const di = document.getElementById('pt-di')?.value;
    const df = document.getElementById('pt-df')?.value;
    const func = document.getElementById('pt-func')?.value;
    const el = document.getElementById('pt-rel-conteudo');
    if (!el) return;

    el.innerHTML = '<p style="color:#94a3b8;padding:16px">Carregando...</p>';
    let params = `/ponto/relatorio?data_inicio=${di}&data_fim=${df}`;
    if (func) params += `&usuario_id=${func}`;

    let dados;
    try { dados = await api('GET', params); } catch (e) { el.innerHTML = `<p style="color:#ef4444">${e.message}</p>`; return; }

    if (!dados.length) { el.innerHTML = '<p style="color:#94a3b8;padding:16px">Nenhum registro no período.</p>'; return; }

    const porFuncDia = {};
    for (const r of dados) {
        const dia = r.data_hora.slice(0, 10);
        const key = `${r.usuario_id}_${dia}`;
        if (!porFuncDia[key]) porFuncDia[key] = { nome: r.nome, dia, registros: [] };
        porFuncDia[key].registros.push(r);
    }

    el.innerHTML = `
        <div style="background:#fff;border-radius:12px;border:1px solid #e8edf3;box-shadow:0 1px 4px rgba(0,0,0,.05);overflow:hidden">
            <table style="width:100%;border-collapse:collapse;font-size:13px">
                <thead>
                    <tr style="background:#f8fafc;border-bottom:2px solid #e8edf3">
                        <th style="padding:12px 16px;text-align:left;color:#64748b;font-weight:700;font-size:12px;letter-spacing:.4px;text-transform:uppercase">Funcionário</th>
                        <th style="padding:12px 16px;text-align:left;color:#64748b;font-weight:700;font-size:12px;letter-spacing:.4px;text-transform:uppercase">Data</th>
                        <th style="padding:12px 16px;text-align:left;color:#64748b;font-weight:700;font-size:12px;letter-spacing:.4px;text-transform:uppercase">Registros</th>
                        <th style="padding:12px 16px;text-align:center;color:#64748b;font-weight:700;font-size:12px;letter-spacing:.4px;text-transform:uppercase">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${Object.values(porFuncDia).map(g => {
                        const hs = calcHoras(g.registros);
                        return `
                        <tr style="border-bottom:1px solid #f1f5f9">
                            <td style="padding:12px 16px;font-weight:700;color:#0f172a">${g.nome}</td>
                            <td style="padding:12px 16px;color:#64748b">${fmtData(g.dia + ' 00:00')}</td>
                            <td style="padding:12px 16px">
                                <div style="display:flex;flex-wrap:wrap;gap:6px">
                                ${g.registros.map(r => `
                                    <div style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;background:${TIPO_LABEL[r.tipo]?.bg||'#f1f5f9'};color:${TIPO_LABEL[r.tipo]?.cor||'#64748b'}">
                                        ${TIPO_LABEL[r.tipo]?.label||r.tipo} ${fmtHora(r.data_hora)}
                                        <span onclick="pontoExcluir(${r.id})" title="Remover" style="cursor:pointer;opacity:.55;margin-left:2px">×</span>
                                    </div>`).join('')}
                                </div>
                            </td>
                            <td style="padding:12px 16px;text-align:center">
                                ${hs ? `<span style="font-weight:800;color:#0f172a;font-size:14px">${hs}</span>` : '<span style="color:#cbd5e1">—</span>'}
                            </td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}
