async function nfsePage(container) {
  container.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <input type="date" id="nfse-data-inicio" style="padding:8px 12px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px">
        <input type="date" id="nfse-data-fim"    style="padding:8px 12px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px">
        <button class="btn btn-secondary" onclick="nfseFiltrar()" style="font-size:13px">Filtrar</button>
        <button class="btn btn-secondary" onclick="nfseLimparFiltro()" style="font-size:13px">Limpar</button>
      </div>
      <div id="nfse-total-badge" style="font-size:13px;color:#64748b"></div>
    </div>
    <div id="nfse-lista-container"></div>`;

  document.getElementById('nfse-data-inicio').value = monthStart();
  document.getElementById('nfse-data-fim').value    = today();
  await nfseCarregar();
}

async function nfseCarregar(params = {}) {
  const container = document.getElementById('nfse-lista-container');
  if (!container) return;
  container.innerHTML = '<div class="empty-state"><p>Carregando...</p></div>';

  const inicio = params.inicio || document.getElementById('nfse-data-inicio')?.value || '';
  const fim    = params.fim    || document.getElementById('nfse-data-fim')?.value    || '';

  let url = '/nfse/lista';
  const qs = [];
  if (inicio) qs.push('data_inicio=' + inicio);
  if (fim)    qs.push('data_fim='    + fim);
  if (qs.length) url += '?' + qs.join('&');

  let lista;
  try { lista = await api('GET', url); } catch (e) { container.innerHTML = `<div class="empty-state"><p style="color:#dc2626">${e.message}</p></div>`; return; }

  const badge = document.getElementById('nfse-total-badge');
  if (badge) badge.textContent = `${(lista || []).length} nota(s) encontrada(s)`;

  if (!lista || lista.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>Nenhuma NFS-e emitida no período.</p></div>';
    return;
  }

  container.innerHTML = `
    <div class="table-container">
      <table class="table">
        <thead><tr>
          <th>OS</th>
          <th>Cliente</th>
          <th>Emissão</th>
          <th>Número NFS-e</th>
          <th>Valor</th>
          <th>Status</th>
          <th>Ambiente</th>
          <th style="text-align:center">Ações</th>
        </tr></thead>
        <tbody>
          ${lista.map(n => `
          <tr>
            <td><strong>${n.os_numero}</strong></td>
            <td>${n.cliente_nome}<br><span style="font-size:11px;color:#94a3b8">${n.cliente_cpf || n.cliente_cnpj || ''}</span></td>
            <td>${n.nfse_emitida_em ? formatDate(n.nfse_emitida_em) : '-'}</td>
            <td>${n.nfse_numero ? `<strong style="color:#1d4ed8">${n.nfse_numero}</strong>` : '<span style="color:#94a3b8">—</span>'}</td>
            <td><strong>${formatCurrency(n.valor)}</strong></td>
            <td><span class="badge" style="background:${n.nfse_status === 'autorizada' ? '#dcfce7' : '#fef3c7'};color:${n.nfse_status === 'autorizada' ? '#15803d' : '#92400e'};padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600">${n.nfse_status === 'autorizada' ? 'Autorizada' : n.nfse_status}</span></td>
            <td><span style="font-size:11px;color:${n.nfse_ambiente === '1' ? '#15803d' : '#d97706'}">${n.nfse_ambiente === '1' ? 'Produção' : 'Homologação'}</span></td>
            <td style="text-align:center">
              <div style="display:flex;gap:6px;justify-content:center">
                ${n.nfse_chave_acesso ? `
                  <button class="btn btn-sm" style="background:#0ea5e9;color:#fff;font-size:11px" onclick="nfseVisualizar('${n.nfse_chave_acesso}')">👁 Ver</button>
                  <button class="btn btn-sm" style="background:#6366f1;color:#fff;font-size:11px" onclick="nfseBaixar('${n.nfse_chave_acesso}','${n.nfse_numero || n.os_numero}')">⬇ Baixar</button>
                ` : '<span style="font-size:11px;color:#94a3b8">Sem chave</span>'}
              </div>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

async function nfseFiltrar() {
  await nfseCarregar();
}

async function nfseLimparFiltro() {
  const ini = document.getElementById('nfse-data-inicio');
  const fim = document.getElementById('nfse-data-fim');
  if (ini) ini.value = '';
  if (fim) fim.value = '';
  await nfseCarregar();
}

function nfseVisualizar(chave) {
  window.open(`/api/nfse/danfse/${chave}?token=${getToken()}`, '_blank');
}

async function nfseBaixar(chave, numero) {
  try {
    const res = await fetch(`/api/nfse/danfse/${chave}?token=${getToken()}&download=1`);
    if (!res.ok) { toast('Erro ao baixar a nota', 'error'); return; }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `NFS-e-${numero}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    toast('Erro ao baixar: ' + e.message, 'error');
  }
}
