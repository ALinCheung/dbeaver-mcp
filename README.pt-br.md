# dbeaver-mcp

Servidor MCP que expõe suas conexões DBeaver ao Claude como tools. Descriptografa credenciais em memória — nunca persiste senhas em disco.

**[Read in English](README.md)**

Use suas conexões de banco de dados do DBeaver diretamente no Claude Code ou Claude Desktop para consultar, gerenciar e analisar bancos MySQL sem redigitar credenciais.

## Como Funciona

```
┌─────────────────────────┐
│  Claude Code / Desktop  │
└───────────┬─────────────┘
            │ MCP stdio (JSON-RPC 2.0)
            │ Só tool calls passam aqui — nunca credenciais
            ▼
┌─────────────────────────────────────────────┐
│          dbeaver-mcp (Node.js)              │
│                                             │
│  1. Lê os arquivos de config do DBeaver     │
│  2. Descriptografa credenciais em memória   │
│  3. Abre conexão direta com o MySQL         │
│  4. Retorna resultado da query ao Claude    │
│  5. Fecha conexão — nada persistido         │
└──────┬──────────────────────────┬───────────┘
       │                          │
       ▼                          ▼
  Workspace DBeaver          Servidor MySQL
  (data-sources.json,        (seu banco)
   credentials-config.json)
```

### Passo a passo

1. **Claude envia uma tool call** (ex: `run_query` com nome da conexão + SQL) via MCP stdio. O protocolo MCP só transporta o nome da tool e os argumentos — nunca credenciais.

2. **dbeaver-mcp resolve a conexão** lendo o `data-sources.json` do DBeaver para encontrar host, porta e banco. Usa um matcher fuzzy por nome, então você não precisa de IDs exatos.

3. **Credenciais são descriptografadas em memória.** O DBeaver 21+ criptografa o `credentials-config.json` com AES-128-CBC (criptografia a nível de arquivo). O dbeaver-mcp lê o arquivo binário, extrai o IV (primeiros 16 bytes), descriptografa o restante com a chave embutida do DBeaver e parseia o JSON. A senha descriptografada existe apenas como uma variável em memória — nunca escrita em disco, logs ou stdout.

4. **Uma conexão MySQL direta é aberta** usando `mysql2` com as credenciais descriptografadas. A conexão tem timeout de 10 segundos e é usada para uma única operação.

5. **A query executa e os resultados são retornados** como JSON pelo stdout do MCP. Apenas os resultados da query voltam para o Claude — nunca a senha ou credenciais de conexão.

6. **A conexão é fechada imediatamente** após a query. Sem connection pool, sem processo em background segurando credenciais.

## Por Que É Seguro

### Credenciais nunca saem da sua máquina

```
❌ O que o dbeaver-mcp NÃO faz:
   • Enviar senhas para os servidores do Claude/Anthropic
   • Escrever senhas em disco, logs ou variáveis de ambiente
   • Manter senhas em memória após a query completar
   • Expor senhas através do protocolo MCP

✅ O que acontece de fato:
   • Senhas são lidas do arquivo criptografado do DBeaver
   • Descriptografadas em uma variável local pela duração de uma query
   • Usadas para abrir uma conexão MySQL direta da SUA máquina
   • Coletadas pelo garbage collector após a conexão fechar
```

### Defesa em profundidade — 5 camadas de proteção

| Camada | O que faz |
|---|---|
| **1. Criptografia DBeaver** | Credenciais ficam criptografadas (AES-128-CBC) em disco. O dbeaver-mcp descriptografa em memória somente quando necessário. |
| **2. Isolamento do protocolo MCP** | O protocolo MCP stdio só transporta nomes de tools, argumentos e resultados. Senhas nunca aparecem no stream do protocolo. O Claude nunca vê suas credenciais. |
| **3. Separação leitura/escrita** | `run_query` bloqueia todas as operações de escrita (INSERT, UPDATE, DELETE, DROP). Você precisa usar `run_write` explicitamente para mutações. |
| **4. Confirmação de escrita** | `run_write` exige `confirmed: true` antes de executar. Isso força um processo em duas etapas que previne alterações acidentais. |
| **5. Permissões por conexão** | `~/.dbeaver-mcp/settings.json` permite whitelist/blacklist de operações SQL por conexão. Trave produção para somente SELECT. |

### O que o Claude vê vs. o que ele não vê

| Claude PODE ver | Claude NÃO PODE ver |
|---|---|
| Nomes e hosts das conexões | Senhas |
| Nomes dos bancos | Arquivos de credenciais criptografados |
| Resultados de queries | JSON bruto de credenciais |
| Schemas de tabelas | Seu sistema de arquivos |

### Código-fonte é aberto

Cada linha do tratamento de credenciais está em [`src/dbeaver.ts`](src/dbeaver.ts). A função de descriptografia tem ~10 linhas. Não há chamadas de rede, telemetria ou serviços externos. Você pode auditar em minutos.

## Início Rápido

### Opção 1: Um comando (recomendado)

Registra globalmente no Claude Code, funciona em todos os sistemas operacionais:

```bash
claude mcp add dbeaver-mcp -- npx dbeaver-mcp
```

Para registrar no escopo do usuário (persiste entre projetos):

```bash
claude mcp add dbeaver-mcp --scope user -- npx dbeaver-mcp
```

### Opção 2: Instalador integrado

```bash
npx dbeaver-mcp install
```

O instalador vai:
1. Verificar se seu workspace DBeaver está acessível
2. Criar `~/.dbeaver-mcp/settings.json` (config de permissões)
3. Registrar o servidor MCP automaticamente no Claude Code
4. Exibir o snippet de configuração para o Claude Desktop

### Opção 3: Setup Manual

```bash
git clone https://github.com/lucascborges/dbeaver-mcp.git ~/.skills/dbeaver-mcp
cd ~/.skills/dbeaver-mcp && npm install && npm run build
```

**Registrar no Claude Code:**
```bash
claude mcp add dbeaver-mcp -- node ~/.skills/dbeaver-mcp/dist/index.js
```

**Registrar no Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "dbeaver-mcp": {
      "command": "node",
      "args": ["~/.skills/dbeaver-mcp/dist/index.js"]
    }
  }
}
```

## Tools Disponíveis

### Gerenciamento de Conexões

| Tool | Descrição |
|---|---|
| `list_connections` | Lista todas as conexões DBeaver (sem senhas expostas) |
| `get_connection` | Retorna detalhes de uma conexão pelo nome (sem senha) |
| `add_connection` | Adiciona uma nova conexão |
| `edit_connection` | Edita host, porta ou banco |
| `remove_connection` | Remove uma conexão |
| `test_connection` | Testa conectividade e retorna versão do MySQL |

### Execução de Queries

| Tool | Descrição |
|---|---|
| `run_query` | Executa SELECT / SHOW / EXPLAIN (somente leitura, bloqueia escritas) |
| `run_write` | Executa INSERT / UPDATE / DELETE / DDL (exige `confirmed: true`) |

### Inspeção de Schema

| Tool | Descrição |
|---|---|
| `list_tables` | Lista tabelas de um banco |
| `describe_table` | Mostra colunas, índices e CREATE TABLE |

### Performance e Monitoramento

| Tool | Descrição |
|---|---|
| `explain_query` | Roda EXPLAIN e aponta red flags (full scan, filesort, tabelas temporárias) |
| `show_processlist` | Mostra queries em execução |
| `show_slow_queries` | Lista queries lentas do performance_schema |

## Permissões

Controle quais operações SQL são permitidas globalmente ou por conexão via `~/.dbeaver-mcp/settings.json`:

```json
{
  "permissions": {
    "global": {
      "allowed_operations": ["SELECT", "SHOW", "EXPLAIN", "DESCRIBE"],
      "blocked_operations": ["DROP", "TRUNCATE"]
    },
    "connections": {
      "producao": {
        "allowed_operations": ["SELECT", "SHOW", "EXPLAIN", "DESCRIBE"]
      },
      "staging": {
        "allowed_operations": ["SELECT", "INSERT", "UPDATE", "DELETE", "SHOW", "EXPLAIN", "DESCRIBE", "CREATE", "ALTER"]
      }
    }
  }
}
```

**Como a resolução de permissões funciona:**

1. Existe uma entrada específica para esta conexão em `connections`? → Usa essas permissões (override total)
2. Não tem entrada específica? → Usa permissões `global`
3. Não existe `settings.json` ou não tem chave `permissions`? → Tudo é permitido (backward-compatible)

**Whitelist vs blacklist:**
- `allowed_operations` — somente essas operações são permitidas (whitelist)
- `blocked_operations` — essas operações são sempre bloqueadas, mesmo que não estejam na whitelist

**Operações reconhecidas:** `SELECT`, `SHOW`, `EXPLAIN`, `DESCRIBE`, `INSERT`, `UPDATE`, `DELETE`, `CREATE`, `ALTER`, `DROP`, `TRUNCATE`, `GRANT`, `REVOKE`, `FLUSH`, `OPTIMIZE`, `REPAIR`, `USE`, `SET`

## Caminhos do Workspace DBeaver

O servidor detecta automaticamente seu workspace DBeaver:

| OS | Caminho |
|---|---|
| macOS | `~/Library/DBeaverData/workspace6/General/.dbeaver/` |
| Linux | `~/.local/share/DBeaverData/workspace6/General/.dbeaver/` |
| Windows | `%APPDATA%\DBeaverData\workspace6\General\.dbeaver\` |

Caminhos adicionais são verificados para instalações alternativas (Homebrew, Snap, etc.).

## Testar Sem Claude

```bash
# Listar tools disponíveis
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | node ~/.skills/dbeaver-mcp/dist/index.js
```

## Estrutura do Projeto

```
dbeaver-mcp/
├── src/
│   ├── index.ts            # Entry point do servidor MCP (transporte stdio)
│   ├── cli.ts              # Dispatcher CLI (install, --help, --version, ou inicia servidor)
│   ├── dbeaver.ts          # Core: leitura/escrita configs DBeaver, crypto AES-128-CBC
│   ├── permissions.ts      # Sistema de permissões (global + por conexão)
│   ├── mysql.ts            # Conexão e execução de queries MySQL (mysql2)
│   ├── commands/
│   │   └── install.ts      # Instalador integrado (verifica DBeaver, cria config, registra no Claude)
│   └── tools/
│       ├── connections.ts  # Tools: list, get, add, edit, remove, test conexão
│       ├── queries.ts      # Tools: run_query, run_write
│       └── schema.ts       # Tools: list_tables, describe_table, explain, processlist, slow queries
├── dist/                   # JS compilado (gerado pelo tsc)
├── references/
│   ├── dbeaver/            # Internos do DBeaver (credenciais, datasources, workspace)
│   └── mysql/              # 15 guias de referência MySQL
├── package.json            # Pronto para NPX com campo bin
├── tsconfig.json           # Config TypeScript (ES2022, strict)
├── settings.example.json   # Exemplo de config de permissões
├── SKILL.md                # Definição de skill para agentes AI
├── CLAUDE.md               # Instruções do projeto para Claude Code
└── .gitignore              # Bloqueia credenciais e arquivos sensíveis
```

## Requisitos

- **Node.js 18+**
- **DBeaver** instalado com pelo menos uma conexão salva
- **MySQL** acessível da sua máquina

### Dependências

| Pacote | Finalidade |
|---|---|
| `@modelcontextprotocol/sdk` | Framework do servidor MCP (transporte stdio) |
| `mysql2` | Driver MySQL (async/await) |
| `zod` | Validação de schemas de input das tools |

## Licença

MIT
