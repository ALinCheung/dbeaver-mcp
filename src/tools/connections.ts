/**
 * connections.ts — MCP tools for DBeaver connection management.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as dbeaver from "../dbeaver.js";
import { getDefaultConnectParams } from "../index.js";
import { checkPermission } from "../permissions.js";
import { runQuery as runMysqlQuery } from "../mysql.js";
import { runPostgresQuery } from "../postgres.js";
import { runOracleQuery } from "../oracle.js";
import { redisConnect } from "../redis.js";

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

/**
 * Get connection info - tries DBeaver first, falls back to CLI default params
 */
function getConnectionInfo(nameOrId: string): dbeaver.FullConnectionInfo | null {
  try {
    const info = dbeaver.getConnectionInfo(nameOrId);
    if (info) {
      // If DBeaver has the connection but password is empty, and we have CLI default params, use CLI password
      if (!info.password) {
        const defaultParams = getDefaultConnectParams();
        if (defaultParams?.password) {
          // DBeaver connection found but no password — use CLI password from defaultParams
          return dbeaver.buildConnectionInfo(defaultParams);
        }
      }
      return info;
    }
  } catch {
    // DBeaver workspace not found, fall through to CLI default params
  }

  const defaultParams = getDefaultConnectParams();
  if (defaultParams) {
    return dbeaver.buildConnectionInfo(defaultParams);
  }
  return null;
}

/**
 * Test connection based on driver type
 */
async function testConnectionByDriver(
  info: dbeaver.FullConnectionInfo
): Promise<{ success: boolean; version?: string; error?: string }> {
  const driver = (info.driver || "").toLowerCase();

  try {
    let version = "";
    let result;

    if (driver === "redis") {
      const redis = await redisConnect(info as any);
      version = await redis.ping();
      redis.disconnect(true);
      return { success: true, version: `Redis ${version}` };
    }

    if (driver === "postgres" || driver === "postgresql" || driver === "postgres-jdbc") {
      result = await runPostgresQuery(info, "SELECT 1 AS ok, version() AS version");
      version = result.rows[0]?.version || "";
    } else if (driver === "oracle") {
      result = await runOracleQuery(info, "SELECT 1 AS ok FROM DUAL");
      version = "Oracle";
    } else {
      // MySQL default
      result = await runMysqlQuery(info, "SELECT 1 AS ok, VERSION() AS version");
      version = result.rows[0]?.version || "";
    }

    return { success: true, version };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export function registerConnectionTools(server: McpServer): void {
  server.tool(
    "list_connections",
    "List all DBeaver connections (without passwords)",
    {},
    async () => {
      try {
        const connections = dbeaver.listConnectionsSafe();

        // Add direct mode connection if in direct mode
        const defaultParams = getDefaultConnectParams();
        if (defaultParams) {
          const directConn = dbeaver.buildConnectionInfo(defaultParams);
          // Avoid duplicates
          if (!connections.some(c => c.id === directConn.id)) {
            connections.unshift({
              id: directConn.id,
              name: directConn.name,
              driver: directConn.driver,
              host: directConn.host,
              port: directConn.port,
              database: directConn.database,
            });
          }
        }

        return text({ connections, total: connections.length });
      } catch (e: any) {
        // If DBeaver workspace not found, only show direct mode connection if available
        const defaultParams = getDefaultConnectParams();
        if (defaultParams) {
          const directConn = dbeaver.buildConnectionInfo(defaultParams);
          return text({
            connections: [{
              id: directConn.id,
              name: directConn.name,
              driver: directConn.driver,
              host: directConn.host,
              port: directConn.port,
              database: directConn.database,
            }],
            total: 1,
          });
        }
        return text({ error: e.message });
      }
    },
  );

  server.tool(
    "get_connection",
    "Return connection details by name",
    { name: z.string().describe("Connection name or ID") },
    async ({ name }) => {
      try {
        const info = getConnectionInfo(name);
        if (!info) return text({ error: `Connection '${name}' not found.` });
        const { password: _, ...safe } = info;
        return text(safe);
      } catch (e: any) {
        return text({ error: e.message });
      }
    },
  );

  server.tool(
    "add_connection",
    "Add new connection to DBeaver",
    {
      name: z.string().describe("Connection name"),
      host: z.string().describe("Hostname or IP"),
      port: z.number().describe("Port"),
      database: z.string().describe("Database name"),
      driver: z.string().optional().default("mysql8").describe("Driver (default: mysql8)"),
    },
    async ({ name, host, port, database, driver }) => {
      try {
        const connId = dbeaver.addConnection(name, host, port, database, "", "", driver);
        return text({ success: true, id: connId, name });
      } catch (e: any) {
        return text({ error: e.message });
      }
    },
  );

  server.tool(
    "edit_connection",
    "Edit host/port/database/user/password of a connection",
    {
      name: z.string().describe("Connection name or ID"),
      host: z.string().optional().describe("New host"),
      port: z.number().optional().describe("New port"),
      database: z.string().optional().describe("New database"),
    },
    async ({ name, host, port, database }) => {
      try {
        const ok = dbeaver.editConnection(name, host, port, database);
        if (!ok) return text({ error: `Connection '${name}' not found.` });
        return text({ success: true, updated: name });
      } catch (e: any) {
        return text({ error: e.message });
      }
    },
  );

  server.tool(
    "remove_connection",
    "Remove a connection from DBeaver",
    { name: z.string().describe("Connection name or ID") },
    async ({ name }) => {
      try {
        const ok = dbeaver.removeConnection(name);
        if (!ok) return text({ error: `Connection '${name}' not found.` });
        return text({ success: true, removed: name });
      } catch (e: any) {
        return text({ error: e.message });
      }
    },
  );

  server.tool(
    "test_connection",
    "Test connection connectivity",
    { name: z.string().describe("Connection name or ID") },
    async ({ name }) => {
      try {
        const info = getConnectionInfo(name);
        if (!info) return text({ success: false, error: `Connection '${name}' not found.` });
        const permError = checkPermission(name, "SELECT 1");
        if (permError) return text({ success: false, error: permError });

        const testResult = await testConnectionByDriver(info);
        if (testResult.success) {
          return text({ success: true, version: testResult.version, name });
        } else {
          return text({ success: false, error: testResult.error });
        }
      } catch (e: any) {
        return text({ success: false, error: e.message });
      }
    },
  );
}