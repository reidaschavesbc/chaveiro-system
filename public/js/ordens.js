let ordensData = [];
let clientesForOS = [];
let servicosForOS = [];
let produtosForOS = [];
let vendedoresForOS = [];
let osItens = [];
let osServicoSelecionado = null;
let osProdutoSelecionado = null;
let _osDropdown = null;

async function ordens(el) {
  [clientesForOS, servicosForOS, produtosForOS, vendedoresForOS] = await Promise.all([
    api('GET', '/clientes'),
    api('GET', '/servicos'),
    api('GET', '/produtos'),
    api('GET', '/vendedores?tecnico=1')
  ]);

  const clienteOptions = clientesForOS.map(c => `<option value="${c.id}" data-rua="${c.endereco||''}" data-numero="${c.numero||''}" data-complemento="${c.complemento||''}" data-cidade="${c.cidade||''}" data-ref="${c.referencia||''}">${c.nome_fantasia || c.nome}</option>`).join('');
  const vendedorOptions = vendedoresForOS.map(v => `<option value="${v.id}">${v.nome}</option>`).join('');

  el.innerHTML = `
  <div class="card">
    <div class="card-header">
      <span class="card-title">Ordens de Serviço</span>
      <div class="flex gap-2 align-center" style="flex-wrap:wrap">
        <select id="filtro-status-os" onchange="carregarOrdens()" class="select-custom">
          <option value="">Todos os status</option>
          <option value="aberta">Aberta</option>
          <option value="em_andamento">Em Andamento</option>
          <option value="reagendar">Reagendar</option>
          <option value="concluida">Concluída</option>
          <option value="cancelada">Cancelada</option>
          <option value="a_receber">Cobranças (pendente)</option>
        </select>
        <input type="date" id="filtro-data-inicio" onchange="carregarOrdens()" title="Data início" style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;color:#334155">
        <input type="date" id="filtro-data-fim" onchange="carregarOrdens()" title="Data fim" style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;color:#334155">
        <button onclick="limparFiltrosOS()" title="Limpar datas" style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;background:#f8fafc;color:#64748b;cursor:pointer">✕</button>
        <div class="search-box">
          <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          <input type="text" id="search-os" oninput="filtrarOS()">
        </div>
        <button class="btn btn-primary" onclick="abrirModalOS()">
          <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
          Nova OS
        </button>
      </div>
    </div>
    <div id="tabela-os"></div>
  </div>

  <div class="modal-overlay" id="modal-os">
    <div class="modal modal-lg">
      <div class="modal-header">
        <span class="modal-title" id="modal-os-title">Nova Ordem de Serviço</span>
        <button class="modal-close" onclick="closeModal('modal-os')">&times;</button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="os-id">
        <div class="form-grid">
          <div class="form-group">
            <label>Cliente</label>
            <select id="os-cliente" onchange="toggleClienteAvulso('os');carregarAutorizadosOS()"><option value="">-- Sem cliente --</option>${clienteOptions}</select>
            <input type="text" id="os-cliente-avulso" style="margin-top:6px">
            <div id="os-solicitado-wrap" style="display:none;margin-top:6px">
              <select id="os-solicitado-por" style="width:100%">
                <option value="">-- Solicitado por (opcional) --</option>
              </select>
            </div>
            <div id="os-avulso-endereco" style="margin-top:8px;padding:10px;background:#f8f9fa;border-radius:6px;border:1px solid #e5e7eb">
              <div style="font-size:11px;font-weight:600;color:#6b7280;margin-bottom:8px;text-transform:uppercase;letter-spacing:.4px">Endereço do Cliente</div>
              <div style="display:flex;gap:6px;margin-bottom:6px">
                <input type="text" id="os-avulso-rua" style="flex:1" placeholder="Rua / Av.">
                <input type="text" id="os-avulso-numero" style="width:68px" placeholder="Nº">
              </div>
              <div style="display:flex;gap:6px;margin-bottom:6px">
                <input type="text" id="os-avulso-complemento" style="flex:1" placeholder="Complemento (ap, bloco...)">
                <input type="text" id="os-avulso-cidade" style="flex:1" placeholder="Cidade">
              </div>
              <input type="text" id="os-avulso-referencia" style="width:100%;box-sizing:border-box" placeholder="Referência (perto de, cor da casa...)">
            </div>
            <input type="text" id="os-contato-cliente" style="margin-top:8px" placeholder="📞 Contato desta OS (tel/WhatsApp — opcional)">
          </div>
          <div class="form-group">
            <label>Funcionário / Técnico</label>
            <select id="os-vendedor">
              <option value="">-- Selecione --</option>${vendedorOptions}
            </select>
          </div>
          <div class="form-group form-full">
            <label>Descrição do Problema / Serviço</label>
            <textarea id="os-descricao"></textarea>
          </div>
          <div class="form-group">
            <label>Valor (R$)</label>
            <input type="number" id="os-valor" step="0.01" min="0" value="0">
          </div>
          <div class="form-group">
            <label>Status</label>
            <select id="os-status">
              <option value="aberta">Aberta</option>
              <option value="em_andamento">Em Andamento</option>
              <option value="reagendar">Reagendar</option>
              <option value="concluida">Concluída</option>
              <option value="cancelada">Cancelada</option>
            </select>
          </div>
          <div class="form-group">
            <label>Data/Hora Prevista</label>
            <div style="display:flex;gap:8px">
              <input type="date" id="os-data-prevista-data" style="flex:1">
              <input type="time" id="os-data-prevista-hora" style="width:120px">
            </div>
          </div>
          <div class="form-group">
            <label>Forma de Pagamento</label>
            <select id="os-pagamento">
              <option value="">-- A definir --</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="pix">PIX</option>
              <option value="debito">Cartão Débito</option>
              <option value="credito">Cartão Crédito</option>
            </select>
          </div>
          <div class="form-group form-full">
            <label>Observações</label>
            <textarea id="os-obs" style="min-height:60px"></textarea>
          </div>
          <div class="form-group form-full">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none">
              <input type="checkbox" id="os-a-receber" onchange="toggleVencimento()">
              <span style="font-weight:600;color:#dc2626">💰 Cobrança</span>
            </label>
            <div id="os-vencimento-wrap" style="display:none;margin-top:10px;padding:10px 14px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px">
              <label style="font-size:12px;font-weight:600;color:#991b1b;margin-bottom:6px;display:block">Data de Vencimento</label>
              <input type="date" id="os-data-vencimento" style="max-width:200px">
              <p style="font-size:11px;color:#b91c1c;margin:6px 0 0">Se não preenchida, usará a data prevista da OS.</p>
            </div>
          </div>

          <div class="form-group form-full" style="display:flex;gap:24px;flex-wrap:wrap">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none">
              <input type="checkbox" id="os-chave-auto" onchange="toggleChaveAuto()">
              <span style="font-weight:600">🔑 Chave Auto</span>
            </label>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none">
              <input type="checkbox" id="os-plantao" onchange="togglePlantao()">
              <span style="font-weight:600;color:#7c3aed">🌙 Plantão</span>
            </label>
          </div>

          <div class="form-full divider" id="os-secao-divider"></div>

          <div class="form-full" id="os-secao-itens">
            <label style="font-weight:700;margin-bottom:12px;display:block">Itens da OS <span style="color:#dc2626;font-size:12px;font-weight:400">(pelo menos 1 serviço ou produto obrigatório)</span></label>
            <div class="tabs" id="tabs-os-tipo">
              <button class="tab active" onclick="setTabOS('servico', this)">+ Serviço</button>
              <button class="tab" onclick="setTabOS('produto', this)">+ Produto</button>
            </div>

            <div id="tab-os-servico">
              <div class="form-grid">
                <div class="form-group form-full">
                  <input type="text" id="os-item-servico-busca" placeholder="🔍 Buscar serviço..." autocomplete="off"
                         oninput="filtrarItensOS('servico')" onfocus="filtrarItensOS('servico')" onblur="fecharListaOS()"
                         style="width:100%;padding:9px 14px;border:2px solid #e5e7eb;border-radius:10px;font-size:14px;box-sizing:border-box">
                </div>
                <div class="form-group">
                  <input type="number" id="os-item-servico-qtd" min="1" value="1">
                </div>
                <div class="form-group">
                  <input type="number" id="os-item-servico-preco" step="0.01" min="0" value="0">
                </div>
              </div>
              <button class="btn btn-secondary btn-sm" style="margin-top:8px" onclick="adicionarItemOS('servico')">Adicionar Serviço</button>
            </div>

            <div id="tab-os-produto" style="display:none">
              <div class="form-grid">
                <div class="form-group form-full">
                  <input type="text" id="os-item-produto-busca" placeholder="🔍 Buscar produto..." autocomplete="off"
                         oninput="filtrarItensOS('produto')" onfocus="filtrarItensOS('produto')" onblur="fecharListaOS()"
                         style="width:100%;padding:9px 14px;border:2px solid #e5e7eb;border-radius:10px;font-size:14px;box-sizing:border-box">
                </div>
                <div class="form-group">
                  <input type="number" id="os-item-produto-qtd" min="1" value="1">
                </div>
                <div class="form-group">
                  <input type="number" id="os-item-produto-preco" step="0.01" min="0" value="0">
                </div>
              </div>
              <button class="btn btn-secondary btn-sm" style="margin-top:8px" onclick="adicionarItemOS('produto')">Adicionar Produto</button>
            </div>

            <div id="lista-itens-os" style="margin-top:16px"></div>
          </div><!-- /os-secao-itens -->
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('modal-os')">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarOS()">Salvar OS</button>
      </div>
    </div>
  </div>`;

  await carregarOrdens();

  if (window._orcamentoPendente) {
    const orc = window._orcamentoPendente;
    window._orcamentoPendente = null;
    setTimeout(() => _preencherOSFromOrcamento(orc), 80);
  }
}

async function carregarOrdens() {
  const status     = document.getElementById('filtro-status-os')?.value || '';
  const dataInicio = document.getElementById('filtro-data-inicio')?.value || '';
  const dataFim    = document.getElementById('filtro-data-fim')?.value || '';
  const params = new URLSearchParams();
  if (status === 'a_receber') params.set('a_receber', '1');
  else if (status) params.set('status', status);
  if (dataInicio) params.set('data_inicio', dataInicio);
  if (dataFim)    params.set('data_fim', dataFim);
  const qs = params.toString() ? '?' + params.toString() : '';
  ordensData = await api('GET', `/ordens${qs}`);
  renderOrdens(ordensData);
}

function limparFiltrosOS() {
  document.getElementById('filtro-data-inicio').value = '';
  document.getElementById('filtro-data-fim').value = '';
  carregarOrdens();
}

function renderOrdens(list) {
  const el = document.getElementById('tabela-os');
  if (!list.length) { el.innerHTML = '<div class="empty-state"><h3>Nenhuma ordem encontrada</h3></div>'; return; }
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const isMobile = window.innerWidth <= 768;

  if (isMobile) {
    el.innerHTML = list.map(o => {
      const vencido = o.a_receber && !o.a_receber_pago && o.data_vencimento && new Date(o.data_vencimento) < hoje;
      const cfg = OS_STATUS_CFG[o.status] || OS_STATUS_CFG.aberta;
      const badgeAR = o.a_receber && !o.a_receber_pago
        ? `<span style="font-size:10px;font-weight:700;color:${vencido?'#dc2626':'#d97706'};background:${vencido?'#fee2e2':'#fef3c7'};padding:2px 7px;border-radius:4px">${vencido?'⚠ VENCIDO':'⏳ COBRANÇA'}${o.data_vencimento?' '+formatDate(o.data_vencimento):''}</span>`
        : (o.a_receber && o.a_receber_pago ? `<span style="font-size:10px;color:#16a34a;background:#f0fdf4;padding:2px 7px;border-radius:4px">✔ RECEBIDO</span>` : '');
      return `
      <div class="os-card${vencido?' os-card-vencido':''}">
        <div class="os-card-top">
          <div class="os-card-num">
            <strong>${o.numero}</strong>
            <span style="font-size:11px;font-weight:600;color:${cfg.color};background:${cfg.bg};padding:2px 8px;border-radius:10px;margin-left:6px">${cfg.label}</span>
            ${o.status === 'em_andamento' && o.vendedor_nome ? `<span style="font-size:10px;color:#1e40af;background:#dbeafe;padding:2px 7px;border-radius:4px;font-weight:600;margin-left:4px">👷 ${o.vendedor_nome}</span>` : ''}
          </div>
          <div class="os-card-valor">${formatCurrency(o.valor)}</div>
        </div>
        <div class="os-card-cliente">${o.cliente_nome || o.cliente_nome_avulso || '—'}${o.solicitado_por?` <span style="color:#94a3b8;font-size:11px">por ${o.solicitado_por}</span>`:''}</div>
        <div class="os-card-desc">${o.descricao || '—'}</div>
        <div class="os-card-bottom">
          <span style="font-size:11px;color:#94a3b8">${formatDate(o.data_entrada)}</span>
          <div style="display:flex;gap:6px;align-items:center">
            ${badgeAR}
            ${o.a_receber && !o.a_receber_pago ? `<button class="btn btn-sm" style="background:#16a34a;color:white;padding:5px 10px;font-size:12px" onclick="receberOS(${o.id},'${o.numero}',${o.valor})">✔ Receber</button>` : ''}
            <button class="btn btn-sm btn-secondary btn-icon" title="Editar" onclick="editarOS(${o.id})"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button>
            <button class="btn btn-sm btn-danger btn-icon" title="Excluir" onclick="excluirOS(${o.id},'${o.numero}','${o.nfse_status||''}')"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>
          </div>
        </div>
      </div>`;
    }).join('');
    return;
  }

  el.innerHTML = `<table>
    <thead><tr><th>Nº OS</th><th>Cliente</th><th>Descrição</th><th>Data</th><th>Status</th><th>Valor</th><th style="width:240px;min-width:240px">Ações</th></tr></thead>
    <tbody>${list.map(o => {
      const vencido = o.a_receber && !o.a_receber_pago && o.data_vencimento && new Date(o.data_vencimento) < hoje;
      const rowStyle = vencido ? 'background:#fff5f5' : '';
      const badgeAR = o.a_receber && !o.a_receber_pago
        ? `<br><span style="font-size:10px;font-weight:700;color:${vencido?'#dc2626':'#d97706'};background:${vencido?'#fee2e2':'#fef3c7'};padding:1px 6px;border-radius:4px">${vencido?'⚠ VENCIDO':'⏳ COBRANÇA'}${o.data_vencimento?' '+formatDate(o.data_vencimento):''}</span>`
        : (o.a_receber && o.a_receber_pago ? `<br><span style="font-size:10px;color:#16a34a;background:#f0fdf4;padding:1px 6px;border-radius:4px">✔ RECEBIDO</span>` : '');
      return `
      <tr style="${rowStyle}">
        <td><strong>${o.numero}</strong>${badgeAR}</td>
        <td>${o.cliente_nome || o.cliente_nome_avulso || '<span class="text-muted">????</span>'}${o.solicitado_por?`<br><span style="font-size:11px;color:#64748b">por ${o.solicitado_por}</span>`:''}</td>
        <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${o.descricao}">${o.descricao}</td>
        <td>${formatDate(o.data_entrada)}</td>
        <td>${osStatusSelect(o.id, o.status)}${o.status === 'em_andamento' && o.vendedor_nome ? `<br><span style="font-size:10px;color:#1e40af;background:#dbeafe;padding:1px 7px;border-radius:4px;font-weight:600">👷 ${o.vendedor_nome}</span>` : ''}</td>
        <td class="currency">${formatCurrency(o.valor)}</td>
        <td><div class="actions-cell" style="flex-wrap:nowrap;align-items:center">
          <button class="btn btn-sm btn-secondary" onclick="abrirPDF(${o.id})" title="Gerar PDF"><svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:currentColor"><path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V7H15c.83 0 1.5.67 1.5 1.5v3zm4-3H19v1h1.5V11H19v2h-1.5V7h3v1.5zM9 9.5h1v-1H9v1zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm10 5.5h1v-3h-1v3z"/></svg></button>
          <button class="btn btn-sm btn-secondary btn-icon" title="Editar" onclick="editarOS(${o.id})"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button>
          ${o.a_receber && !o.a_receber_pago ? `<button class="btn btn-sm" style="background:#16a34a;color:white;padding:5px 8px;font-size:11px;white-space:nowrap" title="Marcar como Recebido" onclick="receberOS(${o.id},'${o.numero}',${o.valor})">✔ Receber</button>` : ''}
          ${o.status === 'concluida' ? (o.nfse_numero ? `<button class="btn btn-sm" style="background:#0ea5e9;color:white;padding:5px 8px;font-size:11px;white-space:nowrap" title="NFS-e emitida: ${o.nfse_numero}" onclick="verNfse(${o.id},'${o.nfse_chave_acesso}')">📄 NF ${o.nfse_numero}</button><button class="btn btn-sm" style="background:#25d366;color:white;padding:5px 8px;font-size:11px;white-space:nowrap" title="Enviar NF via WhatsApp" onclick="enviarNfseWhatsapp(${o.id})">📱 NF WA</button>` : `<button class="btn btn-sm" style="background:#7c3aed;color:white;padding:5px 8px;font-size:11px;white-space:nowrap" title="Emitir NFS-e" onclick="emitirNfse(${o.id},'${o.numero}')">📄 NFS-e</button>`) : ''}
          ${o.status !== 'cancelada' ? `<button class="btn btn-sm btn-danger btn-icon" title="Cancelar" onclick="cancelarOS(${o.id})"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z"/></svg></button>` : ''}
          <button class="btn btn-sm btn-danger btn-icon" title="Excluir permanentemente" onclick="excluirOS(${o.id},'${o.numero}','${o.nfse_status||''}')"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>
        </div></td>
      </tr>`;
    }).join('')}
    </tbody>
  </table>`;
}

function filtrarOS() {
  const q = document.getElementById('search-os').value.toLowerCase();
  renderOrdens(ordensData.filter(o => o.numero.toLowerCase().includes(q) || (o.cliente_nome || '').toLowerCase().includes(q) || (o.descricao || '').toLowerCase().includes(q)));
}

async function abrirPDF(id) {
  try {
    const r = await fetch(`/api/pdf/os/${id}`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!r.ok) { alert('Erro ao gerar PDF'); return; }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  } catch { alert('Erro ao gerar PDF'); }
}

const OS_STATUS_CFG = {
  aberta:       { bg: '#fef3c7', color: '#92400e', label: 'Aberta' },
  em_andamento: { bg: '#dbeafe', color: '#1e40af', label: 'Em Andamento' },
  reagendar:    { bg: '#f3e8ff', color: '#6b21a8', label: 'Reagendar' },
  concluida:    { bg: '#d1fae5', color: '#065f46', label: 'Concluída' },
  cancelada:    { bg: '#fee2e2', color: '#991b1b', label: 'Cancelada' },
};

function osStatusSelect(id, status) {
  const cfg = OS_STATUS_CFG[status] || OS_STATUS_CFG.aberta;
  const opts = Object.entries(OS_STATUS_CFG).map(([v, c]) =>
    `<option value="${v}" ${v === status ? 'selected' : ''}>${c.label}</option>`
  ).join('');
  return `<select
    data-id="${id}" data-original="${status}"
    onchange="mudarStatusOS(this)"
    style="border:none;border-radius:20px;padding:3px 22px 3px 10px;font-size:11px;font-weight:600;cursor:pointer;background:${cfg.bg};color:${cfg.color};outline:none;appearance:none;-webkit-appearance:none;background-image:url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 10 6%22><path fill=%22${encodeURIComponent(cfg.color)}%22 d=%22M0 0l5 6 5-6z%22/></svg>');background-repeat:no-repeat;background-position:right 7px center;background-size:7px"
  >${opts}</select>`;
}

function osAtualizarEstiloSelect(sel, status) {
  const cfg = OS_STATUS_CFG[status] || OS_STATUS_CFG.aberta;
  sel.style.background = cfg.bg;
  sel.style.color = cfg.color;
  sel.style.backgroundImage = `url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 10 6%22><path fill=%22${encodeURIComponent(cfg.color)}%22 d=%22M0 0l5 6 5-6z%22/></svg>')`;
  sel.style.backgroundRepeat = 'no-repeat';
  sel.style.backgroundPosition = 'right 7px center';
  sel.style.backgroundSize = '7px';
}

// ── Modal multi-pagamento OS ──────────────────────────────────────────────────
let _pgResolve = null, _pgPagamentos = [], _pgTotal = 0, _pgMetodo = null;

function osMiniModalPagamento(valorTotal) {
  _pgTotal = valorTotal || 0;
  _pgPagamentos = [];
  _pgMetodo = null;
  return new Promise(resolve => {
    _pgResolve = resolve;
    const el = document.createElement('div');
    el.id = 'pg-modal-overlay';
    el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center';
    el.addEventListener('click', () => _pgFechar('cancelar'));
    document.body.appendChild(el);
    _pgRender();
  });
}

function _pgRender() {
  const el = document.getElementById('pg-modal-overlay');
  if (!el) return;
  const fmtV = v => 'R$ ' + parseFloat(v||0).toFixed(2).replace('.', ',');
  const labels = { dinheiro:'💵 Dinheiro', pix:'📱 PIX', debito:'💳 Débito', credito:'💳 Crédito' };
  const pago = _pgPagamentos.reduce((s, p) => s + p.valor, 0);
  const restante = Math.max(0, _pgTotal - pago);
  const coberto = restante < 0.01;

  el.innerHTML = `
    <div style="background:#fff;border-radius:14px;padding:22px 24px;width:340px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 50px rgba(0,0,0,.2)" onclick="event.stopPropagation()">
      <div style="font-size:14px;font-weight:700;margin-bottom:4px;color:#1e293b">Forma de Pagamento</div>
      <div style="font-size:12px;color:#64748b;margin-bottom:14px">Total: <strong>${fmtV(_pgTotal)}</strong></div>

      ${_pgPagamentos.length ? `
      <div style="margin-bottom:10px">
        ${_pgPagamentos.map((p, i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;margin-bottom:4px;font-size:12px">
          <span>${labels[p.metodo]||p.metodo}: <strong>${fmtV(p.valor)}</strong></span>
          <button onclick="_pgRemover(${i})" style="background:none;border:none;cursor:pointer;color:#dc2626;font-size:14px;padding:0 2px">✕</button>
        </div>`).join('')}
        <div style="text-align:right;font-size:11px;font-weight:700;color:${coberto?'#16a34a':'#dc2626'};margin-top:4px">
          ${coberto ? '✅ Total coberto' : `Restante: ${fmtV(restante)}`}
        </div>
      </div>` : ''}

      ${!coberto ? `
      <div style="background:#f8fafc;border-radius:10px;padding:12px;margin-bottom:14px">
        <div style="font-size:11px;font-weight:600;color:#64748b;margin-bottom:8px">Adicionar pagamento</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px" id="pg-btns">
          ${Object.entries(labels).map(([v,l]) =>
            `<button onclick="_pgSelecionarMetodo('${v}',this)" data-m="${v}"
              style="padding:7px;border:2px solid #e2e8f0;border-radius:8px;cursor:pointer;font-size:11px;background:#fff;transition:border-color .1s">${l}</button>`
          ).join('')}
        </div>
        <div style="display:flex;gap:6px">
          <input type="number" id="pg-valor-inp" value="${restante.toFixed(2)}" step="0.01" min="0.01"
            style="flex:1;padding:7px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:12px">
          <button onclick="_pgAdicionar()" style="padding:7px 14px;background:#6366f1;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600">+ Add</button>
        </div>
      </div>` : ''}

      <div style="display:flex;gap:8px">
        <button onclick="_pgFechar('cancelar')" style="flex:1;padding:9px;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer;font-size:12px;color:#64748b;background:#fff">Cancelar</button>
        <button onclick="_pgFechar('ok')" ${!_pgPagamentos.length?'disabled style="opacity:.4"':''}
          style="flex:1;padding:9px;background:#6366f1;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600">Confirmar</button>
      </div>
    </div>`;

  // Restaura botão selecionado
  if (_pgMetodo) {
    const btn = el.querySelector(`[data-m="${_pgMetodo}"]`);
    if (btn) { btn.style.borderColor = '#6366f1'; btn.style.background = '#eff6ff'; }
  }
}

function _pgSelecionarMetodo(metodo, btn) {
  _pgMetodo = metodo;
  document.querySelectorAll('#pg-btns button').forEach(b => { b.style.borderColor = '#e2e8f0'; b.style.background = '#fff'; });
  btn.style.borderColor = '#6366f1'; btn.style.background = '#eff6ff';
}

function _pgAdicionar() {
  if (!_pgMetodo) { toast('Selecione a forma de pagamento', 'warning'); return; }
  const valor = parseFloat(document.getElementById('pg-valor-inp').value);
  if (!valor || valor <= 0) { toast('Informe um valor válido', 'warning'); return; }
  const pago = _pgPagamentos.reduce((s, p) => s + p.valor, 0);
  const restante = _pgTotal - pago;
  if (valor > restante + 0.01) { toast(`Valor maior que o restante (${('R$ ' + restante.toFixed(2)).replace('.',',')})`, 'warning'); return; }
  _pgPagamentos.push({ metodo: _pgMetodo, valor: parseFloat(valor.toFixed(2)) });
  _pgMetodo = null;
  _pgRender();
}

function _pgRemover(i) { _pgPagamentos.splice(i, 1); _pgRender(); }

function _pgFechar(action) {
  const el = document.getElementById('pg-modal-overlay');
  if (el) document.body.removeChild(el);
  if (!_pgResolve) return;
  if (action === 'cancelar') { _pgResolve('cancelar'); _pgResolve = null; return; }
  _pgResolve(action === 'ok' && _pgPagamentos.length ? [..._pgPagamentos] : null);
  _pgResolve = null;
}

// ── Modal pergunta de estoque ─────────────────────────────────────────────
let _estoqueResolve = null;
let _estoqueItens = [];
let _estoqueProdutos = [];
let _estoqueBusca = '';

async function osModalEstoque(osId) {
  try { _estoqueProdutos = await api('GET', '/produtos'); } catch { _estoqueProdutos = []; }
  _estoqueItens = [];
  _estoqueBusca = '';
  return new Promise(resolve => {
    _estoqueResolve = resolve;
    const el = document.createElement('div');
    el.id = 'es-modal-overlay';
    el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center';
    el.addEventListener('click', () => _esFechar(false));
    document.body.appendChild(el);
    _esRender();
  });
}

function _esRender() {
  const el = document.getElementById('es-modal-overlay');
  if (!el) return;
  const fmtV = v => 'R$ ' + parseFloat(v||0).toFixed(2).replace('.', ',');
  const prodsFiltrados = _estoqueProdutos.filter(p => p.nome.toLowerCase().includes(_estoqueBusca.toLowerCase()));
  el.innerHTML = `
    <div style="background:#fff;border-radius:14px;padding:22px 24px;width:400px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 50px rgba(0,0,0,.2)" onclick="event.stopPropagation()">
      <div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:4px">📦 Consumo de Estoque</div>
      <div style="font-size:13px;color:#64748b;margin-bottom:16px">Houve uso de materiais do estoque nesta OS?</div>

      ${_estoqueItens.length ? `
      <div style="margin-bottom:12px">
        <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Itens adicionados</div>
        ${_estoqueItens.map((it, i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;margin-bottom:6px;font-size:13px">
          <div>
            <div style="font-weight:600;color:#1e293b">${it.nome}</div>
            <div style="color:#64748b;font-size:12px">${it.quantidade} ${it.unidade || 'un'}</div>
          </div>
          <button onclick="_esRemoverItem(${i})" style="background:none;border:none;cursor:pointer;color:#dc2626;font-size:16px;padding:0 4px">✕</button>
        </div>`).join('')}
      </div>` : ''}

      <div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin-bottom:14px">
        <div style="font-size:11px;font-weight:600;color:#64748b;margin-bottom:8px">Adicionar produto</div>
        <input type="text" id="es-busca" value="${_estoqueBusca}" oninput="_esBuscar(this.value)" placeholder="Buscar produto..." style="width:100%;padding:7px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;box-sizing:border-box;margin-bottom:8px">
        <div style="max-height:150px;overflow-y:auto">
          ${prodsFiltrados.slice(0,20).map(p => `
          <div onclick="_esAbrirQtd(${p.id},'${p.nome.replace(/'/g,"\\'")}','${p.unidade||'un'}')" style="padding:8px 10px;cursor:pointer;border-radius:6px;font-size:13px;color:#1e293b;display:flex;justify-content:space-between" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background=''">
            <span>${p.nome}</span>
            <span style="color:#94a3b8;font-size:12px">${p.estoque} ${p.unidade||'un'}</span>
          </div>`).join('') || '<div style="color:#94a3b8;font-size:13px;padding:8px">Nenhum produto encontrado</div>'}
        </div>
        <div id="es-qtd-form" style="display:none;margin-top:10px;border-top:1px solid #f1f5f9;padding-top:10px">
          <div style="font-size:12px;font-weight:600;color:#64748b;margin-bottom:6px" id="es-qtd-nome"></div>
          <div style="display:flex;gap:8px">
            <input type="number" id="es-qtd-inp" value="1" min="0.01" step="0.01" style="flex:1;padding:7px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px">
            <button onclick="_esAddItem()" style="padding:7px 16px;background:#6366f1;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">+ Add</button>
          </div>
        </div>
      </div>

      <div style="display:flex;gap:8px">
        <button onclick="_esFechar(false)" style="flex:1;padding:9px;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer;font-size:13px;color:#64748b;background:#fff">Não houve</button>
        <button onclick="_esFechar(true)" style="flex:1;padding:9px;background:#6366f1;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600" ${!_estoqueItens.length?'disabled style="opacity:.4;cursor:default"':''}>Registrar</button>
      </div>
    </div>`;
}

let _esProdSel = null;
function _esAbrirQtd(id, nome, unidade) {
  _esProdSel = { id, nome, unidade };
  const form = document.getElementById('es-qtd-form');
  document.getElementById('es-qtd-nome').textContent = nome;
  if (form) form.style.display = '';
}
function _esBuscar(v) { _estoqueBusca = v; _esRender(); setTimeout(() => { const el = document.getElementById('es-busca'); if (el) { el.focus(); el.value = v; el.selectionStart = el.selectionEnd = v.length; } }, 0); }
function _esAddItem() {
  if (!_esProdSel) return;
  const qtd = parseFloat(document.getElementById('es-qtd-inp')?.value) || 0;
  if (qtd <= 0) { toast('Informe uma quantidade válida', 'warning'); return; }
  const existente = _estoqueItens.findIndex(i => i.produto_id === _esProdSel.id);
  if (existente >= 0) _estoqueItens[existente].quantidade += qtd;
  else _estoqueItens.push({ produto_id: _esProdSel.id, nome: _esProdSel.nome, unidade: _esProdSel.unidade, quantidade: qtd });
  _esProdSel = null; _estoqueBusca = '';
  _esRender();
}
function _esRemoverItem(i) { _estoqueItens.splice(i, 1); _esRender(); }

async function _esFechar(confirmar) {
  const el = document.getElementById('es-modal-overlay');
  if (el) document.body.removeChild(el);
  if (!_estoqueResolve) return;
  _estoqueResolve(confirmar && _estoqueItens.length ? [..._estoqueItens] : null);
  _estoqueResolve = null;
}

// modo: 'custo' = abate estoque + lucro | 'estoque' = abate só estoque
let _esPlantaoModo = 'custo';
async function osModalEstoquePlantao(osId, modo) {
  _esPlantaoModo = modo || 'custo';
  try { _estoqueProdutos = await api('GET', '/produtos'); } catch { _estoqueProdutos = []; }
  _estoqueItens = [];
  _estoqueBusca = '';
  return new Promise(resolve => {
    _estoqueResolve = resolve;
    const el = document.createElement('div');
    el.id = 'es-modal-overlay';
    el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center';
    document.body.appendChild(el);
    _esPlantaoRender();
  });
}

function _esPlantaoRender() {
  const el = document.getElementById('es-modal-overlay');
  if (!el) return;
  const fmtV = v => 'R$ ' + parseFloat(v||0).toFixed(2).replace('.', ',');
  const comCusto = _esPlantaoModo === 'custo';
  const cor = comCusto ? '#7c3aed' : '#475569';
  const bgItem = comCusto ? '#faf5ff' : '#f8fafc';
  const bdItem = comCusto ? '#d8b4fe' : '#cbd5e1';
  const titulo = comCusto ? '💰 Material com custo' : '📦 Retirada de estoque';
  const subtitulo = comCusto
    ? 'Material usado no plantão — abate do estoque e do lucro.'
    : 'Material retirado do estoque — sem impacto financeiro.';
  const btnLabel = comCusto ? 'Registrar com custo' : 'Registrar retirada';
  const prodsFiltrados = _estoqueProdutos.filter(p => p.nome.toLowerCase().includes(_estoqueBusca.toLowerCase()));
  el.innerHTML = `
    <div style="background:#fff;border-radius:14px;padding:22px 24px;width:420px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 50px rgba(0,0,0,.2)" onclick="event.stopPropagation()">
      <div style="font-size:15px;font-weight:700;color:${cor};margin-bottom:4px">${titulo}</div>
      <div style="font-size:13px;color:#64748b;margin-bottom:16px">${subtitulo}</div>

      ${_estoqueItens.length ? `
      <div style="margin-bottom:12px">
        <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Itens adicionados</div>
        ${_estoqueItens.map((it, i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:${bgItem};border:1px solid ${bdItem};border-radius:8px;margin-bottom:6px;font-size:13px">
          <div>
            <div style="font-weight:600;color:#1e293b">${it.nome}</div>
            <div style="color:#64748b;font-size:12px">${it.quantidade} ${it.unidade || 'un'}${comCusto ? ` · custo ${fmtV((it.preco_custo||0) * it.quantidade)}` : ''}</div>
          </div>
          <button onclick="_esPlantaoRemoverItem(${i})" style="background:none;border:none;cursor:pointer;color:#dc2626;font-size:16px;padding:0 4px">✕</button>
        </div>`).join('')}
        ${comCusto ? `<div style="text-align:right;font-size:12px;color:${cor};font-weight:600;margin-bottom:4px">
          Total custo: ${fmtV(_estoqueItens.reduce((s,it) => s + (it.preco_custo||0)*it.quantidade, 0))}
        </div>` : ''}
      </div>` : ''}

      <div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin-bottom:14px">
        <div style="font-size:11px;font-weight:600;color:#64748b;margin-bottom:8px">Adicionar produto</div>
        <input type="text" id="es-busca" value="${_estoqueBusca}" oninput="_esPlantaoBuscar(this.value)" placeholder="Buscar produto..." style="width:100%;padding:7px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;box-sizing:border-box;margin-bottom:8px">
        <div style="max-height:150px;overflow-y:auto">
          ${prodsFiltrados.slice(0,20).map(p => `
          <div onclick="_esPlantaoAbrirQtd(${p.id},'${p.nome.replace(/'/g,"\\'")}','${p.unidade||'un'}',${p.preco_custo||0})" style="padding:8px 10px;cursor:pointer;border-radius:6px;font-size:13px;color:#1e293b;display:flex;justify-content:space-between" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background=''">
            <span>${p.nome}</span>
            <span style="color:#94a3b8;font-size:12px">${p.estoque} ${p.unidade||'un'}${comCusto ? ` · ${fmtV(p.preco_custo||0)}/un` : ''}</span>
          </div>`).join('') || '<div style="color:#94a3b8;font-size:13px;padding:8px">Nenhum produto encontrado</div>'}
        </div>
        <div id="es-qtd-form" style="display:none;margin-top:10px;border-top:1px solid #f1f5f9;padding-top:10px">
          <div style="font-size:12px;font-weight:600;color:#64748b;margin-bottom:6px" id="es-qtd-nome"></div>
          <div style="display:flex;gap:8px">
            <input type="number" id="es-qtd-inp" value="1" min="0.01" step="0.01" style="flex:1;padding:7px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px">
            <button onclick="_esPlantaoAddItem()" style="padding:7px 16px;background:${cor};color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">+ Add</button>
          </div>
        </div>
      </div>

      <div style="display:flex;gap:8px">
        <button onclick="_esFechar(false)" style="flex:1;padding:9px;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer;font-size:13px;color:#64748b;background:#fff">Não houve</button>
        <button onclick="_esFechar(true)" style="flex:1;padding:9px;background:${cor};color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600" ${!_estoqueItens.length?'disabled style="opacity:.4;cursor:default;padding:9px"':''}>
          ${btnLabel}
        </button>
      </div>
    </div>`;
}

let _esPlantaoProdSel = null;
function _esPlantaoAbrirQtd(id, nome, unidade, preco_custo) {
  _esPlantaoProdSel = { id, nome, unidade, preco_custo };
  const form = document.getElementById('es-qtd-form');
  const label = _esPlantaoModo === 'custo'
    ? `${nome} · custo R$ ${parseFloat(preco_custo||0).toFixed(2).replace('.', ',')} /un`
    : nome;
  document.getElementById('es-qtd-nome').textContent = label;
  if (form) form.style.display = '';
}
function _esPlantaoBuscar(v) { _estoqueBusca = v; _esPlantaoRender(); setTimeout(() => { const el = document.getElementById('es-busca'); if (el) { el.focus(); el.value = v; el.selectionStart = el.selectionEnd = v.length; } }, 0); }
function _esPlantaoAddItem() {
  if (!_esPlantaoProdSel) return;
  const qtd = parseFloat(document.getElementById('es-qtd-inp')?.value) || 0;
  if (qtd <= 0) { toast('Informe uma quantidade válida', 'warning'); return; }
  const existente = _estoqueItens.findIndex(i => i.produto_id === _esPlantaoProdSel.id);
  if (existente >= 0) _estoqueItens[existente].quantidade += qtd;
  else _estoqueItens.push({ produto_id: _esPlantaoProdSel.id, nome: _esPlantaoProdSel.nome, unidade: _esPlantaoProdSel.unidade, preco_custo: _esPlantaoProdSel.preco_custo, quantidade: qtd });
  _esPlantaoProdSel = null; _estoqueBusca = '';
  _esPlantaoRender();
}
function _esPlantaoRemoverItem(i) { _estoqueItens.splice(i, 1); _esPlantaoRender(); }

async function mudarStatusOS(sel) {
  const id = parseInt(sel.dataset.id);
  const novoStatus = sel.value;
  const statusAnterior = sel.dataset.original;
  if (novoStatus === statusAnterior) return;

  let pagamentos = null;
  if (novoStatus === 'concluida') {
    const osData = ordensData.find(o => o.id === id);
    pagamentos = await osMiniModalPagamento(osData?.valor || 0);
    if (pagamentos === 'cancelar') { sel.value = statusAnterior; return; }
  }

  try {
    const resp = await api('PATCH', `/ordens/${id}/status`, {
      status: novoStatus,
      pagamentos: pagamentos || undefined,
      forma_pagamento: pagamentos?.length === 1 ? pagamentos[0].metodo : undefined
    });
    sel.dataset.original = novoStatus;
    osAtualizarEstiloSelect(sel, novoStatus);
    const item = ordensData.find(o => o.id === id);
    if (item) item.status = novoStatus;
    toast(`Status atualizado: ${OS_STATUS_CFG[novoStatus]?.label}`);
    const osData = ordensData.find(o => o.id === id);
    const isPlantao = osData?.is_plantao;
    if (novoStatus === 'concluida' && isPlantao) {
      // 1º: material com custo (abate estoque + lucro)
      const consumoCusto = await osModalEstoquePlantao(id, 'custo');
      if (consumoCusto) {
        try { await api('POST', `/ordens/${id}/consumo-estoque`, { itens: consumoCusto, registrar_custo: true }); toast('Material com custo registrado!'); }
        catch { toast('Erro ao registrar material', 'error'); }
      }
      // 2º: retirada de estoque sem custo financeiro
      const consumoEst = await osModalEstoquePlantao(id, 'estoque');
      if (consumoEst) {
        try { await api('POST', `/ordens/${id}/consumo-estoque`, { itens: consumoEst, registrar_custo: false }); toast('Retirada de estoque registrada!'); }
        catch { toast('Erro ao registrar retirada', 'error'); }
      }
    } else if (resp.tem_pergunta_estoque) {
      const consumo = await osModalEstoque(id);
      if (consumo) {
        try { await api('POST', `/ordens/${id}/consumo-estoque`, { itens: consumo }); toast('Consumo de estoque registrado!'); }
        catch { toast('Erro ao registrar consumo de estoque', 'error'); }
      }
    }
  } catch (e) {
    sel.value = statusAnterior;
    toast(e.message, 'error');
  }
}

function toggleClienteAvulso(prefix) {
  const sel = document.getElementById(`${prefix}-cliente`);
  const inp = document.getElementById(`${prefix}-cliente-avulso`);
  const addr = document.getElementById(`${prefix}-avulso-endereco`);
  const sem = !sel.value;
  inp.style.display = sem ? '' : 'none';
  if (addr) addr.style.display = '';
  if (!sem) {
    inp.value = '';
    const opt = sel.options[sel.selectedIndex];
    if (opt) {
      const map = { rua: 'rua', numero: 'numero', complemento: 'complemento', cidade: 'cidade', referencia: 'ref' };
      Object.entries(map).forEach(([field, attr]) => {
        const el = document.getElementById(`${prefix}-avulso-${field}`);
        if (el) el.value = opt.dataset[attr] || '';
      });
    }
  }
}

async function carregarAutorizadosOS(valorAtual) {
  const clienteId = document.getElementById('os-cliente')?.value;
  const wrap = document.getElementById('os-solicitado-wrap');
  const sel = document.getElementById('os-solicitado-por');
  if (!wrap || !sel) return;
  if (!clienteId) { wrap.style.display = 'none'; sel.innerHTML = '<option value="">-- Solicitado por (opcional) --</option>'; return; }
  try {
    const lista = await api('GET', `/clientes/${clienteId}/autorizados`);
    if (!lista.length) { wrap.style.display = 'none'; sel.innerHTML = '<option value="">-- Solicitado por (opcional) --</option>'; return; }
    sel.innerHTML = '<option value="">-- Solicitado por (opcional) --</option>' +
      lista.map(a => `<option value="${a.nome}"${valorAtual === a.nome ? ' selected' : ''}>${a.nome}${a.cargo ? ' — ' + a.cargo : ''}</option>`).join('');
    wrap.style.display = 'block';
  } catch (_) { wrap.style.display = 'none'; }
}

function toggleVencimento() {
  const checked = document.getElementById('os-a-receber').checked;
  document.getElementById('os-vencimento-wrap').style.display = checked ? 'block' : 'none';
  if (checked && !document.getElementById('os-data-vencimento').value) {
    const dp = document.getElementById('os-data-prevista-data').value;
    if (dp) document.getElementById('os-data-vencimento').value = dp;
  }
}

function toggleChaveAuto() {}

function togglePlantao() {
  const checked = document.getElementById('os-plantao').checked;
  const label = document.querySelector('#os-secao-itens label span[style*="dc2626"]');
  if (label) label.textContent = checked ? '(opcional no plantão)' : '(pelo menos 1 serviço obrigatório)';
}

function abrirModalOS() {
  document.getElementById('os-id').value = '';
  document.getElementById('os-cliente').value = '';
  document.getElementById('os-cliente-avulso').value = '';
  ['rua','numero','complemento','cidade','referencia'].forEach(f => { const el = document.getElementById(`os-avulso-${f}`); if(el) el.value=''; });
  toggleClienteAvulso('os');
  const wrapSol = document.getElementById('os-solicitado-wrap');
  if (wrapSol) wrapSol.style.display = 'none';
  const selSol = document.getElementById('os-solicitado-por');
  if (selSol) selSol.innerHTML = '<option value="">-- Solicitado por (opcional) --</option>';
  document.getElementById('os-descricao').value = '';
  document.getElementById('os-valor').value = 0;
  document.getElementById('os-status').value = 'aberta';
  document.getElementById('os-data-prevista-data').value = '';
  document.getElementById('os-data-prevista-hora').value = '';
  document.getElementById('os-pagamento').value = '';
  document.getElementById('os-obs').value = '';
  document.getElementById('os-contato-cliente').value = '';
  document.getElementById('os-a-receber').checked = false;
  document.getElementById('os-data-vencimento').value = '';
  document.getElementById('os-vencimento-wrap').style.display = 'none';
  document.getElementById('os-chave-auto').checked = false;
  document.getElementById('os-plantao').checked = false;
  togglePlantao();
  document.getElementById('modal-os-title').textContent = 'Nova Ordem de Serviço';

  osItens = [];
  renderItensOS();
  preencherSelectsOS();
  openModal('modal-os');
}

function preencherSelectsOS() {
  ['servico', 'produto'].forEach(tipo => {
    const b = document.getElementById(`os-item-${tipo}-busca`);
    if (b) b.value = '';
    const p = document.getElementById(`os-item-${tipo}-preco`);
    if (p) p.value = '0';
    const q = document.getElementById(`os-item-${tipo}-qtd`);
    if (q) q.value = '1';
  });
  osServicoSelecionado = null;
  osProdutoSelecionado = null;
}

function _osEnsureDropdown() {
  if (!_osDropdown) {
    _osDropdown = document.createElement('div');
    _osDropdown.style.cssText = 'position:fixed;z-index:10000;background:#fff;border:2px solid #1a56db;border-top:none;border-radius:0 0 10px 10px;max-height:240px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,.12);display:none';
    document.body.appendChild(_osDropdown);
  }
  return _osDropdown;
}

function filtrarItensOS(tipo) {
  const input = document.getElementById(`os-item-${tipo}-busca`);
  const busca = input.value.toLowerCase().trim();
  const data = tipo === 'servico' ? servicosForOS : produtosForOS;
  const filtrados = busca ? data.filter(i => i.nome.toLowerCase().includes(busca)) : data;

  const dd = _osEnsureDropdown();
  const rect = input.getBoundingClientRect();
  dd.style.top = rect.bottom + 'px';
  dd.style.left = rect.left + 'px';
  dd.style.width = rect.width + 'px';
  dd.style.display = 'block';

  dd.innerHTML = filtrados.length
    ? filtrados.map(i => {
        const preco = tipo === 'servico' ? i.preco_base : i.preco_venda;
        return `<div onmousedown="event.preventDefault()" onclick="escolherItemOS('${tipo}',${i.id})"
                     onmouseover="this.style.background='#f0f7ff'" onmouseout="this.style.background=''"
                     style="padding:10px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center">
                  <span>${i.nome}</span>
                  <span style="color:#1a56db;font-weight:600;white-space:nowrap;margin-left:8px">${formatCurrency(preco)}</span>
                </div>`;
      }).join('')
    : '<div style="padding:12px;color:#94a3b8;font-size:13px;text-align:center">Nenhum encontrado</div>';
}

function escolherItemOS(tipo, id) {
  const data = tipo === 'servico' ? servicosForOS : produtosForOS;
  const item = data.find(i => i.id === id);
  if (!item) return;
  if (tipo === 'servico') osServicoSelecionado = item;
  else osProdutoSelecionado = item;
  const preco = tipo === 'servico' ? item.preco_base : item.preco_venda;
  document.getElementById(`os-item-${tipo}-busca`).value = item.nome;
  document.getElementById(`os-item-${tipo}-preco`).value = preco;
  if (_osDropdown) _osDropdown.style.display = 'none';
}

function fecharListaOS() {
  setTimeout(() => { if (_osDropdown) _osDropdown.style.display = 'none'; }, 150);
}

function setTabOS(tab, btn) {
  document.getElementById('tab-os-servico').style.display = tab === 'servico' ? 'block' : 'none';
  document.getElementById('tab-os-produto').style.display = tab === 'produto' ? 'block' : 'none';
  document.querySelectorAll('#tabs-os-tipo .tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function adicionarItemOS(tipo) {
  const selecionado = tipo === 'servico' ? osServicoSelecionado : osProdutoSelecionado;
  if (!selecionado) return toast('Selecione um item', 'warning');

  const qtd = parseFloat(document.getElementById(`os-item-${tipo}-qtd`).value) || 1;
  const preco = parseFloat(document.getElementById(`os-item-${tipo}-preco`).value) || 0;

  osItens.push({
    produto_id: tipo === 'produto' ? selecionado.id : null,
    servico_id: tipo === 'servico' ? selecionado.id : null,
    descricao: selecionado.nome,
    quantidade: qtd,
    preco_unitario: preco
  });

  if (tipo === 'servico') osServicoSelecionado = null;
  else osProdutoSelecionado = null;
  document.getElementById(`os-item-${tipo}-busca`).value = '';
  document.getElementById(`os-item-${tipo}-preco`).value = '0';
  document.getElementById(`os-item-${tipo}-qtd`).value = '1';

  renderItensOS();
  calcularTotalOS();
}

function renderItensOS() {
  const el = document.getElementById('lista-itens-os');
  if (!osItens.length) { el.innerHTML = '<p class="text-muted" style="font-size:12px">Nenhum item adicionado.</p>'; return; }
  const inpStyle = 'border:1px solid #e2e8f0;border-radius:6px;padding:3px 6px;font-size:12px;text-align:right';
  el.innerHTML = `
    <table class="table-sm">
      <thead><tr><th>Item</th><th style="width:70px">Qtd</th><th style="width:110px">Preço Unit.</th><th style="width:90px">Subtotal</th><th></th></tr></thead>
      <tbody>
        ${osItens.map((it, i) => `
          <tr>
            <td>${it.descricao}${it.servico_id ? ' <span style="font-size:10px;color:#1a56db;background:#eff6ff;padding:1px 5px;border-radius:4px">serviço</span>' : ''}${it.produto_id ? ' <span style="font-size:10px;color:#065f46;background:#d1fae5;padding:1px 5px;border-radius:4px">produto ↓estq</span>' : ''}</td>
            <td><input type="number" value="${it.quantidade}" min="0.01" step="0.01" style="${inpStyle};width:60px"
              oninput="osItens[${i}].quantidade=parseFloat(this.value)||1;document.getElementById('os-sub-${i}').textContent=formatCurrency(osItens[${i}].quantidade*osItens[${i}].preco_unitario);calcularTotalOS()"></td>
            <td><input type="number" value="${it.preco_unitario}" min="0" step="0.01" style="${inpStyle};width:100px"
              oninput="osItens[${i}].preco_unitario=parseFloat(this.value)||0;document.getElementById('os-sub-${i}').textContent=formatCurrency(osItens[${i}].quantidade*osItens[${i}].preco_unitario);calcularTotalOS()"></td>
            <td id="os-sub-${i}" style="text-align:right;font-size:13px">${formatCurrency(it.quantidade * it.preco_unitario)}</td>
            <td><button class="btn btn-sm btn-danger" onclick="osItens.splice(${i},1);renderItensOS();calcularTotalOS()">✕</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
}

function calcularTotalOS() {
  const total = osItens.reduce((acc, it) => acc + (it.quantidade * it.preco_unitario), 0);
  document.getElementById('os-valor').value = total.toFixed(2);
}


async function editarOS(id) {
  const o = await api('GET', `/ordens/${id}`);
  if (!o) return;
  document.getElementById('os-id').value = o.id;
  document.getElementById('os-cliente').value = o.cliente_id || '';
  document.getElementById('os-cliente-avulso').value = o.cliente_nome_avulso || '';
  toggleClienteAvulso('os');
  await carregarAutorizadosOS(o.solicitado_por || '');
  if (o.cliente_avulso_rua || !o.cliente_id) {
    document.getElementById('os-avulso-rua').value = o.cliente_avulso_rua || '';
    document.getElementById('os-avulso-numero').value = o.cliente_avulso_numero || '';
    document.getElementById('os-avulso-complemento').value = o.cliente_avulso_complemento || '';
    document.getElementById('os-avulso-cidade').value = o.cliente_avulso_cidade || '';
    document.getElementById('os-avulso-referencia').value = o.cliente_avulso_referencia || '';
  }
  document.getElementById('os-descricao').value = o.descricao;
  document.getElementById('os-vendedor').value = o.vendedor_id || '';
  document.getElementById('os-valor').value = o.valor;
  document.getElementById('os-status').value = o.status;
  const dp = (o.data_prevista || '').slice(0, 16);
  document.getElementById('os-data-prevista-data').value = dp.slice(0, 10);
  document.getElementById('os-data-prevista-hora').value = dp.slice(11, 16);
  document.getElementById('os-pagamento').value = o.forma_pagamento || '';
  document.getElementById('os-obs').value = o.observacoes || '';
  document.getElementById('os-contato-cliente').value = o.contato_cliente || '';
  document.getElementById('os-a-receber').checked = !!o.a_receber;
  document.getElementById('os-data-vencimento').value = (o.data_vencimento || '').slice(0, 10);
  document.getElementById('os-vencimento-wrap').style.display = o.a_receber ? 'block' : 'none';
  document.getElementById('os-chave-auto').checked = !!o.chave_auto;
  document.getElementById('os-plantao').checked = !!o.is_plantao;
  togglePlantao();
  document.getElementById('modal-os-title').textContent = 'Editar OS ' + o.numero;

  osItens = o.itens || [];
  renderItensOS();
  preencherSelectsOS();
  openModal('modal-os');
}

async function salvarOS() {
  const id = document.getElementById('os-id').value;
  const avulsoRua = document.getElementById('os-avulso-rua').value.trim();
  const body = {
    cliente_id: document.getElementById('os-cliente').value || null,
    cliente_nome_avulso: document.getElementById('os-cliente-avulso').value.trim() || null,
    cliente_avulso_rua: avulsoRua || null,
    cliente_avulso_numero: document.getElementById('os-avulso-numero').value.trim() || null,
    cliente_avulso_complemento: document.getElementById('os-avulso-complemento').value.trim() || null,
    cliente_avulso_cidade: document.getElementById('os-avulso-cidade').value.trim() || null,
    cliente_avulso_referencia: document.getElementById('os-avulso-referencia').value.trim() || null,
    vendedor_id: document.getElementById('os-vendedor').value || null,
    descricao: document.getElementById('os-descricao').value,
    valor: parseFloat(document.getElementById('os-valor').value) || 0,
    status: document.getElementById('os-status').value,
    data_prevista: (() => { const d = document.getElementById('os-data-prevista-data').value; const h = document.getElementById('os-data-prevista-hora').value; return d ? (h ? `${d} ${h}` : d) : null; })(),
    forma_pagamento: document.getElementById('os-pagamento').value || null,
    observacoes: document.getElementById('os-obs').value,
    contato_cliente: document.getElementById('os-contato-cliente').value.trim() || null,
    a_receber: document.getElementById('os-a-receber').checked ? 1 : 0,
    data_vencimento: document.getElementById('os-data-vencimento').value || null,
    solicitado_por: document.getElementById('os-solicitado-por')?.value || null,
    chave_auto: document.getElementById('os-chave-auto').checked ? 1 : 0,
    is_plantao: document.getElementById('os-plantao').checked ? 1 : 0,
    orcamento: 0,
    itens: osItens
  };
  if (!body.cliente_id && body.cliente_nome_avulso && !avulsoRua) { toast('Informe a rua do endereço do cliente', 'error'); return; }
  if (!body.is_plantao && !body.chave_auto && osItens.length === 0) { toast('Adicione pelo menos 1 serviço ou produto na OS', 'warning'); return; }
  if (!body.is_plantao && !body.descricao.trim() && osItens.length === 0) { toast('Preencha a descrição ou adicione um serviço/produto', 'error'); return; }
  try {
    if (id) {
      const resp = await api('PUT', `/ordens/${id}`, body);
      toast('OS atualizada!');
      closeModal('modal-os');
      await carregarOrdens();
      if (resp.tem_pergunta_estoque) {
        const consumo = await osModalEstoque(parseInt(id));
        if (consumo) {
          try { await api('POST', `/ordens/${id}/consumo-estoque`, { itens: consumo }); toast('Consumo de estoque registrado!'); }
          catch { toast('Erro ao registrar consumo de estoque', 'error'); }
        }
      }
    } else { const r = await api('POST', '/ordens', body); toast(`OS ${r.numero} criada!`); closeModal('modal-os'); await carregarOrdens(); return; }
  } catch (e) { toast(e.message, 'error'); }
}

async function _preencherOSFromOrcamento(orc) {
  // Abre o modal com reset limpo
  abrirModalOS();

  // Título especial indicando origem
  document.getElementById('modal-os-title').textContent = `Nova OS — Orç. ${orc.numero}`;

  // Cliente
  if (orc.cliente_id) {
    document.getElementById('os-cliente').value = orc.cliente_id;
    toggleClienteAvulso('os');
    await carregarAutorizadosOS();
  } else if (orc.cliente_nome_avulso) {
    document.getElementById('os-cliente').value = '';
    toggleClienteAvulso('os');
    document.getElementById('os-cliente-avulso').value = orc.cliente_nome_avulso;
  }

  // Campos principais
  document.getElementById('os-descricao').value = orc.descricao || '';
  document.getElementById('os-valor').value = orc.total || 0;
  if (orc.observacoes) document.getElementById('os-obs').value = orc.observacoes;
  if (orc.vendedor_id) document.getElementById('os-vendedor').value = orc.vendedor_id;

  // Itens do orçamento → itens da OS (para retirada de estoque)
  osItens = (orc.itens || []).map(it => ({
    produto_id: it.produto_id || null,
    servico_id: it.servico_id || null,
    descricao: it.descricao,
    quantidade: it.quantidade,
    preco_unitario: it.preco_unitario,
  }));
  renderItensOS();

  toast(`Orçamento ${orc.numero} pré-preenchido — revise e salve a OS`, 'info');
}

async function cancelarOS(id) {
  const o = ordensData.find(x => x.id === id);
  const motivo = await modalPrompt({ titulo: 'Cancelar OS', mensagem: `Informe o motivo do cancelamento da OS <strong>${o.numero}</strong>:`, placeholder: 'Motivo do cancelamento...', obrigatorio: true });
  if (!motivo) return;
  try {
    await api('DELETE', `/ordens/${id}`, { motivo });
    toast(`OS ${o.numero} cancelada!`);
    await carregarOrdens();
  } catch (e) { toast(e.message, 'error'); }
}

async function receberOS(id, numero, valor) {
  const fmtVal = v => 'R$ ' + parseFloat(v||0).toFixed(2).replace('.',',');
  const pgMap = { dinheiro: 'Dinheiro', pix: 'PIX', debito: 'Cartão Débito', credito: 'Cartão Crédito' };
  const opts = Object.entries(pgMap).map(([v,l]) => `<option value="${v}">${l}</option>`).join('');

  const html = `
    <p style="margin:0 0 12px">Confirmar recebimento da <strong>OS ${numero}</strong> — <strong>${fmtVal(valor)}</strong></p>
    <label style="font-size:13px;display:block;margin-bottom:6px">Forma de pagamento</label>
    <select id="recv-pgto" style="width:100%">${opts}</select>`;

  const confirmado = await new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10000;display:flex;align-items:center;justify-content:center';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:24px;min-width:320px;max-width:400px;box-shadow:0 20px 60px rgba(0,0,0,.2)">
        <h3 style="margin:0 0 16px;font-size:16px">Registrar Recebimento</h3>
        ${html}
        <div style="display:flex;gap:8px;margin-top:20px;justify-content:flex-end">
          <button id="recv-cancel" class="btn btn-secondary">Cancelar</button>
          <button id="recv-ok" class="btn btn-primary" style="background:#16a34a;border-color:#16a34a">✔ Confirmar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#recv-cancel').onclick = () => { document.body.removeChild(overlay); resolve(null); };
    overlay.querySelector('#recv-ok').onclick = () => {
      const pg = overlay.querySelector('#recv-pgto').value;
      document.body.removeChild(overlay);
      resolve(pg);
    };
  });

  if (!confirmado) return;
  try {
    await api('PUT', `/ordens/${id}/receber`, { forma_pagamento: confirmado });
    toast(`OS ${numero} marcada como recebida!`);
    await carregarOrdens();
  } catch (e) { toast(e.message, 'error'); }
}

async function excluirOS(id, numero, nfseStatus) {
  const senha = await pedirSenhaExclusao(`OS ${numero}${nfseStatus === 'autorizada' ? ' ⚠ possui NFS-e emitida' : ''}`);
  if (senha === null) return;
  if (!senha.trim()) { toast('Senha é obrigatória!', 'error'); return; }
  try {
    await api('DELETE', `/ordens/${id}/excluir`, { senha });
    toast(`OS ${numero} excluída permanentemente!`);
    await carregarOrdens();
  } catch (e) { toast(e.message, 'error'); }
}

async function emitirNfse(osId, osNumero) {
  try {
    toast('Carregando dados...', 'info');
    const dados = await api('GET', `/nfse/preview/${osId}`);
    if (!dados) return;
    const confirmar = await modalPreviewNfse(dados, osNumero);
    if (!confirmar) return;
    toast('Emitindo NFS-e... aguarde', 'info');
    const r = await api('POST', `/nfse/emitir/${osId}`, null, 60000);
    if (r && r.numeroNota) {
      toast(`NFS-e ${r.numeroNota} emitida com sucesso!`);
      if (r.aviso) toast(r.aviso, 'warning');
    } else {
      toast('NFS-e enviada! Verifique o número no sistema.', 'info');
    }
    await carregarOrdens();
  } catch (e) {
    toast('Erro: ' + e.message, 'error');
    await carregarOrdens();
  }
}

function modalPreviewNfse(dados, osNumero) {
  return new Promise(resolve => {
    let overlay = document.getElementById('modal-preview-nfse');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'modal-preview-nfse';
      overlay.className = 'modal-overlay';
      document.body.appendChild(overlay);
    }

    const { prestador, tomador, servico, itens, os, ambiente } = dados;
    const ambienteBadge = ambiente === 'Produção'
      ? `<span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:20px;font-size:11px">PRODUÇÃO</span>`
      : `<span style="background:#d97706;color:#fff;padding:2px 8px;border-radius:20px;font-size:11px">HOMOLOGAÇÃO</span>`;

    const itensHtml = itens && itens.length > 0 ? `
      <div style="margin-top:8px">
        <table style="width:100%;font-size:12px;border-collapse:collapse">
          <thead><tr style="background:#f1f5f9">
            <th style="padding:5px 8px;text-align:left;border-bottom:1px solid #e2e8f0">Item</th>
            <th style="padding:5px 8px;text-align:center;border-bottom:1px solid #e2e8f0">Qtd</th>
            <th style="padding:5px 8px;text-align:right;border-bottom:1px solid #e2e8f0">Unit.</th>
            <th style="padding:5px 8px;text-align:right;border-bottom:1px solid #e2e8f0">Total</th>
          </tr></thead>
          <tbody>${(itens || []).map(i => `<tr>
            <td style="padding:4px 8px">${i.produto_nome || i.servico_nome || i.descricao || '-'}</td>
            <td style="padding:4px 8px;text-align:center">${i.quantidade}</td>
            <td style="padding:4px 8px;text-align:right">${formatCurrency(i.preco_unitario)}</td>
            <td style="padding:4px 8px;text-align:right">${formatCurrency(i.subtotal)}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>` : '';

    const row = (label, val) => val ? `<div style="display:flex;gap:8px;margin-bottom:4px;font-size:13px"><span style="color:#64748b;min-width:130px">${label}:</span><span style="color:#1e293b;font-weight:500">${val}</span></div>` : '';

    overlay.innerHTML = `
    <div class="modal" style="max-width:580px;width:100%" onclick="event.stopPropagation()">
      <div class="modal-header">
        <span class="modal-title">📄 Pré-visualização NFS-e — OS ${osNumero} ${ambienteBadge}</span>
        <button class="modal-close" id="btn-pnf-fechar">&times;</button>
      </div>
      <div class="modal-body" style="max-height:70vh;overflow-y:auto;padding:16px 20px">

        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:12px">
          <div style="font-size:11px;font-weight:700;color:#64748b;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">Prestador</div>
          ${row('CNPJ', prestador.cnpj)}
          ${row('Insc. Municipal', prestador.inscricaoMunicipal)}
          ${row('Regime', prestador.regime)}
          ${row('Cód. Tributação', prestador.codTribNac)}
        </div>

        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:12px">
          <div style="font-size:11px;font-weight:700;color:#64748b;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">Tomador</div>
          ${row('Nome', tomador.nome)}
          ${row(tomador.tipo, tomador.doc || '<span style="color:#dc2626">Não informado</span>')}
          ${row('Email', tomador.email)}
          ${row('Telefone', tomador.fone)}
          ${row('Endereço', tomador.endereco)}
          ${row('Bairro', tomador.bairro)}
          ${row('Cidade / CEP', [tomador.cidade, tomador.cep].filter(Boolean).join(' — '))}
        </div>

        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:12px">
          <div style="font-size:11px;font-weight:700;color:#64748b;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">Serviço / Itens</div>
          ${itensHtml}
          <div style="margin-top:10px">
            <div style="font-size:11px;color:#64748b;margin-bottom:4px">Descrição que será enviada:</div>
            <div style="background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:8px;font-size:12px;color:#374151;white-space:pre-wrap;max-height:120px;overflow-y:auto">${servico.descricao}</div>
          </div>
        </div>

        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px;display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:13px;color:#15803d;font-weight:600">Valor Total</span>
          <span style="font-size:22px;font-weight:800;color:#15803d">${formatCurrency(os.valor)}</span>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="btn-pnf-cancelar">Cancelar</button>
        <button class="btn btn-primary" id="btn-pnf-emitir" style="background:#7c3aed;border:none">📤 Confirmar Emissão</button>
      </div>
    </div>`;

    openModal('modal-preview-nfse');

    const fechar = val => { closeModal('modal-preview-nfse'); resolve(val); };
    overlay.onclick = () => fechar(false);
    overlay.querySelector('.modal').onclick = e => e.stopPropagation();
    document.getElementById('btn-pnf-fechar').onclick   = () => fechar(false);
    document.getElementById('btn-pnf-cancelar').onclick = () => fechar(false);
    document.getElementById('btn-pnf-emitir').onclick   = () => fechar(true);
  });
}

function verNfse(osId, chaveAcesso) {
  if (!chaveAcesso) { toast('Chave de acesso não disponível', 'error'); return; }
  window.open(`/api/nfse/danfse/${chaveAcesso}?t=${getToken()}`, '_blank');
}

async function enviarNfseWhatsapp(osId) {
  const o = ordensData.find(x => x.id === osId);
  if (!o || !o.nfse_chave_acesso) { toast('Chave de acesso não disponível', 'error'); return; }
  const telefone = o.cliente_telefone || o.contato_cliente || '';
  const numeroConfirmado = await modalConfirmarEnvioWA({ telefone, titulo: `Enviar NFS-e Nº ${o.nfse_numero}` });
  if (!numeroConfirmado) return;
  try {
    await api('POST', '/whatsapp/enviar-nfse', { telefone: numeroConfirmado, chave_acesso: o.nfse_chave_acesso, numero_nf: o.nfse_numero, valor: o.valor, descricao: o.descricao, data_emissao: o.nfse_emitida_em });
    toast('NF enviada via WhatsApp!', 'success');
  } catch (e) {
    toast('Erro ao enviar: ' + e.message, 'error');
  }
}
