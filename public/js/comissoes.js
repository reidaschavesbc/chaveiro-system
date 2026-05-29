const MESES_NOMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

async function comissoes(el) {
  const hoje = new Date();
  const mesAtual = hoje.getMonth() + 1;
  const anoAtual = hoje.getFullYear();

  el.innerHTML = `
  <div style="max-width:860px;margin:0 auto">
    <div class="card" style="margin-bottom:24px">
      <div class="card-header">
        <span class="card-title">Parcial do Mês Atual</span>
      </div>
      <div class="card-body">
        <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:16px">
          <div class="form-group" style="margin:0">
            <label>Mês</label>
            <select id="parcial-mes" style="min-width:140px" onchange="atualizarParcial()">
              ${MESES_NOMES.map((m,i) => `<option value="${i+1}" ${i+1===mesAtual ? 'selected':''}>${m}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="margin:0">
            <label>Ano</label>
            <input type="number" id="parcial-ano" value="${anoAtual}" style="width:100px" onchange="atualizarParcial()">
          </div>
          <button class="btn btn-secondary" onclick="atualizarParcial()">Atualizar</button>
        </div>
        <div id="parcial-resultado"></div>
      </div>
    </div>

    <div class="card" style="margin-bottom:24px">
      <div class="card-header">
        <span class="card-title">Fechamento Manual de Comissões</span>
      </div>
      <div class="card-body">
        <p style="color:#64748b;font-size:13px;margin-bottom:16px">
          O fechamento automático ocorre todo dia 1º às 00:05, referente ao mês anterior.
          Use abaixo para fechar manualmente um mês específico.
        </p>
        <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap">
          <div class="form-group" style="margin:0">
            <label>Mês</label>
            <select id="com-mes" style="min-width:140px">
              ${MESES_NOMES.map((m,i) => `<option value="${i+1}" ${i+1===new Date().getMonth() ? 'selected':''}>${m}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="margin:0">
            <label>Ano</label>
            <input type="number" id="com-ano" value="${new Date().getFullYear()}" style="width:100px">
          </div>
          <button class="btn btn-primary" onclick="fecharComissao()">Fechar Mês</button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">Histórico de Fechamentos</span>
      </div>
      <div class="card-body">
        <div id="lista-fechamentos"></div>
      </div>
    </div>

    <div id="detalhe-comissao" style="display:none;margin-top:24px"></div>
  </div>`;

  await Promise.all([carregarFechamentos(), atualizarParcial()]);
}

async function atualizarParcial() {
  const mes = parseInt(document.getElementById('parcial-mes').value);
  const ano = parseInt(document.getElementById('parcial-ano').value);
  const el = document.getElementById('parcial-resultado');
  if (!el) return;
  el.innerHTML = '<p style="color:#64748b;font-size:13px">Carregando...</p>';

  try {
    const data = await api('GET', `/comissoes/parcial?mes=${mes}&ano=${ano}`);
    const fmtVal = v => 'R$ ' + parseFloat(v||0).toFixed(2).replace('.',',');

    if (data.ja_fechado) {
      el.innerHTML = `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;font-size:13px;color:#166534">
        ✔ Este mês já foi fechado. Veja o detalhe no histórico abaixo.
      </div>`;
      return;
    }

    if (!data.vendedores.length) {
      el.innerHTML = `<p style="color:#94a3b8;font-size:13px">Nenhuma OS concluída no período com chaveiro atribuído.</p>`;
      return;
    }

    const vendedoresHtml = data.vendedores.map(v => `
      <div style="margin-bottom:12px;padding:14px 16px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;gap:12px">
          <div>
            <strong style="font-size:14px">${v.vendedor_nome}</strong>
            <span style="margin-left:8px;font-size:11px;color:#64748b;background:#e2e8f0;padding:2px 7px;border-radius:20px">${v.percentual}%</span>
            ${v.meta_atingida ? `<span style="margin-left:6px;font-size:11px;background:#d1fae5;color:#065f46;padding:2px 7px;border-radius:20px">Meta atingida</span>` : v.meta > 0 ? `<span style="margin-left:6px;font-size:11px;background:#fef3c7;color:#92400e;padding:2px 7px;border-radius:20px">Meta: ${fmtVal(v.meta)}</span>` : ''}
            <div style="font-size:11px;color:#94a3b8;margin-top:3px">${v.ordens.length} OS concluídas • Faturado: ${fmtVal(v.total_os)}</div>
          </div>
          <div style="text-align:right;min-width:180px;line-height:1.7">
            ${v.salario_base > 0 ? `<div style="font-size:12px;color:#475569">Salário: <strong>${fmtVal(v.salario_base)}</strong></div>` : ''}
            ${v.total_comissao > 0 ? `<div style="font-size:12px;color:#16a34a">+ Comissão: <strong>${fmtVal(v.total_comissao)}</strong></div>` : ''}
            ${v.bonus_aplicado > 0 ? `<div style="font-size:12px;color:#0369a1">+ Bônus meta: <strong>${fmtVal(v.bonus_aplicado)}</strong></div>` : ''}
            ${v.total_vales > 0 ? `<div style="font-size:12px;color:#dc2626">➖ Vales: <strong>${fmtVal(v.total_vales)}</strong></div>` : ''}
            <div style="font-size:15px;font-weight:700;color:#1a56db;border-top:1px solid #e2e8f0;padding-top:4px;margin-top:2px">= ${fmtVal(v.total_a_pagar)}</div>
          </div>
        </div>
        ${v.ordens.length ? `<table style="font-size:12px">
          <thead><tr><th>OS</th><th>Conclusão</th><th>Valor OS</th><th>Comissão</th></tr></thead>
          <tbody>${v.ordens.map(o => `
            <tr>
              <td><strong>${o.numero}</strong></td>
              <td>${formatarData(o.data_conclusao)}</td>
              <td>${fmtVal(o.valor)}</td>
              <td style="color:#16a34a;font-weight:600">${fmtVal(o.valor_comissao)}</td>
            </tr>`).join('')}
          </tbody>
        </table>` : ''}
      </div>`).join('');

    el.innerHTML = `
      ${vendedoresHtml}
      <div style="padding:12px 14px;border-top:2px solid #e2e8f0;display:flex;flex-direction:column;gap:3px;align-items:flex-end;background:#f8fafc;border-radius:0 0 8px 8px">
        ${data.total_salarios > 0 ? `<span style="font-size:12px;color:#475569">Total salários: ${fmtVal(data.total_salarios)}</span>` : ''}
        ${data.total_geral > 0 ? `<span style="font-size:12px;color:#16a34a">Total comissões: ${fmtVal(data.total_geral)}</span>` : ''}
        ${data.total_bonus > 0 ? `<span style="font-size:12px;color:#0369a1">Total bônus: ${fmtVal(data.total_bonus)}</span>` : ''}
        ${data.total_vales > 0 ? `<span style="font-size:12px;color:#dc2626">➖ Total vales: ${fmtVal(data.total_vales)}</span>` : ''}
        <span style="font-size:16px;font-weight:700;color:#1a56db">Total a pagar: ${fmtVal(data.total_a_pagar)}</span>
      </div>`;
  } catch (e) {
    el.innerHTML = `<p style="color:#ef4444;font-size:13px">${e.message}</p>`;
  }
}

async function carregarFechamentos() {
  const list = await api('GET', '/comissoes');
  const el = document.getElementById('lista-fechamentos');
  if (!list.length) {
    el.innerHTML = '<p class="text-center text-muted">Nenhum fechamento realizado ainda.</p>';
    return;
  }
  const fmtVal = v => 'R$ ' + parseFloat(v||0).toFixed(2).replace('.',',');
  el.innerHTML = `<table>
    <thead>
      <tr>
        <th>Período</th>
        <th>Comissões</th>
        <th>Total a Pagar</th>
        <th>WhatsApp</th>
        <th>Fechado em</th>
        <th style="min-width:240px">Ações</th>
      </tr>
    </thead>
    <tbody>
      ${list.map(f => `
        <tr>
          <td><strong>${MESES_NOMES[f.mes-1]}/${f.ano}</strong></td>
          <td style="color:#16a34a;font-weight:600">${fmtVal(f.total_geral)}</td>
          <td style="color:#1a56db;font-weight:700">${fmtVal(f.total_a_pagar || f.total_geral)}</td>
          <td>${f.enviado_whatsapp
            ? '<span style="color:#16a34a;font-size:12px">✔ Enviado</span>'
            : '<span style="color:#94a3b8;font-size:12px">Não enviado</span>'}</td>
          <td style="font-size:12px;color:#64748b">${formatarDataHora(f.data_fechamento)}</td>
          <td>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:nowrap">
              <button class="btn btn-sm btn-secondary" onclick="verDetalheFechamento(${f.id},'${MESES_NOMES[f.mes-1]}','${f.ano}')">Ver Detalhe</button>
              <button class="btn btn-sm btn-secondary" title="Reenviar WhatsApp" onclick="reenviarWhatsapp(${f.id},'${MESES_NOMES[f.mes-1]}','${f.ano}')">📱 Reenviar</button>
              <button class="btn btn-sm" style="background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5" onclick="excluirFechamento(${f.id},'${MESES_NOMES[f.mes-1]}','${f.ano}')">Excluir</button>
            </div>
          </td>
        </tr>`).join('')}
    </tbody>
  </table>`;
}

async function fecharComissao() {
  const mes = parseInt(document.getElementById('com-mes').value);
  const ano = parseInt(document.getElementById('com-ano').value);
  if (!ano || ano < 2000) return toast('Ano inválido', 'warning');
  if (!await modalConfirmar({ titulo: 'Fechar Mês', mensagem: `Confirma o fechamento de comissões de <strong>${MESES_NOMES[mes-1]}/${ano}</strong>?<br><small style="color:#6b7280">Esta ação não pode ser desfeita.</small>`, icone: '📅', corBotao: '#dc2626', textoBotao: 'Fechar Mês' })) return;
  try {
    const r = await api('POST', '/comissoes/fechar', { mes, ano });
    toast(`Fechamento realizado! ${r.qtd_os} OS processadas.`);
    if (r.whatsapp_enviado) toast('Resumo enviado via WhatsApp!');
    await carregarFechamentos();
    await verDetalheFechamento(r.fechamento_id, MESES_NOMES[mes-1], ano);
  } catch (e) { toast(e.message, 'error'); }
}

async function verDetalheFechamento(id, mesNome, ano) {
  const el = document.getElementById('detalhe-comissao');
  el.style.display = 'block';
  el.innerHTML = '<div class="empty-state"><p>Carregando...</p></div>';
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const data = await api('GET', `/comissoes/${id}`);
  const fmtVal = v => 'R$ ' + parseFloat(v||0).toFixed(2).replace('.',',');

  if (!data.vendedores.length) {
    el.innerHTML = `
      <div class="card">
        <div class="card-header">
          <span class="card-title">Detalhe — ${mesNome}/${ano}</span>
          <button class="btn btn-sm btn-secondary" onclick="document.getElementById('detalhe-comissao').style.display='none'">Fechar</button>
        </div>
        <div class="card-body"><p class="text-center text-muted">Nenhuma OS no período.</p></div>
      </div>`;
    return;
  }

  const vendedoresHtml = data.vendedores.map(v => `
    <div style="margin-bottom:14px;padding:14px 16px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;gap:12px">
        <div>
          <strong style="font-size:14px">${v.vendedor_nome}</strong>
          <span style="margin-left:8px;font-size:11px;color:#64748b;background:#e2e8f0;padding:2px 7px;border-radius:20px">${v.percentual}%</span>
          <div style="font-size:11px;color:#94a3b8;margin-top:3px">${v.ordens.length} OS • Faturado: ${fmtVal(v.total_os)}</div>
        </div>
        <div style="text-align:right;min-width:180px;line-height:1.7">
          ${v.salario_base > 0 ? `<div style="font-size:12px;color:#475569">Salário: <strong>${fmtVal(v.salario_base)}</strong></div>` : ''}
          ${v.total_comissao > 0 ? `<div style="font-size:12px;color:#16a34a">+ Comissão: <strong>${fmtVal(v.total_comissao)}</strong></div>` : ''}
          ${v.bonus_aplicado > 0 ? `<div style="font-size:12px;color:#0369a1">+ Bônus meta: <strong>${fmtVal(v.bonus_aplicado)}</strong></div>` : ''}
          ${v.total_vales > 0 ? `<div style="font-size:12px;color:#dc2626">➖ Vales: <strong>${fmtVal(v.total_vales)}</strong></div>` : ''}
          <div style="font-size:15px;font-weight:700;color:#1a56db;border-top:1px solid #e2e8f0;padding-top:4px;margin-top:2px">= ${fmtVal(v.total_a_pagar)}</div>
        </div>
      </div>
      ${v.ordens.length ? `<table style="font-size:12px">
        <thead><tr><th>OS</th><th>Data Conclusão</th><th>Valor OS</th><th>Comissão</th></tr></thead>
        <tbody>${v.ordens.map(o => `
          <tr>
            <td><strong>${o.ordem_numero}</strong></td>
            <td>${formatarData(o.data_conclusao)}</td>
            <td>${fmtVal(o.valor_os)}</td>
            <td style="color:#16a34a;font-weight:600">${fmtVal(o.valor_comissao)}</td>
          </tr>`).join('')}
        </tbody>
      </table>` : ''}
    </div>`).join('');

  el.innerHTML = `
    <div class="card">
      <div class="card-header">
        <span class="card-title">Detalhe — ${mesNome}/${ano}</span>
        <button class="btn btn-sm btn-secondary" onclick="document.getElementById('detalhe-comissao').style.display='none'">Fechar</button>
      </div>
      <div class="card-body">
        ${vendedoresHtml}
        <div style="padding:12px 14px;border-top:2px solid #e2e8f0;display:flex;flex-direction:column;gap:3px;align-items:flex-end;background:#f8fafc;border-radius:0 0 8px 8px">
          ${data.total_salarios > 0 ? `<span style="font-size:12px;color:#475569">Total salários: ${fmtVal(data.total_salarios)}</span>` : ''}
          ${data.total_geral > 0 ? `<span style="font-size:12px;color:#16a34a">Total comissões: ${fmtVal(data.total_geral)}</span>` : ''}
          ${data.total_bonus > 0 ? `<span style="font-size:12px;color:#0369a1">Total bônus: ${fmtVal(data.total_bonus)}</span>` : ''}
          ${data.total_vales > 0 ? `<span style="font-size:12px;color:#dc2626">➖ Total vales: ${fmtVal(data.total_vales)}</span>` : ''}
          <span style="font-size:16px;font-weight:700;color:#1a56db">Total a pagar: ${fmtVal(data.total_a_pagar)}</span>
        </div>
      </div>
    </div>`;
}

async function excluirFechamento(id, mesNome, ano) {
  if (!await pedirSenhaGerente()) return;
  if (!await modalConfirmar({ titulo: 'Excluir Fechamento', mensagem: `Deseja excluir o fechamento de <strong>${mesNome}/${ano}</strong> do histórico?<br><small style="color:#6b7280">Os vales deste período serão liberados.</small>`, icone: '🗑️', corBotao: '#dc2626', textoBotao: 'Excluir' })) return;
  try {
    await api('DELETE', `/comissoes/${id}`);
    toast('Fechamento excluído do histórico.');
    document.getElementById('detalhe-comissao').style.display = 'none';
    await carregarFechamentos();
  } catch (e) { toast(e.message, 'error'); }
}

async function reenviarWhatsapp(id, mesNome, ano) {
  if (!await modalConfirmar({ titulo: 'Reenviar Resumo', mensagem: `Reenviar resumo de comissões de <strong>${mesNome}/${ano}</strong> via WhatsApp?`, icone: '📱', textoBotao: 'Reenviar' })) return;
  try {
    const data = await api('GET', `/comissoes/${id}`);
    // Monta o resumo localmente para pré-visualização, mas chama o fechamento manual que já envia
    toast('Reenvio não disponível por esta tela. Use o fechamento manual ou contate o suporte.', 'warning');
  } catch (e) { toast(e.message, 'error'); }
}

function formatarData(dt) {
  if (!dt) return '';
  const s = String(dt).slice(0,10);
  const [y,m,d] = s.split('-');
  return `${d}/${m}/${y}`;
}

function formatarDataHora(dt) {
  if (!dt) return '';
  const s = String(dt).slice(0,16);
  const [date, time] = s.split(' ');
  const [y,m,d] = date.split('-');
  return `${d}/${m}/${y} ${time||''}`;
}
