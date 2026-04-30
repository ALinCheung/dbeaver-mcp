---
title: EXPLAIN Analysis
description: Reading PostgreSQL EXPLAIN output
tags: postgres, explain, query-optimization, analyze
---

# EXPLAIN Analysis

PostgreSQL 使用 `EXPLAIN` 显示查询计划，`EXPLAIN (ANALYZE, BUFFERS)` 执行查询并显示运行时统计。

## 基本用法

```sql
EXPLAIN SELECT * FROM users WHERE email = 'test@example.com';
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) SELECT * FROM users WHERE email = 'test@example.com';
```

## 读取 EXPLAIN 输出

### 节点类型（Node Type）

| 类型 | 含义 | 何时需要关注 |
|---|---|---|
| **Seq Scan** | 全表扫描 | 大表上出现且无 WHERE 条件 |
| **Index Scan** | 索引扫描 | 正常，应为主要访问方式 |
| **Index Only Scan** | 仅索引扫描 | 最优，无需回表 |
| **Bitmap Heap Scan** | 位图堆扫描 | 多列条件，PostgreSQL 特有的优化 |
| **Nested Loop** | 嵌套循环 | 小表或 JOIN 少量行 |
| **Hash Join** | 哈希连接 | 中等大小表 JOIN |
| **Merge Join** | 归并连接 | 已排序的数据 JOIN |
| **Sort** | 排序 | 大数据量排序成本高 |
| **Hash** | 哈希构建 | Hash Join 前的准备 |

### 关键字段

| 字段 | 含义 |
|---|---|
| **cost=X..Y** | 估算成本（启动成本..总成本），不是时间 |
| **rows=X** | 估算返回行数 |
| **actual rows=X** | 实际返回行数（ANALYZE） |
| **actual time=X..Y** | 实际耗时（启动..结束）（ANALYZE） |
| **Buffers: shared hit=X read=Y** | 缓存命中/磁盘读取数（ANALYZE） |

### Red Flags

- **Seq Scan on large table**: 无索引，需要添加索引。
- **actual rows >> estimated rows**: 统计信息过期，执行计划可能不佳。运行 `ANALYZE`。
- **actual rows << estimated rows**: 统计信息不准确或查询条件选择性高。
- **Sort + large row count**: 考虑添加 ORDER BY 列的索引，或减少排序数据量。
- **Nested Loop + large join**: 可能导致性能问题，检查是否需要 Hash Join。

## 索引扫描 vs 仅索引扫描

```sql
-- Index Scan：需要回表
EXPLAIN SELECT * FROM users WHERE email = 'test@example.com';

-- Index Only Scan：无需回表（覆盖索引）
EXPLAIN SELECT id FROM users WHERE email = 'test@example.com';
```

## ANALYZE 和 BUFFERS

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM orders WHERE status = 'pending';

-- 输出示例：
-- Index Scan using idx_orders_status on orders
--   Index Cond: (status = 'pending'::text)
--   Rows Removed by Index Recheck: 0
--   Buffers: shared hit=1234 read=56
-- Planning Time: 0.123 ms
-- Execution Time: 45.678 ms
```

- `Buffers: shared hit`: 数据在缓存中，直接读取。
- `Buffers: read`: 需要从磁盘读取，代价高。
- `Rows Removed by Index Recheck`: 索引重新检查的行数，可能表示索引选择性问题。

## 常见问题

### 统计信息过期

```sql
-- 更新统计信息
ANALYZE VERBOSE users;
```

### 复杂查询计划

使用 `EXPLAIN (SETTINGS)` 查看优化器使用的配置：
```sql
EXPLAIN (SETTINGS) SELECT * FROM users;
```

### 查询计划不稳定

同一查询有时快有时慢，可能原因：
- 统计信息不准确
- 其他并发查询影响
- 数据分布变化
- 缓存效果不同
