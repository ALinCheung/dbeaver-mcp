/**
 * dbeaver.ts — Reads/writes DBeaver credentials and connections.
 * Supports macOS, Linux and Windows. Never logs passwords.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";

// DBeaver 21+ file-level encryption key (from DefaultSecureStorage.java → LOCAL_KEY_CACHE)
const DBEAVER_KEY = Buffer.from([
  0xba, 0xbb, 0x4a, 0x9f, 0x77, 0x4a, 0xb8, 0x53, 0xc9, 0x6c, 0x2d, 0x65,
  0x3d, 0xfe, 0x54, 0x4a,
]);

export interface ConnectionInfo {
  id: string;
  name: string;
  driver: string;
  host: string;
  port: string;
  database: string;
}

export interface FullConnectionInfo extends ConnectionInfo {
  port: string;
  user: string;
  password: string;
}

// ── Workspace detection ─────────────────────────────────────────────────────

function workspaceCandidates(): string[] {
  const home = os.homedir();
  switch (process.platform) {
    case "darwin":
      return [
        path.join(home, "Library", "DBeaverData", "workspace6", "General", ".dbeaver"),
        path.join(home, "Library", "Application Support", "DBeaverData", "workspace6", "General", ".dbeaver"),
        path.join(home, ".local", "share", "DBeaverData", "workspace6", "General", ".dbeaver"),
      ];
    case "linux":
      return [
        path.join(home, ".local", "share", "DBeaverData", "workspace6", "General", ".dbeaver"),
        path.join(home, "snap", "dbeaver-ce", "current", ".local", "share", "DBeaverData", "workspace6", "General", ".dbeaver"),
      ];
    default: {
      // Windows
      const appdata = process.env.APPDATA || path.join(home, "AppData", "Roaming");
      return [
        path.join(appdata, "DBeaverData", "workspace6", "General", ".dbeaver"),
        path.join(home, "AppData", "Roaming", "DBeaverData", "workspace6", "General", ".dbeaver"),
      ];
    }
  }
}

export function findWorkspace(): string {
  for (const p of workspaceCandidates()) {
    if (fs.existsSync(p)) return p;
  }
  const paths = workspaceCandidates().map((p) => `  ${p}`).join("\n");
  throw new Error(`Workspace do DBeaver não encontrado.\nCaminhos verificados:\n${paths}`);
}

// ── JSON helpers ────────────────────────────────────────────────────────────

function loadJson(filePath: string): Record<string, any> {
  const raw = fs.readFileSync(filePath, "utf-8");
  try {
    return JSON.parse(raw);
  } catch {
    // Fallback: try base64 decode
    return JSON.parse(Buffer.from(raw, "base64").toString("utf-8"));
  }
}

// ── Crypto (DBeaver 21+ file-level encryption) ─────────────────────────────

function decryptCredentialsFile(filePath: string): Record<string, any> {
  const data = fs.readFileSync(filePath);
  const iv = data.subarray(0, 16);
  const encrypted = data.subarray(16);
  const decipher = crypto.createDecipheriv("aes-128-cbc", DBEAVER_KEY, iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(decrypted.toString("utf-8"));
}

function encryptCredentialsFile(filePath: string, data: Record<string, any>): void {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-128-cbc", DBEAVER_KEY, iv);
  const json = Buffer.from(JSON.stringify(data, null, 2), "utf-8");
  const encrypted = Buffer.concat([cipher.update(json), cipher.final()]);
  fs.writeFileSync(filePath, Buffer.concat([iv, encrypted]));
}

// ── Datasources ─────────────────────────────────────────────────────────────

function loadDatasources(ws: string): Record<string, any> {
  const p = path.join(ws, "data-sources.json");
  if (!fs.existsSync(p)) return {};
  return loadJson(p).connections || {};
}

function saveDatasources(ws: string, connections: Record<string, any>): void {
  const p = path.join(ws, "data-sources.json");
  const existing = fs.existsSync(p) ? loadJson(p) : {};
  existing.connections = connections;
  fs.writeFileSync(p, JSON.stringify(existing, null, 2), "utf-8");
}

// ── Credentials ─────────────────────────────────────────────────────────────

function loadCredentials(ws: string): Record<string, { user: string; password: string }> {
  const p = path.join(ws, "credentials-config.json");
  if (!fs.existsSync(p)) return {};

  let raw: Record<string, any>;
  try {
    // DBeaver 21+: file is encrypted binary
    raw = decryptCredentialsFile(p);
  } catch {
    try {
      // Fallback: older DBeaver versions store plain JSON
      raw = loadJson(p);
    } catch {
      return {};
    }
  }

  const result: Record<string, { user: string; password: string }> = {};
  for (const [connId, data] of Object.entries(raw)) {
    const inner = (data as any)?.["#connection"] || {};
    result[connId] = {
      user: inner.user || "",
      password: inner.password || "",
    };
  }
  return result;
}

function saveCredentials(ws: string, connId: string, user: string, password: string): void {
  const p = path.join(ws, "credentials-config.json");

  let raw: Record<string, any> = {};
  if (fs.existsSync(p)) {
    try {
      raw = decryptCredentialsFile(p);
    } catch {
      try {
        raw = loadJson(p);
      } catch {
        raw = {};
      }
    }
  }

  raw[connId] = { "#connection": { user, password } };
  encryptCredentialsFile(p, raw);
}

// ── Fuzzy lookup ────────────────────────────────────────────────────────────

function findId(nameOrId: string, datasources: Record<string, any>): string | null {
  // Exact match by ID or name
  for (const [cid, c] of Object.entries(datasources)) {
    if (cid === nameOrId || c.name === nameOrId) return cid;
  }
  // Fuzzy: substring match (case-insensitive)
  for (const [cid, c] of Object.entries(datasources)) {
    if ((c.name || "").toLowerCase().includes(nameOrId.toLowerCase())) return cid;
  }
  return null;
}

// ── Public API ──────────────────────────────────────────────────────────────

export function listConnectionsSafe(workspace?: string): ConnectionInfo[] {
  const ws = workspace || findWorkspace();
  const result: ConnectionInfo[] = [];
  for (const [cid, c] of Object.entries(loadDatasources(ws))) {
    const cfg = c.configuration || {};
    result.push({
      id: cid,
      name: c.name || cid,
      driver: c.driver || "",
      host: cfg.host || "",
      port: cfg.port || "",
      database: cfg.database || "",
    });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

export function getConnectionInfo(nameOrId: string, workspace?: string): FullConnectionInfo | null {
  const ws = workspace || findWorkspace();
  const ds = loadDatasources(ws);
  const creds = loadCredentials(ws);
  const matchId = findId(nameOrId, ds);
  if (!matchId) return null;

  const c = ds[matchId];
  const cfg = c.configuration || {};
  const cr = creds[matchId] || {};

  return {
    id: matchId,
    name: c.name || matchId,
    driver: c.driver || "",
    host: cfg.host || "localhost",
    port: String(cfg.port || 3306),
    database: cfg.database || "",
    user: cr.user || cfg.user || "",
    password: cr.password || "",
  };
}

export function addConnection(
  name: string,
  host: string,
  port: number,
  database: string,
  user = "",
  password = "",
  driver = "mysql8",
  workspace?: string,
): string {
  const ws = workspace || findWorkspace();
  const ds = loadDatasources(ws);
  const connId = `mysql-${crypto.randomBytes(4).toString("hex")}`;
  const cfg: Record<string, string> = { host, port: String(port), database };
  if (user) cfg.user = user;
  ds[connId] = { name, driver, configuration: cfg };
  saveDatasources(ws, ds);
  if (user && password) {
    saveCredentials(ws, connId, user, password);
  }
  return connId;
}

export function editConnection(
  nameOrId: string,
  host?: string,
  port?: number,
  database?: string,
  workspace?: string,
): boolean {
  const ws = workspace || findWorkspace();
  const ds = loadDatasources(ws);
  const matchId = findId(nameOrId, ds);
  if (!matchId) return false;

  const cfg = ds[matchId].configuration || {};
  ds[matchId].configuration = cfg;
  if (host !== undefined) cfg.host = host;
  if (port !== undefined) cfg.port = String(port);
  if (database !== undefined) cfg.database = database;
  saveDatasources(ws, ds);
  return true;
}

export function removeConnection(nameOrId: string, workspace?: string): boolean {
  const ws = workspace || findWorkspace();
  const ds = loadDatasources(ws);
  const matchId = findId(nameOrId, ds);
  if (!matchId) return false;

  delete ds[matchId];
  saveDatasources(ws, ds);

  // Remove credentials too
  const credPath = path.join(ws, "credentials-config.json");
  if (fs.existsSync(credPath)) {
    try {
      let raw: Record<string, any>;
      try {
        raw = decryptCredentialsFile(credPath);
      } catch {
        raw = loadJson(credPath);
      }
      delete raw[matchId];
      encryptCredentialsFile(credPath, raw);
    } catch {
      // Ignore credential cleanup errors
    }
  }
  return true;
}
