let servicosList = [];
let produtosParaServico = [];
let servicoProdutoSelecionado = null;
let _servicoProdDrop = null;

function _servicoProdEnsureDrop() {
  if (!_servicoProdDrop) {
    _servicoProdDrop = document.createElement('div');
    _servicoProdDrop.style.cssText = 'position:fixed;z-index:10000;background:#fff;border:2px solid #1a56db;border-top:none;border-radius:0 0 10px 10px;max-height:240px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,.12);display:none';
    document.body.appendChild(_servicoProdDrop);
  }
  return _servicoProdDrop;
}

function filtrarProdutosServico() {
  const input = document.getElementById('servico-produto-busca');
  const q = (input.value || '').toLowerCase();
  if (!q) { servicoProdutoSelecionado = null; document.getElementById('servico-qtd-wrap').style.display = 'none'; }
  const drop = _servicoProdEnsureDrop();
  const rect = input.getBoundingClientRect();
  drop.style.left = rect.left + 'px';
  drop.style.top = rect.bottom + 'px';
  drop.style.width = rect.width + 'px';
  const lista = produtosParaServico.filter(p => !q || p.nome.toLowerCase().includes(q));
  if (!lista.length) { drop.style.display = 'none'; return; }
  drop.innerHTML = lista.map(p =>
    `<div onmousedown="escolherProdutoServico(${p.id})"
       style="padding:9px 14px;cursor:pointer;font-size:14px;border-bottom:1px solid #f1f5f9"
       onmouseover="this.style.background='#eff6ff'" onmouseout="this.style.background=''"
    >${p.nome} <span style="color:#94a3b8;font-size:12px">(estq: ${p.estoque} ${p.unidade || 'un'})</span></div>`
  ).join('');
  drop.style.display = 'block';
}

function escolherProdutoServico(id) {
  const p = produtosParaServico.find(x => x.id === id);
  if (!p) return;
  servicoProdutoSelecionado = p;
  document.getElementById('servico-produto-busca').value = p.nome;
  document.getElementById('servico-qtd-wrap').style.display = '';
  document.getElementById('servico-produto-unidade').textContent = p.unidade || 'un';
  if (_servicoProdDrop) _servicoProdDrop.style.display = 'none';
}

function fecharDropdownServico() {
  setTimeout(() => { if (_servicoProdDrop) _servicoProdDrop.style.display = 'none'; }, 150);
}

async function servicos(el) {
    produtosParaServico = await api('GET', '/produtos');


    el.innerHTML = `
  <div class="card">
    <div class="card-header">
      <span class="card-title">Tipos de Serviço</span>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <div style="position:relative">
          <svg viewBox="0 0 24 24" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);width:16px;height:16px;fill:#94a3b8;pointer-events:none"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          <input type="text" id="servico-busca" placeholder="Pesquisar serviço..." oninput="filtrarServicos()"
            style="padding:8px 12px 8px 34px;border:2px solid #e5e7eb;border-radius:10px;font-size:14px;width:220px">
        </div>
        <button class="btn btn-primary" onclick="abrirModalServico()">
          <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
          Novo Serviço
        </button>
      </div>
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
        <div class="form-group" style="margin-bottom:14px">
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-weight:500">
            <input type="checkbox" id="servico-perguntar-estoque" style="width:16px;height:16px;cursor:pointer;accent-color:#6366f1">
            <span>Perguntar sobre uso de estoque ao finalizar OS</span>
          </label>
          <p style="font-size:12px;color:#94a3b8;margin-top:4px;margin-left:26px">Ao concluir uma OS com este serviço, pergunta se houve consumo de materiais.</p>
        </div>
        <div style="border-top:1px solid #e2e8f0;padding-top:14px;margin-top:4px">
          <div style="font-size:12px;font-weight:600;color:#64748b;margin-bottom:10px;text-transform:uppercase;letter-spacing:.4px">Produto consumido no estoque</div>
          <div class="form-group" style="margin-bottom:10px">
            <label>Produto vinculado</label>
            <input type="text" id="servico-produto-busca" placeholder="🔍 Buscar produto..." autocomplete="off"
              oninput="filtrarProdutosServico()" onfocus="filtrarProdutosServico()" onblur="fecharDropdownServico()"
              style="width:100%;padding:9px 14px;border:2px solid #e5e7eb;border-radius:10px;font-size:14px;box-sizing:border-box">
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


function _renderServicos(lista) {
    const el = document.getElementById('tabela-servicos');
    if (!lista.length) { el.innerHTML = '<div class="empty-state"><h3>Nenhum serviço encontrado</h3></div>'; return; }
    el.innerHTML = `<table>
    <thead><tr><th>Serviço</th><th>Descrição</th><th>Preço Base</th><th>Produto vinculado</th><th style="width:100px">Ações</th></tr></thead>
    <tbody>${lista.map(s => `
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

function filtrarServicos() {
    const q = (document.getElementById('servico-busca')?.value || '').toLowerCase().trim();
    const lista = !q ? servicosList : servicosList.filter(s =>
        s.nome.toLowerCase().includes(q) || (s.descricao || '').toLowerCase().includes(q)
    );
    _renderServicos(lista);
}

async function carregarServicos() {
    servicosList = await api('GET', '/servicos');
    filtrarServicos();
}

function abrirModalServico() {
    document.getElementById('servico-id').value = '';
    document.getElementById('servico-nome').value = '';
    document.getElementById('servico-preco').value = 0;
    document.getElementById('servico-desc').value = '';
    document.getElementById('servico-produto-busca').value = '';
    servicoProdutoSelecionado = null;
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
    if (s.produto_id) {
        const p = produtosParaServico.find(x => x.id === s.produto_id);
        document.getElementById('servico-produto-busca').value = p ? p.nome : (s.produto_nome || '');
        servicoProdutoSelecionado = p || { id: s.produto_id, nome: s.produto_nome || '', unidade: s.produto_unidade || 'un' };
        document.getElementById('servico-produto-unidade').textContent = s.produto_unidade || 'un';
    } else {
        document.getElementById('servico-produto-busca').value = '';
        servicoProdutoSelecionado = null;
    }
    document.getElementById('servico-produto-qtd').value = s.produto_quantidade || 1;
    document.getElementById('servico-perguntar-estoque').checked = !!s.perguntar_estoque;
    document.getElementById('servico-qtd-wrap').style.display = s.produto_id ? '' : 'none';
    document.getElementById('modal-servico-title').textContent = 'Editar Serviço';
    openModal('modal-servico');
}

async function salvarServico() {
    const id = document.getElementById('servico-id').value;
    const produto_id = servicoProdutoSelecionado?.id || null;
    const body = {
        nome: document.getElementById('servico-nome').value,
        preco_base: parseFloat(document.getElementById('servico-preco').value) || 0,
        descricao: document.getElementById('servico-desc').value,
        produto_id: produto_id || null,
        produto_quantidade: produto_id ? (parseFloat(document.getElementById('servico-produto-qtd').value) || 1) : 1,
        perguntar_estoque: document.getElementById('servico-perguntar-estoque').checked ? 1 : 0,
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
    if (!await pedirSenhaGerente()) return;
    if (!await confirmDialog('Confirma exclusão do serviço?')) return;
    await api('DELETE', `/servicos/${id}`);
    toast('Serviço excluído!');
    await carregarServicos();
}
