---
title: Transactions and Locking
description: PostgreSQL transaction isolation and locking
tags: postgres, transactions, isolation-levels, locking, mvcc
---

# Transactions and Locking

PostgreSQL 使用 MVCC（多版本并发控制）来管理事务并发。

## 隔离级别

PostgreSQL 支持四种隔离级别（SQL 标准）：

| 隔离级别 | 脏读 | 不可重复读 | 幻读 |
|---|---|---|---|
| **READ UNCOMMITTED** | PostgreSQL 中表现为 READ COMMITTED | 可能 | 可能 |
| **READ COMMITTED** (默认) | 不可能 | 可能 | 可能 |
| **REPEATABLE READ** | 不可能 | 不可能 | 可能（PostgreSQL 中不会发生） |
| **SERIALIZABLE** | 不可能 | 不可能 | 不可能 |

```sql
-- 设置隔离级别
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;
```

## READ COMMITTED（默认）

- 读取查询时只能看到在查询开始前提交的数据。
- 是 PostgreSQL 的默认级别。
- 可能出现不可重复读和幻读。

```sql
BEGIN;
-- 事务 1
UPDATE accounts SET balance = balance - 100 WHERE user_id = 1;
COMMIT;

-- 事务 2（在事务 1 提交后开始）
SELECT balance FROM accounts WHERE user_id = 1; -- 看到新值
```

## REPEATABLE READ

- 读取查询时只能看到在事务开始前提交的数据。
- 使用 `SELECT ... FOR UPDATE` 时会检测并发修改。

```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;
-- 看到的都是事务开始时的状态
SELECT * FROM accounts WHERE user_id = 1 FOR UPDATE;
-- 如果有其他事务修改了这些行，会报错：
-- ERROR: could not serialize access due to concurrent update
```

## SERIALIZABLE

- 最高隔离级别，事务像顺序执行一样。
- 可能导致序列化失败，需要重试。

```sql
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
-- 如果检测到并发修改导致不可序列化
-- ERROR: could not serialize access due to concurrent update
```

## MVCC 概述

PostgreSQL 的 MVCC 机制：
- 每行有两个隐藏列：`xmin`（创建事务ID）和 `xmax`（删除/过期事务ID）
- 事务ID是递增的64位整数
- 活跃事务会看到特定版本的数据

```sql
-- 查看行版本信息（仅供调试）
SELECT xmin, xmax, * FROM users WHERE id = 1;
```

## 锁类型

### 表级锁

| 锁模式 | 冲突锁 | 用途 |
|---|---|---|
| ACCESS SHARE | ACCESS EXCLUSIVE | SELECT |
| ROW SHARE | ROW EXCLUSIVE, EXCLUSIVE | SELECT FOR UPDATE |
| ROW EXCLUSIVE | SHARE, SHARE ROW EXCLUSIVE, EXCLUSIVE, ACCESS EXCLUSIVE | INSERT, UPDATE, DELETE |
| SHARE UPDATE EXCLUSIVE | SHARE UPDATE EXCLUSIVE, SHARE, SHARE ROW EXCLUSIVE, EXCLUSIVE, ACCESS EXCLUSIVE | VACUUM, ANALYZE, CREATE INDEX |
| SHARE | ROW EXCLUSIVE, SHARE UPDATE EXCLUSIVE, SHARE ROW EXCLUSIVE, EXCLUSIVE, ACCESS EXCLUSIVE | CREATE INDEX (without CONCURRENTLY) |
| SHARE ROW EXCLUSIVE | ROW EXCLUSIVE, SHARE UPDATE EXCLUSIVE, SHARE, SHARE ROW EXCLUSIVE, EXCLUSIVE, ACCESS EXCLUSIVE | |
| EXCLUSIVE | ROW SHARE, ROW EXCLUSIVE, SHARE UPDATE EXCLUSIVE, SHARE, SHARE ROW EXCLUSIVE, EXCLUSIVE, ACCESS EXCLUSIVE | |
| ACCESS EXCLUSIVE | 所有锁 | ALTER TABLE, DROP TABLE, TRUNCATE, VACUUM FULL |

### 行级锁

```sql
-- FOR UPDATE：排他锁，阻止其他事务修改或选择 FOR UPDATE
SELECT * FROM orders WHERE id = 1 FOR UPDATE;

-- FOR NO KEY UPDATE：比 FOR UPDATE 弱，允许索引扫描
SELECT * FROM orders WHERE id = 1 FOR NO KEY UPDATE;

-- FOR SHARE：共享锁，阻止其他事务修改
SELECT * FROM orders WHERE id = 1 FOR SHARE;

-- FOR KEY SHARE：最弱，只阻止 DELETE 和某些 UPDATE
SELECT * FROM orders WHERE id = 1 FOR KEY SHARE;
```

## 死锁

PostgreSQL 自动检测死锁并回滚其中一个事务：

```sql
-- 事务 A
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 1; -- 锁定 id=1
-- 事务 B 同时：UPDATE accounts SET balance = balance - 100 WHERE id = 2; -- 锁定 id=2
UPDATE accounts SET balance = balance + 100 WHERE id = 2; -- 尝试锁定 id=2（被 B 锁定）
-- 死锁！PostgreSQL 回滚此事务

-- ERROR: deadlock detected
-- DETAIL: Process A waits for ShareLock on transaction B; then blocked by A.
```

### 避免死锁

- 总是按相同顺序访问资源
- 保持事务简短
- 使用适当的隔离级别
- 实现重试逻辑

```sql
-- 重试逻辑示例（PL/pgSQL）
CREATE OR REPLACE FUNCTION transfer_funds(from_id INT, to_id INT, amount NUMERIC)
RETURNS VOID AS $$
BEGIN
  FOR i IN 1..10 LOOP  -- 最多重试10次
    BEGIN
      BEGIN;
      UPDATE accounts SET balance = balance - amount WHERE id = from_id;
      UPDATE accounts SET balance = balance + amount WHERE id = to_id;
      COMMIT;
      RETURN;
    EXCEPTION WHEN serialization_failure THEN
      -- 重试
    END;
  END LOOP;
  RAISE EXCEPTION 'Transfer failed after 10 retries';
END;
$$ LANGUAGE plpgsql;
```

## 长时间运行的事务

```sql
-- 查看长时间运行的事务
SELECT pid, usename, state, query, query_start, now() - query_start AS duration
FROM pg_stat_activity
WHERE state != 'idle'
  AND (now() - query_start) > interval '5 minutes';

-- 取消长时间运行的查询
SELECT pg_cancel_backend(pid); -- 优雅取消
SELECT pg_terminate_backend(pid); -- 强制终止
```

## VACUUM 和 MVCC

MVCC 会产生死元组（dead tuples），需要 VACUUM 清理：

```sql
-- 手动 VACUUM
VACUUM users;

-- VACUUM 并更新统计信息
VACUUM ANALYZE users;

-- 查看死元组
SELECT schemaname, tablename, n_live_tup, n_dead_tup, last_vacuum, last_autovacuum
FROM pg_stat_user_tables;
```
