---
name: dbeaver-mcp
description: |
  Conecta ao MySQL via credenciais do DBeaver, executa queries, gerencia conexões DBeaver
  (listar, adicionar, editar, remover), e aplica boas práticas de schema, indexação, otimização
  de queries e operações MySQL/InnoDB. Use SEMPRE que o usuário mencionar banco de dados,
  MySQL, queries SQL, conexão DBeaver, schema, tabelas, índices, performance, deadlocks,
  migrações, ou pedir para rodar/consultar/analisar dados. Também use quando o usuário
  disser "conecta no banco", "roda essa query", "mostra as tabelas", "adiciona conexão no DBeaver".
---

# DBeaver MCP — MySQL + DBeaver Connection Manager

Skill completa para operar MySQL via credenciais DBeaver com boas práticas de banco de dados.

## Arquitetura

```
Claude (skill)
    ↓ MCP stdio
dbeaver-mcp server (Python local)
    ├── Lê credenciais do DBeaver (em memória, nunca em disco)
    ├── Gerencia data-sources.json (adicionar/editar/remover conexões)
    └── Executa queries MySQL via mysql-connector-python
```

## Início rápido

1. Verificar se o servidor MCP está rodando: pergunte ao usuário se instalou via `install.sh`
2. Se não instalado: instrua a instalar (veja seção Instalação abaixo)
3. Listar conexões disponíveis com `list_connections`
4. Pedir qual conexão usar se não for óbvio no contexto

---

## Tools MCP disponíveis

### Conexões DBeaver

| Tool | Descrição |
|---|---|
| `list_connections` | Lista todas as conexões DBeaver com host/porta/banco |
| `get_connection` | Retorna detalhes de uma conexão pelo nome (sem expor senha) |
| `add_connection` | Adiciona nova conexão ao DBeaver |
| `edit_connection` | Edita host, porta, banco, usuário ou senha de uma conexão |
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
| `show_processlist` | Mostra queries em execução no servidor |
| `show_slow_queries` | Lista queries lentas do performance_schema |

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

---

## Guardrails

- Nunca logar ou exibir senhas — credenciais ficam apenas em memória
- Sempre pedir confirmação antes de operações destrutivas (DROP, DELETE sem WHERE, TRUNCATE)
- Avisar sobre `ALGORITHM=COPY` em tabelas grandes antes de rodar DDL
- Indicar versão do MySQL quando o comportamento for específico (ex: INSTANT DDL só no 8.0+)
- Preferir evidências medidas (`EXPLAIN`, `performance_schema`) sobre regras de dedo
- Nunca expor o conteúdo de `credentials-config.json` — apenas os metadados de conexão

---

## Instalação

Instrua o usuário a instalar conforme o OS:

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

**Windows (PowerShell como Admin):**
```powershell
git clone https://github.com/lucascborges/dbeaver-mcp.git $env:USERPROFILE\.dbeaver-mcp
cd $env:USERPROFILE\.dbeaver-mcp; .\install\windows.ps1
```

Após instalar, registrar no Claude Code:
```bash
claude mcp add dbeaver-mcp -- python ~/.dbeaver-mcp/scripts/server.py
```

Ou no Claude Desktop (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "dbeaver-mcp": {
      "command": "python",
      "args": ["~/.dbeaver-mcp/scripts/server.py"]
    }
  }
}
```
