/**
 * index.ts — MCP server entry point for dbeaver-mcp.
 * Exposes DBeaver connections as MCP tools via stdio transport.
 * Supports direct connection mode via CLI args.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerConnectionTools } from "./tools/connections.js";
import { registerQueryTools } from "./tools/queries.js";
import { registerSchemaTools } from "./tools/schema.js";
import type { ConnectParams } from "./dbeaver.js";

// Store default connect params globally for tool handlers
let defaultConnectParams: ConnectParams | undefined;

export function getDefaultConnectParams(): ConnectParams | undefined {
  return defaultConnectParams;
}

export async function startServer(cliArgs?: ConnectParams): Promise<void> {
  // If CLI args provided, store them as default connect params
  // Redis 连接不需要 username
  if (cliArgs?.host && cliArgs?.password && cliArgs?.database && (cliArgs?.username || cliArgs?.driver === "redis")) {
    defaultConnectParams = cliArgs;
  }

  const server = new McpServer({
    name: "dbeaver-mcp",
    version: "1.0.0",
    description: "Exposes DBeaver connections as MCP tools. Supports direct connection via CLI args (--host, --username, --password, --database, --driver, --port) when DBeaver is not installed.",
  });

  registerConnectionTools(server);
  registerQueryTools(server);
  registerSchemaTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("dbeaver-mcp server started (stdio)");
}