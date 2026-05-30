let _afiacaoFichas = [];
let _afiacaoAba = 'fila';

const AFIACAO_STATUS = {
  aguardando: { label: 'Aguardando', cor: '#f59e0b', bg: '#fef3c7', prox: 'afiando' },
  afiando:    { label: 'Afiando',    cor: '#3b82f6', bg: '#dbeafe', prox: 'pronto' },
  pronto:     { label: 'Pronto',     cor: '#10b981', bg: '#d1fae5', prox: 'entregue' },
  entregue:   { label: 'Entregue',   cor: '#6366f1', bg: '#e0e7ff', prox: null },
};

async function afiacao(el) {
  el.innerHTML = `
  <div style="margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
    <div>
      <h2 style="font-size:20px;font-weight:700;color:#f1f5f9;margin:0">✂️ Afiação</h2>
      <p style="color:#64748b;font-size:13px;margin:4px 0 0">Fila de fichas de afiação</p>
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <div style="display:flex;background:#1e293b;border:1px solid #334155;border-radius:10px;overflow:hidden">
        <button id="af-tab-fila" onclick="afiacaoAba('fila')"
          style="padding:8px 18px;border:none;cursor:pointer;font-size:13px;font-weight:600;transition:all .2s;background:#6366f1;color:white">
          Fila
        </button>
        <button id="af-tab-pagamentos" onclick="afiacaoAba('pagamentos')"
          style="padding:8px 18px;border:none;cursor:pointer;font-size:13px;font-weight:600;transition:all .2s;background:transparent;color:#94a3b8">
          💰 Pagamentos
        </button>
        <button id="af-tab-config" onclick="afiacaoAba('config')"
          style="padding:8px 18px;border:none;cursor:pointer;font-size:13px;font-weight:600;transition:all .2s;background:transparent;color:#94a3b8">
          ⚙️ Config
        </button>
      </div>
      <button id="af-btn-nova" class="btn btn-primary" onclick="afiacaoAbrirModal()">
        <svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
        Nova Ficha
      </button>
    </div>
  </div>

  <div id="af-conteudo"></div>

  <div class="modal-overlay" id="modal-afiacao" onclick="if(event.target===this)closeModal('modal-afiacao')">
    <div class="modal" style="max-width:440px;width:100%">
      <div class="modal-header">
        <span class="modal-title">Nova Ficha de Afiação</span>
        <button class="modal-close" onclick="closeModal('modal-afiacao')">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-grid">
          <div class="form-group">
            <label>Quantidade <span style="color:#ef4444">*</span></label>
            <input type="number" id="af-qtd" min="1" value="1" style="width:100%">
          </div>
          <div class="form-group">
            <label>Valor cobrado (R$)</label>
            <input type="number" id="af-valor" min="0" step="0.01" value="0" style="width:100%">
          </div>
          <div class="form-group form-full">
            <label>Cliente (opcional)</label>
            <input type="text" id="af-cliente" placeholder="Nome do cliente" style="width:100%">
          </div>
          <div class="form-group form-full">
            <label>Telefone do cliente <span style="color:#64748b;font-size:12px;font-weight:400">(aviso no WhatsApp ao entregar)</span></label>
            <input type="text" id="af-telefone" placeholder="(00) 00000-0000" oninput="mascaraTelefone(this)" style="width:100%">
          </div>
          <div class="form-group form-full">
            <label>Observação</label>
            <textarea id="af-obs" rows="3" placeholder="Ex: 3 facas, 2 tesouras..." style="width:100%;resize:vertical"></textarea>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('modal-afiacao')">Cancelar</button>
        <button class="btn btn-primary" onclick="afiacaoSalvar()">Registrar</button>
      </div>
    </div>
  </div>`;

  _afiacaoAba = 'fila';
  await afiacaoCarregar();
}

function afiacaoAba(aba) {
  _afiacaoAba = aba;
  const btnFila      = document.getElementById('af-tab-fila');
  const btnPagamentos= document.getElementById('af-tab-pagamentos');
  const btnConfig    = document.getElementById('af-tab-config');
  const btnNova      = document.getElementById('af-btn-nova');

  btnFila.style.background       = 'transparent'; btnFila.style.color       = '#94a3b8';
  btnPagamentos.style.background = 'transparent'; btnPagamentos.style.color = '#94a3b8';
  btnConfig.style.background     = 'transparent'; btnConfig.style.color     = '#94a3b8';

  if (aba === 'fila') {
    btnFila.style.background = '#6366f1'; btnFila.style.color = 'white';
    btnNova.style.display = 'flex';
    afiacaoRenderKanban();
  } else if (aba === 'pagamentos') {
    btnPagamentos.style.background = '#6366f1'; btnPagamentos.style.color = 'white';
    btnNova.style.display = 'none';
    afiacaoRenderPagamentos();
  } else {
    btnConfig.style.background = '#6366f1'; btnConfig.style.color = 'white';
    btnNova.style.display = 'none';
    afiacaoRenderConfig();
  }
}

async function afiacaoCarregar() {
  _afiacaoFichas = await api('GET', '/afiacao');
  if (_afiacaoAba === 'fila') afiacaoRenderKanban();
  else afiacaoRenderConfig();
}

// ─── ABA FILA ────────────────────────────────────────────────────────────────

function afiacaoRenderKanban() {
  const container = document.getElementById('af-conteudo');
  if (!container) return;

  container.innerHTML = `<div id="afiacao-kanban" style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;align-items:start"></div>`;

  const kanban = document.getElementById('afiacao-kanban');
  kanban.innerHTML = Object.entries(AFIACAO_STATUS).map(([status, cfg]) => {
    const fichas = _afiacaoFichas.filter(f => f.status === status);
    const cards = fichas.length === 0
      ? `<p style="color:#475569;font-size:12px;text-align:center;padding:20px 0">Nenhuma ficha</p>`
      : fichas.map(f => afiacaoCard(f, cfg)).join('');

    return `
    <div style="background:#1e293b;border-radius:14px;padding:14px;border:1px solid #334155">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <span style="font-size:13px;font-weight:700;color:${cfg.cor};text-transform:uppercase;letter-spacing:.5px">${cfg.label}</span>
        <span style="background:${cfg.bg};color:${cfg.cor};font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px">${fichas.length}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px">${cards}</div>
    </div>`;
  }).join('');
}

function afiacaoCard(f, cfg) {
  const dt = new Date(f.criado_em).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
  const cliente = f.cliente_nome ? `<p style="font-size:12px;color:#94a3b8;margin:3px 0">👤 ${f.cliente_nome}</p>` : '';
  const tel = f.cliente_telefone ? `<p style="font-size:12px;color:#94a3b8;margin:3px 0">📞 ${aplicarMascaraTelefone(f.cliente_telefone)}</p>` : '';
  const obs = f.observacao ? `<p style="font-size:12px;color:#64748b;margin:3px 0;font-style:italic">${f.observacao}</p>` : '';
  const proxStatus = cfg.prox;
  const proxLabel = proxStatus ? AFIACAO_STATUS[proxStatus].label : null;

  const btnProx = proxLabel
    ? `<button onclick="afiacaoAvancar(${f.id},'${proxStatus}')" style="flex:1;padding:6px 10px;background:#6366f1;color:white;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">→ ${proxLabel}</button>`
    : '';

  return `
  <div style="background:#0f172a;border-radius:10px;padding:12px;border:1px solid #334155">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
      <span style="font-size:16px;font-weight:800;color:#f1f5f9">#${f.numero}</span>
      <span style="font-size:11px;color:#64748b">${dt}</span>
    </div>
    <p style="font-size:13px;font-weight:600;color:#e2e8f0;margin:0">Qtd: ${f.quantidade} | R$ ${Number(f.valor).toFixed(2).replace('.', ',')}</p>
    ${cliente}${tel}${obs}
    <div style="display:flex;gap:6px;margin-top:10px">
      ${btnProx}
      <button onclick="afiacaoEditar(${f.id})" title="Editar ficha" style="padding:6px 10px;background:#0f172a;color:#94a3b8;border:1px solid #334155;border-radius:8px;font-size:12px;cursor:pointer">✏️</button>
      <button onclick="afiacaoRecibo(${f.id})" title="Imprimir recibo" style="padding:6px 10px;background:#0f172a;color:#94a3b8;border:1px solid #334155;border-radius:8px;font-size:12px;cursor:pointer">🖨️</button>
      <button onclick="afiacaoExcluir(${f.id})" title="Excluir" style="padding:6px 10px;background:#0f172a;color:#ef4444;border:1px solid #334155;border-radius:8px;font-size:12px;cursor:pointer">🗑️</button>
    </div>
  </div>`;
}

// ─── ABA CONFIG ──────────────────────────────────────────────────────────────

async function afiacaoRenderConfig() {
  const container = document.getElementById('af-conteudo');
  if (!container) return;
  container.innerHTML = `<p style="color:#64748b;font-size:13px">Carregando...</p>`;

  const [cfg, usuarioAfiador] = await Promise.all([
    api('GET', '/config'),
    api('GET', '/afiacao/usuario-afiador'),
  ]);

  const entregues = _afiacaoFichas.filter(f => f.status === 'entregue');
  const totalCobrado  = entregues.reduce((s, f) => s + Number(f.valor), 0);
  const valorAfiador  = parseFloat(cfg.valor_afiador) || 0;
  const totalAfiador  = entregues.length * valorAfiador;
  const totalLucro    = totalCobrado - totalAfiador;

  const fmt = v => 'R$ ' + Number(v).toFixed(2).replace('.', ',');

  const jaTemLogin = usuarioAfiador && usuarioAfiador.id;
  const blocoAcesso = `
    <div class="card">
      <div class="card-header"><span class="card-title">🔑 Acesso do Afiador</span></div>
      <div class="card-body">
        ${jaTemLogin ? `
          <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#0f172a;border-radius:10px;border:1px solid #334155;margin-bottom:16px">
            <div style="width:36px;height:36px;background:#6366f1;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">✂️</div>
            <div>
              <div style="font-size:13px;font-weight:700;color:#f1f5f9">${usuarioAfiador.nome}</div>
              <div style="font-size:12px;color:#64748b">Login: <strong style="color:#94a3b8">${usuarioAfiador.email}</strong></div>
            </div>
            <div style="margin-left:auto;background:#d1fae5;color:#10b981;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px">ATIVO</div>
          </div>
          <p style="color:#64748b;font-size:12px;margin:0 0 16px">Para alterar o login ou senha, preencha abaixo:</p>
        ` : `
          <p style="color:#64748b;font-size:13px;margin:0 0 16px">Crie um login exclusivo para o afiador acessar o painel <strong>/afiador</strong>.</p>
        `}
        <div class="form-grid">
          <div class="form-group">
            <label>Nome</label>
            <input type="text" id="af-acc-nome" value="${jaTemLogin ? usuarioAfiador.nome : 'Afiador'}" style="width:100%">
          </div>
          <div class="form-group">
            <label>Login (usuário)</label>
            <input type="text" id="af-acc-login" value="${jaTemLogin ? usuarioAfiador.email : ''}" placeholder="ex: afiador" autocomplete="off" style="width:100%">
          </div>
          <div class="form-group">
            <label>${jaTemLogin ? 'Nova senha' : 'Senha'}</label>
            <input type="password" id="af-acc-senha" placeholder="Mínimo 4 caracteres" autocomplete="new-password" style="width:100%">
          </div>
          <div class="form-group">
            <label>Confirmar senha</label>
            <input type="password" id="af-acc-senha2" placeholder="Repita a senha" autocomplete="new-password" style="width:100%">
          </div>
        </div>
        <button class="btn btn-primary" onclick="afiacaoSalvarAcesso()">${jaTemLogin ? 'Atualizar Acesso' : '✅ Criar Acesso'}</button>
      </div>
    </div>`;

  container.innerHTML = `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start">

    <div style="display:flex;flex-direction:column;gap:16px">
      <div class="card">
        <div class="card-header"><span class="card-title">⚙️ Configurações do Afiador</span></div>
        <div class="card-body">
          <div class="form-group" style="margin-bottom:16px">
            <label>WhatsApp do Afiador</label>
            <p style="color:#64748b;font-size:12px;margin:2px 0 6px">Receberá aviso automático a cada nova ficha registrada.</p>
            <input type="text" id="af-cfg-telefone" value="${aplicarMascaraTelefone(cfg.whatsapp_afiador || '')}" oninput="mascaraTelefone(this)" style="width:100%;max-width:280px">
          </div>
          <div class="form-group" style="margin-bottom:20px">
            <label>Valor pago ao afiador por ficha (R$)</label>
            <p style="color:#64748b;font-size:12px;margin:2px 0 6px">Valor fixo que o afiador recebe por cada ficha concluída.</p>
            <input type="number" id="af-cfg-valor" min="0" step="0.01" value="${valorAfiador}" style="width:100%;max-width:180px">
          </div>
          <button class="btn btn-primary" onclick="afiacaoSalvarConfig()">Salvar configurações</button>
        </div>
      </div>
      ${blocoAcesso}
    </div>

    <div style="display:flex;flex-direction:column;gap:12px">
      <div class="card">
        <div class="card-header"><span class="card-title">💰 Resumo Financeiro</span></div>
        <div class="card-body">
          <p style="color:#64748b;font-size:12px;margin:0 0 16px">Baseado nas fichas com status <strong>Entregue</strong>.</p>
          <div style="display:flex;flex-direction:column;gap:12px">
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:#0f172a;border-radius:10px;border:1px solid #334155">
              <span style="font-size:13px;color:#94a3b8">Fichas entregues</span>
              <span style="font-size:16px;font-weight:700;color:#f1f5f9">${entregues.length}</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:#0f172a;border-radius:10px;border:1px solid #334155">
              <span style="font-size:13px;color:#94a3b8">Total cobrado</span>
              <span style="font-size:16px;font-weight:700;color:#10b981">${fmt(totalCobrado)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:#0f172a;border-radius:10px;border:1px solid #334155">
              <span style="font-size:13px;color:#94a3b8">A pagar ao afiador</span>
              <span style="font-size:16px;font-weight:700;color:#f59e0b">${fmt(totalAfiador)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 14px;background:#0f172a;border-radius:10px;border:2px solid #6366f1">
              <span style="font-size:14px;font-weight:700;color:#e2e8f0">Seu lucro</span>
              <span style="font-size:20px;font-weight:800;color:#6366f1">${fmt(totalLucro)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div>`;
}

async function afiacaoSalvarConfig() {
  const tel    = document.getElementById('af-cfg-telefone').value;
  const valor  = parseFloat(document.getElementById('af-cfg-valor').value) || 0;
  await api('PUT', '/config', { whatsapp_afiador: tel, valor_afiador: String(valor) });
  toast('Configurações salvas!');
  afiacaoRenderConfig();
}

async function afiacaoSalvarAcesso() {
  const nome   = document.getElementById('af-acc-nome').value.trim();
  const login  = document.getElementById('af-acc-login').value.trim();
  const senha  = document.getElementById('af-acc-senha').value;
  const senha2 = document.getElementById('af-acc-senha2').value;
  if (!login) { toast('Informe o login', 'erro'); return; }
  if (!senha)  { toast('Informe a senha', 'erro'); return; }
  if (senha !== senha2) { toast('As senhas não coincidem', 'erro'); return; }
  if (senha.length < 4) { toast('Senha deve ter pelo menos 4 caracteres', 'erro'); return; }

  try {
    const r = await api('POST', '/afiacao/usuario-afiador', { nome, login, senha });
    toast(r.acao === 'criado' ? '✅ Acesso criado! O afiador já pode entrar em /afiador' : '✅ Acesso atualizado!');
    afiacaoRenderConfig();
  } catch (e) {
    toast(e.message || 'Erro ao salvar acesso', 'erro');
  }
}

// ─── AÇÕES ───────────────────────────────────────────────────────────────────

function afiacaoAbrirModal() {
  document.getElementById('af-qtd').value = '1';
  document.getElementById('af-valor').value = '0';
  document.getElementById('af-cliente').value = '';
  document.getElementById('af-telefone').value = '';
  document.getElementById('af-obs').value = '';
  openModal('modal-afiacao');
}

async function afiacaoSalvar() {
  const qtd = parseInt(document.getElementById('af-qtd').value);
  if (!qtd || qtd < 1) { toast('Informe a quantidade', 'erro'); return; }
  const body = {
    quantidade: qtd,
    valor: parseFloat(document.getElementById('af-valor').value) || 0,
    cliente_nome: document.getElementById('af-cliente').value.trim() || null,
    cliente_telefone: document.getElementById('af-telefone').value.replace(/\D/g,'') || null,
    observacao: document.getElementById('af-obs').value.trim() || null,
  };
  await api('POST', '/afiacao', body);
  closeModal('modal-afiacao');
  toast('Ficha registrada! Afiador notificado via WhatsApp.');
  await afiacaoCarregar();
}

async function afiacaoAvancar(id, novoStatus) {
  await api('PUT', `/afiacao/${id}/status`, { status: novoStatus });
  if (novoStatus === 'entregue') toast('Ficha entregue! Cliente notificado via WhatsApp (se tiver número).');
  await afiacaoCarregar();
}

function afiacaoRecibo(id) {
  window.open(`/api/afiacao/${id}/recibo`, '_blank');
}

async function afiacaoExcluir(id) {
  if (!await pedirSenhaGerente()) return;
  const ok = await modalConfirmar({ titulo: 'Excluir Ficha', mensagem: 'Tem certeza que deseja excluir esta ficha de afiação?', icone: '🗑️', corBotao: '#ef4444', textoBotao: 'Excluir' });
  if (!ok) return;
  await api('DELETE', `/afiacao/${id}`);
  toast('Ficha excluída.');
  await afiacaoCarregar();
}

function afiacaoEditar(id) {
  const f = _afiacaoFichas.find(x => x.id === id);
  if (!f) return;

  let overlay = document.getElementById('modal-afiacao-editar');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'modal-afiacao-editar';
    overlay.className = 'modal-overlay';
    overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
    overlay.innerHTML = `
      <div class="modal" style="max-width:440px;width:100%">
        <div class="modal-header">
          <span class="modal-title">✏️ Editar Ficha</span>
          <button class="modal-close" onclick="document.getElementById('modal-afiacao-editar').remove()">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <div class="form-group">
              <label>Quantidade <span style="color:#ef4444">*</span></label>
              <input type="number" id="af-edit-qtd" min="1" style="width:100%">
            </div>
            <div class="form-group">
              <label>Valor cobrado (R$)</label>
              <input type="number" id="af-edit-valor" min="0" step="0.01" style="width:100%">
            </div>
            <div class="form-group form-full">
              <label>Cliente</label>
              <input type="text" id="af-edit-cliente" placeholder="Nome do cliente" style="width:100%">
            </div>
            <div class="form-group form-full">
              <label>Telefone do cliente</label>
              <input type="text" id="af-edit-telefone" placeholder="(00) 00000-0000" oninput="mascaraTelefone(this)" style="width:100%">
            </div>
            <div class="form-group form-full">
              <label>Observação</label>
              <textarea id="af-edit-obs" rows="3" placeholder="Ex: 3 facas, 2 tesouras..." style="width:100%;resize:vertical"></textarea>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('modal-afiacao-editar').remove()">Cancelar</button>
          <button class="btn btn-primary" id="af-edit-salvar">Salvar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }

  document.getElementById('af-edit-qtd').value = f.quantidade;
  document.getElementById('af-edit-valor').value = Number(f.valor).toFixed(2);
  document.getElementById('af-edit-cliente').value = f.cliente_nome || '';
  document.getElementById('af-edit-telefone').value = aplicarMascaraTelefone(f.cliente_telefone || '');
  document.getElementById('af-edit-obs').value = f.observacao || '';
  document.getElementById('af-edit-salvar').onclick = () => afiacaoSalvarEdicao(id);

  overlay.style.display = 'flex';
}

async function afiacaoSalvarEdicao(id) {
  const qtd = parseInt(document.getElementById('af-edit-qtd').value);
  if (!qtd || qtd < 1) { toast('Informe a quantidade', 'erro'); return; }
  const body = {
    quantidade: qtd,
    valor: parseFloat(document.getElementById('af-edit-valor').value) || 0,
    cliente_nome: document.getElementById('af-edit-cliente').value.trim() || null,
    cliente_telefone: document.getElementById('af-edit-telefone').value.replace(/\D/g, '') || null,
    observacao: document.getElementById('af-edit-obs').value.trim() || null,
  };
  await api('PUT', `/afiacao/${id}`, body);
  document.getElementById('modal-afiacao-editar')?.remove();
  toast('Ficha atualizada!');
  await afiacaoCarregar();
}

// ─── ABA PAGAMENTOS ──────────────────────────────────────────────────────────

async function afiacaoRenderPagamentos() {
  const container = document.getElementById('af-conteudo');
  if (!container) return;
  container.innerHTML = `<p style="color:#64748b;font-size:13px">Carregando...</p>`;

  const [pendente, historico] = await Promise.all([
    api('GET', '/afiacao/pendente-afiador'),
    api('GET', '/afiacao/pagamentos-afiador'),
  ]);

  const fmt     = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
  const fmtData = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

  const pendBlock = pendente.qtd > 0 ? `
    <div style="background:#1e293b;border-radius:14px;padding:20px;border:1px solid #334155;margin-bottom:16px">
      <div style="font-size:12px;font-weight:700;color:#f59e0b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:16px">⏳ Pendente de Pagamento</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
        <div style="flex:1;min-width:110px;background:#0f172a;padding:12px;border-radius:10px;border:1px solid #334155">
          <div style="font-size:11px;color:#64748b;margin-bottom:4px">Fichas</div>
          <div style="font-size:24px;font-weight:800;color:#f1f5f9">${pendente.qtd}</div>
        </div>
        <div style="flex:1;min-width:110px;background:#0f172a;padding:12px;border-radius:10px;border:1px solid #334155">
          <div style="font-size:11px;color:#64748b;margin-bottom:4px">Valor / ficha</div>
          <div style="font-size:18px;font-weight:800;color:#f1f5f9">${fmt(pendente.valor_por_ficha)}</div>
        </div>
        <div style="flex:1;min-width:110px;background:#0f172a;padding:12px;border-radius:10px;border:2px solid #f59e0b">
          <div style="font-size:11px;color:#64748b;margin-bottom:4px">Total a pagar</div>
          <div style="font-size:22px;font-weight:800;color:#f59e0b">${fmt(pendente.total)}</div>
        </div>
      </div>
      ${pendente.data_inicio ? `<p style="color:#64748b;font-size:12px;margin:0 0 16px">Período: ${fmtData(pendente.data_inicio)} → ${fmtData(pendente.data_fim)}</p>` : ''}
      <button onclick="afiacaoMarcarPago()" class="btn btn-primary" style="width:100%">
        ✅ Marcar como Pago — ${fmt(pendente.total)}
      </button>
    </div>
  ` : `
    <div style="background:#1e293b;border-radius:14px;padding:24px 20px;border:1px solid #334155;margin-bottom:16px;text-align:center">
      <div style="font-size:36px;margin-bottom:10px">✅</div>
      <p style="color:#10b981;font-weight:700;font-size:15px;margin:0">Nenhum valor pendente</p>
      <p style="color:#64748b;font-size:12px;margin:6px 0 0">O afiador está em dia!</p>
    </div>
  `;

  const historicoHtml = !historico.length ? `
    <p style="color:#475569;font-size:13px;text-align:center;padding:20px">Nenhum pagamento registrado ainda.</p>
  ` : historico.map(p => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:#0f172a;border-radius:10px;border:1px solid #334155;margin-bottom:8px">
      <div>
        <div style="font-size:14px;font-weight:700;color:#f1f5f9">${fmt(p.valor)}</div>
        <div style="font-size:11px;color:#64748b;margin-top:3px">${p.qtd_fichas} ficha(s) · pago em ${fmtData(p.pago_em?.slice(0, 10))}</div>
        ${p.data_inicio ? `<div style="font-size:11px;color:#475569">Período: ${fmtData(p.data_inicio)} → ${fmtData(p.data_fim)}</div>` : ''}
      </div>
      <div style="background:#d1fae5;color:#10b981;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px">PAGO</div>
    </div>
  `).join('');

  container.innerHTML = `
    ${pendBlock}
    <div style="background:#1e293b;border-radius:14px;padding:20px;border:1px solid #334155">
      <div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px">Histórico de Pagamentos</div>
      ${historicoHtml}
    </div>`;
}

async function afiacaoMarcarPago() {
  const ok = await modalConfirmar({
    titulo: 'Marcar como Pago',
    mensagem: 'Confirmar pagamento ao afiador? Esta ação registra o pagamento e não pode ser desfeita.',
    icone: '💰',
    corBotao: '#10b981',
    textoBotao: 'Confirmar Pagamento',
  });
  if (!ok) return;
  try {
    await api('POST', '/afiacao/pagamentos-afiador', {});
    toast('Pagamento registrado com sucesso!');
    await afiacaoRenderPagamentos();
  } catch (e) {
    toast(e.message || 'Erro ao registrar pagamento', 'erro');
  }
}
