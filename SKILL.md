---
name: dbeaver-mcp
description: |
  Conecta ao MySQL, PostgreSQL, Oracle e Redis via credenciais do DBeaver, executa queries,
  gerencia conexões DBeaver (listar, adicionar, editar, remover), e aplica boas práticas
  de schema, indexação, otimização de queries e operações de banco de dados. Use SEMPRE
  quando o usuário mencionar banco de dados, MySQL, PostgreSQL, Oracle, Redis, queries SQL,
  conexão DBeaver, schema, tabelas, índices, performance, deadlocks, migrações, ou
  pedir para rodar/consultar/analisar dados. Também use quando o usuário disser
  "conecta no banco", "roda essa query", "mostra as tabelas", "adiciona conexão no DBeaver".
---

# DBeaver MCP — MySQL + PostgreSQL + Oracle + Redis + DBeaver Connection Manager

Skill completa para operar MySQL, PostgreSQL, Oracle e Redis via credenciais DBeaver com boas práticas de banco de dados.

## Arquitetura

```
Claude (skill)
    ↓ MCP stdio
dbeaver-mcp server (Node.js)
├── Lê credenciais do DBeaver (em memória, nunca em disco)
├── Gerencia data-sources.json (adicionar/editar/remover conexões)
├── Executa queries MySQL via mysql2
├── Executa queries PostgreSQL via pg
├── Executa queries Oracle via oracledb
└── Executa queries Redis via ioredis
```

## Início rápido

1. Verificar se o servidor MCP está rodando: pergunte ao usuário se instalou via `npx dbeaver-mcp install`
2. Se não instalado: instrua a instalar (veja seção Instalação abaixo)
3. Listar conexões disponíveis com `list_connections`
4. Pedir qual conexão usar se não for óbvio no contexto

---

## Tools MCP disponíveis

### Conexões DBeaver

| Tool | Descrição |
|---|---|
| `list_connections` | Lista todas as conexões DBeaver com host/porta/banco |
| `get_connection` | Retorna detalhes de uma conexão pelo nome |
| `add_connection` | Adiciona nova conexão ao DBeaver (configure credenciais no DBeaver) |
| `edit_connection` | Edita host, porta ou banco de uma conexão (credenciais via DBeaver) |
| `remove_connection` | Remove uma conexão do DBeaver (pede confirmação) |
| `test_connection` | Testa se uma conexão está funcionando |

### MySQL

| Tool | Descrição |
|---|---|
| `run_query` | Executa SELECT, SHOW, EXPLAIN, DESCRIBE |
| `run_write` | Executa INSERT, UPDATE, DELETE, DDL (pede confirmação) |
| `list_tables` | Lista tabelas de um banco |
| `describe_table` | Descreve estrutura, índices e constraints de uma tabela |
| `explain_query` | Roda EXPLAIN e interpreta o plano de execução |
| `show_processlist` | Mostra queries em execução no servidor (MySQL) |
| `show_slow_queries` | Lista queries lentas do performance_schema (MySQL) |

### PostgreSQL

|| Tool | Descrição |
||---|---|
|| `run_query` | Executa SELECT, SHOW, EXPLAIN, DESCRIBE |
|| `run_write` | Executa INSERT, UPDATE, DELETE, DDL (pede confirmação) |
|| `list_tables` | Lista tabelas de um banco (usa information_schema.tables) |
|| `describe_table` | Descreve estrutura, índices e constraints de uma tabela |
|| `explain_query` | Roda EXPLAIN e interpreta o plano de execução |
|| `show_processlist` | Mostra queries em execução (usa pg_stat_activity) |
|| `show_slow_queries` | Lista queries lentas (usa pg_stat_statements) |

### Oracle

|| Tool | Descrição |
||---|---|
|| `run_query` | Executa SELECT, SHOW, EXPLAIN, DESCRIBE |
|| `run_write` | Executa INSERT, UPDATE, DELETE, MERGE, DDL (pede confirmação) |
|| `list_tables` | Lista tabelas de um banco (usa ALL_TABLES) |
|| `describe_table` | Descreve estrutura, índices e constraints de uma tabela |
|| `explain_query` | Roda EXPLAIN PLAN e interpreta o plano de execução |
| `show_processlist` | Mostra sessões ativas (usa V$SESSION) |
| `show_slow_queries` | Lista queries lentas (usa V$SQL por tempo médio) |

### Redis

||| Tool | Descrição |
|||---|---|
||| `run_query` | Executa READ commands (GET, LRANGE, SCAN, etc.) |
||| `run_write` | Executa WRITE commands (SET, DEL, LPUSH, etc.) (pede confirmação) |
||| `list_tables` | Lista keys no Redis (usa SCAN) |
||| `describe_table` | Retorna tipo e TTL de uma key |
||| `explain_query` | Executa Redis DEBUG command para análise |
||| `show_processlist` | Lista client connections (CLIENT LIST) |
||| `show_slow_queries` | Lista slow commands (SLOWLOG) |

---

## Workflow padrão

### Para queries e análise
1. `list_connections` → identificar a conexão correta
2. `test_connection` → verificar conectividade
3. `list_tables` ou `describe_table` → entender o schema
4. `explain_query` antes de sugerir índices
5. `run_query` → executar e analisar resultado

### Para operações destrutivas (DELETE, DROP, TRUNCATE)
1. Sempre confirmar com o usuário antes de executar
2. Sugerir backup ou `SELECT` equivalente primeiro
3. Usar `run_write` com flag `--dry-run` se disponível

### Para gerenciar conexões DBeaver
1. `list_connections` → ver o que já existe
2. `add_connection` / `edit_connection` / `remove_connection` conforme necessário
3. `test_connection` após qualquer mudança

---

## MySQL — Boas Práticas

### Schema Design
- PKs: `BIGINT UNSIGNED AUTO_INCREMENT` para OLTP. Evite UUID aleatório como PK clustered.
- Sempre `utf8mb4` / `utf8mb4_0900_ai_ci`. Prefira `NOT NULL`, `DATETIME` sobre `TIMESTAMP`.
- Lookup tables em vez de `ENUM`. Normalize para 3NF; desnormalize apenas em hot paths medidos.

### Indexação
- Ordem em índice composto: igualdade primeiro, depois range/sort (regra do prefixo mais à esquerda).
- Predicados de range param o uso do índice para colunas subsequentes.
- Audite via `performance_schema` — remova índices com `COUNT_READ = 0`.

### Otimização de Queries
- Cheque `EXPLAIN` — red flags: `type: ALL`, `Using filesort`, `Using temporary`.
- Paginação por cursor, não `OFFSET`. Evite funções em colunas indexadas no `WHERE`.
- Batch inserts (500–5000 rows). `UNION ALL` sobre `UNION` quando dedup for desnecessário.

### Transactions & Locking
- Default: `REPEATABLE READ` (gap locks). Use `READ COMMITTED` para alta contenção.
- Acesso consistente a linhas previne deadlocks. Retry em erro 1213 com backoff.
- Faça I/O fora de transactions. Use `SELECT ... FOR UPDATE` com parcimônia.

### Operações
- Use online DDL (`ALGORITHM=INPLACE`) quando possível; teste em réplicas primeiro.
- Tune connection pooling — evite esgotamento de `max_connections` sob carga.
- Monitore replication lag; evite leituras obsoletas de réplicas durante writes.

---

## PostgreSQL — Boas Práticas

### Schema Design
- PKs: `BIGSERIAL` ou `GENERATED ALWAYS AS IDENTITY` para OLTP. Evite UUID aleatório como PK se não for necessário.
- Sempre `utf88` / `en_US.UTF-8`. Prefira `NOT NULL`, `TIMESTAMP WITH TIME ZONE` sobre `TIMESTAMP`.
- Lookup tables em vez de `ENUM`. Normalize para 3NF; desnormalize apenas em hot paths medidos.

### Indexação
- Índices compostos: ordem importa — igualdade primeiro, depois range/sort.
- Predicados de range param o uso do índice para colunas subsequentes.
- Use `INCLUDE` em índices para cobrir queries sem hit adicional na tabela.
- Monitore uso de índices via `pg_stat_user_indexes`.

### Otimização de Queries
- Cheque `EXPLAIN (ANALYZE, BUFFERS)` — red flags: Seq Scan, Hash Join com grandes rows, Sort com grande custo.
- Paginação por cursor (`WHERE id > last_id`) ou `KEYSETpagination`, não `OFFSET`.
- Evite funções em colunas indexadas no `WHERE` — usa índices expression se necessário.
- Batch inserts via `COPY` para grandes volumes.

### Transactions & Locking
- Default: `READ COMMITTED`. Use `REPEATABLE READ` para maior consistência.
- Acesso consistente a linhas previne deadlocks. Retry em erro 40001 com backoff.
- Keep transactions curtas — evite long transactions que causam bloat de MVCC.

### Operações
- Use `CREATE INDEX CONCURRENTLY` para índices em produção — não bloqueia writes.
- Monitore `pg_stat_activity` para queries lentas e locks.
- VACUUM e ANALYZE são essenciais — autovacuum cobre a maioria dos casos.

---

## Oracle — Boas Práticas

### Schema Design
- PKs: `NUMBER GENERATED ALWAYS AS IDENTITY` para OLTP.
- Prefira `NOT NULL`, `TIMESTAMP` ou `DATE` conforme necessidade.
- Lookup tables em vez de `ENUM`. Normalize para 3NF; desnormalize apenas em hot paths medidos.

### Indexação
- Ordem em índice composto: igualdade primeiro, depois range/sort.
- Predicados de range param o uso do índice para colunas subsequentes.
- Use índices funcionais para colunas calculadas.
- Monitore uso de índices via `USER_INDEXES` / `DBA_INDEXES`.

### Otimização de Queries
- Cheque `EXPLAIN PLAN` — red flags: FULL TABLE SCAN, SORT, HASH JOIN com grandes datasets.
- Paginação via `ROWNUM` ou `FETCH FIRST N ROWS ONLY` (Oracle 12c+).
- Evite funções em colunas indexadas no `WHERE`.
- Use binds variables para queries repetidas.

### Transactions & Locking
- Default: `READ COMMITTED`. Use `SERIALIZABLE` para maior consistência (com cuidado).
- Deadlocks podem ocorrer — implemente retry logic com backoff exponencial.
- Minimize o tempo de hold de locks — não faça interação do usuário dentro de transactions.

### Operações
- Use `DBMS_SCHEDULER` para jobs agendados.
- Monitore `V$SESSION` e `V$SQL` para performance.
- partitioning é poderoso para grandes tabelas — use `RANGE` ou `LIST` partitioning.

---

## Redis — Boas Práticas

### Schema Design
- Keys: use nomes descritivos com `:` como separador (ex: `user:123:profile`).
- Prefira estruturas nativas (HASH, LIST, SET, ZSET) sobre serialização JSON quando possível.
- TTL em todas as keys temporárias — evite keys que crescem infinitamente.

### Operações
- `SCAN` ao invés de `KEYS` em produção (KEYS bloqueia o servidor).
- `MULTI/EXEC` para transações; use Lua scripts para operações atômicas complexas.
- `BITCOUNT`, `HINCRBY` para contadores — atômicos e eficientes.
- Monitora `slowlog` — comandos O(N) com grandes datasets são problemáticos.

### Performance
- Connection pooling: ioredis gerencia nativamente; use `maxRetriesPerRequest` configurado.
- Pipelining para batch de comandos — reduz round-trips.
- `MONITOR` apenas temporariamente — impacto significativo em produção.

### Operações
- `BGSAVE` para snapshots assíncronos; `LASTSAVE` para verificar.
- `INFO memory` para monitorar uso de memória.
- `CLIENT KILL` para desconectar clientes específicos (use com cuidado).

---

## Referências detalhadas

Leia os arquivos abaixo conforme necessário (não carregue todos de uma vez):

**Schema e tipos:**
- `references/mysql/primary-keys.md` — design de PKs, UUID vs BIGINT, clustered index
- `references/mysql/data-types.md` — tipos numéricos, strings, datetime, JSON
- `references/mysql/character-sets.md` — utf8mb4, collations, migrações

**Indexação:**
- `references/mysql/composite-indexes.md` — regra leftmost prefix, ordem de colunas
- `references/mysql/covering-indexes.md` — index-only scans, EXPLAIN signals
- `references/mysql/fulltext-indexes.md` — busca textual, BOOLEAN MODE
- `references/mysql/index-maintenance.md` — índices não usados, redundantes, INVISIBLE

**Queries:**
- `references/mysql/explain-analysis.md` — tipos de acesso, Extra flags, key_len
- `references/mysql/query-optimization-pitfalls.md` — predicados não-sargáveis, LIKE, OR
- `references/mysql/n-plus-one.md` — detecção e correção de N+1, eager loading
- `references/mysql/json-column-patterns.md` — generated columns, operadores ->>

**Transactions:**
- `references/mysql/isolation-levels.md` — REPEATABLE READ vs READ COMMITTED
- `references/mysql/deadlocks.md` — causas comuns, diagnóstico, retry pattern
- `references/mysql/row-locking-gotchas.md` — next-key locks, gap locks, FOR UPDATE

**Operações:**
- `references/mysql/online-ddl.md` — INSTANT/INPLACE/COPY, ferramentas externas
- `references/mysql/connection-management.md` — pool sizing, timeouts, ProxySQL
- `references/mysql/replication-lag.md` — stale reads, GTID, estratégias de mitigação
- `references/mysql/partitioning.md` — RANGE, LIST, HASH, gestão de partições

**DBeaver:**
- `references/dbeaver/credentials.md` — como o DBeaver armazena credenciais por OS
- `references/dbeaver/datasources.md` — estrutura do data-sources.json, campos importantes
- `references/dbeaver/workspace.md` — caminhos do workspace por OS, versões DBeaver

**PostgreSQL:**
- `references/postgres/primary-keys.md` — design de PKs, serial, identity, uuid
- `references/postgres/indexing.md` — tipos de índices, composite indexes, include columns
- `references/postgres/explain-analysis.md` — leitura de EXPLAIN, red flags
- `references/postgres/transactions.md` — isolation levels, locking, MVCC, deadlocks
- `references/postgres/partitioning.md` — RANGE, LIST, HASH partitioning

**Oracle:**
- `references/oracle/primary-keys.md` — design de PKs, identity, sequences
- `references/oracle/indexing.md` — tipos de índices, bitmap, function-based indexes
- `references/oracle/explain-plan.md` — leitura de EXPLAIN PLAN, red flags
- `references/oracle/transactions.md` — isolation levels, locking, deadlocks
- `references/oracle/partitioning.md` — RANGE, LIST, HASH, INTERVAL partitioning

---

## Permissões

O servidor suporta controle de permissões via `~/.dbeaver-mcp/settings.json`:

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

**Lógica de resolução:**
- Se a conexão tem entry em `connections`, usa as permissões dela (override total)
- Se não, usa `global`
- Se não existe `settings.json` ou `permissions`, tudo é permitido (backward-compatible)
- `allowed_operations` é whitelist — só operações listadas são permitidas
- `blocked_operations` é blacklist opcional — bloqueia mesmo se não listada explicitamente

**Operações reconhecidas:** `SELECT`, `SHOW`, `EXPLAIN`, `DESCRIBE`, `INSERT`, `UPDATE`, `DELETE`, `CREATE`, `ALTER`, `DROP`, `TRUNCATE`, `GRANT`, `REVOKE`, `FLUSH`, `OPTIMIZE`, `REPAIR`, `USE`, `SET`

---

## Guardrails

- Credenciais nunca trafegam via MCP — gerenciadas exclusivamente pelo DBeaver
- Nunca logar ou exibir senhas — credenciais ficam apenas em memória
- Sempre pedir confirmação antes de operações destrutivas (DROP, DELETE sem WHERE, TRUNCATE)
- Avisar sobre `ALGORITHM=COPY` em tabelas grandes antes de rodar DDL
- Indicar versão do MySQL quando o comportamento for específico (ex: INSTANT DDL só no 8.0+)
- Preferir evidências medidas (`EXPLAIN`, `performance_schema`) sobre regras de dedo
- Nunca expor o conteúdo de `credentials-config.json` — apenas os metadados de conexão
- Respeitar permissões configuradas em `~/.dbeaver-mcp/settings.json`

---

## Instalação

Instrua o usuário a instalar conforme a preferência:

**Opção 1 — Um comando (recomendado):**
```bash
claude mcp add dbeaver-mcp -- npx dbeaver-mcp
```

Para registrar globalmente (disponível em todos os projetos):
```bash
claude mcp add dbeaver-mcp --scope user -- npx dbeaver-mcp
```

**Opção 2 — Instalador integrado:**
```bash
npx dbeaver-mcp install
```
O instalador verifica o workspace DBeaver, cria `~/.dbeaver-mcp/settings.json` e registra no Claude Code automaticamente.

**Opção 3 — Claude Desktop** (`claude_desktop_config.json`):
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
