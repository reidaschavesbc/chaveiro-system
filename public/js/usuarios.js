async function usuarios(el) {
    await renderUsuarios(el);
}

async function renderUsuarios(el) {
    const lista = await api('GET', '/usuarios');

    const perfilLabel = { admin: 'Administrador', operador: 'Operador' };
    const perfilBadge = { admin: 'badge-blue', operador: 'badge-gray' };

    el.innerHTML = `
    <div style="max-width:900px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
            <div>
                <div style="font-size:15px;color:#64748b">${lista.length} usuário(s) cadastrado(s)</div>
            </div>
            <button class="btn btn-primary" onclick="modalNovoUsuario()">+ Novo Usuário</button>
        </div>

        <div class="card">
            <div class="table-scroll">
                <table>
                    <thead>
                        <tr>
                            <th>Nome</th>
                            <th>E-mail / Login</th>
                            <th>Perfil</th>
                            <th>Status</th>
                            <th>Cadastrado em</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${lista.map(u => `
                        <tr>
                            <td><strong>${u.nome}</strong></td>
                            <td style="color:#64748b">${u.email}</td>
                            <td><span class="badge ${perfilBadge[u.perfil] || 'badge-gray'}">${perfilLabel[u.perfil] || u.perfil}</span></td>
                            <td>
                                <span class="badge ${u.ativo ? 'badge-green' : 'badge-red'}">
                                    ${u.ativo ? 'Ativo' : 'Inativo'}
                                </span>
                            </td>
                            <td style="color:#64748b;font-size:13px">${formatDate(u.criado_em)}</td>
                            <td>
                                <div style="display:flex;gap:8px">
                                    <button class="btn btn-sm btn-secondary" onclick='modalEditarUsuario(${JSON.stringify(u)})'>Editar</button>
                                    <button class="btn btn-sm btn-secondary" onclick="modalRedefinirSenha(${u.id}, '${u.nome}')">Senha</button>
                                    <button class="btn btn-sm ${u.ativo ? 'btn-danger' : 'btn-secondary'}" onclick="toggleAtivo(${u.id}, ${u.ativo})">
                                        ${u.ativo ? 'Desativar' : 'Ativar'}
                                    </button>
                                </div>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>`;
}

function formatDate(str) {
    if (!str) return '-';
    const [date] = str.split(' ');
    const [y, m, d] = date.split('-');
    return `${d}/${m}/${y}`;
}

function modalNovoUsuario() {
    const overlay = criarOverlay();
    overlay.innerHTML = `
    <div class="modal" style="max-width:420px">
        <div class="modal-header">
            <span class="modal-title">Novo Usuário</span>
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        <div class="modal-body">
            <div class="form-group">
                <label>Nome completo</label>
                <input type="text" id="nu-nome" autocomplete="off">
            </div>
            <div class="form-group">
                <label>E-mail / Login</label>
                <input type="text" id="nu-email" autocomplete="off">
            </div>
            <div class="form-group">
                <label>Perfil</label>
                <select id="nu-perfil">
                    <option value="operador">Operador</option>
                    <option value="admin">Administrador</option>
                </select>
            </div>
            <div class="form-group">
                <label>Senha inicial</label>
                <input type="password" id="nu-senha" autocomplete="new-password">
            </div>
            <div id="nu-erro" style="color:#ef4444;font-size:13px;min-height:18px"></div>
        </div>
        <div class="modal-footer">
            <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
            <button class="btn btn-primary" onclick="salvarNovoUsuario()">Criar Usuário</button>
        </div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#nu-nome').focus();
}

async function salvarNovoUsuario() {
    const nome = document.getElementById('nu-nome').value.trim();
    const email = document.getElementById('nu-email').value.trim();
    const perfil = document.getElementById('nu-perfil').value;
    const senha = document.getElementById('nu-senha').value;
    const erro = document.getElementById('nu-erro');

    if (!nome || !email || !senha) { erro.textContent = 'Preencha todos os campos'; return; }
    if (senha.length < 4) { erro.textContent = 'A senha deve ter pelo menos 4 caracteres'; return; }

    try {
        await api('POST', '/usuarios', { nome, email, perfil, senha });
        document.querySelector('.modal-overlay').remove();
        toast('Usuário criado com sucesso!', 'success');
        const content = document.getElementById('main-content');
        await renderUsuarios(content);
    } catch (e) {
        erro.textContent = e.message || 'Erro ao criar usuário';
    }
}

function modalEditarUsuario(u) {
    const overlay = criarOverlay();
    overlay.innerHTML = `
    <div class="modal" style="max-width:420px">
        <div class="modal-header">
            <span class="modal-title">Editar Usuário</span>
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        <div class="modal-body">
            <div class="form-group">
                <label>Nome completo</label>
                <input type="text" id="eu-nome" value="${u.nome}" autocomplete="off">
            </div>
            <div class="form-group">
                <label>E-mail / Login</label>
                <input type="text" id="eu-email" value="${u.email}" autocomplete="off">
            </div>
            <div class="form-group">
                <label>Perfil</label>
                <select id="eu-perfil">
                    <option value="operador" ${u.perfil === 'operador' ? 'selected' : ''}>Operador</option>
                    <option value="admin" ${u.perfil === 'admin' ? 'selected' : ''}>Administrador</option>
                </select>
            </div>
            <div id="eu-erro" style="color:#ef4444;font-size:13px;min-height:18px"></div>
        </div>
        <div class="modal-footer">
            <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
            <button class="btn btn-primary" onclick="salvarEdicaoUsuario(${u.id})">Salvar</button>
        </div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#eu-nome').focus();
}

async function salvarEdicaoUsuario(id) {
    const nome = document.getElementById('eu-nome').value.trim();
    const email = document.getElementById('eu-email').value.trim();
    const perfil = document.getElementById('eu-perfil').value;
    const erro = document.getElementById('eu-erro');

    if (!nome || !email) { erro.textContent = 'Nome e e-mail são obrigatórios'; return; }

    try {
        await api('PUT', `/usuarios/${id}`, { nome, email, perfil });
        document.querySelector('.modal-overlay').remove();
        toast('Usuário atualizado!', 'success');
        const content = document.getElementById('main-content');
        await renderUsuarios(content);
    } catch (e) {
        erro.textContent = e.message || 'Erro ao atualizar usuário';
    }
}

function modalRedefinirSenha(id, nome) {
    const overlay = criarOverlay();
    overlay.innerHTML = `
    <div class="modal" style="max-width:380px">
        <div class="modal-header">
            <span class="modal-title">Redefinir Senha</span>
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        <div class="modal-body">
            <p style="color:#64748b;font-size:13px;margin-bottom:16px">Definindo nova senha para <strong>${nome}</strong></p>
            <div class="form-group">
                <label>Nova senha</label>
                <input type="password" id="rs-senha" autocomplete="new-password">
            </div>
            <div id="rs-erro" style="color:#ef4444;font-size:13px;min-height:18px"></div>
        </div>
        <div class="modal-footer">
            <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
            <button class="btn btn-primary" onclick="salvarRedefinicaoSenha(${id})">Redefinir</button>
        </div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#rs-senha').focus();
}

async function salvarRedefinicaoSenha(id) {
    const senha = document.getElementById('rs-senha').value;
    const erro = document.getElementById('rs-erro');
    if (!senha || senha.length < 4) { erro.textContent = 'A senha deve ter pelo menos 4 caracteres'; return; }

    try {
        await api('PUT', `/usuarios/${id}/senha`, { senha });
        document.querySelector('.modal-overlay').remove();
        toast('Senha redefinida com sucesso!', 'success');
    } catch (e) {
        erro.textContent = e.message || 'Erro ao redefinir senha';
    }
}

async function toggleAtivo(id, ativoAtual) {
    const acao = ativoAtual ? 'desativar' : 'ativar';
    if (!confirm(`Deseja ${acao} este usuário?`)) return;
    try {
        await api('PUT', `/usuarios/${id}`, { ativo: !ativoAtual });
        toast(`Usuário ${ativoAtual ? 'desativado' : 'ativado'}!`, 'success');
        const content = document.getElementById('main-content');
        await renderUsuarios(content);
    } catch (e) {
        toast(e.message || 'Erro ao atualizar usuário', 'error');
    }
}

function criarOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px';
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    return overlay;
}
