let valesList = [];
let valesVendedores = [];

async function vales(el) {
    valesVendedores = await api('GET', '/vendedores');
    const hoje = new Date();
    const mesAtual = hoje.getMonth() + 1;
    const anoAtual = hoje.getFullYear();

    el.innerHTML = `
    <div class="card">
      <div class="card-header">
        <span class="card-title">Vales de Funcionários</span>
        <div class="flex gap-2 align-center">
          <select id="vales-filtro-vend" onchange="carregarVales()" class="select-custom">
            <option value="">Todos os funcionários</option>
            ${valesVendedores.map(v => `<option value="${v.id}">${v.nome}</option>`).join('')}
          </select>
          <select id="vales-filtro-mes" onchange="carregarVales()" class="select-custom">
            ${['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
              .map((m,i) => `<option value="${i+1}" ${i+1===mesAtual?'selected':''}>${m}</option>`).join('')}
          </select>
          <input type="number" id="vales-filtro-ano" value="${anoAtual}" style="width:80px" onchange="carregarVales()" class="select-custom">
          <button class="btn btn-primary" onclick="abrirModalVale()">
            <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            Novo Vale
          </button>
        </div>
      </div>
      <div id="tabela-vales"></div>
    </div>

    <div class="modal-overlay" id="modal-vale">
      <div class="modal modal-sm">
        <div class="modal-header">
          <span class="modal-title">Registrar Vale</span>
          <button class="modal-close" onclick="closeModal('modal-vale')">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group" style="margin-bottom:14px">
            <label>Funcionário *</label>
            <select id="vale-vendedor">
              <option value="">-- Selecione --</option>
              ${valesVendedores.map(v => `<option value="${v.id}">${v.nome}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="margin-bottom:14px">
            <label>Valor (R$) *</label>
            <input type="number" id="vale-valor" step="0.01" min="0.01" placeholder="0,00">
          </div>
          <div class="form-group" style="margin-bottom:14px">
            <label>Data *</label>
            <input type="date" id="vale-data" value="${hoje.toLocaleDateString('en-CA')}">
          </div>
          <div class="form-group">
            <label>Descrição</label>
            <input type="text" id="vale-descricao" placeholder="Ex: adiantamento, alimentação...">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal('modal-vale')">Cancelar</button>
          <button class="btn btn-primary" onclick="salvarVale()">Registrar</button>
        </div>
      </div>
    </div>`;

    await carregarVales();
}

async function carregarVales() {
    const vendedor_id = document.getElementById('vales-filtro-vend')?.value || '';
    const mes = document.getElementById('vales-filtro-mes')?.value || '';
    const ano = document.getElementById('vales-filtro-ano')?.value || '';
    let qs = [];
    if (vendedor_id) qs.push(`vendedor_id=${vendedor_id}`);
    if (mes && ano) { qs.push(`mes=${mes}`); qs.push(`ano=${ano}`); }
    valesList = await api('GET', `/vales${qs.length ? '?' + qs.join('&') : ''}`);
    renderVales();
}

function renderVales() {
    const el = document.getElementById('tabela-vales');
    if (!valesList.length) {
        el.innerHTML = '<div class="empty-state"><h3>Nenhum vale encontrado</h3></div>';
        return;
    }

    // Total por funcionário
    const totais = {};
    valesList.forEach(v => {
        if (!totais[v.vendedor_id]) totais[v.vendedor_id] = { nome: v.vendedor_nome, total: 0 };
        totais[v.vendedor_id].total += v.valor;
    });
    const totalGeral = valesList.reduce((s, v) => s + v.valor, 0);

    const resumoHtml = Object.values(totais).map(t => `
        <span style="display:inline-flex;align-items:center;gap:6px;background:#fef3c7;color:#92400e;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600">
            ${t.nome}: ${formatCurrency(t.total)}
        </span>`).join('');

    el.innerHTML = `
        <div style="padding:12px 16px;border-bottom:1px solid #e2e8f0;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <span style="font-size:12px;color:#64748b;margin-right:4px">Totais:</span>
            ${resumoHtml}
            <span style="margin-left:auto;font-weight:700;color:#dc2626">Total: ${formatCurrency(totalGeral)}</span>
        </div>
        <table>
          <thead><tr><th>Data</th><th>Funcionário</th><th>Descrição</th><th>Valor</th><th>Situação</th><th style="width:60px"></th></tr></thead>
          <tbody>
            ${valesList.map(v => `<tr>
              <td style="font-size:12px">${formatDate(v.data)}</td>
              <td><strong>${v.vendedor_nome}</strong></td>
              <td style="color:#64748b;font-size:13px">${v.descricao || '<span class="text-muted">—</span>'}</td>
              <td style="font-weight:700;color:#dc2626">${formatCurrency(v.valor)}</td>
              <td>${v.fechamento_id
                ? '<span style="font-size:11px;background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:12px">Descontado</span>'
                : '<span style="font-size:11px;background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:12px">Pendente</span>'
              }</td>
              <td>${v.fechamento_id ? '' : `<button class="btn btn-sm btn-danger btn-icon" onclick="excluirVale(${v.id})" title="Excluir">
                <svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
              </button>`}</td>
            </tr>`).join('')}
          </tbody>
        </table>`;
}

function abrirModalVale() {
    document.getElementById('vale-vendedor').value = '';
    document.getElementById('vale-valor').value = '';
    document.getElementById('vale-data').value = new Date().toLocaleDateString('en-CA');
    document.getElementById('vale-descricao').value = '';
    openModal('modal-vale');
}

async function salvarVale() {
    const vendedor_id = document.getElementById('vale-vendedor').value;
    const valor = parseFloat(document.getElementById('vale-valor').value);
    const data = document.getElementById('vale-data').value;
    const descricao = document.getElementById('vale-descricao').value.trim();
    if (!vendedor_id) { toast('Selecione o funcionário', 'error'); return; }
    if (!valor || valor <= 0) { toast('Informe o valor', 'error'); return; }
    if (!data) { toast('Informe a data', 'error'); return; }
    try {
        await api('POST', '/vales', { vendedor_id: parseInt(vendedor_id), valor, data, descricao: descricao || null });
        toast('Vale registrado!');
        closeModal('modal-vale');
        await carregarVales();
    } catch (e) { toast(e.message, 'error'); }
}

async function excluirVale(id) {
    if (!await modalConfirmar({ titulo: 'Excluir Vale', mensagem: 'Deseja excluir este vale?', icone: '🗑️', corBotao: '#dc2626', textoBotao: 'Excluir' })) return;
    try {
        await api('DELETE', `/vales/${id}`);
        toast('Vale excluído!');
        await carregarVales();
    } catch (e) { toast(e.message, 'error'); }
}
