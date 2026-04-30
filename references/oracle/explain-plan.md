---
title: EXPLAIN PLAN
description: Reading Oracle EXPLAIN PLAN output
tags: oracle, explain-plan, query-optimization, autotrace
---

# EXPLAIN PLAN

Oracle 提供多种方式查看执行计划。

## 使用 EXPLAIN PLAN

```sql
EXPLAIN PLAN FOR
SELECT * FROM employees WHERE department_id = 50;

SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY);
```

## 使用 AUTOTRACE

```sql
SET AUTOTRACE ON;
SELECT * FROM employees WHERE department_id = 50;
SET AUTOTRACE OFF;
```

## 使用 DBMS_XPLAN

```sql
-- 显示上次 EXPLAIN PLAN 的结果
SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY);

-- 显示最近 SQL 的实际执行计划（需要开启统计）
SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(FORMAT => 'ALLSTATS LAST'));

-- 显示 SQL 历史中的执行计划
SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY_SQL_PLAN_BASELINE(sql_handle => 'SQL_HANDLE'));
```

## 常见操作类型

| 操作 | 含义 |
|---|---|
| **TABLE ACCESS FULL** | 全表扫描 |
| **TABLE ACCESS BY INDEX ROWID** | 通过 ROWID 访问表（回表） |
| **TABLE ACCESS BY INDEX SCAN** | 索引扫描 |
| **INDEX UNIQUE SCAN** | 唯一索引扫描 |
| **INDEX RANGE SCAN** | 索引范围扫描 |
| **INDEX FULL SCAN** | 索引全扫描 |
| **INDEX FAST FULL SCAN** | 索引快速全扫描 |
| **NESTED LOOP** | 嵌套循环连接 |
| **HASH JOIN** | 哈希连接 |
| **MERGE JOIN** | 归并连接 |
| **SORT** | 排序操作 |
| **VIEW** | 视图引用 |

## Red Flags

- **TABLE ACCESS FULL**: 大表全表扫描，需要检查是否有合适的索引
- **NESTED LOOP with large rows**: 可能导致性能问题，考虑 HASH JOIN
- **SORT**: 大数据量排序，检查是否可以添加索引避免排序
- **INDEX FULL SCAN**: 可能比 TABLE ACCESS FULL 差，需要评估

## 输出格式示例

```
PLAN_TABLE_OUTPUT
---------------------------------------------------------------------------
| Id | Operation         | Name    | Rows | Bytes | Cost (%CPU)| Time    |
---------------------------------------------------------------------------
|  0 | SELECT STATEMENT |         |  45  |  4050 |     3 (0)   | 00:00:01|
|* 1 |  TABLE ACCESS FULL|EMPLOYEES|  45  |  4050 |     3 (0)   | 00:00:01|
---------------------------------------------------------------------------

Predicate Information (identified by operation id):
---------------------------------------------------
   1 - filter("DEPARTMENT_ID"=50)
```

## 使用提示（Hints）优化

```sql
-- 强制使用索引
SELECT /*+ INDEX(employees idx_dept_id) */ *
FROM employees WHERE department_id = 50;

-- 强制哈希连接
SELECT /*+ USE_HASH(e d) */ *
FROM employees e, departments d
WHERE e.department_id = d.department_id;
```

## 统计信息

确保统计信息是最新的：

```sql
-- 收集表统计信息
BEGIN
  DBMS_STATS.GATHER_TABLE_STATS(ownname => 'SCHEMA', tabname => 'EMPLOYEES');
END;
/

-- 收集索引统计信息
BEGIN
  DBMS_STATS.GATHER_INDEX_STATS(ownname => 'SCHEMA', indname => 'IDX_EMP_DEPT');
END;
/
```
