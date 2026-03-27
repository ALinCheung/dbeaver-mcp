# dbeaver-mcp

MCP server that exposes your DBeaver connections to Claude as tools. Decrypts credentials in memory — never persists passwords to disk.

Use your existing DBeaver database connections directly from Claude Code or Claude Desktop to query, manage, and analyze MySQL databases without re-entering credentials.

## How It Works

```
Claude (Code / Desktop)
    ↓ MCP stdio (JSON-RPC 2.0)
dbeaver-mcp server (Python)
    ├── Reads DBeaver's data-sources.json + credentials-config.json
    ├── Decrypts passwords in memory (AES-CBC, DBeaver's built-in key)
    └── Connects to MySQL via mysql-connector-python
```

## Quick Start

### 1. Clone & Install

**macOS:**
```bash
git clone https://github.com/lucascborges/dbeaver-mcp.git ~/.dbeaver-mcp
cd ~/.dbeaver-mcp && ./install/mac.sh
```

**Linux:**
```bash
git clone https://github.com/lucascborges/dbeaver-mcp.git ~/.dbeaver-mcp
cd ~/.dbeaver-mcp && ./install/linux.sh
```

**Windows (PowerShell):**
```powershell
git clone https://github.com/lucascborges/dbeaver-mcp.git $env:USERPROFILE\.dbeaver-mcp
cd $env:USERPROFILE\.dbeaver-mcp; .\install\windows.ps1
```

The install script will:
- Check for Python 3 and install pip dependencies
- Verify your DBeaver workspace exists
- Register the server with your OS service manager (launchd / systemd)
- Register the MCP server with Claude Code (if installed)

### 2. Manual Setup (if not using install scripts)

```bash
pip install mysql-connector-python pycryptodome
```

**Claude Code:**
```bash
claude mcp add dbeaver-mcp -- python /path/to/dbeaver-mcp/scripts/server.py
```

**Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "dbeaver-mcp": {
      "command": "python",
      "args": ["/path/to/dbeaver-mcp/scripts/server.py"]
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
| `add_connection` | Add a new connection to DBeaver |
| `edit_connection` | Edit host, port, database, user, or password |
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

## Security

- **Passwords are never written to disk or logs** — decrypted only in memory
- `credentials-config.json` and `data-sources.json` are in `.gitignore`
- `run_query` **blocks** write operations (INSERT, UPDATE, DELETE, DROP, etc.)
- `run_write` **requires** `confirmed: true` before executing — prevents accidental writes

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
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | python scripts/server.py

# List your DBeaver connections
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_connections","arguments":{}}}' | python scripts/server.py
```

## Project Structure

```
dbeaver-mcp/
├── dbeaver.py              # Core library: read/write DBeaver configs, encrypt/decrypt
├── scripts/
│   └── server.py           # MCP server (stdio, JSON-RPC 2.0) — 13 tools
├── install/
│   ├── mac.sh              # macOS: pip + launchd + Claude registration
│   ├── linux.sh            # Linux: pip + systemd user service + Claude registration
│   └── windows.ps1         # Windows: pip + Claude registration + .bat helper
├── references/
│   ├── dbeaver/            # DBeaver internals (credentials, datasources, workspace)
│   └── mysql/              # 15 MySQL reference guides (indexes, queries, locking, DDL, etc.)
├── SKILL.md                # AI agent skill definition with workflows and best practices
├── CLAUDE.md               # Project instructions for Claude Code
├── requirements.txt        # mysql-connector-python, pycryptodome
└── .gitignore              # Blocks credentials and sensitive files
```

## Requirements

- **Python 3.8+**
- **DBeaver** installed with at least one saved connection
- **MySQL** database accessible from your machine

### Python Dependencies

| Package | Purpose |
|---|---|
| `mysql-connector-python` | MySQL database driver |
| `pycryptodome` | AES decryption of DBeaver credentials |

## License

MIT
