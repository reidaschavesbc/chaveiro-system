# Sistema Chaveiro — Guia para o Claude

## Visão geral

Sistema de gestão para chaveiros: ordens de serviço, vendas, clientes, estoque, NFS-e, WhatsApp e app mobile Android.

- **Servidor:** Node.js + Express, SQLite (better-sqlite3), PM2, porta 3002
- **Banco:** `/home/chaveiro/chaveiro-system/database/chaveiro.db`
- **App mobile:** Expo (React Native), pasta `mobile-app/`, build via GitHub Actions
- **GitHub:** `reidaschavesbc/chaveiro-system` (token em `/home/chaveiro/.backup_token`)

---

## Comandos essenciais

### Servidor

```bash
pm2 restart chaveiro-system          # reinicia após alterar arquivos do servidor
pm2 logs --lines 80 --nostream       # ver logs recentes (out + error)
pm2 logs chaveiro-system --lines 80 --nostream
```

> **Sempre reiniciar o PM2 após editar qualquer arquivo `.js` do servidor.**

### Logs de erro

```
/var/log/chaveiro/error-0.log   # erros da aplicação
/var/log/chaveiro/out-0.log     # saída normal
```

### Banco de dados (verificar colunas, debug)

```bash
node -e "const db = require('./database/db'); console.log(db.prepare('PRAGMA table_info(nome_da_tabela)').all().map(c=>c.name).join(', '));"
```

---

## Como subir o APK (Android)

O APK é buildado pelo **GitHub Actions** ao criar uma tag `apk-X.X.X`.

```bash
cd /home/chaveiro/chaveiro-system
./release-apk.sh 1.0.XX
```

- Versão atual do APK: ver `mobile-app/app.json` → campo `"version"`
- O script: atualiza `mobile-app/app.json`, faz commit, push e cria a tag
- GitHub Actions builda em ~18 minutos
- Resultado disponível em: `https://github.com/reidaschavesbc/chaveiro-system/releases`

> **Antes de subir o APK, commitar as mudanças pendentes do servidor** (os bugs fixes, etc), senão o script vai subir tudo junto.

---

## Como subir release do servidor (Windows .exe)

```bash
./release.sh 1.X.XX
```

Após o build (~5 min), publicar e copiar:

```bash
TOKEN=$(cat /home/chaveiro/.backup_token)
GH_TOKEN="$TOKEN" gh release edit vX.X.XX --repo reidaschavesbc/chaveiro-system --draft=false
GH_TOKEN="$TOKEN" gh release download vX.X.XX --repo reidaschavesbc/chaveiro-system \
  --pattern "SistemaChaveiro-Setup.exe" --pattern "latest.yml" \
  --pattern "SistemaChaveiro-Setup.exe.blockmap" \
  --dir /home/chaveiro/chaveiro-system/public/downloads/ --clobber
```

---

## Como fazer backup / push manual ao GitHub

```bash
cd /home/chaveiro/chaveiro-system
./autopush.sh
```

---

## Estrutura do projeto

```
server.js               # entrada principal
routes/                 # rotas da API REST
  ordens.js             # ordens de serviço
  vendas.js             # vendas diretas
  clientes.js
  produtos.js / estoque.js
  relatorios.js         # dashboard e relatórios (usa resolverFiltroUsuario)
  app-mobile.js         # endpoints exclusivos do app
  nfse.js               # nota fiscal de serviço eletrônica
  whatsapp.js
utils/
  gerarNumeroOS.js      # gera número único de OS (usa MAX, não COUNT)
mobile-app/             # app React Native / Expo
  app.json              # versão do APK está aqui
  screens/              # telas do app
services/
  nfse.js               # integração NFS-e
database/
  db.js                 # inicialização SQLite + migrações
public/                 # frontend web (HTML/CSS/JS vanilla)
```

---

## Pontos importantes do código

- **`gerarNumeroOS()`** — deve ser chamado DENTRO de `db.transaction()`. Usa `ORDER BY numero DESC LIMIT 1` para pegar o maior número existente no mês (não COUNT, para evitar duplicata quando OS é deletada).
- **`resolverFiltroUsuario(req)`** em `relatorios.js` — retorna `filtroId` (null = todos, número = filtrar por usuário). Usar `sqlUsuario(filtroId, alias)` com o alias correto: `'v'` para `vendas v`, `'os'` para `ordens_servico os`, `''` para sub-queries sem alias.
- **WhatsApp** — inicializado via Puppeteer/chromium. Se der erro de `libnspr4.so`, instalar dependências do Chrome no sistema.
- **FCM (push notifications)** — erros `Requested entity was not found` são tokens de dispositivo expirados, não afetam o funcionamento.
- **Assistente IA** — usa API da Anthropic; requer chave válida em `.env`.

---

## Usuário padrão de acesso

- URL: `http://localhost:3002`
- Usuário: `admin` / Senha: `admin123` (primeira execução)

---

## Ambiente

- OS: Ubuntu Linux
- Node: gerenciado via PM2 (`ecosystem.config.js`)
- Porta: 3002 (produção)
- Acesso remoto: Bitvise SSH → `/home/chaveiro/chaveiro-system`
