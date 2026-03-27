# dbeaver-mcp

MCP server that exposes your DBeaver connections to Claude as tools. Decrypts credentials in memory — never persists passwords to disk.

Use your existing DBeaver database connections directly from Claude Code or Claude Desktop to query, manage, and analyze MySQL databases without re-entering credentials.

## How It Works

```
Claude (Code / Desktop)
    ↓ MCP stdio (JSON-RPC 2.0)
dbeaver-mcp server (Node.js)
    ├── Reads DBeaver's data-sources.json + credentials-config.json
    ├── Decrypts passwords in memory (AES-128-CBC, DBeaver's built-in key)
    └── Connects to MySQL via mysql2
```

## Quick Start

### Option 1: NPX (recommended)

```bash
claude mcp add dbeaver-mcp -- npx dbeaver-mcp
```

### Option 2: Clone & Install

**macOS:**
```bash
git clone https://github.com/lucascborges/dbeaver-mcp.git /tmp/dbeaver-mcp
cd /tmp/dbeaver-mcp && ./install/mac.sh
```

**Linux:**
```bash
git clone https://github.com/lucascborges/dbeaver-mcp.git /tmp/dbeaver-mcp
cd /tmp/dbeaver-mcp && ./install/linux.sh
```

**Windows (PowerShell):**
```powershell
git clone https://github.com/lucascborges/dbeaver-mcp.git $env:TEMP\dbeaver-mcp
cd $env:TEMP\dbeaver-mcp; .\install\windows.ps1
```

The install script will:
- Check for Node.js and install npm dependencies
- Copy the project to `~/.skills/dbeaver-mcp` and build
- Verify your DBeaver workspace exists
- Register the server with your OS service manager (launchd / systemd)
- Register the MCP server with Claude Code (if installed)

### Option 3: Manual Setup

```bash
git clone https://github.com/lucascborges/dbeaver-mcp.git
cd dbeaver-mcp && npm install && npm run build
```

**Claude Code:**
```bash
claude mcp add dbeaver-mcp -- npx dbeaver-mcp
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

## Available Tools

### Connection Management

| Tool | Description |
|---|---|
| `list_connections` | List all DBeaver connections (no passwords exposed) |
| `get_connection` | Get connection details by name |
| `add_connection` | Add a new connection (configure credentials in DBeaver) |
| `edit_connection` | Edit host, port, or database (credentials managed via DBeaver) |
| `remove_connection` | Remove a connection |
| `test_connection` | Test connectivity and return MySQL version |

### Query Execution

| Tool | Description |
|---|---|
| `run_query` | Execute SELECT / SHOW / EXPLAIN (read-only) |
| `run_write` | Execute INSERT / UPDATE / DELETE / DDL (requires confirmation) |

### Schema Inspection

| Tool | Description |
|---|---|
| `list_tables` | List tables in a database |
| `describe_table` | Show columns, indexes, and CREATE TABLE statement |

### Performance & Monitoring

| Tool | Description |
|---|---|
| `explain_query` | Run EXPLAIN and flag red flags (full scans, filesort, temp tables) |
| `show_processlist` | Show currently running queries |
| `show_slow_queries` | List slow queries from performance_schema |

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

**Resolution logic:**
- If the connection has an entry in `connections`, use its permissions (total override)
- Otherwise, use `global` permissions
- If `settings.json` or `permissions` doesn't exist, everything is allowed (backward-compatible)
- `allowed_operations` is a whitelist — only listed operations are permitted
- `blocked_operations` is an optional blacklist within global — blocks even if not in the whitelist

**Recognized operations:** `SELECT`, `SHOW`, `EXPLAIN`, `DESCRIBE`, `INSERT`, `UPDATE`, `DELETE`, `CREATE`, `ALTER`, `DROP`, `TRUNCATE`, `GRANT`, `REVOKE`, `FLUSH`, `OPTIMIZE`, `REPAIR`, `USE`, `SET`

The install scripts copy `settings.example.json` to `~/.dbeaver-mcp/settings.json` if it doesn't already exist.

## Security

- **Proxy model** — credentials never flow through MCP; managed exclusively in DBeaver
- **Passwords are never written to disk or logs** — decrypted only in memory for MySQL connections
- `credentials-config.json` and `data-sources.json` are in `.gitignore`
- `run_query` **blocks** write operations (INSERT, UPDATE, DELETE, DROP, etc.)
- `run_write` **requires** `confirmed: true` before executing — prevents accidental writes
- **Configurable permissions** per connection via `~/.dbeaver-mcp/settings.json`

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
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | node dist/index.js
```

## Project Structure

```
dbeaver-mcp/
├── src/
│   ├── index.ts            # MCP server entry point (stdio transport)
│   ├── dbeaver.ts          # Core: read/write DBeaver configs, AES-128-CBC crypto
│   ├── permissions.ts      # Permission system (global + per-connection)
│   ├── mysql.ts            # MySQL connection and query execution (mysql2)
│   └── tools/
│       ├── connections.ts  # Tools: list, get, add, edit, remove, test connection
│       ├── queries.ts      # Tools: run_query, run_write
│       └── schema.ts       # Tools: list_tables, describe_table, explain, processlist, slow queries
├── dist/                   # Compiled JS (generated by tsc)
├── install/
│   ├── mac.sh              # macOS: npm + launchd + Claude registration
│   ├── linux.sh            # Linux: npm + systemd user service + Claude registration
│   └── windows.ps1         # Windows: npm + Claude registration + .bat helper
├── references/
│   ├── dbeaver/            # DBeaver internals (credentials, datasources, workspace)
│   └── mysql/              # 15 MySQL reference guides (indexes, queries, locking, DDL, etc.)
├── package.json            # NPX-ready with bin field
├── tsconfig.json           # TypeScript config
├── settings.example.json   # Example permissions config
├── SKILL.md                # AI agent skill definition with workflows and best practices
├── CLAUDE.md               # Project instructions for Claude Code
└── .gitignore              # Blocks credentials and sensitive files
```

## Requirements

- **Node.js 18+**
- **DBeaver** installed with at least one saved connection
- **MySQL** database accessible from your machine

### Dependencies

| Package | Purpose |
|---|---|
| `@modelcontextprotocol/sdk` | MCP server framework |
| `mysql2` | MySQL database driver |
| `zod` | Input schema validation |

## License

MIT
