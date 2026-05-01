/**
 * install.ts — Cross-platform install command for dbeaver-mcp.
 * Verifies DBeaver workspace, creates config, registers in Claude Code.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { findWorkspace } from "../dbeaver.js";

const CONFIG_DIR = path.join(os.homedir(), ".dbeaver-mcp");
const SETTINGS_PATH = path.join(CONFIG_DIR, "settings.json");

function log(msg: string): void {
  console.log(msg);
}

function logOk(msg: string): void {
  console.log(`  [ok] ${msg}`);
}

function logWarn(msg: string): void {
  console.log(`  [!!] ${msg}`);
}

function stepCheckWorkspace(): void {
  log("\n1. Checking DBeaver workspace...");
  try {
    const ws = findWorkspace();
    logOk(`Found: ${ws}`);
  } catch {
    logWarn("DBeaver workspace not found.");
    logWarn("Install DBeaver first, or the server will detect it later at runtime.");
  }
}

function stepCreateSettings(): void {
  log("\n2. Creating config directory...");
  fs.mkdirSync(CONFIG_DIR, { recursive: true });

  if (fs.existsSync(SETTINGS_PATH)) {
    logOk(`settings.json already exists at ${SETTINGS_PATH}`);
    return;
  }

  const require = createRequire(import.meta.url);
  const defaultSettingsPath = require.resolve("../../settings.default.json");
  const content = fs.readFileSync(defaultSettingsPath, "utf-8");
  fs.writeFileSync(SETTINGS_PATH, content, "utf-8");
  logOk(`Created ${SETTINGS_PATH} with read-only defaults`);
}

function stepRegisterClaudeCode(): void {
  log("\n3. Registering in Claude Code...");
  try {
    execSync("claude --version", { stdio: "ignore" });
  } catch {
    logWarn("Claude Code CLI not found. Skipping auto-registration.");
    log("   Install Claude Code, then run:");
    log("   claude mcp add dbeaver-mcp -- npx dbeaver-mcp");
    return;
  }

  try {
    execSync("claude mcp add dbeaver-mcp -- npx dbeaver-mcp", {
      stdio: "inherit",
    });
    logOk("Registered in Claude Code");
  } catch {
    logWarn("Could not register automatically. Run manually:");
    log("   claude mcp add dbeaver-mcp -- npx dbeaver-mcp");
  }
}

function stepShowDesktopConfig(): void {
  log("\n4. Claude Desktop configuration:");
  log("   Add this to your claude_desktop_config.json:\n");
  const config = {
    mcpServers: {
      "dbeaver-mcp": {
        command: "npx",
        args: ["dbeaver-mcp"],
      },
    },
  };
  log(JSON.stringify(config, null, 2));

  const desktopConfigPaths: Record<string, string> = {
    darwin: path.join(os.homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json"),
    linux: path.join(os.homedir(), ".config", "Claude", "claude_desktop_config.json"),
    win32: path.join(process.env.APPDATA || "", "Claude", "claude_desktop_config.json"),
  };
  const configPath = desktopConfigPaths[process.platform];
  if (configPath) {
    log(`\n   Config file location: ${configPath}`);
  }
}

export async function runInstall(): Promise<void> {
  const require = createRequire(import.meta.url);
  const pkg = require("../../package.json");

  log(`=== dbeaver-mcp v${pkg.version} — Setup ===`);

  stepCheckWorkspace();
  stepCreateSettings();
  stepRegisterClaudeCode();
  stepShowDesktopConfig();

  log("\n=== Setup complete! ===\n");
  log("Test the server:");
  log("  npx dbeaver-mcp\n");
}
