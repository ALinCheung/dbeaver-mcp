---
title: Primary Key Design
description: Primary key patterns for PostgreSQL
tags: postgres, primary-keys, serial, identity, uuid
---

# Primary Keys

PostgreSQL 使用堆表（heap table）存储，所有行都储存在表的数据文件中，不按主键顺序存储。这与 MySQL InnoDB 的聚集索引不同。

## SERIAL vs BIGSERIAL vs IDENTITY

- **SERIAL**: 4 bytes, max ~2.1B rows。向后兼容，不符合 SQL 标准。
- **BIGSERIAL**: 8 bytes, max ~9.2 quintillion rows。推荐用于主键。
- **GENERATED ALWAYS AS IDENTITY**: SQL 标准兼容，推荐用于新表。

```sql
-- 推荐：使用 BIGSERIAL 或 IDENTITY
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL
);

-- SQL 标准方式（推荐新表使用）
CREATE TABLE users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL
);
```

## UUID 作为主键

- UUID 标准形式（36字符）：存储为 `UUID` 类型（16 bytes）或 `CHAR(36)`（36+ bytes）。
- Random UUID（UUIDv4）：随机插入会导致页面碎片和索引膨胀。
- Time-ordered UUID（UUIDv7, ULID）：时间有序，减少碎片。

```sql
-- UUID 类型（推荐）
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL
);

-- 生成时间有序的 UUIDv7（PostgreSQL 14+）
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- 需要应用层生成 UUIDv7
  name TEXT NOT NULL
);
```

## 序列（Sequence）

PostgreSQL 的 SERIAL/BIGSERIAL 底层使用序列。序列是独立对象，有自己的状态。

```sql
-- 查看序列
SELECT sequence_name FROM information_schema.sequences;

-- 序列在事务中的行为
BEGIN;
INSERT INTO t DEFAULT VALUES; -- 获取序列值
ROLLBACK; -- 序列值不会回滚
COMMIT;
```

## 复合主键

```sql
CREATE TABLE user_roles (
  user_id BIGINT NOT NULL,
  role_id BIGINT NOT NULL,
  PRIMARY KEY (user_id, role_id)
);
```

## 最佳实践

- 默认使用 `BIGSERIAL` 或 `BIGINT GENERATED ALWAYS AS IDENTITY`。
- 高并发插入场景考虑序列的瓶颈（使用序列池或批量获取）。
- 避免使用 random UUID 作为主键，选择时间有序的 UUIDv7/ULID。
- 外部唯一标识符可以使用单独的 UUID 列而非主键。
