let vendaItens = [];
let vendaClientes = [];
let vendaProdutos = [];
let vendaServicos = [];
let vendaVendedores = [];

async function vendasNova(el) {
  [vendaClientes, vendaProdutos, vendaServicos, vendaVendedores] = await Promise.all([
    api('GET', '/clientes'),
    api('GET', '/produtos'),
    api('GET', '/servicos'),
    api('GET', '/vendedores')
  ]);
  vendaItens = [];
  el.innerHTML = `
  <div style="display:grid;grid-template-columns:1fr 380px;gap:24px">
    <div>
      <div class="card" style="margin-bottom:20px">
        <div class="card-header"><span class="card-title">Adicionar Item</span></div>
        <div class="card-body">
          <div class="tabs" id="tabs-tipo">
            <button class="tab active" onclick="setTabVenda('produto', this)">Produto</button>
            <button class="tab" onclick="setTabVenda('servico', this)">Serviço Balcão</button>
            <button class="tab" onclick="setTabVenda('manual', this)">Item Manual</button>
          </div>
          <div id="tab-produto">
            <div class="form-grid">
              <div class="form-group form-full">
                <label>Produto</label>
                <select id="venda-produto-sel" onchange="selecionarProduto()">
                  <option value="">-- Selecione o produto --</option>
                  ${vendaProdutos.map(p => `<option value="${p.id}" data-preco="${p.preco_venda}" data-nome="${p.nome}" data-estoque="${p.estoque}" data-imagem="${p.imagem || ''}">${p.nome} - ${formatCurrency(p.preco_venda)}</option>`).join('')}
                </select>
                <button type="button" id="btn-ver-foto-venda" onclick="verFotoProdutoVenda()" style="display:none;margin-top:6px;width:100%;background:#f0f9ff;color:#0369a1;border:1px solid #bae6fd;border-radius:8px;padding:7px 12px;cursor:pointer;font-size:13px;font-weight:500">
                  📷 Ver Foto do Produto
                </button>
              </div>
              <div class="form-group">
                <label>Quantidade</label>
                <input type="number" id="venda-produto-qtd" min="1" value="1">
              </div>
              <div class="form-group">
                <label>Preço Unitário (R$)</label>
                <input type="number" id="venda-produto-preco" step="0.01" min="0" value="0">
              </div>
            </div>
            <button class="btn btn-primary" onclick="adicionarItemProduto()">+ Adicionar</button>
          </div>
          <div id="tab-servico" style="display:none">
            <div class="form-grid">
              <div class="form-group form-full">
                <label>Serviço</label>
                <select id="venda-servico-sel" onchange="selecionarServico()">
                  <option value="">-- Selecione o serviço --</option>
                  ${vendaServicos.map(s => `<option value="${s.id}" data-preco="${s.preco_base}" data-nome="${s.nome}">${s.nome} - ${formatCurrency(s.preco_base)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label>Quantidade</label>
                <input type="number" id="venda-servico-qtd" min="1" value="1">
              </div>
              <div class="form-group">
                <label>Valor (R$)</label>
                <input type="number" id="venda-servico-preco" step="0.01" min="0" value="0">
              </div>
            </div>
            <button class="btn btn-primary" onclick="adicionarItemServico()">+ Adicionar</button>
          </div>
          <div id="tab-manual" style="display:none">
            <div class="form-grid">
              <div class="form-group form-full">
                <label>Descrição do Item</label>
                <input type="text" id="venda-manual-desc" placeholder="Ex: Serviço especial...">
              </div>
              <div class="form-group">
                <label>Quantidade</label>
                <input type="number" id="venda-manual-qtd" min="1" value="1">
              </div>
              <div class="form-group">
                <label>Valor Unitário (R$)</label>
                <input type="number" id="venda-manual-preco" step="0.01" min="0" value="0">
              </div>
            </div>
            <button class="btn btn-primary" onclick="adicionarItemManual()">+ Adicionar</button>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">Itens da Venda</span></div>
        <div id="lista-itens-venda">
          <div class="empty-state"><h3>Nenhum item adicionado</h3><p>Selecione produtos ou serviços acima</p></div>
        </div>
      </div>
    </div>
    <div>
      <div class="card" style="position:sticky;top:80px">
        <div class="card-header"><span class="card-title">Resumo</span></div>
        <div class="card-body">
          <div class="form-group" style="margin-bottom:14px">
            <label>Cliente (opcional)</label>
            <select id="venda-cliente" onchange="toggleClienteAvulso('venda')">
              <option value="">-- Sem cliente --</option>
              ${vendaClientes.map(c => `<option value="${c.id}">${c.nome}</option>`).join('')}
            </select>
            <input type="text" id="venda-cliente-avulso" placeholder="Nome do cliente (opcional)" style="margin-top:6px;padding:8px 12px;border:2px solid #e5e7eb;border-radius:9px;font-size:13px;width:100%">
          </div>
          <div class="form-group" style="margin-bottom:14px">
            <label>Funcionário</label>
            <select id="venda-vendedor">
              <option value="">-- Selecione o Funcionário --</option>
              ${vendaVendedores.map(v => `<option value="${v.id}">${v.nome}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="margin-bottom:14px">
            <label>Pagamentos</label>
            <div style="background:#f8fafc;padding:12px;border-radius:10px;border:1px solid #e2e8f0">
              <div class="grid-2" style="gap:8px;margin-bottom:8px">
                <div class="pay-item">
                   <label style="font-size:10px;color:#64748b">💵 Dinheiro</label>
                   <input type="number" id="pay-dinheiro" step="0.01" min="0" value="0" style="padding:6px;width:100%" oninput="calcularCheckout()">
                </div>
                <div class="pay-item">
                   <label style="font-size:10px;color:#64748b">📱 PIX</label>
                   <input type="number" id="pay-pix" step="0.01" min="0" value="0" style="padding:6px;width:100%" oninput="calcularCheckout()">
                </div>
              </div>
              <div class="grid-2" style="gap:8px">
                <div class="pay-item">
                   <label style="font-size:10px;color:#64748b">💳 Cartão 1</label>
                   <input type="number" id="pay-cartao1" step="0.01" min="0" value="0" style="padding:6px;width:100%" oninput="calcularCheckout()">
                </div>
                <div class="pay-item">
                   <label style="font-size:10px;color:#64748b">💳 Cartão 2</label>
                   <input type="number" id="pay-cartao2" step="0.01" min="0" value="0" style="padding:6px;width:100%" oninput="calcularCheckout()">
                </div>
              </div>
            </div>
          </div>
          <div class="form-group" style="margin-bottom:20px">
            <label>Desconto (R$)</label>
            <input type="number" id="venda-desconto" step="0.01" min="0" value="0" oninput="calcularTotal()">
          </div>
          <div class="divider"></div>
          <div style="margin-bottom:8px;display:flex;justify-content:space-between;color:#64748b;font-size:13px">
            <span>Subtotal</span><span id="resumo-subtotal">R$ 0,00</span>
          </div>
          <div style="display:flex;justify-content:space-between;color:#ef4444;font-size:13px">
            <span>Desconto</span><span id="resumo-desconto">- R$ 0,00</span>
          </div>
          <div style="display:flex;justify-content:space-between;color:#f97316;font-size:14px;font-weight:600;margin:8px 0;padding:4px 8px;background:#fff7ed;border-radius:6px">
            <span>RESTANTE</span><span id="resumo-faltante">R$ 0,00</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:20px;font-weight:700;color:#1a56db;margin-bottom:8px">
            <span>TOTAL</span><span id="resumo-total">R$ 0,00</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:600;color:#16a34a;margin-bottom:20px;background:#f0fdf4;padding:8px;border-radius:8px">
            <span>TROCO</span><span id="resumo-troco">R$ 0,00</span>
          </div>
          <div class="form-group" style="margin-bottom:14px">
            <label>Observações</label>
            <textarea id="venda-obs" style="min-height:50px"></textarea>
          </div>
          <button class="btn btn-primary" style="width:100%;padding:14px;font-size:15px" onclick="finalizarVenda()">
            ✓ Finalizar Venda
          </button>
        </div>
      </div>
    </div>
  </div>`;
}

function setTabVenda(tab, btn) {
  ['produto', 'servico', 'manual'].forEach(t => {
    document.getElementById('tab-' + t).style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('#tabs-tipo .tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function selecionarProduto() {
  const sel = document.getElementById('venda-produto-sel');
  const opt = sel.options[sel.selectedIndex];
  if (opt.dataset.preco) document.getElementById('venda-produto-preco').value = opt.dataset.preco;
  const btnFoto = document.getElementById('btn-ver-foto-venda');
  if (btnFoto) btnFoto.style.display = opt.dataset.imagem ? 'block' : 'none';
}

function verFotoProdutoVenda() {
  const sel = document.getElementById('venda-produto-sel');
  const opt = sel.options[sel.selectedIndex];
  if (opt && opt.dataset.imagem) abrirVisualizadorImagem(opt.dataset.imagem, opt.dataset.nome);
}
function selecionarServico() {
  const sel = document.getElementById('venda-servico-sel');
  const opt = sel.options[sel.selectedIndex];
  if (opt.dataset.preco) document.getElementById('venda-servico-preco').value = opt.dataset.preco;
}

function adicionarItemProduto() {
  const sel = document.getElementById('venda-produto-sel');
  const opt = sel.options[sel.selectedIndex];
  if (!sel.value) { toast('Selecione um produto', 'warning'); return; }
  const qtd = parseFloat(document.getElementById('venda-produto-qtd').value) || 1;
  const preco = parseFloat(document.getElementById('venda-produto-preco').value) || 0;
  vendaItens.push({ produto_id: parseInt(sel.value), descricao: opt.dataset.nome, quantidade: qtd, preco_unitario: preco });
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

async function finalizarVenda() {
  if (!vendaItens.length) { toast('Adicione pelo menos um item', 'warning'); return; }

  const total = calcularTotal();
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
    // Open PDF
    if (await modalConfirmar({ titulo: 'Imprimir Recibo', mensagem: `Venda <strong>${r.numero}</strong> finalizada! Deseja imprimir o recibo?`, icone: '🖨️', textoBotao: 'Imprimir' })) {
      window.open(`/api/pdf/venda/${r.id}?t=${getToken()}`, '_blank');
    }
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

    const itensHtml = v.itens.map(it => `
      <tr>
        <td>${it.produto_nome || it.servico_nome || 'Item'}</td>
        <td>${it.quantidade}</td>
        <td>${formatCurrency(it.preco_unitario)}</td>
        <td>${formatCurrency(it.quantidade * it.preco_unitario)}</td>
      </tr>
    `).join('');

    overlay.innerHTML = `
    <div class="modal modal-lg">
      <div class="modal-header">
        <span class="modal-title">Detalhes da Venda ${v.numero}</span>
        <button class="modal-close" onclick="closeModal('modal-view-venda')">&times;</button>
      </div>
      <div class="modal-body">
        <div class="grid-2" style="margin-bottom:20px">
          <div>
            <p><strong>Data:</strong> ${formatDate(v.data)}</p>
            <p><strong>Cliente:</strong> ${v.cliente_nome || v.cliente_nome_avulso || '????'}</p>
            ${v.cliente_telefone ? `<p><strong>Telefone:</strong> ${v.cliente_telefone}</p>` : ''}
          </div>
          <div>
            <p><strong>Status:</strong> ${badgeStatus(v.status)}</p>
            <p><strong>Funcionário:</strong> ${v.vendedor_nome || '-'}</p>
          </div>
        </div>

        <div class="divider"></div>
        <h4 style="margin-bottom:10px">Itens</h4>
        <div style="max-height: 250px; overflow-y: auto;">
          <table class="table-sm">
            <thead><tr><th>Item</th><th>Qtd</th><th>Preço</th><th>Total</th></tr></thead>
            <tbody>${itensHtml}</tbody>
          </table>
        </div>

        <div class="divider"></div>
        <div class="flex justify-between" style="margin-top:10px">
          <div>
            <p><strong>Pagamento:</strong> ${badgePagamento(v.forma_pagamento)}</p>
            ${v.observacoes ? `<p><strong>Obs:</strong> ${v.observacoes}</p>` : ''}
          </div>
          <div class="text-right">
             Subtotal: ${formatCurrency(v.total)}<br>
             Desconto: ${formatCurrency(v.desconto)}<br>
             <span style="font-size:18px;font-weight:700;color:#1e293b">Total: ${formatCurrency(v.total_final)}</span>
          </div>
        </div>

        ${v.status === 'cancelada' ? `
          <div class="alert alert-error" style="margin-top:15px">
            <strong>Venda Cancelada</strong><br>
            Motivo: ${v.motivo_cancelamento || 'Não informado'}
          </div>
        ` : ''}
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
