/**
 * queries.ts — MCP tools for SQL query execution.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as dbeaver from "../dbeaver.js";
import { getDefaultConnectParams } from "../index.js";
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
 * Get connection info - tries DBeaver first, falls back to CLI default params
 */
function getConnectionInfo(nameOrId: string): dbeaver.FullConnectionInfo | null {
  try {
    const info = dbeaver.getConnectionInfo(nameOrId);
    if (info) return info;
  } catch {
    // DBeaver workspace not found, fall through to CLI default params
  }

  // Fall back to CLI default params
  const defaultParams = getDefaultConnectParams();
  if (defaultParams) {
    return dbeaver.buildConnectionInfo(defaultParams);
  }
  return null;
}

/**
 * Check if operation is a write operation based on driver type
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
  // MySQL default
  const keyword = extractSqlKeyword(query);
  return WRITE_KEYWORDS.has(keyword);
}

/**
 * Execute query based on driver type
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

  // MySQL default
  return await runMysqlQuery(info, sql);
}

/**
 * Execute write operation based on driver type
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

  // MySQL default
  return await runMysqlWrite(info, sql);
}

export function registerQueryTools(server: McpServer): void {
  server.tool(
    "run_query",
    "Execute SELECT/SHOW/EXPLAIN (read-only)",
    {
      connection: z.string().describe("Connection name or ID"),
      sql: z.string().describe("SQL query (read-only)"),
    },
    async ({ connection, sql }) => {
      try {
        const trimmed = sql.trim();
        const permError = checkPermission(connection, trimmed);
        if (permError) return text({ error: permError });

        const info = getConnectionInfo(connection);
        if (!info) return text({ error: `Connection '${connection}' not found.` });

        if (isWriteOperation(info.driver, trimmed)) {
          return text({ error: `Use run_write for write operations. run_query is read-only.` });
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
    "Execute INSERT/UPDATE/DELETE/DDL (requires confirmation)",
    {
      connection: z.string().describe("Connection name or ID"),
      sql: z.string().describe("Write SQL query"),
      confirmed: z.boolean().optional().default(false).describe("Confirm execution"),
    },
    async ({ connection, sql, confirmed }) => {
      try {
        const trimmed = sql.trim();
        const permError = checkPermission(connection, trimmed);
        if (permError) return text({ error: permError });

        if (!confirmed) {
          return text({
            requires_confirmation: true,
            message: `Confirm execution of write operation on connection '${connection}'.`,
            sql_preview: trimmed.slice(0, 300),
          });
        }

        const info = getConnectionInfo(connection);
        if (!info) return text({ error: `Connection '${connection}' not found.` });

        const result = await executeWrite(info, trimmed);
        return text(result);
      } catch (e: any) {
        return text({ error: e.message });
      }
    },
  );
}