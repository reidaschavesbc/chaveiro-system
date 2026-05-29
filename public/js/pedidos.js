// === LISTA DE PEDIDOS DE COMPRA ===

let pedidosData = [];
let pedidosSelecionando = false;
let pedidosSelecionados = new Set();

const fmtDatePedido = s => s ? s.slice(0, 10).split('-').reverse().join('/') : '—';

const PRI_CFG = {
  alta:  { label: 'Alta',  bg: '#fee2e2', color: '#dc2626', icon: '🔴' },
  media: { label: 'Média', bg: '#fef3c7', color: '#d97706', icon: '🟡' },
  baixa: { label: 'Baixa', bg: '#f0fdf4', color: '#16a34a', icon: '🟢' },
};

function badgePrioridade(pri) {
  const c = PRI_CFG[pri] || PRI_CFG.media;
  return `<span style="background:${c.bg};color:${c.color};padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600">${c.icon} ${c.label}</span>`;
}

async function pedidos(el) {
  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <select id="p-filtro-status" style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;background:#fff" onchange="pedidosCarregar()">
          <option value="">Todos</option>
          <option value="pendente" selected>Pendentes</option>
          <option value="comprado">Comprados</option>
        </select>
        <select id="p-filtro-pri" style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;background:#fff" onchange="pedidosCarregar()">
          <option value="">Todas as prioridades</option>
          <option value="alta">🔴 Alta</option>
          <option value="media">🟡 Média</option>
          <option value="baixa">🟢 Baixa</option>
        </select>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button id="btn-pedidos-selecionar" class="btn btn-secondary" onclick="pedidosToggleSelecao()">☑ Selecionar</button>
        <button id="btn-pedidos-excluir-sel" class="btn btn-danger" onclick="pedidosExcluirSelecionados()" style="display:none">🗑️ Excluir (<span id="p-sel-count">0</span>)</button>
        <button class="btn btn-secondary" onclick="pedidosVerificarEstoque()" title="Escaneia todos os produtos e adiciona os que estão com estoque baixo">
          <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;margin-right:4px"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
          Verificar Estoque
        </button>
        <button class="btn btn-secondary" onclick="pedidosDispararAlertas()" title="Envia alerta WhatsApp para todos os pedidos pendentes agora">
          📲 Disparar Alertas
        </button>
        <button class="btn btn-primary" onclick="pedidosAbrirModal()">+ Adicionar Manual</button>
      </div>
    </div>

    <div id="p-resumo" style="margin-bottom:20px"></div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">Lista de Pedidos</span>
      </div>
      <div id="p-lista"></div>
    </div>

    ${pedidosModalHtml()}
  `;

  await pedidosCarregar();
}

async function pedidosDispararAlertas() {
  const idsSelecionados = pedidosSelecionados.size > 0 ? [...pedidosSelecionados] : null;
  const alvos = idsSelecionados
    ? pedidosData.filter(p => idsSelecionados.includes(p.id) && p.status === 'pendente')
    : pedidosData.filter(p => p.status === 'pendente');

  if (!alvos.length) { toast('Nenhum pedido pendente nos selecionados', 'warning'); return; }

  let lista = [];
  try { lista = await api('GET', '/pedidos/numeros-alertas'); } catch (_) {}
  if (!lista.length) { toast('Nenhum número configurado para pedidos (veja Configurações)', 'warning'); return; }

  const numeros = await pedidosSelecionarNumeros(lista, alvos.length, !!idsSelecionados);
  if (!numeros) return;

  try {
    const res = await api('POST', '/pedidos/disparar-alertas', {
      numeros,
      ids: idsSelecionados || [],
    });
    toast(res.enviados > 0 ? `📲 ${res.enviados} alerta(s) enviado(s)!` : 'Nenhum alerta enviado', res.enviados > 0 ? 'success' : 'warning');
  } catch (e) { toast(e.message, 'error'); }
}

function pedidosSelecionarNumeros(lista, qtdPedidos, selecionados = false) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2000;display:flex;align-items:center;justify-content:center';
    const descricao = selecionados
      ? `Enviar alerta dos <strong>${qtdPedidos}</strong> pedido(s) selecionado(s) para:`
      : `Enviar alerta de <strong>todos os ${qtdPedidos}</strong> pedido(s) pendente(s) para:`;
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:28px;width:100%;max-width:420px;box-shadow:0 20px 60px rgba(0,0,0,.2)" onclick="event.stopPropagation()">
        <div style="font-size:17px;font-weight:700;margin-bottom:6px">📲 Disparar Alertas</div>
        <div style="font-size:13px;color:#64748b;margin-bottom:18px">${descricao}</div>
        <div id="pda-nums" style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px">
          ${lista.map((item, i) => `
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:10px 14px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px">
              <input type="checkbox" data-num="${item.numero}" checked style="width:16px;height:16px;cursor:pointer;accent-color:#2563eb;flex-shrink:0">
              <div>
                <div style="font-weight:600;text-transform:uppercase">${item.nome || 'Sem nome'}</div>
                <div style="color:#64748b;font-size:12px">${item.numero}</div>
              </div>
            </label>`).join('')}
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end">
          <button id="pda-cancel" class="btn btn-secondary">Cancelar</button>
          <button id="pda-ok" class="btn btn-primary">Disparar</button>
        </div>
      </div>`;

    overlay.addEventListener('click', e => { if (e.target === overlay) { document.body.removeChild(overlay); resolve(null); } });
    overlay.querySelector('#pda-cancel').addEventListener('click', () => { document.body.removeChild(overlay); resolve(null); });
    overlay.querySelector('#pda-ok').addEventListener('click', () => {
      const selecionados = [...overlay.querySelectorAll('#pda-nums input:checked')].map(el => el.dataset.num);
      document.body.removeChild(overlay);
      if (!selecionados.length) { toast('Selecione ao menos um número', 'warning'); resolve(null); return; }
      resolve(selecionados);
    });
    document.body.appendChild(overlay);
  });
}

async function pedidosVerificarEstoque() {
  try {
    const res = await api('POST', '/pedidos/verificar-estoque', {});
    if (res.adicionados > 0) {
      toast(`${res.adicionados} produto(s) com estoque baixo adicionado(s)!`);
    } else {
      toast('Nenhum produto novo com estoque baixo encontrado', 'warning');
    }
    document.getElementById('p-filtro-status').value = 'pendente';
    await pedidosCarregar();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function pedidosCarregar() {
  const status = document.getElementById('p-filtro-status')?.value || '';
  const pri    = document.getElementById('p-filtro-pri')?.value || '';
  try {
    let url = '/pedidos';
    const params = [];
    if (status) params.push(`status=${status}`);
    if (pri)    params.push(`prioridade=${pri}`);
    if (params.length) url += '?' + params.join('&');
    pedidosData = await api('GET', url);
    pedidosRenderResumo();
    pedidosRenderLista();
    atualizarBadgePedidos();
  } catch (e) {
    toast(e.message, 'error');
  }
}

function pedidosRenderResumo() {
  const el = document.getElementById('p-resumo');
  if (!el) return;
  const pendentes   = pedidosData.filter(p => p.status === 'pendente').length;
  const comprados   = pedidosData.filter(p => p.status === 'comprado').length;
  const automaticos = pedidosData.filter(p => p.origem === 'automatico' && p.status === 'pendente').length;
  const naConfirm   = pedidosData.filter(p => p.status === 'pendente' && !p.confirmado).length;

  el.innerHTML = `
    <div style="display:flex;gap:12px;flex-wrap:wrap">
      <div style="background:linear-gradient(135deg,#f59e0b,#fbbf24);border-radius:12px;padding:16px 22px;color:#fff;min-width:140px">
        <div style="font-size:11px;font-weight:600;opacity:.85;text-transform:uppercase;letter-spacing:.5px">Pendentes</div>
        <div style="font-size:28px;font-weight:800;margin-top:4px">${pendentes}</div>
      </div>
      <div style="background:linear-gradient(135deg,#10b981,#34d399);border-radius:12px;padding:16px 22px;color:#fff;min-width:140px">
        <div style="font-size:11px;font-weight:600;opacity:.85;text-transform:uppercase;letter-spacing:.5px">Comprados</div>
        <div style="font-size:28px;font-weight:800;margin-top:4px">${comprados}</div>
      </div>
      ${automaticos > 0 ? `
      <div style="background:linear-gradient(135deg,#ef4444,#f87171);border-radius:12px;padding:16px 22px;color:#fff;min-width:140px">
        <div style="font-size:11px;font-weight:600;opacity:.85;text-transform:uppercase;letter-spacing:.5px">Estoque Baixo</div>
        <div style="font-size:28px;font-weight:800;margin-top:4px">${automaticos}</div>
      </div>` : ''}
      ${naConfirm > 0 ? `
      <div style="background:linear-gradient(135deg,#7c3aed,#a78bfa);border-radius:12px;padding:16px 22px;color:#fff;min-width:140px">
        <div style="font-size:11px;font-weight:600;opacity:.85;text-transform:uppercase;letter-spacing:.5px">Não Confirmados</div>
        <div style="font-size:28px;font-weight:800;margin-top:4px">${naConfirm}</div>
      </div>` : ''}
    </div>`;
}

function pedidosRenderLista() {
  const el = document.getElementById('p-lista');
  if (!el) return;

  if (!pedidosData.length) {
    el.innerHTML = `<div style="text-align:center;padding:40px;color:#94a3b8;font-size:13px">Nenhum pedido encontrado.</div>`;
    return;
  }

  el.innerHTML = `
    <table>
      <thead>
        <tr>
          ${pedidosSelecionando ? `<th style="width:36px;text-align:center"><input type="checkbox" id="p-sel-todos" onchange="pedidosToggleTodos(this.checked)" style="cursor:pointer;width:15px;height:15px"></th>` : ''}
          <th>Produto / Item</th>
          <th style="width:70px;text-align:center">Qtd</th>
          <th style="width:95px;text-align:center">Prioridade</th>
          <th style="width:85px;text-align:center">Origem</th>
          <th style="width:85px;text-align:center">Status</th>
          <th style="width:90px">Data</th>
          ${pedidosSelecionando ? '' : '<th style="width:170px"></th>'}
        </tr>
      </thead>
      <tbody>
        ${pedidosData.map(p => `
          <tr style="cursor:${pedidosSelecionando ? 'pointer' : 'default'};${pedidosSelecionados.has(p.id) ? 'background:#eff6ff;' : ''}${p.status === 'comprado' ? 'opacity:.55' : ''}${p.status === 'pendente' && !p.confirmado && !pedidosSelecionando ? ';border-left:3px solid ' + (PRI_CFG[p.prioridade]||PRI_CFG.media).color : ''}"
            ${pedidosSelecionando ? `onclick="pedidosToggleItem(${p.id})"` : ''}>
            ${pedidosSelecionando ? `<td style="text-align:center" onclick="event.stopPropagation()"><input type="checkbox" data-id="${p.id}" ${pedidosSelecionados.has(p.id) ? 'checked' : ''} onchange="pedidosToggleItem(${p.id})" style="cursor:pointer;width:15px;height:15px"></td>` : ''}
            <td>
              <div style="font-weight:600;font-size:13px">${p.descricao}</div>
              ${p.produto_nome && p.produto_nome !== p.descricao
                ? `<div style="font-size:11px;color:#94a3b8">${p.produto_nome}</div>` : ''}
              ${p.produto_estoque !== null && p.produto_estoque !== undefined
                ? `<div style="font-size:11px;color:${p.produto_estoque <= p.produto_estoque_minimo ? '#ef4444' : '#94a3b8'}">Estoque: ${p.produto_estoque} / mín: ${p.produto_estoque_minimo}</div>` : ''}
              ${p.observacoes ? `<div style="font-size:11px;color:#94a3b8">${p.observacoes}</div>` : ''}
              ${p.alertas_ativos ? `<div style="font-size:10px;color:#2563eb;margin-top:2px">🔔 Alertas ativos no WhatsApp</div>` : ''}
              ${p.confirmado ? `<div style="font-size:10px;color:#16a34a;margin-top:2px">✔ Aviso confirmado ${p.confirmado_em ? fmtDatePedido(p.confirmado_em) : ''}</div>` : ''}
              ${p.silenciado_ate && !p.confirmado ? `<div style="font-size:10px;color:#ea580c;margin-top:2px">🔕 Silenciado até amanhã às 9h</div>` : ''}
            </td>
            <td style="text-align:center;font-weight:700">${p.quantidade}</td>
            <td style="text-align:center">${badgePrioridade(p.prioridade)}</td>
            <td style="text-align:center">
              ${p.origem === 'automatico'
                ? `<span style="background:#fee2e2;color:#dc2626;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600">Auto</span>`
                : `<span style="background:#f1f5f9;color:#475569;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600">Manual</span>`}
            </td>
            <td style="text-align:center">
              ${p.status === 'pendente'
                ? `<span style="background:#fef3c7;color:#d97706;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600">Pendente</span>`
                : `<span style="background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600">Comprado</span>`}
            </td>
            <td style="font-size:12px;color:#64748b">${fmtDatePedido(p.criado_em)}</td>
            ${!pedidosSelecionando ? `<td>
              <div style="display:flex;gap:4px;justify-content:flex-end;align-items:center;white-space:nowrap">
                ${p.status === 'pendente' ? `
                  <button title="Marcar como comprado" onclick="pedidosMarcarComprado(${p.id})"
                    style="padding:4px 9px;border:none;border-radius:6px;background:#d1fae5;color:#065f46;font-size:11px;font-weight:600;cursor:pointer">✔ Confirmar</button>
                  <button title="Silenciar até amanhã 9h" onclick="pedidosSilenciar(${p.id})"
                    style="padding:4px 7px;border:none;border-radius:6px;background:${p.silenciado_ate ? '#f1f5f9' : '#fff7ed'};color:${p.silenciado_ate ? '#94a3b8' : '#ea580c'};font-size:13px;cursor:pointer">🔕</button>
                ` : `
                  <button onclick="pedidosReabrirPendente(${p.id})"
                    style="padding:4px 9px;border:1px solid #e2e8f0;border-radius:6px;background:#f8fafc;color:#475569;font-size:11px;cursor:pointer">Reabrir</button>
                `}
                <button title="Editar" onclick="pedidosEditar(${p.id})"
                  style="padding:4px 7px;border:1px solid #e2e8f0;border-radius:6px;background:#f8fafc;font-size:13px;cursor:pointer">✏️</button>
                <button title="Excluir" onclick="pedidosExcluir(${p.id})"
                  style="padding:4px 7px;border:none;border-radius:6px;background:#fee2e2;color:#dc2626;font-size:13px;cursor:pointer">🗑️</button>
              </div>
            </td>` : ''}
          </tr>`).join('')}
      </tbody>
    </table>`;
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function pedidosModalHtml() {
  return `
    <div id="p-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;align-items:center;justify-content:center" onclick="if(event.target===this)pedidosFecharModal()">
      <div style="background:#fff;border-radius:16px;padding:28px;width:100%;max-width:460px;box-shadow:0 20px 60px rgba(0,0,0,.2)" onclick="event.stopPropagation()">
        <div style="font-size:17px;font-weight:700;margin-bottom:20px" id="p-modal-titulo">Adicionar Pedido</div>
        <input type="hidden" id="p-id">
        <div class="form-grid">
          <div class="form-group form-full">
            <label>Item / Produto *</label>
            <input type="text" id="p-descricao">
          </div>
          <div class="form-group">
            <label>Quantidade</label>
            <input type="number" id="p-quantidade" min="1" value="1">
          </div>
          <div class="form-group">
            <label>Prioridade</label>
            <select id="p-prioridade" style="padding:8px 12px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px;background:#fff;width:100%">
              <option value="alta">🔴 Alta — aviso a cada 1h</option>
              <option value="media" selected>🟡 Média — aviso a cada 3h</option>
              <option value="baixa">🟢 Baixa — aviso 1x por dia (9h)</option>
            </select>
          </div>
          <div class="form-group form-full">
            <label>Observações</label>
            <input type="text" id="p-obs">
          </div>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px">
          <button class="btn btn-secondary" onclick="pedidosFecharModal()">Cancelar</button>
          <button class="btn btn-primary" onclick="pedidosSalvar()">Adicionar</button>
        </div>
      </div>
    </div>`;
}

function pedidosAbrirModal() {
  document.getElementById('p-id').value = '';
  document.getElementById('p-modal-titulo').textContent = 'Adicionar Pedido';
  document.getElementById('p-descricao').value = '';
  document.getElementById('p-descricao').readOnly = false;
  document.getElementById('p-quantidade').value = '1';
  document.getElementById('p-prioridade').value = 'media';
  document.getElementById('p-obs').value = '';
  document.getElementById('p-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('p-descricao').focus(), 80);
}

function pedidosEditar(id) {
  const p = pedidosData.find(x => x.id === id);
  if (!p) return;
  document.getElementById('p-id').value = p.id;
  document.getElementById('p-modal-titulo').textContent = 'Editar Pedido';
  document.getElementById('p-descricao').value = p.descricao;
  document.getElementById('p-descricao').readOnly = false;
  document.getElementById('p-quantidade').value = p.quantidade;
  document.getElementById('p-prioridade').value = p.prioridade || 'media';
  document.getElementById('p-obs').value = p.observacoes || '';
  document.getElementById('p-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('p-quantidade').focus(), 80);
}

function pedidosFecharModal() {
  document.getElementById('p-modal').style.display = 'none';
}

async function pedidosSalvar() {
  const id         = document.getElementById('p-id').value;
  const descricao  = document.getElementById('p-descricao').value.trim();
  const quantidade = parseInt(document.getElementById('p-quantidade').value) || 1;
  const prioridade = document.getElementById('p-prioridade').value;
  const observacoes = document.getElementById('p-obs').value.trim();

  if (!descricao) { toast('Informe o item a comprar', 'warning'); return; }

  try {
    if (id) {
      await api('PUT', `/pedidos/${id}`, { descricao, quantidade, observacoes: observacoes || null, prioridade });
      toast('Pedido atualizado!');
    } else {
      await api('POST', '/pedidos', { descricao, quantidade, observacoes: observacoes || null, prioridade });
      toast('Pedido adicionado! Aviso WhatsApp enviado.');
    }
    pedidosFecharModal();
    document.getElementById('p-filtro-status').value = 'pendente';
    await pedidosCarregar();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function pedidosConfirmar(id) {
  try {
    await api('PUT', `/pedidos/${id}/confirmar`, {});
    toast('Aviso confirmado — lembretes pausados', 'info');
    await pedidosCarregar();
  } catch (e) { toast(e.message, 'error'); }
}

async function pedidosSilenciar(id) {
  const p = pedidosData.find(x => x.id === id);
  const ok = await modalConfirmar({
    titulo: 'Silenciar Pedido',
    mensagem: `Silenciar avisos de <strong>${p ? p.descricao : 'este pedido'}</strong> até amanhã às 9h?`,
    icone: '🔕',
    corBotao: '#ea580c',
    textoBotao: 'Silenciar'
  });
  if (!ok) return;
  try {
    await api('PUT', `/pedidos/${id}/silenciar`, {});
    toast('🔕 Silenciado até amanhã às 9h', 'info');
    await pedidosCarregar();
  } catch (e) { toast(e.message, 'error'); }
}

async function pedidosMarcarComprado(id) {
  const p = pedidosData.find(x => x.id === id);
  const ok = await modalConfirmar({
    titulo: 'Confirmar Compra',
    mensagem: `Marcar <strong>${p ? p.descricao : 'este item'}</strong> como comprado?`,
    icone: '✔',
    corBotao: '#16a34a',
    textoBotao: 'Confirmar'
  });
  if (!ok) return;
  try {
    await api('PUT', `/pedidos/${id}`, { status: 'comprado' });
    toast('Marcado como comprado!');
    await pedidosCarregar();
  } catch (e) { toast(e.message, 'error'); }
}

async function pedidosReabrirPendente(id) {
  try {
    await api('PUT', `/pedidos/${id}`, { status: 'pendente' });
    toast('Pedido reaberto');
    await pedidosCarregar();
  } catch (e) { toast(e.message, 'error'); }
}

async function pedidosExcluir(id) {
  if (!await pedirSenhaGerente()) return;
  if (!await modalConfirmar({ titulo: 'Remover Pedido', mensagem: 'Deseja remover este pedido da lista?', icone: '🗑️', corBotao: '#dc2626', textoBotao: 'Remover' })) return;
  try {
    await api('DELETE', `/pedidos/${id}`);
    toast('Pedido removido');
    await pedidosCarregar();
  } catch (e) { toast(e.message, 'error'); }
}

function pedidosToggleSelecao() {
  pedidosSelecionando = !pedidosSelecionando;
  pedidosSelecionados.clear();
  const btnSel = document.getElementById('btn-pedidos-selecionar');
  const btnExc = document.getElementById('btn-pedidos-excluir-sel');
  if (btnSel) btnSel.textContent = pedidosSelecionando ? '✕ Cancelar' : '☑ Selecionar';
  if (btnExc) btnExc.style.display = 'none';
  pedidosRenderLista();
}

function pedidosToggleTodos(checked) {
  if (checked) {
    pedidosData.forEach(p => pedidosSelecionados.add(p.id));
  } else {
    pedidosSelecionados.clear();
  }
  pedidosAtualizarContador();
  pedidosRenderLista();
  if (checked) {
    const chk = document.getElementById('p-sel-todos');
    if (chk) chk.checked = true;
  }
}

function pedidosToggleItem(id) {
  if (pedidosSelecionados.has(id)) {
    pedidosSelecionados.delete(id);
  } else {
    pedidosSelecionados.add(id);
  }
  pedidosAtualizarContador();
  pedidosRenderLista();
  const todosChk = document.getElementById('p-sel-todos');
  if (todosChk) todosChk.checked = pedidosSelecionados.size === pedidosData.length;
}

function pedidosAtualizarContador() {
  const count = document.getElementById('p-sel-count');
  const btnExc = document.getElementById('btn-pedidos-excluir-sel');
  if (count) count.textContent = pedidosSelecionados.size;
  if (btnExc) btnExc.style.display = pedidosSelecionados.size > 0 ? 'inline-flex' : 'none';
}

async function pedidosExcluirSelecionados() {
  if (!pedidosSelecionados.size) return;
  if (!await pedirSenhaGerente()) return;
  const ok = await modalConfirmar({
    titulo: 'Excluir Pedidos',
    mensagem: `Excluir <strong>${pedidosSelecionados.size} pedido(s)</strong> selecionado(s)? Esta ação não pode ser desfeita.`,
    icone: '🗑️',
    corBotao: '#dc2626',
    textoBotao: 'Excluir'
  });
  if (!ok) return;
  try {
    await api('DELETE', '/pedidos', { ids: [...pedidosSelecionados] });
    const total = pedidosSelecionados.size;
    pedidosSelecionando = false;
    pedidosSelecionados.clear();
    const btnSel = document.getElementById('btn-pedidos-selecionar');
    if (btnSel) btnSel.textContent = '☑ Selecionar';
    pedidosAtualizarContador();
    toast(`${total} pedido(s) removido(s)`);
    await pedidosCarregar();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// Badge sidebar — chamada pelo app.js e pelo pedidosCarregar
async function atualizarBadgePedidos() {
  try {
    const r = await api('GET', '/pedidos/count');
    const badge = document.getElementById('badge-pedidos');
    if (!badge) return;
    if (r && r.total > 0) {
      badge.textContent = r.total;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  } catch (_) {}
}
