/**
 * mysql.ts — MySQL connection and query execution wrappers.
 * Uses mysql2/promise for async operations.
 */

import mysql from "mysql2/promise";
import type { FullConnectionInfo } from "./dbeaver.js";

export interface QueryResult {
  columns: string[];
  rows: Record<string, any>[];
  rowcount: number;
}

export interface WriteResult {
  rowcount: number;
  lastrowid: number | null;
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
  const conn = await mysqlConnect(info);
  try {
    const [rows, fields] = await conn.execute(sql, params || []);
    const columns = fields ? (fields as mysql.FieldPacket[]).map((f) => f.name) : [];
    const resultRows = Array.isArray(rows) ? (rows as Record<string, any>[]) : [];
    return { columns, rows: resultRows, rowcount: resultRows.length };
  } finally {
    await conn.end();
  }
}

export async function runWrite(
  info: FullConnectionInfo,
  sql: string,
): Promise<WriteResult> {
  const conn = await mysqlConnect(info);
  try {
    const [result] = await conn.execute(sql);
    await conn.query("COMMIT");
    const r = result as mysql.ResultSetHeader;
    return { rowcount: r.affectedRows, lastrowid: r.insertId ?? null };
  } finally {
    await conn.end();
  }
}
