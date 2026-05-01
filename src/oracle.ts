/**
 * oracle.ts — Oracle 连接和查询执行封装
 * 使用 oracledb 驱动实现数据库操作
 */

import oracledb from "oracledb";
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

export interface TableInfo {
  name: string;
  schema?: string;
  comment?: string;
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
  comment?: string;
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
  onDelete?: string;
}

let thickModeInitialized = false;

/**
 * 初始化 Oracle Thick 模式
 */
function initOracleThickMode(oracleClientPath?: string): void {
  if (oracleClientPath && !thickModeInitialized) {
    try {
      oracledb.initOracleClient({ libDir: oracleClientPath });
      thickModeInitialized = true;
    } catch (error: any) {
      if (!error.message?.includes("already initialized")) {
        throw new Error(`Oracle Client 初始化失败: ${error.message}`);
      }
      thickModeInitialized = true;
    }
  }
  oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
  oracledb.fetchAsString = [oracledb.CLOB];
}

function isConnectionError(error: unknown): boolean {
  const msg = String((error as any)?.message || "");
  const errNum = (error as any)?.errorNum;
  return (
    /NJS-003|NJS-500|NJS-521|DPI-1010|DPI-1080|ECONNRESET|EPIPE|ETIMEDOUT|ECONNREFUSED/.test(
      msg
    ) || [3113, 3114, 3135, 12170, 12571, 28547].includes(errNum)
  );
}

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

async function withConnection<T>(
  pool: oracledb.Pool,
  fn: (conn: oracledb.Connection) => Promise<T>
): Promise<T> {
  const connection = await pool.getConnection();
  try {
    return await fn(connection);
  } finally {
    await connection.close();
  }
}

/**
 * 构建 Oracle 连接字符串
 */
function buildConnectionString(info: FullConnectionInfo): string {
  const host = info.host;
  const port = info.port || "1521";
  const database = info.database;

  if (!database) {
    throw new Error("必须提供 database（service name 或 SID）");
  }

  return `${host}:${port}/${database}`;
}

/**
 * 创建 Oracle 连接池
 */
async function createPool(info: FullConnectionInfo): Promise<oracledb.Pool> {
  const connectionString = buildConnectionString(info);
  return await oracledb.createPool({
    user: info.user,
    password: info.password,
    connectString: connectionString,
    poolMin: 1,
    poolMax: 3,
    poolTimeout: 60,
    poolPingInterval: 30,
  });
}

export async function oracleConnect(info: FullConnectionInfo): Promise<oracledb.Pool> {
  initOracleThickMode();
  const pool = await createPool(info);
  await pool.getConnection().then((c) => c.close());
  return pool;
}

export async function runOracleQuery(
  info: FullConnectionInfo,
  sql: string,
  params?: any[]
): Promise<QueryResult> {
  initOracleThickMode();
  const pool = await createPool(info);
  try {
    return await withRetry(async () =>
      withConnection(pool, async (connection) => {
        let cleanQuery = sql.trim();
        if (cleanQuery.endsWith(";")) {
          cleanQuery = cleanQuery.slice(0, -1).trim();
        }
        const result = await connection.execute(
          cleanQuery,
          params || [],
          { autoCommit: false, outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (result.rows && result.rows.length > 0) {
          const rows = result.rows.map((row: any) => {
            const r: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(row)) {
              r[k.toLowerCase()] = v;
            }
            return r;
          });
          const columns = result.metaData
            ? result.metaData.map((m: any) => m.name.toLowerCase())
            : Object.keys(rows[0] || {});
          return { columns, rows, rowcount: rows.length };
        } else if (result.rowsAffected !== undefined && result.rowsAffected > 0) {
          return { columns: [], rows: [], rowcount: result.rowsAffected };
        } else {
          return { columns: [], rows: [], rowcount: 0 };
        }
      })
    );
  } finally {
    await pool.close(0);
  }
}

export async function runOracleWrite(
  info: FullConnectionInfo,
  sql: string
): Promise<WriteResult> {
  initOracleThickMode();
  const pool = await createPool(info);
  try {
    return await withRetry(async () =>
      withConnection(pool, async (connection) => {
        let cleanQuery = sql.trim();
        if (cleanQuery.endsWith(";")) {
          cleanQuery = cleanQuery.slice(0, -1).trim();
        }
        const result = await connection.execute(cleanQuery, [], { autoCommit: true });
        return {
          rowcount: result.rowsAffected || 0,
          lastrowid: null,
        };
      })
    );
  } finally {
    await pool.close(0);
  }
}

/**
 * 获取 Oracle Schema 信息
 */
export async function getOracleSchema(info: FullConnectionInfo): Promise<{
  databaseName: string;
  tables: TableInfo[];
}> {
  initOracleThickMode();
  const pool = await createPool(info);
  try {
    return await withRetry(async () =>
      withConnection(pool, async (connection) => {
        return _getOracleSchemaImpl(connection, info);
      })
    );
  } finally {
    await pool.close(0);
  }
}

const SYSTEM_USERS = [
  "SYS", "SYSTEM", "DBSNMP", "APPQOSSYS", "DBSFWUSER",
  "OUTLN", "GSMADMIN_INTERNAL", "GGSYS", "XDB", "WMSYS",
  "MDSYS", "ORDDATA", "CTXSYS", "ORDSYS", "OLAPSYS",
  "LBACSYS", "DVSYS", "AUDSYS", "OJVMSYS", "REMOTE_SCHEDULER_AGENT",
];

async function _getOracleSchemaImpl(
  connection: oracledb.Connection,
  info: FullConnectionInfo
): Promise<{ databaseName: string; tables: TableInfo[] }> {
  // 获取当前用户
  const userResult = await connection.execute("SELECT USER FROM DUAL");
  const currentUser = userResult.rows?.[0]
    ? Object.values(userResult.rows[0])[0] as string
    : "unknown";
  const databaseName = currentUser;

  // 批量获取所有表的列信息
  const allColumnsResult = await connection.execute(
    `SELECT OWNER, TABLE_NAME, COLUMN_NAME, DATA_TYPE, DATA_LENGTH, DATA_PRECISION,
            DATA_SCALE, NULLABLE, DATA_DEFAULT, COLUMN_ID
     FROM ALL_TAB_COLUMNS
     WHERE OWNER NOT IN (${SYSTEM_USERS.map((u) => `'${u}'`).join(",")})
     ORDER BY TABLE_NAME, COLUMN_ID`
  );

  // 批量获取所有列注释
  const allCommentsResult = await connection.execute(
    `SELECT OWNER, TABLE_NAME, COLUMN_NAME, COMMENTS
     FROM ALL_COL_COMMENTS
     WHERE OWNER NOT IN (${SYSTEM_USERS.map((u) => `'${u}'`).join(",")})
       AND COMMENTS IS NOT NULL`
  );

  // 批量获取所有主键信息
  const allPrimaryKeysResult = await connection.execute(
    `SELECT cons.OWNER, cons.TABLE_NAME, cols.COLUMN_NAME, cols.POSITION
     FROM ALL_CONSTRAINTS cons
     JOIN ALL_CONS_COLUMNS cols
       ON cons.CONSTRAINT_NAME = cols.CONSTRAINT_NAME
       AND cons.OWNER = cols.OWNER
     WHERE cons.CONSTRAINT_TYPE = 'P'
       AND cons.OWNER NOT IN (${SYSTEM_USERS.map((u) => `'${u}'`).join(",")})
     ORDER BY cons.TABLE_NAME, cols.POSITION`
  );

  // 批量获取所有索引信息
  const allIndexesResult = await connection.execute(
    `SELECT i.TABLE_OWNER AS OWNER, i.TABLE_NAME, i.INDEX_NAME, i.UNIQUENESS, ic.COLUMN_NAME, ic.COLUMN_POSITION
     FROM ALL_INDEXES i
     JOIN ALL_IND_COLUMNS ic
       ON i.INDEX_NAME = ic.INDEX_NAME
       AND i.OWNER = ic.INDEX_OWNER
     WHERE i.OWNER NOT IN (${SYSTEM_USERS.map((u) => `'${u}'`).join(",")})
       AND i.INDEX_TYPE != 'LOB'
     ORDER BY i.TABLE_NAME, i.INDEX_NAME, ic.COLUMN_POSITION`
  );

  // 批量获取所有表的行数估算和表注释
  const allStatsResult = await connection.execute(
    `SELECT t.OWNER, t.TABLE_NAME, t.NUM_ROWS, c.COMMENTS AS TABLE_COMMENT
     FROM ALL_TABLES t
     LEFT JOIN ALL_TAB_COMMENTS c ON t.TABLE_NAME = c.TABLE_NAME AND t.OWNER = c.OWNER
     WHERE t.OWNER NOT IN (${SYSTEM_USERS.map((u) => `'${u}'`).join(",")})
       AND t.TEMPORARY = 'N'`
  );

  // 批量获取所有外键信息
  let allForeignKeys: any[] = [];
  try {
    const allForeignKeysResult = await connection.execute(
      `SELECT
        c.OWNER,
        c.TABLE_NAME,
        c.CONSTRAINT_NAME,
        cc.COLUMN_NAME,
        rc.OWNER AS REF_OWNER,
        rc.TABLE_NAME AS REFERENCED_TABLE,
        rcc.COLUMN_NAME AS REFERENCED_COLUMN,
        c.DELETE_RULE,
        cc.POSITION
      FROM ALL_CONSTRAINTS c
      JOIN ALL_CONS_COLUMNS cc ON c.CONSTRAINT_NAME = cc.CONSTRAINT_NAME AND c.OWNER = cc.OWNER
      JOIN ALL_CONSTRAINTS rc ON c.R_CONSTRAINT_NAME = rc.CONSTRAINT_NAME AND c.R_OWNER = rc.OWNER
      JOIN ALL_CONS_COLUMNS rcc ON rc.CONSTRAINT_NAME = rcc.CONSTRAINT_NAME AND rc.OWNER = rcc.OWNER AND cc.POSITION = rcc.POSITION
      WHERE c.CONSTRAINT_TYPE = 'R'
        AND c.OWNER NOT IN (${SYSTEM_USERS.map((u) => `'${u}'`).join(",")})
      ORDER BY c.TABLE_NAME, c.CONSTRAINT_NAME, cc.POSITION`
    );
    allForeignKeys = allForeignKeysResult.rows || [];
  } catch (error) {
    console.error("获取外键信息失败，跳过:", error);
  }

  return assembleOracleSchema(
    databaseName,
    allColumnsResult.rows || [],
    allCommentsResult.rows || [],
    allPrimaryKeysResult.rows || [],
    allIndexesResult.rows || [],
    allStatsResult.rows || [],
    allForeignKeys,
    currentUser
  );
}

function makeTableKey(owner: string, tableName: string, currentUser: string): string {
  return owner === currentUser ? tableName : `${owner}.${tableName}`;
}

function formatOracleType(
  dataType: string | undefined | null,
  length?: number,
  precision?: number,
  scale?: number
): string {
  if (!dataType) return "UNKNOWN";

  switch (dataType) {
    case "NUMBER":
      if (precision !== null && precision !== undefined) {
        if (scale !== null && scale !== undefined && scale > 0) {
          return `NUMBER(${precision},${scale})`;
        }
        return `NUMBER(${precision})`;
      }
      return "NUMBER";

    case "VARCHAR2":
    case "CHAR":
      if (length) {
        return `${dataType}(${length})`;
      }
      return dataType;

    case "TIMESTAMP":
      if (scale !== null && scale !== undefined) {
        return `TIMESTAMP(${scale})`;
      }
      return "TIMESTAMP";

    default:
      return dataType;
  }
}

function assembleOracleSchema(
  databaseName: string,
  allColumns: any[],
  allComments: any[],
  allPrimaryKeys: any[],
  allIndexes: any[],
  allStats: any[],
  allForeignKeys: any[],
  currentUser: string
): { databaseName: string; tables: TableInfo[] } {
  // 按表名分组列信息
  const columnsByTable = new Map<string, ColumnInfo[]>();
  const schemaByTable = new Map<string, string>();

  for (const col of allColumns) {
    const owner = col.OWNER;
    const tableName = col.TABLE_NAME;
    const columnName = col.COLUMN_NAME;

    if (!tableName || !columnName) continue;

    const tableKey = makeTableKey(owner, tableName, currentUser);

    if (!columnsByTable.has(tableKey)) {
      columnsByTable.set(tableKey, []);
      schemaByTable.set(tableKey, owner);
    }

    columnsByTable.get(tableKey)!.push({
      name: columnName.toLowerCase(),
      type: formatOracleType(col.DATA_TYPE, col.DATA_LENGTH, col.DATA_PRECISION, col.DATA_SCALE),
      nullable: col.NULLABLE === "Y",
      defaultValue: col.DATA_DEFAULT?.trim() || undefined,
    });
  }

  // 按表名分组列注释
  const commentsByTable = new Map<string, Map<string, string>>();
  for (const comment of allComments) {
    const owner = comment.OWNER;
    const tableName = comment.TABLE_NAME;
    const columnName = comment.COLUMN_NAME;
    const commentText = comment.COMMENTS;

    if (!tableName || !columnName || !commentText) continue;

    const tableKey = makeTableKey(owner, tableName, currentUser);

    if (!commentsByTable.has(tableKey)) {
      commentsByTable.set(tableKey, new Map());
    }
    commentsByTable.get(tableKey)!.set(columnName.toLowerCase(), commentText);
  }

  // 将注释添加到列信息
  for (const [tableKey, columns] of columnsByTable.entries()) {
    const tableComments = commentsByTable.get(tableKey);
    if (tableComments) {
      for (const col of columns) {
        if (tableComments.has(col.name)) {
          col.comment = tableComments.get(col.name);
        }
      }
    }
  }

  // 按表名分组主键信息
  const primaryKeysByTable = new Map<string, string[]>();
  for (const pk of allPrimaryKeys) {
    const owner = pk.OWNER;
    const tableName = pk.TABLE_NAME;
    const columnName = pk.COLUMN_NAME;

    if (!tableName || !columnName) continue;

    const tableKey = makeTableKey(owner, tableName, currentUser);

    if (!primaryKeysByTable.has(tableKey)) {
      primaryKeysByTable.set(tableKey, []);
    }
    primaryKeysByTable.get(tableKey)!.push(columnName.toLowerCase());
  }

  // 按表名分组索引信息
  const indexesByTable = new Map<string, Map<string, { columns: string[]; unique: boolean }>>();

  for (const idx of allIndexes) {
    const owner = idx.OWNER;
    const tableName = idx.TABLE_NAME;
    const indexName = idx.INDEX_NAME;
    const columnName = idx.COLUMN_NAME;

    if (!tableName || !indexName || !columnName) continue;
    if (indexName.includes("PK_") || indexName.includes("SYS_")) continue;

    const tableKey = makeTableKey(owner, tableName, currentUser);

    if (!indexesByTable.has(tableKey)) {
      indexesByTable.set(tableKey, new Map());
    }

    const tableIndexes = indexesByTable.get(tableKey)!;

    if (!tableIndexes.has(indexName)) {
      tableIndexes.set(indexName, {
        columns: [],
        unique: idx.UNIQUENESS === "UNIQUE",
      });
    }

    tableIndexes.get(indexName)!.columns.push(columnName.toLowerCase());
  }

  // 按表名分组行数统计
  const rowsByTable = new Map<string, number>();
  const tableCommentsByTable = new Map<string, string>();
  for (const stat of allStats) {
    const owner = stat.OWNER;
    const tableName = stat.TABLE_NAME;
    if (tableName) {
      const tableKey = makeTableKey(owner, tableName, currentUser);
      rowsByTable.set(tableKey, stat.NUM_ROWS || 0);
      if (stat.TABLE_COMMENT) {
        tableCommentsByTable.set(tableKey, stat.TABLE_COMMENT);
      }
    }
  }

  // 按表名分组外键信息
  const foreignKeysByTable = new Map<string, Map<string, { columns: string[]; referencedTable: string; referencedColumns: string[]; onDelete?: string }>>();

  for (const fk of allForeignKeys) {
    const owner = fk.OWNER;
    const tableName = fk.TABLE_NAME;
    const constraintName = fk.CONSTRAINT_NAME;

    if (!tableName || !constraintName) continue;

    const tableKey = makeTableKey(owner, tableName, currentUser);
    const refOwner = fk.REF_OWNER;
    const refTableKey = makeTableKey(refOwner, fk.REFERENCED_TABLE, currentUser);

    if (!foreignKeysByTable.has(tableKey)) {
      foreignKeysByTable.set(tableKey, new Map());
    }

    const tableForeignKeys = foreignKeysByTable.get(tableKey)!;

    if (!tableForeignKeys.has(constraintName)) {
      tableForeignKeys.set(constraintName, {
        columns: [],
        referencedTable: refTableKey.toLowerCase(),
        referencedColumns: [],
        onDelete: fk.DELETE_RULE,
      });
    }

    const fkInfo = tableForeignKeys.get(constraintName)!;
    fkInfo.columns.push(String(fk.COLUMN_NAME).toLowerCase());
    fkInfo.referencedColumns.push(String(fk.REFERENCED_COLUMN).toLowerCase());
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
          referencedTable: fkData.referencedTable.toLowerCase(),
          referencedColumns: fkData.referencedColumns,
          onDelete: fkData.onDelete,
        });
      }
    }

    tables.push({
      name: tableKey.toLowerCase(),
      schema: schemaByTable.get(tableKey),
      comment: tableCommentsByTable.get(tableKey) || undefined,
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
 * 检测写操作关键字（包括 Oracle 特定的 MERGE、PL/SQL 等）
 */
const WRITE_KEYWORDS = new Set([
  "INSERT", "UPDATE", "DELETE", "DROP", "TRUNCATE", "ALTER", "CREATE",
]);

export function isOracleWriteOperation(query: string): boolean {
  const trimmed = query.trim().toUpperCase();

  // 通用写操作检测
  const keyword = trimmed.split(/\s+/)[0];
  if (WRITE_KEYWORDS.has(keyword)) {
    return true;
  }

  // Oracle 特定的写操作检测
  // MERGE 语句
  if (trimmed.startsWith("MERGE")) {
    return true;
  }

  // PL/SQL 块
  if (trimmed.startsWith("BEGIN") || trimmed.startsWith("DECLARE")) {
    return true;
  }

  // CALL 存储过程
  if (trimmed.startsWith("CALL")) {
    return true;
  }

  // 事务控制
  if (trimmed.startsWith("COMMIT") || trimmed.startsWith("ROLLBACK")) {
    return true;
  }

  return false;
}
