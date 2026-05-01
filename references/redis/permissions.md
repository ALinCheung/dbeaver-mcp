---
title: Redis 命令权限与安全
description: Redis 命令权限控制、写操作检测
tags: redis, permissions, security, write-operations
---

# Redis 命令权限与安全

## 写操作命令（需谨慎）

| 类别 | 命令 |
|------|------|
| 写入 | `SET`, `SETEX`, `SETNX`, `MSET`, `APPEND`, `INCR`, `DECR`, `INCRBY`, `DECRBY` |
| 删除 | `DEL`, `UNLINK` |
| 过期 | `EXPIRE`, `EXPIREAT`, `PEXPIRE`, `PERSIST` |
| 数据结构 | `LPUSH`, `RPUSH`, `LPOP`, `RPOP`, `LTRIM`, `SADD`, `SREM`, `SPOP`, `HSET`, `HINCRBY`, `ZADD`, `ZREM` |
| 服务器 | `FLUSHDB`, `FLUSHALL`, `SHUTDOWN`, `BGREWRITEAOF`, `BGSAVE`, `SAVE`, `DEBUG`, `CONFIG` |

## 只读命令（安全）

| 命令 | 说明 |
|------|------|
| `GET`, `MGET` | 读 STRING |
| `HGET`, `HMGET`, `HGETALL` | 读 HASH（注意 BIGKEY）|
| `SMEMBERS` | 读 SET（注意 BIGKEY）|
| `ZRANGE`, `ZREVRANGE` | 读 ZSET |
| `LRANGE` | 读 LIST |
| `KEYS` | 全量扫描（仅开发/小数据）|
| `SCAN` | 安全迭代 |
| `INFO` | 服务器信息 |
| `PING` | 连接测试 |
| `TTL`, `PTTL` | 剩余 TTL |
| `TYPE` | Key 类型 |
| `EXISTS` | Key 是否存在 |
| `DBSIZE` | Key 总数 |
| `CLIENT LIST` | 客户端列表 |

## DBeaver MCP 权限配置

在 `~/.dbeaver-mcp/settings.json` 中：

```json
{
  "global": {
    "allowWrites": false,
    "allowedCommands": ["GET", "HGET", "SMEMBERS", "SCAN", "INFO"]
  }
}
```

## 写操作检测逻辑

DBeaver MCP 的 `isRedisWriteOperation()` 检测以下写命令：
- 数据修改：`SET`, `MSET`, `APPEND`, `DEL`, `UNLINK`
- 过期控制：`EXPIRE`, `EXPIREAT`
- 列表操作：`LPUSH`, `RPUSH`, `LPOP`, `RPOP`, `LTRIM`
- 集合操作：`SADD`, `SREM`, `SPOP`
- 有序集合：`ZADD`, `ZREM`
- 哈希操作：`HSET`, `HSETNX`, `HINCRBY`, `HDEL`
- 服务器操作：`FLUSHDB`, `FLUSHALL`, `SHUTDOWN`, `SAVE`, `BGSAVE`
