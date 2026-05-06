// === CONSUMO INTERNO ===

const CONS_CAT = {
  erro_corte: { label: 'Erro de Corte',  icon: '✂️',  color: '#dc2626', bg: '#fee2e2' },
  garantia:   { label: 'Garantia',        icon: '🔄',  color: '#d97706', bg: '#fef3c7' },
  uso_interno:{ label: 'Uso Interno',     icon: '🔧',  color: '#2563eb', bg: '#eff6ff' },
  outros:     { label: 'Outros',           icon: '📦',  color: '#475569', bg: '#f1f5f9' },
};

const consFmtDate = s => s ? s.slice(0,10).split('-').reverse().join('/') : '—';

let consData = null;
let consProdutos = [];

async function consumo(el) {
  const hoje = new Date();
  const di = hoje.toISOString().slice(0,7) + '-01';
  const df = hoje.toLocaleDateString('en-CA');

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <input type="date" id="cons-di" value="${di}" style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px">
        <span style="color:#94a3b8">até</span>
        <input type="date" id="cons-df" value="${df}" style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px">
        <select id="cons-cat-filtro" style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;background:#fff">
          <option value="">Todas as categorias</option>
          ${Object.entries(CONS_CAT).map(([k,v]) => `<option value="${k}">${v.icon} ${v.label}</option>`).join('')}
        </select>
        <button class="btn btn-secondary btn-sm" onclick="consCarregar()">Filtrar</button>
      </div>
      <button class="btn btn-primary" onclick="consAbrirModal()">+ Registrar Consumo</button>
    </div>

    <div id="cons-resumo" style="margin-bottom:20px"></div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">Histórico de Consumo Interno</span>
      </div>
      <div id="cons-lista"></div>
    </div>

    ${consModalHtml()}
  `;

  consProdutos = await api('GET', '/produtos').catch(() => []);
  await consCarregar();
}

async function consCarregar() {
  const di  = document.getElementById('cons-di')?.value || '';
  const df  = document.getElementById('cons-df')?.value || '';
  const cat = document.getElementById('cons-cat-filtro')?.value || '';
  let url = `/consumo?data_inicio=${di}&data_fim=${df}`;
  if (cat) url += `&categoria=${cat}`;
  try {
    consData = await api('GET', url);
    consRenderResumo();
    consRenderLista();
  } catch (e) { toast(e.message, 'error'); }
}

function consRenderResumo() {
  const el = document.getElementById('cons-resumo');
  if (!el || !consData) return;

  const catCards = Object.entries(CONS_CAT).map(([k, v]) => {
    const c = consData.por_categoria?.find(x => x.categoria === k);
    if (!c) return '';
    return `
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px 18px;min-width:150px;flex:1">
        <div style="font-size:20px;margin-bottom:4px">${v.icon}</div>
        <div style="font-size:11px;font-weight:600;color:${v.color};text-transform:uppercase;letter-spacing:.5px">${v.label}</div>
        <div style="font-size:20px;font-weight:800;color:#1e293b;margin-top:4px">${c.total_unidades} <span style="font-size:12px;font-weight:400;color:#94a3b8">unid.</span></div>
        <div style="font-size:11px;color:#94a3b8">${c.qtd} registro${c.qtd!==1?'s':''}</div>
      </div>`;
  }).join('');

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:auto 1fr;gap:16px;align-items:start">
      <div style="background:linear-gradient(135deg,#6366f1,#818cf8);border-radius:16px;padding:20px 28px;color:#fff;min-width:180px">
        <div style="font-size:13px;font-weight:600;opacity:.85;margin-bottom:6px">Total Consumido</div>
        <div style="font-size:30px;font-weight:800;line-height:1">${consData.total_itens}</div>
        <div style="font-size:12px;margin-top:6px;opacity:.8">unidades no período</div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:10px">
        ${catCards || '<div style="color:#94a3b8;font-size:13px;padding:20px">Nenhum consumo neste período.</div>'}
      </div>
    </div>`;
}

function consRenderLista() {
  const el = document.getElementById('cons-lista');
  if (!el || !consData) return;

  if (!consData.consumos?.length) {
    el.innerHTML = `<div style="text-align:center;padding:40px;color:#94a3b8;font-size:13px">Nenhum consumo registrado neste período.</div>`;
    return;
  }

  el.innerHTML = `
    <table>
      <thead>
        <tr>
          <th style="width:100px">Data</th>
          <th>Produto</th>
          <th style="width:140px">Categoria</th>
          <th style="width:70px;text-align:center">Qtd</th>
          <th style="width:100px;text-align:center">Estoque</th>
          <th>Observação</th>
        </tr>
      </thead>
      <tbody>
        ${consData.consumos.map(c => {
          const cat = CONS_CAT[c.referencia] || CONS_CAT.outros;
          return `
            <tr>
              <td style="color:#64748b;font-size:12px">${consFmtDate(c.data)}</td>
              <td style="font-weight:600;font-size:13px">${c.produto_nome}</td>
              <td>
                <span style="display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:600;background:${cat.bg};color:${cat.color}">
                  ${cat.icon} ${cat.label}
                </span>
              </td>
              <td style="text-align:center;font-weight:700;color:#dc2626">-${c.quantidade} ${c.unidade}</td>
              <td style="text-align:center;font-size:12px;color:#64748b">${c.estoque_anterior} → ${c.estoque_posterior}</td>
              <td style="font-size:12px;color:#64748b">${c.observacao || '—'}</td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function consModalHtml() {
  const catOpts = Object.entries(CONS_CAT).map(([k,v]) => `<option value="${k}">${v.icon} ${v.label}</option>`).join('');
  return `
    <div id="cons-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;align-items:center;justify-content:center" onclick="if(event.target===this)consFecharModal()">
      <div style="background:#fff;border-radius:16px;padding:28px;width:100%;max-width:500px;box-shadow:0 20px 60px rgba(0,0,0,.2)" onclick="event.stopPropagation()">
        <div style="font-size:17px;font-weight:700;margin-bottom:20px">Registrar Consumo Interno</div>
        <div class="form-grid">
          <div class="form-group form-full">
            <label>Produto *</label>
            <select id="cons-produto" onchange="consAtualizarEstoque()">
              <option value="">-- Selecione o produto --</option>
              ${consProdutos.map(p => `<option value="${p.id}" data-estoque="${p.estoque}" data-unidade="${p.unidade}">${p.nome} (estoque: ${p.estoque} ${p.unidade})</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Quantidade *</label>
            <input type="number" id="cons-qtd" min="1" value="1">
            <div id="cons-estoque-info" style="font-size:11px;color:#64748b;margin-top:4px"></div>
          </div>
          <div class="form-group">
            <label>Categoria *</label>
            <select id="cons-cat">${catOpts}</select>
          </div>
          <div class="form-group">
            <label>OS Relacionada (opcional)</label>
            <input type="text" id="cons-os" placeholder="Ex: OS2404001">
          </div>
          <div class="form-group form-full">
            <label>Observação</label>
            <input type="text" id="cons-obs" placeholder="Ex: Chave travou na máquina, cliente trouxe chave com defeito...">
          </div>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px">
          <button class="btn btn-secondary" onclick="consFecharModal()">Cancelar</button>
          <button class="btn btn-primary" onclick="consSalvar()">Registrar</button>
        </div>
      </div>
    </div>`;
}

function consAtualizarEstoque() {
  const sel = document.getElementById('cons-produto');
  const opt = sel.options[sel.selectedIndex];
  const info = document.getElementById('cons-estoque-info');
  if (!opt.value) { info.textContent = ''; return; }
  const estoque = parseInt(opt.dataset.estoque);
  const unidade = opt.dataset.unidade;
  info.style.color = estoque <= 2 ? '#dc2626' : '#64748b';
  info.textContent = `Disponível: ${estoque} ${unidade}`;
  document.getElementById('cons-qtd').max = estoque;
}

function consAbrirModal() {
  document.getElementById('cons-produto').value = '';
  document.getElementById('cons-qtd').value = '1';
  document.getElementById('cons-cat').value = 'erro_corte';
  document.getElementById('cons-os').value = '';
  document.getElementById('cons-obs').value = '';
  document.getElementById('cons-estoque-info').textContent = '';
  document.getElementById('cons-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('cons-produto').focus(), 80);
}

function consFecharModal() {
  document.getElementById('cons-modal').style.display = 'none';
}

async function consSalvar() {
  const produto_id = document.getElementById('cons-produto').value;
  const quantidade = parseInt(document.getElementById('cons-qtd').value);
  const categoria  = document.getElementById('cons-cat').value;
  const os_ref     = document.getElementById('cons-os').value.trim();
  const observacao = document.getElementById('cons-obs').value.trim();

  if (!produto_id) { toast('Selecione o produto', 'warning'); return; }
  if (!quantidade || quantidade <= 0) { toast('Quantidade inválida', 'warning'); return; }

  try {
    const r = await api('POST', '/consumo', { produto_id, quantidade, categoria, os_referencia: os_ref || null, observacao: observacao || null });
    const cat = CONS_CAT[categoria];
    toast(`${cat.icon} Consumo registrado! Estoque: ${r.estoque_anterior} → ${r.estoque_atual}`);
    consFecharModal();
    consProdutos = await api('GET', '/produtos').catch(() => consProdutos);
    await consCarregar();
  } catch (e) { toast(e.message, 'error'); }
}
