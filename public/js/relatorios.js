async function relatorios(el) {
  const ok = await modalSenhaGerente('Relatórios', 'Os relatórios financeiros são restritos ao gerente.');
  if (!ok) { navigateTo('dashboard'); return; }
  el.innerHTML = `
  <div class="tabs" id="tabs-relatorios">
    <button class="tab active" onclick="showRelatorio('geral', this)">Geral (Tudo)</button>
    <button class="tab" onclick="showRelatorio('vendas', this)">Vendas</button>
    <button class="tab" onclick="showRelatorio('os', this)">Ordens de Serviço</button>
    <button class="tab" onclick="showRelatorio('estoque', this)">Estoque</button>
  </div>
  <div id="relatorio-geral"></div>
  <div id="relatorio-vendas" style="display:none"></div>
  <div id="relatorio-os" style="display:none"></div>
  <div id="relatorio-estoque" style="display:none"></div>`;
  mostrarRelatorioGeral();
}

async function showRelatorio(tipo, btn) {
  ['geral', 'vendas', 'os', 'estoque'].forEach(t => {
    const el = document.getElementById('relatorio-' + t);
    if (el) el.style.display = 'none';
  });
  document.getElementById('relatorio-' + tipo).style.display = 'block';
  document.querySelectorAll('#tabs-relatorios .tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (tipo === 'geral') mostrarRelatorioGeral();
  if (tipo === 'vendas') mostrarRelatorioVendas();
  if (tipo === 'os') mostrarRelatorioOS();
  if (tipo === 'estoque') mostrarRelatorioEstoque();
}

async function mostrarRelatorioGeral() {
  const el = document.getElementById('relatorio-geral');
  el.innerHTML = `
  <div class="card">
    <div class="card-header">
      <span class="card-title">Relatório Geral (Vendas + Serviços)</span>
      <div class="flex gap-2 align-center">
        <input type="date" id="rel-geral-ini" value="${monthStart()}" style="padding:8px 12px;border:2px solid #e5e7eb;border-radius:9px;font-size:13px">
        <input type="date" id="rel-geral-fim" value="${today()}" style="padding:8px 12px;border:2px solid #e5e7eb;border-radius:9px;font-size:13px">
        <button class="btn btn-secondary" onclick="carregarRelatorioGeral()">Gerar</button>
        <button class="btn btn-primary" onclick="imprimirFechamentoCaixa()">
          <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;margin-right:5px"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>
          Imprimir Fechamento
        </button>
      </div>
    </div>
    <div id="rel-geral-content" class="card-body"><p class="text-muted">Clique em "Gerar" para carregar o relatório.</p></div>
  </div>`;
  await carregarRelatorioGeral();
}

function imprimirFechamentoCaixa(tipo = 'geral') {
  let di, df;
  if (tipo === 'geral') {
    di = document.getElementById('rel-geral-ini').value;
    df = document.getElementById('rel-geral-fim').value;
  } else if (tipo === 'venda') {
    di = document.getElementById('rel-venda-ini').value;
    df = document.getElementById('rel-venda-fim').value;
  } else if (tipo === 'os') {
    di = document.getElementById('rel-os-ini').value;
    df = document.getElementById('rel-os-fim').value;
  }
  window.open(`/api/pdf/caixa?data_inicio=${di}&data_fim=${df}&tipo=${tipo}&token=${getToken()}`, '_blank');
}

async function carregarRelatorioGeral() {
  const di = document.getElementById('rel-geral-ini').value;
  const df = document.getElementById('rel-geral-fim').value;
  const data = await api('GET', `/relatorios/geral?data_inicio=${di}&data_fim=${df}`);
  const el = document.getElementById('rel-geral-content');
  const r = data.resultado;

  const catLabels = { material:'Material', combustivel:'Combustível', alimentacao:'Alimentação', manutencao:'Manutenção', servicos:'Serviços', outros:'Outros' };
  const pgLabels  = { dinheiro:'Dinheiro', pix:'PIX', credito:'Crédito', debito:'Débito' };

  const corResultado = r.resultado_liquido >= 0 ? '#16a34a' : '#dc2626';
  const bgResultado  = r.resultado_liquido >= 0 ? '#f0fdf4' : '#fff5f5';
  const bdResultado  = r.resultado_liquido >= 0 ? '#bbf7d0' : '#fecaca';

  // Funcionários já vêm prontos do backend com todos os campos
  const porFuncionario = (r.funcionarios || []);
  const totalFuncionariosGross = (r.total_salarios||0) + (r.total_comissoes||0) + (r.total_bonus||0);

  el.innerHTML = `
    <!-- Resultado Líquido -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:24px">

      <div style="background:#f8faff;border:1px solid #e0e7ff;border-radius:14px;padding:18px 20px">
        <div style="font-size:11px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px">💰 Receitas</div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px">
          <span style="color:#475569">OS Concluídas</span>
          <strong>${formatCurrency(data.list.filter(x=>x.tipo==='os').reduce((s,x)=>s+x.valor,0))}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px">
          <span style="color:#475569">Vendas</span>
          <strong>${formatCurrency(data.list.filter(x=>x.tipo==='venda').reduce((s,x)=>s+x.valor,0))}</strong>
        </div>
        <div style="border-top:1px solid #e0e7ff;padding-top:8px;display:flex;justify-content:space-between;font-size:14px;font-weight:700;color:#1e293b">
          <span>Total Bruto</span><span>${formatCurrency(r.faturamento_bruto)}</span>
        </div>
      </div>

      <div style="background:#fff8f0;border:1px solid #fed7aa;border-radius:14px;padding:18px 20px">
        <div style="font-size:11px;font-weight:700;color:#ea580c;text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px">➖ Deduções</div>

        ${r.gastos.length ? `
        <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Despesas</div>
        ${r.gastos.map(g => `
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:12px">
          <span style="color:#475569">${catLabels[g.categoria]||g.categoria}</span>
          <span style="color:#dc2626">-${formatCurrency(g.total)}</span>
        </div>`).join('')}` : ''}

        ${porFuncionario.length ? `
        <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin:10px 0 6px">Funcionários</div>
        ${porFuncionario.map(f => `
        <div style="background:#fff;border:1px solid #fde8d8;border-radius:8px;padding:8px 10px;margin-bottom:6px">
          <div style="font-weight:700;font-size:12px;color:#1e293b;margin-bottom:4px">👤 ${f.nome}</div>
          <div style="font-size:11px;color:#64748b;display:flex;flex-direction:column;gap:2px;margin-bottom:5px">
            ${(f.salario_base||0) > 0 ? `<span>💼 Salário: ${formatCurrency(f.salario_base)}</span>` : ''}
            ${(f.comissao||0) > 0 ? `<span>💰 Comissão (${f.percentual_comissao||0}%, ${f.qtd_os} OS): +${formatCurrency(f.comissao)}</span>` : ''}
            ${(f.bonus||0) > 0 ? `<span style="color:#16a34a">🏆 Bônus meta (${formatCurrency(f.total_os)} / meta ${formatCurrency(f.meta)}): +${formatCurrency(f.bonus)}</span>` : ((f.meta||0) > 0 ? `<span style="color:#94a3b8">🎯 Meta: ${formatCurrency(f.total_os||0)} / ${formatCurrency(f.meta)} (não atingida)</span>` : '')}
            ${(f.vales||0) > 0 ? `<span style="color:#dc2626">➖ Vale descontado: -${formatCurrency(f.vales)}</span>` : ''}
          </div>
          <div style="border-top:1px solid #fde8d8;padding-top:5px;font-size:12px;font-weight:700;color:${f.devendo ? '#dc2626' : '#16a34a'}">
            ${f.devendo ? '⚠️ Devendo: ' : '= A receber: '}${formatCurrency(f.total_a_pagar||0)}
          </div>
        </div>`).join('')}
        <div style="display:flex;justify-content:space-between;font-size:12px;color:#64748b;margin-bottom:6px">
          <span>Subtotal funcionários</span><span style="color:#dc2626">-${formatCurrency(totalFuncionariosGross)}</span>
        </div>` : ''}

        ${!r.gastos.length && !porFuncionario.length ? `<div style="color:#94a3b8;font-size:12px">Nenhuma dedução no período</div>` : ''}
        <div style="border-top:1px solid #fed7aa;padding-top:8px;display:flex;justify-content:space-between;font-size:14px;font-weight:700;color:#dc2626">
          <span>Total Deduções</span><span>-${formatCurrency((r.total_gastos||0) + (r.total_salarios||0) + (r.total_comissoes||0) + (r.total_bonus||0))}</span>
        </div>
      </div>

      <div style="background:${bgResultado};border:2px solid ${bdResultado};border-radius:14px;padding:18px 20px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center">
        <div style="font-size:11px;font-weight:700;color:${corResultado};text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px">${r.resultado_liquido >= 0 ? '✅ Lucro Líquido' : '⚠️ Prejuízo'}</div>
        <div style="font-size:28px;font-weight:800;color:${corResultado};line-height:1">${formatCurrency(r.resultado_liquido)}</div>
        <div style="font-size:12px;color:${corResultado};margin-top:6px;opacity:.8">Margem: ${r.margem}%</div>
      </div>
    </div>

    <!-- Formas de pagamento -->
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px">
      ${data.totais.map(t => `
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px 16px;display:flex;align-items:center;gap:10px">
        <div style="font-size:11px;color:#64748b;font-weight:600">${pgLabels[t.forma_pagamento]||t.forma_pagamento||'Outros'}</div>
        <div style="font-size:15px;font-weight:700;color:#1e293b">${formatCurrency(t.total)}</div>
      </div>`).join('')}
    </div>

    <!-- Listagem -->
    ${data.list.length ? `<table>
    <thead><tr><th>Tipo</th><th>Nº</th><th>Data</th><th>Cliente / Funcionário</th><th>Pagamento</th><th>Total</th></tr></thead>
    <tbody>${data.list.map(v => `
      <tr>
        <td><span class="badge badge-${v.tipo === 'venda' ? 'ok' : 'primary'}">${v.tipo.toUpperCase()}</span></td>
        <td><strong>${v.numero}</strong></td>
        <td>${formatDate(v.data)}</td>
        <td>
          <div style="font-weight:500">${v.cliente_nome || v.cliente_nome_avulso || '<span class="text-muted">????</span>'}</div>
          ${v.vendedor_nome ? `<div class="text-muted" style="font-size:11px">Func.: ${v.vendedor_nome}</div>` : ''}
        </td>
        <td>${badgePagamento(v.forma_pagamento)}</td>
        <td class="currency">${formatCurrency(v.valor)}</td>
      </tr>`).join('')}
    </tbody></table>` : '<div class="empty-state"><h3>Nenhuma movimentação no período</h3></div>'}`;
}

async function mostrarRelatorioVendas() {
  const el = document.getElementById('relatorio-vendas');
  el.innerHTML = `
  <div class="card">
    <div class="card-header">
      <span class="card-title">Relatório de Vendas</span>
      <div class="flex gap-2 align-center">
        <input type="date" id="rel-venda-ini" value="${monthStart()}" style="padding:8px 12px;border:2px solid #e5e7eb;border-radius:9px;font-size:13px">
        <input type="date" id="rel-venda-fim" value="${today()}" style="padding:8px 12px;border:2px solid #e5e7eb;border-radius:9px;font-size:13px">
        <button class="btn btn-secondary" onclick="carregarRelatorioVendas()">Gerar</button>
        <button class="btn btn-primary" onclick="imprimirFechamentoCaixa('venda')">
          <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;margin-right:5px"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>
          Imprimir Fechamento
        </button>
      </div>
    </div>
    <div id="rel-vendas-content" class="card-body"><p class="text-muted">Clique em "Gerar" para carregar o relatório.</p></div>
  </div>`;
  await carregarRelatorioVendas();
}

async function carregarRelatorioVendas() {
  const di = document.getElementById('rel-venda-ini').value;
  const df = document.getElementById('rel-venda-fim').value;
  const data = await api('GET', `/relatorios/vendas?data_inicio=${di}&data_fim=${df}`);
  const el = document.getElementById('rel-vendas-content');
  const totalGeral = data.totais.reduce((a, v) => a + v.total, 0);
  el.innerHTML = `
    <div class="alert alert-success" style="margin-bottom:20px; font-weight: 700;">
        Faturamento em Vendas no Período: ${formatCurrency(totalGeral)}
    </div>
    <div class="stats-grid" style="margin-bottom:20px">
      <div class="stat-card">
        <div class="stat-icon" style="background:linear-gradient(135deg,#1a56db,#3b82f6)"><svg viewBox="0 0 24 24"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/></svg></div>
        <div><div class="stat-value">${formatCurrency(totalGeral)}</div><div class="stat-label">Total Vendas</div></div>
      </div>
      ${data.totais.map(t => `
      <div class="stat-card">
        <div class="stat-icon" style="background:linear-gradient(135deg,#7c3aed,#a78bfa)"><svg viewBox="0 0 24 24"><path d="M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/></svg></div>
        <div><div class="stat-value">${formatCurrency(t.total)}</div><div class="stat-label">${{ dinheiro: 'Dinheiro', pix: 'PIX', credito: 'Crédito', debito: 'Débito', cartao1: 'Cartão 1', cartao2: 'Cartão 2' }[t.forma_pagamento] || t.forma_pagamento}</div></div>
      </div>`).join('')}
    </div>
    ${data.vendas.length ? `<table>
    <thead><tr><th>Nº</th><th>Data</th><th>Cliente / Funcionário</th><th>Pagamento</th><th>Total</th><th>Status</th></tr></thead>
    <tbody>${data.vendas.map(v => `
      <tr style="${v.status === 'cancelada' ? 'opacity:0.6;text-decoration:line-through' : ''}">
        <td><strong>${v.numero}</strong></td>
        <td>${formatDate(v.data)}</td>
        <td>
          <div style="font-weight:500">${v.cliente_nome || v.cliente_nome_avulso || '<span class="text-muted">????</span>'}</div>
          ${v.vendedor_nome ? `<div class="text-muted" style="font-size:11px">Func.: ${v.vendedor_nome}</div>` : ''}
        </td>
        <td>${badgePagamento(v.forma_pagamento)}</td>
        <td class="currency">${formatCurrency(v.total_final)}</td>
        <td>
          ${badgeStatus(v.status)}
          ${v.motivo_cancelamento ? `<div class="text-muted" style="font-size:11px;margin-top:4px">Motivo: ${v.motivo_cancelamento}</div>` : ''}
        </td>
      </tr>`).join('')}
    </tbody></table>` : '<div class="empty-state"><h3>Nenhuma venda no período</h3></div>'}`;
}

async function mostrarRelatorioOS() {
  const el = document.getElementById('relatorio-os');
  el.innerHTML = `
  <div class="card">
    <div class="card-header">
      <span class="card-title">Relatório de Ordens de Serviço</span>
      <div class="flex gap-2 align-center">
        <input type="date" id="rel-os-ini" value="${monthStart()}" style="padding:8px 12px;border:2px solid #e5e7eb;border-radius:9px;font-size:13px">
        <input type="date" id="rel-os-fim" value="${today()}" style="padding:8px 12px;border:2px solid #e5e7eb;border-radius:9px;font-size:13px">
        <button class="btn btn-secondary" onclick="carregarRelatorioOS()">Gerar</button>
        <button class="btn btn-primary" onclick="imprimirFechamentoCaixa('os')">
          <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;margin-right:5px"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>
          Imprimir Fechamento
        </button>
      </div>
    </div>
    <div id="rel-os-content" class="card-body"></div>
  </div>`;
  await carregarRelatorioOS();
}

async function carregarRelatorioOS() {
  const di = document.getElementById('rel-os-ini').value;
  const df = document.getElementById('rel-os-fim').value;
  const data = await api('GET', `/relatorios/os?data_inicio=${di}&data_fim=${df}`);
  const list = data.os;
  const el = document.getElementById('rel-os-content');
  const totalOS = data.totais.reduce((a, v) => a + v.total, 0);
  el.innerHTML = `
    <div class="alert alert-success" style="margin-bottom:20px; font-weight:700">
        Total de Serviços (OS) Concluídos no Período: ${formatCurrency(totalOS)}
    </div>
    <div class="stats-grid" style="margin-bottom:20px">
      <div class="stat-card">
        <div class="stat-icon" style="background:linear-gradient(135deg,#10b981,#34d399)"><svg viewBox="0 0 24 24"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/></svg></div>
        <div><div class="stat-value">${formatCurrency(totalOS)}</div><div class="stat-label">Total OS</div></div>
      </div>
      ${data.totais.map(t => `
      <div class="stat-card">
        <div class="stat-icon" style="background:linear-gradient(135deg,#f59e0b,#fbbf24)"><svg viewBox="0 0 24 24"><path d="M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/></svg></div>
        <div><div class="stat-value">${formatCurrency(t.total)}</div><div class="stat-label">${{ dinheiro: 'Dinheiro', pix: 'PIX', credito: 'Crédito', debito: 'Débito' }[t.forma_pagamento] || t.forma_pagamento}</div></div>
      </div>`).join('')}
    </div>
    ${list.length ? `<table>
    <thead><tr><th>Nº OS</th><th>Cliente</th><th>Técnico</th><th>Entrada</th><th>Status</th><th>Valor</th></tr></thead>
    <tbody>${list.map(o => `<tr style="${o.status === 'cancelada' ? 'opacity:0.6;text-decoration:line-through' : ''}">
      <td><strong>${o.numero}</strong></td>
      <td>${o.cliente_nome || '-'}</td>
      <td>${o.vendedor_nome || '-'}</td>
      <td>${formatDate(o.data_entrada)}</td>
      <td>
        ${badgeStatus(o.status)}
        ${o.motivo_cancelamento ? `<div class="text-muted" style="font-size:11px;margin-top:4px">Motivo: ${o.motivo_cancelamento}</div>` : ''}
      </td>
      <td class="currency">${formatCurrency(o.valor)}</td>
    </tr>`).join('')}</tbody></table>` : '<div class="empty-state"><h3>Nenhuma OS no período</h3></div>'}`;
}

async function mostrarRelatorioEstoque() {
  const el = document.getElementById('relatorio-estoque');
  el.innerHTML = `<div class="card"><div class="card-header"><span class="card-title">Relatório de Estoque</span></div><div id="rel-est-content" class="card-body"><p>Carregando...</p></div></div>`;
  const data = await api('GET', '/relatorios/estoque');
  const el2 = document.getElementById('rel-est-content');
  el2.innerHTML = `<div class="alert alert-warning" style="margin-bottom:16px">Valor total em estoque: <strong>${formatCurrency(data.valor_total)}</strong></div>
  <table>
    <thead><tr><th>Produto</th><th>Estoque</th><th>Est. Mínimo</th><th>Preço Venda</th><th>Valor Total</th><th>Status</th></tr></thead>
    <tbody>${data.produtos.map(p => `<tr>
      <td><strong>${p.nome}</strong></td>
      <td style="${p.estoque <= p.estoque_minimo ? 'color:#dc2626;font-weight:700' : ''}">${p.estoque} ${p.unidade}</td>
      <td>${p.estoque_minimo}</td>
      <td>${formatCurrency(p.preco_venda)}</td>
      <td class="currency">${formatCurrency(p.valor_total)}</td>
      <td>${p.estoque <= p.estoque_minimo ? '<span class="badge badge-baixo">⚠ Baixo</span>' : '<span class="badge badge-ok">OK</span>'}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}
