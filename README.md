# dbeaver-mcp

MCP server that exposes your DBeaver connections to Claude as tools. Decrypts credentials in memory — never persists passwords to disk.

**[Leia em Português](README.pt-br.md)**

Use your existing DBeaver database connections directly from Claude Code or Claude Desktop to query, manage, and analyze MySQL, PostgreSQL, and Oracle databases without re-entering credentials.

## How It Works

```
┌─────────────────────────┐
│  Claude Code / Desktop  │
└───────────┬─────────────┘
            │ MCP stdio (JSON-RPC 2.0)
            │ Only tool calls flow here — never raw credentials
            ▼
┌─────────────────────────────────────────────┐
│          dbeaver-mcp (Node.js)              │
│                                             │
│  1. Reads DBeaver's config files from disk  │
│  2. Decrypts credentials in memory only     │
│     (MySQL/mysql2, PostgreSQL/pg, Oracle/oracledb, Redis/ioredis) │
│  4. Returns query results to Claude         │
│  5. Closes connection — nothing persisted   │
└──────┬──────────────────────────┬───────────┘
       │                          │
       ▼                          ▼
  DBeaver workspace         Database server
  (data-sources.json,       (MySQL, PostgreSQL,
   credentials-config.json)   or Oracle)
```

### Step by step

1. **Claude sends a tool call** (e.g. `run_query` with connection name + SQL) over MCP stdio. The MCP protocol only carries the tool name and arguments — no credentials.

2. **dbeaver-mcp resolves the connection** by reading DBeaver's `data-sources.json` to find host, port, and database. It uses a fuzzy name matcher so you don't need exact IDs.

3. **Credentials are decrypted in memory.** DBeaver 21+ encrypts `credentials-config.json` with AES-128-CBC (file-level encryption). dbeaver-mcp reads the binary file, extracts the IV (first 16 bytes), decrypts the rest with DBeaver's built-in key, and parses the JSON. The decrypted password exists only as a variable in memory — never written to disk, logs, or stdout.

4. **A direct database connection is opened** using `mysql2`, `pg`, or `oracledb` depending on the driver type. The connection is used for a single operation.

5. **The query executes and results are returned** as JSON through MCP stdout. Only the query results flow back to Claude — never the password or connection credentials.

6. **The connection is closed immediately** after the query. No connection pool, no background process holding credentials.

## Why It's Secure

### Credentials never leave your machine

```
❌ What dbeaver-mcp does NOT do:
   • Send passwords to Claude/Anthropic servers
   • Write passwords to disk, logs, or environment variables
   • Keep passwords in memory after the query completes
   • Expose passwords through the MCP protocol

✅ What happens instead:
   • Passwords are read from DBeaver's encrypted file
   • Decrypted in a local variable for the duration of one query
   • Used to open a direct MySQL connection from YOUR machine
   • Garbage collected after the connection closes
```

### Defense in depth — 5 layers of protection

| Layer | What it does |
|---|---|
| **1. DBeaver encryption** | Credentials are stored encrypted (AES-128-CBC) on disk. dbeaver-mcp decrypts in memory only when needed. |
| **2. MCP protocol isolation** | The MCP stdio protocol only carries tool names, arguments, and results. Passwords never appear in the protocol stream. Claude never sees your credentials. |
| **3. Read/write separation** | `run_query` blocks all write operations (INSERT, UPDATE, DELETE, DROP). You must explicitly use `run_write` for mutations. |
| **4. Write confirmation** | `run_write` requires `confirmed: true` before executing. This forces a two-step process that prevents accidental data changes. |
| **5. Per-connection permissions** | `~/.dbeaver-mcp/settings.json` lets you whitelist/blacklist SQL operations per connection. Lock production to SELECT-only. |

### What Claude sees vs. what it doesn't

| Claude CAN see | Claude CANNOT see |
|---|---|
| Connection names and hosts | Passwords |
| Database names | Encrypted credential files |
| Query results | Raw credential JSON |
| Table schemas | Your filesystem |

### Source code is open

Every line of the credential handling is in [`src/dbeaver.ts`](src/dbeaver.ts). The decryption function is ~10 lines. There are no network calls, no telemetry, no external services. You can audit it in minutes.

## Quick Start

### Option 1: One command (recommended)

Works on all operating systems. Registers dbeaver-mcp globally in Claude Code:

```bash
claude mcp add dbeaver-mcp -- npx dbeaver-mcp
```

### Option 2: Built-in installer

Runs setup interactively — verifies your DBeaver workspace, creates `~/.dbeaver-mcp/settings.json`, and registers the server in Claude Code automatically:

```bash
npx dbeaver-mcp install
```

To register globally for all projects, add `--scope user`:

```bash
claude mcp add dbeaver-mcp --scope user -- npx dbeaver-mcp
```

**Claude Desktop** (`claude_desktop_config.json`):

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

### Option 3: Manual Setup

```bash
git clone https://github.com/lucascborges/dbeaver-mcp.git ~/.skills/dbeaver-mcp
cd ~/.skills/dbeaver-mcp && npm install && npm run build
```

**Register in Claude Code:**
```bash
claude mcp add dbeaver-mcp -- node ~/.skills/dbeaver-mcp/dist/index.js
```

**Register in Claude Desktop** (`claude_desktop_config.json`):
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

### Option 4: 打包后注册（本地构建）

如果你已经克隆项目并构建了打包文件，可以使用以下方法注册 MCP：

**构建项目：**
```bash
git clone https://github.com/lucascborges/dbeaver-mcp.git
cd dbeaver-mcp
npm install
npm run build
```

**Claude Code 注册：**
```bash
claude mcp add dbeaver-mcp -- node /path/to/dbeaver-mcp/dist/index.js
```

全局注册（所有项目可用）：
```bash
claude mcp add dbeaver-mcp --scope user -- node /path/to/dbeaver-mcp/dist/index.js
```

**OpenCode 注册：**

在 OpenCode 的 MCP 配置中添加：

```json
{
  "mcpServers": {
    "dbeaver-mcp": {
      "command": "node",
      "args": ["/path/to/dbeaver-mcp/dist/index.js"]
    }
  }
}
```

或者通过命令行注册：
```bash
opencode mcp add dbeaver-mcp -- node /path/to/dbeaver-mcp/dist/index.js
```

**注意：** 请将 `/path/to/dbeaver-mcp/` 替换为你的实际项目路径。

## Available Tools

### Connection Management

| Tool | Description |
|---|---|
| `list_connections` | List all DBeaver connections (no passwords exposed) |
| `get_connection` | Get connection details by name (no password exposed) |
| `add_connection` | Add a new connection (supports mysql, postgres, oracle drivers) |
| `edit_connection` | Edit host, port, or database |
| `remove_connection` | Remove a connection |
| `test_connection` | Test connectivity and return database version |

### Query Execution

| Tool | Description |
|---|---|
| `run_query` | Execute SELECT / SHOW / EXPLAIN (read-only, blocks writes) |
| `run_write` | Execute INSERT / UPDATE / DELETE / DDL (requires `confirmed: true`) |

### Schema Inspection

| Tool | Description |
|---|---|
| `list_tables` | List tables in a database (uses database-specific metadata queries) |
| `describe_table` | Show columns, indexes, and table structure |

### Performance & Monitoring

| Tool | Description |
|---|---|
| `explain_query` | Run EXPLAIN and flag red flags (full scans, filesort, temp tables) |
| `show_processlist` | Show currently running queries (uses database-specific queries) |
| `show_slow_queries` | List slow queries (uses database-specific performance views) |

## Permissions

Control which SQL operations are allowed globally or per connection via `~/.dbeaver-mcp/settings.json`:

```json
{
  "permissions": {
    "global": {
      "allowed_operations": ["SELECT", "SHOW", "EXPLAIN", "DESCRIBE"],
      "blocked_operations": ["DROP", "TRUNCATE"]
    },
    "connections": {
      "production": {
        "allowed_operations": ["SELECT", "SHOW", "EXPLAIN", "DESCRIBE"]
      },
      "staging": {
        "allowed_operations": ["SELECT", "INSERT", "UPDATE", "DELETE", "SHOW", "EXPLAIN", "DESCRIBE", "CREATE", "ALTER"]
      }
    }
  }
}
```

**How permission resolution works:**

1. Is there a specific entry for this connection in `connections`? → Use those permissions (total override)
2. No specific entry? → Use `global` permissions
3. No `settings.json` or no `permissions` key? → Everything is allowed (backward-compatible)

**Whitelist vs blacklist:**
- `allowed_operations` — only these operations are permitted (whitelist)
- `blocked_operations` — these operations are always blocked, even if not whitelisted

**Recognized operations:** `SELECT`, `SHOW`, `EXPLAIN`, `DESCRIBE`, `INSERT`, `UPDATE`, `DELETE`, `CREATE`, `ALTER`, `DROP`, `TRUNCATE`, `GRANT`, `REVOKE`, `FLUSH`, `OPTIMIZE`, `REPAIR`, `USE`, `SET`

## DBeaver Workspace Paths

The server auto-detects your DBeaver workspace:

| OS | Path |
|---|---|
| macOS | `~/Library/DBeaverData/workspace6/General/.dbeaver/` |
| Linux | `~/.local/share/DBeaverData/workspace6/General/.dbeaver/` |
| Windows | `%APPDATA%\DBeaverData\workspace6\General\.dbeaver\` |

Additional paths are checked for alternative installations (Homebrew, Snap, etc.).

## Testing Without Claude

```bash
# List available tools
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | node ~/.skills/dbeaver-mcp/dist/index.js
```

## Project Structure

```
dbeaver-mcp/
├── src/
│   ├── index.ts            # MCP server entry point (stdio transport)
│   ├── cli.ts              # CLI dispatcher (install, --help, --version, or start server)
│   ├── dbeaver.ts          # Core: read/write DBeaver configs, AES-128-CBC crypto
│   ├── permissions.ts      # Permission system (global + per-connection)
│   ├── mysql.ts            # MySQL connection and query execution (mysql2)
│   ├── postgres.ts         # PostgreSQL connection and query execution (pg)
│   ├── oracle.ts           # Oracle connection and query execution (oracledb)
│   ├── commands/
│   │   └── install.ts      # Built-in installer (verify DBeaver, create config, register in Claude)
│   └── tools/
│       ├── connections.ts  # Tools: list, get, add, edit, remove, test connection
│       ├── queries.ts      # Tools: run_query, run_write
│       └── schema.ts       # Tools: list_tables, describe_table, explain, processlist, slow queries
├── dist/                   # Compiled JS (generated by tsc)
├── references/
│   ├── dbeaver/            # DBeaver internals (credentials, datasources, workspace)
│   ├── mysql/              # MySQL reference guides
│   ├── postgres/           # PostgreSQL reference guides
│   └── oracle/             # Oracle reference guides
├── package.json            # NPX-ready with bin field
├── tsconfig.json           # TypeScript config (ES2022, strict)
├── settings.example.json   # Example permissions config
├── SKILL.md                # AI agent skill definition
├── CLAUDE.md               # Project instructions for Claude Code
└── .gitignore              # Blocks credentials and sensitive files
```

## Requirements

- **Node.js 18+**
- **DBeaver** installed with at least one saved connection
- **MySQL**, **PostgreSQL**, or **Oracle** database accessible from your machine

### Dependencies

| Package | Purpose |
|---|---|
| `@modelcontextprotocol/sdk` | MCP server framework (stdio transport) |
| `mysql2` | MySQL database driver (async/await) |
| `pg` | PostgreSQL database driver |
| `oracledb` | Oracle database driver |
| `ioredis` | Redis database driver |
| `zod` | Input schema validation for tool arguments |

## License

MIT
