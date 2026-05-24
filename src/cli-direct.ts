#!/usr/bin/env node
/**
 * cli-direct.ts — CLI 入口：直连模式
 * 通过 CLI 参数直接连接数据库，无需 DBeaver
 *
 * 支持子命令：
 *   install   - 运行安装流程
 *   --help    - 显示帮助
 *   --version - 显示版本
 *   (default) - 以直连模式启动 MCP server
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
  name?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--host":
        args.host = argv[++i];
        break;
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
      case "--name":
      case "-n":
        args.name = argv[++i];
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
  // --name is required for direct mode to identify the connection
  if (args.name !== undefined && args.name.trim() === "") {
    return "error: --name must be provided";
  }
  if (args.host !== undefined && args.name === undefined) {
    return "error: --name must be provided (required for direct mode)";
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
    console.log(`database-mcp — Direct database connection MCP server (no DBeaver required)

Usage:
  npx database-mcp --host <host> --username <user> --password <pass> --database <db> [--driver mysql8] [--port <port>] [--name <connection-name>]

Supported drivers: ${VALID_DRIVERS.join(", ")}

Arguments:
  --host     Database host (required)
  --port     Port (optional, auto-detected by driver)
  --username Username (not required for Redis)
  --password Password (required)
  --database Database name (required)
  --driver   Driver type: mysql8, mysql5, mariadb, postgres, postgresql, postgres-jdbc, oracle, redis (default: mysql8)
  --name     Connection name for identification in list_connections (required)

Examples:
  npx database-mcp --host localhost --username root --password secret --database test --name my-mysql
  npx database-mcp --host pgserver --port 5432 --username pguser --password pgpass --database mydb --driver postgres --name my-postgres
  npx database-mcp --host redis-host --password redis_password --database 0 --driver redis --name my-redis

Short form:
  npx database-mcp -h <host> -u <user> -P <pass> -d <db> [-D mysql8] [-p <port>] [-n <name>]`);
    break;

  case "--version":
  case "-v": {
    const require = createRequire(import.meta.url);
    const pkg = require("../package.json");
    console.log(pkg.version);
    break;
  }

  default: {
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