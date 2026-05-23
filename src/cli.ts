#!/usr/bin/env node
/**
 * cli.ts — CLI dispatcher for dbeaver-mcp.
 * Supports CLI args for direct connection mode: --host, --port, --username, --password, --database, --driver
 */

import { createRequire } from "node:module";
import type { ConnectParams } from "./dbeaver.js";

const VALID_DRIVERS = [
  "mysql8", "mysql5", "mariadb",
  "postgres", "postgresql", "postgres-jdbc",
  "oracle", "redis"
];

interface CliArgs {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
  driver?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--host":
      case "-h":
        args.host = argv[++i];
        break;
      case "--port":
      case "-p":
        args.port = parseInt(argv[++i], 10);
        break;
      case "--username":
      case "-u":
        args.username = argv[++i];
        break;
      case "--password":
      case "-P":
        args.password = argv[++i];
        break;
      case "--database":
      case "-d":
        args.database = argv[++i];
        break;
      case "--driver":
      case "-D":
        args.driver = argv[++i];
        break;
    }
  }
  return args;
}

function validateArgs(args: CliArgs): string | null {
  if (args.host !== undefined && args.host.trim() === "") {
    return "error: --host must be a valid hostname or IP address";
  }
  if (args.port !== undefined && (isNaN(args.port) || args.port < 1 || args.port > 65535)) {
    return "error: --port must be between 1-65535";
  }
  if (args.username !== undefined && args.username.trim() === "") {
    return "error: --username must be provided";
  }
  // 直接连接模式（提供了 host）时才要求 username
  if (args.host !== undefined && args.username === undefined && args.driver !== "redis") {
    return "error: --username must be provided";
  }
  if (args.password !== undefined && args.password.trim() === "") {
    return "error: --password must be provided";
  }
  if (args.database !== undefined && args.database.trim() === "") {
    return "error: --database must be provided";
  }
  if (args.driver !== undefined && !VALID_DRIVERS.includes(args.driver)) {
    return `error: --driver must be one of: ${VALID_DRIVERS.join(", ")}`;
  }
  return null;
}

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
  npx dbeaver-mcp --help     Show this help
  npx dbeaver-mcp --version  Show version

Direct connection mode (without DBeaver):
  npx dbeaver-mcp --host <host> --username <user> --password <pass> --database <db> [--driver mysql8] [--port <port>]
  npx dbeaver-mcp -h <host> -u <user> -P <pass> -d <db> [-D mysql8] [-p <port>]

Supported drivers: ${VALID_DRIVERS.join(", ")}`);
    break;

  case "--version":
  case "-v": {
    const require = createRequire(import.meta.url);
    const pkg = require("../package.json");
    console.log(pkg.version);
    break;
  }

  default: {
    // Parse CLI args for direct connection mode
    const cliArgs = parseArgs(process.argv);
    const validationError = validateArgs(cliArgs);
    if (validationError) {
      console.error(validationError);
      process.exit(1);
    }

    const { startServer } = await import("./index.js");
    await startServer(cliArgs as ConnectParams);
  }
}

export { VALID_DRIVERS, parseArgs, validateArgs };