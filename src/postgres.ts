/**
 * postgres.ts — PostgreSQL 连接和查询执行封装
 * 使用 pg 驱动实现数据库操作
 */

import pg from "pg";
import type { FullConnectionInfo } from "./dbeaver.js";

const { Pool } = pg;

export interface QueryResult {
  columns: string[];
  rows: Record<string, any>[];
  rowcount: number;
}

export interface WriteResult {
  rowcount: number;
  lastrowid: number | null;
}

export interface TableInfo {
  name: string;
  schema?: string;
  columns: ColumnInfo[];
  primaryKeys: string[];
  indexes?: IndexInfo[];
  foreignKeys?: ForeignKeyInfo[];
  estimatedRows?: number;
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: string;
}

export interface IndexInfo {
  name: string;
  columns: string[];
  unique: boolean;
}

export interface ForeignKeyInfo {
  name: string;
  columns: string[];
  referencedTable: string;
  referencedColumns: string[];
}

/**
 * 检测是否为连接断开类错误
 */
function isConnectionError(error: unknown): boolean {
  const msg = String((error as any)?.message || "");
  const code = String((error as any)?.code || "");
  return /Connection terminated|ECONNRESET|EPIPE|ETIMEDOUT|ECONNREFUSED|57P01|57P03|08003|08006/.test(msg + code);
}

/**
 * 带断线重试的操作包装器
 */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isConnectionError(error)) {
      return await fn();
    }
    throw error;
  }
}

/**
 * 创建 PostgreSQL 连接池
 */
function createPool(info: FullConnectionInfo): pg.Pool {
  return new Pool({
    host: info.host,
    port: parseInt(info.port, 10) || 5432,
    user: info.user || undefined,
    password: info.password || undefined,
    database: info.database || undefined,
    max: 3,
    idleTimeoutMillis: 60000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 30000,
  });
}

export async function postgresConnect(info: FullConnectionInfo): Promise<pg.Pool> {
  const pool = createPool(info);
  await pool.query("SELECT 1");
  return pool;
}

export async function runPostgresQuery(
  info: FullConnectionInfo,
  sql: string,
  params?: any[]
): Promise<QueryResult> {
  const pool = createPool(info);
  try {
    return await withRetry(async () => {
      const result = await pool.query(sql, params);
      const columns = result.fields ? result.fields.map((f) => f.name) : [];
      const rows = Array.isArray(result.rows) ? result.rows : [];
      return { columns, rows, rowcount: rows.length };
    });
  } finally {
    await pool.end();
  }
}

export async function runPostgresWrite(
  info: FullConnectionInfo,
  sql: string
): Promise<WriteResult> {
  const pool = createPool(info);
  try {
    const result = await pool.query(sql);
    await pool.query("COMMIT");
    return {
      rowcount: result.rowCount || 0,
      lastrowid: null,
    };
  } finally {
    await pool.end();
  }
}

/**
 * 获取 PostgreSQL Schema 信息（批量查询优化版本）
 */
export async function getPostgresSchema(info: FullConnectionInfo): Promise<{
  databaseName: string;
  tables: TableInfo[];
}> {
  const pool = createPool(info);
  try {
    return await withRetry(async () => _getPostgresSchemaImpl(pool, info));
  } finally {
    await pool.end();
  }
}

async function _getPostgresSchemaImpl(
  pool: pg.Pool,
  info: FullConnectionInfo
): Promise<{ databaseName: string; tables: TableInfo[] }> {
  // 获取当前数据库名
  const dbResult = await pool.query("SELECT current_database()");
  const databaseName = dbResult.rows[0]?.current_database || info.database || "unknown";

  // 批量获取所有表的列信息
  const allColumnsResult = await pool.query(`
    SELECT
      c.table_schema,
      c.table_name,
      c.column_name,
      c.data_type,
      c.is_nullable,
      c.column_default,
      c.character_maximum_length,
      c.numeric_precision,
      c.numeric_scale,
      c.ordinal_position
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON c.table_schema = t.table_schema AND c.table_name = t.table_name
    WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      AND t.table_type = 'BASE TABLE'
    ORDER BY c.table_schema, c.table_name, c.ordinal_position
  `);

  // 批量获取所有表的主键信息
  const allPrimaryKeysResult = await pool.query(`
    SELECT
      n.nspname as schema_name,
      t.relname as table_name,
      a.attname as column_name
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(i.indkey)
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE i.indisprimary
      AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
    ORDER BY n.nspname, t.relname, a.attnum
  `);

  // 批量获取所有表的索引信息（排除主键）
  const allIndexesResult = await pool.query(`
    SELECT
      n.nspname as schema_name,
      t.relname as table_name,
      i.relname as index_name,
      a.attname as column_name,
      ix.indisunique as is_unique
    FROM pg_class t
    JOIN pg_index ix ON t.oid = ix.indrelid
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE t.relkind = 'r'
      AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      AND NOT ix.indisprimary
    ORDER BY n.nspname, t.relname, i.relname, a.attnum
  `);

  // 批量获取所有表的行数估算
  const allStatsResult = await pool.query(`
    SELECT
      n.nspname as schema_name,
      c.relname as table_name,
      c.reltuples::bigint as estimated_rows
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
  `);

  // 批量获取所有外键信息
  let allForeignKeys: any[] = [];
  try {
    const allForeignKeysResult = await pool.query(`
      SELECT
        n.nspname AS schema_name,
        c.conname AS constraint_name,
        t.relname AS table_name,
        a.attname AS column_name,
        rn.nspname AS ref_schema_name,
        rt.relname AS referenced_table,
        ra.attname AS referenced_column,
        CASE c.confdeltype
          WHEN 'a' THEN 'NO ACTION'
          WHEN 'r' THEN 'RESTRICT'
          WHEN 'c' THEN 'CASCADE'
          WHEN 'n' THEN 'SET NULL'
          WHEN 'd' THEN 'SET DEFAULT'
        END AS delete_rule
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_class rt ON rt.oid = c.confrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_namespace rn ON rn.oid = rt.relnamespace
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
      JOIN pg_attribute ra ON ra.attrelid = rt.oid AND ra.attnum = c.confkey[array_position(c.conkey, a.attnum)]
      WHERE c.contype = 'f'
        AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      ORDER BY n.nspname, t.relname, c.conname, array_position(c.conkey, a.attnum)
    `);
    allForeignKeys = allForeignKeysResult.rows;
  } catch (error) {
    console.error("获取外键信息失败，跳过:", error);
  }

  return assemblePostgresSchema(
    databaseName,
    allColumnsResult.rows,
    allPrimaryKeysResult.rows,
    allIndexesResult.rows,
    allStatsResult.rows,
    allForeignKeys
  );
}

function makeTableKey(schemaName: string, tableName: string): string {
  return schemaName === "public" ? tableName : `${schemaName}.${tableName}`;
}

function assemblePostgresSchema(
  databaseName: string,
  allColumns: any[],
  allPrimaryKeys: any[],
  allIndexes: any[],
  allStats: any[],
  allForeignKeys: any[]
): { databaseName: string; tables: TableInfo[] } {
  // 按 schema.table 分组列信息
  const columnsByTable = new Map<string, ColumnInfo[]>();
  const schemaByTable = new Map<string, string>();

  for (const col of allColumns) {
    const schemaName = col.table_schema || "public";
    const tableName = col.table_name;
    const tableKey = makeTableKey(schemaName, tableName);

    if (!columnsByTable.has(tableKey)) {
      columnsByTable.set(tableKey, []);
      schemaByTable.set(tableKey, schemaName);
    }

    let dataType = col.data_type;
    if (col.character_maximum_length) {
      dataType += `(${col.character_maximum_length})`;
    } else if (col.numeric_precision) {
      dataType += `(${col.numeric_precision}${col.numeric_scale ? `,${col.numeric_scale}` : ""})`;
    }

    columnsByTable.get(tableKey)!.push({
      name: col.column_name,
      type: dataType,
      nullable: col.is_nullable === "YES",
      defaultValue: col.column_default || undefined,
    });
  }

  // 按 schema.table 分组主键信息
  const primaryKeysByTable = new Map<string, string[]>();
  for (const pk of allPrimaryKeys) {
    const tableKey = makeTableKey(pk.schema_name || "public", pk.table_name);
    if (!primaryKeysByTable.has(tableKey)) {
      primaryKeysByTable.set(tableKey, []);
    }
    primaryKeysByTable.get(tableKey)!.push(pk.column_name);
  }

  // 按 schema.table 分组索引信息
  const indexesByTable = new Map<string, Map<string, { columns: string[]; unique: boolean }>>();

  for (const idx of allIndexes) {
    const tableKey = makeTableKey(idx.schema_name || "public", idx.table_name);
    const indexName = idx.index_name;

    if (!indexesByTable.has(tableKey)) {
      indexesByTable.set(tableKey, new Map());
    }

    const tableIndexes = indexesByTable.get(tableKey)!;

    if (!tableIndexes.has(indexName)) {
      tableIndexes.set(indexName, {
        columns: [],
        unique: idx.is_unique,
      });
    }

    tableIndexes.get(indexName)!.columns.push(idx.column_name);
  }

  // 按 schema.table 分组行数统计
  const rowsByTable = new Map<string, number>();
  for (const stat of allStats) {
    const tableKey = makeTableKey(stat.schema_name || "public", stat.table_name);
    rowsByTable.set(tableKey, Number(stat.estimated_rows) || 0);
  }

  // 按 schema.table 分组外键信息
  const foreignKeysByTable = new Map<string, Map<string, { columns: string[]; referencedTable: string; referencedColumns: string[]; onDelete?: string }>>();

  for (const fk of allForeignKeys) {
    const tableKey = makeTableKey(fk.schema_name || "public", fk.table_name);
    const constraintName = fk.constraint_name;
    const refTableKey = makeTableKey(fk.ref_schema_name || "public", fk.referenced_table);

    if (!foreignKeysByTable.has(tableKey)) {
      foreignKeysByTable.set(tableKey, new Map());
    }

    const tableForeignKeys = foreignKeysByTable.get(tableKey)!;

    if (!tableForeignKeys.has(constraintName)) {
      tableForeignKeys.set(constraintName, {
        columns: [],
        referencedTable: refTableKey,
        referencedColumns: [],
        onDelete: fk.delete_rule,
      });
    }

    const fkInfo = tableForeignKeys.get(constraintName)!;
    fkInfo.columns.push(fk.column_name);
    fkInfo.referencedColumns.push(fk.referenced_column);
  }

  // 组装表信息
  const tables: TableInfo[] = [];

  for (const [tableKey, columns] of columnsByTable.entries()) {
    const tableIndexes = indexesByTable.get(tableKey);
    const indexInfos: IndexInfo[] = [];

    if (tableIndexes) {
      for (const [indexName, indexData] of tableIndexes.entries()) {
        indexInfos.push({
          name: indexName,
          columns: indexData.columns,
          unique: indexData.unique,
        });
      }
    }

    const tableForeignKeys = foreignKeysByTable.get(tableKey);
    const foreignKeyInfos: ForeignKeyInfo[] = [];

    if (tableForeignKeys) {
      for (const [constraintName, fkData] of tableForeignKeys.entries()) {
        foreignKeyInfos.push({
          name: constraintName,
          columns: fkData.columns,
          referencedTable: fkData.referencedTable,
          referencedColumns: fkData.referencedColumns,
        });
      }
    }

    tables.push({
      name: tableKey,
      schema: schemaByTable.get(tableKey),
      columns,
      primaryKeys: primaryKeysByTable.get(tableKey) || [],
      indexes: indexInfos.length > 0 ? indexInfos : undefined,
      foreignKeys: foreignKeyInfos.length > 0 ? foreignKeyInfos : undefined,
      estimatedRows: rowsByTable.get(tableKey) || 0,
    });
  }

  // 按表名排序
  tables.sort((a, b) => a.name.localeCompare(b.name));

  return { databaseName, tables };
}

/**
 * 检测写操作关键字
 */
const WRITE_KEYWORDS = new Set([
  "INSERT", "UPDATE", "DELETE", "DROP", "TRUNCATE", "ALTER", "CREATE",
]);

export function isPostgresWriteOperation(query: string): boolean {
  const trimmed = query.trim().toUpperCase();
  const keyword = trimmed.split(/\s+/)[0];
  return WRITE_KEYWORDS.has(keyword);
}
