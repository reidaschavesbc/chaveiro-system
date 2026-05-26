let vendaItens = [];
let vendaClientes = [];
let vendaProdutos = [];
let vendaServicos = [];
let vendaVendedores = [];
let vendaProdutoSelecionado = null;

async function vendasNova(el) {
  [vendaClientes, vendaProdutos, vendaServicos, vendaVendedores] = await Promise.all([
    api('GET', '/clientes'),
    api('GET', '/produtos'),
    api('GET', '/servicos'),
    api('GET', '/vendedores')
  ]);
  vendaItens = [];
  vendaProdutoSelecionado = null;
  const isMobile = window.innerWidth <= 768;

  if (isMobile) {
    el.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:16px">
      <div class="card" style="overflow:visible">
        <div class="card-header"><span class="card-title">Adicionar Item</span></div>
        <div class="card-body">
          <div class="tabs" id="tabs-tipo">
            <button class="tab active" onclick="setTabVenda('produto', this)">Produto</button>
            <button class="tab" onclick="setTabVenda('manual', this)">Manual</button>
          </div>
          <div id="tab-produto">
            <div class="form-group form-full" style="margin-bottom:10px">
              <label>Produto</label>
              <div style="position:relative">
                <input type="text" id="venda-produto-busca" placeholder="🔍 Buscar produto..." autocomplete="off"
                       oninput="filtrarProdutos()" onfocus="filtrarProdutos()" onblur="fecharListaProdutos()"
                       style="width:100%;padding:9px 14px;border:2px solid #e5e7eb;border-radius:10px;font-size:14px;box-sizing:border-box">
                <div id="venda-produto-lista" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:200;background:#fff;border:2px solid #1a56db;border-top:none;border-radius:0 0 10px 10px;max-height:200px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,0.12)"></div>
              </div>
              <button type="button" id="btn-ver-foto-venda" onclick="verFotoProdutoVenda()" style="display:none;margin-top:6px;width:100%;background:#f0f9ff;color:#0369a1;border:1px solid #bae6fd;border-radius:8px;padding:7px 12px;cursor:pointer;font-size:13px;font-weight:500">📷 Ver Foto do Produto</button>
            </div>
            <div class="form-grid">
              <div class="form-group"><label>Quantidade</label><input type="number" id="venda-produto-qtd" min="1" value="1"></div>
              <div class="form-group"><label>Preço (R$)</label><input type="number" id="venda-produto-preco" step="0.01" min="0" value="0"></div>
            </div>
            <button class="btn btn-primary" onclick="adicionarItemProduto()">+ Adicionar</button>
          </div>
          <div id="tab-manual" style="display:none">
            <div class="form-group form-full" style="margin-bottom:10px"><label>Descrição</label><input type="text" id="venda-manual-desc"></div>
            <div class="form-grid">
              <div class="form-group"><label>Qtd</label><input type="number" id="venda-manual-qtd" min="1" value="1"></div>
              <div class="form-group"><label>Valor (R$)</label><input type="number" id="venda-manual-preco" step="0.01" min="0" value="0"></div>
            </div>
            <button class="btn btn-primary" onclick="adicionarItemManual()">+ Adicionar</button>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">Itens da Venda</span></div>
        <div id="lista-itens-venda"><div class="empty-state"><h3>Nenhum item adicionado</h3></div></div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">Resumo</span></div>
        <div class="card-body">
          <div class="form-group" style="margin-bottom:12px">
            <label>Cliente (opcional)</label>
            <select id="venda-cliente" onchange="toggleClienteAvulso('venda')">
              <option value="">-- Sem cliente --</option>
              ${vendaClientes.map(c => `<option value="${c.id}">${c.nome_fantasia || c.nome}</option>`).join('')}
            </select>
            <input type="text" id="venda-cliente-avulso" style="margin-top:6px;padding:8px 12px;border:2px solid #e5e7eb;border-radius:9px;font-size:13px;width:100%">
          </div>
          <div class="form-group" style="margin-bottom:12px">
            <label>Funcionário</label>
            <select id="venda-vendedor"><option value="">-- Selecione --</option>${vendaVendedores.map(v => `<option value="${v.id}">${v.nome}</option>`).join('')}</select>
          </div>
          <div class="form-group" style="margin-bottom:12px">
            <label>Pagamentos</label>
            <div style="background:#f8fafc;padding:10px;border-radius:10px;border:1px solid #e2e8f0;display:grid;grid-template-columns:1fr 1fr;gap:6px">
              <div><label style="font-size:10px;color:#64748b">💵 Dinheiro</label><input type="number" id="pay-dinheiro" step="0.01" min="0" value="0" style="padding:6px;width:100%;box-sizing:border-box" oninput="calcularCheckout()"></div>
              <div><label style="font-size:10px;color:#64748b">📱 PIX</label><input type="number" id="pay-pix" step="0.01" min="0" value="0" style="padding:6px;width:100%;box-sizing:border-box" oninput="calcularCheckout()"></div>
              <div><label style="font-size:10px;color:#64748b">💳 Cartão 1</label><input type="number" id="pay-cartao1" step="0.01" min="0" value="0" style="padding:6px;width:100%;box-sizing:border-box" oninput="calcularCheckout()"></div>
              <div><label style="font-size:10px;color:#64748b">💳 Cartão 2</label><input type="number" id="pay-cartao2" step="0.01" min="0" value="0" style="padding:6px;width:100%;box-sizing:border-box" oninput="calcularCheckout()"></div>
            </div>
          </div>
          <div class="form-group" style="margin-bottom:12px"><label>Desconto (R$)</label><input type="number" id="venda-desconto" step="0.01" min="0" value="0" oninput="calcularTotal()"></div>
          <div class="divider"></div>
          <div style="display:flex;justify-content:space-between;color:#64748b;font-size:13px;margin-bottom:4px"><span>Subtotal</span><span id="resumo-subtotal">R$ 0,00</span></div>
          <div style="display:flex;justify-content:space-between;color:#ef4444;font-size:13px;margin-bottom:4px"><span>Desconto</span><span id="resumo-desconto">- R$ 0,00</span></div>
          <div style="display:flex;justify-content:space-between;color:#f97316;font-size:14px;font-weight:600;margin:6px 0;padding:4px 8px;background:#fff7ed;border-radius:6px"><span>RESTANTE</span><span id="resumo-faltante">R$ 0,00</span></div>
          <div style="display:flex;justify-content:space-between;font-size:20px;font-weight:700;color:#1a56db;margin-bottom:6px"><span>TOTAL</span><span id="resumo-total">R$ 0,00</span></div>
          <div style="display:flex;justify-content:space-between;font-size:15px;font-weight:600;color:#16a34a;background:#f0fdf4;padding:7px 8px;border-radius:8px;margin-bottom:14px"><span>TROCO</span><span id="resumo-troco">R$ 0,00</span></div>
          <div class="form-group" style="margin-bottom:12px"><label>Observações</label><textarea id="venda-obs" style="min-height:50px"></textarea></div>
          <button class="btn btn-primary" style="width:100%;padding:14px;font-size:15px" onclick="finalizarVenda()">✓ Finalizar Venda</button>
        </div>
      </div>
    </div>`;
    return;
  }

  el.innerHTML = `
  <div style="display:grid;grid-template-columns:1fr 640px;gap:16px;height:calc(100vh - 110px)">

    <!-- ESQUERDA: adicionar + lista -->
    <div style="display:flex;flex-direction:column;gap:12px;min-height:0">

      <!-- Adicionar item (compacto, uma linha) -->
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;flex-shrink:0;overflow:visible">
        <div class="tabs" id="tabs-tipo" style="margin-bottom:10px">
          <button class="tab active" onclick="setTabVenda('produto', this)">Produto</button>
          <button class="tab" onclick="setTabVenda('manual', this)">Manual</button>
        </div>
        <div id="tab-produto">
          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end">
            <div style="flex:1;min-width:200px;position:relative">
              <label style="font-size:12px;color:#64748b;display:block;margin-bottom:4px">Produto</label>
              <input type="text" id="venda-produto-busca" placeholder="🔍 Buscar produto..." autocomplete="off"
                     oninput="filtrarProdutos()" onfocus="filtrarProdutos()" onblur="fecharListaProdutos()"
                     style="width:100%;padding:9px 12px;border:2px solid #e5e7eb;border-radius:10px;font-size:14px;box-sizing:border-box">
              <div id="venda-produto-lista" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:200;background:#fff;border:2px solid #1a56db;border-top:none;border-radius:0 0 10px 10px;max-height:240px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,0.12)"></div>
            </div>
            <div style="width:72px;flex-shrink:0">
              <label style="font-size:12px;color:#64748b;display:block;margin-bottom:4px">Qtd</label>
              <input type="number" id="venda-produto-qtd" min="1" value="1" style="width:100%;padding:9px 8px;border:2px solid #e5e7eb;border-radius:10px;font-size:14px;box-sizing:border-box">
            </div>
            <div style="width:120px;flex-shrink:0">
              <label style="font-size:12px;color:#64748b;display:block;margin-bottom:4px">Preço (R$)</label>
              <input type="number" id="venda-produto-preco" step="0.01" min="0" value="0" style="width:100%;padding:9px 8px;border:2px solid #e5e7eb;border-radius:10px;font-size:14px;box-sizing:border-box">
            </div>
            <div style="flex-shrink:0">
              <label style="font-size:12px;display:block;margin-bottom:4px">&nbsp;</label>
              <button class="btn btn-primary" onclick="adicionarItemProduto()" style="padding:9px 18px;white-space:nowrap;border:2px solid transparent">+ Adicionar</button>
            </div>
          </div>
          <button type="button" id="btn-ver-foto-venda" onclick="verFotoProdutoVenda()" style="display:none;margin-top:8px;background:#f0f9ff;color:#0369a1;border:1px solid #bae6fd;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:12px;font-weight:500">📷 Ver Foto do Produto</button>
        </div>
        <div id="tab-manual" style="display:none">
          <div style="display:flex;gap:8px;align-items:flex-end">
            <div style="flex:1;min-width:0">
              <label style="font-size:12px;color:#64748b;display:block;margin-bottom:4px">Descrição</label>
              <input type="text" id="venda-manual-desc" style="width:100%;padding:9px 12px;border:2px solid #e5e7eb;border-radius:10px;font-size:14px;box-sizing:border-box">
            </div>
            <div style="width:72px;flex-shrink:0">
              <label style="font-size:12px;color:#64748b;display:block;margin-bottom:4px">Qtd</label>
              <input type="number" id="venda-manual-qtd" min="1" value="1" style="width:100%;padding:9px 8px;border:2px solid #e5e7eb;border-radius:10px;font-size:14px;box-sizing:border-box">
            </div>
            <div style="width:120px;flex-shrink:0">
              <label style="font-size:12px;color:#64748b;display:block;margin-bottom:4px">Valor (R$)</label>
              <input type="number" id="venda-manual-preco" step="0.01" min="0" value="0" style="width:100%;padding:9px 8px;border:2px solid #e5e7eb;border-radius:10px;font-size:14px;box-sizing:border-box">
            </div>
            <div style="flex-shrink:0">
              <label style="font-size:12px;display:block;margin-bottom:4px">&nbsp;</label>
              <button class="btn btn-primary" onclick="adicionarItemManual()" style="padding:9px 18px;white-space:nowrap;border:2px solid transparent">+ Adicionar</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Lista de itens (scroll interno) -->
      <div style="flex:1;min-height:0;display:flex;flex-direction:column;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
        <div style="padding:12px 16px;border-bottom:1px solid #f1f5f9;font-weight:600;font-size:14px;color:#1e293b;flex-shrink:0">Itens da Venda</div>
        <div id="lista-itens-venda" style="flex:1;overflow-y:auto">
          <div class="empty-state"><h3>Nenhum item adicionado</h3><p>Busque e adicione produtos acima</p></div>
        </div>
      </div>
    </div>

    <!-- DIREITA: resumo com botão fixo no rodapé -->
    <div style="display:flex;flex-direction:column;min-height:0;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
      <div style="padding:12px 16px;border-bottom:1px solid #f1f5f9;font-weight:600;font-size:14px;color:#1e293b;flex-shrink:0">Resumo</div>

      <!-- Campos roláveis -->
      <div style="flex:1;overflow-y:auto;padding:12px 14px;min-height:0;display:flex;flex-direction:column;gap:10px">
        <div class="form-group" style="margin:0">
          <label>Cliente (opcional)</label>
          <select id="venda-cliente" onchange="toggleClienteAvulso('venda')">
            <option value="">-- Sem cliente --</option>
            ${vendaClientes.map(c => `<option value="${c.id}">${c.nome_fantasia || c.nome}</option>`).join('')}
          </select>
          <input type="text" id="venda-cliente-avulso" placeholder="Nome do cliente" style="margin-top:6px">
        </div>
        <div class="form-group" style="margin:0">
          <label>Funcionário</label>
          <select id="venda-vendedor">
            <option value="">-- Selecione --</option>
            ${vendaVendedores.map(v => `<option value="${v.id}">${v.nome}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin:0">
          <label>Pagamento</label>
          <div style="background:#f8fafc;padding:8px;border-radius:10px;border:1px solid #e2e8f0;display:grid;grid-template-columns:1fr 1fr;gap:6px">
            <div class="form-group" style="margin:0"><label style="font-size:10px;color:#64748b">💵 Dinheiro</label><input type="number" id="pay-dinheiro" step="0.01" min="0" value="0" oninput="calcularCheckout()"></div>
            <div class="form-group" style="margin:0"><label style="font-size:10px;color:#64748b">📱 PIX</label><input type="number" id="pay-pix" step="0.01" min="0" value="0" oninput="calcularCheckout()"></div>
            <div class="form-group" style="margin:0"><label style="font-size:10px;color:#64748b">💳 Cartão 1</label><input type="number" id="pay-cartao1" step="0.01" min="0" value="0" oninput="calcularCheckout()"></div>
            <div class="form-group" style="margin:0"><label style="font-size:10px;color:#64748b">💳 Cartão 2</label><input type="number" id="pay-cartao2" step="0.01" min="0" value="0" oninput="calcularCheckout()"></div>
          </div>
        </div>
        <div class="form-group" style="margin:0">
          <label>Desconto (R$)</label>
          <input type="number" id="venda-desconto" step="0.01" min="0" value="0" oninput="calcularTotal()">
        </div>
        <div class="form-group" style="margin:0">
          <label>Observações</label>
          <textarea id="venda-obs" style="min-height:48px;resize:vertical"></textarea>
        </div>
      </div>

      <!-- Totais + botão sempre visíveis no rodapé -->
      <div style="flex-shrink:0;border-top:1px solid #e2e8f0;padding:16px 18px;background:#f8fafc">
        <div style="display:flex;justify-content:space-between;color:#64748b;font-size:15px;margin-bottom:6px"><span>Subtotal</span><span id="resumo-subtotal">R$ 0,00</span></div>
        <div style="display:flex;justify-content:space-between;color:#ef4444;font-size:15px;margin-bottom:6px"><span>Desconto</span><span id="resumo-desconto">- R$ 0,00</span></div>
        <div style="display:flex;justify-content:space-between;color:#f97316;font-size:15px;font-weight:600;padding:6px 10px;background:#fff7ed;border-radius:8px;margin-bottom:6px"><span>RESTANTE</span><span id="resumo-faltante">R$ 0,00</span></div>
        <div style="display:flex;justify-content:space-between;font-size:24px;font-weight:700;color:#1a56db;margin-bottom:6px"><span>TOTAL</span><span id="resumo-total">R$ 0,00</span></div>
        <div style="display:flex;justify-content:space-between;font-size:17px;font-weight:600;color:#16a34a;background:#f0fdf4;padding:7px 10px;border-radius:8px;margin-bottom:14px"><span>TROCO</span><span id="resumo-troco">R$ 0,00</span></div>
        <button class="btn btn-primary" style="width:100%;padding:14px;font-size:16px;font-weight:700" onclick="finalizarVenda()">✓ Finalizar Venda</button>
      </div>
    </div>

  </div>`;
}

function setTabVenda(tab, btn) {
  ['produto', 'manual'].forEach(t => {
    document.getElementById('tab-' + t).style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('#tabs-tipo .tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function filtrarProdutos() {
  const busca = document.getElementById('venda-produto-busca').value.toLowerCase().trim();
  const lista = document.getElementById('venda-produto-lista');
  const filtrados = busca ? vendaProdutos.filter(p => p.nome.toLowerCase().includes(busca)) : vendaProdutos;
  lista.style.display = 'block';
  lista.innerHTML = filtrados.length
    ? filtrados.map(p => `
        <div onmousedown="event.preventDefault()" onclick="escolherProduto(${p.id})"
             onmouseover="this.style.background='#f0f7ff'" onmouseout="this.style.background=''"
             style="padding:10px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center">
          <span>${p.nome}</span>
          <span style="color:#1a56db;font-weight:600;white-space:nowrap;margin-left:8px">${formatCurrency(p.preco_venda)}</span>
        </div>`).join('')
    : '<div style="padding:12px;color:#94a3b8;font-size:13px;text-align:center">Nenhum produto encontrado</div>';
}

function escolherProduto(id) {
  vendaProdutoSelecionado = vendaProdutos.find(p => p.id === id) || null;
  if (!vendaProdutoSelecionado) return;
  document.getElementById('venda-produto-busca').value = vendaProdutoSelecionado.nome;
  document.getElementById('venda-produto-lista').style.display = 'none';
  document.getElementById('venda-produto-preco').value = vendaProdutoSelecionado.preco_venda;
  const btnFoto = document.getElementById('btn-ver-foto-venda');
  if (btnFoto) btnFoto.style.display = vendaProdutoSelecionado.imagem ? 'block' : 'none';
}

function fecharListaProdutos() {
  setTimeout(() => {
    const lista = document.getElementById('venda-produto-lista');
    if (lista) lista.style.display = 'none';
  }, 150);
}

function verFotoProdutoVenda() {
  if (vendaProdutoSelecionado && vendaProdutoSelecionado.imagem)
    abrirVisualizadorImagem(vendaProdutoSelecionado.imagem, vendaProdutoSelecionado.nome);
}
function selecionarServico() {
  const sel = document.getElementById('venda-servico-sel');
  const opt = sel.options[sel.selectedIndex];
  if (opt.dataset.preco) document.getElementById('venda-servico-preco').value = opt.dataset.preco;
}

function adicionarItemProduto() {
  if (!vendaProdutoSelecionado) { toast('Selecione um produto', 'warning'); return; }
  const qtd = parseFloat(document.getElementById('venda-produto-qtd').value) || 1;
  const preco = parseFloat(document.getElementById('venda-produto-preco').value) || 0;
  vendaItens.push({ produto_id: vendaProdutoSelecionado.id, descricao: vendaProdutoSelecionado.nome, quantidade: qtd, preco_unitario: preco });
  vendaProdutoSelecionado = null;
  document.getElementById('venda-produto-busca').value = '';
  document.getElementById('venda-produto-preco').value = '0';
  document.getElementById('venda-produto-qtd').value = '1';
  const btnFoto = document.getElementById('btn-ver-foto-venda');
  if (btnFoto) btnFoto.style.display = 'none';
  renderItensVenda(); calcularTotal();
}
function adicionarItemServico() {
  const sel = document.getElementById('venda-servico-sel');
  const opt = sel.options[sel.selectedIndex];
  if (!sel.value) { toast('Selecione um serviço', 'warning'); return; }
  const qtd = parseFloat(document.getElementById('venda-servico-qtd').value) || 1;
  const preco = parseFloat(document.getElementById('venda-servico-preco').value) || 0;
  vendaItens.push({ servico_id: parseInt(sel.value), descricao: opt.dataset.nome, quantidade: qtd, preco_unitario: preco });
  renderItensVenda(); calcularTotal();
}
function adicionarItemManual() {
  const desc = document.getElementById('venda-manual-desc').value;
  if (!desc) { toast('Descrição é obrigatória', 'warning'); return; }
  const qtd = parseFloat(document.getElementById('venda-manual-qtd').value) || 1;
  const preco = parseFloat(document.getElementById('venda-manual-preco').value) || 0;
  vendaItens.push({ descricao: desc, quantidade: qtd, preco_unitario: preco });
  document.getElementById('venda-manual-desc').value = '';
  renderItensVenda(); calcularTotal();
}

function removerItem(idx) {
  vendaItens.splice(idx, 1);
  renderItensVenda(); calcularTotal();
}

function renderItensVenda() {
  const el = document.getElementById('lista-itens-venda');
  if (!vendaItens.length) {
    el.innerHTML = '<div class="empty-state"><h3>Nenhum item adicionado</h3></div>';
    return;
  }
  el.innerHTML = `<table>
    <thead><tr><th>Descrição</th><th>Qtd</th><th>Unit.</th><th>Subtotal</th><th></th></tr></thead>
    <tbody>${vendaItens.map((item, i) => `
      <tr>
        <td>${item.descricao}</td>
        <td>${item.quantidade}</td>
        <td>${formatCurrency(item.preco_unitario)}</td>
        <td class="currency">${formatCurrency(item.quantidade * item.preco_unitario)}</td>
        <td><button class="btn btn-sm btn-danger btn-icon" onclick="removerItem(${i})">✕</button></td>
      </tr>`).join('')}
    </tbody>
  </table>`;
}

function calcularTotal() {
  let sub = vendaItens.reduce((acc, i) => acc + i.quantidade * i.preco_unitario, 0);
  const desc = parseFloat(document.getElementById('venda-desconto')?.value) || 0;
  document.getElementById('resumo-subtotal').textContent = formatCurrency(sub);
  document.getElementById('resumo-desconto').textContent = '- ' + formatCurrency(desc);
  const total = Math.max(0, sub - desc);
  document.getElementById('resumo-total').textContent = formatCurrency(total);
  return total;
}

function calcularCheckout() {
  const total = calcularTotal();

  const d = parseFloat(document.getElementById('pay-dinheiro').value) || 0;
  const p = parseFloat(document.getElementById('pay-pix').value) || 0;
  const c1 = parseFloat(document.getElementById('pay-cartao1').value) || 0;
  const c2 = parseFloat(document.getElementById('pay-cartao2').value) || 0;

  const totalOutros = p + c1 + c2;
  const dinheiroNecessario = Math.max(0, total - totalOutros);

  const faltante = Math.max(0, dinheiroNecessario - d);
  const trocoReal = Math.max(0, d - dinheiroNecessario);

  document.getElementById('resumo-faltante').textContent = formatCurrency(faltante);
  document.getElementById('resumo-troco').textContent = formatCurrency(trocoReal);

  const faltEl = document.getElementById('resumo-faltante').parentElement;
  if (faltante > 0) {
    faltEl.style.color = '#ef4444';
    faltEl.style.background = '#fef2f2';
  } else {
    faltEl.style.color = '#16a34a';
    faltEl.style.background = '#f0fdf4';
  }
}

function modalConfirmarVenda(total) {
  return new Promise(resolve => {
    let overlay = document.getElementById('modal-confirmar-venda');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'modal-confirmar-venda';
      overlay.className = 'modal-overlay';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `
    <div class="modal" style="max-width:400px;width:100%" onclick="event.stopPropagation()">
      <div class="modal-header">
        <span class="modal-title">✅ Finalizar Venda</span>
        <button class="modal-close" id="btn-cv-fechar">&times;</button>
      </div>
      <div class="modal-body" style="text-align:center;padding:24px">
        <div style="font-size:14px;color:#64748b;margin-bottom:12px">Valor total da venda</div>
        <div style="font-size:32px;font-weight:800;color:#15803d;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:14px 20px;display:inline-block;min-width:200px">${formatCurrency(total)}</div>
        <div style="font-size:13px;color:#94a3b8;margin-top:16px">Escolha uma opção para continuar</div>
      </div>
      <div class="modal-footer" style="flex-direction:column;gap:8px">
        <div style="display:flex;gap:8px;width:100%">
          <button class="btn btn-primary" id="btn-cv-finalizar" style="flex:1;padding:12px;font-size:14px">✓ Finalizar</button>
          <button class="btn" id="btn-cv-imprimir" style="flex:1;padding:12px;font-size:14px;background:#0f766e;color:#fff;border:none;border-radius:10px;font-weight:600;cursor:pointer">🖨️ Imprimir</button>
        </div>
        <button class="btn btn-danger" id="btn-cv-cancelar" style="width:100%;padding:11px;font-size:13px">Cancelar</button>
      </div>
    </div>`;
    openModal('modal-confirmar-venda');
    const fechar = val => { closeModal('modal-confirmar-venda'); resolve(val); };
    overlay.onclick = () => fechar(null);
    overlay.querySelector('.modal').onclick = e => e.stopPropagation();
    document.getElementById('btn-cv-fechar').onclick    = () => fechar(null);
    document.getElementById('btn-cv-cancelar').onclick  = () => fechar(null);
    document.getElementById('btn-cv-finalizar').onclick = () => fechar('finalizar');
    document.getElementById('btn-cv-imprimir').onclick  = () => fechar('imprimir');
  });
}

async function finalizarVenda() {
  if (!vendaItens.length) { toast('Adicione pelo menos um item', 'warning'); return; }

  const total = calcularTotal();
  const acao = await modalConfirmarVenda(total);
  if (!acao) return; // Cancelar — volta para o form como estava

  const pagamentos = [];
  const d = parseFloat(document.getElementById('pay-dinheiro').value) || 0;
  const p = parseFloat(document.getElementById('pay-pix').value) || 0;
  const c1 = parseFloat(document.getElementById('pay-cartao1').value) || 0;
  const c2 = parseFloat(document.getElementById('pay-cartao2').value) || 0;

  const totalOutros = p + c1 + c2;
  const dinheiroEfetivo = Math.min(d, Math.max(0, total - totalOutros));

  if (dinheiroEfetivo > 0) pagamentos.push({ metodo: 'dinheiro', valor: dinheiroEfetivo });
  if (p > 0) pagamentos.push({ metodo: 'pix', valor: p });
  if (c1 > 0) pagamentos.push({ metodo: 'cartao1', valor: c1 });
  if (c2 > 0) pagamentos.push({ metodo: 'cartao2', valor: c2 });

  const body = {
    cliente_id: document.getElementById('venda-cliente').value || null,
    cliente_nome_avulso: document.getElementById('venda-cliente-avulso').value || null,
    vendedor_id: document.getElementById('venda-vendedor').value || null,
    pagamentos: pagamentos,
    desconto: parseFloat(document.getElementById('venda-desconto').value) || 0,
    observacoes: document.getElementById('venda-obs').value,
    itens: vendaItens,
  };
  try {
    const r = await api('POST', '/vendas', body);
    toast(`Venda ${r.numero} finalizada! Total: ${formatCurrency(r.total)}`);
    if (acao === 'imprimir') window.open(`/api/pdf/venda/${r.id}?t=${getToken()}`, '_blank');
    vendaItens = [];
    navigateTo('vendas-nova');
  } catch (e) { toast(e.message, 'error'); }
}

// Histórico de vendas
async function vendasHistorico(el) {
  el.innerHTML = `
  <div class="card">
    <div class="card-header">
      <span class="card-title">Histórico de Vendas</span>
      <div class="flex gap-2 align-center">
        <input type="date" id="venda-data-ini" value="${monthStart()}" style="padding:8px 12px;border:2px solid #e5e7eb;border-radius:9px;font-size:13px">
        <input type="date" id="venda-data-fim" value="${today()}" style="padding:8px 12px;border:2px solid #e5e7eb;border-radius:9px;font-size:13px">
        <button class="btn btn-secondary" onclick="carregarVendas()">Filtrar</button>
      </div>
    </div>
    <div id="tabela-vendas"></div>
  </div>`;
  await carregarVendas();
}

async function carregarVendas() {
  const di = document.getElementById('venda-data-ini')?.value;
  const df = document.getElementById('venda-data-fim')?.value;
  const vendas = await api('GET', `/vendas?data_inicio=${di}&data_fim=${df}`);
  const el = document.getElementById('tabela-vendas');
  if (!vendas.length) { el.innerHTML = '<div class="empty-state"><h3>Nenhuma venda no período</h3></div>'; return; }
  if (window.innerWidth <= 768) {
    el.innerHTML = vendas.map(v => `
      <div class="os-card${v.status === 'cancelada' ? '" style="opacity:0.55' : ''}">
        <div class="os-card-top">
          <div class="os-card-num">
            <strong>${v.numero}</strong>
            <span style="margin-left:6px">${badgeStatus(v.status)}</span>
          </div>
          <div class="os-card-valor">${formatCurrency(v.total_final)}</div>
        </div>
        <div class="os-card-cliente">${v.cliente_nome || v.cliente_nome_avulso || '—'}${v.vendedor_nome ? ` <span style="color:#94a3b8;font-size:11px">Func: ${v.vendedor_nome}</span>` : ''}</div>
        <div class="os-card-bottom">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            ${badgePagamento(v.forma_pagamento)}
            <span style="font-size:11px;color:#94a3b8">${formatDate(v.data)}</span>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm btn-secondary btn-icon" onclick="visualizarVenda(${v.id})" title="Ver Detalhes">👁️</button>
            ${v.status !== 'cancelada' ? `<button class="btn btn-sm btn-danger btn-icon" onclick="cancelarVenda(${v.id},'${v.numero}')" title="Cancelar">✕</button>` : ''}
            <button class="btn btn-sm btn-danger btn-icon" onclick="excluirVenda(${v.id},'${v.numero}')" title="Excluir"><svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>
          </div>
        </div>
      </div>`).join('');
    return;
  }

  el.innerHTML = `<table>
    <thead><tr><th>Nº</th><th>Data</th><th>Cliente</th><th>Pagamento</th><th>Total</th><th>Status</th><th>Ações</th></tr></thead>
    <tbody>${vendas.map(v => `
      <tr style="${v.status === 'cancelada' ? 'opacity:0.5;text-decoration:line-through' : ''}">
        <td><strong>${v.numero}</strong></td>
        <td>${formatDate(v.data)}</td>
        <td>
          <div style="font-weight:500">${v.cliente_nome || v.cliente_nome_avulso || '<span class="text-muted">????</span>'}</div>
          ${v.vendedor_nome ? `<div class="text-muted" style="font-size:11px">Func: ${v.vendedor_nome}</div>` : ''}
        </td>
        <td>${badgePagamento(v.forma_pagamento)}</td>
        <td class="currency">${formatCurrency(v.total_final)}</td>
        <td>${badgeStatus(v.status)}</td>
        <td class="flex gap-1">
          <button class="btn btn-sm btn-secondary btn-icon" onclick="visualizarVenda(${v.id})" title="Ver Detalhes">👁️</button>
          <a class="btn btn-sm btn-secondary btn-icon" href="/api/pdf/venda/${v.id}?t=${getToken()}" target="_blank" title="PDF">📄</a>
          ${v.status === 'concluida' ? (v.nfse_numero ? `<button class="btn btn-sm" style="background:#0ea5e9;color:white;padding:5px 8px;font-size:11px;white-space:nowrap" title="NFS-e emitida: ${v.nfse_numero}" onclick="verNfseVenda('${v.nfse_chave_acesso}')">📄 NF ${v.nfse_numero}</button>` : `<button class="btn btn-sm" style="background:#7c3aed;color:white;padding:5px 8px;font-size:11px;white-space:nowrap" title="Emitir NFS-e" onclick="emitirNfseVenda(${v.id},'${v.numero}')">📄 NFS-e</button>`) : ''}
          ${v.status !== 'cancelada' ? `<button class="btn btn-sm btn-danger btn-icon" onclick="cancelarVenda(${v.id}, '${v.numero}')" title="Cancelar">✕</button>` : ''}
          <button class="btn btn-sm btn-danger btn-icon" onclick="excluirVenda(${v.id}, '${v.numero}')" title="Excluir permanentemente"><svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>
        </td>
      </tr>`).join('')}
    </tbody>
  </table>`;
}

async function cancelarVenda(id, numero) {
  const motivo = await modalPrompt({ titulo: 'Cancelar Venda', mensagem: `Informe o motivo do cancelamento da Venda <strong>${numero}</strong>:`, placeholder: 'Motivo do cancelamento...', obrigatorio: true });
  if (!motivo) return;

  try {
    await api('DELETE', `/vendas/${id}`, { motivo });
    toast(`Venda ${numero} cancelada!`);
    carregarVendas();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function excluirVenda(id, numero) {
  const senha = await pedirSenhaExclusao(`Venda ${numero}`);
  if (senha === null) return;
  if (!senha.trim()) { toast('Senha é obrigatória!', 'error'); return; }

  try {
    await api('DELETE', `/vendas/${id}/excluir`, { senha });
    toast(`Venda ${numero} excluída permanentemente!`);
    carregarVendas();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function visualizarVenda(id) {
  try {
    const v = await api('GET', `/vendas/${id}`);
    if (!v) return;

    let overlay = document.getElementById('modal-view-venda');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'modal-view-venda';
      overlay.className = 'modal-overlay';
      document.body.appendChild(overlay);
    }

    const nomeCliente = v.cliente_nome || v.cliente_nome_avulso || 'Cliente Avulso';
    const docCliente = v.cliente_cpf ? `CPF: ${v.cliente_cpf}` : v.cliente_cnpj ? `CNPJ: ${v.cliente_cnpj}` : '';
    const endParts = [v.cliente_endereco, v.cliente_numero, v.cliente_complemento, v.cliente_bairro, v.cliente_cidade].filter(Boolean);
    const enderecoCliente = endParts.join(', ');

    const itensHtml = (v.itens || []).map(it => `
      <tr>
        <td>${it.produto_nome || it.servico_nome || it.descricao || 'Item'}</td>
        <td style="text-align:center">${it.quantidade}</td>
        <td style="text-align:right">${formatCurrency(it.preco_unitario)}</td>
        <td style="text-align:right;font-weight:600">${formatCurrency(it.subtotal || it.quantidade * it.preco_unitario)}</td>
      </tr>`).join('');

    const pgLabels = { dinheiro:'Dinheiro', pix:'PIX', credito:'Cartão Crédito', debito:'Cartão Débito', cartao1:'Cartão 1', cartao2:'Cartão 2' };
    const pgHtml = (v.pagamentos || []).map(pg => `
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
        <span>${pgLabels[pg.metodo] || pg.metodo}</span>
        <strong>${formatCurrency(pg.valor)}</strong>
      </div>`).join('') || `<div style="font-size:13px">${badgePagamento(v.forma_pagamento)}</div>`;

    overlay.innerHTML = `
    <div class="modal modal-lg">
      <div class="modal-header">
        <span class="modal-title">Venda ${v.numero}</span>
        <button class="modal-close" onclick="closeModal('modal-view-venda')">&times;</button>
      </div>
      <div class="modal-body">

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
          <div style="background:#f8fafc;border-radius:12px;padding:16px">
            <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:10px">Cliente</div>
            <div style="font-weight:700;font-size:15px;color:#1e293b;margin-bottom:4px">${nomeCliente}</div>
            ${docCliente ? `<div style="font-size:12px;color:#64748b">${docCliente}</div>` : ''}
            ${v.cliente_telefone ? `<div style="font-size:13px;margin-top:4px">📞 ${v.cliente_telefone}</div>` : ''}
            ${v.cliente_email ? `<div style="font-size:13px">✉️ ${v.cliente_email}</div>` : ''}
            ${enderecoCliente ? `<div style="font-size:12px;color:#64748b;margin-top:6px">📍 ${enderecoCliente}${v.cliente_cep ? ` — CEP ${v.cliente_cep}` : ''}</div>` : ''}
          </div>
          <div style="background:#f8fafc;border-radius:12px;padding:16px">
            <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:10px">Informações</div>
            <div style="font-size:13px;margin-bottom:6px"><span style="color:#64748b">Data:</span> <strong>${formatDate(v.data)}</strong></div>
            <div style="font-size:13px;margin-bottom:6px"><span style="color:#64748b">Status:</span> ${badgeStatus(v.status)}</div>
            <div style="font-size:13px;margin-bottom:6px"><span style="color:#64748b">Funcionário:</span> <strong>${v.vendedor_nome || '-'}</strong></div>
            ${v.observacoes ? `<div style="font-size:12px;color:#64748b;margin-top:6px">Obs: ${v.observacoes}</div>` : ''}
          </div>
        </div>

        <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:8px">Itens</div>
        <div style="max-height:220px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:10px">
          <table style="margin:0">
            <thead><tr><th>Descrição</th><th style="text-align:center">Qtd</th><th style="text-align:right">Unitário</th><th style="text-align:right">Subtotal</th></tr></thead>
            <tbody>${itensHtml || '<tr><td colspan="4" style="text-align:center;color:#94a3b8">Sem itens</td></tr>'}</tbody>
          </table>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">
          <div style="background:#f8fafc;border-radius:12px;padding:16px">
            <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:10px">Pagamento</div>
            ${pgHtml}
          </div>
          <div style="background:#f8fafc;border-radius:12px;padding:16px;text-align:right">
            <div style="font-size:13px;color:#64748b;margin-bottom:4px">Subtotal: ${formatCurrency(v.total)}</div>
            ${(v.desconto > 0) ? `<div style="font-size:13px;color:#dc2626;margin-bottom:4px">Desconto: -${formatCurrency(v.desconto)}</div>` : ''}
            <div style="font-size:22px;font-weight:800;color:#1a56db">Total: ${formatCurrency(v.total_final)}</div>
          </div>
        </div>

        ${v.status === 'cancelada' ? `
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px 16px;margin-top:16px;color:#dc2626">
            <strong>Venda Cancelada</strong> — ${v.motivo_cancelamento || 'Motivo não informado'}
          </div>` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('modal-view-venda')">Fechar</button>
        <a class="btn btn-primary" href="/api/pdf/venda/${v.id}?t=${getToken()}" target="_blank">Gerar PDF</a>
      </div>
    </div>`;

    openModal('modal-view-venda');
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function emitirNfseVenda(vendaId, vendaNumero) {
  try {
    toast('Carregando dados...', 'info');
    const dados = await api('GET', `/nfse/preview-venda/${vendaId}`);
    if (!dados) return;
    const confirmar = await _modalPreviewNfseVenda(dados, vendaNumero);
    if (!confirmar) return;
    toast('Emitindo NFS-e... aguarde', 'info');
    const r = await api('POST', `/nfse/emitir-venda/${vendaId}`, null, 60000);
    if (r && r.numeroNota) {
      toast(`NFS-e ${r.numeroNota} emitida com sucesso!`);
      if (r.aviso) toast(r.aviso, 'warning');
    } else {
      toast('NFS-e enviada! Verifique o número no sistema.', 'info');
    }
    await carregarVendas();
  } catch (e) {
    toast('Erro: ' + e.message, 'error');
    await carregarVendas();
  }
}

function verNfseVenda(chaveAcesso) {
  if (!chaveAcesso) { toast('Chave de acesso não disponível', 'error'); return; }
  window.open(`/api/nfse/danfse/${chaveAcesso}?t=${getToken()}`, '_blank');
}

function _modalPreviewNfseVenda(dados, vendaNumero) {
  return new Promise(resolve => {
    let overlay = document.getElementById('modal-preview-nfse-venda');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'modal-preview-nfse-venda';
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
        <span class="modal-title">📄 Pré-visualização NFS-e — Venda ${vendaNumero} ${ambienteBadge}</span>
        <button class="modal-close" id="btn-pnfv-fechar">&times;</button>
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
        <button class="btn btn-secondary" id="btn-pnfv-cancelar">Cancelar</button>
        <button class="btn btn-primary" id="btn-pnfv-emitir" style="background:#7c3aed;border:none">📤 Confirmar Emissão</button>
      </div>
    </div>`;

    openModal('modal-preview-nfse-venda');
    const fechar = val => { closeModal('modal-preview-nfse-venda'); resolve(val); };
    overlay.onclick = () => fechar(false);
    overlay.querySelector('.modal').onclick = e => e.stopPropagation();
    document.getElementById('btn-pnfv-fechar').onclick   = () => fechar(false);
    document.getElementById('btn-pnfv-cancelar').onclick = () => fechar(false);
    document.getElementById('btn-pnfv-emitir').onclick   = () => fechar(true);
  });
}
