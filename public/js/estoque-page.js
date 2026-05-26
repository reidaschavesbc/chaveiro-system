// Página de Estoque (sub-usuários e principal)
async function estoquePage(el) {
    const user = getUser();
    const isPrincipal = user && user.principal;
    if (isPrincipal) {
        await estoquePrincipalPage(el);
    } else {
        await estoqueSubPage(el);
    }
}

// ─── SUB-USUÁRIO ──────────────────────────────────────────────────────────────
async function estoqueSubPage(el) {
    el.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:20px">
            <div id="sub-estoque-stats" style="display:flex;gap:12px;flex-wrap:wrap"></div>
            <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">
                <div style="flex:2;min-width:280px">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
                        <h3 style="font-size:15px;font-weight:700;color:#1e293b;margin:0">Meu Estoque</h3>
                        <input id="sub-estoque-busca" type="text" placeholder="Buscar produto..." oninput="estoqueSubFiltrar()"
                            style="border:1.5px solid #e2e8f0;border-radius:8px;padding:6px 12px;font-size:12px;outline:none;width:160px">
                    </div>
                    <div id="sub-estoque-lista">
                        <div class="empty-state"><p>Carregando...</p></div>
                    </div>
                </div>
                <div style="flex:1;min-width:260px">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
                        <h3 style="font-size:15px;font-weight:700;color:#1e293b;margin:0">Meus Pedidos</h3>
                        <button class="btn btn-primary" onclick="estoqueSubSolicitarModal()" style="font-size:12px;padding:6px 14px">+ Solicitar</button>
                    </div>
                    <div id="sub-pedidos-lista">
                        <div class="empty-state"><p>Carregando...</p></div>
                    </div>
                </div>
            </div>
        </div>`;

    await Promise.all([carregarSubEstoque(), carregarSubPedidos()]);
}

let _subEstoqueProdutos = [];

async function carregarSubEstoque() {
    const el = document.getElementById('sub-estoque-lista');
    const statsEl = document.getElementById('sub-estoque-stats');
    if (!el) return;
    try {
        _subEstoqueProdutos = await api('GET', '/estoque');
        const total = _subEstoqueProdutos.length;
        const zerados = _subEstoqueProdutos.filter(p => p.estoque === 0).length;
        const baixo = _subEstoqueProdutos.filter(p => p.estoque > 0 && p.estoque <= 5).length;

        if (statsEl) {
            statsEl.innerHTML = `
                ${_estatCard('📦', 'Total de Produtos', total, '#2563eb')}
                ${_estatCard('⚠️', 'Estoque Baixo', baixo, '#f59e0b')}
                ${_estatCard('🚫', 'Zerados', zerados, '#ef4444')}`;
        }

        estoqueSubFiltrar();
    } catch (e) {
        el.innerHTML = '<div style="color:#ef4444;font-size:13px;padding:12px">Erro ao carregar estoque</div>';
    }
}

function estoqueSubFiltrar() {
    const el = document.getElementById('sub-estoque-lista');
    if (!el) return;
    const busca = (document.getElementById('sub-estoque-busca')?.value || '').toLowerCase();
    const lista = busca ? _subEstoqueProdutos.filter(p => p.nome.toLowerCase().includes(busca)) : _subEstoqueProdutos;

    if (!lista.length) {
        el.innerHTML = '<div style="color:#94a3b8;font-size:13px;padding:12px;text-align:center">Nenhum produto encontrado</div>';
        return;
    }

    el.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px">
        ${lista.map(p => {
            const nivel = p.estoque === 0 ? 'zero' : p.estoque <= 5 ? 'baixo' : 'ok';
            const cores = { zero: { bg: '#fef2f2', border: '#fecaca', txt: '#ef4444', badge: '#ef4444' }, baixo: { bg: '#fffbeb', border: '#fde68a', txt: '#d97706', badge: '#f59e0b' }, ok: { bg: '#f0fdf4', border: '#bbf7d0', txt: '#16a34a', badge: '#10b981' } };
            const c = cores[nivel];
            return `<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border:1.5px solid ${c.border};border-radius:10px;background:${c.bg}">
                <div style="flex:1;min-width:0">
                    <div style="font-weight:600;font-size:13px;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.nome}</div>
                    ${p.categoria ? `<div style="font-size:11px;color:#94a3b8;margin-top:1px">${p.categoria}</div>` : ''}
                </div>
                <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
                    <span style="font-size:20px;font-weight:800;color:${c.txt}">${p.estoque}</span>
                    <span style="font-size:11px;color:#94a3b8">${p.unidade || 'un'}</span>
                    <span style="font-size:10px;font-weight:700;background:${c.badge};color:#fff;padding:2px 7px;border-radius:20px">${nivel === 'ok' ? 'OK' : nivel === 'baixo' ? 'BAIXO' : 'ZERO'}</span>
                </div>
            </div>`;
        }).join('')}
    </div>`;
}

async function carregarSubPedidos() {
    const el = document.getElementById('sub-pedidos-lista');
    if (!el) return;
    try {
        const r = await api('GET', '/estoque/pedidos');
        const pedidos = r.pedidos || [];
        if (!pedidos.length) {
            el.innerHTML = '<div style="color:#94a3b8;font-size:13px;padding:12px;text-align:center">Nenhum pedido realizado</div>';
            return;
        }
        const statusLabel = { pendente: 'Aguardando', aprovado: 'Aprovado', rejeitado: 'Rejeitado' };
        const statusIcon = { pendente: '⏳', aprovado: '✅', rejeitado: '❌' };
        const statusColor = { pendente: '#f59e0b', aprovado: '#10b981', rejeitado: '#ef4444' };
        el.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px">
            ${pedidos.map(p => `
                <div style="border:1.5px solid #e2e8f0;border-radius:12px;padding:12px 14px;background:#fff">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
                        <div style="font-weight:600;font-size:13px;color:#1e293b;flex:1">${p.produto_nome}</div>
                        <span style="font-size:11px;font-weight:700;color:${statusColor[p.status]};background:${statusColor[p.status]}18;padding:2px 9px;border-radius:20px;white-space:nowrap;flex-shrink:0">${statusIcon[p.status]} ${statusLabel[p.status] || p.status}</span>
                    </div>
                    <div style="font-size:11px;color:#94a3b8;margin-top:5px">${p.quantidade} ${p.unidade || 'un'} · ${fmtDt(p.criado_em)}</div>
                    ${p.resposta ? `<div style="font-size:11px;color:#64748b;margin-top:5px;padding:5px 8px;background:#f8fafc;border-radius:6px;border-left:3px solid #e2e8f0">${p.resposta}</div>` : ''}
                </div>`).join('')}
        </div>`;
    } catch (e) {
        el.innerHTML = '<div style="color:#ef4444;font-size:13px;padding:12px">Erro ao carregar pedidos</div>';
    }
}

async function estoqueSubSolicitarModal() {
    let produtos = [];
    try { produtos = await api('GET', '/estoque'); } catch (_) {}

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999';
    overlay.innerHTML = `
        <div style="background:#fff;border-radius:16px;padding:28px;max-width:420px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,.3)">
            <div style="font-size:18px;font-weight:700;margin-bottom:4px;color:#1e293b">Solicitar Estoque</div>
            <div style="font-size:13px;color:#94a3b8;margin-bottom:20px">O responsável receberá sua solicitação para aprovação.</div>
            <div style="margin-bottom:14px">
                <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:6px">Produto</label>
                <select id="_se-produto" style="width:100%;border:1.5px solid #e2e8f0;border-radius:9px;padding:10px;font-size:14px;outline:none;box-sizing:border-box;background:#fff">
                    <option value="">Selecione o produto...</option>
                    ${produtos.map(p => `<option value="${p.id}">${p.nome} (saldo: ${p.estoque} ${p.unidade || ''})</option>`).join('')}
                </select>
            </div>
            <div style="margin-bottom:14px">
                <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:6px">Quantidade</label>
                <input type="number" id="_se-qtd" min="1" value="1" style="width:100%;border:1.5px solid #e2e8f0;border-radius:9px;padding:10px;font-size:14px;outline:none;box-sizing:border-box">
            </div>
            <div style="margin-bottom:20px">
                <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:6px">Observação <span style="font-weight:400;color:#94a3b8">(opcional)</span></label>
                <input type="text" id="_se-obs" placeholder="Ex: urgente, para atendimento X..." style="width:100%;border:1.5px solid #e2e8f0;border-radius:9px;padding:10px;font-size:14px;outline:none;box-sizing:border-box">
            </div>
            <div id="_se-erro" style="color:#ef4444;font-size:12px;margin-bottom:10px;min-height:16px"></div>
            <div style="display:flex;gap:10px">
                <button id="_se-cancel" style="flex:1;padding:11px;border:1.5px solid #e2e8f0;border-radius:9px;background:#f8fafc;cursor:pointer;font-size:13px;font-weight:500">Cancelar</button>
                <button id="_se-ok" style="flex:1;padding:11px;border:none;border-radius:9px;background:#2563eb;color:#fff;cursor:pointer;font-size:13px;font-weight:600">Enviar Solicitação</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('#_se-cancel').onclick = () => overlay.remove();
    overlay.querySelector('#_se-ok').onclick = async () => {
        const produto_id = overlay.querySelector('#_se-produto').value;
        const quantidade = parseInt(overlay.querySelector('#_se-qtd').value);
        const observacao = overlay.querySelector('#_se-obs').value.trim();
        const err = overlay.querySelector('#_se-erro');
        if (!produto_id) { err.textContent = 'Selecione um produto'; return; }
        if (!quantidade || quantidade <= 0) { err.textContent = 'Quantidade inválida'; return; }
        try {
            await api('POST', '/estoque/pedido', { produto_id, quantidade, observacao: observacao || undefined });
            overlay.remove();
            showToast('Pedido enviado!', 'success');
            await carregarSubPedidos();
        } catch (e) {
            err.textContent = e.message || 'Erro ao enviar pedido';
        }
    };
}

// ─── PRINCIPAL ────────────────────────────────────────────────────────────────
async function estoquePrincipalPage(el) {
    el.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:20px">
            <div id="principal-estoque-stats" style="display:flex;gap:12px;flex-wrap:wrap"></div>
            <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">
                <div style="flex:1;min-width:300px">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
                        <h3 style="font-size:15px;font-weight:700;color:#1e293b;margin:0">Pedidos de Estoque</h3>
                        <div style="display:flex;gap:8px">
                            <select id="filtro-status-pedido" onchange="carregarPrincipalPedidos()" style="border:1.5px solid #e2e8f0;border-radius:8px;padding:5px 10px;font-size:12px;outline:none;background:#fff">
                                <option value="">Todos</option>
                                <option value="pendente" selected>Pendentes</option>
                                <option value="aprovado">Aprovados</option>
                                <option value="rejeitado">Rejeitados</option>
                            </select>
                            <button class="btn btn-primary" onclick="estoquePrincipalEnviarModal()" style="font-size:12px;padding:6px 14px">Enviar Estoque</button>
                        </div>
                    </div>
                    <div id="principal-pedidos-lista">
                        <div class="empty-state"><p>Carregando...</p></div>
                    </div>
                </div>
            </div>
        </div>`;

    await carregarPrincipalPedidos();
    await atualizarBadgeEstoque();
}

async function carregarPrincipalPedidos() {
    const el = document.getElementById('principal-pedidos-lista');
    const statsEl = document.getElementById('principal-estoque-stats');
    if (!el) return;
    try {
        const r = await api('GET', '/estoque/pedidos');
        const todosPedidos = r.pedidos || [];
        const filtro = document.getElementById('filtro-status-pedido')?.value || '';
        const pedidos = filtro ? todosPedidos.filter(p => p.status === filtro) : todosPedidos;

        const pendentes = todosPedidos.filter(p => p.status === 'pendente').length;
        const aprovados = todosPedidos.filter(p => p.status === 'aprovado').length;
        const rejeitados = todosPedidos.filter(p => p.status === 'rejeitado').length;

        if (statsEl) {
            statsEl.innerHTML = `
                ${_estatCard('⏳', 'Pendentes', pendentes, '#f59e0b')}
                ${_estatCard('✅', 'Aprovados', aprovados, '#10b981')}
                ${_estatCard('❌', 'Rejeitados', rejeitados, '#ef4444')}`;
        }

        if (!pedidos.length) {
            el.innerHTML = '<div style="color:#94a3b8;font-size:13px;padding:20px;text-align:center">Nenhum pedido encontrado</div>';
            return;
        }

        const statusColor = { pendente: '#f59e0b', aprovado: '#10b981', rejeitado: '#ef4444' };
        const statusLabel = { pendente: '⏳ Aguardando', aprovado: '✅ Aprovado', rejeitado: '❌ Rejeitado' };

        el.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px">
            ${pedidos.map(p => `
                <div style="border:1.5px solid ${p.status === 'pendente' ? '#fde68a' : '#e2e8f0'};border-radius:12px;padding:14px 16px;background:${p.status === 'pendente' ? '#fffbeb' : '#fff'}">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">
                        <div style="flex:1;min-width:160px">
                            <div style="font-weight:700;font-size:14px;color:#1e293b">${p.produto_nome}</div>
                            <div style="font-size:12px;color:#64748b;margin-top:3px">
                                <strong>${p.solicitante_nome || '?'}</strong> · ${p.quantidade} ${p.unidade || 'un'} · ${fmtDt(p.criado_em)}
                            </div>
                            ${p.observacao ? `<div style="font-size:11px;color:#64748b;margin-top:6px;padding:5px 8px;background:#fff;border-radius:6px;border-left:3px solid #fde68a">"${p.observacao}"</div>` : ''}
                            ${p.resposta ? `<div style="font-size:11px;color:#64748b;margin-top:6px;padding:5px 8px;background:#f8fafc;border-radius:6px;border-left:3px solid #e2e8f0">Resposta: ${p.resposta}</div>` : ''}
                        </div>
                        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0">
                            <span style="font-size:11px;font-weight:700;color:${statusColor[p.status]};background:${statusColor[p.status]}18;padding:3px 10px;border-radius:20px">${statusLabel[p.status] || p.status}</span>
                            ${p.status === 'pendente' ? `
                                <div style="display:flex;gap:6px">
                                    <button onclick="estoquePrincipalAprovar(${p.id})" style="padding:5px 14px;border:none;border-radius:7px;background:#10b981;color:#fff;font-size:12px;font-weight:600;cursor:pointer">Aprovar</button>
                                    <button onclick="estoquePrincipalRejeitar(${p.id})" style="padding:5px 14px;border:none;border-radius:7px;background:#ef4444;color:#fff;font-size:12px;font-weight:600;cursor:pointer">Rejeitar</button>
                                </div>` : ''}
                        </div>
                    </div>
                </div>`).join('')}
        </div>`;
    } catch (e) {
        el.innerHTML = '<div style="color:#ef4444;font-size:13px;padding:12px">Erro ao carregar pedidos</div>';
    }
}

async function estoquePrincipalAprovar(pedidoId) {
    const ok = await _confirmarEstoque('Aprovar pedido', 'Confirma a aprovação deste pedido de estoque?', 'Aprovar', '#10b981');
    if (!ok) return;
    try {
        await api('PUT', `/estoque/pedidos/${pedidoId}/aprovar`);
        showToast('Pedido aprovado!', 'success');
        await carregarPrincipalPedidos();
        await atualizarBadgeEstoque();
    } catch (e) {
        showToast(e.message || 'Erro ao aprovar', 'error');
    }
}

async function estoquePrincipalRejeitar(pedidoId) {
    const resposta = await modalInput('Rejeitar pedido', 'Informe o motivo da rejeição (opcional):');
    if (resposta === null) return;
    try {
        await api('PUT', `/estoque/pedidos/${pedidoId}/rejeitar`, { resposta: resposta.trim() || undefined });
        showToast('Pedido rejeitado', 'success');
        await carregarPrincipalPedidos();
        await atualizarBadgeEstoque();
    } catch (e) {
        showToast(e.message || 'Erro ao rejeitar', 'error');
    }
}

async function estoquePrincipalEnviarModal() {
    let subs = [], produtos = [];
    try { [subs, produtos] = await Promise.all([api('GET', '/estoque/sub-usuarios'), api('GET', '/estoque')]); } catch (_) {}
    if (!subs.length) { showToast('Nenhum sub-usuário cadastrado', 'error'); return; }

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999';
    overlay.innerHTML = `
        <div style="background:#fff;border-radius:16px;padding:28px;max-width:420px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,.3)">
            <div style="font-size:18px;font-weight:700;margin-bottom:4px;color:#1e293b">Enviar Estoque</div>
            <div style="font-size:13px;color:#94a3b8;margin-bottom:20px">Transferir produtos para um ponto de venda.</div>
            <div style="margin-bottom:14px">
                <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:6px">Destino</label>
                <select id="_ee-sub" style="width:100%;border:1.5px solid #e2e8f0;border-radius:9px;padding:10px;font-size:14px;outline:none;box-sizing:border-box;background:#fff">
                    <option value="">Selecione o ponto...</option>
                    ${subs.map(s => `<option value="${s.id}">${s.nome}</option>`).join('')}
                </select>
            </div>
            <div style="margin-bottom:14px">
                <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:6px">Produto</label>
                <select id="_ee-prod" style="width:100%;border:1.5px solid #e2e8f0;border-radius:9px;padding:10px;font-size:14px;outline:none;box-sizing:border-box;background:#fff">
                    <option value="">Selecione o produto...</option>
                    ${produtos.map(p => `<option value="${p.id}">${p.nome} (estoque: ${p.estoque} ${p.unidade || ''})</option>`).join('')}
                </select>
            </div>
            <div style="margin-bottom:20px">
                <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:6px">Quantidade</label>
                <input type="number" id="_ee-qtd" min="1" value="1" style="width:100%;border:1.5px solid #e2e8f0;border-radius:9px;padding:10px;font-size:14px;outline:none;box-sizing:border-box">
            </div>
            <div id="_ee-erro" style="color:#ef4444;font-size:12px;margin-bottom:10px;min-height:16px"></div>
            <div style="display:flex;gap:10px">
                <button id="_ee-cancel" style="flex:1;padding:11px;border:1.5px solid #e2e8f0;border-radius:9px;background:#f8fafc;cursor:pointer;font-size:13px;font-weight:500">Cancelar</button>
                <button id="_ee-ok" style="flex:1;padding:11px;border:none;border-radius:9px;background:#2563eb;color:#fff;cursor:pointer;font-size:13px;font-weight:600">Enviar</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('#_ee-cancel').onclick = () => overlay.remove();
    overlay.querySelector('#_ee-ok').onclick = async () => {
        const sub_usuario_id = overlay.querySelector('#_ee-sub').value;
        const produto_id = overlay.querySelector('#_ee-prod').value;
        const quantidade = parseInt(overlay.querySelector('#_ee-qtd').value);
        const err = overlay.querySelector('#_ee-erro');
        if (!sub_usuario_id) { err.textContent = 'Selecione o destino'; return; }
        if (!produto_id) { err.textContent = 'Selecione o produto'; return; }
        if (!quantidade || quantidade <= 0) { err.textContent = 'Quantidade inválida'; return; }
        try {
            await api('POST', '/estoque/enviar', { sub_usuario_id, produto_id, quantidade });
            overlay.remove();
            showToast('Estoque enviado com sucesso!', 'success');
        } catch (e) {
            err.textContent = e.message || 'Erro ao enviar';
        }
    };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function _estatCard(icon, label, value, color) {
    return `<div style="flex:1;min-width:120px;background:#fff;border:1.5px solid #e2e8f0;border-radius:12px;padding:14px 16px;display:flex;align-items:center;gap:12px">
        <div style="width:38px;height:38px;border-radius:10px;background:${color}18;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">${icon}</div>
        <div>
            <div style="font-size:22px;font-weight:800;color:${color};line-height:1">${value}</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px">${label}</div>
        </div>
    </div>`;
}

function _confirmarEstoque(titulo, mensagem, btnLabel, btnColor) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999';
        overlay.innerHTML = `
            <div style="background:#fff;border-radius:16px;padding:28px 32px;max-width:380px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,.3)">
                <div style="font-size:17px;font-weight:700;margin-bottom:8px;color:#1e293b">${titulo}</div>
                <div style="font-size:13px;color:#64748b;margin-bottom:24px">${mensagem}</div>
                <div style="display:flex;gap:10px">
                    <button id="_mc-cancel" style="flex:1;padding:10px;border:1.5px solid #e2e8f0;border-radius:9px;background:#f8fafc;cursor:pointer;font-size:13px;font-weight:500">Cancelar</button>
                    <button id="_mc-ok" style="flex:1;padding:10px;border:none;border-radius:9px;background:${btnColor||'#2563eb'};color:#fff;cursor:pointer;font-size:13px;font-weight:600">${btnLabel||'Confirmar'}</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#_mc-cancel').onclick = () => { overlay.remove(); resolve(false); };
        overlay.querySelector('#_mc-ok').onclick = () => { overlay.remove(); resolve(true); };
    });
}

function modalInput(titulo, mensagem) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999';
        overlay.innerHTML = `
            <div style="background:#fff;border-radius:16px;padding:28px 32px;max-width:380px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,.3)">
                <div style="font-size:17px;font-weight:700;margin-bottom:8px;color:#1e293b">${titulo}</div>
                <div style="font-size:13px;color:#64748b;margin-bottom:14px">${mensagem}</div>
                <input id="_mi-input" type="text" style="width:100%;border:1.5px solid #e2e8f0;border-radius:9px;padding:10px 13px;font-size:14px;outline:none;box-sizing:border-box;margin-bottom:18px">
                <div style="display:flex;gap:10px">
                    <button id="_mi-cancel" style="flex:1;padding:10px;border:1.5px solid #e2e8f0;border-radius:9px;background:#f8fafc;cursor:pointer;font-size:13px;font-weight:500">Cancelar</button>
                    <button id="_mi-ok" style="flex:1;padding:10px;border:none;border-radius:9px;background:#ef4444;color:#fff;cursor:pointer;font-size:13px;font-weight:600">Rejeitar</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        const inp = overlay.querySelector('#_mi-input');
        inp.focus();
        overlay.querySelector('#_mi-cancel').onclick = () => { overlay.remove(); resolve(null); };
        overlay.querySelector('#_mi-ok').onclick = () => { overlay.remove(); resolve(inp.value); };
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { overlay.remove(); resolve(inp.value); } });
    });
}

async function atualizarBadgeEstoque() {
    const badge = document.getElementById('badge-estoque');
    if (!badge) return;
    const user = getUser();
    if (!user || !user.principal) { badge.style.display = 'none'; return; }
    try {
        const r = await api('GET', '/estoque/pedidos');
        const n = r.pendentes || 0;
        if (n > 0) {
            badge.textContent = n;
            badge.style.display = 'inline-flex';
        } else {
            badge.style.display = 'none';
        }
    } catch (_) {
        badge.style.display = 'none';
    }
}

function fmtDt(dt) {
    if (!dt) return '';
    const s = String(dt).slice(0, 16);
    const [d, h] = s.split(' ');
    const [y, m, dd] = d.split('-');
    return `${dd}/${m}/${y}${h ? ' ' + h : ''}`;
}
