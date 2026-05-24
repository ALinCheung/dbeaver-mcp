#!/usr/bin/env node
/**
 * cli-auto.ts — CLI 入口：自动模式
 * 从 DBeaver 读取连接配置启动 MCP server
 *
 * 支持子命令：
 *   install   - 运行安装流程
 *   --help    - 显示帮助
 *   --version - 显示版本
 *   (default) - 启动 MCP server，自动从 DBeaver 读取配置
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
  npx dbeaver-mcp            Start the MCP server (stdio) — auto mode
  npx dbeaver-mcp install    Setup: verify DBeaver, create config, register in Claude
  npx dbeaver-mcp --help     Show this help
  npx dbeaver-mcp --version  Show version

Auto mode: 连接参数将被忽略，始终从 DBeaver 读取连接配置。`);
    break;

  case "--version":
  case "-v": {
    const require = createRequire(import.meta.url);
    const pkg = require("../package.json");
    console.log(pkg.version);
    break;
  }

  default: {
    // 默认启动：自动从 DBeaver 读取配置
    const { startServer } = await import("./index.js");
    await startServer();
  }
}