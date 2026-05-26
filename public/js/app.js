// === APP ROUTER ===
const pages = { dashboard, clientes, produtos, servicos, vendedores, ordens, 'vendas-nova': vendasNova, vendas: vendasHistorico, orcamentos, configuracoes, whatsapp: whatsappPage, assistente: assistentePage, 'a-receber': aReceberPage, gastos, lembretes, pedidos, consumo, estoque: estoquePage, nfse: nfsePage, consulta, afiacao };

let _navTimeout = null;
function navigateTo(page) {
    // Debounce: ignora cliques rápidos repetidos na mesma aba
    if (_navTimeout) clearTimeout(_navTimeout);
    _navTimeout = setTimeout(() => { _navTimeout = null; }, 300);

    if (window.innerWidth <= 768) closeSidebar();
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.toggle('active', el.dataset.page === page);
    });
    const titles = {
        dashboard: 'Dashboard', clientes: 'Clientes', produtos: 'Produtos',
        servicos: 'Tipos de Serviço', vendedores: 'Funcionários', ordens: 'Ordens de Serviço',
        'vendas-nova': 'Vendas', vendas: 'Histórico',
        orcamentos: 'Orçamentos', relatorios: 'Relatórios', configuracoes: 'Configurações', whatsapp: 'WhatsApp',
        assistente: 'Assistente IA', 'a-receber': 'Cobranças', gastos: 'Controle de Gastos', lembretes: 'Lembretes', pedidos: 'Pedidos de Compra', consumo: 'Uso da Equipe', estoque: 'Meu Estoque', nfse: 'NFS-e Emitidas', consulta: 'Consulta Rápida', afiacao: '✂️ Afiação'
    };
    document.getElementById('page-title').textContent = titles[page] || page;
    const fn = pages[page];
    const content = document.getElementById('main-content');
    content.innerHTML = '<div class="empty-state"><p>Carregando...</p></div>';
    if (fn) fn(content);
}

// ─── Modal de Senha do Gerente (compartilhado) ────────────────────────────────
function modalSenhaGerente(titulo, descricao) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:9999';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:28px 32px;max-width:360px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,.3)">
        <div style="font-size:20px;font-weight:700;margin-bottom:6px">🔒 ${titulo || 'Acesso Restrito'}</div>
        <div style="color:#64748b;font-size:13px;margin-bottom:22px">${descricao || 'Esta ação requer senha de gerente.'}</div>
        <input type="password" id="_mg-input" autocomplete="off"
               style="width:100%;border:1.5px solid #e2e8f0;border-radius:9px;padding:10px 13px;font-size:14px;outline:none;box-sizing:border-box">
        <div id="_mg-erro" style="color:#ef4444;font-size:12px;margin-top:7px;min-height:16px"></div>
        <div style="display:flex;gap:10px;margin-top:18px">
          <button id="_mg-cancel" style="flex:1;padding:10px;border:1.5px solid #e2e8f0;border-radius:9px;background:#f8fafc;cursor:pointer;font-size:13px">Cancelar</button>
          <button id="_mg-ok" style="flex:1;padding:10px;border:none;border-radius:9px;background:#2563eb;color:#fff;cursor:pointer;font-size:13px;font-weight:600">Confirmar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const inp = overlay.querySelector('#_mg-input');
    const err = overlay.querySelector('#_mg-erro');
    inp.focus();

    const close = r => { overlay.remove(); resolve(r); };

    overlay.querySelector('#_mg-cancel').onclick = () => close(false);

    const verificar = async () => {
      const senha = inp.value.trim();
      if (!senha) { err.textContent = 'Digite a senha'; return; }
      try {
        const r = await api('POST', '/auth/verificar-gerente', { senha });
        if (r.ok) close(true);
        else { err.textContent = 'Senha incorreta'; inp.value = ''; inp.focus(); }
      } catch { err.textContent = 'Erro ao verificar senha'; }
    };

    overlay.querySelector('#_mg-ok').onclick = verificar;
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') verificar(); });
  });
}

// ─── Sidebar mobile toggle ─────────────────────────────────────────────────────
function openSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebar-overlay').classList.add('open');
}
function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('open');
}

// Check auth on load
document.addEventListener('DOMContentLoaded', () => {
    if (!getToken()) { window.location.href = '/'; return; }
    // Load empresa name
    api('GET', '/config').then(cfg => {
        if (cfg && cfg.empresa_nome) {
            document.getElementById('sidebar-empresa').textContent = cfg.empresa_nome;
            document.title = cfg.empresa_nome + ' - Sistema';
        }
    }).catch(() => { });

    // Hamburger e overlay
    document.getElementById('sidebar-toggle').addEventListener('click', openSidebar);
    document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);

    // Auto-wrap tabelas para scroll horizontal em mobile
    const mainContent = document.getElementById('main-content');
    new MutationObserver(mutations => {
        mutations.forEach(m => {
            m.addedNodes.forEach(node => {
                if (node.nodeType !== 1) return;
                node.querySelectorAll('table').forEach(table => {
                    if (table.closest('.table-scroll')) return;
                    const wrapper = document.createElement('div');
                    wrapper.className = 'table-scroll';
                    table.parentNode.insertBefore(wrapper, table);
                    wrapper.appendChild(table);
                });
            });
        });
    }).observe(mainContent, { childList: true, subtree: true });

    navigateTo('dashboard');
    // Badge de pedidos pendentes — atualiza ao carregar e a cada 5 minutos
    atualizarBadgePedidos();
    setInterval(atualizarBadgePedidos, 5 * 60 * 1000);
    // Badge de pedidos de estoque pendentes (para principal)
    atualizarBadgeEstoque();
    setInterval(atualizarBadgeEstoque, 5 * 60 * 1000);
});
