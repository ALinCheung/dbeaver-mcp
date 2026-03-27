# dbeaver-mcp

MCP server that exposes your DBeaver connections to Claude as tools. Decrypts credentials in memory — never persists passwords to disk.

Use your existing DBeaver database connections directly from Claude Code or Claude Desktop to query, manage, and analyze MySQL databases without re-entering credentials.

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
│  3. Opens a direct MySQL connection         │
│  4. Returns query results to Claude         │
│  5. Closes connection — nothing persisted   │
└──────┬──────────────────────────┬───────────┘
       │                          │
       ▼                          ▼
  DBeaver workspace         MySQL server
  (data-sources.json,       (your database)
   credentials-config.json)
```

### Step by step

1. **Claude sends a tool call** (e.g. `run_query` with connection name + SQL) over MCP stdio. The MCP protocol only carries the tool name and arguments — no credentials.

2. **dbeaver-mcp resolves the connection** by reading DBeaver's `data-sources.json` to find host, port, and database. It uses a fuzzy name matcher so you don't need exact IDs.

3. **Credentials are decrypted in memory.** DBeaver 21+ encrypts `credentials-config.json` with AES-128-CBC (file-level encryption). dbeaver-mcp reads the binary file, extracts the IV (first 16 bytes), decrypts the rest with DBeaver's built-in key, and parses the JSON. The decrypted password exists only as a variable in memory — never written to disk, logs, or stdout.

4. **A direct MySQL connection is opened** using `mysql2` with the decrypted credentials. The connection has a 10-second timeout and is used for a single operation.

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

### Option 1: Install script (recommended)

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
1. Check for Node.js and npm
2. Copy the project to `~/.skills/dbeaver-mcp`
3. Install dependencies and compile TypeScript
4. Verify your DBeaver workspace is accessible
5. Create `~/.dbeaver-mcp/settings.json` (permissions config)
6. Register with your OS service manager (launchd / systemd)
7. Register the MCP server with Claude Code

### Option 2: Manual Setup

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

## Available Tools

### Connection Management

| Tool | Description |
|---|---|
| `list_connections` | List all DBeaver connections (no passwords exposed) |
| `get_connection` | Get connection details by name (no password exposed) |
| `add_connection` | Add a new connection |
| `edit_connection` | Edit host, port, or database |
| `remove_connection` | Remove a connection |
| `test_connection` | Test connectivity and return MySQL version |

### Query Execution

| Tool | Description |
|---|---|
| `run_query` | Execute SELECT / SHOW / EXPLAIN (read-only, blocks writes) |
| `run_write` | Execute INSERT / UPDATE / DELETE / DDL (requires `confirmed: true`) |

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
│   ├── dbeaver.ts          # Core: read/write DBeaver configs, AES-128-CBC crypto
│   ├── permissions.ts      # Permission system (global + per-connection)
│   ├── mysql.ts            # MySQL connection and query execution (mysql2)
│   └── tools/
│       ├── connections.ts  # Tools: list, get, add, edit, remove, test connection
│       ├── queries.ts      # Tools: run_query, run_write
│       └── schema.ts       # Tools: list_tables, describe_table, explain, processlist, slow queries
├── dist/                   # Compiled JS (generated by tsc)
├── install/
│   ├── mac.sh              # macOS installer
│   ├── linux.sh            # Linux installer
│   └── windows.ps1         # Windows installer
├── references/
│   ├── dbeaver/            # DBeaver internals (credentials, datasources, workspace)
│   └── mysql/              # 15 MySQL reference guides
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
- **MySQL** database accessible from your machine

### Dependencies

| Package | Purpose |
|---|---|
| `@modelcontextprotocol/sdk` | MCP server framework (stdio transport) |
| `mysql2` | MySQL database driver (async/await) |
| `zod` | Input schema validation for tool arguments |

## License

MIT
