async function dashboard(el) {
  try {
    const data = await api('GET', '/relatorios/dashboard');
    if (!data) return;

    const fmtVal = v => 'R$ ' + parseFloat(v||0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const fmtDate = s => s ? s.slice(0,10).split('-').reverse().join('/') : '—';
    const ar = data.a_receber || { qtd: 0, total: 0, vencidos: 0 };
    const arAlerta = ar.vencidos > 0;
    const gm = data.gastos_mes || { total: 0, qtd: 0 };
    const resultado = data.vendas_mes.total - gm.total;

    const pgLabel = { dinheiro:'Dinheiro', pix:'PIX', cartao1:'Cartão', cartao2:'Cartão', credito:'Cartão', debito:'Cartão', misto:'Misto' };
    const pgColor = { dinheiro:'#15803d', pix:'#1d4ed8', cartao1:'#7e22ce' };
    const pgBg    = { dinheiro:'#f0fdf4', pix:'#eff6ff', cartao1:'#fdf4ff' };

    function badgePg(fp) {
      const cor = pgColor[fp] || '#475569';
      const bg  = pgBg[fp]    || '#f1f5f9';
      return `<span style="display:inline-flex;align-items:center;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:600;background:${bg};color:${cor}">${pgLabel[fp] || fp || '—'}</span>`;
    }
    function badgeSt(status) {
      const map = {
        aberta:       { bg:'#fef3c7', color:'#92400e', label:'Aberta'       },
        em_andamento: { bg:'#dbeafe', color:'#1e40af', label:'Em andamento' },
        concluida:    { bg:'#d1fae5', color:'#065f46', label:'Concluída'    },
        cancelada:    { bg:'#fee2e2', color:'#991b1b', label:'Cancelada'    },
      };
      const s = map[status] || { bg:'#f1f5f9', color:'#475569', label: status };
      return `<span style="display:inline-flex;align-items:center;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:600;background:${s.bg};color:${s.color}">${s.label}</span>`;
    }

    const cards = [
      {
        label: 'OS em Aberto',
        value: data.os_abertas,
        sub: 'abertas + em andamento',
        grad: 'linear-gradient(135deg,#f59e0b,#fbbf24)',
        icon: `<path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.89 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>`,
        action: () => navigateTo('ordens')
      },
      {
        label: 'OS Concluídas (mês)',
        value: data.os_concluidas_mes,
        sub: 'neste mês',
        grad: 'linear-gradient(135deg,#10b981,#34d399)',
        icon: `<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>`,
        action: null
      },
      {
        label: 'Estoque Baixo',
        value: data.produtos_baixo_estoque,
        sub: data.produtos_baixo_estoque > 0 ? 'produtos abaixo do mínimo' : 'tudo em ordem',
        grad: data.produtos_baixo_estoque > 0 ? 'linear-gradient(135deg,#ef4444,#f87171)' : 'linear-gradient(135deg,#10b981,#34d399)',
        icon: `<path d="M20 7h-4V5c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2v2H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zM10 5h4v2h-4V5zm10 15H4V9h16v11z"/>`,
        action: data.produtos_baixo_estoque > 0 ? () => navigateTo('produtos') : null
      },
      {
        label: 'Cobranças',
        value: `${ar.qtd} pendente${ar.qtd !== 1 ? 's' : ''}`,
        sub: ar.vencidos > 0 ? `⚠ ${ar.vencidos} vencida${ar.vencidos>1?'s':''}` : 'clique para ver',
        grad: arAlerta ? 'linear-gradient(135deg,#dc2626,#f87171)' : 'linear-gradient(135deg,#d97706,#fbbf24)',
        icon: `<path d="M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/>`,
        action: () => navegarCobrancas(),
        hidden: ar.qtd === 0
      },
    ].filter(c => !c.hidden);

    const cardsHtml = cards.map(c => `
      <div class="stat-card${c.action ? ' stat-card-link' : ''}" ${c.action ? `onclick="(${c.action.toString()})()" style="cursor:pointer"` : ''}>
        <div class="stat-icon" style="background:${c.grad}">
          <svg viewBox="0 0 24 24">${c.icon}</svg>
        </div>
        <div style="min-width:0">
          <div class="stat-value">${c.value}</div>
          <div class="stat-label">${c.label}</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:1px">${c.sub}</div>
        </div>
      </div>`).join('');

    const vendasRows = data.ultimas_vendas.length
      ? data.ultimas_vendas.map(v => `
        <tr>
          <td><span style="font-weight:600;color:#1a56db">${v.numero}</span></td>
          <td>
            <div style="font-weight:500;font-size:13px">${v.cliente_nome || v.cliente_nome_avulso || '<span style="color:#94a3b8">Avulso</span>'}</div>
          </td>
          <td style="font-weight:700;color:#1e293b">${fmtVal(v.total_final)}</td>
          <td>${badgePg(v.forma_pagamento)}</td>
        </tr>`).join('')
      : `<tr><td colspan="4" style="text-align:center;padding:28px;color:#94a3b8;font-size:13px">Nenhuma venda registrada</td></tr>`;

    const osRows = data.ultimas_os.length
      ? data.ultimas_os.map(o => `
        <tr>
          <td><span style="font-weight:600;color:#1a56db">${o.numero}</span></td>
          <td style="font-weight:500;font-size:13px">${o.cliente_nome || o.cliente_nome_avulso || '<span style="color:#94a3b8">Avulso</span>'}</td>
          <td>${badgeSt(o.status)}</td>
          <td style="font-size:12px;color:#64748b">${o.vendedor_nome || '—'}</td>
        </tr>`).join('')
      : `<tr><td colspan="4" style="text-align:center;padding:28px;color:#94a3b8;font-size:13px">Nenhuma OS registrada</td></tr>`;

    el.innerHTML = `
      <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(210px,1fr))">
        ${cardsHtml}
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">Últimas Ordens de Serviço</span>
          <button class="btn btn-sm btn-secondary" onclick="navigateTo('ordens')">Ver todas</button>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width:100px">Nº</th>
              <th>Cliente</th>
              <th style="width:110px">Status</th>
              <th style="width:130px">Funcionário</th>
            </tr>
          </thead>
          <tbody>${osRows}</tbody>
        </table>
      </div>`;

  } catch (e) {
    el.innerHTML = `<div style="padding:24px;background:#fef2f2;border-radius:12px;color:#dc2626">${e.message}</div>`;
  }
}
