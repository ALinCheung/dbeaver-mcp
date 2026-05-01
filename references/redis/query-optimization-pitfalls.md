---
title: Redis 常见陷阱与优化
description: Redis 开发中的常见错误与最佳实践
tags: redis, pitfalls, best-practices, scan, bigkey
---

# Redis 常见陷阱与优化

## 禁止在生产使用的命令

| 命令 | 原因 | 替代 |
|------|------|------|
| `KEYS *` | O(N) 阻塞主线程 | `SCAN` 迭代 |
| `FLUSHALL` | 清空所有数据 | 禁止执行 |
| `FLUSHDB` | 清空当前数据库 | 禁止执行 |
| `BGREWRITEAOF` + `BGSAVE` 同时 |  fork 风暴 | 错开执行 |

## 分布式锁

```javascript
// 错误：SETNX 不支持过期时间，老进程崩溃后锁永不释放
SETNX lock_key unique_id

// 正确：SET NX EX 原子操作
SET lock_key unique_id NX EX 30
```

## Keys 设计

```
# 避免：过长 key
SET user:1234567890:profile:base:info "value"  // key 太长

# 推荐：简洁但有前缀
SET user:123:profile "value"
```

## Scan vs Keys

```javascript
// SCAN 游标迭代，不会阻塞
let cursor = 0;
do {
  const [newCursor, keys] = await redis.scan(cursor, 'MATCH', 'user:*', 'COUNT', 100);
  cursor = newCursor;
  // 处理 keys
} while (cursor !== 0);
```

## Pipeline 批量

```javascript
// 错误：循环内逐条执行，N 次 RTT
for (const id of ids) {
  await redis.get(`user:${id}`);
}

// 正确：Pipeline 一次 RTT
const pipeline = redis.pipeline();
for (const id of ids) {
  pipeline.get(`user:${id}`);
}
const results = await pipeline.exec();
```

## 内存管理

- 定期检查 `redis-cli INFO memory`
- 大 Key 用 `MEMORY USAGE key` 检测
- 设置 `maxmemory-policy allkeys-lru` 自动淘汰
