---
title: Partitioning
description: Oracle table partitioning strategies
tags: oracle, partitioning, range, list, hash, interval
---

# Partitioning

Oracle 分区将大表拆分为更小、更易管理的段。

## 分区类型

| 类型 | 适用场景 |
|---|---|
| **RANGE** | 日期、数值范围 |
| **LIST** | 离散值列表 |
| **HASH** | 均匀分布的数据 |
| **复合** | RANGE + LIST 或 RANGE + HASH |
| **INTERVAL** | 自动创建 RANGE 分区 |

## RANGE 分区

```sql
-- 按日期范围分区
CREATE TABLE orders (
  id NUMBER,
  order_date DATE,
  customer_id NUMBER,
  total NUMBER
)
PARTITION BY RANGE (order_date) (
  PARTITION p2023_q1 VALUES LESS THAN (TO_DATE('2023-04-01', 'YYYY-MM-DD')),
  PARTITION p2023_q2 VALUES LESS THAN (TO_DATE('2023-07-01', 'YYYY-MM-DD')),
  PARTITION p2023_q3 VALUES LESS THAN (TO_DATE('2023-10-01', 'YYYY-MM-DD')),
  PARTITION p2023_q4 VALUES LESS THAN (TO_DATE('2024-01-01', 'YYYY-MM-DD')),
  PARTITION p_max VALUES LESS THAN (MAXVALUE)
);

-- 按数值范围分区
CREATE TABLE sales (
  id NUMBER,
  amount NUMBER,
  region VARCHAR2(10)
)
PARTITION BY RANGE (amount) (
  PARTITION p_low VALUES LESS THAN (1000),
  PARTITION p_medium VALUES LESS THAN (10000),
  PARTITION p_high VALUES LESS THAN (MAXVALUE)
);
```

## LIST 分区

```sql
CREATE TABLE customers (
  id NUMBER,
  name VARCHAR2(100),
  region VARCHAR2(20)
)
PARTITION BY LIST (region) (
  PARTITION p_north VALUES ('NORTH', 'NORTHEAST'),
  PARTITION p_south VALUES ('SOUTH', 'SOUTHEAST'),
  PARTITION p_west VALUES ('WEST', 'NORTHWEST'),
  PARTITION p_other VALUES (DEFAULT)
);
```

## HASH 分区

```sql
-- 自动均匀分布
CREATE TABLE transactions (
  id NUMBER,
  account_id NUMBER,
  amount NUMBER
)
PARTITION BY HASH (account_id) (
  PARTITION p1,
  PARTITION p2,
  PARTITION p3,
  PARTITION p4
);

-- 指定分区数（Oracle 自动命名）
CREATE TABLE transactions (
  id NUMBER,
  account_id NUMBER,
  amount NUMBER
)
PARTITION BY HASH (account_id) PARTITIONS 8;
```

## INTERVAL 分区（Oracle 11g+）

```sql
-- 自动创建基于日期的分区
CREATE TABLE orders (
  id NUMBER,
  order_date DATE,
  customer_id NUMBER
)
PARTITION BY RANGE (order_date) INTERVAL (NUMTOYMINTERVAL(1, 'MONTH')) (
  PARTITION p_initial VALUES LESS THAN (TO_DATE('2024-01-01', 'YYYY-MM-DD'))
);

-- 插入 2024-03-15 的数据会自动创建新分区
INSERT INTO orders VALUES (1, TO_DATE('2024-03-15', 'YYYY-MM-DD'), 100);
```

## 复合分区

```sql
-- RANGE + LIST
CREATE TABLE sales (
  id NUMBER,
  sale_date DATE,
  region VARCHAR2(20),
  amount NUMBER
)
PARTITION BY RANGE (sale_date) SUBPARTITION BY LIST (region) (
  PARTITION p2023 VALUES LESS THAN (TO_DATE('2024-01-01', 'YYYY-MM-DD')) (
    SUBPARTITION p2023_north VALUES ('NORTH', 'NORTHEAST'),
    SUBPARTITION p2023_south VALUES ('SOUTH', 'SOUTHEAST')
  ),
  PARTITION p2024 VALUES LESS THAN (MAXVALUE) (
    SUBPARTITION p2024_north VALUES ('NORTH', 'NORTHEAST'),
    SUBPARTITION p2024_south VALUES ('SOUTH', 'SOUTHEAST')
  )
);
```

## 分区维护操作

```sql
-- 添加分区
ALTER TABLE orders ADD PARTITION p2025_q1 VALUES LESS THAN (TO_DATE('2025-04-01', 'YYYY-MM-DD'));

-- 删除分区
ALTER TABLE orders DROP PARTITION p2023_q1;

-- 合并分区
ALTER TABLE orders MERGE PARTITIONS p2023_q1, p2023_q2 INTO PARTITION p2023_h1;

-- 拆分分区
ALTER TABLE orders SPLIT PARTITION p2023_h1 AT (TO_DATE('2023-07-01', 'YYYY-MM-DD'))
  INTO (PARTITION p2023_q1, PARTITION p2023_q2);

-- 重命名分区
ALTER TABLE orders RENAME PARTITION p2023_q1 TO p2023_q1_old;

-- 截断分区
ALTER TABLE orders TRUNCATE PARTITION p2023_q1;

-- 移动分区
ALTER TABLE orders MOVE PARTITION p2023_q1 TABLESPACE new_ts;
```

## 分区索引

```sql
-- 本地索引（推荐，与分区关联）
CREATE INDEX idx_orders_date ON orders(order_date) LOCAL;

-- 全局索引
CREATE INDEX idx_orders_customer ON orders(customer_id) GLOBAL;

-- 本地前缀索引
CREATE INDEX idx_orders_date_cust ON orders(order_date, customer_id) LOCAL;

-- 本地非前缀索引
CREATE INDEX idx_orders_cust ON orders(customer_id) LOCAL;

-- 重建分区索引
ALTER INDEX idx_orders_date REBUILD PARTITION p2023_q1;
```

## 查询分区

```sql
-- 查看分区信息
SELECT partition_name, high_value, num_rows
FROM user_tab_partitions
WHERE table_name = 'ORDERS';

-- 查询特定分区（剪裁）
SELECT * FROM orders PARTITION (p2023_q1) WHERE customer_id = 100;

-- 查看分区使用情况
SELECT * FROM USER_PART_TABLES;

-- 查看子分区
SELECT * FROM USER_TAB_SUBPARTITIONS WHERE table_name = 'SALES';
```

## 最佳实践

- 分区键选择要均匀分布，避免数据倾斜
- 分区大小建议在 10GB-50GB 之间
- 使用本地索引以支持分区裁剪
- 定期维护分区（添加、删除历史分区）
- 考虑使用 INTERVAL 分区自动管理
