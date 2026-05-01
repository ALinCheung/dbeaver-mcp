/**
 * queries.ts — MCP tools for SQL query execution.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as dbeaver from "../dbeaver.js";
import { extractSqlKeyword, checkPermission } from "../permissions.js";
import { runQuery as runMysqlQuery, runWrite as runMysqlWrite } from "../mysql.js";
import { runPostgresQuery, runPostgresWrite, isPostgresWriteOperation } from "../postgres.js";
import { runOracleQuery, runOracleWrite, isOracleWriteOperation } from "../oracle.js";
import { runRedisQuery, runRedisWrite, isRedisWriteOperation, RedisConnectionInfo } from "../redis.js";

const WRITE_KEYWORDS = new Set([
  "INSERT", "UPDATE", "DELETE", "DROP", "TRUNCATE", "ALTER", "CREATE",
]);

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

/**
 * 根据 driver 类型判断是否为写操作
 */
function isWriteOperation(driver: string, query: string): boolean {
  const d = driver.toLowerCase();
  if (d === "redis") {
    return isRedisWriteOperation(query);
  }
  if (d === "postgres" || d === "postgresql" || d === "postgres-jdbc") {
    return isPostgresWriteOperation(query);
  }
  if (d === "oracle") {
    return isOracleWriteOperation(query);
  }
  // MySQL 默认行为
  const keyword = extractSqlKeyword(query);
  return WRITE_KEYWORDS.has(keyword);
}

/**
 * 根据 driver 类型执行查询
 */
async function executeQuery(
  info: dbeaver.FullConnectionInfo,
  sql: string
): Promise<any> {
  const driver = (info.driver || "").toLowerCase();

  if (driver === "redis") {
    return await runRedisQuery(info as RedisConnectionInfo, sql);
  }

  if (driver === "postgres" || driver === "postgresql" || driver === "postgres-jdbc") {
    return await runPostgresQuery(info, sql);
  }

  if (driver === "oracle") {
    return await runOracleQuery(info, sql);
  }

  // 默认 MySQL
  return await runMysqlQuery(info, sql);
}

/**
 * 根据 driver 类型执行写操作
 */
async function executeWrite(
  info: dbeaver.FullConnectionInfo,
  sql: string
): Promise<any> {
  const driver = (info.driver || "").toLowerCase();

  if (driver === "redis") {
    return await runRedisWrite(info as RedisConnectionInfo, sql);
  }

  if (driver === "postgres" || driver === "postgresql" || driver === "postgres-jdbc") {
    return await runPostgresWrite(info, sql);
  }

  if (driver === "oracle") {
    return await runOracleWrite(info, sql);
  }

  // 默认 MySQL
  return await runMysqlWrite(info, sql);
}

export function registerQueryTools(server: McpServer): void {
  server.tool(
    "run_query",
    "Executa SELECT/SHOW/EXPLAIN (somente leitura)",
    {
      connection: z.string().describe("Nome ou ID da conexão"),
      sql: z.string().describe("Query SQL (somente leitura)"),
    },
    async ({ connection, sql }) => {
      try {
        const trimmed = sql.trim();
        const permError = checkPermission(connection, trimmed);
        if (permError) return text({ error: permError });

        const info = dbeaver.getConnectionInfo(connection);
        if (!info) return text({ error: `Conexão '${connection}' não encontrada.` });

        if (isWriteOperation(info.driver, trimmed)) {
          return text({ error: `Use run_write para operações de escrita. run_query é somente leitura.` });
        }

        const result = await executeQuery(info, trimmed);
        return text(result);
      } catch (e: any) {
        return text({ error: e.message });
      }
    },
  );

  server.tool(
    "run_write",
    "Executa INSERT/UPDATE/DELETE/DDL (requer confirmação)",
    {
      connection: z.string().describe("Nome ou ID da conexão"),
      sql: z.string().describe("Query SQL de escrita"),
      confirmed: z.boolean().optional().default(false).describe("Confirmar execução"),
    },
    async ({ connection, sql, confirmed }) => {
      try {
        const trimmed = sql.trim();
        const permError = checkPermission(connection, trimmed);
        if (permError) return text({ error: permError });

        if (!confirmed) {
          return text({
            requires_confirmation: true,
            message: `Confirme a execução da operação de escrita na conexão '${connection}'.`,
            sql_preview: trimmed.slice(0, 300),
          });
        }

        const info = dbeaver.getConnectionInfo(connection);
        if (!info) return text({ error: `Conexão '${connection}' não encontrada.` });

        const result = await executeWrite(info, trimmed);
        return text(result);
      } catch (e: any) {
        return text({ error: e.message });
      }
    },
  );
}
