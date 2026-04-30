---
title: Partitioning
description: PostgreSQL table partitioning strategies
tags: postgres, partitioning, range, list, hash
---

# Partitioning

PostgreSQL 支持表分区，将大表拆分为更小的逻辑段。

## 分区类型

| 类型 | 适用场景 |
|---|---|
| **RANGE** | 日期、数值范围 |
| **LIST** | 离散值列表 |
| **HASH** | 均匀分布的数据 |

## 创建分区表

```sql
-- 创建分区父表
CREATE TABLE orders (
  id BIGSERIAL,
  order_date DATE NOT NULL,
  customer_id BIGINT,
  total NUMERIC(10,2)
) PARTITION BY RANGE (order_date);

-- 创建分区
CREATE TABLE orders_2024_q1 PARTITION OF orders
  FOR VALUES FROM (TO_DATE('2024-01-01', 'YYYY-MM-DD')) 
               TO (TO_DATE('2024-04-01', 'YYYY-MM-DD'));

CREATE TABLE orders_2024_q2 PARTITION OF orders
  FOR VALUES FROM (TO_DATE('2024-04-01', 'YYYY-MM-DD')) 
               TO (TO_DATE('2024-07-01', 'YYYY-MM-DD'));

-- 默认分区（捕获未匹配的行）
CREATE TABLE orders_default PARTITION OF orders DEFAULT;
```

## LIST 分区

```sql
CREATE TABLE customers (
  id BIGSERIAL,
  name TEXT,
  region TEXT NOT NULL
) PARTITION BY LIST (region);

CREATE TABLE customers_north PARTITION OF customers
  FOR VALUES IN ('NORTH', 'NORTHEAST');

CREATE TABLE customers_south PARTITION OF customers
  FOR VALUES IN ('SOUTH', 'SOUTHEAST');
```

## HASH 分区

```sql
CREATE TABLE user_sessions (
  id BIGSERIAL,
  user_id BIGINT,
  login_time TIMESTAMP
) PARTITION BY HASH (user_id);

-- 创建4个哈希分区
CREATE TABLE user_sessions_p0 PARTITION OF user_sessions
  FOR VALUES WITH (MODULUS 4, REMAINDER 0);

CREATE TABLE user_sessions_p1 PARTITION OF user_sessions
  FOR VALUES WITH (MODULUS 4, REMAINDER 1);

CREATE TABLE user_sessions_p2 PARTITION OF user_sessions
  FOR VALUES WITH (MODULUS 4, REMAINDER 2);

CREATE TABLE user_sessions_p3 PARTITION OF user_sessions
  FOR VALUES WITH (MODULUS 4, REMAINDER 3);
```

## 分区维护

```sql
-- 添加新分区
CREATE TABLE orders_2024_q3 PARTITION OF orders
  FOR VALUES FROM (TO_DATE('2024-07-01', 'YYYY-MM-DD')) 
               TO (TO_DATE('2024-10-01', 'YYYY-MM-DD'));

-- 分离分区
ALTER TABLE orders DETACH PARTITION orders_2023;

-- 附加分区
ALTER TABLE orders ATTACH PARTITION orders_2023
  FOR VALUES FROM (TO_DATE('2023-01-01', 'YYYY-MM-DD')) 
               TO (TO_DATE('2024-01-01', 'YYYY-MM-DD'));

-- 删除分区（直接删除表）
DROP TABLE orders_2023;
```

## 分区索引

```sql
-- 在父表上创建的索引会自动传播到所有分区
CREATE INDEX idx_orders_date ON orders(order_date);

-- 但也可以在特定分区上创建独立索引
CREATE INDEX idx_orders_2024_q1_customer ON orders_2024_q1(customer_id);

-- 本地索引 vs 全局索引（PostgreSQL 分区表只有本地索引）
```

## 查询分区裁剪

```sql
-- EXPLAIN 显示分区裁剪
EXPLAIN SELECT * FROM orders WHERE order_date = '2024-03-15';

-- 输出应显示 only in partitions
-- -> Seq Scan on orders_2024_q1
```

## 自动分区管理（PostgreSQL 14+ 的改进）

PostgreSQL 本身不提供自动分区创建，但可以使用触发器或应用程序逻辑。

```sql
-- 创建分区触发器函数（示例）
CREATE OR REPLACE FUNCTION create_order_partition()
RETURNS TRIGGER AS $$
DECLARE
  partition_date DATE;
  partition_name TEXT;
BEGIN
  partition_date := DATE_TRUNC('quarter', NEW.order_date);
  partition_name := 'orders_' || TO_CHAR(partition_date, 'YYYY_QQ');
  
  -- 检查分区是否存在
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = partition_name) THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF orders FOR VALUES FROM (%L) TO (%L)',
      partition_name,
      partition_date,
      partition_date + INTERVAL '3 months'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_create_order_partition
  BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION create_order_partition();
```

## 最佳实践

- 分区键选择要均匀分布
- 分区大小建议在 10GB 以下
- 使用 EXPLAIN 检查分区裁剪是否生效
- 定期归档和删除旧分区
- 考虑使用 COPY 命令批量插入
- 分区索引需要创建在父表上以自动传播

## 局限性

- 不支持主键和外键跨越分区（分区可以有本地主键，但不能有跨分区主键）
- 不支持 ON DELETE CASCADE 在引用分区表的FK上
- 唯一约束必须包含分区键
