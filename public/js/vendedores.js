async function vendedores(el) {
  el.innerHTML = `
  <div class="card" style="max-width:960px;margin:0 auto">
    <div class="card-header">
      <span class="card-title">Cadastro de Funcionários / Técnicos</span>
    </div>
    <div class="card-body">
      <div class="form-grid">
        <div class="form-group form-full">
          <label>Nome do Funcionário</label>
          <input type="text" id="vendedor-nome">
        </div>
        <div class="form-group">
          <label>WhatsApp <span style="color:#64748b;font-weight:400;font-size:12px">(para notificações de OS)</span></label>
          <input type="text" id="vendedor-telefone" oninput="mascaraTelefone(this)">
        </div>
        <div class="form-group form-full" style="display:flex;align-items:center;gap:10px;margin-top:4px">
          <input type="checkbox" id="vendedor-tecnico" style="width:18px;height:18px;accent-color:#2563eb;cursor:pointer">
          <label for="vendedor-tecnico" style="margin:0;cursor:pointer;font-weight:500">Técnico</label>
        </div>
      </div>

      <!-- Campos restritos: Comissão, Meta, Bônus, % Plantão, Salário -->
      <div id="vendedor-restrito-area" style="display:none;background:#f8faff;border:1px solid #e0e7ff;border-radius:10px;padding:14px 16px;margin-top:4px;margin-bottom:8px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <div style="font-size:12px;font-weight:600;color:#6366f1">🔒 CAMPOS RESTRITOS — FINANCEIRO</div>
          <div id="vendedor-restrito-locked-btn">
            <button type="button" onclick="revelarRestrito()" style="font-size:12px;color:#2563eb;background:none;border:1px solid #bfdbfe;border-radius:6px;padding:4px 10px;cursor:pointer">🔓 Revelar / Editar</button>
          </div>
        </div>
        <div id="vendedor-restrito-locked" style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
          <span style="font-size:22px;letter-spacing:3px;color:#94a3b8">●●●●●●</span>
        </div>
        <div id="vendedor-restrito-edit" style="display:none">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
            <div>
              <label style="font-size:12px;color:#475569;margin-bottom:4px;display:block">Comissão OS (%) <span style="color:#64748b;font-size:11px">(sobre OS normais)</span></label>
              <input type="number" id="vendedor-comissao" min="0" max="100" step="0.1" style="border:1.5px solid #6366f1;border-radius:8px;padding:8px 12px;width:100%;font-size:14px;outline:none;box-sizing:border-box">
            </div>
            <div>
              <label style="font-size:12px;color:#475569;margin-bottom:4px;display:block">🌙 Comissão Plantão (%) <span style="color:#64748b;font-size:11px">(sobre OS de plantão)</span></label>
              <input type="number" id="vendedor-plantao" min="0" max="100" step="0.1" style="border:1.5px solid #7c3aed;border-radius:8px;padding:8px 12px;width:100%;font-size:14px;outline:none;box-sizing:border-box">
            </div>
            <div>
              <label style="font-size:12px;color:#475569;margin-bottom:4px;display:block">Meta Mensal (R$)</label>
              <input type="number" id="vendedor-meta" min="0" step="0.01" style="border:1.5px solid #6366f1;border-radius:8px;padding:8px 12px;width:100%;font-size:14px;outline:none;box-sizing:border-box">
            </div>
            <div>
              <label style="font-size:12px;color:#475569;margin-bottom:4px;display:block">Bônus por Meta (R$)</label>
              <input type="number" id="vendedor-bonus" min="0" step="0.01" style="border:1.5px solid #6366f1;border-radius:8px;padding:8px 12px;width:100%;font-size:14px;outline:none;box-sizing:border-box">
            </div>
            <div>
              <label style="font-size:12px;color:#475569;margin-bottom:4px;display:block">Salário Base (R$)</label>
              <input type="number" id="vendedor-salario" min="0" step="0.01" style="border:1.5px solid #6366f1;border-radius:8px;padding:8px 12px;width:100%;font-size:14px;outline:none;box-sizing:border-box">
            </div>
          </div>
        </div>
      </div>

      <input type="hidden" id="vendedor-id">
      <input type="hidden" id="vendedor-salario-revelado" value="0">
      <div style="display:flex;gap:8px;margin-top:4px">
        <button class="btn btn-primary" onclick="salvarVendedor()">Salvar</button>
        <button class="btn btn-secondary" id="btn-cancelar-vendedor" style="display:none" onclick="cancelarEdicaoVendedor()">Cancelar</button>
      </div>
      <div class="divider"></div>
      <div id="lista-vendedores"></div>
    </div>
  </div>`;
  await carregarVendedores();
}

async function carregarVendedores() {
  const list = await api('GET', '/vendedores');
  const el = document.getElementById('lista-vendedores');
  if (!list.length) { el.innerHTML = '<p class="text-center text-muted">Nenhum funcionário cadastrado</p>'; return; }
  el.innerHTML = `<div class="table-scroll"><table style="min-width:600px">
    <thead><tr><th>Nome</th><th>Técnico</th><th>WhatsApp</th><th>Comissão</th><th>Meta</th><th>Bônus</th><th>App</th><th>Ações</th></tr></thead>
    <tbody>${list.map(v => `
      <tr>
        <td>${v.nome}</td>
        <td>${v.tecnico ? `<span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700">✔ Técnico</span>` : `<span class="text-muted" style="font-size:12px">—</span>`}</td>
        <td>${v.telefone
          ? `<span style="color:#16a34a;font-size:12px">✔ ${v.telefone}</span>`
          : `<span class="text-muted" style="font-size:12px">—</span>`}
        </td>
        <td>${v.percentual_comissao > 0
          ? `<span style="color:#2563eb;font-weight:600;font-size:13px">${v.percentual_comissao}%</span>`
          : `<span class="text-muted" style="font-size:12px">—</span>`}
        </td>
        <td>${v.meta > 0
          ? `<span style="color:#7c3aed;font-size:13px;font-weight:600">${formatCurrency(v.meta)}</span>`
          : `<span class="text-muted" style="font-size:12px">—</span>`}
        </td>
        <td>${v.bonus_meta > 0
          ? `<span style="color:#16a34a;font-size:13px;font-weight:600">${formatCurrency(v.bonus_meta)}</span>`
          : `<span class="text-muted" style="font-size:12px">—</span>`}
        </td>
        <td>
          ${v.email
            ? `<span style="color:#16a34a;font-size:12px" title="Usuário: ${escHtml(v.email)}">✔ Configurado</span>`
            : `<span class="text-muted" style="font-size:12px">—</span>`}
        </td>
        <td>
          <button class="btn btn-sm btn-secondary btn-icon" title="Editar" onclick="editarVendedor(${v.id},'${escHtml(v.nome)}','${escHtml(v.telefone||'')}',${v.percentual_comissao||0},${v.percentual_plantao||0},${v.meta||0},${v.bonus_meta||0},${v.salario_base||0},${v.tecnico||0})">
            <svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
          </button>
          <button class="btn btn-sm btn-secondary btn-icon" title="Acesso App" onclick="abrirAcessoApp(${v.id},'${escHtml(v.nome)}','${escHtml(v.email||'')}')">📱</button>
          <button class="btn btn-sm btn-danger btn-icon" title="Desativar" onclick="excluirVendedor(${v.id})">✕</button>
        </td>
      </tr>`).join('')}
    </tbody>
  </table></div>`;
}

function escHtml(s) { return (s || '').replace(/'/g, "\\'"); }

function editarVendedor(id, nome, telefone, percentual, percentual_plantao, meta, bonus_meta, salario_base, tecnico) {
  document.getElementById('vendedor-id').value = id;
  document.getElementById('vendedor-nome').value = nome;
  document.getElementById('vendedor-telefone').value = aplicarMascaraTelefone(telefone);
  document.getElementById('vendedor-tecnico').checked = !!tecnico;
  document.getElementById('btn-cancelar-vendedor').style.display = 'inline-flex';

  // Guarda valores restritos sem expor
  window._vendedorRestrito = { percentual, percentual_plantao, meta, bonus_meta, salario_base: salario_base || 0 };
  document.getElementById('vendedor-salario-revelado').value = '0';

  // Mostra área restrita bloqueada
  const area = document.getElementById('vendedor-restrito-area');
  area.style.display = '';
  document.getElementById('vendedor-restrito-locked').style.display = 'flex';
  document.getElementById('vendedor-restrito-edit').style.display = 'none';

  document.getElementById('vendedor-nome').focus();
}

async function revelarRestrito() {
  const ok = await modalSenhaGerente('Campos Restritos', 'Esses campos são confidenciais. Digite a senha do gerente para revelar.');
  if (!ok) return;
  const r = window._vendedorRestrito || {};
  document.getElementById('vendedor-comissao').value = r.percentual || '';
  document.getElementById('vendedor-plantao').value  = r.percentual_plantao || '';
  document.getElementById('vendedor-meta').value     = r.meta || '';
  document.getElementById('vendedor-bonus').value    = r.bonus_meta || '';
  document.getElementById('vendedor-salario').value  = r.salario_base || '';
  document.getElementById('vendedor-restrito-locked').style.display = 'none';
  document.getElementById('vendedor-restrito-edit').style.display = '';
  document.getElementById('vendedor-salario-revelado').value = '1';
}

function cancelarEdicaoVendedor() {
  document.getElementById('vendedor-id').value = '';
  document.getElementById('vendedor-nome').value = '';
  document.getElementById('vendedor-telefone').value = '';
  document.getElementById('vendedor-comissao').value = '';
  document.getElementById('vendedor-plantao').value = '';
  document.getElementById('vendedor-meta').value = '';
  document.getElementById('vendedor-bonus').value = '';
  document.getElementById('vendedor-tecnico').checked = false;
  document.getElementById('vendedor-salario-revelado').value = '0';
  document.getElementById('vendedor-restrito-area').style.display = 'none';
  document.getElementById('btn-cancelar-vendedor').style.display = 'none';
  window._vendedorRestrito = {};
}

async function salvarVendedor() {
  const id = document.getElementById('vendedor-id').value;
  const nome = document.getElementById('vendedor-nome').value;
  const telefone = document.getElementById('vendedor-telefone').value;
  const tecnico = document.getElementById('vendedor-tecnico').checked ? 1 : 0;
  const revelado = document.getElementById('vendedor-salario-revelado').value === '1';

  if (!nome) return toast('Nome é obrigatório', 'warning');
  try {
    const body = { nome, telefone, tecnico };
    if (revelado) {
      body.percentual_comissao = document.getElementById('vendedor-comissao').value || 0;
      body.percentual_plantao  = document.getElementById('vendedor-plantao').value  || 0;
      body.meta                = document.getElementById('vendedor-meta').value      || 0;
      body.bonus_meta          = document.getElementById('vendedor-bonus').value     || 0;
      body.salario_base        = document.getElementById('vendedor-salario').value   || 0;
    }

    if (id) {
      await api('PUT', `/vendedores/${id}`, body);
      toast('Funcionário atualizado!');
      cancelarEdicaoVendedor();
    } else {
      await api('POST', '/vendedores', body);
      document.getElementById('vendedor-nome').value = '';
      document.getElementById('vendedor-telefone').value = '';
      toast('Funcionário cadastrado!');
    }
    carregarVendedores();
  } catch (e) { toast(e.message, 'error'); }
}

async function excluirVendedor(id) {
  if (!await modalConfirmar({ titulo: 'Desativar Funcionário', mensagem: 'Deseja realmente desativar este funcionário?', icone: '⚠️', corBotao: '#dc2626', textoBotao: 'Desativar' })) return;
  try {
    await api('DELETE', `/vendedores/${id}`);
    carregarVendedores();
  } catch (e) { toast(e.message, 'error'); }
}

function abrirAcessoApp(id, nome, emailAtual) {
  const overlay = document.createElement('div');
  overlay.id = 'modal-acesso-app';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:16px;width:100%;max-width:400px;box-shadow:0 20px 60px rgba(0,0,0,.3)">
      <div style="padding:20px 24px 0;display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:15px;font-weight:700;color:#1e293b">📱 Acesso App — ${escHtml(nome)}</span>
        <button onclick="document.getElementById('modal-acesso-app').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8">✕</button>
      </div>
      <div style="padding:16px 24px">
        <p style="font-size:13px;color:#64748b;margin-bottom:16px">O funcionário usará este usuário e senha para entrar no app.</p>
        <div style="margin-bottom:14px">
          <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:5px">Usuário</label>
          <input type="text" id="app-usuario" value="${escHtml(emailAtual)}" autocomplete="off"
            style="width:100%;padding:10px 14px;border:2px solid #e5e7eb;border-radius:8px;font-size:14px;outline:none">
        </div>
        <div style="margin-bottom:14px">
          <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:5px">Senha <span style="color:#94a3b8;font-weight:400">(deixe em branco para manter)</span></label>
          <input type="password" id="app-senha" autocomplete="new-password"
            style="width:100%;padding:10px 14px;border:2px solid #e5e7eb;border-radius:8px;font-size:14px;outline:none">
        </div>
        <div id="app-erro" style="color:#dc2626;font-size:13px;margin-bottom:8px;display:none"></div>
      </div>
      <div style="padding:0 24px 20px;display:flex;gap:8px;justify-content:flex-end">
        <button onclick="document.getElementById('modal-acesso-app').remove()"
          style="padding:10px 18px;border:1.5px solid #e5e7eb;background:#fff;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Cancelar</button>
        <button onclick="salvarAcessoApp(${id})"
          style="padding:10px 18px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Salvar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById('app-usuario').focus();
}

async function salvarAcessoApp(id) {
  const usuario = document.getElementById('app-usuario').value.trim();
  const senha = document.getElementById('app-senha').value;
  const erroEl = document.getElementById('app-erro');
  if (!usuario) { erroEl.textContent = 'Usuário é obrigatório'; erroEl.style.display = ''; return; }
  try {
    await api('PUT', `/vendedores/${id}/acesso-app`, { email: usuario, senha: senha || undefined });
    document.getElementById('modal-acesso-app').remove();
    toast('Acesso configurado!');
    carregarVendedores();
  } catch (e) { erroEl.textContent = e.message; erroEl.style.display = ''; }
}
