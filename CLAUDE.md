# dbeaver-mcp

MCP server that exposes DBeaver connections to Claude as tools. Reads encrypted credentials from DBeaver in memory — never persists passwords to disk.

## Structure

```
dbeaver-mcp/
├── src/
│   ├── index.ts            # Entry point: MCP server setup + stdio transport
│   ├── dbeaver.ts          # Core: read DBeaver configs, crypto AES-128-CBC, CRUD connections
│   ├── cli.ts              # CLI dispatcher with direct connect mode support
│   ├── permissions.ts      # Load settings.json, check permission by connection
│   ├── mysql.ts            # Connection and query execution wrappers (mysql2)
│   ├── postgres.ts         # Connection and query execution wrappers (pg)
│   ├── oracle.ts           # Connection and query execution wrappers (oracledb)
│   ├── redis.ts            # Connection and query execution wrappers (ioredis)
│   └── tools/
│       ├── connections.ts  # Tools: list, get, add, edit, remove, test connection
│       ├── queries.ts      # Tools: run_query, run_write
│       └── schema.ts       # Tools: list_tables, describe_table, explain, processlist, slow queries
├── dist/                   # Compiled JS (gitignored)
├── install/                # Installation scripts by OS
├── references/             # Reference docs for DBeaver + MySQL + PostgreSQL + Oracle
├── package.json            # NPX-ready with bin field
├── tsconfig.json           # TypeScript config
└── settings.example.json   # Permission example
```

## Dependencies

```bash
npm install
```

## Build

```bash
npm run build
```

## Run the server

```bash
node dist/index.js
```

The server uses MCP protocol via stdio (JSON-RPC 2.0).

## Supported Databases

| Driver | Database | Package |
|--------|---------|---------|
| `mysql8`, `mysql5`, `mariadb` | MySQL 5.x/8.x, MariaDB | mysql2/promise |
| `postgres`, `postgresql`, `postgres-jdbc` | PostgreSQL | pg |
| `oracle` | Oracle | oracledb |
| `redis` | Redis | ioredis |

## Direct Connect Mode

When DBeaver is not installed, use CLI arguments to connect directly:

```bash
npx dbeaver-mcp --host <host> --username <user> --password <pass> --database <db> [--driver mysql8] [--port <port>]
```

Supported CLI arguments:

| Argument | Short | Description |
|----------|-------|-------------|
| `--host` | `-h` | Database host |
| `--port` | `-p` | Port |
| `--username` | `-u` | Username (Redis 不需要) |
| `--password` | `-P` | Password |
| `--database` | `-d` | Database name |
| `--driver` | `-D` | Driver type (default: mysql8) |

Supported drivers: `mysql8`, `mysql5`, `mariadb`, `postgres`, `postgresql`, `postgres-jdbc`, `oracle`, `redis`

**Note**: Redis 连接不需要 `--username` 参数。

Example MCP server configuration:

```json
{
  "mcpServers": {
    "dbeaver-mcp": {
      "command": "npx",
      "args": [
        "dbeaver-mcp",
        "--host", "192.168.1.100",
        "--port", "3306",
        "--username", "admin",
        "--password", "secret",
        "--database", "mydb",
        "--driver", "mysql8"
      ]
    }
  }
}
```

Redis 配置示例：

```json
{
  "mcpServers": {
    "dbeaver-mcp-redis": {
      "command": "npx",
      "args": [
        "dbeaver-mcp",
        "--host", "192.168.1.100",
        "--port", "6379",
        "--password", "redis_password",
        "--database", "0",
        "--driver", "redis"
      ]
    }
  }
}
```

## Register in Claude Code

Add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "dbeaver-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["dbeaver-mcp"],
      "env": {}
    }
  }
}
```

## Available Tools

| Tool | Description |
|---|---|
| `list_connections` | List all DBeaver connections (without passwords) |
| `get_connection` | Get connection details by name |
| `add_connection` | Add new connection (supports mysql8, mysql5, mariadb, postgres, oracle, redis) |
| `edit_connection` | Edit host/port/database (credentials via DBeaver) |
| `remove_connection` | Remove a connection |
| `test_connection` | Test connection connectivity |
| `run_query` | SELECT/SHOW/EXPLAIN (read-only) |
| `run_write` | INSERT/UPDATE/DELETE/DDL (requires confirmation) |
| `list_tables` | List tables in a database |
| `describe_table` | Structure, indexes and CREATE TABLE |
| `explain_query` | EXPLAIN with red flag analysis |
| `show_processlist` | Running queries on server |
| `show_slow_queries` | Slow queries (uses database-specific views) |

## Permissions

The system supports permission control via `~/.dbeaver-mcp/settings.json`:

- **Global** — defines SQL operations allowed by default
- **Per connection** — overrides global permissions for specific connections

Resolution logic: connection-specific → global → everything allowed (backward-compatible).

See `settings.example.json` for configuration example.

## Security

- Decrypted passwords held in memory only, never logged
- `credentials-config.json` and `data-sources.json` are in `.gitignore`
- `run_write` requires `confirmed: true` before executing
- `run_query` blocks INSERT/UPDATE/DELETE/DROP (for all databases)
- Permissions configurable per connection via `~/.dbeaver-mcp/settings.json`
- Oracle: detects MERGE and PL/SQL blocks as write operations

## DBeaver Workspace Paths by OS

| OS | Path |
|---|---|
| macOS | `~/Library/DBeaverData/workspace6/General/.dbeaver/` |
| Linux | `~/.local/share/DBeaverData/workspace6/General/.dbeaver/` |
| Windows | `%APPDATA%\DBeaverData\workspace6\General\.dbeaver\` |

## Test without Claude

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | node dist/index.js
```