async function configuracoes(el) {
  const cfg = await api('GET', '/config');
  el.innerHTML = `
  <div style="max-width:600px">
    <div class="card" style="margin-bottom:24px">
      <div class="card-header"><span class="card-title">Dados da Empresa</span></div>
      <div class="card-body">
        <div class="form-grid">
          <div class="form-group form-full">
            <label>Nome da Empresa</label>
            <input type="text" id="cfg-empresa-nome" value="${cfg.empresa_nome || ''}">
          </div>
          <div class="form-group">
            <label>Telefone</label>
            <input type="text" id="cfg-empresa-telefone" value="${aplicarMascaraTelefone(cfg.empresa_telefone)}" oninput="mascaraTelefone(this)">
          </div>
          <div class="form-group">
            <label>CNPJ</label>
            <input type="text" id="cfg-empresa-cnpj" value="${cfg.empresa_cnpj || ''}">
          </div>
          <div class="form-group">
            <label>CEP</label>
            <input type="text" id="cfg-empresa-cep" value="${cfg.empresa_cep || ''}" onblur="buscarCEP(this.value)">
          </div>
          <div class="form-group" style="flex: 2">
            <label>Logradouro (Rua/Av)</label>
            <input type="text" id="cfg-empresa-rua" value="${cfg.empresa_rua || ''}">
          </div>
          <div class="form-group" style="flex: 0.5">
            <label>Número</label>
            <input type="text" id="cfg-empresa-numero" value="${cfg.empresa_numero || ''}">
          </div>
          <div class="form-group">
            <label>Bairro</label>
            <input type="text" id="cfg-empresa-bairro" value="${cfg.empresa_bairro || ''}">
          </div>
          <div class="form-group">
            <label>Cidade</label>
            <input type="text" id="cfg-empresa-cidade" value="${cfg.empresa_cidade || ''}">
          </div>
          <div class="form-group">
            <label>Estado (UF)</label>
            <input type="text" id="cfg-empresa-estado" value="${cfg.empresa_estado || ''}" maxlength="2">
          </div>
        </div>
        <div style="margin-top:16px">
          <button class="btn btn-primary" onclick="salvarConfig()">Salvar Configurações</button>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:24px">
      <div class="card-header"><span class="card-title">Notificações WhatsApp</span></div>
      <div class="card-body">
        <p style="color:#64748b;font-size:13px;margin-bottom:16px">
          Números que receberão os avisos automáticos do sistema via WhatsApp.
        </p>
        <div class="form-group" style="max-width:300px;margin-bottom:16px">
          <label>WhatsApp para Comissões</label>
          <input type="text" id="cfg-whatsapp-comissao" value="${aplicarMascaraTelefone(cfg.whatsapp_comissao)}" oninput="mascaraTelefone(this)">
        </div>
        <div class="form-group" style="max-width:300px;margin-bottom:16px">
          <label>WhatsApp para Cobranças <span style="color:#64748b;font-weight:400;font-size:12px">(aviso diário às 08h)</span></label>
          <input type="text" id="cfg-whatsapp-cobrancas" value="${aplicarMascaraTelefone(cfg.whatsapp_cobrancas)}" oninput="mascaraTelefone(this)">
        </div>
        <div class="form-group" style="max-width:300px;margin-bottom:16px">
          <label>WhatsApp para Pedidos de Compra <span style="color:#64748b;font-weight:400;font-size:12px">(avisos por prioridade)</span></label>
          <input type="text" id="cfg-whatsapp-pedidos" value="${aplicarMascaraTelefone(cfg.whatsapp_pedidos)}" oninput="mascaraTelefone(this)">
        </div>
        <button class="btn btn-primary" onclick="salvarWhatsappComissao()">Salvar</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:24px">
      <div class="card-header"><span class="card-title">Alterar Senha</span></div>
      <div class="card-body">
        <div class="form-group" style="margin-bottom:14px">
          <label>Senha Atual</label>
          <input type="password" id="cfg-senha-atual">
        </div>
        <div class="form-group" style="margin-bottom:14px">
          <label>Nova Senha</label>
          <input type="password" id="cfg-senha-nova">
        </div>
        <div class="form-group" style="margin-bottom:16px">
          <label>Confirmar Nova Senha</label>
          <input type="password" id="cfg-senha-conf">
        </div>
        <button class="btn btn-primary" onclick="alterarSenha()">Alterar Senha</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:24px">
      <div class="card-header"><span class="card-title">🔒 Senha do Gerente</span></div>
      <div class="card-body">
        <p style="color:#64748b;font-size:13px;margin-bottom:16px">
          Senha global do sistema. Exigida para: excluir vendas/OS/gastos, ver informações financeiras no assistente (faturamento, lucro, fechamento de caixa) e revelar salário de funcionários.
        </p>
        ${cfg.senha_gerente_configurada
          ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:13px;color:#166534">
               ✔ Senha do gerente já configurada
             </div>
             <div class="form-group" style="margin-bottom:14px">
               <label>Senha Atual</label>
               <input type="password" id="cfg-senha-ger-atual">
             </div>`
          : `<div style="background:#fefce8;border:1px solid #fde047;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:13px;color:#854d0e">
               ⚠ Nenhuma senha configurada. Sem ela, qualquer usuário logado pode ver informações financeiras no assistente.
             </div>`
        }
        <div class="form-group" style="margin-bottom:14px">
          <label>Nova Senha do Gerente</label>
          <input type="password" id="cfg-senha-ger-nova">
        </div>
        <div class="form-group" style="margin-bottom:16px">
          <label>Confirmar Nova Senha</label>
          <input type="password" id="cfg-senha-ger-conf">
        </div>
        <button class="btn btn-primary" onclick="salvarSenhaGerente()">Salvar Senha do Gerente</button>
      </div>
    </div>

  </div>`;
}

async function buscarCEP(cep) {
  const limpo = cep.replace(/\D/g, '');
  if (limpo.length !== 8) return;
  try {
    const data = await api('GET', `/cep/${limpo}`);
    if (!data || data.erro) { toast('CEP não encontrado', 'warning'); return; }
    document.getElementById('cfg-empresa-rua').value = data.logradouro || '';
    document.getElementById('cfg-empresa-bairro').value = data.bairro || '';
    document.getElementById('cfg-empresa-cidade').value = data.localidade || '';
    document.getElementById('cfg-empresa-estado').value = data.uf || '';
    document.getElementById('cfg-empresa-numero').focus();
  } catch (e) {
    toast('CEP não encontrado', 'error');
  }
}

async function salvarConfig() {
  const body = {
    empresa_nome: document.getElementById('cfg-empresa-nome').value,
    empresa_telefone: document.getElementById('cfg-empresa-telefone').value,
    empresa_cnpj: document.getElementById('cfg-empresa-cnpj').value,
    empresa_cep: document.getElementById('cfg-empresa-cep').value,
    empresa_rua: document.getElementById('cfg-empresa-rua').value,
    empresa_numero: document.getElementById('cfg-empresa-numero').value,
    empresa_bairro: document.getElementById('cfg-empresa-bairro').value,
    empresa_cidade: document.getElementById('cfg-empresa-cidade').value,
    empresa_estado: document.getElementById('cfg-empresa-estado').value,
  };
  try {
    await api('PUT', '/config', body);
    toast('Configurações salvas!');
    if (body.empresa_nome) {
      document.getElementById('sidebar-empresa').textContent = body.empresa_nome;
      document.title = body.empresa_nome + ' - Sistema';
    }
  } catch (e) { toast(e.message, 'error'); }
}

async function salvarSenhaGerente() {
  const atualEl = document.getElementById('cfg-senha-ger-atual');
  const nova = document.getElementById('cfg-senha-ger-nova').value;
  const conf = document.getElementById('cfg-senha-ger-conf').value;
  if (!nova) { toast('Digite a nova senha', 'warning'); return; }
  if (nova !== conf) { toast('As senhas não coincidem', 'error'); return; }
  if (nova.length < 4) { toast('A senha deve ter pelo menos 4 caracteres', 'warning'); return; }
  const body = { senha_nova: nova };
  if (atualEl) body.senha_atual = atualEl.value;
  try {
    await api('PUT', '/config/senha-gerente', body);
    toast('Senha do gerente salva!');
    configuracoes(document.getElementById('main-content'));
  } catch (e) { toast(e.message, 'error'); }
}

async function salvarSenhaExclusao() {
  const atualEl = document.getElementById('cfg-senha-excl-atual');
  const nova = document.getElementById('cfg-senha-excl-nova').value;
  const conf = document.getElementById('cfg-senha-excl-conf').value;
  if (!nova) { toast('Digite a nova senha de exclusão', 'warning'); return; }
  if (nova !== conf) { toast('As senhas não coincidem', 'error'); return; }
  if (nova.length < 4) { toast('A senha deve ter pelo menos 4 caracteres', 'warning'); return; }
  const body = { senha_nova: nova };
  if (atualEl) body.senha_atual = atualEl.value;
  try {
    await api('PUT', '/config/senha-exclusao', body);
    toast('Senha de exclusão salva!');
    configuracoes(document.getElementById('main-content'));
  } catch (e) { toast(e.message, 'error'); }
}

async function salvarWhatsappComissao() {
  const comissao = document.getElementById('cfg-whatsapp-comissao').value;
  const cobrancas = document.getElementById('cfg-whatsapp-cobrancas').value;
  try {
    const pedidosWa = document.getElementById('cfg-whatsapp-pedidos').value;
  await api('PUT', '/config', { whatsapp_comissao: comissao, whatsapp_cobrancas: cobrancas, whatsapp_pedidos: pedidosWa });
    toast('Números salvos!');
  } catch (e) { toast(e.message, 'error'); }
}

async function alterarSenha() {
  const atual = document.getElementById('cfg-senha-atual').value;
  const nova = document.getElementById('cfg-senha-nova').value;
  const conf = document.getElementById('cfg-senha-conf').value;
  if (!atual || !nova) { toast('Preencha todos os campos', 'warning'); return; }
  if (nova !== conf) { toast('A nova senha e a confirmação não coincidem', 'error'); return; }
  if (nova.length < 6) { toast('A nova senha deve ter pelo menos 6 caracteres', 'warning'); return; }
  try {
    await api('PUT', '/auth/senha', { senha_atual: atual, senha_nova: nova });
    toast('Senha alterada com sucesso!');
    document.getElementById('cfg-senha-atual').value = '';
    document.getElementById('cfg-senha-nova').value = '';
    document.getElementById('cfg-senha-conf').value = '';
  } catch (e) { toast(e.message, 'error'); }
}
