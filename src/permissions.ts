/**
 * permissions.ts — Permission system for dbeaver-mcp.
 * Loads ~/.dbeaver-mcp/settings.json and checks SQL operation permissions.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const SETTINGS_PATH = path.join(os.homedir(), ".dbeaver-mcp", "settings.json");

// 权限设置缓存
interface SettingsCache {
  data: PermissionsConfig;
  timestamp: number;
}
let settingsCache: SettingsCache | null = null;
const CACHE_TTL_MS = 60_000; // 60 秒缓存

export const RECOGNIZED_OPERATIONS = new Set([
  "SELECT", "SHOW", "EXPLAIN", "DESCRIBE",
  "INSERT", "UPDATE", "DELETE",
  "CREATE", "ALTER", "DROP", "TRUNCATE",
  "GRANT", "REVOKE", "FLUSH", "OPTIMIZE", "REPAIR",
  "USE", "SET",
  // Redis commands
  "GET", "MGET", "KEYS", "TYPE", "EXISTS", "TTL", "GETRANGE",
  "SMEMBERS", "HGET", "HGETALL", "LRANGE", "ZCARD", "ZCOUNT", "ZSCORE",
  "ZRANGE", "ZRANGEBYSCORE", "PING", "DBSIZE", "INFO", "COMMAND",
  "SET", "SETEX", "SETNX", "MSET", "MSETNX",
  "DEL", "UNLINK", "FLUSHDB", "FLUSHALL",
  "HSET", "HMSET", "HSETNX",
  "LPUSH", "RPUSH", "LPUSHX", "RPUSHX", "LINSERT", "LTRIM", "LSET",
  "SADD", "SPOP", "SREM", "SMOVE",
  "ZADD", "ZINCRBY", "ZREM", "ZREMRANGEBYSCORE",
  "INCR", "INCRBY", "INCRBYFLOAT", "DECR", "DECRBY",
  "GETDEL", "GETEX",
]);

interface PermissionBlock {
  allowed_operations?: string[];
  blocked_operations?: string[];
}

interface PermissionsConfig {
  permissions?: {
    global?: PermissionBlock;
    connections?: Record<string, PermissionBlock>;
  };
}

function loadSettings(): PermissionsConfig {
  // 检查缓存是否有效
  if (settingsCache && Date.now() - settingsCache.timestamp < CACHE_TTL_MS) {
    return settingsCache.data;
  }

  try {
    const data = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
    settingsCache = { data, timestamp: Date.now() };
    return data;
  } catch {
    return {};
  }
}

/**
 * 清除权限缓存（强制重新读取设置文件）
 */
export function clearPermissionCache(): void {
  settingsCache = null;
}

export function extractSqlKeyword(sql: string): string {
  sql = sql.trim();
  // Remove leading comments
  sql = sql.replace(/^(\/\*.*?\*\/\s*|--[^\n]*\n\s*)*/s, "");
  const parts = sql.split(/\s+/);
  return parts.length > 0 ? parts[0].toUpperCase() : "";
}

/**
 * Check if a SQL operation is allowed for a connection.
 * Returns null if allowed, or an error message if blocked.
 */
export function checkPermission(connectionName: string, sql: string): string | null {
  const settings = loadSettings();
  const permissions = settings.permissions;
  if (!permissions) return null; // No settings = everything allowed (backward-compatible)

  const keyword = extractSqlKeyword(sql);
  if (!keyword) return null;

  // Check connection-specific permissions first
  const connPerms = permissions.connections?.[connectionName];
  if (connPerms !== undefined) {
    const allowed = new Set((connPerms.allowed_operations || []).map((op) => op.toUpperCase()));
    if (allowed.size > 0 && !allowed.has(keyword)) {
      return `Operation '${keyword}' not allowed on connection '${connectionName}'. Allowed operations: ${[...allowed].sort().join(", ")}`;
    }
    const blocked = new Set((connPerms.blocked_operations || []).map((op) => op.toUpperCase()));
    if (blocked.has(keyword)) {
      return `Operation '${keyword}' blocked on connection '${connectionName}'.`;
    }
    return null;
  }

  // Global permissions
  const globalPerms = permissions.global;
  if (!globalPerms) return null; // No global = everything allowed

  const allowed = new Set((globalPerms.allowed_operations || []).map((op) => op.toUpperCase()));
  if (allowed.size > 0 && !allowed.has(keyword)) {
    return `Operation '${keyword}' not allowed (global). Allowed operations: ${[...allowed].sort().join(", ")}`;
  }

  const blocked = new Set((globalPerms.blocked_operations || []).map((op) => op.toUpperCase()));
  if (blocked.has(keyword)) {
    return `Operation '${keyword}' blocked (global).`;
  }

  return null;
}
