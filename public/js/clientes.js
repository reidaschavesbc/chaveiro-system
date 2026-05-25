let clientesList = [];

async function clientes(el) {
    el.innerHTML = `
  <div class="card">
    <div class="card-header">
      <span class="card-title">Clientes</span>
      <div class="flex gap-2 align-center">
        <div class="search-box">
          <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          <input type="text" id="search-clientes" oninput="filtrarClientes()">
        </div>
        <button class="btn btn-primary" onclick="abrirModalCliente()">
          <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
          Novo Cliente
        </button>
      </div>
    </div>
    <div id="tabela-clientes"></div>
  </div>

  <div class="modal-overlay" id="modal-cliente">
    <div class="modal modal-lg">
      <div class="modal-header">
        <span class="modal-title" id="modal-cliente-title">Novo Cliente</span>
        <button class="modal-close" onclick="closeModal('modal-cliente')">&times;</button>
      </div>
      <div class="modal-body">
        <form id="form-cliente" onsubmit="return false">
          <input type="hidden" id="cliente-id">
          <div class="form-grid">

            <div class="form-group form-full">
              <label>Nome *</label>
              <input type="text" id="cliente-nome" required>
            </div>

            <div class="form-group form-full">
              <label>Nome Fantasia</label>
              <input type="text" id="cliente-nome-fantasia">
            </div>

            <div class="form-group">
              <label>CPF / CNPJ</label>
              <div style="display:flex">
                <select id="cliente-doc-tipo" onchange="toggleDocTipo()" style="border-radius:6px 0 0 6px;width:82px;flex:0 0 auto;border-right:none">
                  <option value="cpf">CPF</option>
                  <option value="cnpj">CNPJ</option>
                </select>
                <input type="text" id="cliente-doc" style="border-radius:0;flex:1" oninput="mascaraCPFCNPJ(this)" maxlength="18">
                <button type="button" id="btn-buscar-cnpj" onclick="consultarCNPJAuto()" style="display:none;border-radius:0 6px 6px 0;padding:0 12px;background:#1d4ed8;color:#fff;border:1.5px solid #1d4ed8;cursor:pointer;font-size:12px;white-space:nowrap">🔍 Receita</button>
              </div>
            </div>

            <div class="form-group">
              <label>Telefone / WhatsApp</label>
              <input type="text" id="cliente-telefone" oninput="mascaraTelefone(this)">
            </div>

            <div class="form-group form-full">
              <label>E-mail</label>
              <input type="email" id="cliente-email">
            </div>

            <div class="form-group">
              <label>CEP</label>
              <div style="display:flex;gap:6px">
                <input type="text" id="cliente-cep" maxlength="9" style="flex:1" oninput="formatarCEP(this)" onkeydown="if(event.key==='Enter'){buscarCEPCliente();event.preventDefault()}">
                <button type="button" class="btn btn-secondary" style="padding:0 14px;white-space:nowrap" onclick="buscarCEPCliente()">Buscar</button>
              </div>
            </div>

            <div class="form-group">
              <label>Bairro</label>
              <input type="text" id="cliente-bairro">
            </div>

            <div class="form-group form-full">
              <label>Rua / Logradouro</label>
              <input type="text" id="cliente-endereco">
            </div>

            <div class="form-group">
              <label>Número</label>
              <input type="text" id="cliente-numero">
            </div>

            <div class="form-group">
              <label>Complemento (ap, bloco...)</label>
              <input type="text" id="cliente-complemento">
            </div>

            <div class="form-group">
              <label>Cidade</label>
              <input type="text" id="cliente-cidade">
            </div>

            <div class="form-group form-full">
              <label>Referência</label>
              <input type="text" id="cliente-referencia">
            </div>

            <div class="form-group form-full">
              <label>Observações</label>
              <textarea id="cliente-obs"></textarea>
            </div>

          </div>
        </form>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('modal-cliente')">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarCliente()">Salvar</button>
      </div>
    </div>
  </div>`;
    await carregarClientes();
}

async function carregarClientes() {
    try {
        clientesList = await api('GET', '/clientes');
        renderClientes(clientesList);
    } catch (e) { toast(e.message, 'error'); }
}

function renderClientes(list) {
    const el = document.getElementById('tabela-clientes');
    if (!list.length) {
        el.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg><h3>Nenhum cliente cadastrado</h3><p>Clique em "Novo Cliente" para começar</p></div>';
        return;
    }
    el.innerHTML = `<table>
    <thead><tr><th>Nome</th><th>CPF / CNPJ</th><th>Telefone</th><th>Endereço</th><th style="width:120px">Ações</th></tr></thead>
    <tbody>${list.map(c => {
        const doc = c.cpf || c.cnpj || '';
        const docLabel = c.cnpj ? `<span style="font-size:10px;background:#eff6ff;color:#1a56db;padding:1px 4px;border-radius:3px;margin-right:3px">CNPJ</span>${c.cnpj}` : (c.cpf || '<span class="text-muted">-</span>');
        const endereco = [c.endereco, c.numero, c.complemento, c.cidade].filter(Boolean).join(', ') || '<span class="text-muted">-</span>';
        return `
      <tr>
        <td>
          <strong>${c.nome_fantasia || c.nome}</strong>
          ${c.nome_fantasia ? `<br><span class="text-muted" style="font-size:11px">${c.nome}</span>` : ''}
          ${c.observacoes ? `<br><span class="text-muted" style="font-size:11px">${c.observacoes}</span>` : ''}
        </td>
        <td>${docLabel}</td>
        <td>${c.telefone || '<span class="text-muted">-</span>'}</td>
        <td style="font-size:12px">${endereco}</td>
        <td><div class="actions-cell">
          <button class="btn btn-sm btn-secondary" style="font-size:11px;padding:3px 8px" title="Gerenciar autorizados" onclick="abrirModalAutorizados(${c.id}, '${c.nome.replace(/'/g, "\\'")}')">Autorizados</button>
          <button class="btn btn-sm btn-secondary btn-icon" title="Editar" onclick="editarCliente(${c.id})"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button>
          <button class="btn btn-sm btn-danger btn-icon" title="Excluir" onclick="excluirCliente(${c.id})"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>
        </div></td>
      </tr>`;
    }).join('')}
    </tbody>
  </table>`;
}

function filtrarClientes() {
    const q = document.getElementById('search-clientes').value.toLowerCase();
    const filtered = clientesList.filter(c =>
        c.nome.toLowerCase().includes(q) ||
        (c.nome_fantasia || '').toLowerCase().includes(q) ||
        (c.cpf || '').includes(q) ||
        (c.cnpj || '').includes(q) ||
        (c.telefone || '').includes(q) ||
        (c.cidade || '').toLowerCase().includes(q)
    );
    renderClientes(filtered);
}

function toggleDocTipo() {
    const tipo = document.getElementById('cliente-doc-tipo').value;
    const inp  = document.getElementById('cliente-doc');
    const btn  = document.getElementById('btn-buscar-cnpj');
    inp.value = '';
    inp.placeholder = tipo === 'cpf' ? '000.000.000-00' : '00.000.000/0001-00';
    inp.style.borderRadius = tipo === 'cnpj' ? '0' : '0 6px 6px 0';
    if (btn) btn.style.display = tipo === 'cnpj' ? '' : 'none';
}

async function consultarCNPJAuto() {
    const inp  = document.getElementById('cliente-doc');
    const cnpj = inp.value.replace(/\D/g, '');
    if (cnpj.length !== 14) { toast('Digite o CNPJ completo (14 dígitos)', 'error'); return; }

    const btn = document.querySelector('#form-cliente .btn-primary');
    const orig = inp.style.borderColor;
    inp.style.borderColor = '#f59e0b';

    try {
        const d = await api('GET', `/cnpj/${cnpj}`);

        // Nome / Razão social e nome fantasia
        const razaoSocial = d.razao_social || '';
        const nomeFantasia = d.nome_fantasia || '';
        if (razaoSocial && !document.getElementById('cliente-nome').value) {
            document.getElementById('cliente-nome').value = razaoSocial;
        }
        if (nomeFantasia && !document.getElementById('cliente-nome-fantasia').value) {
            document.getElementById('cliente-nome-fantasia').value = nomeFantasia;
        }
        const nome = razaoSocial || nomeFantasia;

        // Endereço
        if (d.logradouro) document.getElementById('cliente-endereco').value = d.logradouro;
        if (d.numero)     document.getElementById('cliente-numero').value   = d.numero;
        if (d.complemento) document.getElementById('cliente-complemento').value = d.complemento;
        if (d.bairro)     document.getElementById('cliente-bairro').value   = d.bairro;
        if (d.municipio)  document.getElementById('cliente-cidade').value   = d.municipio;

        // CEP
        if (d.cep) {
            const cepLimpo = d.cep.replace(/\D/g, '');
            document.getElementById('cliente-cep').value = cepLimpo.replace(/^(\d{5})(\d{3})$/, '$1-$2');
        }

        // Email e telefone
        if (d.email && !document.getElementById('cliente-email').value) {
            document.getElementById('cliente-email').value = d.email;
        }
        if ((d.ddd_telefone_1 || d.telefone) && !document.getElementById('cliente-telefone').value) {
            const fone = (d.ddd_telefone_1 || d.telefone || '').replace(/\D/g, '');
            if (fone) document.getElementById('cliente-telefone').value = aplicarMascaraTelefone(fone);
        }

        inp.style.borderColor = '#22c55e';
        toast(`Dados preenchidos: ${nome || 'CNPJ encontrado'}`, 'success');
    } catch (e) {
        inp.style.borderColor = '#ef4444';
        const msg = e.message?.includes('404') ? 'CNPJ não encontrado na Receita Federal' : 'Não foi possível consultar o CNPJ agora';
        toast(msg, 'error');
    } finally {
        setTimeout(() => { inp.style.borderColor = orig; }, 3000);
    }
}

function formatarCEP(el) {
    el.value = el.value.replace(/\D/g, '').slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2');
}

async function buscarCEPCliente() {
    const cep = document.getElementById('cliente-cep').value.replace(/\D/g, '');
    if (cep.length !== 8) { toast('CEP deve ter 8 dígitos', 'warning'); return; }
    try {
        const d = await api('GET', `/cep/${cep}`);
        if (!d || d.erro) { toast('CEP não encontrado', 'error'); return; }
        document.getElementById('cliente-endereco').value = d.logradouro || '';
        document.getElementById('cliente-bairro').value = d.bairro || '';
        document.getElementById('cliente-cidade').value = d.localidade || '';
        toast('Endereço preenchido!', 'success');
        document.getElementById('cliente-numero').focus();
    } catch (e) {
        toast('CEP não encontrado', 'error');
    }
}

function abrirModalCliente() {
    document.getElementById('cliente-id').value = '';
    document.getElementById('form-cliente').reset();
    document.getElementById('cliente-doc-tipo').value = 'cpf';
    document.getElementById('cliente-doc').placeholder = '000.000.000-00';
    document.getElementById('cliente-nome-fantasia').value = '';
    document.getElementById('modal-cliente-title').textContent = 'Novo Cliente';
    toggleDocTipo();
    openModal('modal-cliente');
}

function editarCliente(id) {
    const c = clientesList.find(x => x.id === id);
    if (!c) return;
    document.getElementById('cliente-id').value = c.id;
    document.getElementById('cliente-nome').value = c.nome || '';
    document.getElementById('cliente-nome-fantasia').value = c.nome_fantasia || '';

    if (c.cnpj) {
        document.getElementById('cliente-doc-tipo').value = 'cnpj';
        toggleDocTipo();
        document.getElementById('cliente-doc').value = aplicarMascaraCPFCNPJ(c.cnpj);
    } else {
        document.getElementById('cliente-doc-tipo').value = 'cpf';
        toggleDocTipo();
        document.getElementById('cliente-doc').value = aplicarMascaraCPFCNPJ(c.cpf || '');
    }

    document.getElementById('cliente-telefone').value = aplicarMascaraTelefone(c.telefone);
    document.getElementById('cliente-email').value = c.email || '';
    document.getElementById('cliente-cep').value = c.cep || '';
    document.getElementById('cliente-endereco').value = c.endereco || '';
    document.getElementById('cliente-numero').value = c.numero || '';
    document.getElementById('cliente-complemento').value = c.complemento || '';
    document.getElementById('cliente-bairro').value = c.bairro || '';
    document.getElementById('cliente-cidade').value = c.cidade || '';
    document.getElementById('cliente-referencia').value = c.referencia || '';
    document.getElementById('cliente-obs').value = c.observacoes || '';
    document.getElementById('modal-cliente-title').textContent = 'Editar Cliente';
    openModal('modal-cliente');
}

async function salvarCliente() {
    const id = document.getElementById('cliente-id').value;
    const docTipo = document.getElementById('cliente-doc-tipo').value;
    const docVal = document.getElementById('cliente-doc').value.trim();
    const body = {
        nome: document.getElementById('cliente-nome').value.trim(),
        nome_fantasia: document.getElementById('cliente-nome-fantasia').value.trim(),
        cpf: docTipo === 'cpf' ? docVal : '',
        cnpj: docTipo === 'cnpj' ? docVal : '',
        telefone: document.getElementById('cliente-telefone').value,
        email: document.getElementById('cliente-email').value,
        cep: document.getElementById('cliente-cep').value,
        endereco: document.getElementById('cliente-endereco').value,
        numero: document.getElementById('cliente-numero').value,
        complemento: document.getElementById('cliente-complemento').value,
        bairro: document.getElementById('cliente-bairro').value,
        cidade: document.getElementById('cliente-cidade').value,
        referencia: document.getElementById('cliente-referencia').value,
        observacoes: document.getElementById('cliente-obs').value,
    };
    if (!body.nome) { toast('Nome é obrigatório', 'error'); return; }
    try {
        if (id) await api('PUT', `/clientes/${id}`, body);
        else await api('POST', '/clientes', body);
        toast(id ? 'Cliente atualizado!' : 'Cliente cadastrado!');
        closeModal('modal-cliente');
        await carregarClientes();
    } catch (e) { toast(e.message, 'error'); }
}

async function excluirCliente(id) {
    if (!await confirmDialog('Confirma exclusão do cliente?')) return;
    try {
        await api('DELETE', `/clientes/${id}`);
        toast('Cliente excluído!');
        await carregarClientes();
    } catch (e) { toast(e.message, 'error'); }
}

// ─── Autorizados ──────────────────────────────────────────────────────────────

let _autClienteId = null;

async function abrirModalAutorizados(clienteId, clienteNome) {
    _autClienteId = clienteId;

    let modal = document.getElementById('modal-autorizados');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-autorizados';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
          <div class="modal modal-md">
            <div class="modal-header">
              <span class="modal-title" id="aut-titulo">Autorizados</span>
              <button class="modal-close" onclick="closeModal('modal-autorizados')">&times;</button>
            </div>
            <div class="modal-body">
              <div id="aut-lista" style="margin-bottom:16px"></div>
              <div style="border-top:1px solid #e2e8f0;padding-top:14px">
                <div style="font-size:12px;font-weight:600;color:#64748b;margin-bottom:10px;text-transform:uppercase;letter-spacing:.4px">Adicionar Autorizado</div>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                  <input type="text" id="aut-nome" style="flex:2;min-width:140px;padding:8px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px">
                  <input type="text" id="aut-telefone" oninput="mascaraTelefone(this)" style="flex:1;min-width:110px;padding:8px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px">
                  <input type="text" id="aut-cargo" style="flex:1;min-width:110px;padding:8px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px">
                  <button class="btn btn-primary" style="white-space:nowrap" onclick="adicionarAutorizado()">+ Adicionar</button>
                </div>
              </div>
            </div>
          </div>`;
        document.body.appendChild(modal);
    }

    document.getElementById('aut-titulo').textContent = `Autorizados — ${clienteNome}`;
    document.getElementById('aut-nome').value = '';
    document.getElementById('aut-telefone').value = '';
    document.getElementById('aut-cargo').value = '';
    openModal('modal-autorizados');
    await carregarAutorizados();
}

async function carregarAutorizados() {
    if (!_autClienteId) return;
    try {
        const lista = await api('GET', `/clientes/${_autClienteId}/autorizados`);
        const el = document.getElementById('aut-lista');
        if (!lista.length) {
            el.innerHTML = `<div style="text-align:center;padding:16px;color:#94a3b8;font-size:13px">Nenhum autorizado cadastrado.</div>`;
            return;
        }
        el.innerHTML = lista.map(a => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f1f5f9">
            <div>
              <div style="font-weight:600;font-size:13px">${a.nome}</div>
              <div style="font-size:12px;color:#64748b">${[a.cargo, a.telefone].filter(Boolean).join(' · ') || '—'}</div>
            </div>
            <button class="btn btn-sm" style="padding:4px 8px;background:#fee2e2;color:#dc2626;border:none" onclick="removerAutorizado(${a.id})">🗑️</button>
          </div>`).join('');
    } catch (e) { toast(e.message, 'error'); }
}

async function adicionarAutorizado() {
    const nome = document.getElementById('aut-nome').value.trim();
    if (!nome) { toast('Informe o nome', 'warning'); return; }
    const telefone = document.getElementById('aut-telefone').value.trim();
    const cargo = document.getElementById('aut-cargo').value.trim();
    try {
        await api('POST', `/clientes/${_autClienteId}/autorizados`, { nome, telefone, cargo });
        toast('Autorizado adicionado!');
        document.getElementById('aut-nome').value = '';
        document.getElementById('aut-telefone').value = '';
        document.getElementById('aut-cargo').value = '';
        await carregarAutorizados();
    } catch (e) { toast(e.message, 'error'); }
}

async function removerAutorizado(autId) {
    if (!await modalConfirmar({ titulo: 'Remover Autorizado', mensagem: 'Deseja remover este autorizado?', icone: '🗑️', corBotao: '#dc2626', textoBotao: 'Remover' })) return;
    try {
        await api('DELETE', `/clientes/${_autClienteId}/autorizados/${autId}`);
        toast('Autorizado removido');
        await carregarAutorizados();
    } catch (e) { toast(e.message, 'error'); }
}
