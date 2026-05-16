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

// ─── Página para SUB-USUÁRIO ───────────────────────────────────────────────────
async function estoqueSubPage(el) {
    el.innerHTML = `
        <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap">
            <button class="btn btn-primary" onclick="estoqueSubSolicitarModal()">+ Solicitar Estoque</button>
        </div>
        <div style="display:flex;gap:16px;flex-wrap:wrap">
            <div style="flex:1;min-width:280px">
                <h3 style="font-size:15px;font-weight:600;margin-bottom:12px;color:#1e293b">Meu Estoque</h3>
                <div id="sub-estoque-lista">Carregando...</div>
            </div>
            <div style="flex:1;min-width:280px">
                <h3 style="font-size:15px;font-weight:600;margin-bottom:12px;color:#1e293b">Meus Pedidos</h3>
                <div id="sub-pedidos-lista">Carregando...</div>
            </div>
        </div>`;

    await Promise.all([carregarSubEstoque(), carregarSubPedidos()]);
}

async function carregarSubEstoque() {
    const el = document.getElementById('sub-estoque-lista');
    if (!el) return;
    try {
        const produtos = await api('GET', '/estoque');
        if (!produtos.length) {
            el.innerHTML = '<div style="color:#94a3b8;font-size:13px">Nenhum produto em estoque</div>';
            return;
        }
        el.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead><tr style="border-bottom:2px solid #e2e8f0">
                <th style="text-align:left;padding:8px 6px;color:#64748b;font-weight:600">Produto</th>
                <th style="text-align:right;padding:8px 6px;color:#64748b;font-weight:600">Qtd</th>
                <th style="text-align:left;padding:8px 6px;color:#64748b;font-weight:600">Unid.</th>
            </tr></thead>
            <tbody>${produtos.map(p => `
                <tr style="border-bottom:1px solid #f1f5f9">
                    <td style="padding:8px 6px;font-weight:500">${p.nome}</td>
                    <td style="padding:8px 6px;text-align:right;font-weight:700;color:${p.estoque === 0 ? '#ef4444' : '#1e293b'}">${p.estoque}</td>
                    <td style="padding:8px 6px;color:#64748b">${p.unidade || ''}</td>
                </tr>`).join('')}
            </tbody></table>`;
    } catch (e) {
        el.innerHTML = '<div style="color:#ef4444;font-size:13px">Erro ao carregar estoque</div>';
    }
}

async function carregarSubPedidos() {
    const el = document.getElementById('sub-pedidos-lista');
    if (!el) return;
    try {
        const r = await api('GET', '/estoque/pedidos');
        const pedidos = r.pedidos || [];
        if (!pedidos.length) {
            el.innerHTML = '<div style="color:#94a3b8;font-size:13px">Nenhum pedido realizado</div>';
            return;
        }
        const statusLabel = { pendente: 'Pendente', aprovado: 'Aprovado', rejeitado: 'Rejeitado' };
        const statusColor = { pendente: '#f59e0b', aprovado: '#10b981', rejeitado: '#ef4444' };
        el.innerHTML = pedidos.map(p => `
            <div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin-bottom:8px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                    <span style="font-weight:600;font-size:13px">${p.produto_nome}</span>
                    <span style="font-size:11px;font-weight:700;color:${statusColor[p.status]};background:${statusColor[p.status]}15;padding:2px 8px;border-radius:20px">${statusLabel[p.status] || p.status}</span>
                </div>
                <div style="font-size:12px;color:#64748b">Qtd: ${p.quantidade} ${p.unidade || ''} · ${fmtDt(p.criado_em)}</div>
                ${p.resposta ? `<div style="font-size:12px;color:#64748b;margin-top:4px">Resposta: ${p.resposta}</div>` : ''}
            </div>`).join('');
    } catch (e) {
        el.innerHTML = '<div style="color:#ef4444;font-size:13px">Erro ao carregar pedidos</div>';
    }
}

async function estoqueSubSolicitarModal() {
    let produtos = [];
    try { produtos = await api('GET', '/estoque'); } catch (_) {}

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999';
    overlay.innerHTML = `
        <div style="background:#fff;border-radius:16px;padding:28px;max-width:420px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,.3)">
            <div style="font-size:18px;font-weight:700;margin-bottom:18px">Solicitar Estoque</div>
            <div style="margin-bottom:14px">
                <label style="font-size:13px;font-weight:600;color:#374151;display:block;margin-bottom:6px">Produto</label>
                <select id="_se-produto" style="width:100%;border:1.5px solid #e2e8f0;border-radius:9px;padding:10px;font-size:14px;outline:none;box-sizing:border-box">
                    <option value="">Selecione...</option>
                    ${produtos.map(p => `<option value="${p.id}">${p.nome} (saldo: ${p.estoque} ${p.unidade || ''})</option>`).join('')}
                </select>
            </div>
            <div style="margin-bottom:14px">
                <label style="font-size:13px;font-weight:600;color:#374151;display:block;margin-bottom:6px">Quantidade</label>
                <input type="number" id="_se-qtd" min="1" value="1" style="width:100%;border:1.5px solid #e2e8f0;border-radius:9px;padding:10px;font-size:14px;outline:none;box-sizing:border-box">
            </div>
            <div style="margin-bottom:18px">
                <label style="font-size:13px;font-weight:600;color:#374151;display:block;margin-bottom:6px">Observação (opcional)</label>
                <input type="text" id="_se-obs" style="width:100%;border:1.5px solid #e2e8f0;border-radius:9px;padding:10px;font-size:14px;outline:none;box-sizing:border-box">
            </div>
            <div id="_se-erro" style="color:#ef4444;font-size:12px;margin-bottom:10px;min-height:16px"></div>
            <div style="display:flex;gap:10px">
                <button id="_se-cancel" style="flex:1;padding:10px;border:1.5px solid #e2e8f0;border-radius:9px;background:#f8fafc;cursor:pointer;font-size:13px">Cancelar</button>
                <button id="_se-ok" style="flex:1;padding:10px;border:none;border-radius:9px;background:#2563eb;color:#fff;cursor:pointer;font-size:13px;font-weight:600">Solicitar</button>
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
            showToast('Pedido enviado com sucesso!', 'success');
            await carregarSubPedidos();
        } catch (e) {
            err.textContent = e.message || 'Erro ao enviar pedido';
        }
    };
}

// ─── Página para PRINCIPAL ─────────────────────────────────────────────────────
async function estoquePrincipalPage(el) {
    el.innerHTML = `
        <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap">
            <button class="btn btn-primary" onclick="estoquePrincipalEnviarModal()">Enviar Estoque para Sub-usuário</button>
        </div>
        <div style="margin-bottom:24px">
            <h3 style="font-size:15px;font-weight:600;margin-bottom:12px;color:#1e293b">Pedidos Pendentes de Estoque</h3>
            <div id="principal-pedidos-lista">Carregando...</div>
        </div>`;

    await carregarPrincipalPedidos();
    await atualizarBadgeEstoque();
}

async function carregarPrincipalPedidos() {
    const el = document.getElementById('principal-pedidos-lista');
    if (!el) return;
    try {
        const r = await api('GET', '/estoque/pedidos');
        const pedidos = r.pedidos || [];
        if (!pedidos.length) {
            el.innerHTML = '<div style="color:#94a3b8;font-size:13px">Nenhum pedido</div>';
            return;
        }
        const statusColor = { pendente: '#f59e0b', aprovado: '#10b981', rejeitado: '#ef4444' };
        const statusLabel = { pendente: 'Pendente', aprovado: 'Aprovado', rejeitado: 'Rejeitado' };
        el.innerHTML = pedidos.map(p => `
            <div style="border:1px solid #e2e8f0;border-radius:10px;padding:14px;margin-bottom:8px;display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap">
                <div style="flex:1;min-width:180px">
                    <div style="font-weight:600;font-size:13px">${p.produto_nome}</div>
                    <div style="font-size:12px;color:#64748b;margin-top:2px">Solicitado por: ${p.solicitante_nome || '?'} · Qtd: ${p.quantidade} ${p.unidade || ''}</div>
                    <div style="font-size:12px;color:#94a3b8">${fmtDt(p.criado_em)}</div>
                    ${p.observacao ? `<div style="font-size:12px;color:#64748b;margin-top:4px">"${p.observacao}"</div>` : ''}
                </div>
                <div style="display:flex;gap:6px;align-items:center">
                    <span style="font-size:11px;font-weight:700;color:${statusColor[p.status]};background:${statusColor[p.status]}15;padding:2px 8px;border-radius:20px">${statusLabel[p.status] || p.status}</span>
                    ${p.status === 'pendente' ? `
                        <button onclick="estoquePrincipalAprovar(${p.id})" style="padding:5px 12px;border:none;border-radius:7px;background:#10b981;color:#fff;font-size:12px;font-weight:600;cursor:pointer">Aprovar</button>
                        <button onclick="estoquePrincipalRejeitar(${p.id})" style="padding:5px 12px;border:none;border-radius:7px;background:#ef4444;color:#fff;font-size:12px;font-weight:600;cursor:pointer">Rejeitar</button>
                    ` : ''}
                </div>
            </div>`).join('');
    } catch (e) {
        el.innerHTML = '<div style="color:#ef4444;font-size:13px">Erro ao carregar pedidos</div>';
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

async function estoquePrincipalEnviarModal() {
    let subs = [], produtos = [];
    try { [subs, produtos] = await Promise.all([api('GET', '/estoque/sub-usuarios'), api('GET', '/estoque')]); } catch (_) {}

    if (!subs.length) { showToast('Nenhum sub-usuário cadastrado', 'error'); return; }

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999';
    overlay.innerHTML = `
        <div style="background:#fff;border-radius:16px;padding:28px;max-width:420px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,.3)">
            <div style="font-size:18px;font-weight:700;margin-bottom:18px">Enviar Estoque</div>
            <div style="margin-bottom:14px">
                <label style="font-size:13px;font-weight:600;color:#374151;display:block;margin-bottom:6px">Sub-usuário</label>
                <select id="_ee-sub" style="width:100%;border:1.5px solid #e2e8f0;border-radius:9px;padding:10px;font-size:14px;outline:none;box-sizing:border-box">
                    <option value="">Selecione...</option>
                    ${subs.map(s => `<option value="${s.id}">${s.nome}</option>`).join('')}
                </select>
            </div>
            <div style="margin-bottom:14px">
                <label style="font-size:13px;font-weight:600;color:#374151;display:block;margin-bottom:6px">Produto</label>
                <select id="_ee-prod" style="width:100%;border:1.5px solid #e2e8f0;border-radius:9px;padding:10px;font-size:14px;outline:none;box-sizing:border-box">
                    <option value="">Selecione...</option>
                    ${produtos.map(p => `<option value="${p.id}">${p.nome} (estoque: ${p.estoque} ${p.unidade || ''})</option>`).join('')}
                </select>
            </div>
            <div style="margin-bottom:18px">
                <label style="font-size:13px;font-weight:600;color:#374151;display:block;margin-bottom:6px">Quantidade</label>
                <input type="number" id="_ee-qtd" min="1" value="1" style="width:100%;border:1.5px solid #e2e8f0;border-radius:9px;padding:10px;font-size:14px;outline:none;box-sizing:border-box">
            </div>
            <div id="_ee-erro" style="color:#ef4444;font-size:12px;margin-bottom:10px;min-height:16px"></div>
            <div style="display:flex;gap:10px">
                <button id="_ee-cancel" style="flex:1;padding:10px;border:1.5px solid #e2e8f0;border-radius:9px;background:#f8fafc;cursor:pointer;font-size:13px">Cancelar</button>
                <button id="_ee-ok" style="flex:1;padding:10px;border:none;border-radius:9px;background:#2563eb;color:#fff;cursor:pointer;font-size:13px;font-weight:600">Enviar</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('#_ee-cancel').onclick = () => overlay.remove();
    overlay.querySelector('#_ee-ok').onclick = async () => {
        const sub_usuario_id = overlay.querySelector('#_ee-sub').value;
        const produto_id = overlay.querySelector('#_ee-prod').value;
        const quantidade = parseInt(overlay.querySelector('#_ee-qtd').value);
        const err = overlay.querySelector('#_ee-erro');
        if (!sub_usuario_id) { err.textContent = 'Selecione o sub-usuário'; return; }
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

// Badge sidebar para principal (pedidos pendentes)
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
