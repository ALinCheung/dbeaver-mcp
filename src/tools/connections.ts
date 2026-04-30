/**
 * connections.ts — MCP tools for DBeaver connection management.
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
 * 根据 driver 类型执行测试查询
 */
async function testConnectionByDriver(
  info: dbeaver.FullConnectionInfo
): Promise<{ success: boolean; version?: string; error?: string }> {
  const driver = (info.driver || "").toLowerCase();

  try {
    let version = "";
    let result;

    if (driver === "postgres" || driver === "postgresql" || driver === "postgres-jdbc") {
      result = await runPostgresQuery(info, "SELECT 1 AS ok, version() AS version");
      version = result.rows[0]?.version || "";
    } else if (driver === "oracle") {
      result = await runOracleQuery(info, "SELECT 1 AS ok FROM DUAL");
      version = "Oracle";
    } else {
      // MySQL 默认行为
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
    "Lista todas as conexões DBeaver (sem senhas)",
    {},
    async () => {
      try {
        const connections = dbeaver.listConnectionsSafe();
        return text({ connections, total: connections.length });
      } catch (e: any) {
        return text({ error: e.message });
      }
    },
  );

  server.tool(
    "get_connection",
    "Retorna detalhes de uma conexão pelo nome",
    { name: z.string().describe("Nome ou ID da conexão") },
    async ({ name }) => {
      try {
        const info = dbeaver.getConnectionInfo(name);
        if (!info) return text({ error: `Conexão '${name}' não encontrada.` });
        // Return without password
        const { password: _, ...safe } = info;
        return text(safe);
      } catch (e: any) {
        return text({ error: e.message });
      }
    },
  );

  server.tool(
    "add_connection",
    "Adiciona nova conexão ao DBeaver",
    {
      name: z.string().describe("Nome da conexão"),
      host: z.string().describe("Hostname ou IP"),
      port: z.number().describe("Porta"),
      database: z.string().describe("Nome do banco de dados"),
      driver: z.string().optional().default("mysql8").describe("Driver (padrão: mysql8)"),
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
    "Edita host/porta/banco/usuário/senha de uma conexão",
    {
      name: z.string().describe("Nome ou ID da conexão"),
      host: z.string().optional().describe("Novo host"),
      port: z.number().optional().describe("Nova porta"),
      database: z.string().optional().describe("Novo banco de dados"),
    },
    async ({ name, host, port, database }) => {
      try {
        const ok = dbeaver.editConnection(name, host, port, database);
        if (!ok) return text({ error: `Conexão '${name}' não encontrada.` });
        return text({ success: true, updated: name });
      } catch (e: any) {
        return text({ error: e.message });
      }
    },
  );

  server.tool(
    "remove_connection",
    "Remove uma conexão do DBeaver",
    { name: z.string().describe("Nome ou ID da conexão") },
    async ({ name }) => {
      try {
        const ok = dbeaver.removeConnection(name);
        if (!ok) return text({ error: `Conexão '${name}' não encontrada.` });
        return text({ success: true, removed: name });
      } catch (e: any) {
        return text({ error: e.message });
      }
    },
  );

  server.tool(
    "test_connection",
    "Testa conectividade de uma conexão",
    { name: z.string().describe("Nome ou ID da conexão") },
    async ({ name }) => {
      try {
        const info = dbeaver.getConnectionInfo(name);
        if (!info) return text({ success: false, error: `Conexão '${name}' não encontrada.` });
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
