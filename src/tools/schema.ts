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

  if (driver === "postgres" || driver === "postgresql") {
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

        if (driver === "postgres" || driver === "postgresql") {
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

        if (driver === "postgres" || driver === "postgresql") {
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

        if (driver === "postgres" || driver === "postgresql") {
          explainSql = `EXPLAIN ${sql.trim()}`;
        } else if (driver === "oracle") {
          explainSql = `EXPLAIN PLAN SET STATEMENT_ID = 'MCP' FOR ${sql.trim()}`;
        } else {
          explainSql = `EXPLAIN ${sql.trim()}`;
        }

        const basic = await executeQuery(info, explainSql);
        const redFlags: string[] = [];

        // 根据数据库类型分析执行计划
        if (driver === "postgres" || driver === "postgresql") {
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

        if (driver === "postgres" || driver === "postgresql") {
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

        if (driver === "postgres" || driver === "postgresql") {
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
