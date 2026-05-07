// === ASSISTENTE FINANCEIRO ===

const ASS_SUGESTOES = [
  { label: '📊 Como tá o negócio?',    texto: 'Como tá o negócio hoje?' },
  { label: '💰 Caixa de hoje',         texto: 'Fechar o caixa de hoje' },
  { label: '📈 Resultado do mês',      texto: 'Qual o resultado líquido do mês?' },
  { label: '🔔 A receber',             texto: 'Quem ainda não pagou? Listar OS a receber' },
  { label: '🔧 OS em aberto',          texto: 'Quais ordens de serviço estão em aberto?' },
  { label: '📦 Estoque baixo',         texto: 'Produtos com estoque baixo' },
  { label: '👥 Desempenho da semana',  texto: 'Como foi o desempenho dos funcionários essa semana?' },
  { label: '🛒 Lista de compras',      texto: 'O que precisa comprar? Pedidos pendentes' },
  { label: '⚠️ A receber vencido',    texto: 'Cobranças vencidas, quem tá atrasado?' },
  { label: '🔁 Consumo interno',       texto: 'Consumo interno do mês, quanto perdi?' },
];

function assistentePage(contentDiv) {
  contentDiv.innerHTML = `
    <div class="ass-container">
      <div class="ass-header">
        <div class="ass-avatar">
          <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-5h2v2h-2zm0-8h2v6h-2z"/></svg>
        </div>
        <div class="ass-header-text">
          <div class="ass-title">Assistente IA</div>
          <div class="ass-subtitle">Consulte dados, analise resultados e tire dúvidas</div>
        </div>
        <div style="margin-left:auto;display:flex;align-items:center;gap:8px">
          <a href="https://console.anthropic.com" target="_blank" title="Abrir Claude AI" style="background:none;border:1px solid #e2e8f0;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:12px;color:#64748b;display:flex;align-items:center;gap:5px;text-decoration:none">
            <svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17.93V18c0-.55-.45-1-1-1s-1 .45-1 1v1.93C7.06 19.48 4.52 16.94 4.07 13H6c.55 0 1-.45 1-1s-.45-1-1-1H4.07C4.52 7.06 7.06 4.52 11 4.07V6c0 .55.45 1 1 1s1-.45 1-1V4.07C16.94 4.52 19.48 7.06 19.93 11H18c-.55 0-1 .45-1 1s.45 1 1 1h1.93c-.45 3.94-2.99 6.48-6.93 6.93z"/></svg>
            Claude AI
          </a>
          <button onclick="assLimpar()" title="Limpar conversa" style="background:none;border:1px solid #e2e8f0;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:12px;color:#64748b;display:flex;align-items:center;gap:5px">
            <svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            Limpar
          </button>
        </div>
      </div>

      <div class="ass-sugestoes" id="ass-sugestoes">
        ${ASS_SUGESTOES.map(s => `<button onclick="assEnviarSugestao('${s.texto}')">${s.label}</button>`).join('')}
      </div>

      <div class="ass-messages" id="ass-messages">
        <div class="ass-msg ass-msg-bot">
          <div class="ass-bubble">
            Olá! Sou seu assistente de gestão 👋<br><br>
            Posso consultar e controlar o sistema em tempo real:<br>
            <strong>caixa · faturamento · OS · clientes · a receber · estoque · gastos · funcionários · pedidos · lembretes</strong><br><br>
            Também posso <strong>criar OS, registrar consumo, criar lembretes, adicionar pedidos de compra</strong> e muito mais — é só pedir!
          </div>
        </div>
      </div>

      <div class="ass-input-area">
        <input type="text" id="ass-input" class="ass-input" placeholder="Ex: Quanto entrou hoje? Quem deve? Estoque baixo..." autocomplete="off" />
        <button class="ass-btn-send" title="Enviar (Enter)" onclick="assEnviar()">
          <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </div>
      <div style="text-align:center;font-size:11px;color:#cbd5e1;margin-top:6px">Enter para enviar</div>
    </div>
  `

  const input = document.getElementById('ass-input')
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); assEnviar() }
  })
  input.focus()
}

// ─── State ────────────────────────────────────────────────────────────────────

let assHistorico = []
let _assGerSenhaConfig = null  // cache: true=configurada, false=não configurada

async function assVerificarSenhaSensivel(mensagem) {
  const SENSIVEIS = ['resultado', 'faturamento', 'faturou', 'lucro', 'fechamento', 'salario', 'salário', 'quanto entrou', 'quanto faturou', 'quanto sobrou', 'caixa de hoje']
  const txt = mensagem.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const eSensivel = SENSIVEIS.some(k => txt.includes(k.normalize('NFD').replace(/[̀-ͯ]/g, '')))
  if (!eSensivel) return true

  if (_assGerSenhaConfig === null) {
    try {
      const cfg = await api('GET', '/config')
      _assGerSenhaConfig = !!cfg.senha_gerente_configurada
    } catch { _assGerSenhaConfig = false }
  }
  if (!_assGerSenhaConfig) return true  // sem senha configurada = livre

  return await modalSenhaGerente('Informação Restrita', 'Esta consulta contém dados financeiros. Digite a senha do gerente para continuar.')
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

function assLimpar() {
  assHistorico = []
  const msgs = document.getElementById('ass-messages')
  if (msgs) msgs.innerHTML = `
    <div class="ass-msg ass-msg-bot">
      <div class="ass-bubble">Conversa limpa! Como posso ajudar?</div>
    </div>`
  const sugestoes = document.getElementById('ass-sugestoes')
  if (sugestoes) sugestoes.style.display = ''
}

function assEnviarSugestao(texto) {
  const input = document.getElementById('ass-input')
  if (input) input.value = texto
  assEnviar()
}

async function assEnviar() {
  const input = document.getElementById('ass-input')
  if (!input) return
  const mensagem = input.value.trim()
  if (!mensagem) return

  // Verifica senha para consultas sensíveis ANTES de enviar
  const autorizado = await assVerificarSenhaSensivel(mensagem)
  if (!autorizado) return

  input.value = ''
  assOcultarSugestoes()
  assAdicionarMensagem('user', mensagem)
  assHistorico.push({ role: 'user', content: mensagem })

  const loadingId = assAdicionarLoading()

  try {
    const data = await api('POST', '/assistente', {
      mensagem,
      historico: assHistorico.slice(-20)
    }, 90000)

    assRemoverLoading(loadingId)

    if (data.error) {
      assAdicionarMensagem('bot', `⚠️ ${data.error}`)
      return
    }

    assAdicionarMensagem('bot', data.resposta)
    assHistorico.push({ role: 'assistant', content: data.resposta })
    if (assHistorico.length > 40) assHistorico = assHistorico.slice(-40)

  } catch (e) {
    assRemoverLoading(loadingId)
    const msg = e.message && e.message !== 'Erro na requisição'
      ? `⚠️ ${e.message}`
      : '⚠️ Não foi possível conectar. Verifique se o servidor está rodando.'
    assAdicionarMensagem('bot', msg)
  }
}

function assAdicionarMensagem(tipo, texto) {
  const container = document.getElementById('ass-messages')
  if (!container) return

  const div = document.createElement('div')
  div.className = `ass-msg ass-msg-${tipo === 'user' ? 'user' : 'bot'}`

  const bubble = document.createElement('div')
  bubble.className = 'ass-bubble'
  bubble.innerHTML = assFormatarTexto(texto)

  div.appendChild(bubble)
  container.appendChild(div)
  container.scrollTop = container.scrollHeight
}

function assAdicionarLoading() {
  const container = document.getElementById('ass-messages')
  if (!container) return null

  const id = 'loading-' + Date.now()
  const div = document.createElement('div')
  div.className = 'ass-msg ass-msg-bot'
  div.id = id
  div.innerHTML = `<div class="ass-bubble ass-loading"><span></span><span></span><span></span></div>`
  container.appendChild(div)
  container.scrollTop = container.scrollHeight
  return id
}

function assRemoverLoading(id) {
  if (!id) return
  const el = document.getElementById(id)
  if (el) el.remove()
}

function assOcultarSugestoes() {
  const s = document.getElementById('ass-sugestoes')
  if (s) s.style.display = 'none'
}

function assFormatarTexto(texto) {
  // Markdown table → HTML table
  texto = assRenderTabelas(texto)
  // Headers
  texto = texto.replace(/^### (.+)$/gm, '<strong style="font-size:13px;color:#475569">$1</strong>')
  texto = texto.replace(/^## (.+)$/gm, '<strong style="font-size:14px;color:#1e293b">$1</strong>')
  // Bold / italic
  texto = texto.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  texto = texto.replace(/\*(.+?)\*/g, '<em>$1</em>')
  // Lists
  texto = texto.replace(/^[-•]\s+(.+)$/gm, '<div style="padding-left:12px;margin:2px 0">• $1</div>')
  // Newlines
  texto = texto.replace(/\n/g, '<br>')
  return texto
}

function assRenderTabelas(texto) {
  const linhas = texto.split('\n')
  let resultado = []
  let i = 0

  while (i < linhas.length) {
    const linha = linhas[i]
    // Detecta linha de tabela com | e linha separadora seguinte
    if (linha.includes('|') && i + 1 < linhas.length && /^[\s|:\-]+$/.test(linhas[i+1])) {
      const headers = linha.split('|').map(h => h.trim()).filter(h => h)
      i += 2 // pula header e separador

      const rows = []
      while (i < linhas.length && linhas[i].includes('|')) {
        const cells = linhas[i].split('|').map(c => c.trim()).filter((c, idx, arr) => idx > 0 && idx < arr.length - 1 || arr.length <= 2)
        // Alternativa mais simples:
        const allCells = linhas[i].split('|').map(c => c.trim())
        const dataCells = allCells.filter(c => c !== '')
        rows.push(dataCells)
        i++
      }

      let tabela = `<div style="overflow-x:auto;margin:8px 0"><table style="width:100%;border-collapse:collapse;font-size:12px">`
      tabela += `<thead><tr>${headers.map(h => `<th style="background:#f1f5f9;padding:6px 10px;text-align:left;border-bottom:2px solid #e2e8f0;font-weight:600;white-space:nowrap">${h}</th>`).join('')}</tr></thead>`
      tabela += `<tbody>${rows.map((r, ri) => `<tr style="background:${ri%2===0?'#fff':'#f8fafc'}">${r.slice(0, headers.length).map(c => `<td style="padding:5px 10px;border-bottom:1px solid #f1f5f9">${c}</td>`).join('')}</tr>`).join('')}</tbody>`
      tabela += `</table></div>`
      resultado.push(tabela)
    } else {
      resultado.push(linha)
      i++
    }
  }

  return resultado.join('\n')
}
