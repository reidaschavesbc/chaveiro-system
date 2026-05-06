let produtosList = [];
let imagemPendente = null;
let imagemRemover = false;

async function produtos(el) {
    el.innerHTML = `
  <div class="card">
    <div class="card-header">
      <span class="card-title">Produtos</span>
      <div class="flex gap-2 align-center">
        <div class="search-box">
          <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          <input type="text" id="search-produtos" placeholder="Buscar produto..." oninput="filtrarProdutos()">
        </div>
        <label style="font-size:13px;display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:500;color:#64748b">
          <input type="checkbox" id="filtro-baixo-estoque" onchange="carregarProdutos()"> Estoque baixo
        </label>
        <button class="btn btn-primary" onclick="abrirModalProduto()">
          <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
          Novo Produto
        </button>
      </div>
    </div>
    <div id="tabela-produtos"></div>
  </div>

  <div class="modal-overlay" id="modal-produto">
    <div class="modal modal-md">
      <div class="modal-header">
        <span class="modal-title" id="modal-produto-title">Novo Produto</span>
        <button class="modal-close" onclick="closeModal('modal-produto')">&times;</button>
      </div>
      <div class="modal-body">
        <form id="form-produto">
          <input type="hidden" id="produto-id">
          <div class="form-grid">
            <div class="form-group form-full">
              <label>Nome *</label>
              <input type="text" id="produto-nome" required>
            </div>
            <div class="form-group">
              <label>Código / SKU</label>
              <input type="text" id="produto-codigo">
            </div>
            <div class="form-group">
              <label>Unidade</label>
              <select id="produto-unidade">
                <option value="un">Unidade (un)</option>
                <option value="par">Par</option>
                <option value="cx">Caixa</option>
                <option value="kg">Kg</option>
              </select>
            </div>
            <div class="form-group">
              <label>Preço de Custo (R$)</label>
              <input type="number" id="produto-custo" step="0.01" min="0" value="0">
            </div>
            <div class="form-group">
              <label>Preço de Venda (R$)</label>
              <input type="number" id="produto-venda" step="0.01" min="0" value="0">
            </div>
            <div class="form-group">
              <label>Estoque Atual</label>
              <input type="number" id="produto-estoque" min="0" value="0">
            </div>
            <div class="form-group">
              <label>Estoque Mínimo</label>
              <input type="number" id="produto-estoque-min" min="0" value="5">
            </div>
            <div class="form-group form-full">
              <label>Descrição</label>
              <textarea id="produto-desc"></textarea>
            </div>
            <div class="form-group form-full">
              <label>Foto do Produto</label>
              <div class="img-upload-area">
                <div class="img-upload-preview" id="produto-img-preview">
                  <svg viewBox="0 0 24 24" style="width:40px;height:40px;fill:#cbd5e1"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
                  <span style="color:#94a3b8;font-size:12px;margin-top:4px">Sem foto</span>
                </div>
                <div style="display:flex;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap">
                  <label class="btn btn-secondary btn-sm" style="cursor:pointer;margin:0">
                    📷 Selecionar Foto
                    <input type="file" id="produto-img-input" accept="image/*" style="display:none" onchange="previewImagemProduto(this)">
                  </label>
                  <button type="button" class="btn btn-sm" id="btn-remover-img" style="display:none;background:#fee2e2;color:#dc2626;border:1px solid #fecaca" onclick="removerImagemProduto()">✕ Remover Foto</button>
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('modal-produto')">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarProduto()">Salvar</button>
      </div>
    </div>
  </div>

  <div class="modal-overlay" id="modal-entrada-estoque">
    <div class="modal modal-sm">
      <div class="modal-header">
        <span class="modal-title">Entrada de Estoque</span>
        <button class="modal-close" onclick="closeModal('modal-entrada-estoque')">&times;</button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="entrada-produto-id">
        <p id="entrada-produto-nome" style="font-weight:600;margin-bottom:16px;color:#1a56db"></p>
        <div class="form-group">
          <label>Quantidade a Adicionar</label>
          <input type="number" id="entrada-quantidade" min="1" value="1">
        </div>
        <div class="form-group">
          <label>Observação</label>
          <input type="text" id="entrada-obs" placeholder="Ex: Compra de fornecedor">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('modal-entrada-estoque')">Cancelar</button>
        <button class="btn btn-success" onclick="salvarEntradaEstoque()">Confirmar Entrada</button>
      </div>
    </div>
  </div>`;
    await carregarProdutos();
}

async function carregarProdutos() {
    try {
        const baixo = document.getElementById('filtro-baixo-estoque')?.checked ? '1' : '';
        produtosList = await api('GET', `/produtos${baixo ? '?baixo_estoque=1' : ''}`);
        renderProdutos(produtosList);
    } catch (e) { toast(e.message, 'error'); }
}

function renderProdutos(list) {
    const el = document.getElementById('tabela-produtos');
    if (!list.length) {
        el.innerHTML = '<div class="empty-state"><h3>Nenhum produto encontrado</h3></div>';
        return;
    }
    el.innerHTML = `<table>
    <thead><tr><th>Nome</th><th>Código</th><th>Preço Venda</th><th>Estoque</th><th>Status</th><th style="width:180px">Ações</th></tr></thead>
    <tbody>${list.map(p => {
        const baixo = p.estoque <= p.estoque_minimo;
        return `<tr>
        <td><strong>${p.nome}</strong>${p.descricao ? `<br><small class="text-muted">${p.descricao}</small>` : ''}</td>
        <td>${p.codigo || '<span class="text-muted">-</span>'}</td>
        <td class="currency">${formatCurrency(p.preco_venda)}</td>
        <td><strong style="${baixo ? 'color:#dc2626' : ''}">${p.estoque}</strong> ${p.unidade}</td>
        <td>${baixo ? '<span class="badge badge-baixo">⚠ Baixo</span>' : '<span class="badge badge-ok">OK</span>'}</td>
        <td><div class="actions-cell">
          ${p.imagem ? `<button class="btn btn-sm btn-secondary btn-icon" title="Ver foto" onclick="verImagemProduto(${p.id})">📷</button>` : ''}
          <button class="btn btn-sm btn-success" title="Entrada de estoque" onclick="abrirEntradaEstoque(${p.id}, '${p.nome.replace(/'/g, "\\'")}')"><svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg></button>
          <button class="btn btn-sm btn-secondary btn-icon" title="Editar" onclick="editarProduto(${p.id})"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button>
          <button class="btn btn-sm btn-danger btn-icon" title="Excluir" onclick="excluirProduto(${p.id})"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>
        </div></td>
      </tr>`;
    }).join('')}
    </tbody>
  </table>`;
}

function filtrarProdutos() {
    const q = document.getElementById('search-produtos').value.toLowerCase();
    renderProdutos(produtosList.filter(p => p.nome.toLowerCase().includes(q) || (p.codigo || '').toLowerCase().includes(q)));
}

function _resetImagemForm() {
    imagemPendente = null;
    imagemRemover = false;
    const preview = document.getElementById('produto-img-preview');
    const btnRemover = document.getElementById('btn-remover-img');
    const input = document.getElementById('produto-img-input');
    if (preview) preview.innerHTML = `
        <svg viewBox="0 0 24 24" style="width:40px;height:40px;fill:#cbd5e1"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
        <span style="color:#94a3b8;font-size:12px;margin-top:4px">Sem foto</span>`;
    if (btnRemover) btnRemover.style.display = 'none';
    if (input) input.value = '';
}

function _setImagemPreview(url) {
    const preview = document.getElementById('produto-img-preview');
    const btnRemover = document.getElementById('btn-remover-img');
    if (preview) preview.innerHTML = `<img src="${url}" style="max-width:100%;max-height:160px;border-radius:8px;object-fit:contain">`;
    if (btnRemover) btnRemover.style.display = 'inline-flex';
}

function abrirModalProduto() {
    document.getElementById('produto-id').value = '';
    document.getElementById('form-produto').reset();
    document.getElementById('produto-estoque-min').value = 5;
    document.getElementById('modal-produto-title').textContent = 'Novo Produto';
    _resetImagemForm();
    openModal('modal-produto');
}

function editarProduto(id) {
    const p = produtosList.find(x => x.id === id);
    if (!p) return;
    document.getElementById('produto-id').value = p.id;
    document.getElementById('produto-nome').value = p.nome;
    document.getElementById('produto-codigo').value = p.codigo || '';
    document.getElementById('produto-unidade').value = p.unidade || 'un';
    document.getElementById('produto-custo').value = p.preco_custo;
    document.getElementById('produto-venda').value = p.preco_venda;
    document.getElementById('produto-estoque').value = p.estoque;
    document.getElementById('produto-estoque-min').value = p.estoque_minimo;
    document.getElementById('produto-desc').value = p.descricao || '';
    document.getElementById('modal-produto-title').textContent = 'Editar Produto';
    _resetImagemForm();
    if (p.imagem) _setImagemPreview(p.imagem);
    openModal('modal-produto');
}

function redimensionarImagem(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const maxDim = 1200;
                let { width, height } = img;
                if (width > maxDim || height > maxDim) {
                    if (width > height) { height = Math.round(height * maxDim / width); width = maxDim; }
                    else { width = Math.round(width * maxDim / height); height = maxDim; }
                }
                const canvas = document.createElement('canvas');
                canvas.width = width; canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.82));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

async function previewImagemProduto(input) {
    if (!input.files || !input.files[0]) return;
    const base64 = await redimensionarImagem(input.files[0]);
    imagemPendente = base64;
    imagemRemover = false;
    _setImagemPreview(base64);
}

function removerImagemProduto() {
    imagemPendente = null;
    imagemRemover = true;
    _resetImagemForm();
}

async function salvarProduto() {
    const id = document.getElementById('produto-id').value;
    const body = {
        nome: document.getElementById('produto-nome').value,
        codigo: document.getElementById('produto-codigo').value,
        unidade: document.getElementById('produto-unidade').value,
        preco_custo: parseFloat(document.getElementById('produto-custo').value) || 0,
        preco_venda: parseFloat(document.getElementById('produto-venda').value) || 0,
        estoque: parseInt(document.getElementById('produto-estoque').value) || 0,
        estoque_minimo: parseInt(document.getElementById('produto-estoque-min').value) || 5,
        descricao: document.getElementById('produto-desc').value,
    };
    if (!body.nome) { toast('Nome é obrigatório', 'error'); return; }
    try {
        let prodId = id;
        if (id) {
            await api('PUT', `/produtos/${id}`, body);
        } else {
            const r = await api('POST', '/produtos', body);
            prodId = r.id;
        }
        if (imagemPendente) {
            await api('PUT', `/produtos/${prodId}/imagem`, { imagem: imagemPendente }, 60000);
        } else if (imagemRemover && id) {
            await api('DELETE', `/produtos/${id}/imagem`);
        }
        imagemPendente = null;
        imagemRemover = false;
        toast(id ? 'Produto atualizado!' : 'Produto cadastrado!');
        closeModal('modal-produto');
        await carregarProdutos();
    } catch (e) { toast(e.message, 'error'); }
}

function verImagemProduto(id) {
    const p = produtosList.find(x => x.id === id);
    if (!p || !p.imagem) return;
    abrirVisualizadorImagem(p.imagem, p.nome);
}

function abrirEntradaEstoque(id, nome) {
    document.getElementById('entrada-produto-id').value = id;
    document.getElementById('entrada-produto-nome').textContent = nome;
    document.getElementById('entrada-quantidade').value = 1;
    document.getElementById('entrada-obs').value = '';
    openModal('modal-entrada-estoque');
}

async function salvarEntradaEstoque() {
    const id = document.getElementById('entrada-produto-id').value;
    const quantidade = parseInt(document.getElementById('entrada-quantidade').value);
    if (!quantidade || quantidade < 1) { toast('Quantidade inválida', 'error'); return; }
    try {
        await api('POST', `/produtos/${id}/estoque`, { quantidade, observacao: document.getElementById('entrada-obs').value });
        toast('Estoque atualizado!');
        closeModal('modal-entrada-estoque');
        await carregarProdutos();
    } catch (e) { toast(e.message, 'error'); }
}

async function excluirProduto(id) {
    if (!confirmDialog('Confirma exclusão do produto?')) return;
    try {
        await api('DELETE', `/produtos/${id}`);
        toast('Produto excluído!');
        await carregarProdutos();
    } catch (e) { toast(e.message, 'error'); }
}
