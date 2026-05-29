// === A RECEBER ===

async function navegarCobrancas() {
  if (!await pedirSenhaGerente()) return;
  navigateTo('a-receber');
}

const AR_PG = { dinheiro: 'Dinheiro', pix: 'PIX', cartao1: 'Cartão', cartao2: 'Cartão', credito: 'Cartão', debito: 'Cartão', misto: 'Misto' };
const AR_PG_OPTS = { dinheiro: 'Dinheiro', pix: 'PIX', debito: 'Débito', credito: 'Crédito', misto: 'Misto' };
const arFmtVal = v => 'R$ ' + parseFloat(v||0).toFixed(2).replace('.', ',');
const arFmtDate = s => s ? s.slice(0,10).split('-').reverse().join('/') : '—';

async function aReceberPage(el) {
  el.innerHTML = '<div class="empty-state"><p>Carregando...</p></div>';
  await renderAReceber(el);
}

async function renderAReceber(el) {
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const hojeStr = hoje.toLocaleDateString('en-CA');

  const [list, historico] = await Promise.all([
    api('GET', '/ordens?a_receber=1'),
    api('GET', '/ordens/historico-pagamentos').catch(() => [])
  ]);

  const pendentes = list.filter(o => !o.a_receber_pago);
  const totalPendente = pendentes.reduce((s, o) => s + (o.valor - (o.valor_pago||0)), 0);
  const vencidos = pendentes.filter(o => o.data_vencimento && new Date(o.data_vencimento) < hoje);
  const totalVencido = vencidos.reduce((s, o) => s + (o.valor - (o.valor_pago||0)), 0);
  const pausados = pendentes.filter(o => o.cobranca_pausado_em === hojeStr).length;
  const recebidoHoje = (historico||[]).filter(p => p.criado_em?.startsWith(hojeStr)).reduce((s,p) => s + p.valor, 0);

  // Agrupar por cliente
  const grupos = {};
  pendentes.forEach(o => {
    const key = o.cliente_id ? `c_${o.cliente_id}` : `a_${o.id}`;
    const nome = o.cliente_nome || o.cliente_nome_avulso || '????';
    if (!grupos[key]) grupos[key] = { cliente_id: o.cliente_id, nome, os: [], os_id_unico: o.id };
    grupos[key].os.push(o);
  });

  const resumo = `
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px">
      <div style="flex:1;min-width:140px;background:linear-gradient(135deg,#f59e0b,#fbbf24);border-radius:12px;padding:16px 20px;color:#fff">
        <div style="font-size:11px;font-weight:600;opacity:.85;text-transform:uppercase;letter-spacing:.5px">Cobranças</div>
        <div style="font-size:24px;font-weight:800;margin-top:4px">${arFmtVal(totalPendente)}</div>
        <div style="font-size:11px;opacity:.8">${pendentes.length} OS pendente${pendentes.length!==1?'s':''}</div>
      </div>
      <div style="flex:1;min-width:140px;background:linear-gradient(135deg,#ef4444,#f87171);border-radius:12px;padding:16px 20px;color:#fff">
        <div style="font-size:11px;font-weight:600;opacity:.85;text-transform:uppercase;letter-spacing:.5px">Vencido</div>
        <div style="font-size:24px;font-weight:800;margin-top:4px">${arFmtVal(totalVencido)}</div>
        <div style="font-size:11px;opacity:.8">${vencidos.length} OS em atraso</div>
      </div>
      <div style="flex:1;min-width:140px;background:linear-gradient(135deg,#10b981,#34d399);border-radius:12px;padding:16px 20px;color:#fff">
        <div style="font-size:11px;font-weight:600;opacity:.85;text-transform:uppercase;letter-spacing:.5px">Recebido Hoje</div>
        <div style="font-size:24px;font-weight:800;margin-top:4px">${arFmtVal(recebidoHoje)}</div>
        <div style="font-size:11px;opacity:.8">${pausados} pausada${pausados!==1?'s':''} hoje</div>
      </div>
    </div>`;

  if (!pendentes.length) {
    el.innerHTML = resumo + '<div class="empty-state"><h3>Nenhuma cobrança pendente</h3><p>Todas as OS a receber foram pagas.</p></div>' + arHistoricoHtml(historico);
    return;
  }

  const gruposHtml = Object.values(grupos).map(g => {
    const totalGrupo = g.os.reduce((s, o) => s + (o.valor - (o.valor_pago||0)), 0);
    const temMultiplas = g.os.length > 1 && g.cliente_id;

    const osRows = g.os.map(o => {
      const restante = o.valor - (o.valor_pago||0);
      const vencido = o.data_vencimento && new Date(o.data_vencimento) < hoje;
      const pausadoHoje = o.cobranca_pausado_em === hojeStr;
      const temParcial = (o.valor_pago||0) > 0;
      const pctPago = o.valor > 0 ? Math.min(100, ((o.valor_pago||0) / o.valor) * 100) : 0;

      const diasStr = (() => {
        if (!o.data_vencimento) return '<span style="color:#94a3b8;font-size:11px">Sem vencimento</span>';
        const diff = Math.round((new Date(o.data_vencimento) - hoje) / 86400000);
        if (diff < 0) return `<span style="color:#dc2626;font-weight:700;font-size:11px">⚠ ${Math.abs(diff)}d atraso</span>`;
        if (diff === 0) return `<span style="color:#d97706;font-weight:700;font-size:11px">Vence hoje</span>`;
        return `<span style="color:#64748b;font-size:11px">em ${diff}d</span>`;
      })();

      return `
        <tr style="${vencido ? 'background:#fff5f5' : pausadoHoje ? 'background:#f8fafc;opacity:.7' : ''}">
          <td>
            <strong>${o.numero}</strong>
            ${pausadoHoje ? '<br><span style="font-size:10px;background:#f1f5f9;color:#64748b;padding:1px 6px;border-radius:4px">⏸ PAUSADO HOJE</span>' : ''}
          </td>
          <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px" title="${o.descricao}">${o.descricao}</td>
          <td>${arFmtDate(o.data_vencimento)}<br>${diasStr}</td>
          <td>
            <div style="font-weight:700;color:${vencido?'#dc2626':'#d97706'}">${arFmtVal(restante)}</div>
            ${temParcial ? `
              <div style="font-size:11px;color:#64748b">de ${arFmtVal(o.valor)}</div>
              <div style="margin-top:3px;height:4px;background:#e2e8f0;border-radius:2px">
                <div style="height:4px;background:#10b981;border-radius:2px;width:${pctPago}%"></div>
              </div>` : ''}
          </td>
          <td>
            <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end">
              <button class="btn btn-sm" style="background:#16a34a;color:#fff;font-size:11px;padding:3px 8px" onclick="arReceber(${o.id},'${o.numero}',${restante})">✔ Receber</button>
              ${pausadoHoje
                ? `<button class="btn btn-sm btn-secondary" style="font-size:11px;padding:3px 8px" onclick="arRetomar(${o.id})">▶ Retomar</button>`
                : `<button class="btn btn-sm btn-secondary" style="font-size:11px;padding:3px 8px" onclick="arPausar(${o.id})">⏸ Espera</button>`}
            </div>
          </td>
        </tr>`;
    }).join('');

    return `
      <div class="card" style="margin-bottom:16px">
        <div class="card-header" style="background:#f8fafc">
          <div>
            <span class="card-title" style="font-size:14px">${g.nome}</span>
            <span style="font-size:12px;color:#64748b;margin-left:8px">${g.os.length} OS em aberto</span>
          </div>
          <div style="display:flex;align-items:center;gap:12px">
            <span style="font-weight:700;color:#d97706;font-size:15px">${arFmtVal(totalGrupo)}</span>
            ${g.cliente_id
              ? `<button class="btn btn-sm" style="background:#3b82f6;color:#fff;font-size:12px;padding:4px 12px" onclick="arPagarCliente(${g.cliente_id},'${g.nome.replace(/'/g,"\\'")}',${totalGrupo})">$ Parcial / Total</button>`
              : `<button class="btn btn-sm" style="background:#3b82f6;color:#fff;font-size:12px;padding:4px 12px" onclick="arParcialAvulso(${g.os_id_unico},'${g.nome.replace(/'/g,"\\'")}',${totalGrupo})">$ Parcial / Total</button>`}
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width:90px">Nº OS</th>
              <th>Descrição</th>
              <th style="width:130px">Vencimento</th>
              <th style="width:130px">Valor</th>
              <th style="width:210px"></th>
            </tr>
          </thead>
          <tbody>${osRows}</tbody>
        </table>
      </div>`;
  }).join('');

  el.innerHTML = resumo + gruposHtml + arHistoricoHtml(historico) + arModaisHtml();

  document.getElementById('main-content').addEventListener('click', () => {}, { once: true });
}

function arHistoricoHtml(historico) {
  if (!historico?.length) return '';
  const pgLabel = { dinheiro: 'Dinheiro', pix: 'PIX', cartao1: 'Cartão', cartao2: 'Cartão', credito: 'Cartão', debito: 'Cartão', misto: 'Misto' };
  return `
    <div class="card" style="margin-top:24px">
      <div class="card-header">
        <span class="card-title">Histórico de Recebimentos</span>
      </div>
      <table>
        <thead><tr><th>Data</th><th>OS</th><th>Cliente</th><th>Forma</th><th>Valor</th></tr></thead>
        <tbody>
          ${historico.slice(0,20).map(p => `
            <tr>
              <td style="font-size:12px;color:#64748b">${arFmtDate(p.criado_em)}</td>
              <td><strong>${p.numero}</strong></td>
              <td style="font-size:13px">${p.cliente_nome}</td>
              <td><span style="font-size:11px;background:#eff6ff;color:#1d4ed8;padding:2px 7px;border-radius:10px">${pgLabel[p.forma_pagamento]||p.forma_pagamento}</span></td>
              <td style="font-weight:700;color:#16a34a">${arFmtVal(p.valor)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function arModaisHtml() {
  const opts = Object.entries(AR_PG_OPTS).map(([v,l]) => `<option value="${v}">${l}</option>`).join('');
  return `
    <div id="ar-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10000;align-items:center;justify-content:center" onclick="if(event.target===this)arFecharModal()">
      <div style="background:#fff;border-radius:16px;padding:28px;width:100%;max-width:420px;box-shadow:0 20px 60px rgba(0,0,0,.2)" onclick="event.stopPropagation()">
        <div style="font-size:17px;font-weight:700;margin-bottom:4px" id="ar-modal-titulo"></div>
        <div style="font-size:13px;color:#64748b;margin-bottom:20px" id="ar-modal-sub"></div>
        <div id="ar-modal-body"></div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px">
          <button class="btn btn-secondary" onclick="arFecharModal()">Cancelar</button>
          <button class="btn btn-primary" id="ar-modal-ok">Confirmar</button>
        </div>
      </div>
    </div>`;
}

function arFecharModal() {
  const m = document.getElementById('ar-modal');
  if (m) m.style.display = 'none';
}

function arAbrirModal(titulo, sub, bodyHtml, onOk) {
  const m = document.getElementById('ar-modal');
  document.getElementById('ar-modal-titulo').textContent = titulo;
  document.getElementById('ar-modal-sub').textContent = sub;
  document.getElementById('ar-modal-body').innerHTML = bodyHtml;
  document.getElementById('ar-modal-ok').onclick = onOk;
  m.style.display = 'flex';
}

// ─── Ações ────────────────────────────────────────────────────────────────────

const pgOpts = () => Object.entries(AR_PG_OPTS).map(([v,l]) => `<option value="${v}">${l}</option>`).join('');

async function arReceber(id, numero, restante) {
  arAbrirModal(
    'Registrar Recebimento',
    `OS ${numero} — ${arFmtVal(restante)}`,
    `<label style="font-size:13px;display:block;margin-bottom:6px">Forma de pagamento</label>
     <select id="ar-pgto" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:8px">${pgOpts()}</select>`,
    async () => {
      try {
        await api('PUT', `/ordens/${id}/receber`, { forma_pagamento: document.getElementById('ar-pgto').value });
        arFecharModal();
        toast(`OS ${numero} recebida!`);
        await renderAReceber(document.getElementById('main-content'));
      } catch (e) { toast(e.message, 'error'); }
    }
  );
}

async function arParcial(id, numero, restante) {
  arAbrirModal(
    'Pagamento Parcial',
    `OS ${numero} — Restante: ${arFmtVal(restante)}`,
    `<div style="display:flex;flex-direction:column;gap:12px">
       <div>
         <label style="font-size:13px;display:block;margin-bottom:4px">Valor recebido (R$) *</label>
         <input type="number" id="ar-valor-parcial" min="0.01" step="0.01" max="${restante}" value="${restante}" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;font-weight:700">
       </div>
       <div>
         <label style="font-size:13px;display:block;margin-bottom:4px">Forma de pagamento</label>
         <select id="ar-pgto-parcial" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:8px">${pgOpts()}</select>
       </div>
       <div>
         <label style="font-size:13px;display:block;margin-bottom:4px">Observação</label>
         <input type="text" id="ar-obs-parcial" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:8px">
       </div>
     </div>`,
    async () => {
      const valor = parseFloat(document.getElementById('ar-valor-parcial').value);
      if (!valor || valor <= 0) { toast('Informe um valor válido', 'warning'); return; }
      try {
        const r = await api('POST', `/ordens/${id}/pagamento-parcial`, {
          valor,
          forma_pagamento: document.getElementById('ar-pgto-parcial').value,
          observacoes: document.getElementById('ar-obs-parcial').value.trim() || null
        });
        arFecharModal();
        toast(r.quitado ? `OS ${numero} quitada!` : `Parcial de ${arFmtVal(valor)} registrado! Restam ${arFmtVal(r.valor_restante)}`);
        await renderAReceber(document.getElementById('main-content'));
      } catch (e) { toast(e.message, 'error'); }
    }
  );
  setTimeout(() => document.getElementById('ar-valor-parcial')?.select(), 80);
}

async function arParcialAvulso(osId, nome, restante) {
  arAbrirModal(
    `Pagamento — ${nome}`,
    `Restante: ${arFmtVal(restante)}`,
    `<div style="display:flex;flex-direction:column;gap:12px">
       <div>
         <label style="font-size:13px;display:block;margin-bottom:4px">Valor recebido (R$) *</label>
         <input type="number" id="ar-valor-parcial" min="0.01" step="0.01" max="${restante}" value="${restante}" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;font-weight:700">
       </div>
       <div>
         <label style="font-size:13px;display:block;margin-bottom:4px">Forma de pagamento</label>
         <select id="ar-pgto-parcial" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:8px">${pgOpts()}</select>
       </div>
       <div>
         <label style="font-size:13px;display:block;margin-bottom:4px">Observação</label>
         <input type="text" id="ar-obs-parcial" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:8px">
       </div>
     </div>`,
    async () => {
      const valor = parseFloat(document.getElementById('ar-valor-parcial').value);
      if (!valor || valor <= 0) { toast('Informe um valor válido', 'warning'); return; }
      try {
        const r = await api('POST', `/ordens/${osId}/pagamento-parcial`, {
          valor,
          forma_pagamento: document.getElementById('ar-pgto-parcial').value,
          observacoes: document.getElementById('ar-obs-parcial').value.trim() || null
        });
        arFecharModal();
        toast(r.quitado ? 'OS quitada!' : `${arFmtVal(valor)} registrado! Restam ${arFmtVal(r.valor_restante)}`);
        await renderAReceber(document.getElementById('main-content'));
      } catch (e) { toast(e.message, 'error'); }
    }
  );
  setTimeout(() => document.getElementById('ar-valor-parcial')?.select(), 80);
}

async function arPausar(id) {
  try {
    await api('PUT', `/ordens/${id}/pausar-cobranca`);
    toast('Cobrança pausada para hoje');
    await renderAReceber(document.getElementById('main-content'));
  } catch (e) { toast(e.message, 'error'); }
}

async function arRetomar(id) {
  try {
    await api('PUT', `/ordens/${id}/retomar-cobranca`);
    toast('Cobrança retomada');
    await renderAReceber(document.getElementById('main-content'));
  } catch (e) { toast(e.message, 'error'); }
}

async function arPagarCliente(clienteId, nome, totalRestante) {
  arAbrirModal(
    `Pagamento — ${nome}`,
    `Total em aberto: ${arFmtVal(totalRestante)}`,
    `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px;margin-bottom:14px;font-size:12px;color:#92400e">
       Abate primeiro da OS com maior atraso. Se cobrir totalmente, marca como paga e passa para a próxima.
     </div>
     <div style="display:flex;flex-direction:column;gap:12px">
       <div>
         <label style="font-size:13px;display:block;margin-bottom:4px">Valor recebido (R$) *</label>
         <input type="number" id="ar-valor-cliente" min="0.01" step="0.01" value="${totalRestante}" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;font-weight:700">
       </div>
       <div>
         <label style="font-size:13px;display:block;margin-bottom:4px">Forma de pagamento</label>
         <select id="ar-pgto-cliente" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:8px">${pgOpts()}</select>
       </div>
     </div>`,
    async () => {
      const valor = parseFloat(document.getElementById('ar-valor-cliente').value);
      if (!valor || valor <= 0) { toast('Informe um valor válido', 'warning'); return; }
      try {
        const r = await api('POST', '/ordens/pagamento-cliente', {
          cliente_id: clienteId,
          valor,
          forma_pagamento: document.getElementById('ar-pgto-cliente').value
        });
        arFecharModal();
        const msgs = r.aplicados.map(a => `${a.numero}: ${arFmtVal(a.valor_aplicado)}${a.quitado?' ✔':''}`).join(', ');
        toast(`Pago: ${msgs}`);
        await renderAReceber(document.getElementById('main-content'));
      } catch (e) { toast(e.message, 'error'); }
    }
  );
  setTimeout(() => document.getElementById('ar-valor-cliente')?.select(), 80);
}
