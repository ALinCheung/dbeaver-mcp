---
title: Indexing
description: PostgreSQL indexing strategies
tags: postgres, indexing, b-tree, composite-indexes, include-columns
---

# Indexing

PostgreSQL 支持多种索引类型，默认是 B-tree，适用于大多数场景。

## 索引类型

| 类型 | 适用场景 |
|---|---|
| **B-tree** (默认) |  equality, range, <, >, <=, >= |
| **Hash** | equality only (=) |
| **GiST** | 几何数据、全文搜索 |
| **GIN** | 数组、JSONB、全文搜索 |
| **SP-GiST** | 空间分区 |
| **BRIN** | 物理顺序扫描（适合大表、顺序数据） |

## 创建索引

```sql
-- 单列索引
CREATE INDEX idx_users_email ON users(email);

-- 多列索引（复合索引）
CREATE INDEX idx_orders_user_status ON orders(user_id, status);

-- 唯一索引
CREATE UNIQUE INDEX idx_users_email ON users(email);

-- 表达式索引
CREATE INDEX idx_users_lower_email ON users(LOWER(email));

-- 部分索引
CREATE INDEX idx_orders_pending ON orders(created_at) WHERE status = 'pending';

-- 包含列索引（覆盖索引，PostgreSQL 11+）
CREATE INDEX idx_orders_covering ON orders(user_id) INCLUDE (status, total);
```

## 复合索引最佳实践

复合索引遵循最左前缀原则，但 PostgreSQL 的查询优化器比 MySQL 更灵活。

```sql
-- 索引 (a, b, c) 支持：
-- WHERE a = 1
-- WHERE a = 1 AND b = 2
-- WHERE a = 1 AND b = 2 AND c = 3

-- PostgreSQL 还可能使用索引进行：
-- WHERE b = 2 AND c = 3 (如果 a 的选择性很低)
```

**最佳实践：**
- 等值条件在前，范围条件在后
- 高选择性列在前
- 考虑查询的实际模式

```sql
-- 范围条件放最后
CREATE INDEX idx_events_user_date ON events(user_id, event_date);

-- 查询：WHERE user_id = 1 AND event_date BETWEEN '2024-01-01' AND '2024-12-31'
-- 这个索引可以用到 user_id = 1 部分，event_date 用范围条件
```

## INCLUDE 索引（覆盖索引）

PostgreSQL 11+ 支持 `INCLUDE` 子句，将非索引列包含在索引叶节点中：

```sql
-- MySQL 的 "覆盖索引" 概念
CREATE INDEX idx_orders_covering ON orders(user_id) INCLUDE (status, total);

-- 查询可以直接从索引返回，无需回表
SELECT user_id, status, total FROM orders WHERE user_id = 1;
```

## BRIN 索引

适合物理顺序相关的大表（如时间序列数据）：

```sql
-- 数据按 created_at 顺序插入
CREATE INDEX idx_logs_created ON logs USING BRIN(created_at);

-- 比 B-tree 索引小得多，适合大表
-- 如果数据不是按索引列物理排序，效果会很差
```

## 索引维护

```sql
-- 查看索引使用情况
SELECT indexrelname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public';

-- 查看未使用的索引
SELECT schemaname, tablename, indexname
FROM pg_stat_user_indexes
WHERE idx_scan = 0 AND indexrelname NOT LIKE '%pkey';

-- 删除未使用的索引
DROP INDEX idx_unused_index;
```

## 重建索引

```sql
-- 重建单个索引（需要排他锁，PostgreSQL 11+ 可用 CONCURRENTLY）
REINDEX INDEX CONCURRENTLY idx_users_email;

-- 重建表的所有索引
REINDEX TABLE CONCURRENTLY users;
```

## 表达式索引

```sql
-- 用于函数查询
CREATE INDEX idx_users_lower_email ON users(LOWER(email));

-- 查询：
SELECT * FROM users WHERE LOWER(email) = LOWER('Test@Example.com');
```

## 部分索引

适合高度选择性的条件：

```sql
-- 只索引活跃用户
CREATE INDEX idx_users_active ON users(last_login) WHERE is_active = true;

-- 只索引待处理订单
CREATE INDEX idx_orders_pending ON orders(created_at) WHERE status = 'pending';
```

## 注意事项

- 索引会降低写性能，每个索引都需要维护。
- 过多索引会占用大量磁盘空间。
- 使用 `pg_stat_user_indexes` 监控索引使用情况。
- 大量数据加载前删除索引，加载后重建。
