# dbeaver-mcp

MCP server que expõe conexões DBeaver ao Claude como tools. Lê credenciais criptografadas do DBeaver em memória — nunca persiste senhas em disco.

## Estrutura

```
dbeaver-mcp/
├── src/
│   ├── index.ts            # Entry point: MCP server setup + stdio transport
│   ├── dbeaver.ts          # Core: ler configs DBeaver, crypto AES-128-CBC, CRUD conexões
│   ├── permissions.ts      # Carregar settings.json, check de permissão por conexão
│   ├── mysql.ts            # Wrappers de conexão e execução de queries (mysql2)
│   ├── postgres.ts         # Wrappers de conexão e execução de queries (pg)
│   ├── oracle.ts           # Wrappers de conexão e execução de queries (oracledb)
│   └── tools/
│       ├── connections.ts  # Tools: list, get, add, edit, remove, test connection
│       ├── queries.ts      # Tools: run_query, run_write
│       └── schema.ts       # Tools: list_tables, describe_table, explain, processlist, slow queries
├── dist/                   # JS compilado (gitignored)
├── install/                # Scripts de instalação por OS
├── references/             # Docs de referência DBeaver + MySQL + PostgreSQL + Oracle
├── package.json            # NPX-ready com bin field
├── tsconfig.json           # TypeScript config
└── settings.example.json   # Exemplo de permissões
```

## Dependências

```bash
npm install
```

## Build

```bash
npm run build
```

## Rodar o servidor

```bash
node dist/index.js
```

O servidor usa protocolo MCP via stdio (JSON-RPC 2.0).

## Bancos de dados suportados

| Driver | Banco | Pacote |
|--------|-------|--------|
| `mysql8` | MySQL | mysql2 |
| `postgres` / `postgresql` | PostgreSQL | pg |
| `oracle` | Oracle | oracledb |

## Registrar no Claude Code

```bash
claude mcp add dbeaver-mcp -- npx dbeaver-mcp
```

## Registrar no Claude Desktop

```json
{
  "mcpServers": {
    "dbeaver-mcp": {
      "command": "npx",
      "args": ["dbeaver-mcp"]
    }
  }
}
```

## Tools disponíveis

| Tool | Descrição |
|---|---|
| `list_connections` | Lista conexões DBeaver (sem senhas) |
| `get_connection` | Retorna detalhes de uma conexão pelo nome |
| `add_connection` | Adiciona nova conexão (suporta mysql8, postgres, oracle) |
| `edit_connection` | Edita host/porta/banco (credenciais via DBeaver) |
| `remove_connection` | Remove uma conexão |
| `test_connection` | Testa conectividade |
| `run_query` | SELECT/SHOW/EXPLAIN (somente leitura) |
| `run_write` | INSERT/UPDATE/DELETE/DDL (requer confirmação) |
| `list_tables` | Lista tabelas de um banco |
| `describe_table` | Estrutura, índices e CREATE TABLE |
| `explain_query` | EXPLAIN com análise de red flags |
| `show_processlist` | Queries em execução |
| `show_slow_queries` | Queries lentas (usa views específicas do banco) |

## Permissões

O sistema suporta controle de permissões via `~/.dbeaver-mcp/settings.json`:

- **Global** — define operações SQL permitidas por padrão
- **Por conexão** — override das permissões globais para conexões específicas

Lógica de resolução: conexão específica → global → tudo permitido (backward-compatible).

Veja `settings.example.json` para exemplo de configuração.

## Segurança

- Senhas descriptografadas em memória, nunca logadas
- `credentials-config.json` e `data-sources.json` estão no `.gitignore`
- `run_write` exige `confirmed: true` antes de executar
- `run_query` bloqueia INSERT/UPDATE/DELETE/DROP (para todos os bancos)
- Permissões configuráveis por conexão via `~/.dbeaver-mcp/settings.json`
- Oracle: detecta MERGE, PL/SQL blocks como operações de escrita

## Caminhos do workspace DBeaver por OS

| OS | Caminho |
|---|---|
| macOS | `~/Library/DBeaverData/workspace6/General/.dbeaver/` |
| Linux | `~/.local/share/DBeaverData/workspace6/General/.dbeaver/` |
| Windows | `%APPDATA%\DBeaverData\workspace6\General\.dbeaver\` |

## Testar sem Claude

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | node dist/index.js
```
