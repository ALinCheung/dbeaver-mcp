---
name: dbeaver-mcp
description: |
  Connects to MySQL, PostgreSQL, Oracle, and Redis via DBeaver credentials, executes queries,
  manages DBeaver connections (list, add, edit, remove), and applies best practices
  for schema, indexing, query optimization, and database operations. Use ALWAYS
  when the user mentions database, MySQL, PostgreSQL, Oracle, Redis, SQL queries,
  DBeaver connection, schema, tables, indexes, performance, deadlocks, migrations, or
  asks to run/query/analyze data. Also use when the user says
  "connect to database", "run this query", "show tables", "add connection in DBeaver".
---

# DBeaver MCP — MySQL + PostgreSQL + Oracle + Redis + DBeaver Connection Manager

Complete skill for operating MySQL, PostgreSQL, Oracle, and Redis via DBeaver credentials with database best practices.

## Architecture

```
Claude (skill)
    ↓ MCP stdio
dbeaver-mcp server (Node.js)
├── Reads DBeaver credentials (in memory, never on disk)
├── Manages data-sources.json (add/edit/remove connections)
├── Executes MySQL queries via mysql2
├── Executes PostgreSQL queries via pg
├── Executes Oracle queries via oracledb
└── Executes Redis commands via ioredis
```

## Quick Start

1. Check if MCP server is running: ask the user if they installed via `npx dbeaver-mcp install`
2. If not installed: instruct to install (see Installation section below)
3. List available connections with `list_connections`
4. Ask which connection to use if not obvious in context

---

## Available MCP Tools

### DBeaver Connections

| Tool | Description |
|---|---|
| `list_connections` | List all DBeaver connections with host/port/database |
| `get_connection` | Returns details of a connection by name |
| `add_connection` | Add new connection to DBeaver (configure credentials in DBeaver) |
| `edit_connection` | Edit host, port or database of a connection (credentials via DBeaver) |
| `remove_connection` | Remove a connection from DBeaver (asks for confirmation) |
| `test_connection` | Test if a connection is working |

### MySQL

| Tool | Description |
|---|---|
| `run_query` | Execute SELECT, SHOW, EXPLAIN, DESCRIBE |
| `run_write` | Execute INSERT, UPDATE, DELETE, DDL (asks for confirmation) |
| `list_tables` | List tables in a database |
| `describe_table` | Describe structure, indexes and constraints of a table |
| `explain_query` | Run EXPLAIN and interpret execution plan |
| `show_processlist` | Show running queries on server (MySQL) |
| `show_slow_queries` | List slow queries from performance_schema (MySQL) |

### PostgreSQL

|| Tool | Description |
||---|---|
|| `run_query` | Execute SELECT, SHOW, EXPLAIN, DESCRIBE |
|| `run_write` | Execute INSERT, UPDATE, DELETE, DDL (asks for confirmation) |
|| `list_tables` | List tables in a database (uses information_schema.tables) |
|| `describe_table` | Describe structure, indexes and constraints of a table |
|| `explain_query` | Run EXPLAIN and interpret execution plan |
|| `show_processlist` | Show running queries (uses pg_stat_activity) |
|| `show_slow_queries` | List slow queries (uses pg_stat_statements) |

### Oracle

|| Tool | Description |
||---|---|
|| `run_query` | Execute SELECT, SHOW, EXPLAIN, DESCRIBE |
|| `run_write` | Execute INSERT, UPDATE, DELETE, MERGE, DDL (asks for confirmation) |
|| `list_tables` | List tables in a database (uses ALL_TABLES) |
|| `describe_table` | Describe structure, indexes and constraints of a table |
|| `explain_query` | Run EXPLAIN PLAN and interpret execution plan |
| `show_processlist` | Show active sessions (uses V$SESSION) |
| `show_slow_queries` | List slow queries (uses V$SQL by average time) |

### Redis

||| Tool | Description |
|||---|---|
||| `run_query` | Execute READ commands (GET, LRANGE, SCAN, etc.) |
||| `run_write` | Execute WRITE commands (SET, DEL, LPUSH, etc.) (asks for confirmation) |
||| `list_tables` | List keys in Redis (uses SCAN) |
||| `describe_table` | Returns type and TTL of a key |
||| `explain_query` | Execute Redis DEBUG command for analysis |
||| `show_processlist` | List client connections (CLIENT LIST) |
||| `show_slow_queries` | List slow commands (SLOWLOG) |

---

## Standard Workflow

### For queries and analysis
1. `list_connections` → identify the correct connection
2. `test_connection` → verify connectivity
3. `list_tables` or `describe_table` → understand the schema
4. `explain_query` before suggesting indexes
5. `run_query` → execute and analyze result

### For destructive operations (DELETE, DROP, TRUNCATE)
1. Always confirm with the user before executing
2. Suggest backup or equivalent `SELECT` first
3. Use `run_write` with flag `--dry-run` if available

### For managing DBeaver connections
1. `list_connections` → see what already exists
2. `add_connection` / `edit_connection` / `remove_connection` as needed
3. `test_connection` after any changes

---

## MySQL — Best Practices

### Schema Design
- PKs: `BIGINT UNSIGNED AUTO_INCREMENT` for OLTP. Avoid random UUID as PK clustered index.
- Always `utf8mb4` / `utf8mb4_0900_ai_ci`. Prefer `NOT NULL`, `DATETIME` over `TIMESTAMP`.
- Lookup tables instead of `ENUM`. Normalize to 3NF; denormalize only on measured hot paths.

### Indexing
- Order in composite index: equality first, then range/sort (leftmost prefix rule).
- Range predicates limit index use for subsequent columns.
- Audit via `performance_schema` — remove indexes with `COUNT_READ = 0`.

### Query Optimization
- Check `EXPLAIN` — red flags: `type: ALL`, `Using filesort`, `Using temporary`.
- Cursor pagination, not `OFFSET`. Avoid functions on indexed columns in `WHERE`.
- Batch inserts (500–5000 rows). `UNION ALL` over `UNION` when dedup is unnecessary.

### Transactions & Locking
- Default: `REPEATABLE READ` (gap locks). Use `READ COMMITTED` for high contention.
- Consistent row access prevents deadlocks. Retry on error 1213 with backoff.
- Do I/O outside transactions. Use `SELECT ... FOR UPDATE` sparingly.

### Operations
- Use online DDL (`ALGORITHM=INPLACE`) when possible; test on replicas first.
- Tune connection pooling — avoid exhausting `max_connections` under load.
- Monitor replication lag; avoid stale reads from replicas during writes.

---

## PostgreSQL — Best Practices

### Schema Design
- PKs: `BIGSERIAL` or `GENERATED ALWAYS AS IDENTITY` for OLTP. Avoid random UUID as PK if not needed.
- Always `utf8` / `en_US.UTF-8`. Prefer `NOT NULL`, `TIMESTAMP WITH TIME ZONE` over `TIMESTAMP`.
- Lookup tables instead of `ENUM`. Normalize to 3NF; denormalize only on measured hot paths.

### Indexing
- Composite indexes: order matters — equality first, then range/sort.
- Range predicates limit index use for subsequent columns.
- Use `INCLUDE` in indexes to cover queries without additional table hit.
- Monitor index usage via `pg_stat_user_indexes`.

### Query Optimization
- Check `EXPLAIN (ANALYZE, BUFFERS)` — red flags: Seq Scan, Hash Join with large rows, Sort with high cost.
- Cursor pagination (`WHERE id > last_id`) or `KEYSETpagination`, not `OFFSET`.
- Avoid functions on indexed columns in `WHERE` — use expression indexes if needed.
- Batch inserts via `COPY` for large volumes.

### Transactions & Locking
- Default: `READ COMMITTED`. Use `REPEATABLE READ` for stronger consistency.
- Consistent row access prevents deadlocks. Retry on error 40001 with backoff.
- Keep transactions short — avoid long transactions that cause MVCC bloat.

### Operations
- Use `CREATE INDEX CONCURRENTLY` for indexes in production — does not block writes.
- Monitor `pg_stat_activity` for slow queries and locks.
- VACUUM and ANALYZE are essential — autovacuum covers most cases.

---

## Oracle — Best Practices

### Schema Design
- PKs: `NUMBER GENERATED ALWAYS AS IDENTITY` for OLTP.
- Prefer `NOT NULL`, `TIMESTAMP` or `DATE` as needed.
- Lookup tables instead of `ENUM`. Normalize to 3NF; denormalize only on measured hot paths.

### Indexing
- Order in composite index: equality first, then range/sort.
- Range predicates limit index use for subsequent columns.
- Use functional indexes for computed columns.
- Monitor index usage via `USER_INDEXES` / `DBA_INDEXES`.

### Query Optimization
- Check `EXPLAIN PLAN` — red flags: FULL TABLE SCAN, SORT, HASH JOIN with large datasets.
- Pagination via `ROWNUM` or `FETCH FIRST N ROWS ONLY` (Oracle 12c+).
- Avoid functions on indexed columns in `WHERE`.
- Use bind variables for repeated queries.

### Transactions & Locking
- Default: `READ COMMITTED`. Use `SERIALIZABLE` for stronger consistency (with care).
- Deadlocks can occur — implement retry logic with exponential backoff.
- Minimize lock hold time — don't do user interaction inside transactions.

### Operations
- Use `DBMS_SCHEDULER` for scheduled jobs.
- Monitor `V$SESSION` and `V$SQL` for performance.
- Partitioning is powerful for large tables — use `RANGE` or `LIST` partitioning.

---

## Redis — Best Practices

### Schema Design
- Keys: use descriptive names with `:` as separator (e.g., `user:123:profile`).
- Prefer native structures (HASH, LIST, SET, ZSET) over JSON serialization when possible.
- TTL on all temporary keys — avoid keys that grow infinitely.

### Operations
- `SCAN` instead of `KEYS` in production (KEYS blocks the server).
- `MULTI/EXEC` for transactions; use Lua scripts for complex atomic operations.
- `BITCOUNT`, `HINCRBY` for counters — atomic and efficient.
- Monitor `slowlog` — O(N) commands with large datasets are problematic.

### Performance
- Connection pooling: ioredis manages natively; use `maxRetriesPerRequest` configured.
- Pipelining for batch commands — reduces round-trips.
- `MONITOR` only temporarily — significant impact in production.

### Operations
- `BGSAVE` for async snapshots; `LASTSAVE` to check.
- `INFO memory` to monitor memory usage.
- `CLIENT KILL` to disconnect specific clients (use with care).

---

## Detailed References

Read the files below as needed (don't load all at once):

**Schema and types:**
- `references/mysql/primary-keys.md` — PK design, UUID vs BIGINT, clustered index
- `references/mysql/data-types.md` — numeric, string, datetime, JSON types
- `references/mysql/character-sets.md` — utf8mb4, collations, migrations

**Indexing:**
- `references/mysql/composite-indexes.md` — leftmost prefix rule, column order
- `references/mysql/covering-indexes.md` — index-only scans, EXPLAIN signals
- `references/mysql/fulltext-indexes.md` — text search, BOOLEAN MODE
- `references/mysql/index-maintenance.md` — unused, redundant, INVISIBLE indexes

**Queries:**
- `references/mysql/explain-analysis.md` — access types, Extra flags, key_len
- `references/mysql/query-optimization-pitfalls.md` — non-sargable predicates, LIKE, OR
- `references/mysql/n-plus-one.md` — N+1 detection and fix, eager loading
- `references/mysql/json-column-patterns.md` — generated columns, ->> operators

**Transactions:**
- `references/mysql/isolation-levels.md` — REPEATABLE READ vs READ COMMITTED
- `references/mysql/deadlocks.md` — common causes, diagnosis, retry pattern
- `references/mysql/row-locking-gotchas.md` — next-key locks, gap locks, FOR UPDATE

**Operations:**
- `references/mysql/online-ddl.md` — INSTANT/INPLACE/COPY, external tools
- `references/mysql/connection-management.md` — pool sizing, timeouts, ProxySQL
- `references/mysql/replication-lag.md` — stale reads, GTID, mitigation strategies
- `references/mysql/partitioning.md` — RANGE, LIST, HASH, partition management

**DBeaver:**
- `references/dbeaver/credentials.md` — how DBeaver stores credentials by OS
- `references/dbeaver/datasources.md` — data-sources.json structure, important fields
- `references/dbeaver/workspace.md` — workspace paths by OS, DBeaver versions

**PostgreSQL:**
- `references/postgres/primary-keys.md` — PK design, serial, identity, uuid
- `references/postgres/indexing.md` — index types, composite indexes, include columns
- `references/postgres/explain-analysis.md` — reading EXPLAIN, red flags
- `references/postgres/transactions.md` — isolation levels, locking, MVCC, deadlocks
- `references/postgres/partitioning.md` — RANGE, LIST, HASH partitioning

**Oracle:**
- `references/oracle/primary-keys.md` — PK design, identity, sequences
- `references/oracle/indexing.md` — index types, bitmap, function-based indexes
- `references/oracle/explain-plan.md` — reading EXPLAIN PLAN, red flags
- `references/oracle/transactions.md` — isolation levels, locking, deadlocks
- `references/oracle/partitioning.md` — RANGE, LIST, HASH, INTERVAL partitioning

---

## Permissions

The server supports permission control via `~/.dbeaver-mcp/settings.json`:

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

**Permission resolution logic:**
- If connection has entry in `connections`, uses its permissions (total override)
- If not, uses `global`
- If no `settings.json` or `permissions`, everything is allowed (backward-compatible)
- `allowed_operations` is whitelist — only listed operations are permitted
- `blocked_operations` is optional blacklist — blocks even if not explicitly whitelisted

**Recognized operations:** `SELECT`, `SHOW`, `EXPLAIN`, `DESCRIBE`, `INSERT`, `UPDATE`, `DELETE`, `CREATE`, `ALTER`, `DROP`, `TRUNCATE`, `GRANT`, `REVOKE`, `FLUSH`, `OPTIMIZE`, `REPAIR`, `USE`, `SET`

---

## Guardrails

- Credentials never travel via MCP — managed exclusively by DBeaver
- Never log or display passwords — credentials stay only in memory
- Always ask for confirmation before destructive operations (DROP, DELETE without WHERE, TRUNCATE)
- Warn about `ALGORITHM=COPY` on large tables before running DDL
- Indicate MySQL version when behavior is specific (e.g., INSTANT DDL only in 8.0+)
- Prefer measured evidence (`EXPLAIN`, `performance_schema`) over rules of thumb
- Never expose the contents of `credentials-config.json` — only connection metadata
- Respect permissions configured in `~/.dbeaver-mcp/settings.json`

---

## Installation

### One-time setup

**Step 1: Clone and build**

```bash
git clone https://github.com/ALinCheung/dbeaver-mcp.git ~/.claude/skills/dbeaver-mcp
cd ~/.claude/skills/dbeaver-mcp
npm install && npm run build
npm link
```

**Step 2: Verify installation**

```bash
npx dbeaver-mcp --version
```

**Step 3: Register MCP server**

Add the following to `~/.claude.json` (Claude Code) or `~/.config/opencode/opencode.json` (OpenCode):

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