/**
 * index.ts — MCP server entry point for dbeaver-mcp.
 * Exposes DBeaver connections as MCP tools via stdio transport.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerConnectionTools } from "./tools/connections.js";
import { registerQueryTools } from "./tools/queries.js";
import { registerSchemaTools } from "./tools/schema.js";

export async function startServer(): Promise<void> {
  const server = new McpServer({
    name: "dbeaver-mcp",
    version: "1.0.0",
  });

  registerConnectionTools(server);
  registerQueryTools(server);
  registerSchemaTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("dbeaver-mcp server started (stdio)");
}
