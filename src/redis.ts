/**
 * redis.ts — Redis connection and query execution wrappers.
 * Uses ioredis for async operations.
 */

import { Redis } from "ioredis";
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

// Write operation commands that require confirmation
const WRITE_COMMANDS = new Set([
  "SET", "SETEX", "SETNX", "MSET", "MSETNX",
  "DEL", "UNLINK",
  "FLUSHDB", "FLUSHALL",
  "HSET", "HMSET", "HSETNX",
  "LPUSH", "RPUSH", "LPUSHX", "RPUSHX",
  "LINSERT",
  "SADD", "SPOP", "SREM",
  "ZADD", "ZINCRBY", "ZREM", "ZREMRANGEBYSCORE",
  "APPEND", "SETRANGE", "GETSET",
  "INCR", "INCRBY", "INCRBYFLOAT", "DECR", "DECRBY",
  "GETDEL", "GETEX",
  "EXPIRE", "EXPIREAT", "PEXPIRE", "PEXPIREAT", "PERSIST", "TTL", "PTTL",
  "RENAME", "RENAMENX",
  "COPY", "MOVE",
  "BLMOVE", "BLPOP", "BRPOP", "BRPOPLPUSH",
  "LMOVE", "LSET", "LTRIM",
  "SINTER", "SINTERSTORE", "SMOVE", "SUNION", "SUNIONSTORE", "SDIFF", "SDIFFSTORE",
  "PFADD", "PFCOUNT", "PFMERGE",
  "GEOADD", "GEODIST", "GEOHASH", "GEOPOS", "GEORADIUS", "GEORADIUSBYMEMBER",
  "BITCOUNT", "BITOP", "BITPOS", "SETBIT", "GETBIT",
  "WATCH", "MULTI", "EXEC", "DISCARD",
  "CLIENT", "CONFIG", "DEBUG", "MODULE", "SCRIPT", "SHUTDOWN", "SLAVEOF", "REPLICAOF", "BGREWRITEAOF", "BGSAVE", "SAVE", "LASTSAVE",
]);

export function isRedisWriteOperation(command: string): boolean {
  const cmd = command.trim().toUpperCase().split(/\s+/)[0];
  return WRITE_COMMANDS.has(cmd);
}

export interface RedisConnectionInfo extends FullConnectionInfo {
  password: string;
}

export async function redisConnect(info: RedisConnectionInfo): Promise<Redis> {
  const redis = new Redis({
    host: info.host || "localhost",
    port: parseInt(info.port, 10) || 6379,
    password: info.password || undefined,
    db: parseInt(info.database, 10) || 0,
    connectTimeout: 10000,
    lazyConnect: true,
  });

  await redis.connect();
  return redis;
}

export async function runRedisQuery(
  info: RedisConnectionInfo,
  command: string
): Promise<QueryResult> {
  const redis = await redisConnect(info);
  try {
    const trimmed = command.trim();
    const parts = trimmed.split(/\s+/);
    const cmd = parts[0].toUpperCase();
    const args = parts.slice(1);

    // Handle special command parsing
    let result: any;

    if (cmd === "PING") {
      result = await redis.ping();
      return { columns: ["result"], rows: [{ result }], rowcount: 1 };
    }

    if (cmd === "GET" || cmd === "GETRANGE") {
      result = await redis.get(args[0]);
      return { columns: ["result"], rows: [{ result }], rowcount: result !== null ? 1 : 0 };
    }

    if (cmd === "MGET") {
      result = await redis.mget(...args);
      return {
        columns: ["result"],
        rows: result.map((v: any) => ({ result: v })),
        rowcount: result.length,
      };
    }

    if (cmd === "KEYS") {
      // Limit to 100 keys to avoid blocking
      const pattern = args[0] || "*";
      const keys = await redis.keys(pattern);
      const limited = keys.slice(0, 100);
      return {
        columns: ["keys"],
        rows: limited.map((k: string) => ({ keys: k })),
        rowcount: limited.length,
      };
    }

    if (cmd === "TYPE") {
      result = await redis.type(args[0]);
      return { columns: ["type"], rows: [{ type: result }], rowcount: 1 };
    }

    if (cmd === "EXISTS") {
      result = await redis.exists(...args);
      return { columns: ["exists"], rows: [{ exists: result }], rowcount: 1 };
    }

    if (cmd === "TTL" || cmd === "PTTL") {
      result = await redis.ttl(args[0]);
      return { columns: ["ttl"], rows: [{ ttl: result }], rowcount: 1 };
    }

    if (cmd === "DBSIZE") {
      result = await redis.dbsize();
      return { columns: ["dbsize"], rows: [{ dbsize: result }], rowcount: 1 };
    }

    if (cmd === "INFO") {
      const section = args[0] || "server";
      result = await redis.info(section);
      return { columns: ["info"], rows: [{ info: result }], rowcount: 1 };
    }

    if (cmd === "SMEMBERS") {
      result = await redis.smembers(args[0]);
      return {
        columns: ["member"],
        rows: result.map((v: string) => ({ member: v })),
        rowcount: result.length,
      };
    }

    if (cmd === "HGETALL") {
      result = await redis.hgetall(args[0]);
      const rows = Object.entries(result || {}).map(([field, value]) => ({ field, value }));
      return { columns: ["field", "value"], rows, rowcount: rows.length };
    }

    if (cmd === "LRANGE") {
      const start = parseInt(args[1], 10) || 0;
      const stop = parseInt(args[2], 10) || -1;
      result = await redis.lrange(args[0], start, stop);
      return {
        columns: ["index", "value"],
        rows: result.map((v: string, i: number) => ({ index: i, value: v })),
        rowcount: result.length,
      };
    }

    if (cmd === "ZCARD" || cmd === "ZCOUNT" || cmd === "ZSCORE") {
      if (cmd === "ZCARD") {
        result = await redis.zcard(args[0]);
      } else if (cmd === "ZCOUNT") {
        result = await redis.zcount(args[0], args[1] || "-inf", args[2] || "+inf");
      } else {
        result = await redis.zscore(args[0], args[1]);
      }
      return { columns: ["result"], rows: [{ result }], rowcount: 1 };
    }

    if (cmd === "ZRANGE" || cmd === "ZRANGEBYSCORE") {
      if (cmd === "ZRANGE") {
        result = await redis.zrange(args[0], parseInt(args[1], 10) || 0, parseInt(args[2], 10) || -1, "WITHSCORES");
      } else {
        result = await redis.zrangebyscore(args[0], args[1] || "-inf", args[2] || "+inf", "WITHSCORES");
      }
      // ZRANGE WITHSCORES returns [member1, score1, member2, score2, ...]
      const rows: any[] = [];
      for (let i = 0; i < result.length; i += 2) {
        rows.push({ member: result[i], score: result[i + 1] });
      }
      return { columns: ["member", "score"], rows, rowcount: rows.length };
    }

    if (cmd === "COMMAND") {
      return { columns: ["result"], rows: [{ result: "Redis COMMAND not implemented" }], rowcount: 1 };
    }

    // Generic command execution using sendCommand
    // Split by newlines or semicolons for multiple commands
    const commands = trimmed.split(/\n|;(?=\s*[A-Z])/i).filter((c) => c.trim());
    if (commands.length > 1) {
      // Multiple commands in one call - use pipeline
      const pipeline = redis.pipeline();
      for (const cmd2 of commands) {
        const parts2 = cmd2.trim().split(/\s+/);
        (pipeline as any)[parts2[0].toLowerCase()](...parts2.slice(1));
      }
      const results = await pipeline.exec();
      const rows = (results || []).map(([err, val]: [any, any], i: number) => ({
        command: i + 1,
        result: err ? `ERROR: ${err.message}` : JSON.stringify(val),
      }));
      return { columns: ["command", "result"], rows, rowcount: rows.length };
    }

    // Generic single command via send_command
    const cmdUpper = cmd.toLowerCase();
    const redisCmd = (redis as any)[cmdUpper].bind(redis);
    result = await redisCmd(...args);

    // Format result
    if (result === null) {
      return { columns: ["result"], rows: [], rowcount: 0 };
    }
    if (Array.isArray(result)) {
      return {
        columns: ["result"],
        rows: result.map((v: any) => ({ result: typeof v === "object" ? JSON.stringify(v) : v })),
        rowcount: result.length,
      };
    }
    if (typeof result === "object") {
      return { columns: ["result"], rows: [{ result: JSON.stringify(result) }], rowcount: 1 };
    }
    return { columns: ["result"], rows: [{ result: String(result) }], rowcount: 1 };
  } finally {
    await redis.quit();
  }
}

export async function runRedisWrite(
  info: RedisConnectionInfo,
  command: string
): Promise<WriteResult> {
  const redis = await redisConnect(info);
  try {
    const trimmed = command.trim();
    const parts = trimmed.split(/\s+/);
    const cmd = parts[0].toUpperCase();
    const args = parts.slice(1);

    let result: any;

    if (cmd === "SET" || cmd === "SETEX" || cmd === "SETNX") {
      if (cmd === "SET") {
        result = await redis.set(args[0], args.slice(1).join(" "));
      } else if (cmd === "SETEX") {
        result = await redis.setex(args[0], parseInt(args[1], 10), args.slice(2).join(" "));
      } else {
        result = await redis.setnx(args[0], args.slice(1).join(" "));
      }
    } else if (cmd === "DEL" || cmd === "UNLINK") {
      result = await redis.del(...args);
    } else if (cmd === "HSET" || cmd === "HMSET" || cmd === "HSETNX") {
      if (cmd === "HSET") {
        result = await redis.hset(args[0], args[1], args.slice(2).join(" "));
      } else if (cmd === "HMSET") {
        const hashKey = args[0];
        const hashArgs = args.slice(1);
        const obj: Record<string, string> = {};
        for (let i = 0; i < hashArgs.length; i += 2) {
          if (hashArgs[i + 1] !== undefined) {
            obj[hashArgs[i]] = hashArgs[i + 1];
          }
        }
        result = await redis.hmset(hashKey, obj);
      } else {
        result = await redis.hsetnx(args[0], args[1], args.slice(2).join(" "));
      }
    } else if (cmd === "LPUSH" || cmd === "RPUSH" || cmd === "LPUSHX" || cmd === "RPUSHX") {
      const key = args[0];
      const values = args.slice(1);
      if (cmd === "LPUSH") {
        result = await redis.lpush(key, ...values);
      } else if (cmd === "RPUSH") {
        result = await redis.rpush(key, ...values);
      } else if (cmd === "LPUSHX") {
        result = await redis.lpushx(key, ...values);
      } else {
        result = await redis.rpushx(key, ...values);
      }
    } else if (cmd === "SADD") {
      result = await redis.sadd(args[0], ...args.slice(1));
    } else if (cmd === "ZADD") {
      // ZADD key score member [score member ...]
      const key = args[0];
      const score = parseFloat(args[1]);
      const member = args.slice(2).join(" ");
      result = await redis.zadd(key, score, member);
    } else if (cmd === "INCR" || cmd === "INCRBY") {
      const key = args[0];
      const amount = cmd === "INCR" ? 1 : parseInt(args[1], 10) || 1;
      result = await redis.incrby(key, amount);
    } else if (cmd === "DECR" || cmd === "DECRBY") {
      const key = args[0];
      const amount = cmd === "DECR" ? 1 : parseInt(args[1], 10) || 1;
      result = await redis.decrby(key, amount);
    } else if (cmd === "FLUSHDB" || cmd === "FLUSHALL") {
      if (cmd === "FLUSHDB") {
        result = await redis.flushdb();
      } else {
        result = await redis.flushall();
      }
    } else {
      // Generic write command
      const cmdLower = cmd.toLowerCase();
      const redisCmd = (redis as any)[cmdLower].bind(redis);
      result = await redisCmd(...args);
    }

    // Parse result to rowcount
    const rowcount = typeof result === "number" ? result : (result === "OK" ? 1 : 0);
    return { rowcount, lastrowid: null };
  } finally {
    await redis.quit();
  }
}

export async function getRedisSchema(
  info: RedisConnectionInfo
): Promise<{
  overview: Record<string, any>;
  keys_by_type: Array<{ type: string; count: number }>;
}> {
  const redis = await redisConnect(info);
  try {
    // Get server info
    const infoStr = await redis.info("server");
    const overview: Record<string, any> = {};
    for (const line of infoStr.split("\r\n")) {
      if (line.includes(":")) {
        const [key, value] = line.split(":");
        overview[key.trim()] = value.trim();
      }
    }

    // Get database info
    const dbSize = await redis.dbsize();
    overview.db_size = dbSize;

    // Scan keys to get type statistics (limit 1000 to avoid blocking)
    const typeCount: Record<string, number> = {
      string: 0,
      list: 0,
      hash: 0,
      set: 0,
      zset: 0,
      other: 0,
    };

    let cursor = "0";
    let scanned = 0;
    const maxScan = 1000;

    do {
      const [nextCursor, keys] = await redis.scan(cursor, "COUNT", 100);
      cursor = nextCursor;
      scanned += keys.length;

      for (const key of keys) {
        const type = await redis.type(key);
        const normalizedType = typeCount.hasOwnProperty(type) ? type : "other";
        typeCount[normalizedType]++;
        if (scanned >= maxScan) break;
      }
    } while (cursor !== "0" && scanned < maxScan);

    const keys_by_type = Object.entries(typeCount)
      .filter(([, count]) => count > 0)
      .map(([type, count]) => ({ type, count }));

    return { overview, keys_by_type };
  } finally {
    await redis.quit();
  }
}
