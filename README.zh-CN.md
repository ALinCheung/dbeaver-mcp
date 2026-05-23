# dbeaver-mcp

将 DBeaver 连接暴露给 Claude 作为工具使用。在内存中解密凭证，绝不将密码持久化到磁盘。

**[English Version](README.md)**

使用 Claude Code 中现有的 DBeaver 数据库连接，直接查询、管理和分析 MySQL、PostgreSQL、Oracle 和 Redis 数据库，无需重新输入凭证。

## 工作原理

```
┌─────────────────────────┐
│       Claude Code       │
└───────────┬─────────────┘
            │ MCP stdio (JSON-RPC 2.0)
            │ 只有工具调用流经此处 — 从不传输原始凭证
            ▼
┌─────────────────────────────────────────────┐
│          dbeaver-mcp (Node.js)              │
│                                             │
│  1. 从磁盘读取 DBeaver 配置文件              │
│  2. 仅在内存中解密凭证                       │
│     (MySQL/mysql2, PostgreSQL/pg,            │
│      Oracle/oracledb, Redis/ioredis)        │
│  3. 将查询结果返回给 Claude                  │
│  4. 关闭连接 — 不持久化任何数据              │
└──────┬──────────────────────────┬───────────┘
       │                          │
       ▼                          ▼
  DBeaver workspace         Database server
  (data-sources.json,       (MySQL, PostgreSQL,
   credentials-config.json)   Oracle, Redis)
```

### 详细步骤

1. **Claude 发送工具调用**（例如带有连接名和 SQL 的 `run_query`），通过 MCP stdio 传输。MCP 协议只携带工具名称和参数 — 不传输凭证。

2. **dbeaver-mcp 解析连接**，读取 DBeaver 的 `data-sources.json` 查找 host、port 和 database。使用模糊名称匹配器，所以不需要精确的 ID。

3. **凭证在内存中解密**。DBeaver 21+ 使用 AES-128-CBC（文件级加密）对 `credentials-config.json` 加密。dbeaver-mcp 读取二进制文件，提取 IV（前 16 字节），用 DBeaver 内置密钥解密其余部分，然后解析 JSON。解密的密码只作为内存中的变量存在 — 绝不写入磁盘、日志或 stdout。

4. **建立直接的数据库连接**，根据驱动类型使用 `mysql2`、`pg`、`oracledb` 或 `ioredis`。连接用于单个操作。

5. **查询执行并将结果返回**为 JSON，通过 MCP stdout。只有查询结果流回 Claude — 绝不返回密码或连接凭证。

6. **查询完成后立即关闭连接**。无连接池，无后台进程持有凭证。

## 安全说明

### 凭证从不离开你的机器

```
❌ dbeaver-mcp 不会做的事情：
   • 发送密码到 Claude/Anthropic 服务器
   • 将密码写入磁盘、日志或环境变量
   • 在查询完成后将密码保存在内存中
   • 通过 MCP 协议暴露密码

✅ 实际发生的情况：
   • 从 DBeaver 加密文件读取密码
   • 在一次查询期间在本地变量中解密
   • 用于从你的机器打开直接的数据库连接
   • 连接关闭后被垃圾回收
```

### 纵深防御 — 5 层保护

| 层级 | 作用 |
|---|---|
| **1. DBeaver 加密** | 凭证以加密形式（AES-128-CBC）存储在磁盘上。dbeaver-mcp 仅在需要时在内存中解密。 |
| **2. MCP 协议隔离** | MCP stdio 协议只携带工具名称、参数和结果。密码从不出现在协议流中。Claude 永远不会看到你的凭证。 |
| **3. 读/写分离** | `run_query` 阻止所有写操作（INSERT、UPDATE、DELETE、DROP）。必须明确使用 `run_write` 进行变更。 |
| **4. 写确认** | `run_write` 在执行前需要 `confirmed: true`。这强制执行两步过程，防止意外数据更改。 |
| **5. 按连接权限** | `~/.dbeaver-mcp/settings.json` 允许你按连接白名单/黑名单 SQL 操作。将生产环境锁定为仅 SELECT。 |

### Claude 能看到 vs. 不能看到

| Claude 能看到 | Claude 不能看到 |
|---|---|
| 连接名和主机 | 密码 |
| 数据库名 | 加密的凭证文件 |
| 查询结果 | 原始凭证 JSON |
| 表结构 | 你的文件系统 |

## 安装

### 一次性设置

**步骤 1: 克隆并构建**

```bash
git clone https://github.com/ALinCheung/dbeaver-mcp.git ~/.claude/skills/dbeaver-mcp
cd ~/.claude/skills/dbeaver-mcp
npm install && npm run build
npm link
```

**步骤 2: 验证安装**

```bash
npx dbeaver-mcp --version
```

**步骤 3: 注册 MCP 服务器**

在 `~/.claude.json` (Claude Code) 或 `~/.config/opencode/opencode.json` (OpenCode) 中添加以下内容：

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

### 直连模式

当没有安装 DBeaver 时，可以使用 CLI 参数直接连接数据库：

```bash
npx dbeaver-mcp --host <host> --user <user> --password <pass> --database <db> [--driver mysql8] [--port <port>]
```

支持的 CLI 参数：

| 参数 | 缩写 | 说明 |
|------|------|------|
| `--host` | `-h` | 数据库地址 |
| `--port` | `-p` | 端口 |
| `--user` | `-u` | 用户名 |
| `--password` | `-P` | 密码 |
| `--database` | `-d` | 数据库名 |
| `--driver` | `-D` | 驱动类型（默认：mysql8） |

## 可用工具 |

支持的驱动类型：`mysql8`, `mysql5`, `mariadb`, `postgres`, `postgresql`, `postgres-jdbc`, `oracle`, `redis`

**MCP Server 配置示例：**

```json
{
  "mcpServers": {
    "dbeaver-mcp": {
      "command": "npx",
      "args": [
        "dbeaver-mcp",
        "--host", "192.168.1.100",
        "--port", "3306",
        "--user", "admin",
        "--password", "secret",
        "--database", "mydb",
        "--driver", "mysql8"
      ]
    }
  }
}
```

## 可用工具

### 连接管理

| 工具 | 说明 |
|---|---|
| `list_connections` | 列出所有 DBeaver 连接（不暴露密码） |
| `get_connection` | 按名称获取连接详情（不暴露密码） |
| `add_connection` | 添加新连接（支持 mysql、postgres、oracle、redis 驱动） |
| `edit_connection` | 编辑主机、端口或数据库 |
| `remove_connection` | 删除连接 |
| `test_connection` | 测试连接并返回数据库版本 |

### 查询执行

| 工具 | 说明 |
|---|---|
| `run_query` | 执行 SELECT / SHOW / EXPLAIN（只读，阻止写入） |
| `run_write` | 执行 INSERT / UPDATE / DELETE / DDL（需要 `confirmed: true`） |

### Schema 检查

| 工具 | 说明 |
|---|---|
| `list_tables` | 列出数据库中的表（使用数据库特定的元数据查询） |
| `describe_table` | 显示列、索引和表结构 |

### 性能与监控

| 工具 | 说明 |
|---|---|
| `explain_query` | 运行 EXPLAIN 并标记问题（全表扫描、filesort、临时表） |
| `show_processlist` | 显示当前运行的查询（使用数据库特定的查询） |
| `show_slow_queries` | 列出慢查询（使用数据库特定的性能视图） |

## 权限控制

通过 `~/.dbeaver-mcp/settings.json` 控制全局或按连接的 SQL 操作权限：

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

**权限解析逻辑：**

1. 该连接在 `connections` 中有特定条目吗？→ 使用那些权限（完全覆盖）
2. 没有特定条目？→ 使用 `global` 权限
3. 没有 `settings.json` 或没有 `permissions` 键？→ 允许所有操作（向后兼容）

**白名单 vs 黑名单：**
- `allowed_operations` — 仅允许这些操作（白名单）
- `blocked_operations` — 这些操作始终被阻止，即使在白名单中

**可识别的操作：** `SELECT`, `SHOW`, `EXPLAIN`, `DESCRIBE`, `INSERT`, `UPDATE`, `DELETE`, `CREATE`, `ALTER`, `DROP`, `TRUNCATE`, `GRANT`, `REVOKE`, `FLUSH`, `OPTIMIZE`, `REPAIR`, `USE`, `SET`

## DBeaver 工作区路径

服务器自动检测你的 DBeaver 工作区：

| 操作系统 | 路径 |
|---|---|
| macOS | `~/Library/DBeaverData/workspace6/General/.dbeaver/` |
| Linux | `~/.local/share/DBeaverData/workspace6/General/.dbeaver/` |
| Windows | `%APPDATA%\DBeaverData\workspace6\General\.dbeaver\` |

还会检查其他安装路径（Homebrew、Snap 等）。

## 不使用 Claude 测试

```bash
# 列出可用工具
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | node ~/.skills/dbeaver-mcp/dist/index.js
```

## 项目结构

```
dbeaver-mcp/
├── src/
│   ├── index.ts            # MCP 服务器入口（stdio 传输）
│   ├── cli.ts              # CLI 调度器（install、--help、--version 或启动服务器）
│   ├── dbeaver.ts          # 核心：读取/写入 DBeaver 配置、AES-128-CBC 加密
│   ├── permissions.ts      # 权限系统（全局 + 按连接）
│   ├── mysql.ts            # MySQL 连接和查询执行（mysql2）
│   ├── postgres.ts         # PostgreSQL 连接和查询执行（pg）
│   ├── oracle.ts           # Oracle 连接和查询执行（oracledb）
│   ├── redis.ts            # Redis 连接和查询执行（ioredis）
│   ├── commands/
│   │   └── install.ts      # 内置安装程序（验证 DBeaver、创建配置、在 Claude 中注册）
│   └── tools/
│       ├── connections.ts  # 工具：列出、获取、添加、编辑、删除、测试连接
│       ├── queries.ts      # 工具：run_query、run_write
│       └── schema.ts       # 工具：list_tables、describe_table、explain、processlist、slow queries
├── dist/                   # 编译后的 JS（由 tsc 生成）
├── references/
│   ├── dbeaver/            # DBeaver 内部文档（凭证、数据源、工作区）
│   ├── mysql/              # MySQL 参考指南
│   ├── postgres/           # PostgreSQL 参考指南
│   └── oracle/             # Oracle 参考指南
├── package.json            # NPX-ready，带 bin 字段
├── tsconfig.json           # TypeScript 配置（ES2022、strict 模式）
├── settings.example.json   # 权限配置示例
├── SKILL.md                # AI 代理技能定义
├── CLAUDE.md               # Claude Code 项目说明
└── .gitignore              # 阻止凭证和敏感文件
```

## 环境要求

- **Node.js 18+**
- **DBeaver** 已安装并至少有一个保存的连接
- **MySQL**、**PostgreSQL**、**Oracle** 或 **Redis** 数据库可从你的机器访问

### 依赖

| 包 | 用途 |
|---|---|
| `@modelcontextprotocol/sdk` | MCP 服务器框架（stdio 传输） |
| `mysql2` | MySQL 数据库驱动（async/await） |
| `pg` | PostgreSQL 数据库驱动 |
| `oracledb` | Oracle 数据库驱动 |
| `ioredis` | Redis 数据库驱动 |
| `zod` | 工具参数的输入模式验证 |

## 许可证

MIT