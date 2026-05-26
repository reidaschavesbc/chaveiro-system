async function consulta(el) {
  el.innerHTML = `
    <div class="card">
      <div class="card-header">
        <span class="card-title">🔍 Consulta de Preços</span>
      </div>
      <div style="padding:16px 20px 0">
        <div class="search-box" style="max-width:480px">
          <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          <input type="text" id="consulta-busca" placeholder="Buscar produto ou serviço..." oninput="consultaFiltrar()" autofocus>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px;margin-bottom:4px">
          <button id="consulta-tab-todos"  onclick="consultaAba('todos')"   class="btn btn-primary"  style="font-size:13px;padding:6px 16px">Todos</button>
          <button id="consulta-tab-prod"   onclick="consultaAba('prod')"    class="btn btn-secondary" style="font-size:13px;padding:6px 16px">Produtos</button>
          <button id="consulta-tab-serv"   onclick="consultaAba('serv')"    class="btn btn-secondary" style="font-size:13px;padding:6px 16px">Serviços</button>
        </div>
      </div>
      <div id="consulta-result" style="padding:16px 20px"></div>
    </div>`;

  window._consultaProdutos = [];
  window._consultaServicos = [];
  window._consultaAba = 'todos';

  try {
    const [prods, servs] = await Promise.all([api('GET', '/produtos'), api('GET', '/servicos')]);
    window._consultaProdutos = prods;
    window._consultaServicos = servs;
    consultaRenderizar();
  } catch {
    document.getElementById('consulta-result').innerHTML = '<p style="color:#ef4444">Erro ao carregar dados.</p>';
  }
}

function consultaAba(aba) {
  window._consultaAba = aba;
  ['todos','prod','serv'].forEach(k => {
    const btn = document.getElementById(`consulta-tab-${k}`);
    if (!btn) return;
    btn.className = k === aba ? 'btn btn-primary' : 'btn btn-secondary';
    btn.style.cssText = 'font-size:13px;padding:6px 16px';
  });
  consultaRenderizar();
}

function consultaFiltrar() {
  consultaRenderizar();
}

function consultaRenderizar() {
  const el = document.getElementById('consulta-result');
  if (!el) return;
  const q = (document.getElementById('consulta-busca')?.value || '').toLowerCase().trim();
  const aba = window._consultaAba || 'todos';
  const fmtV = v => 'R$ ' + parseFloat(v||0).toFixed(2).replace('.',',');

  const prods = (window._consultaProdutos || []).filter(p =>
    !q || p.nome.toLowerCase().includes(q)
  );
  const servs = (window._consultaServicos || []).filter(s =>
    !q || s.nome.toLowerCase().includes(q)
  );

  const listaProd = (prods) => prods.map((p, i) => {
    const estoqueColor = p.estoque <= 0 ? '#ef4444' : p.estoque <= (p.estoque_minimo||2) ? '#f59e0b' : '#10b981';
    const estoqueLabel = p.estoque <= 0 ? 'sem estoque' : `${p.estoque} ${p.unidade||'un'}`;
    return `
    <div onmouseover="this.style.background='#f8faff'" onmouseout="this.style.background='#fff'"
         style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;${i>0?'border-top:1px solid #f1f5f9':''};background:#fff;gap:12px;transition:background .15s;cursor:default">
      <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0">
        ${p.imagem ? `<span onclick="consultaVerImagem('${p.imagem}','${p.nome.replace(/'/g,"\\'")}');" style="font-size:16px;cursor:pointer;flex-shrink:0" title="Ver imagem">📷</span>` : ''}
        <div style="min-width:0">
          <div style="font-weight:600;color:#1e293b;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.nome}</div>
          ${p.descricao ? `<div style="font-size:11px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.descricao}</div>` : ''}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:16px;flex-shrink:0">
        <span style="font-size:11px;color:${estoqueColor};font-weight:600;white-space:nowrap">${estoqueLabel}</span>
        <span style="font-size:15px;font-weight:700;color:#2563eb;white-space:nowrap">${fmtV(p.preco_venda)}</span>
      </div>
    </div>`;
  }).join('');

  const listaServ = (servs) => servs.map((s, i) => `
    <div onmouseover="this.style.background='#f8faff'" onmouseout="this.style.background='#fff'"
         style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;${i>0?'border-top:1px solid #f1f5f9':''};background:#fff;gap:12px;transition:background .15s;cursor:default">
      <div style="min-width:0;flex:1">
        <div style="font-weight:600;color:#1e293b;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.nome}</div>
        ${s.descricao ? `<div style="font-size:11px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.descricao}</div>` : ''}
      </div>
      <span style="font-size:15px;font-weight:700;color:#7c3aed;white-space:nowrap;flex-shrink:0">${fmtV(s.preco_base)}</span>
    </div>`).join('');

  let html = '';

  const isMobile = window.innerWidth <= 768;

  if (aba === 'todos' && prods.length && servs.length && !isMobile) {
    html = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start">
        <div>
          <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">📦 Produtos (${prods.length})</div>
          <div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">${listaProd(prods)}</div>
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">🔧 Serviços (${servs.length})</div>
          <div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">${listaServ(servs)}</div>
        </div>
      </div>`;
  } else {
    if ((aba === 'todos' || aba === 'prod') && prods.length) {
      html += `
        <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">📦 Produtos (${prods.length})</div>
        <div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:20px;max-width:640px;margin-left:auto;margin-right:auto">${listaProd(prods)}</div>`;
    }
    if ((aba === 'todos' || aba === 'serv') && servs.length) {
      html += `
        <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">🔧 Serviços (${servs.length})</div>
        <div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;max-width:640px;margin-left:auto;margin-right:auto">${listaServ(servs)}</div>`;
    }
  }

  if (!html) {
    html = `<div style="text-align:center;padding:40px;color:#94a3b8;font-size:14px">
      ${q ? `Nenhum resultado para "<strong>${q}</strong>"` : 'Nenhum item cadastrado'}
    </div>`;
  }

  el.innerHTML = html;
}

function consultaVerImagem(src, nome) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer';
  overlay.onclick = () => document.body.removeChild(overlay);
  overlay.innerHTML = `
    <div style="font-size:14px;color:#e2e8f0;margin-bottom:12px;font-weight:600">${nome}</div>
    <img src="${src}" style="max-width:90vw;max-height:80vh;border-radius:12px;object-fit:contain;box-shadow:0 20px 60px rgba(0,0,0,.5)">
    <div style="font-size:12px;color:#94a3b8;margin-top:12px">Toque para fechar</div>`;
  document.body.appendChild(overlay);
}
