/**
 * mysql.ts — MySQL connection and query execution wrappers.
 * Uses mysql2/promise for async operations.
 */

import mysql from "mysql2/promise";
import type { FullConnectionInfo } from "./dbeaver.js";
import crypto from "node:crypto";

export interface QueryResult {
  columns: string[];
  rows: Record<string, any>[];
  rowcount: number;
}

export interface WriteResult {
  rowcount: number;
  lastrowid: number | null;
}

// MySQL 连接池缓存（按连接参数 hash）
const poolCache = new Map<string, mysql.Pool>();

/**
 * 根据连接参数生成缓存 key
 */
function getPoolKey(info: FullConnectionInfo): string {
  const str = `${info.host}:${info.port}:${info.database}:${info.user}`;
  return crypto.createHash("sha256").update(str).digest("hex").slice(0, 16);
}

/**
 * 获取或创建 MySQL 连接池
 */
function getPool(info: FullConnectionInfo): mysql.Pool {
  const key = getPoolKey(info);
  if (!poolCache.has(key)) {
    const pool = mysql.createPool({
      host: info.host,
      port: parseInt(info.port, 10) || 3306,
      database: info.database || undefined,
      user: info.user,
      password: info.password,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: 10000,
    });
    poolCache.set(key, pool);
  }
  return poolCache.get(key)!;
}

/**
 * 清除连接池缓存（用于测试或重新配置）
 */
export function clearPoolCache(): void {
  for (const pool of poolCache.values()) {
    pool.end().catch(() => {});
  }
  poolCache.clear();
}

export async function mysqlConnect(info: FullConnectionInfo): Promise<mysql.Connection> {
  return mysql.createConnection({
    host: info.host,
    port: parseInt(info.port, 10) || 3306,
    database: info.database || undefined,
    user: info.user,
    password: info.password,
    connectTimeout: 10000,
  });
}

export async function runQuery(
  info: FullConnectionInfo,
  sql: string,
  params?: any[],
): Promise<QueryResult> {
  const pool = getPool(info);
  const [rows, fields] = await pool.execute(sql, params || []);
  const columns = fields ? (fields as mysql.FieldPacket[]).map((f) => f.name) : [];
  const resultRows = Array.isArray(rows) ? (rows as Record<string, any>[]) : [];
  return { columns, rows: resultRows, rowcount: resultRows.length };
}

export async function runWrite(
  info: FullConnectionInfo,
  sql: string,
): Promise<WriteResult> {
  const pool = getPool(info);
  const [result] = await pool.execute(sql);
  await pool.query("COMMIT");
  const r = result as mysql.ResultSetHeader;
  return { rowcount: r.affectedRows, lastrowid: r.insertId ?? null };
}
