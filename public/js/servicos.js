let servicosList = [];
let produtosParaServico = [];

async function servicos(el) {
    produtosParaServico = await api('GET', '/produtos');

    const prodOpts = `<option value="">-- Nenhum (não consome estoque) --</option>` +
        produtosParaServico.map(p => `<option value="${p.id}" data-unidade="${p.unidade || 'un'}">${p.nome} (estq: ${p.estoque} ${p.unidade || 'un'})</option>`).join('');

    el.innerHTML = `
  <div class="card">
    <div class="card-header">
      <span class="card-title">Tipos de Serviço</span>
      <button class="btn btn-primary" onclick="abrirModalServico()">
        <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
        Novo Serviço
      </button>
    </div>
    <div id="tabela-servicos"></div>
  </div>
  <div class="modal-overlay" id="modal-servico">
    <div class="modal modal-sm">
      <div class="modal-header">
        <span class="modal-title" id="modal-servico-title">Novo Serviço</span>
        <button class="modal-close" onclick="closeModal('modal-servico')">&times;</button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="servico-id">
        <div class="form-group" style="margin-bottom:14px">
          <label>Nome do Serviço *</label>
          <input type="text" id="servico-nome">
        </div>
        <div class="form-group" style="margin-bottom:14px">
          <label>Preço Base (R$)</label>
          <input type="number" id="servico-preco" step="0.01" min="0" value="0">
        </div>
        <div class="form-group" style="margin-bottom:14px">
          <label>Descrição</label>
          <textarea id="servico-desc" style="min-height:60px"></textarea>
        </div>
        <div style="border-top:1px solid #e2e8f0;padding-top:14px;margin-top:4px">
          <div style="font-size:12px;font-weight:600;color:#64748b;margin-bottom:10px;text-transform:uppercase;letter-spacing:.4px">Produto consumido no estoque</div>
          <div class="form-group" style="margin-bottom:10px">
            <label>Produto vinculado</label>
            <select id="servico-produto" onchange="servicoProdutoChange(this)">${prodOpts}</select>
          </div>
          <div class="form-group" id="servico-qtd-wrap" style="display:none">
            <label>Quantidade consumida por execução</label>
            <div style="display:flex;align-items:center;gap:8px">
              <input type="number" id="servico-produto-qtd" step="0.01" min="0.01" value="1" style="max-width:120px">
              <span id="servico-produto-unidade" style="color:#64748b;font-size:13px"></span>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('modal-servico')">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarServico()">Salvar</button>
      </div>
    </div>
  </div>`;
    await carregarServicos();
}

function servicoProdutoChange(sel) {
    const wrap = document.getElementById('servico-qtd-wrap');
    const unidade = document.getElementById('servico-produto-unidade');
    if (sel.value) {
        wrap.style.display = '';
        const opt = sel.options[sel.selectedIndex];
        unidade.textContent = opt.dataset.unidade || 'un';
    } else {
        wrap.style.display = 'none';
    }
}

async function carregarServicos() {
    servicosList = await api('GET', '/servicos');
    const el = document.getElementById('tabela-servicos');
    if (!servicosList.length) { el.innerHTML = '<div class="empty-state"><h3>Nenhum serviço cadastrado</h3></div>'; return; }
    el.innerHTML = `<table>
    <thead><tr><th>Serviço</th><th>Descrição</th><th>Preço Base</th><th>Produto vinculado</th><th style="width:100px">Ações</th></tr></thead>
    <tbody>${servicosList.map(s => `
      <tr>
        <td><strong>${s.nome}</strong></td>
        <td>${s.descricao || '<span class="text-muted">-</span>'}</td>
        <td class="currency">${formatCurrency(s.preco_base)}</td>
        <td>${s.produto_id
            ? `<span style="font-size:12px;background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:12px">${s.produto_nome} × ${s.produto_quantidade} ${s.produto_unidade || 'un'}</span>`
            : '<span class="text-muted" style="font-size:12px">—</span>'
        }</td>
        <td><div class="actions-cell">
          <button class="btn btn-sm btn-secondary btn-icon" onclick="editarServico(${s.id})"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button>
          <button class="btn btn-sm btn-danger btn-icon" onclick="excluirServico(${s.id})"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>
        </div></td>
      </tr>`).join('')}
    </tbody>
  </table>`;
}

function abrirModalServico() {
    document.getElementById('servico-id').value = '';
    document.getElementById('servico-nome').value = '';
    document.getElementById('servico-preco').value = 0;
    document.getElementById('servico-desc').value = '';
    document.getElementById('servico-produto').value = '';
    document.getElementById('servico-produto-qtd').value = 1;
    document.getElementById('servico-qtd-wrap').style.display = 'none';
    document.getElementById('modal-servico-title').textContent = 'Novo Serviço';
    openModal('modal-servico');
}

function editarServico(id) {
    const s = servicosList.find(x => x.id === id);
    if (!s) return;
    document.getElementById('servico-id').value = s.id;
    document.getElementById('servico-nome').value = s.nome;
    document.getElementById('servico-preco').value = s.preco_base;
    document.getElementById('servico-desc').value = s.descricao || '';
    document.getElementById('servico-produto').value = s.produto_id || '';
    document.getElementById('servico-produto-qtd').value = s.produto_quantidade || 1;
    const wrap = document.getElementById('servico-qtd-wrap');
    wrap.style.display = s.produto_id ? '' : 'none';
    if (s.produto_id) {
        document.getElementById('servico-produto-unidade').textContent = s.produto_unidade || 'un';
    }
    document.getElementById('modal-servico-title').textContent = 'Editar Serviço';
    openModal('modal-servico');
}

async function salvarServico() {
    const id = document.getElementById('servico-id').value;
    const produto_id = document.getElementById('servico-produto').value || null;
    const body = {
        nome: document.getElementById('servico-nome').value,
        preco_base: parseFloat(document.getElementById('servico-preco').value) || 0,
        descricao: document.getElementById('servico-desc').value,
        produto_id: produto_id ? parseInt(produto_id) : null,
        produto_quantidade: produto_id ? (parseFloat(document.getElementById('servico-produto-qtd').value) || 1) : 1,
    };
    if (!body.nome) { toast('Nome é obrigatório', 'error'); return; }
    try {
        if (id) await api('PUT', `/servicos/${id}`, body);
        else await api('POST', '/servicos', body);
        toast('Serviço salvo!');
        closeModal('modal-servico');
        await carregarServicos();
    } catch (e) { toast(e.message, 'error'); }
}

async function excluirServico(id) {
    if (!confirmDialog('Confirma exclusão do serviço?')) return;
    await api('DELETE', `/servicos/${id}`);
    toast('Serviço excluído!');
    await carregarServicos();
}
