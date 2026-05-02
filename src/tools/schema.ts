/**
 * schema.ts — MCP tools for schema inspection and performance monitoring.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as dbeaver from "../dbeaver.js";
import { checkPermission } from "../permissions.js";
import { runQuery as runMysqlQuery } from "../mysql.js";
import { runPostgresQuery } from "../postgres.js";
import { runOracleQuery } from "../oracle.js";
import { getRedisSchema, RedisConnectionInfo } from "../redis.js";

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

/**
 * 根据 driver 类型执行查询
 */
async function executeQuery(
  info: dbeaver.FullConnectionInfo,
  sql: string,
  params?: any[]
): Promise<any> {
  const driver = (info.driver || "").toLowerCase();

  if (driver === "postgres" || driver === "postgresql" || driver === "postgres-jdbc") {
    return await runPostgresQuery(info, sql, params);
  }

  if (driver === "oracle") {
    return await runOracleQuery(info, sql, params);
  }

  // 默认 MySQL
  return await runMysqlQuery(info, sql);
}

export function registerSchemaTools(server: McpServer): void {
  server.tool(
    "list_tables",
    "Lista tabelas de um banco de dados",
    {
      connection: z.string().describe("Nome ou ID da conexão"),
      database: z.string().optional().describe("Nome do banco (usa o padrão da conexão se omitido)"),
    },
    async ({ connection, database }) => {
      try {
        const info = dbeaver.getConnectionInfo(connection);
        if (!info) return text({ error: `Conexão '${connection}' não encontrada.` });
        const permError = checkPermission(connection, "SHOW TABLES");
        if (permError) return text({ error: permError });
        const db = database || info.database;
        if (!db) return text({ error: "Informe o banco de dados ('database')." });

        const driver = (info.driver || "").toLowerCase();
        let result;

        if (driver === "postgres" || driver === "postgresql" || driver === "postgres-jdbc") {
          // PostgreSQL: 使用 information_schema
          result = await executeQuery(info,
            `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`
          );
          const tables = result.rows.map((r: any) => r.table_name);
          return text({ database: db, tables, total: tables.length });
        }

        if (driver === "oracle") {
          // Oracle: 使用 ALL_TABLES
          result = await executeQuery(info,
            `SELECT TABLE_NAME FROM ALL_TABLES WHERE OWNER = USER AND TEMPORARY = 'N' ORDER BY TABLE_NAME`
          );
          const tables = result.rows.map((r: any) => r.table_name?.toLowerCase() || r.TABLE_NAME?.toLowerCase());
          return text({ database: db, tables, total: tables.length });
        }

        if (driver === "redis") {
          // Redis: 返回键类型统计作为"表"
          const schema = await getRedisSchema(info as RedisConnectionInfo);
          const tables = ["_overview", ...schema.keys_by_type.map((t) => `keys_${t.type}`)];
          return text({
            database: "redis",
            overview: schema.overview,
            keys_by_type: schema.keys_by_type,
            tables,
            total: tables.length,
          });
        }

        // MySQL 默认行为
        result = await runMysqlQuery(info, `SHOW TABLES FROM \`${db}\``);
        const tables = result.rows.map((r) => Object.values(r)[0]);
        return text({ database: db, tables, total: tables.length });
      } catch (e: any) {
        return text({ error: e.message });
      }
    },
  );

  server.tool(
    "describe_table",
    "Descreve estrutura, índices e CREATE TABLE",
    {
      connection: z.string().describe("Nome ou ID da conexão"),
      table: z.string().describe("Nome da tabela"),
      database: z.string().optional().describe("Nome do banco (usa o padrão da conexão se omitido)"),
    },
    async ({ connection, table, database }) => {
      try {
        const info = dbeaver.getConnectionInfo(connection);
        if (!info) return text({ error: `Conexão '${connection}' não encontrada.` });
        const permError = checkPermission(connection, "DESCRIBE");
        if (permError) return text({ error: permError });
        const db = database || info.database;

        const driver = (info.driver || "").toLowerCase();

        if (driver === "postgres" || driver === "postgresql" || driver === "postgres-jdbc") {
          // PostgreSQL: 获取列信息
          const columnsResult = await executeQuery(info,
            `SELECT column_name, data_type, is_nullable, column_default
             FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = $1
             ORDER BY ordinal_position`,
            [table]
          );

          // 获取索引信息
          const indexesResult = await executeQuery(info,
            `SELECT indexname, indexdef
             FROM pg_indexes
             WHERE tablename = $1 AND schemaname = 'public'`,
            [table]
          );

          return text({
            table,
            database: db,
            columns: columnsResult.rows,
            indexes: indexesResult.rows.map((r: any) => ({
              name: r.indexname,
              definition: r.indexdef
            })),
          });
        }

        if (driver === "oracle") {
          // Oracle: 获取列信息
          const columnsResult = await executeQuery(info,
            `SELECT COLUMN_NAME, DATA_TYPE, NULLABLE, DATA_DEFAULT
             FROM ALL_TAB_COLUMNS
             WHERE TABLE_NAME = :table AND OWNER = (SELECT USER FROM DUAL)
             ORDER BY COLUMN_ID`,
            [table]
          );

          // 获取索引信息
          const indexesResult = await executeQuery(info,
            `SELECT INDEX_NAME, INDEX_TYPE, UNIQUENESS
             FROM ALL_INDEXES
             WHERE TABLE_NAME = :table AND TABLE_OWNER = (SELECT USER FROM DUAL)`,
            [table]
          );

          return text({
            table,
            database: db,
            columns: columnsResult.rows.map((r: any) => ({
              name: r.column_name?.toLowerCase(),
              type: r.data_type,
              nullable: r.nullable === 'Y',
              default: r.data_default
            })),
            indexes: indexesResult.rows.map((r: any) => ({
              name: r.index_name,
              type: r.index_type,
              unique: r.uniqueness === 'UNIQUE'
            })),
          });
        }

        if (driver === "redis") {
          // Redis: 获取键信息
          const { runRedisQuery } = await import("../redis.js");
          const keyTypeResult = await runRedisQuery(info as RedisConnectionInfo, `TYPE ${table}`);
          const keyType = keyTypeResult.rows[0]?.type || "none";

          if (keyType === "none") {
            return text({ error: `Key '${table}' not found` });
          }

          const ttlResult = await runRedisQuery(info as RedisConnectionInfo, `TTL ${table}`);
          const ttl = ttlResult.rows[0]?.ttl ?? -1;

          if (keyType === "string") {
            const valueResult = await runRedisQuery(info as RedisConnectionInfo, `GET ${table}`);
            return text({ key: table, type: keyType, ttl, value: valueResult.rows[0]?.result || null });
          }

          if (keyType === "list") {
            const lenResult = await runRedisQuery(info as RedisConnectionInfo, `LLEN ${table}`);
            return text({ key: table, type: keyType, ttl, length: lenResult.rows[0]?.length || 0 });
          }

          if (keyType === "hash") {
            const lenResult = await runRedisQuery(info as RedisConnectionInfo, `HLEN ${table}`);
            return text({ key: table, type: keyType, ttl, field_count: lenResult.rows[0]?.hlen || 0 });
          }

          if (keyType === "set") {
            const cardResult = await runRedisQuery(info as RedisConnectionInfo, `SCARD ${table}`);
            return text({ key: table, type: keyType, ttl, cardinality: cardResult.rows[0]?.cardinality || 0 });
          }

          if (keyType === "zset") {
            const cardResult = await runRedisQuery(info as RedisConnectionInfo, `ZCARD ${table}`);
            return text({ key: table, type: keyType, ttl, cardinality: cardResult.rows[0]?.cardinality || 0 });
          }

          return text({ key: table, type: keyType, ttl });
        }

        // MySQL 默认行为
        const columns = await runMysqlQuery(info, `DESCRIBE \`${db}\`.\`${table}\``);
        const indexes = await runMysqlQuery(info, `SHOW INDEX FROM \`${db}\`.\`${table}\``);
        const create = await runMysqlQuery(info, `SHOW CREATE TABLE \`${db}\`.\`${table}\``);
        const createSql = create.rows[0] ? Object.values(create.rows[0])[1] : "";
        return text({ table, database: db, columns: columns.rows, indexes: indexes.rows, create_sql: createSql });
      } catch (e: any) {
        return text({ error: e.message });
      }
    },
  );

  server.tool(
    "explain_query",
    "Roda EXPLAIN e aponta red flags",
    {
      connection: z.string().describe("Nome ou ID da conexão"),
      sql: z.string().describe("Query SQL para analisar"),
    },
    async ({ connection, sql }) => {
      try {
        const info = dbeaver.getConnectionInfo(connection);
        if (!info) return text({ error: `Conexão '${connection}' não encontrada.` });
        const permError = checkPermission(connection, "EXPLAIN x");
        if (permError) return text({ error: permError });

        const driver = (info.driver || "").toLowerCase();
        let explainSql;

        if (driver === "postgres" || driver === "postgresql" || driver === "postgres-jdbc") {
          explainSql = `EXPLAIN ${sql.trim()}`;
        } else if (driver === "oracle") {
          explainSql = `EXPLAIN PLAN SET STATEMENT_ID = 'MCP' FOR ${sql.trim()}`;
        } else if (driver === "redis") {
          // Redis doesn't support EXPLAIN, return a message
          return text({ error: "Redis does not support EXPLAIN. Use SLOWLOG to monitor slow commands." });
        } else {
          explainSql = `EXPLAIN ${sql.trim()}`;
        }

        const basic = await executeQuery(info, explainSql);
        const redFlags: string[] = [];

        // 根据数据库类型分析执行计划
        if (driver === "postgres" || driver === "postgresql" || driver === "postgres-jdbc") {
          for (const row of basic.rows) {
            const plan = JSON.stringify(row).toLowerCase();
            if (plan.includes("seq scan")) redFlags.push(`全表扫描 (Seq Scan) 检测到`);
            if (plan.includes("nested loop")) redFlags.push(`嵌套循环连接 (Nested Loop) 可能导致性能问题`);
            if (plan.includes("hash join")) redFlags.push(`哈希连接 (Hash Join) 使用中`);
          }
        } else if (driver === "oracle") {
          // Oracle PLAN_TABLE 查询
          const planResult = await executeQuery(info,
            `SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY())`
          );
          return text({ plan: planResult.rows, red_flags: redFlags });
        } else {
          // MySQL
          for (const row of basic.rows) {
            const t = row.type || "";
            const extra = row.Extra || "";
            if (t === "ALL") redFlags.push(`全表扫描在表 '${row.table || ""}'`);
            if (extra.includes("Using filesort")) redFlags.push(`Using filesort 在表 '${row.table || ""}'`);
            if (extra.includes("Using temporary")) redFlags.push(`Using temporary 在表 '${row.table || ""}'`);
          }
        }

        return text({ plan: basic.rows, red_flags: redFlags });
      } catch (e: any) {
        return text({ error: e.message });
      }
    },
  );

  server.tool(
    "show_processlist",
    "Mostra queries em execução no servidor",
    {
      connection: z.string().describe("Nome ou ID da conexão"),
    },
    async ({ connection }) => {
      try {
        const info = dbeaver.getConnectionInfo(connection);
        if (!info) return text({ error: `Conexão '${connection}' não encontrada.` });
        const permError = checkPermission(connection, "SHOW PROCESSLIST");
        if (permError) return text({ error: permError });

        const driver = (info.driver || "").toLowerCase();

        if (driver === "postgres" || driver === "postgresql" || driver === "postgres-jdbc") {
          const result = await executeQuery(info,
            `SELECT pid, usename, application_name, client_addr, state, query_start, query
             FROM pg_stat_activity WHERE state IS NOT NULL ORDER BY query_start DESC`
          );
          return text(result);
        }

        if (driver === "oracle") {
          const result = await executeQuery(info,
            `SELECT SID, SERIAL#, USERNAME, STATUS, SQL_ADDRESS, SQL_ID, MACHINE, PROGRAM
             FROM V$SESSION WHERE STATUS = 'ACTIVE' AND USERNAME IS NOT NULL`
          );
          return text(result);
        }

        if (driver === "redis") {
          // Redis: use CLIENT LIST for connection info
          const { runRedisQuery } = await import("../redis.js");
          const result = await runRedisQuery(info as RedisConnectionInfo, "CLIENT LIST");
          return text({ client_list: result.rows });
        }

        // MySQL 默认行为
        const result = await runMysqlQuery(info, "SHOW FULL PROCESSLIST");
        return text(result);
      } catch (e: any) {
        return text({ error: e.message });
      }
    },
  );

  server.tool(
    "show_slow_queries",
    "Lista queries lentas do performance_schema",
    {
      connection: z.string().describe("Nome ou ID da conexão"),
      limit: z.number().optional().default(20).describe("Número máximo de resultados"),
    },
    async ({ connection, limit }) => {
      try {
        const info = dbeaver.getConnectionInfo(connection);
        if (!info) return text({ error: `Conexão '${connection}' não encontrada.` });
        const permError = checkPermission(connection, "SELECT FROM performance_schema");
        if (permError) return text({ error: permError });

        const driver = (info.driver || "").toLowerCase();

        if (driver === "postgres" || driver === "postgresql" || driver === "postgres-jdbc") {
          const result = await executeQuery(info,
            `SELECT query, calls, total_exec_time, mean_exec_time, rows
             FROM pg_stat_statements
             ORDER BY mean_exec_time DESC
             LIMIT ${limit}`
          );
          return text(result);
        }

        if (driver === "oracle") {
          const result = await executeQuery(info,
            `SELECT SQL_ID, SQL_TEXT, EXECUTIONS, ELAPSED_TIME, CPU_TIME, DISK_READS
             FROM V$SQL
             WHERE EXECUTIONS > 0
             ORDER BY (ELAPSED_TIME / EXECUTIONS) DESC
             FETCH FIRST ${limit} ROWS ONLY`
          );
          return text(result);
        }

        if (driver === "redis") {
          // Redis: use SLOWLOG for slow commands
          const { runRedisQuery } = await import("../redis.js");
          const result = await runRedisQuery(info as RedisConnectionInfo, `SLOWLOG GET ${limit}`);
          return text({ slowlog: result.rows });
        }

        // MySQL 默认行为
        const sql = `
          SELECT digest_text, count_star, avg_timer_wait/1e12 AS avg_sec,
                 max_timer_wait/1e12 AS max_sec, sum_rows_examined
          FROM performance_schema.events_statements_summary_by_digest
          ORDER BY avg_timer_wait DESC
          LIMIT ${limit}
        `;
        const result = await runMysqlQuery(info, sql);
        return text(result);
      } catch (e: any) {
        return text({ error: e.message });
      }
    },
  );
}
