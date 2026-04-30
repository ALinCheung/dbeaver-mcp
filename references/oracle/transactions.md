---
title: Transactions and Locking
description: Oracle transaction isolation and locking
tags: oracle, transactions, isolation-levels, locking, deadlock
---

# Transactions and Locking

Oracle 使用多版本并发控制（MVCC）和行级锁来管理事务并发。

## 隔离级别

Oracle 支持三种隔离级别：

| 隔离级别 | 脏读 | 不可重复读 | 幻读 |
|---|---|---|---|
| **READ COMMITTED** (默认) | 不可能 | 可能 | 可能 |
| **SERIALIZABLE** | 不可能 | 不可能 | 不可能 |
| **READ ONLY** | 不可能 | 不可能 | 不可能 |

```sql
-- 设置隔离级别
ALTER SESSION SET ISOLATION_LEVEL = SERIALIZABLE;
ALTER SESSION SET ISOLATION_LEVEL = READ COMMITTED;
```

## READ COMMITTED（默认）

- 读取查询时只能看到查询开始前提交的数据。
- 等待其他事务持有的行锁释放。

```sql
-- 会等待锁释放
SELECT * FROM orders WHERE id = 1 FOR UPDATE;
-- 如果其他事务持有此行的锁，会等待
```

## SERIALIZABLE

- 事务像顺序执行一样。
- 尝试修改已修改的行会报错。

```sql
ALTER SESSION SET ISOLATION_LEVEL = SERIALIZABLE;

-- 如果其他事务修改了这些行
-- ERROR: ORA-08177: can't serialize access for this transaction
```

## READ ONLY

- 只能读取数据，不能修改。
- 提供一致性好 READ COMMITTED。

```sql
ALTER SESSION SET ISOLATION_LEVEL = READ ONLY;
-- SELECT 可以执行，但 INSERT/UPDATE/DELETE 会报错
```

## 锁类型

### 行级锁（TX）

```sql
-- INSERT/UPDATE/DELETE 自动锁定行
-- 可以通过 FOR UPDATE 显式锁定

SELECT * FROM orders WHERE id = 1 FOR UPDATE;
-- 阻止其他事务修改此行，直到事务提交或回滚
```

### 表级锁（TM）

| 锁模式 | 用途 | 冲突 |
|---|---|---|
| **Row Share (RS)** | SELECT FOR UPDATE | Exclusive 互斥 |
| **Row Exclusive (RX)** | INSERT, UPDATE, DELETE | Share, Exclusive 互斥 |
| **Share (S)** | CREATE INDEX | Row Exclusive, Exclusive 互斥 |
| **Share Row Exclusive (SRX)** | | Row Exclusive, Share, Exclusive 互斥 |
| **Exclusive (X)** | DROP, TRUNCATE | 所有锁互斥 |

```sql
-- 添加行级锁
SELECT * FROM employees WHERE department_id = 50 FOR UPDATE;

-- 查看锁
SELECT * FROM v$lock WHERE type IN ('TX', 'TM');

-- 查看锁等待
SELECT * FROM v$session_wait WHERE event LIKE '%enq%';
```

## 死锁

Oracle 自动检测并回滚一个事务：

```sql
-- 事务 A
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;

-- 事务 B 同时
UPDATE accounts SET balance = balance - 100 WHERE id = 2;
UPDATE accounts SET balance = balance + 100 WHERE id = 1;
-- 死锁！Oracle 回滚代价最小的事务

-- ERROR: ORA-00060: deadlock detected while waiting for resource
```

### 避免死锁

- 按相同顺序访问资源
- 保持事务简短
- 使用 SELECT FOR UPDATE NOWAIT 快速失败

```sql
-- NOWAIT：立即失败而不是等待
SELECT * FROM orders WHERE id = 1 FOR UPDATE NOWAIT;

-- WAIT：等待指定秒数
SELECT * FROM orders WHERE id = 1 FOR UPDATE WAIT 10;
```

## SCN（系统变更号）

Oracle 使用 SCN 来标记事务顺序：

```sql
-- 查看当前 SCN
SELECT CURRENT_SCN FROM V$DATABASE;

-- 查看特定时间点的数据（闪回查询）
SELECT * FROM orders AS OF TIMESTAMP TO_TIMESTAMP('2024-01-01 00:00:00', 'YYYY-MM-DD HH24:MI:SS');

-- 闪回版本查询
SELECT * FROM orders VERSIONS BETWEEN TIMESTAMP TO_TIMESTAMP('2024-01-01 00:00:00') AND TO_TIMESTAMP('2024-01-01 12:00:00');
```

## 重做日志和回滚

```sql
-- 查看事务使用的回滚段
SELECT xidusn, xidslot, xidsqn, status FROM V$TRANSACTION;

-- 查看回滚段统计
SELECT * FROM V$ROLLNAME;

-- 强制事务回滚
ALTER SYSTEM KILL SESSION 'sid, serial#' IMMEDIATE;
```

## 长事务处理

```sql
-- 查看长时间运行的事务
SELECT sid, serial#, username, program, sql_id, 
       (SYSDATE - start_time) * 86400 AS elapsed_seconds
FROM v$session 
WHERE username IS NOT NULL
  AND status = 'ACTIVE'
  AND (SYSDATE - start_time) > 1/24; -- 运行超过1小时

-- 杀掉会话
ALTER SYSTEM KILL SESSION 'sid, serial#' IMMEDIATE;
```

## 一致性读取

```sql
-- 修改数据前确保一致性
SELECT * FROM orders WHERE id = 1; -- 读取 SCN 版本

-- 强制读取最新数据
SELECT * FROM orders WHERE id = 1 FOR UPDATE;

-- 闪回查询
SELECT * FROM orders AS OF SCN 12345678 WHERE id = 1;
```

## 最佳实践

- 保持事务简短，减少锁持有时间
- 按相同顺序访问资源避免死锁
- 使用 SELECT FOR UPDATE NOWAIT 检测锁竞争
- 实现重试逻辑处理序列化失败
- 使用闪回功能进行数据恢复而非长时间运行的事务
