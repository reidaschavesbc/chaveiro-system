require('dotenv').config();
if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET não configurado no .env');
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const wa = require('./services/whatsapp');
const { fmtVal, fmtDate, fmtDH, fmtAddr } = require('./utils/formatters');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS — permite apenas origens sem Origin (mobile/curl/same-origin) + localhost dev
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true); // mobile app / curl / same-origin
        if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
        if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return callback(null, true);
        callback(null, false);
    }
}));

// Rate limiting simples em memória para endpoints de autenticação
const _loginAttempts = new Map();
function loginRateLimit(req, res, next) {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = _loginAttempts.get(ip) || { count: 0, resetAt: now + 15 * 60 * 1000 };
    if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + 15 * 60 * 1000; }
    entry.count++;
    _loginAttempts.set(ip, entry);
    if (entry.count > 20) return res.status(429).json({ error: 'Muitas tentativas. Aguarde 15 minutos.' });
    next();
}
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (/\.(js|css|html)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-store');
    }
  }
}));

const auth = require('./middleware/auth');
const bcrypt = require('bcryptjs');

// Verifica senha do gerente com suporte a bcrypt e texto plano legado
function verificarSenhaGerente(senha, hash) {
    if (!hash) return true;
    if (hash.startsWith('$2')) return bcrypt.compareSync(senha, hash);
    return senha === hash; // compatibilidade com senhas antigas em texto plano
}

// Download do app Electron (público)
app.get('/download', (req, res) => {
  const localFile = path.join(__dirname, 'public/downloads/SistemaChaveiro-Setup.exe');
  const fs = require('fs');
  if (fs.existsSync(localFile)) {
    res.download(localFile, 'SistemaChaveiro-Setup.exe');
  } else {
    res.redirect(302, 'https://github.com/reidaschavesbc/chaveiro-system/releases/latest/download/SistemaChaveiro-Setup.exe');
  }
});

// Download do app Android
app.get('/download-app', (req, res) => {
  const versionFile = path.join(__dirname, 'public/downloads/version-apk.json');
  const version = fs.existsSync(versionFile) ? JSON.parse(fs.readFileSync(versionFile, 'utf8')).version : 'latest';
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.download(path.join(__dirname, 'public/downloads/ChaveiroOS.apk'), `ChaveiroOS-${version}.apk`);
});

app.get('/api/version', (req, res) => {
  const { version } = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
  res.json({ version });
});

app.get('/api/apk-version', (req, res) => {
  const versionFile = path.join(__dirname, 'public/downloads/version-apk.json');
  if (fs.existsSync(versionFile)) {
    res.json(JSON.parse(fs.readFileSync(versionFile, 'utf8')));
  } else {
    res.json({ version: '1.0.0' });
  }
});

// Public routes — rate limiting aplicado ANTES dos routers nos endpoints de login
app.use('/api/auth/login', loginRateLimit);
app.use('/api/auth/admin-login', loginRateLimit);
app.use('/api/app/login', loginRateLimit);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/app', require('./routes/app-mobile').router);

// Protected routes
app.use('/api/clientes', auth, require('./routes/clientes'));
app.use('/api/produtos', auth, require('./routes/produtos'));
app.use('/api/servicos', auth, require('./routes/servicos'));
app.use('/api/ordens', auth, require('./routes/ordens'));
app.use('/api/vendas', auth, require('./routes/vendas'));
app.use('/api/vendedores', auth, require('./routes/vendedores'));
app.use('/api/relatorios', auth, require('./routes/relatorios'));
app.use('/api/pdf', auth, require('./routes/pdf').router);
app.use('/api/orcamentos', auth, require('./routes/orcamentos'));
app.use('/api/whatsapp', auth, require('./routes/whatsapp'));
app.use('/api/assistente', auth, require('./routes/assistente'));
app.use('/api/comissoes', auth, require('./routes/comissoes').router);
app.use('/api/gastos', auth, require('./routes/gastos'));
app.use('/api/lembretes', auth, require('./routes/lembretes'));
app.use('/api/pedidos', auth, require('./routes/pedidos').router);
app.use('/api/consumo', auth, require('./routes/consumo'));
app.use('/api/vales', auth, require('./routes/vales'));
app.use('/api/usuarios', auth, require('./routes/usuarios'));
app.use('/api/lojas', auth, require('./routes/lojas'));
app.use('/api/estoque', auth, require('./routes/estoque').router);
app.use('/api/nfse', auth, require('./routes/nfse'));
app.use('/api/afiacao', auth, require('./routes/afiacao'));

// Config endpoint
const db = require('./database/db');
app.get('/api/config', auth, (req, res) => {
    const rows = db.prepare('SELECT chave, valor FROM configuracoes').all();
    const cfg = {};
    rows.forEach(r => cfg[r.chave] = r.valor);
    cfg.senha_exclusao_configurada = !!cfg.senha_gerente; // legado — aponta para senha_gerente
    delete cfg.senha_exclusao;
    cfg.senha_gerente_configurada = !!cfg.senha_gerente;
    delete cfg.senha_gerente;
    res.json(cfg);
});
app.put('/api/config', auth, (req, res) => {
    // impede sobrescrever senhas protegidas por esta rota genérica
    const { senha_exclusao, senha_gerente, ...resto } = req.body;
    const stmt = db.prepare('INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES (?, ?)');
    Object.entries(resto).forEach(([k, v]) => stmt.run(k, v));
    res.json({ ok: true });
});
// POST /api/auth/verificar-gerente — verifica senha do gerente (para o assistente e salário)
app.post('/api/auth/verificar-gerente', auth, (req, res) => {
    const { senha } = req.body;
    const cfg = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'senha_gerente'").get();
    if (!cfg || !cfg.valor) return res.json({ ok: true }); // sem senha configurada = livre
    res.json({ ok: verificarSenhaGerente(senha, cfg.valor) });
});

app.put('/api/config/senha-gerente', auth, (req, res) => {
    const { senha_atual, senha_nova } = req.body;
    if (!senha_nova) return res.status(400).json({ error: 'Nova senha é obrigatória' });
    if (senha_nova.length < 4) return res.status(400).json({ error: 'A senha deve ter pelo menos 4 caracteres' });
    const cfg = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'senha_gerente'").get();
    const jaConfigurada = cfg && cfg.valor;
    if (jaConfigurada) {
        if (!senha_atual) return res.status(400).json({ error: 'Senha atual é obrigatória' });
        if (!verificarSenhaGerente(senha_atual, cfg.valor)) return res.status(422).json({ error: 'Senha atual incorreta' });
    }
    db.prepare('INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES (?, ?)').run('senha_gerente', bcrypt.hashSync(senha_nova, 10));
    res.json({ ok: true });
});

app.put('/api/config/senha-exclusao', auth, (req, res) => {
    // Rota legada — redireciona para senha_gerente
    const { senha_atual, senha_nova } = req.body;
    if (!senha_nova) return res.status(400).json({ error: 'Nova senha é obrigatória' });
    const cfg = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'senha_gerente'").get();
    if (cfg && cfg.valor && !verificarSenhaGerente(senha_atual, cfg.valor)) return res.status(422).json({ error: 'Senha atual incorreta' });
    db.prepare('INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES (?, ?)').run('senha_gerente', bcrypt.hashSync(senha_nova, 10));
    res.json({ ok: true });
});

// ─── Imports de rotas usadas nos crons ───────────────────────────────────────
const { enviarResumoDiario, enviarAvisoPedido } = require('./routes/pedidos');
const { executarFechamento, montarMensagemWhatsapp, MESES } = require('./routes/comissoes');

// Alta prioridade: lembrete a cada 1h para não confirmados e não silenciados
cron.schedule('0 * * * *', async () => {
    try {
        const pedidos = db.prepare(`
            SELECT * FROM pedidos_compra
            WHERE status = 'pendente' AND confirmado = 0 AND prioridade = 'alta'
              AND (silenciado_ate IS NULL OR datetime(silenciado_ate) <= datetime('now','localtime'))
              AND (ultimo_aviso IS NULL OR datetime(ultimo_aviso) <= datetime('now','localtime','-1 hours'))
        `).all();
        for (const p of pedidos) await enviarAvisoPedido(p, 'lembrete');
    } catch (e) { console.error('Cron pedidos alta:', e.message); }
});

// Média prioridade: lembrete a cada 3h para não confirmados e não silenciados
cron.schedule('0 */3 * * *', async () => {
    try {
        const pedidos = db.prepare(`
            SELECT * FROM pedidos_compra
            WHERE status = 'pendente' AND confirmado = 0 AND prioridade = 'media'
              AND (silenciado_ate IS NULL OR datetime(silenciado_ate) <= datetime('now','localtime'))
              AND (ultimo_aviso IS NULL OR datetime(ultimo_aviso) <= datetime('now','localtime','-3 hours'))
        `).all();
        for (const p of pedidos) await enviarAvisoPedido(p, 'lembrete');
    } catch (e) { console.error('Cron pedidos media:', e.message); }
});

// Diário às 9h: resumo geral de todos não confirmados + baixa prioridade
cron.schedule('0 9 * * *', async () => {
    try { await enviarResumoDiario(); }
    catch (e) { console.error('Cron resumo diário:', e.message); }
});

// ─── Cron: aviso de cobranças A Receber — a cada hora das 08h às 20h
cron.schedule('0 8-20 * * *', async () => {
    try {
        const hoje = new Date();
        const pad = n => String(n).padStart(2, '0');
        const hojeStr = `${hoje.getFullYear()}-${pad(hoje.getMonth()+1)}-${pad(hoje.getDate())}`;

        const pendentes = db.prepare(`
            SELECT os.numero, os.valor, os.valor_pago, os.data_vencimento,
                   COALESCE(c.nome, os.cliente_nome_avulso, '????') as cliente_nome,
                   l.nome as loja_nome
            FROM ordens_servico os
            LEFT JOIN clientes c ON os.cliente_id = c.id
            LEFT JOIN lojas l ON os.loja_id = l.id
            WHERE os.a_receber = 1
              AND os.a_receber_pago = 0
              AND (os.cobranca_pausado_em IS NULL OR os.cobranca_pausado_em != ?)
              AND (os.data_vencimento IS NULL OR os.data_vencimento <= ?)
            ORDER BY os.loja_id, os.data_vencimento ASC
        `).all(hojeStr, hojeStr + ' 23:59:59');

        if (!pendentes.length) return;

        const cfgWa = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'whatsapp_cobrancas'").get();
        if (!cfgWa || !cfgWa.valor) return;

        const hoje_ddmm = `${pad(hoje.getDate())}/${pad(hoje.getMonth()+1)}/${hoje.getFullYear()}`;
        const vencem_hoje = pendentes.filter(o => o.data_vencimento && o.data_vencimento.startsWith(hojeStr));
        const atrasados   = pendentes.filter(o => o.data_vencimento && o.data_vencimento < hojeStr);
        const sem_data    = pendentes.filter(o => !o.data_vencimento);

        let msg = `💰 *Cobranças A Receber — ${hoje_ddmm}*\n`;

        const restanteOS = o => o.valor - (o.valor_pago || 0);
        const fmtOS = o => {
            const r = restanteOS(o);
            const lojaTag = o.loja_nome ? ` [${o.loja_nome}]` : '';
            return (o.valor_pago || 0) > 0 ? `${lojaTag} (pago ${fmtVal(o.valor_pago)}, restam ${fmtVal(r)})` : `${lojaTag} — *${fmtVal(r)}*`;
        };

        if (vencem_hoje.length) {
            msg += `\n📅 *Vencem hoje:*\n`;
            vencem_hoje.forEach(o => { msg += `  • ${o.numero} — ${o.cliente_nome}${fmtOS(o)}\n`; });
        }
        if (atrasados.length) {
            msg += `\n⚠ *Em atraso:*\n`;
            atrasados.forEach(o => {
                const dias = Math.round((hoje - new Date(o.data_vencimento)) / 86400000);
                msg += `  • ${o.numero} — ${o.cliente_nome}${fmtOS(o)} (${dias}d atraso)\n`;
            });
        }
        if (sem_data.length) {
            msg += `\n📋 *Sem data definida:*\n`;
            sem_data.forEach(o => { msg += `  • ${o.numero} — ${o.cliente_nome}${fmtOS(o)}\n`; });
        }

        const totalRestante = pendentes.reduce((s, o) => s + restanteOS(o), 0);
        msg += `\n💵 *Total pendente: ${fmtVal(totalRestante)}*`;

        await wa.enviarMensagem(cfgWa.valor, msg);
        console.log(`📱 Aviso de cobranças enviado: ${pendentes.length} OS`);
    } catch (e) {
        console.error('Cron cobranças:', e.message);
    }
});

// Cron: fechamento automático de comissões todo dia 1º às 00:05 — roda por loja
cron.schedule('5 0 1 * *', async () => {
    const hoje = new Date();
    const mes = hoje.getMonth() === 0 ? 12 : hoje.getMonth();
    const ano = hoje.getMonth() === 0 ? hoje.getFullYear() - 1 : hoje.getFullYear();
    const cfgWa = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'whatsapp_comissao'").get();
    const lojas = db.prepare('SELECT id, nome FROM lojas WHERE ativo = 1').all();
    for (const loja of lojas) {
        try {
            console.log(`📊 Fechamento automático de comissões ${mes}/${ano} — ${loja.nome}`);
            const resultado = executarFechamento(mes, ano, loja.id);
            if (resultado.jaExistia) { console.log(`📊 Já existia para ${loja.nome}, pulando.`); continue; }
            if (cfgWa && cfgWa.valor) {
                const msg = `🏪 *${loja.nome}*\n\n` + montarMensagemWhatsapp(mes, ano, resultado.fechamento_id);
                await wa.enviarMensagem(cfgWa.valor, msg);
                db.prepare('UPDATE fechamentos_comissao SET enviado_whatsapp = 1 WHERE id = ?').run(resultado.fechamento_id);
                console.log(`📱 Comissões ${MESES[mes-1]}/${ano} — ${loja.nome} enviadas via WhatsApp`);
            }
            console.log(`✅ Fechamento ${mes}/${ano} — ${loja.nome}: ${resultado.qtd_os} OS, R$ ${resultado.total_geral?.toFixed(2)}`);
        } catch (e) {
            console.error(`Erro fechamento comissões ${loja.nome}:`, e.message);
        }
    }
});

// Cron: envio de lembretes agendados (verifica a cada minuto)
cron.schedule('* * * * *', async () => {
    const agora = new Date();
    const pad = n => String(n).padStart(2, '0');
    const agoraStr = `${agora.getFullYear()}-${pad(agora.getMonth()+1)}-${pad(agora.getDate())} ${pad(agora.getHours())}:${pad(agora.getMinutes())}`;

    let pendentes;
    try {
        pendentes = db.prepare(`
            SELECT * FROM lembretes
            WHERE status = 'pendente' AND data_envio <= ?
        `).all(agoraStr);
    } catch (e) { console.error('Cron lembretes query:', e.message); return; }

    for (const lembrete of pendentes) {
        try {
            let vendedores = [];
            if (lembrete.destinatarios === 'todos') {
                vendedores = db.prepare(`SELECT nome, telefone FROM vendedores WHERE ativo = 1 AND telefone IS NOT NULL AND telefone != ''`).all();
            } else {
                const ids = lembrete.destinatarios.split(',').map(Number);
                vendedores = db.prepare(
                    `SELECT nome, telefone FROM vendedores WHERE id IN (${ids.map(() => '?').join(',')}) AND telefone IS NOT NULL AND telefone != ''`
                ).all(...ids);
            }

            if (!vendedores.length) {
                db.prepare(`UPDATE lembretes SET status = 'enviado', enviado_em = datetime('now','localtime'), erros = ? WHERE id = ?`)
                  .run('Nenhum destinatário com telefone cadastrado', lembrete.id);
                continue;
            }

            const msg = `🔔 *Lembrete!*\n\n${lembrete.mensagem}\n\n📅 ${fmtDH(lembrete.data_envio)}`;
            const erros = [];

            for (const v of vendedores) {
                try {
                    await wa.enviarMensagem(v.telefone, msg);
                } catch (e) {
                    erros.push(`${v.nome}: ${e.message}`);
                }
            }

            db.prepare(`UPDATE lembretes SET status = 'enviado', enviado_em = datetime('now','localtime'), erros = ? WHERE id = ?`)
              .run(erros.length ? erros.join(' | ') : null, lembrete.id);

            console.log(`🔔 Lembrete #${lembrete.id} enviado para ${vendedores.length} destinatário(s)`);
        } catch (e) {
            db.prepare(`UPDATE lembretes SET status = 'falha', erros = ? WHERE id = ?`).run(e.message, lembrete.id);
            console.error(`Lembrete #${lembrete.id}:`, e.message);
        }
    }
});

// Cron: lembrete 30 min antes da OS
cron.schedule('* * * * *', async () => {
    const agora = new Date();
    const em30 = new Date(agora.getTime() + 30 * 60 * 1000);
    const em35 = new Date(agora.getTime() + 35 * 60 * 1000);
    const pad = n => String(n).padStart(2, '0');
    const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

    let pendentes;
    try {
        pendentes = db.prepare(`
            SELECT os.*, v.nome as vendedor_nome, v.telefone as vendedor_telefone,
                   c.nome as cliente_nome, c.endereco as cli_rua, c.numero as cli_numero,
                   c.complemento as cli_complemento, c.bairro as cli_bairro,
                   c.cidade as cli_cidade, c.referencia as cli_referencia
            FROM ordens_servico os
            LEFT JOIN vendedores v ON os.vendedor_id = v.id
            LEFT JOIN clientes c ON os.cliente_id = c.id
            WHERE datetime(os.data_prevista) >= datetime(?) AND datetime(os.data_prevista) <= datetime(?)
              AND os.status NOT IN ('cancelada','concluida')
              AND os.lembrete_enviado = 0
              AND v.telefone IS NOT NULL AND v.telefone != ''
        `).all(fmt(em30), fmt(em35));
    } catch (e) { console.error('Cron lembrete OS query:', e.message); return; }

    const pgLabels = { dinheiro: 'Dinheiro 💵', pix: 'PIX 📱', debito: 'Cartão Débito 💳', credito: 'Cartão Crédito 💳' };

    for (const os of pendentes) {
        try {
            const itensOS = db.prepare(`
                SELECT descricao, quantidade, preco_unitario, subtotal, servico_id, produto_id
                FROM itens_ordem_servico WHERE ordem_id = ?
            `).all(os.id);

            const itensTexto = itensOS.length
                ? itensOS.map(it => {
                    const tipo = it.servico_id ? '🔧' : '📦';
                    const qtd = it.quantidade > 1 ? ` x${it.quantidade}` : '';
                    return `  ${tipo} ${it.descricao}${qtd} — ${fmtVal(it.subtotal)}`;
                }).join('\n')
                : '  (sem itens)';

            const enderecoWA = os.cliente_id
                ? fmtAddr(os.cli_rua, os.cli_numero, os.cli_complemento, os.cli_bairro, os.cli_cidade, os.cli_referencia)
                : fmtAddr(os.cliente_avulso_rua, os.cliente_avulso_numero, os.cliente_avulso_complemento, null, os.cliente_avulso_cidade, os.cliente_avulso_referencia);
            const dataHora = os.data_prevista
                ? `\n📅 *Previsto:* ${fmtDH(os.data_prevista)}`
                : '';
            const pagamento = os.forma_pagamento
                ? `\n💳 *Pagamento:* ${pgLabels[os.forma_pagamento] || os.forma_pagamento}`
                : '';
            const obs = os.observacoes
                ? `\n📌 *Obs:* ${os.observacoes}`
                : '';

            const msg = [
                `⏰ *Lembrete de OS!*`,
                ``,
                `Olá ${os.vendedor_nome}! A OS *${os.numero}* está prevista para daqui 30 minutos.`,
                ``,
                `📋 OS: *${os.numero}*`,
                `👤 Cliente: ${os.cliente_nome || os.cliente_nome_avulso || '????'}${enderecoWA}`,
                `📝 Descrição: ${os.descricao}${dataHora}`,
                ``,
                `*Serviços e Produtos:*`,
                itensTexto,
                ``,
                `💰 *Total: ${fmtVal(os.valor)}*${pagamento}${obs}`,
                ``,
                `Acesse o sistema para mais detalhes.`
            ].join('\n');

            await wa.enviarMensagem(os.vendedor_telefone, msg);
            db.prepare('UPDATE ordens_servico SET lembrete_enviado = 1 WHERE id = ?').run(os.id);
            console.log(`📱 Lembrete enviado: OS ${os.numero} → ${os.vendedor_nome}`);
        } catch (e) {
            console.error(`Lembrete OS ${os.numero}:`, e.message);
        }
    }
});

// CEP lookup via ViaCEP
app.get('/api/cnpj/:cnpj', auth, async (req, res) => {
    const cnpj = req.params.cnpj.replace(/\D/g, '');
    if (cnpj.length !== 14) return res.status(400).json({ error: 'CNPJ deve ter 14 dígitos' });
    try {
        const axios = require('axios');
        const r = await axios.get(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { timeout: 8000 });
        res.json(r.data);
    } catch (e) {
        const status = e.response?.status;
        if (status === 404) return res.status(404).json({ error: 'CNPJ não encontrado na Receita Federal' });
        res.status(502).json({ error: 'Serviço da Receita Federal indisponível. Tente novamente.' });
    }
});

app.get('/api/cep/:cep', auth, (req, res) => {
    const cep = req.params.cep.replace(/\D/g, '');
    if (cep.length !== 8) return res.status(400).json({ error: 'CEP inválido' });
    const https = require('https');
    https.get(`https://viacep.com.br/ws/${cep}/json/`, (resp) => {
        let data = '';
        resp.on('data', chunk => data += chunk);
        resp.on('end', () => {
            try { res.json(JSON.parse(data)); }
            catch { res.status(500).json({ error: 'Resposta inválida do ViaCEP' }); }
        });
    }).on('error', () => res.status(500).json({ error: 'Erro ao consultar CEP' }));
});

// Fallback to SPA
app.get('/app', (req, res) => res.sendFile(path.join(__dirname, 'public', 'app.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Global error handler — sempre retorna JSON (nunca HTML)
app.use((err, req, res, next) => {
    console.error('Erro não tratado:', err.message);
    res.status(err.status || 500).json({ error: err.message || 'Erro interno do servidor' });
});

app.listen(PORT, () => {
    console.log(`\n🔑 Sistema Chaveiro rodando em http://localhost:${PORT}\n`);
});
