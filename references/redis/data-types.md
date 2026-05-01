---
title: Redis 数据类型
description: Redis 5 种核心数据类型详解
tags: redis, data-types, string, list, hash, set, zset
---

# Redis 数据类型

## 5 种核心数据类型

| 类型 | 命令前缀 | 典型场景 |
|------|----------|----------|
| `STRING` | SET/GET | 缓存、计数器、分布式锁 |
| `LIST` | LPUSH/RPOP | 队列、消息流、最新N条 |
| `HASH` | HSET/HGET | 对象存储、表格数据 |
| `SET` | SADD/SMEMBERS | 标签、去重、好友关系 |
| `ZSET` | ZADD/ZRANGE | 排行榜、有序集合 |

## STRING

```
SET key value [EX seconds] [PX milliseconds] [NX|XX]
GET key
MGET key1 key2
INCR key / DECR key
```

## LIST

```
LPUSH key value      # 左插
RPUSH key value      # 右插
LPOP key / RPOP key
LRANGE key 0 -1      # 遍历全量
```

## HASH

```
HSET key field value
HGET key field
HMGET key field1 field2
HGETALL key          # 注意大 Key
```

## SET

```
SADD key member
SMEMBERS key         # 注意大 Key
SISMEMBER key member
SCARD key            # 集合大小
```

## ZSET

```
ZADD key score member
ZRANGE key 0 -1 WITHSCORES
ZREVRANGE key 0 9    # 降序取 Top 10
ZSCORE key member
```

## 大 Key 注意事项

| 命令 | 风险 |
|------|------|
| `GETALL key` | O(N)，N 为字段数 |
| `SMEMBERS key` | O(N)，N 为成员数 |
| `KEYS pattern` | O(N)，阻塞主线程，生产禁用 |
| `LRANGE key 0 -1` | O(N)，N 为列表长度 |
