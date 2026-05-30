const AGENDA_START  = 8;
const AGENDA_END    = 19;
const PX_POR_HORA   = 90;
const LARGURA_HORA  = 56;
const LARGURA_COL   = 220;

function agendaEsc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const CORES_TECNICO = [
  { bg: '#eff6ff', borda: '#2563eb', header: '#2563eb' },
  { bg: '#f0fdf4', borda: '#16a34a', header: '#16a34a' },
  { bg: '#fdf4ff', borda: '#9333ea', header: '#9333ea' },
  { bg: '#fff7ed', borda: '#ea580c', header: '#ea580c' },
  { bg: '#fef2f2', borda: '#dc2626', header: '#dc2626' },
  { bg: '#f0fdfa', borda: '#0d9488', header: '#0d9488' },
];

function agendaFmtHora(date) {
  return `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
}

function agendaFmtElapsed(inicioStr) {
  const inicio = new Date(inicioStr.replace(' ', 'T'));
  const diff = Math.max(0, Math.floor((Date.now() - inicio.getTime()) / 60000));
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return h > 0 ? `${h}h${String(m).padStart(2,'0')}min` : `${m}min`;
}

function agendaFmtTempoReal(minutos) {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return h > 0 ? `${h}h${String(m).padStart(2,'0')}min` : `${m}min`;
}

function agendaTickTimers() {
  document.querySelectorAll('[data-inicio-real]').forEach(el => {
    el.textContent = '⏱ ' + agendaFmtElapsed(el.dataset.inicioReal);
  });
}

// Atualiza contadores de tempo a cada 30 segundos
setInterval(agendaTickTimers, 30000);

async function agenda(el) {
  const hoje = new Date().toLocaleDateString('en-CA');
  el.innerHTML = `
    <div class="card" style="overflow:hidden">
      <div class="card-header" style="border-bottom:1px solid #e2e8f0">
        <span class="card-title" style="font-size:16px">📅 Agenda de Técnicos</span>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <div style="display:flex;align-items:center;gap:4px;background:#f1f5f9;border-radius:10px;padding:4px">
            <button onclick="agendaDia(-1)" style="padding:5px 12px;border:none;border-radius:7px;background:transparent;cursor:pointer;font-size:15px;color:#475569;font-weight:700" onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='transparent'">‹</button>
            <input type="date" id="agenda-data" value="${hoje}" onchange="carregarAgenda()" style="border:none;background:transparent;font-size:13px;color:#334155;font-weight:600;cursor:pointer;outline:none">
            <button onclick="agendaDia(1)" style="padding:5px 12px;border:none;border-radius:7px;background:transparent;cursor:pointer;font-size:15px;color:#475569;font-weight:700" onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='transparent'">›</button>
          </div>
          <button onclick="agendaHoje()" style="padding:6px 14px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;cursor:pointer;font-size:12px;font-weight:600;color:#475569" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#fff'">Hoje</button>
          <button onclick="carregarAgenda()" style="padding:6px 14px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;cursor:pointer;font-size:12px;font-weight:600;color:#475569" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#fff'">↻ Atualizar</button>
        </div>
      </div>

      <div style="display:flex;gap:20px;padding:10px 16px;border-bottom:1px solid #f1f5f9;flex-wrap:wrap;background:#fafafa">
        <div style="display:flex;align-items:center;gap:6px">
          <div style="width:12px;height:12px;background:#fee2e2;border-left:3px solid #dc2626;border-radius:2px"></div>
          <span style="font-size:11px;color:#64748b;font-weight:500">Inicia em menos de 1h</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <div style="width:12px;height:12px;background:#fef9c3;border-left:3px solid #ca8a04;border-radius:2px"></div>
          <span style="font-size:11px;color:#64748b;font-weight:500">Em andamento</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <div style="width:12px;height:12px;background:#dbeafe;border-left:3px solid #2563eb;border-radius:2px"></div>
          <span style="font-size:11px;color:#64748b;font-weight:500">Agendado</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <div style="width:12px;height:12px;background:#f1f5f9;border-left:3px solid #94a3b8;border-radius:2px"></div>
          <span style="font-size:11px;color:#64748b;font-weight:500">Passado</span>
        </div>
      </div>

      <div id="agenda-container" style="display:flex;flex-direction:column;max-height:calc(100vh - 220px);overflow:hidden">
        <div style="padding:40px;text-align:center;color:#94a3b8">Carregando...</div>
      </div>
    </div>
  `;
  await carregarAgenda();
}

function agendaHoje() {
  const input = document.getElementById('agenda-data');
  if (!input) return;
  input.value = new Date().toLocaleDateString('en-CA');
  carregarAgenda();
}

async function carregarAgenda() {
  const dataEl = document.getElementById('agenda-data');
  if (!dataEl) return;
  const data = dataEl.value;
  const container = document.getElementById('agenda-container');
  container.innerHTML = '<div style="padding:40px;text-align:center;color:#94a3b8">Carregando...</div>';
  try {
    const [tecnicos, os] = await Promise.all([
      api('GET', '/vendedores?tecnico=1'),
      api('GET', `/ordens/agenda?data=${data}`)
    ]);
    renderAgenda(tecnicos, os, data);
  } catch (e) {
    console.error('Agenda erro:', e);
    container.innerHTML = `<div style="padding:40px;text-align:center;color:#ef4444">Erro ao carregar agenda<br><small style="color:#94a3b8">${e?.message || e}</small></div>`;
  }
}

function agendaTemHorario(dataPrevista) {
  // data_prevista sem hora vem como '2026-05-30' (10 chars); com hora como '2026-05-30 08:30'
  return dataPrevista && dataPrevista.length > 10;
}

function renderAgenda(tecnicos, os, data) {
  const container = document.getElementById('agenda-container');
  const totalHoras  = AGENDA_END - AGENDA_START;
  const alturaTotal = totalHoras * PX_POR_HORA;
  const now         = new Date();
  const isHoje      = data === now.toLocaleDateString('en-CA');

  if (!tecnicos.length) {
    container.innerHTML = '<div style="padding:60px;text-align:center;color:#94a3b8;font-size:14px">Nenhum técnico cadastrado</div>';
    return;
  }

  const osPorTecnico = {};
  const osSemHorario = [];
  tecnicos.forEach(t => { osPorTecnico[t.id] = []; });
  os.forEach(o => {
    if (osPorTecnico[o.vendedor_id] === undefined) return;
    if (agendaTemHorario(o.data_prevista)) {
      osPorTecnico[o.vendedor_id].push(o);
    } else {
      osSemHorario.push(o);
    }
  });

  const nowMin  = now.getHours() * 60 + now.getMinutes();
  const startMin = AGENDA_START * 60;
  const nowTop   = ((nowMin - startMin) / 60) * PX_POR_HORA;
  const mostrarLinha = isHoje && nowTop >= 0 && nowTop <= alturaTotal;

  const larguraMinCol = 180;
  const larguraTotal = LARGURA_HORA + tecnicos.length * larguraMinCol;

  let html = `<div style="overflow:auto;flex:1;min-height:0"><div style="min-width:${larguraTotal}px;position:relative">`;

  // ── Cabeçalho fixo com nomes dos técnicos ──
  html += `<div style="display:flex;position:sticky;top:0;z-index:20;background:#fff;border-bottom:2px solid #e2e8f0;box-shadow:0 2px 8px rgba(0,0,0,.06)">`;
  html += `<div style="width:${LARGURA_HORA}px;flex-shrink:0"></div>`;
  tecnicos.forEach((t, i) => {
    const cor = CORES_TECNICO[i % CORES_TECNICO.length];
    html += `<div style="flex:1;min-width:${larguraMinCol}px;padding:12px 8px;text-align:center;border-left:1px solid #e2e8f0">
      <div style="display:inline-flex;align-items:center;gap:6px;background:${cor.header}18;border:1px solid ${cor.header}33;border-radius:20px;padding:4px 12px">
        <div style="width:8px;height:8px;background:${cor.header};border-radius:50%"></div>
        <span style="font-size:13px;font-weight:700;color:${cor.header}">${agendaEsc(t.nome)}</span>
      </div>
    </div>`;
  });
  html += `</div>`;

  // ── Corpo da grade ──
  html += `<div style="display:flex">`;

  // Coluna de horas
  html += `<div style="width:${LARGURA_HORA}px;flex-shrink:0;position:relative;height:${alturaTotal}px;background:#fafafa;border-right:1px solid #e2e8f0">`;
  for (let h = AGENDA_START; h <= AGENDA_END; h++) {
    const top = (h - AGENDA_START) * PX_POR_HORA;
    html += `<div style="position:absolute;top:${top - 8}px;left:0;right:0;text-align:right;padding-right:10px;font-size:11px;color:#94a3b8;font-weight:700;user-select:none">${String(h).padStart(2,'0')}:00</div>`;
  }
  html += `</div>`;

  // Colunas dos técnicos
  tecnicos.forEach((t, i) => {
    const cor = CORES_TECNICO[i % CORES_TECNICO.length];
    const osDoTecnico = osPorTecnico[t.id] || [];

    html += `<div style="flex:1;min-width:${larguraMinCol}px;position:relative;height:${alturaTotal}px;border-left:1px solid #e2e8f0">`;

    // Linhas de hora (fundo alternado)
    for (let h = 0; h < totalHoras; h++) {
      const isImpar = h % 2 === 1;
      html += `<div style="position:absolute;top:${h * PX_POR_HORA}px;left:0;right:0;height:${PX_POR_HORA}px;background:${isImpar ? '#fafafa' : '#fff'};border-top:1px solid #f1f5f9"></div>`;
      // Linha de meia hora
      html += `<div style="position:absolute;top:${h * PX_POR_HORA + PX_POR_HORA / 2}px;left:0;right:0;border-top:1px dashed #f1f5f9"></div>`;
    }
    html += `<div style="position:absolute;top:${alturaTotal}px;left:0;right:0;border-top:1px solid #e2e8f0"></div>`;

    // Linha do horário atual
    if (mostrarLinha) {
      html += `<div style="position:absolute;top:${nowTop}px;left:0;right:0;height:2px;background:#ef4444;z-index:15;pointer-events:none">
        <div style="position:absolute;left:-5px;top:-4px;width:10px;height:10px;background:#ef4444;border-radius:50%"></div>
      </div>`;
    }

    // Blocos de OS com horário
    osDoTecnico.forEach(o => {
      const dp     = new Date(o.data_prevista);
      const dpMin  = dp.getHours() * 60 + dp.getMinutes();
      const topPx  = ((dpMin - startMin) / 60) * PX_POR_HORA;
      if (topPx < 0 || topPx > alturaTotal) return;

      const duracao  = o.tempo_estimado > 0 ? o.tempo_estimado : 60;
      const fimDate  = new Date(dp.getTime() + duracao * 60000);
      const heightPx = Math.max(44, (duracao / 60) * PX_POR_HORA - 6);

      // Cores por estado
      let bgBloco = cor.bg, bordaBloco = cor.borda, corTexto = cor.borda;
      let icone = '';

      if (isHoje) {
        const nowMs   = now.getTime();
        const inicioMs = dp.getTime();
        const fimMs   = inicioMs + duracao * 60000;
        if (nowMs >= inicioMs && nowMs <= fimMs) {
          bgBloco = '#fefce8'; bordaBloco = '#ca8a04'; corTexto = '#854d0e'; icone = '⚡ ';
        } else if (nowMs < inicioMs && inicioMs - nowMs <= 3600000) {
          bgBloco = '#fef2f2'; bordaBloco = '#dc2626'; corTexto = '#991b1b'; icone = '⚠ ';
        } else if (nowMs > fimMs) {
          bgBloco = '#f8fafc'; bordaBloco = '#cbd5e1'; corTexto = '#94a3b8';
        }
      }

      const horaInicio = agendaFmtHora(dp);
      const horaFim    = o.tempo_estimado === -1 ? 'Indef.' : agendaFmtHora(fimDate);
      const cliente    = agendaEsc(o.cliente_nome || 'Avulso');
      const descricao  = agendaEsc(o.descricao || '');
      const numero     = agendaEsc(o.numero);

      const timerHtml = o.status === 'em_andamento' && o.data_inicio_real
        ? `<span data-inicio-real="${o.data_inicio_real}" style="font-size:10px;font-weight:700;color:${bordaBloco}">⏱ ${agendaFmtElapsed(o.data_inicio_real)}</span>`
        : '';

      html += `
        <div onclick="agendaAbrirOS(${o.id})"
          style="position:absolute;top:${topPx + 3}px;left:6px;right:6px;height:${heightPx}px;
            background:${bgBloco};border-left:4px solid ${bordaBloco};border-radius:0 6px 6px 0;
            box-shadow:0 1px 4px rgba(0,0,0,.08);
            padding:6px 8px;cursor:pointer;overflow:hidden;box-sizing:border-box;z-index:5;
            transition:box-shadow .15s,transform .1s"
          onmouseover="this.style.boxShadow='0 4px 12px rgba(0,0,0,.15)';this.style.transform='translateY(-1px)'"
          onmouseout="this.style.boxShadow='0 1px 4px rgba(0,0,0,.08)';this.style.transform='translateY(0)'">
          <div style="font-size:11px;font-weight:700;color:${bordaBloco};margin-bottom:2px;white-space:nowrap">
            ${icone}${horaInicio} → ${horaFim}
          </div>
          <div style="font-size:12px;font-weight:700;color:${corTexto};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${numero}
          </div>
          <div style="font-size:11px;color:${corTexto};opacity:.85;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px">
            ${cliente}
          </div>
          ${timerHtml}
          ${heightPx > 64 ? `<div style="font-size:10px;color:${corTexto};opacity:.65;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px">${descricao}</div>` : ''}
        </div>`;
    });

    html += `</div>`;
  });

  html += `</div></div></div>`;

  // ── Seção: OS sem horário definido (fixa embaixo) ──
  if (osSemHorario.length) {
    const tecnicoMap = {};
    tecnicos.forEach(t => { tecnicoMap[t.id] = t; });

    html += `<div style="flex-shrink:0;border-top:2px solid #fde68a;background:#fffbeb;padding:12px 16px;max-height:180px;overflow-y:auto">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span style="font-size:13px;font-weight:700;color:#92400e">⏰ Sem horário definido</span>
        <span style="background:#fde68a;color:#78350f;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px">${osSemHorario.length}</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">`;

    osSemHorario.forEach(o => {
      const tecnico = tecnicoMap[o.vendedor_id];
      const tIdx    = tecnicos.findIndex(t => t.id === o.vendedor_id);
      const cor     = CORES_TECNICO[tIdx % CORES_TECNICO.length];
      const cliente  = agendaEsc(o.cliente_nome || 'Avulso');
      const descricao = agendaEsc(o.descricao || '');
      const numero   = agendaEsc(o.numero);
      const tecNome  = agendaEsc(tecnico?.nome || '');

      // Estado visual por status
      let bgCard = '#fff', bordaCard = cor.borda, iconeStatus = '', labelStatus = '', labelBg = '', labelCor = '';
      if (o.status === 'em_andamento') {
        bgCard = '#fefce8'; bordaCard = '#ca8a04'; iconeStatus = '⚡ ';
        labelStatus = 'Em andamento'; labelBg = '#fde68a'; labelCor = '#78350f';
      } else if (o.status === 'reagendar') {
        bgCard = '#fdf4ff'; bordaCard = '#9333ea'; iconeStatus = '↩ ';
        labelStatus = 'Reagendar'; labelBg = '#f3e8ff'; labelCor = '#6b21a8';
      }

      const timerSemHora = o.status === 'em_andamento' && o.data_inicio_real
        ? `<div><span data-inicio-real="${o.data_inicio_real}" style="font-size:10px;font-weight:700;color:${bordaCard}">⏱ ${agendaFmtElapsed(o.data_inicio_real)}</span></div>`
        : '';

      html += `<div onclick="agendaAbrirOS(${o.id})"
        style="background:${bgCard};border:1px solid #fde68a;border-left:4px solid ${bordaCard};border-radius:0 8px 8px 0;
          padding:8px 12px;cursor:pointer;min-width:180px;max-width:240px;
          box-shadow:0 1px 3px rgba(0,0,0,.06);transition:box-shadow .15s,transform .1s"
        onmouseover="this.style.boxShadow='0 4px 12px rgba(0,0,0,.12)';this.style.transform='translateY(-1px)'"
        onmouseout="this.style.boxShadow='0 1px 3px rgba(0,0,0,.06)';this.style.transform='translateY(0)'">
        <div style="font-size:12px;font-weight:700;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${iconeStatus}${numero}</div>
        <div style="font-size:11px;color:#475569;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px">${cliente}</div>
        ${descricao ? `<div style="font-size:10px;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px">${descricao}</div>` : ''}
        ${timerSemHora}
        <div style="margin-top:5px;display:flex;align-items:center;gap:5px;flex-wrap:wrap">
          <div style="display:inline-flex;align-items:center;gap:4px;background:${cor.borda}18;border-radius:10px;padding:2px 7px">
            <div style="width:6px;height:6px;background:${cor.borda};border-radius:50%"></div>
            <span style="font-size:10px;font-weight:600;color:${cor.borda}">${tecNome}</span>
          </div>
          ${labelStatus ? `<span style="font-size:10px;font-weight:600;background:${labelBg};color:${labelCor};border-radius:10px;padding:2px 7px">${labelStatus}</span>` : ''}
        </div>
      </div>`;
    });

    html += `</div></div>`;
  }

  if (!os.length) {
    html += `<div style="padding:32px;text-align:center;color:#94a3b8;font-size:14px;border-top:1px solid #f1f5f9">
      Nenhuma OS agendada para este dia
    </div>`;
  }

  container.innerHTML = html;
}

async function agendaAbrirOS(id) {
  // Navega para ordens (cria o modal no DOM) e abre a OS
  navigateTo('ordens');
  setTimeout(() => editarOS(id), 600);
}

function agendaDia(delta) {
  const input = document.getElementById('agenda-data');
  if (!input) return;
  const d = new Date(input.value + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  input.value = d.toLocaleDateString('en-CA');
  carregarAgenda();
}
