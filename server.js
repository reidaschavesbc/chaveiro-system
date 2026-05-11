require('dotenv').config();
// Fallback para quando .env não está disponível (executável Electron no cliente)
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'chaveiro_super_secret_key_2024';
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const auth = require('./middleware/auth');

// Download do app Electron (público)
app.get('/download', (req, res) => {
  const localFile = path.join(__dirname, 'public/downloads/SistemaChaveiro-Setup.exe');
  const fs = require('fs');
  if (fs.existsSync(localFile)) {
    res.download(localFile, 'SistemaChaveiro-Setup.exe');
  } else {
    res.redirect(302, 'https://github.com/tvsxgames/chaveiro-system/releases/latest/download/SistemaChaveiro-Setup.exe');
  }
});

// Download do app Android (público)
app.get('/download-app', (req, res) => {
  res.redirect(302, 'https://github.com/tvsxgames/chaveiro-system/releases/latest/download/ChaveiroOS.apk');
});

app.get('/api/version', (req, res) => {
  const { version } = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
  res.json({ version });
});

// Public routes
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
    res.json({ ok: senha === cfg.valor });
});

app.put('/api/config/senha-gerente', auth, (req, res) => {
    const { senha_atual, senha_nova } = req.body;
    if (!senha_nova) return res.status(400).json({ error: 'Nova senha é obrigatória' });
    if (senha_nova.length < 4) return res.status(400).json({ error: 'A senha deve ter pelo menos 4 caracteres' });
    const cfg = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'senha_gerente'").get();
    const jaConfigurada = cfg && cfg.valor;
    if (jaConfigurada) {
        if (!senha_atual) return res.status(400).json({ error: 'Senha atual é obrigatória' });
        if (senha_atual !== cfg.valor) return res.status(422).json({ error: 'Senha atual incorreta' });
    }
    db.prepare('INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES (?, ?)').run('senha_gerente', senha_nova);
    res.json({ ok: true });
});

app.put('/api/config/senha-exclusao', auth, (req, res) => {
    // Rota legada — redireciona para senha_gerente
    const { senha_atual, senha_nova } = req.body;
    if (!senha_nova) return res.status(400).json({ error: 'Nova senha é obrigatória' });
    const cfg = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'senha_gerente'").get();
    if (cfg && cfg.valor && senha_atual !== cfg.valor) return res.status(422).json({ error: 'Senha atual incorreta' });
    db.prepare('INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES (?, ?)').run('senha_gerente', senha_nova);
    res.json({ ok: true });
});

// ─── Crons de Pedidos de Compra ───────────────────────────────────────────────
const { enviarResumoDiario } = require('./routes/pedidos');

// Alta prioridade: lembrete a cada 1h para não confirmados e não silenciados
cron.schedule('0 * * * *', async () => {
    const pedidos = db.prepare(`
        SELECT * FROM pedidos_compra
        WHERE status = 'pendente' AND confirmado = 0 AND prioridade = 'alta'
          AND (silenciado_ate IS NULL OR datetime(silenciado_ate) <= datetime('now','localtime'))
          AND (ultimo_aviso IS NULL OR datetime(ultimo_aviso) <= datetime('now','localtime','-1 hours'))
    `).all();
    const { enviarAvisoPedido } = require('./routes/pedidos');
    for (const p of pedidos) await enviarAvisoPedido(p, 'lembrete');
});

// Média prioridade: lembrete a cada 3h para não confirmados e não silenciados
cron.schedule('0 */3 * * *', async () => {
    const pedidos = db.prepare(`
        SELECT * FROM pedidos_compra
        WHERE status = 'pendente' AND confirmado = 0 AND prioridade = 'media'
          AND (silenciado_ate IS NULL OR datetime(silenciado_ate) <= datetime('now','localtime'))
          AND (ultimo_aviso IS NULL OR datetime(ultimo_aviso) <= datetime('now','localtime','-3 hours'))
    `).all();
    const { enviarAvisoPedido } = require('./routes/pedidos');
    for (const p of pedidos) await enviarAvisoPedido(p, 'lembrete');
});

// Diário às 9h: resumo geral de todos não confirmados + baixa prioridade
cron.schedule('0 9 * * *', async () => {
    await enviarResumoDiario();
});

// ─── Cron: aviso de cobranças A Receber — a cada hora das 08h às 20h
cron.schedule('0 8-20 * * *', async () => {
    const hoje = new Date();
    const pad = n => String(n).padStart(2, '0');
    const hojeStr = `${hoje.getFullYear()}-${pad(hoje.getMonth()+1)}-${pad(hoje.getDate())}`;

    const pendentes = db.prepare(`
        SELECT os.numero, os.valor, os.valor_pago, os.data_vencimento,
               COALESCE(c.nome, os.cliente_nome_avulso, '????') as cliente_nome
        FROM ordens_servico os
        LEFT JOIN clientes c ON os.cliente_id = c.id
        WHERE os.a_receber = 1
          AND os.a_receber_pago = 0
          AND (os.cobranca_pausado_em IS NULL OR os.cobranca_pausado_em != ?)
          AND (os.data_vencimento IS NULL OR os.data_vencimento <= ?)
        ORDER BY os.data_vencimento ASC
    `).all(hojeStr, hojeStr + ' 23:59:59');

    if (!pendentes.length) return;

    const cfgWa = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'whatsapp_cobrancas'").get();
    if (!cfgWa || !cfgWa.valor) return;

    const fmtVal = v => 'R$ ' + parseFloat(v||0).toFixed(2).replace('.', ',');
    const fmtData = dt => {
        if (!dt) return null;
        const [y, m, d] = dt.slice(0,10).split('-');
        return `${d}/${m}/${y}`;
    };

    const hoje_ddmm = `${pad(hoje.getDate())}/${pad(hoje.getMonth()+1)}/${hoje.getFullYear()}`;
    const vencem_hoje = pendentes.filter(o => o.data_vencimento && o.data_vencimento.startsWith(hojeStr));
    const atrasados   = pendentes.filter(o => o.data_vencimento && o.data_vencimento < hojeStr);
    const sem_data    = pendentes.filter(o => !o.data_vencimento);

    const totalGeral = pendentes.reduce((s, o) => s + o.valor, 0);

    let msg = `💰 *Cobranças A Receber — ${hoje_ddmm}*\n`;

    const restanteOS = o => o.valor - (o.valor_pago || 0);
    const fmtOS = o => {
        const r = restanteOS(o);
        const parcial = (o.valor_pago || 0) > 0 ? ` (pago ${fmtVal(o.valor_pago)}, restam ${fmtVal(r)})` : ` — *${fmtVal(r)}*`;
        return parcial;
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

    try {
        await wa.enviarMensagem(cfgWa.valor, msg);
        console.log(`📱 Aviso de cobranças enviado: ${pendentes.length} OS`);
    } catch (e) {
        console.error('Aviso cobranças WhatsApp:', e.message);
    }
});

// Cron: fechamento automático de comissões todo dia 1º às 00:05
cron.schedule('5 0 1 * *', async () => {
    const hoje = new Date();
    const mes = hoje.getMonth() === 0 ? 12 : hoje.getMonth();
    const ano = hoje.getMonth() === 0 ? hoje.getFullYear() - 1 : hoje.getFullYear();
    console.log(`📊 Iniciando fechamento automático de comissões: ${mes}/${ano}`);
    try {
        const { executarFechamento, montarMensagemWhatsapp, MESES } = require('./routes/comissoes');
        const resultado = executarFechamento(mes, ano);
        if (resultado.jaExistia) { console.log(`📊 Fechamento ${mes}/${ano} já existia, pulando.`); return; }

        const cfgWa = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'whatsapp_comissao'").get();
        if (cfgWa && cfgWa.valor) {
            const msg = montarMensagemWhatsapp(mes, ano, resultado.fechamento_id);
            await wa.enviarMensagem(cfgWa.valor, msg);
            db.prepare('UPDATE fechamentos_comissao SET enviado_whatsapp = 1 WHERE id = ?').run(resultado.fechamento_id);
            console.log(`📱 Comissões ${MESES[mes-1]}/${ano} enviadas via WhatsApp`);
        }
        console.log(`✅ Fechamento ${mes}/${ano} concluído: ${resultado.qtd_os} OS, R$ ${resultado.total_geral?.toFixed(2)}`);
    } catch (e) {
        console.error('Erro no fechamento automático de comissões:', e.message);
    }
});

// Cron: envio de lembretes agendados (verifica a cada minuto)
cron.schedule('* * * * *', async () => {
    const agora = new Date();
    const pad = n => String(n).padStart(2, '0');
    const agoraStr = `${agora.getFullYear()}-${pad(agora.getMonth()+1)}-${pad(agora.getDate())} ${pad(agora.getHours())}:${pad(agora.getMinutes())}`;

    const pendentes = db.prepare(`
        SELECT * FROM lembretes
        WHERE status = 'pendente' AND data_envio <= ?
    `).all(agoraStr);

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

            const fmtDH = dt => {
                const [d, h] = dt.slice(0, 16).split(' ');
                return d.split('-').reverse().join('/') + (h ? ' às ' + h : '');
            };

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
const wa = require('./services/whatsapp');
cron.schedule('* * * * *', () => {
    const agora = new Date();
    const em30 = new Date(agora.getTime() + 30 * 60 * 1000);
    const em35 = new Date(agora.getTime() + 35 * 60 * 1000);
    const pad = n => String(n).padStart(2, '0');
    const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

    const pendentes = db.prepare(`
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

    const pgLabels = { dinheiro: 'Dinheiro 💵', pix: 'PIX 📱', debito: 'Cartão Débito 💳', credito: 'Cartão Crédito 💳' };
    const fmtVal = v => 'R$ ' + parseFloat(v || 0).toFixed(2).replace('.', ',');

    pendentes.forEach(async os => {
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

            const fmtDH = dp => {
                const s = String(dp).slice(0, 16);
                const [dt, hr] = s.split(' ');
                const [y, m, d] = dt.split('-');
                return `${d}/${m}/${y}${hr ? ' ' + hr : ''}`;
            };
            const fmtAddr = (rua, num, comp, bairro, cidade, ref) => {
                if (!rua && !cidade) return '';
                let linha = rua || '';
                if (num) linha += `, ${num}`;
                if (comp) linha += ` - ${comp}`;
                if (bairro) linha += (linha ? ', ' : '') + bairro;
                if (cidade) linha += (linha ? ' - ' : '') + cidade;
                return `\n📍 *Endereço:* ${linha}${ref ? '\n🗺️ *Ref:* ' + ref : ''}`;
            };
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
    });
});

// CEP lookup via ViaCEP
app.get('/api/cep/:cep', (req, res) => {
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
    console.log(`\n🔑 Sistema Chaveiro rodando em http://localhost:${PORT}`);
    console.log(`📧 Usuário: admin`);
    console.log(`🔒 Senha: admin123\n`);
});
