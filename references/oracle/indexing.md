---
title: Indexing
description: Oracle indexing strategies
tags: oracle, indexing, b-tree, bitmap-index, function-based-index
---

# Indexing

Oracle 支持多种索引类型，默认是 B-tree 索引。

## 索引类型

| 类型 | 适用场景 |
|---|---|
| **B-tree** (默认) | 高基数列，equality 和 range 查询 |
| **Bitmap** | 低基数列，多维分析，数据仓库 |
| **Bitmap Join** | 多表 JOIN 的位图索引 |
| **Function-based** | 函数或表达式上的索引 |
| **Domain** | 特定应用（如全文搜索） |
| **Composite** | 多列索引 |
| **Invisible** | 测试索引效果，不影响优化器 |

## 创建索引

```sql
-- 单列 B-tree 索引
CREATE INDEX idx_employees_dept ON employees(department_id);

-- 复合索引
CREATE INDEX idx_orders_cust_status ON orders(customer_id, status);

-- 唯一索引
CREATE UNIQUE INDEX idx_employees_email ON employees(email);

-- 位图索引（适合低基数列）
CREATE BITMAP INDEX idx_customers_region ON customers(region);

-- 函数索引
CREATE INDEX idx_employees_upper_name ON employees(UPPER(name));

-- 基于列的索引
CREATE INDEX idx_employees_salary ON employees(salary) WHERE salary > 0;

-- 不可见索引
CREATE INDEX idx_employees_hiredate ON employees(hire_date) INVISIBLE;
```

## 复合索引最佳实践

复合索引遵循最左前缀原则：

```sql
-- 索引 (department_id, job_id, hire_date)
-- 支持：
-- WHERE department_id = 50
-- WHERE department_id = 50 AND job_id = 'CLERK'
-- WHERE department_id = 50 AND job_id = 'CLERK' AND hire_date > '2020-01-01'

-- 不支持（跳过最左列）：
-- WHERE job_id = 'CLERK'
-- WHERE hire_date > '2020-01-01'
```

**最佳实践：**
- 等值条件在前，范围条件在后
- 考虑查询的实际模式
- 高选择性列放在前面

## 函数索引

```sql
-- 大小写不敏感的查询
CREATE INDEX idx_employees_upper_email ON employees(UPPER(email));

SELECT * FROM employees WHERE UPPER(email) = 'TEST@EXAMPLE.COM';

-- 计算列
CREATE INDEX idx_orders_year ON orders(EXTRACT(YEAR FROM order_date));
```

## 位图索引

适合数据仓库场景，低基数列：

```sql
-- 低基数列（性别、地区、状态）
CREATE BITMAP INDEX idx_sales_region ON sales(region);
CREATE BITMAP INDEX idx_sales_status ON sales(status);

-- 位图索引的 AND/OR 操作
-- SELECT * FROM sales WHERE region = 'NORTH' AND status = 'PENDING';
-- 使用位图索引快速合并
```

## 索引维护

```sql
-- 查看索引使用情况
SELECT index_name, table_name, uniqueness, visibility
FROM user_indexes;

-- 查看索引统计信息
SELECT index_name, num_rows, distinct_keys, avg_leaf_blocks_per_key
FROM user_indexes;

-- 重建索引
ALTER INDEX idx_employees_name REBUILD;

-- 重建索引（在线，不阻塞 DML）
ALTER INDEX idx_employees_name REBUILD ONLINE;

-- 合并索引碎片
ALTER INDEX idx_employees_name COALESCE;

-- 分析索引统计信息
BEGIN
  DBMS_STATS.GATHER_INDEX_STATS(ownname => USER, indname => 'IDX_EMPLOYEES_NAME');
END;
/
```

## Invisible 索引

用于测试索引效果：

```sql
-- 创建不可见索引
CREATE INDEX idx_employees_salary ON employees(salary) INVISIBLE;

-- 使索引可见
ALTER INDEX idx_employees_salary VISIBLE;

-- 使索引不可见
ALTER INDEX idx_employees_salary INVISIBLE;

-- 优化器使用不可见索引
ALTER SESSION SET OPTIMIZER_USE_INVISIBLE_INDEXES = TRUE;
```

## 监控索引使用

```sql
-- 启用监控
ALTER INDEX idx_employees_dept MONITORING USAGE;

-- 查看监控结果
SELECT * FROM v$object_usage;

-- 禁用监控
ALTER INDEX idx_employees_dept NOMONITORING USAGE;
```

## 删除未使用的索引

```sql
-- 查看未使用的索引
SELECT index_name, table_name
FROM user_indexes
WHERE index_name IN (
  SELECT index_name FROM user_indexes
  MINUS
  SELECT index_name FROM v$object_usage WHERE used = 'YES'
);
```

## 注意事项

- 索引会降低 INSERT/UPDATE/DELETE 性能
- 复合索引顺序很重要
- 位图索引不适合 OLTP 系统
- 定期监控索引使用情况，删除无用索引
