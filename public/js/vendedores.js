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
        <div class="form-group">
          <label>Comissão (%) <span style="color:#64748b;font-weight:400;font-size:12px">(sobre OS)</span></label>
          <input type="number" id="vendedor-comissao" min="0" max="100" step="0.1">
        </div>
        <div class="form-group">
          <label>Meta Mensal (R$) <span style="color:#64748b;font-weight:400;font-size:12px">(opcional)</span></label>
          <input type="number" id="vendedor-meta" min="0" step="0.01">
        </div>
        <div class="form-group">
          <label>Bônus por Meta (R$) <span style="color:#64748b;font-weight:400;font-size:12px">(ao atingir meta)</span></label>
          <input type="number" id="vendedor-bonus" min="0" step="0.01">
        </div>
      </div>

      <!-- Salário: só aparece na edição e requer senha do gerente -->
      <div id="vendedor-salario-area" style="display:none;background:#f8faff;border:1px solid #e0e7ff;border-radius:10px;padding:14px 16px;margin-top:4px;margin-bottom:8px">
        <div style="font-size:12px;font-weight:600;color:#6366f1;margin-bottom:10px">🔒 CAMPO RESTRITO — SALÁRIO BASE</div>
        <div id="vendedor-salario-locked" style="display:flex;align-items:center;gap:12px">
          <span style="font-size:22px;letter-spacing:3px;color:#94a3b8">●●●●●●</span>
          <button type="button" onclick="revelarSalario()" style="font-size:12px;color:#2563eb;background:none;border:1px solid #bfdbfe;border-radius:6px;padding:4px 10px;cursor:pointer">🔓 Revelar / Editar</button>
        </div>
        <div id="vendedor-salario-edit" style="display:none">
          <label style="font-size:12px;color:#475569;margin-bottom:4px;display:block">Salário Base (R$)</label>
          <input type="number" id="vendedor-salario" min="0" step="0.01"
                 style="border:1.5px solid #6366f1;border-radius:8px;padding:8px 12px;width:200px;font-size:14px;outline:none">
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
    <thead><tr><th>Nome</th><th>WhatsApp</th><th>Comissão</th><th>Meta</th><th>Bônus</th><th>App</th><th>Ações</th></tr></thead>
    <tbody>${list.map(v => `
      <tr>
        <td>${v.nome}</td>
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
          <button class="btn btn-sm btn-secondary btn-icon" title="Editar" onclick="editarVendedor(${v.id},'${escHtml(v.nome)}','${escHtml(v.telefone||'')}',${v.percentual_comissao||0},${v.meta||0},${v.bonus_meta||0},${v.salario_base||0})">
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

function editarVendedor(id, nome, telefone, percentual, meta, bonus_meta, salario_base) {
  document.getElementById('vendedor-id').value = id;
  document.getElementById('vendedor-nome').value = nome;
  document.getElementById('vendedor-telefone').value = aplicarMascaraTelefone(telefone);
  document.getElementById('vendedor-comissao').value = percentual || '';
  document.getElementById('vendedor-meta').value = meta || '';
  document.getElementById('vendedor-bonus').value = bonus_meta || '';
  document.getElementById('btn-cancelar-vendedor').style.display = 'inline-flex';

  // Guarda salário sem expor
  window._vendedorSalarioBase = salario_base || 0;
  document.getElementById('vendedor-salario-revelado').value = '0';

  // Mostra área de salário (restrita)
  const areaEl = document.getElementById('vendedor-salario-area');
  areaEl.style.display = '';
  document.getElementById('vendedor-salario-locked').style.display = 'flex';
  document.getElementById('vendedor-salario-edit').style.display = 'none';
  document.getElementById('vendedor-salario').value = '';

  document.getElementById('vendedor-nome').focus();
}

async function revelarSalario() {
  const ok = await modalSenhaGerente('Salário Restrito', 'O campo de salário é confidencial. Digite a senha do gerente para revelar.');
  if (!ok) return;
  document.getElementById('vendedor-salario').value = window._vendedorSalarioBase || 0;
  document.getElementById('vendedor-salario-locked').style.display = 'none';
  document.getElementById('vendedor-salario-edit').style.display = '';
  document.getElementById('vendedor-salario-revelado').value = '1';
  document.getElementById('vendedor-salario').focus();
}

function cancelarEdicaoVendedor() {
  document.getElementById('vendedor-id').value = '';
  document.getElementById('vendedor-nome').value = '';
  document.getElementById('vendedor-telefone').value = '';
  document.getElementById('vendedor-comissao').value = '';
  document.getElementById('vendedor-meta').value = '';
  document.getElementById('vendedor-bonus').value = '';
  document.getElementById('vendedor-salario-revelado').value = '0';
  document.getElementById('vendedor-salario-area').style.display = 'none';
  document.getElementById('btn-cancelar-vendedor').style.display = 'none';
  window._vendedorSalarioBase = 0;
}

async function salvarVendedor() {
  const id = document.getElementById('vendedor-id').value;
  const nome = document.getElementById('vendedor-nome').value;
  const telefone = document.getElementById('vendedor-telefone').value;
  const percentual_comissao = document.getElementById('vendedor-comissao').value;
  const meta = document.getElementById('vendedor-meta').value;
  const bonus_meta = document.getElementById('vendedor-bonus').value;
  const revelado = document.getElementById('vendedor-salario-revelado').value === '1';
  const salario_base = revelado ? (document.getElementById('vendedor-salario').value || 0) : undefined;

  if (!nome) return toast('Nome é obrigatório', 'warning');
  try {
    const body = { nome, telefone, percentual_comissao, meta, bonus_meta };
    if (salario_base !== undefined) body.salario_base = salario_base;

    if (id) {
      await api('PUT', `/vendedores/${id}`, body);
      toast('Funcionário atualizado!');
      cancelarEdicaoVendedor();
    } else {
      await api('POST', '/vendedores', body);
      document.getElementById('vendedor-nome').value = '';
      document.getElementById('vendedor-telefone').value = '';
      document.getElementById('vendedor-comissao').value = '';
      document.getElementById('vendedor-meta').value = '';
      document.getElementById('vendedor-bonus').value = '';
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
