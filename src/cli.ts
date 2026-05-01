#!/usr/bin/env node
/**
 * cli.ts — CLI dispatcher for dbeaver-mcp.
 * No args: starts the MCP server. Subcommands: install, --help, --version.
 */

import { createRequire } from "node:module";

const command = process.argv[2];

switch (command) {
  case "install": {
    const { runInstall } = await import("./commands/install.js");
    await runInstall();
    break;
  }

  case "--help":
  case "-h":
    console.log(`dbeaver-mcp — MCP server exposing DBeaver connections to Claude

Usage:
  npx dbeaver-mcp            Start the MCP server (stdio)
  npx dbeaver-mcp install    Setup: verify DBeaver, create config, register in Claude
  npx dbeaver-mcp --version  Show version
  npx dbeaver-mcp --help     Show this help`);
    break;

  case "--version":
  case "-v": {
    const require = createRequire(import.meta.url);
    const pkg = require("../package.json");
    console.log(pkg.version);
    break;
  }

  default: {
    const { startServer } = await import("./index.js");
    await startServer();
  }
}
