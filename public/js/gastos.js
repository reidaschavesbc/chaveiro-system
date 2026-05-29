// === CONTROLE DE GASTOS ===

const FPAG = {
  dinheiro: { label: 'Dinheiro', icon: '💵', color: '#15803d', bg: '#f0fdf4' },
  cartao:   { label: 'Cartão',   icon: '💳', color: '#1d4ed8', bg: '#eff6ff' },
  pix:      { label: 'Pix',      icon: '⚡', color: '#7c3aed', bg: '#fdf4ff' },
};

function badgeFpag(fp) {
  const c = FPAG[fp] || FPAG.dinheiro;
  return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:600;background:${c.bg};color:${c.color}">${c.icon} ${c.label}</span>`;
}

const CAT = {
  material:    { label: 'Material',    color: '#1d4ed8', bg: '#eff6ff',  icon: '🔧' },
  combustivel: { label: 'Combustível', color: '#c2410c', bg: '#fff7ed',  icon: '⛽' },
  alimentacao: { label: 'Alimentação', color: '#15803d', bg: '#f0fdf4',  icon: '🍽️' },
  manutencao:  { label: 'Manutenção',  color: '#7c3aed', bg: '#fdf4ff',  icon: '🔩' },
  servicos:    { label: 'Serviços',    color: '#0891b2', bg: '#ecfeff',  icon: '📋' },
  outros:      { label: 'Outros',      color: '#475569', bg: '#f1f5f9',  icon: '📌' },
};

function badgeCat(cat) {
  const c = CAT[cat] || CAT.outros;
  return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:600;background:${c.bg};color:${c.color}">${c.icon} ${c.label}</span>`;
}

const fmtVal = v => 'R$ ' + parseFloat(v||0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const fmtDate = s => s ? s.slice(0,10).split('-').reverse().join('/') : '—';

let gastosData = null;

async function gastos(el) {
  const hoje = new Date();
  const di = hoje.toISOString().slice(0,7) + '-01';
  const df = hoje.toLocaleDateString('en-CA');

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <input type="date" id="g-di" value="${di}" style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px">
        <span style="color:#94a3b8">até</span>
        <input type="date" id="g-df" value="${df}" style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px">
        <select id="g-cat" style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;background:#fff">
          <option value="">Todas as categorias</option>
          ${Object.entries(CAT).map(([k,v]) => `<option value="${k}">${v.icon} ${v.label}</option>`).join('')}
        </select>
        <button class="btn btn-secondary btn-sm" onclick="gastosCarregar()">Filtrar</button>
      </div>
      <button class="btn btn-primary" onclick="gastosAbrir()">+ Novo Gasto</button>
    </div>
    <div id="g-resumo"></div>
    <div class="card" style="margin-top:20px">
      <div class="card-header">
        <span class="card-title">Lançamentos</span>
      </div>
      <div id="g-lista"></div>
    </div>
    ${gastosModalHtml()}
  `;

  document.getElementById('g-di').addEventListener('keydown', e => e.key==='Enter' && gastosCarregar());
  document.getElementById('g-df').addEventListener('keydown', e => e.key==='Enter' && gastosCarregar());
  await gastosCarregar();
}

async function gastosCarregar() {
  const di = document.getElementById('g-di')?.value || '';
  const df = document.getElementById('g-df')?.value || '';
  const cat = document.getElementById('g-cat')?.value || '';

  let url = `/gastos?data_inicio=${di}&data_fim=${df}`;
  if (cat) url += `&categoria=${cat}`;

  try {
    gastosData = await api('GET', url);
    gastosRenderResumo(gastosData);
    gastosRenderLista(gastosData);
  } catch (e) {
    toast(e.message, 'error');
  }
}

function gastosRenderResumo(data) {
  const el = document.getElementById('g-resumo');
  if (!el) return;

  const totalPorCat = data.por_categoria || [];

  const catCards = totalPorCat.map(c => {
    const cfg = CAT[c.categoria] || CAT.outros;
    const pct = data.total > 0 ? ((c.total / data.total) * 100).toFixed(0) : 0;
    return `
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px 18px;min-width:160px;flex:1">
        <div style="font-size:22px;margin-bottom:6px">${cfg.icon}</div>
        <div style="font-size:11px;font-weight:600;color:${cfg.color};text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">${cfg.label}</div>
        <div style="font-size:18px;font-weight:800;color:#1e293b">${fmtVal(c.total)}</div>
        <div style="font-size:11px;color:#94a3b8;margin-top:2px">${c.qtd} lançamento${c.qtd !== 1 ? 's' : ''} · ${pct}%</div>
        <div style="margin-top:8px;height:4px;background:#f1f5f9;border-radius:2px">
          <div style="height:4px;background:${cfg.color};border-radius:2px;width:${pct}%"></div>
        </div>
      </div>`;
  }).join('');

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:auto 1fr;gap:16px;align-items:start">
      <div style="background:linear-gradient(135deg,#ef4444,#f87171);border-radius:16px;padding:20px 28px;color:#fff;min-width:200px">
        <div style="font-size:13px;font-weight:600;opacity:.85;margin-bottom:6px">Total do Período</div>
        <div style="font-size:28px;font-weight:800;line-height:1">${fmtVal(data.total)}</div>
        <div style="font-size:12px;margin-top:8px;opacity:.8">${(data.gastos||[]).length} lançamento${(data.gastos||[]).length !== 1 ? 's' : ''}</div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:10px">
        ${catCards || '<div style="color:#94a3b8;font-size:13px;padding:20px">Nenhum gasto neste período.</div>'}
      </div>
    </div>`;
}

function gastosRenderLista(data) {
  const el = document.getElementById('g-lista');
  if (!el) return;

  if (!data.gastos?.length) {
    el.innerHTML = `<div style="text-align:center;padding:32px;color:#94a3b8;font-size:13px">Nenhum gasto registrado neste período.</div>`;
    return;
  }

  el.innerHTML = `
    <table>
      <thead>
        <tr>
          <th style="width:100px">Data</th>
          <th>Descrição</th>
          <th style="width:120px">Categoria</th>
          <th style="width:100px">Pagamento</th>
          <th style="width:110px">Valor</th>
          <th style="width:80px"></th>
        </tr>
      </thead>
      <tbody>
        ${data.gastos.map(g => `
          <tr>
            <td style="color:#64748b;font-size:12px">${fmtDate(g.data)}</td>
            <td>
              <div style="font-weight:500;font-size:13px">${g.descricao}</div>
              ${g.observacoes ? `<div style="font-size:11px;color:#94a3b8">${g.observacoes}</div>` : ''}
            </td>
            <td>${badgeCat(g.categoria)}</td>
            <td>${badgeFpag(g.forma_pagamento)}</td>
            <td style="font-weight:700;color:#dc2626">${fmtVal(g.valor)}</td>
            <td>
              <div style="display:flex;gap:6px">
                <button class="btn btn-sm btn-secondary" style="padding:4px 8px" onclick="gastosEditar(${g.id})">✏️</button>
                <button class="btn btn-sm" style="padding:4px 8px;background:#fee2e2;color:#dc2626;border:none" onclick="gastosExcluir(${g.id}, '${g.descricao.replace(/'/g, "\\'")}')">🗑️</button>
              </div>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function gastosModalHtml() {
  return `
    <div id="g-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;align-items:center;justify-content:center" onclick="if(event.target===this)gastosFecharModal()">
      <div style="background:#fff;border-radius:16px;padding:28px;width:100%;max-width:460px;box-shadow:0 20px 60px rgba(0,0,0,.2)" onclick="event.stopPropagation()">
        <div style="font-size:17px;font-weight:700;margin-bottom:20px" id="g-modal-titulo">Novo Gasto</div>
        <input type="hidden" id="g-id">
        <div class="form-grid">
          <div class="form-group form-full">
            <label>Descrição *</label>
            <input type="text" id="g-descricao">
          </div>
          <div class="form-group">
            <label>Valor (R$) *</label>
            <input type="number" id="g-valor" min="0.01" step="0.01">
          </div>
          <div class="form-group">
            <label>Data</label>
            <input type="date" id="g-data" value="${new Date().toLocaleDateString('en-CA')}">
          </div>
          <div class="form-group">
            <label>Categoria</label>
            <select id="g-categoria">
              ${Object.entries(CAT).map(([k,v]) => `<option value="${k}">${v.icon} ${v.label}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Forma de Pagamento</label>
            <select id="g-fpag">
              ${Object.entries(FPAG).map(([k,v]) => `<option value="${k}">${v.icon} ${v.label}</option>`).join('')}
            </select>
          </div>
          <div class="form-group form-full">
            <label>Observações</label>
            <input type="text" id="g-obs">
          </div>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px">
          <button class="btn btn-secondary" onclick="gastosFecharModal()">Cancelar</button>
          <button class="btn btn-primary" onclick="gastosSalvar()">Salvar</button>
        </div>
      </div>
    </div>`;
}

function gastosAbrir() {
  document.getElementById('g-id').value = '';
  document.getElementById('g-modal-titulo').textContent = 'Novo Gasto';
  document.getElementById('g-descricao').value = '';
  document.getElementById('g-valor').value = '';
  document.getElementById('g-data').value = new Date().toLocaleDateString('en-CA');
  document.getElementById('g-categoria').value = 'outros';
  document.getElementById('g-fpag').value = 'dinheiro';
  document.getElementById('g-obs').value = '';
  document.getElementById('g-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('g-descricao').focus(), 80);
}

function gastosEditar(id) {
  const g = gastosData?.gastos?.find(x => x.id === id);
  if (!g) return;
  document.getElementById('g-id').value = g.id;
  document.getElementById('g-modal-titulo').textContent = 'Editar Gasto';
  document.getElementById('g-descricao').value = g.descricao;
  document.getElementById('g-valor').value = g.valor;
  document.getElementById('g-data').value = g.data?.slice(0,10) || '';
  document.getElementById('g-categoria').value = g.categoria;
  document.getElementById('g-fpag').value = g.forma_pagamento || 'dinheiro';
  document.getElementById('g-obs').value = g.observacoes || '';
  document.getElementById('g-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('g-descricao').focus(), 80);
}

function gastosFecharModal() {
  document.getElementById('g-modal').style.display = 'none';
}

async function gastosSalvar() {
  const id = document.getElementById('g-id').value;
  const body = {
    descricao:        document.getElementById('g-descricao').value.trim(),
    valor:            document.getElementById('g-valor').value,
    data:             document.getElementById('g-data').value,
    categoria:        document.getElementById('g-categoria').value,
    forma_pagamento:  document.getElementById('g-fpag').value,
    observacoes:      document.getElementById('g-obs').value.trim(),
  };

  if (!body.descricao) { toast('Preencha a descrição', 'warning'); return; }
  if (!body.valor || parseFloat(body.valor) <= 0) { toast('Informe um valor válido', 'warning'); return; }

  try {
    if (id) {
      await api('PUT', `/gastos/${id}`, body);
      toast('Gasto atualizado!');
    } else {
      await api('POST', '/gastos', body);
      toast('Gasto registrado!');
    }
    gastosFecharModal();
    await gastosCarregar();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function gastosExcluir(id, descricao) {
  if (!await pedirSenhaGerente()) return;
  const ok = await modalConfirmar({ titulo: 'Excluir Gasto', mensagem: `Excluir o gasto <strong>${descricao}</strong>?`, icone: '🗑️', corBotao: '#dc2626', textoBotao: 'Excluir' });
  if (!ok) return;
  try {
    await api('DELETE', `/gastos/${id}`, {});
    toast('Gasto excluído');
    await gastosCarregar();
  } catch (e) {
    toast(e.message, 'error');
  }
}
