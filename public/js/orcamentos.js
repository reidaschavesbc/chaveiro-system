let orcList = [];
let orcItens = [];
let orcClientes = [];
let orcServicos = [];
let orcProdutos = [];
let orcVendedores = [];
let orcServicoSelecionado = null;
let orcProdutoSelecionado = null;
let _orcDropdown = null;
let _orcClienteDropdown = null;

function _orcEnsureDropdown() {
  if (!_orcDropdown) {
    _orcDropdown = document.createElement('div');
    _orcDropdown.style.cssText = 'position:fixed;z-index:10000;background:#fff;border:2px solid #1a56db;border-top:none;border-radius:0 0 10px 10px;max-height:240px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,.12);display:none';
    document.body.appendChild(_orcDropdown);
  }
  return _orcDropdown;
}

function filtrarItensOrc(tipo) {
  const input = document.getElementById(`orc-item-${tipo}-busca`);
  const busca = input.value.toLowerCase().trim();
  const data = tipo === 'servico' ? orcServicos : orcProdutos;
  const filtrados = busca ? data.filter(i => i.nome.toLowerCase().includes(busca)) : data;

  const dd = _orcEnsureDropdown();
  const rect = input.getBoundingClientRect();
  dd.style.top = rect.bottom + 'px';
  dd.style.left = rect.left + 'px';
  dd.style.width = rect.width + 'px';
  dd.style.display = 'block';

  dd.innerHTML = filtrados.length
    ? filtrados.map(i => {
        const preco = tipo === 'servico' ? i.preco_base : i.preco_venda;
        return `<div onmousedown="event.preventDefault()" onclick="escolherItemOrc('${tipo}',${i.id})"
                     onmouseover="this.style.background='#f0f7ff'" onmouseout="this.style.background=''"
                     style="padding:10px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center">
                  <span>${i.nome}</span>
                  <span style="color:#1a56db;font-weight:600;white-space:nowrap;margin-left:8px">${formatCurrency(preco)}</span>
                </div>`;
      }).join('')
    : '<div style="padding:12px;color:#94a3b8;font-size:13px;text-align:center">Nenhum encontrado</div>';
}

function escolherItemOrc(tipo, id) {
  const data = tipo === 'servico' ? orcServicos : orcProdutos;
  const item = data.find(i => i.id === id);
  if (!item) return;
  if (tipo === 'servico') orcServicoSelecionado = item;
  else orcProdutoSelecionado = item;
  const preco = tipo === 'servico' ? item.preco_base : item.preco_venda;
  const precoId = tipo === 'produto' ? 'orc-item-prod-preco' : `orc-item-${tipo}-preco`;
  document.getElementById(`orc-item-${tipo}-busca`).value = item.nome;
  document.getElementById(precoId).value = preco;
  if (_orcDropdown) _orcDropdown.style.display = 'none';
}

function fecharListaOrc() {
  setTimeout(() => { if (_orcDropdown) _orcDropdown.style.display = 'none'; }, 150);
}

function _orcEnsureClienteDropdown() {
  if (!_orcClienteDropdown) {
    _orcClienteDropdown = document.createElement('div');
    _orcClienteDropdown.style.cssText = 'position:fixed;z-index:10000;background:#fff;border:2px solid #1a56db;border-top:none;border-radius:0 0 10px 10px;max-height:220px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,.12);display:none';
    document.body.appendChild(_orcClienteDropdown);
  }
  return _orcClienteDropdown;
}

function filtrarClienteOrc() {
  const input = document.getElementById('orc-cliente-busca');
  const busca = input.value.toLowerCase().trim();
  const filtrados = busca
    ? orcClientes.filter(c => (c.nome_fantasia || c.nome).toLowerCase().includes(busca) || c.nome.toLowerCase().includes(busca))
    : orcClientes.slice(0, 40);

  const dd = _orcEnsureClienteDropdown();
  const rect = input.getBoundingClientRect();
  dd.style.top = rect.bottom + 'px';
  dd.style.left = rect.left + 'px';
  dd.style.width = rect.width + 'px';
  dd.style.display = 'block';

  const semCliente = !busca
    ? `<div onmousedown="event.preventDefault()" onclick="selecionarClienteOrc('','')"
        onmouseover="this.style.background='#f0f7ff'" onmouseout="this.style.background=''"
        style="padding:10px 14px;cursor:pointer;font-size:13px;color:#94a3b8;border-bottom:1px solid #f1f5f9">— Sem cliente —</div>`
    : '';

  dd.innerHTML = semCliente + (filtrados.length
    ? filtrados.map(c => {
        const label = c.nome_fantasia || c.nome;
        const sub = c.nome_fantasia && c.nome_fantasia !== c.nome ? `<span style="color:#94a3b8;font-size:11px;margin-left:6px">${c.nome}</span>` : '';
        const safe = label.replace(/'/g, "\\'");
        return `<div onmousedown="event.preventDefault()" onclick="selecionarClienteOrc(${c.id},'${safe}')"
                     onmouseover="this.style.background='#f0f7ff'" onmouseout="this.style.background=''"
                     style="padding:10px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid #f1f5f9">
                  ${label}${sub}
                </div>`;
      }).join('')
    : '<div style="padding:12px;color:#94a3b8;font-size:13px;text-align:center">Nenhum cliente encontrado</div>');
}

function selecionarClienteOrc(id, nome) {
  document.getElementById('orc-cliente').value = id;
  document.getElementById('orc-cliente-busca').value = nome;
  if (_orcClienteDropdown) _orcClienteDropdown.style.display = 'none';
  orcToggleAvulso();
}

function fecharClienteOrc() {
  setTimeout(() => { if (_orcClienteDropdown) _orcClienteDropdown.style.display = 'none'; }, 150);
}

const ORC_STATUS = {
    pendente:  { bg: '#fef3c7', color: '#92400e', label: 'Pendente' },
    aprovado:  { bg: '#d1fae5', color: '#065f46', label: 'Aprovado' },
    recusado:  { bg: '#fee2e2', color: '#991b1b', label: 'Recusado' },
    expirado:  { bg: '#f1f5f9', color: '#475569', label: 'Expirado' },
};

function orcStatusSelect(id, status) {
    const s = ORC_STATUS[status] || ORC_STATUS.pendente;
    const opts = Object.entries(ORC_STATUS).map(([v, c]) =>
        `<option value="${v}" ${v === status ? 'selected' : ''}>${c.label}</option>`
    ).join('');
    return `<select
        data-id="${id}" data-original="${status}"
        onchange="mudarStatusOrcSelect(this)"
        style="border:none;border-radius:20px;padding:3px 22px 3px 10px;font-size:11px;font-weight:600;cursor:pointer;background:${s.bg};color:${s.color};outline:none;appearance:none;-webkit-appearance:none;background-image:url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 10 6%22><path fill=%22${encodeURIComponent(s.color)}%22 d=%22M0 0l5 6 5-6z%22/></svg>');background-repeat:no-repeat;background-position:right 7px center;background-size:7px"
    >${opts}</select>`;
}

function orcAtualizarEstiloSelect(sel, status) {
    const s = ORC_STATUS[status] || ORC_STATUS.pendente;
    sel.style.background = s.bg;
    sel.style.color = s.color;
    sel.style.backgroundImage = `url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 10 6%22><path fill=%22${encodeURIComponent(s.color)}%22 d=%22M0 0l5 6 5-6z%22/></svg>')`;
    sel.style.backgroundRepeat = 'no-repeat';
    sel.style.backgroundPosition = 'right 7px center';
    sel.style.backgroundSize = '7px';
}

function dataValidadeOrc(criadoEm, dias) {
    const d = new Date(criadoEm);
    d.setDate(d.getDate() + parseInt(dias || 7));
    return d.toLocaleDateString('pt-BR');
}

async function orcamentos(el) {
    [orcClientes, orcServicos, orcProdutos, orcVendedores] = await Promise.all([
        api('GET', '/clientes'),
        api('GET', '/servicos'),
        api('GET', '/produtos'),
        api('GET', '/vendedores?tecnico=1'),
    ]);

    el.innerHTML = `
    <div class="card">
      <div class="card-header">
        <span class="card-title">Orçamentos</span>
        <div class="flex gap-2 align-center">
          <select id="filtro-status-orc" onchange="carregarOrcamentos()" class="select-custom">
            <option value="">Todos</option>
            <option value="pendente">Pendente</option>
            <option value="aprovado">Aprovado</option>
            <option value="recusado">Recusado</option>
            <option value="expirado">Expirado</option>
          </select>
          <div class="search-box">
            <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
            <input type="text" id="search-orc" oninput="filtrarOrc()">
          </div>
          <button class="btn btn-primary" onclick="abrirModalOrc()">
            <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            Novo Orçamento
          </button>
        </div>
      </div>
      <div id="tabela-orc"></div>
    </div>

    <!-- Modal Criar/Editar -->
    <div class="modal-overlay" id="modal-orc">
      <div class="modal modal-lg">
        <div class="modal-header">
          <span class="modal-title" id="modal-orc-title">Novo Orçamento</span>
          <button class="modal-close" onclick="closeModal('modal-orc')">&times;</button>
        </div>
        <div class="modal-body">
          <input type="hidden" id="orc-id">
          <div class="form-grid">
            <div class="form-group">
              <label>Cliente</label>
              <select id="orc-cliente" style="display:none">
                <option value="">-- Sem cliente --</option>
                ${orcClientes.map(c => `<option value="${c.id}" data-tel="${c.telefone || ''}">${c.nome_fantasia || c.nome}</option>`).join('')}
              </select>
              <div style="position:relative">
                <input type="text" id="orc-cliente-busca" placeholder="Pesquisar cliente..." autocomplete="off" style="padding-right:28px;width:100%"
                  oninput="filtrarClienteOrc()" onfocus="filtrarClienteOrc()" onblur="fecharClienteOrc()">
                <span onclick="selecionarClienteOrc('','')" title="Limpar" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);cursor:pointer;color:#94a3b8;font-size:14px;line-height:1;user-select:none">✕</span>
              </div>
              <input type="text" id="orc-cliente-avulso" placeholder="Nome do cliente" style="margin-top:6px">
              <input type="text" id="orc-cliente-tel-avulso" placeholder="(00) 00000-0000" style="margin-top:6px" oninput="mascaraTelefone(this)">
            </div>
            <div class="form-group">
              <label>Funcionário</label>
              <select id="orc-vendedor">
                <option value="">-- Selecione --</option>
                ${orcVendedores.map(v => `<option value="${v.id}">${v.nome}</option>`).join('')}
              </select>
            </div>
            <div class="form-group form-full">
              <label>Descrição *</label>
              <textarea id="orc-descricao" placeholder="Ex: Duplicata de chave veicular, instalação de fechadura, cópia de controle..."></textarea>
            </div>
            <div class="form-group">
              <label>Validade (dias)</label>
              <input type="number" id="orc-validade" min="1" value="7">
            </div>
            <div class="form-group">
              <label>Status</label>
              <select id="orc-status">
                <option value="pendente">Pendente</option>
                <option value="aprovado">Aprovado</option>
                <option value="recusado">Recusado</option>
                <option value="expirado">Expirado</option>
              </select>
            </div>
            <div class="form-group form-full">
              <label>Observações</label>
              <textarea id="orc-obs" placeholder="Condições de pagamento, prazo de entrega, validade da proposta..." style="min-height:56px"></textarea>
            </div>
          </div>

          <div class="divider"></div>

          <div>
            <label style="font-weight:700;margin-bottom:12px;display:block">Itens do Orçamento <span style="font-size:12px;font-weight:400;color:#64748b">(opcional)</span></label>
            <div class="tabs" id="tabs-orc-tipo">
              <button class="tab active" onclick="setTabOrc('servico', this)">+ Serviço</button>
              <button class="tab" onclick="setTabOrc('produto', this)">+ Produto</button>
              <button class="tab" onclick="setTabOrc('manual', this)">+ Manual</button>
            </div>
            <div id="tab-orc-servico">
              <div class="form-grid">
                <div class="form-group form-full">
                  <input type="text" id="orc-item-servico-busca" placeholder="🔍 Buscar serviço..." autocomplete="off"
                         oninput="filtrarItensOrc('servico')" onfocus="filtrarItensOrc('servico')" onblur="fecharListaOrc()"
                         style="width:100%;padding:9px 14px;border:2px solid #e5e7eb;border-radius:10px;font-size:14px;box-sizing:border-box">
                </div>
                <div class="form-group"><label>Qtd</label><input type="number" id="orc-item-servico-qtd" min="1" value="1" placeholder="1"></div>
                <div class="form-group"><label>Valor (R$)</label><input type="number" id="orc-item-servico-preco" step="0.01" min="0" value="0" placeholder="0,00"></div>
              </div>
              <button class="btn btn-sm" style="margin-top:8px;background:#2563eb;color:#fff;border:none;font-weight:700;padding:8px 18px;border-radius:8px;cursor:pointer;font-size:13px" onclick="orcAdicionarItem('servico')">+ Adicionar Serviço</button>
            </div>
            <div id="tab-orc-produto" style="display:none">
              <div class="form-grid">
                <div class="form-group form-full">
                  <input type="text" id="orc-item-produto-busca" placeholder="🔍 Buscar produto..." autocomplete="off"
                         oninput="filtrarItensOrc('produto')" onfocus="filtrarItensOrc('produto')" onblur="fecharListaOrc()"
                         style="width:100%;padding:9px 14px;border:2px solid #e5e7eb;border-radius:10px;font-size:14px;box-sizing:border-box">
                </div>
                <div class="form-group"><label>Qtd</label><input type="number" id="orc-item-prod-qtd" min="1" value="1" placeholder="1"></div>
                <div class="form-group"><label>Valor (R$)</label><input type="number" id="orc-item-prod-preco" step="0.01" min="0" value="0" placeholder="0,00"></div>
              </div>
              <button class="btn btn-sm" style="margin-top:8px;background:#2563eb;color:#fff;border:none;font-weight:700;padding:8px 18px;border-radius:8px;cursor:pointer;font-size:13px" onclick="orcAdicionarItem('produto')">+ Adicionar Produto</button>
            </div>
            <div id="tab-orc-manual" style="display:none">
              <div class="form-grid">
                <div class="form-group form-full">
                  <label>Descrição do item</label>
                  <input type="text" id="orc-item-man-desc" placeholder="Ex: Mão de obra, deslocamento, material especial...">
                </div>
                <div class="form-group"><label>Qtd</label><input type="number" id="orc-item-man-qtd" min="1" value="1" placeholder="1"></div>
                <div class="form-group"><label>Valor (R$)</label><input type="number" id="orc-item-man-preco" step="0.01" min="0" value="0" placeholder="0,00"></div>
              </div>
              <button class="btn btn-sm" style="margin-top:8px;background:#2563eb;color:#fff;border:none;font-weight:700;padding:8px 18px;border-radius:8px;cursor:pointer;font-size:13px" onclick="orcAdicionarItem('manual')">+ Adicionar Item</button>
            </div>
            <div id="lista-itens-orc" style="margin-top:16px"></div>
          </div>
        </div>
        <div class="modal-footer">
          <div style="flex:1;text-align:left;font-size:14px;font-weight:700;color:#1a56db">Total: <span id="orc-total-display">R$ 0,00</span></div>
          <button class="btn btn-secondary" onclick="closeModal('modal-orc')">Cancelar</button>
          <button class="btn btn-primary" onclick="salvarOrc()">Salvar Orçamento</button>
        </div>
      </div>
    </div>

    <!-- Modal Enviar WhatsApp -->
    <div class="modal-overlay" id="modal-orc-enviar">
      <div class="modal modal-sm">
        <div class="modal-header">
          <span class="modal-title">📤 Enviar Orçamento</span>
          <button class="modal-close" onclick="closeModal('modal-orc-enviar')">&times;</button>
        </div>
        <div class="modal-body">
          <input type="hidden" id="orc-enviar-id">
          <p id="orc-enviar-numero" style="font-weight:600;color:#1a56db;margin-bottom:14px"></p>
          <div class="form-group">
            <label>Telefone do destinatário</label>
            <input type="text" id="orc-enviar-tel" placeholder="(00) 00000-0000" oninput="mascaraTelefone(this)">
          </div>
          <div class="form-group" style="margin-top:14px">
            <label style="margin-bottom:10px;display:block;font-weight:600">Enviar como:</label>
            <div style="display:flex;flex-direction:column;gap:10px">
              <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:10px;border:2px solid #e2e8f0;border-radius:9px;transition:.15s" id="label-orc-tipo-texto">
                <input type="checkbox" id="orc-tipo-texto" checked style="width:16px;height:16px;accent-color:#1a56db" onchange="orcTipoChange()">
                <span>📝 Texto no WhatsApp</span>
              </label>
              <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:10px;border:2px solid #e2e8f0;border-radius:9px;transition:.15s" id="label-orc-tipo-pdf">
                <input type="checkbox" id="orc-tipo-pdf" checked style="width:16px;height:16px;accent-color:#1a56db" onchange="orcTipoChange()">
                <span>📄 PDF pelo WhatsApp</span>
              </label>
            </div>
          </div>
          <p style="font-size:11px;color:#94a3b8;margin-top:10px">Requer WhatsApp conectado no sistema.</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal('modal-orc-enviar')">Cancelar</button>
          <button class="btn btn-primary" id="btn-confirmar-enviar" onclick="confirmarEnvioOrc()">
            <svg viewBox="0 0 24 24" style="width:15px;height:15px;fill:currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            Enviar
          </button>
        </div>
      </div>
    </div>`;

    await carregarOrcamentos();
}

async function carregarOrcamentos() {
    try {
        const status = document.getElementById('filtro-status-orc')?.value || '';
        orcList = await api('GET', `/orcamentos${status ? '?status=' + status : ''}`);
        renderOrc(orcList);
    } catch (e) { toast(e.message, 'error'); }
}

function filtrarOrc() {
    const q = document.getElementById('search-orc').value.toLowerCase();
    renderOrc(orcList.filter(o =>
        o.numero.toLowerCase().includes(q) ||
        (o.cliente_nome || '').toLowerCase().includes(q) ||
        (o.cliente_nome_avulso || '').toLowerCase().includes(q) ||
        (o.descricao || '').toLowerCase().includes(q)
    ));
}

function renderOrc(list) {
    const el = document.getElementById('tabela-orc');
    if (!list.length) { el.innerHTML = '<div class="empty-state"><h3>Nenhum orçamento encontrado</h3></div>'; return; }
    el.innerHTML = `<table>
      <thead><tr><th>Nº</th><th>Data</th><th>Cliente</th><th>Itens</th><th>Total</th><th>Validade</th><th>Status</th><th style="width:210px">Ações</th></tr></thead>
      <tbody>${list.map(o => {
        const cli = o.cliente_nome || o.cliente_nome_avulso || '<span class="text-muted">—</span>';
        const validade = dataValidadeOrc(o.criado_em, o.validade_dias);
        return `<tr>
          <td><strong>${o.numero}</strong></td>
          <td>${formatDate(o.criado_em)}</td>
          <td>${cli}</td>
          <td style="color:#64748b;font-size:12px">${o.total > 0 ? '' : '<span class="text-muted">sem itens</span>'}</td>
          <td class="currency">${formatCurrency(o.total)}</td>
          <td style="font-size:12px;color:#64748b">${validade}</td>
          <td>${orcStatusSelect(o.id, o.status)}</td>
          <td><div class="actions-cell">
            <button class="btn btn-sm btn-secondary btn-icon" title="Visualizar" onclick="visualizarOrc(${o.id})">👁️</button>
            <a class="btn btn-sm btn-secondary btn-icon" href="/api/pdf/orcamento/${o.id}?t=${getToken()}" target="_blank" title="PDF">📄</a>
            <button class="btn btn-sm" style="background:#25d366;color:#fff;font-size:11px;padding:4px 8px" title="Enviar WhatsApp" onclick="abrirEnvioOrc(${o.id})">
              <svg viewBox="0 0 24 24" style="width:12px;height:12px;fill:#fff;display:inline;vertical-align:middle"><path d="M12 2C6.48 2 2 6.48 2 12c0 1.77.46 3.43 1.27 4.87L2 22l5.26-1.25A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm4.93 13.07c-.21.58-1.22 1.11-1.68 1.18-.43.06-.97.09-1.57-.1-.36-.12-.83-.28-1.42-.55-2.49-1.08-4.12-3.6-4.24-3.76-.13-.17-1.02-1.36-1.02-2.59 0-1.24.64-1.85.87-2.1.23-.25.5-.31.67-.31.17 0 .33 0 .48.01.15.01.36-.06.56.43.21.5.71 1.73.77 1.86.06.13.1.28.02.45-.08.17-.12.28-.24.43-.12.15-.25.33-.36.45-.12.12-.24.25-.1.49.14.24.61 1.01 1.31 1.64.9.8 1.66 1.05 1.9 1.17.24.12.38.1.52-.06.14-.16.59-.69.75-.93.16-.24.32-.2.54-.12.22.08 1.39.66 1.63.78.24.12.4.18.46.28.06.1.06.57-.15 1.15z"/></svg>
              WA
            </button>
            <button class="btn btn-sm btn-secondary btn-icon" title="Editar" onclick="editarOrc(${o.id})"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button>
            <button class="btn btn-sm btn-danger btn-icon" title="Excluir" onclick="excluirOrc(${o.id},'${o.numero}')"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>
          </div></td>
        </tr>`;
    }).join('')}
      </tbody>
    </table>`;
}

// ── Formulário ─────────��─────────────────────────────────────���────────────────

function orcToggleAvulso() {
    const sel = document.getElementById('orc-cliente');
    const avulso = document.getElementById('orc-cliente-avulso');
    const telAvulso = document.getElementById('orc-cliente-tel-avulso');
    const sem = !sel.value;
    avulso.style.display = sem ? '' : 'none';
    telAvulso.style.display = sem ? '' : 'none';
    if (!sem) { avulso.value = ''; telAvulso.value = ''; }
}

function setTabOrc(tab, btn) {
    ['servico', 'produto', 'manual'].forEach(t => {
        document.getElementById(`tab-orc-${t}`).style.display = t === tab ? 'block' : 'none';
    });
    document.querySelectorAll('#tabs-orc-tipo .tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

function orcAtualizarPreco(tipo, sel) {
    const opt = sel.options[sel.selectedIndex];
    if (opt?.dataset.preco) {
        const id = tipo === 'servico' ? 'orc-item-serv-preco' : 'orc-item-prod-preco';
        document.getElementById(id).value = opt.dataset.preco;
    }
}

function orcAdicionarItem(tipo) {
    let descricao, quantidade, preco, produto_id = null, servico_id = null;
    if (tipo === 'servico') {
        if (!orcServicoSelecionado) return toast('Selecione um serviço', 'warning');
        descricao = orcServicoSelecionado.nome;
        servico_id = orcServicoSelecionado.id;
        quantidade = parseFloat(document.getElementById('orc-item-servico-qtd').value) || 1;
        preco = parseFloat(document.getElementById('orc-item-servico-preco').value) || 0;
        orcServicoSelecionado = null;
        document.getElementById('orc-item-servico-busca').value = '';
        document.getElementById('orc-item-servico-preco').value = 0;
        document.getElementById('orc-item-servico-qtd').value = 1;
    } else if (tipo === 'produto') {
        if (!orcProdutoSelecionado) return toast('Selecione um produto', 'warning');
        descricao = orcProdutoSelecionado.nome;
        produto_id = orcProdutoSelecionado.id;
        quantidade = parseFloat(document.getElementById('orc-item-prod-qtd').value) || 1;
        preco = parseFloat(document.getElementById('orc-item-prod-preco').value) || 0;
        orcProdutoSelecionado = null;
        document.getElementById('orc-item-produto-busca').value = '';
        document.getElementById('orc-item-prod-preco').value = 0;
        document.getElementById('orc-item-prod-qtd').value = 1;
    } else {
        descricao = document.getElementById('orc-item-man-desc').value.trim();
        if (!descricao) return toast('Informe a descrição do item', 'warning');
        quantidade = parseFloat(document.getElementById('orc-item-man-qtd').value) || 1;
        preco = parseFloat(document.getElementById('orc-item-man-preco').value) || 0;
        document.getElementById('orc-item-man-desc').value = '';
    }
    orcItens.push({ descricao, quantidade, preco_unitario: preco, produto_id, servico_id });
    orcRenderItens();
}

function orcRenderItens() {
    const el = document.getElementById('lista-itens-orc');
    if (!orcItens.length) { el.innerHTML = '<p class="text-muted" style="font-size:12px">Nenhum item.</p>'; orcAtualizarTotal(); return; }
    el.innerHTML = `<table class="table-sm">
      <thead><tr><th>Item</th><th>Qtd</th><th>Preço</th><th>Subtotal</th><th></th></tr></thead>
      <tbody>${orcItens.map((it, i) => `
        <tr>
          <td>${it.descricao}${it.servico_id ? ' <span style="font-size:10px;color:#1a56db;background:#eff6ff;padding:1px 5px;border-radius:4px">serv.</span>' : ''}</td>
          <td>${it.quantidade}</td>
          <td>${formatCurrency(it.preco_unitario)}</td>
          <td>${formatCurrency(it.quantidade * it.preco_unitario)}</td>
          <td><button class="btn btn-sm btn-danger" onclick="orcItens.splice(${i},1);orcRenderItens()">✕</button></td>
        </tr>`).join('')}
      </tbody>
    </table>`;
    orcAtualizarTotal();
}

function orcAtualizarTotal() {
    const total = orcItens.reduce((s, it) => s + it.quantidade * it.preco_unitario, 0);
    const el = document.getElementById('orc-total-display');
    if (el) el.textContent = formatCurrency(total);
}

function abrirModalOrc() {
    document.getElementById('orc-id').value = '';
    document.getElementById('orc-cliente').value = '';
    document.getElementById('orc-cliente-busca').value = '';
    document.getElementById('orc-cliente-avulso').value = '';
    document.getElementById('orc-cliente-tel-avulso').value = '';
    orcToggleAvulso();
    document.getElementById('orc-vendedor').value = '';
    document.getElementById('orc-descricao').value = '';
    document.getElementById('orc-validade').value = 7;
    document.getElementById('orc-status').value = 'pendente';
    document.getElementById('orc-obs').value = '';
    document.getElementById('modal-orc-title').textContent = 'Novo Orçamento';
    orcItens = [];
    orcServicoSelecionado = null;
    orcProdutoSelecionado = null;
    const bS = document.getElementById('orc-item-servico-busca'); if (bS) bS.value = '';
    const bP = document.getElementById('orc-item-produto-busca'); if (bP) bP.value = '';
    orcRenderItens();
    openModal('modal-orc');
}

async function editarOrc(id) {
    try {
        const o = await api('GET', `/orcamentos/${id}`);
        document.getElementById('orc-id').value = o.id;
        document.getElementById('orc-cliente').value = o.cliente_id || '';
        const _bcOrcEdit = document.getElementById('orc-cliente-busca');
        if (_bcOrcEdit) { const _cObj = orcClientes.find(c => c.id == o.cliente_id); _bcOrcEdit.value = _cObj ? (_cObj.nome_fantasia || _cObj.nome) : ''; }
        document.getElementById('orc-cliente-avulso').value = o.cliente_nome_avulso || '';
        document.getElementById('orc-cliente-tel-avulso').value = aplicarMascaraTelefone(o.cliente_telefone_avulso || '');
        orcToggleAvulso();
        document.getElementById('orc-vendedor').value = o.vendedor_id || '';
        document.getElementById('orc-descricao').value = o.descricao;
        document.getElementById('orc-validade').value = o.validade_dias || 7;
        document.getElementById('orc-status').value = o.status;
        document.getElementById('orc-obs').value = o.observacoes || '';
        document.getElementById('modal-orc-title').textContent = 'Editar ' + o.numero;
        orcItens = (o.itens || []).map(it => ({ descricao: it.descricao, quantidade: it.quantidade, preco_unitario: it.preco_unitario, produto_id: it.produto_id, servico_id: it.servico_id }));
        orcRenderItens();
        openModal('modal-orc');
    } catch (e) { toast(e.message, 'error'); }
}

async function salvarOrc() {
    const id = document.getElementById('orc-id').value;
    const desc = document.getElementById('orc-descricao').value.trim();
    if (!desc) { toast('Descrição é obrigatória', 'error'); return; }
    const body = {
        cliente_id: document.getElementById('orc-cliente').value || null,
        cliente_nome_avulso: document.getElementById('orc-cliente-avulso').value.trim() || null,
        cliente_telefone_avulso: document.getElementById('orc-cliente-tel-avulso').value.replace(/\D/g, '') || null,
        vendedor_id: document.getElementById('orc-vendedor').value || null,
        descricao: desc,
        validade_dias: parseInt(document.getElementById('orc-validade').value) || 7,
        status: document.getElementById('orc-status').value,
        observacoes: document.getElementById('orc-obs').value.trim() || null,
        itens: orcItens,
    };
    try {
        if (id) await api('PUT', `/orcamentos/${id}`, body);
        else { const r = await api('POST', '/orcamentos', body); toast(`Orçamento ${r.numero} criado!`); closeModal('modal-orc'); await carregarOrcamentos(); return; }
        toast('Orçamento salvo!');
        closeModal('modal-orc');
        await carregarOrcamentos();
    } catch (e) { toast(e.message, 'error'); }
}

async function mudarStatusOrcSelect(sel) {
    const id = parseInt(sel.dataset.id);
    const novoStatus = sel.value;
    const statusAnterior = sel.dataset.original;
    if (novoStatus === statusAnterior) return;

    try {
        await api('PATCH', `/orcamentos/${id}/status`, { status: novoStatus });
        sel.dataset.original = novoStatus;
        orcAtualizarEstiloSelect(sel, novoStatus);
        const item = orcList.find(o => o.id === id);
        if (item) item.status = novoStatus;
        toast(`Status atualizado: ${ORC_STATUS[novoStatus]?.label}`);

        if (novoStatus === 'aprovado') {
            const orc = await api('GET', `/orcamentos/${id}`);
            window._orcamentoPendente = orc;
            navigateTo('ordens');
        }
    } catch (e) {
        sel.value = statusAnterior;
        toast(e.message, 'error');
    }
}

async function visualizarOrc(id) {
    try {
        const o = await api('GET', `/orcamentos/${id}`);
        if (!o) return;

        let overlay = document.getElementById('modal-view-orc');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'modal-view-orc';
            overlay.className = 'modal-overlay';
            document.body.appendChild(overlay);
        }

        const cli = o.cliente_nome || o.cliente_nome_avulso || 'Cliente Avulso';
        const tel = o.cliente_telefone || o.cliente_telefone_avulso || '';
        const validade = dataValidadeOrc(o.criado_em, o.validade_dias);
        const s = ORC_STATUS[o.status] || ORC_STATUS.pendente;

        const itensHtml = (o.itens || []).length
            ? `<table style="margin:0">
                <thead><tr><th>Descrição</th><th style="text-align:center">Qtd</th><th style="text-align:right">Unit.</th><th style="text-align:right">Subtotal</th></tr></thead>
                <tbody>${(o.itens || []).map(it => `
                  <tr>
                    <td>${it.descricao}${it.servico_id ? ' <span style="font-size:10px;color:#1a56db;background:#eff6ff;padding:1px 5px;border-radius:4px">serv.</span>' : ''}</td>
                    <td style="text-align:center">${it.quantidade}</td>
                    <td style="text-align:right">${formatCurrency(it.preco_unitario)}</td>
                    <td style="text-align:right;font-weight:600">${formatCurrency(it.quantidade * it.preco_unitario)}</td>
                  </tr>`).join('')}
                </tbody>
               </table>`
            : '<p style="color:#94a3b8;font-size:13px;margin:0">Nenhum item cadastrado.</p>';

        overlay.innerHTML = `
        <div class="modal modal-lg">
          <div class="modal-header">
            <span class="modal-title">Orçamento ${o.numero}</span>
            <button class="modal-close" onclick="closeModal('modal-view-orc')">&times;</button>
          </div>
          <div class="modal-body">

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
              <div style="background:#f8fafc;border-radius:12px;padding:16px">
                <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:10px">Cliente</div>
                <div style="font-weight:700;font-size:15px;color:#1e293b;margin-bottom:4px">${cli}</div>
                ${tel ? `<div style="font-size:13px;margin-top:4px">📞 ${tel}</div>` : ''}
              </div>
              <div style="background:#f8fafc;border-radius:12px;padding:16px">
                <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:10px">Informações</div>
                <div style="font-size:13px;margin-bottom:6px"><span style="color:#64748b">Data:</span> <strong>${formatDate(o.criado_em)}</strong></div>
                <div style="font-size:13px;margin-bottom:6px"><span style="color:#64748b">Válido até:</span> <strong>${validade}</strong></div>
                <div style="font-size:13px;margin-bottom:6px"><span style="color:#64748b">Status:</span> <span style="font-size:12px;font-weight:700;color:${s.color};background:${s.bg};padding:2px 10px;border-radius:10px">${s.label}</span></div>
                ${o.vendedor_nome ? `<div style="font-size:13px"><span style="color:#64748b">Funcionário:</span> <strong>${o.vendedor_nome}</strong></div>` : ''}
              </div>
            </div>

            ${o.descricao ? `<div style="background:#f8fafc;border-radius:10px;padding:14px;margin-bottom:16px">
              <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:6px">Descrição</div>
              <div style="font-size:13px;color:#1e293b;white-space:pre-wrap">${o.descricao}</div>
            </div>` : ''}

            <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:8px">Itens</div>
            <div style="max-height:240px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:16px">
              ${itensHtml}
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
              ${o.observacoes ? `<div style="font-size:12px;color:#64748b;flex:1"><strong>Obs:</strong> ${o.observacoes}</div>` : '<div></div>'}
              <div style="font-size:22px;font-weight:800;color:#1a56db">Total: ${formatCurrency(o.total)}</div>
            </div>

          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="closeModal('modal-view-orc')">Fechar</button>
            <button class="btn btn-secondary" onclick="closeModal('modal-view-orc');abrirEnvioOrc(${o.id})">
              <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor"><path d="M12 2C6.48 2 2 6.48 2 12c0 1.77.46 3.43 1.27 4.87L2 22l5.26-1.25A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2z"/></svg>
              WhatsApp
            </button>
            <a class="btn btn-primary" href="/api/pdf/orcamento/${o.id}?t=${getToken()}" target="_blank">📄 Gerar PDF</a>
          </div>
        </div>`;

        openModal('modal-view-orc');
    } catch (e) { toast(e.message, 'error'); }
}

async function excluirOrc(id, numero) {
    if (!await modalConfirmar({ titulo: 'Excluir Orçamento', mensagem: `Excluir o orçamento <strong>${numero}</strong>?`, icone: '🗑️', corBotao: '#dc2626', textoBotao: 'Excluir' })) return;
    try {
        await api('DELETE', `/orcamentos/${id}`);
        toast('Orçamento excluído!');
        await carregarOrcamentos();
    } catch (e) { toast(e.message, 'error'); }
}

// ── Envio WhatsApp ────────────────────────────────────────────────────────────

function abrirEnvioOrc(id) {
    const orc = orcList.find(o => o.id === id);
    if (!orc) return;
    document.getElementById('orc-enviar-id').value = id;
    document.getElementById('orc-enviar-numero').textContent = `Orçamento ${orc.numero} — ${formatCurrency(orc.total)}`;
    // Preencher telefone do cliente
    const tel = orc.cliente_telefone || orc.cliente_telefone_avulso || '';
    document.getElementById('orc-enviar-tel').value = aplicarMascaraTelefone(tel);
    document.getElementById('orc-tipo-texto').checked = true;
    document.getElementById('orc-tipo-pdf').checked = true;
    orcTipoChange();
    openModal('modal-orc-enviar');
}

function orcTipoChange() {
    const texto = document.getElementById('orc-tipo-texto').checked;
    const pdf = document.getElementById('orc-tipo-pdf').checked;
    const lblT = document.getElementById('label-orc-tipo-texto');
    const lblP = document.getElementById('label-orc-tipo-pdf');
    lblT.style.borderColor = texto ? '#1a56db' : '#e2e8f0';
    lblT.style.background = texto ? '#eff6ff' : '';
    lblP.style.borderColor = pdf ? '#1a56db' : '#e2e8f0';
    lblP.style.background = pdf ? '#eff6ff' : '';
    document.getElementById('btn-confirmar-enviar').disabled = !texto && !pdf;
}

async function confirmarEnvioOrc() {
    const id = document.getElementById('orc-enviar-id').value;
    const telefone = document.getElementById('orc-enviar-tel').value.replace(/\D/g, '');
    if (!telefone) { toast('Informe o telefone', 'error'); return; }
    const texto = document.getElementById('orc-tipo-texto').checked;
    const pdf = document.getElementById('orc-tipo-pdf').checked;
    if (!texto && !pdf) { toast('Selecione pelo menos uma opção', 'warning'); return; }
    const tipo = texto && pdf ? 'ambos' : texto ? 'texto' : 'pdf';

    const btn = document.getElementById('btn-confirmar-enviar');
    btn.disabled = true;
    btn.textContent = 'Enviando...';
    try {
        await api('POST', `/orcamentos/${id}/enviar`, { telefone, tipo }, 30000);
        toast('Orçamento enviado pelo WhatsApp!');
        closeModal('modal-orc-enviar');
    } catch (e) {
        toast(e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<svg viewBox="0 0 24 24" style="width:15px;height:15px;fill:currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg> Enviar`;
    }
}
