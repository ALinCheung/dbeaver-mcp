---
title: Redis 慢查询与性能分析
description: SLOWLOG、INFO stats、BIGKEY 检测
tags: redis, slowlog, performance, bigkey, latency
---

# Redis 慢查询与性能分析

## SLOWLOG

Redis 内置慢查询日志，记录执行时间超过 `slowlog-log-slower-than` 的命令。

```
SLOWLOG GET          # 查看所有慢查询
SLOWLOG GET 10       # 查看最近 10 条
SLOWLOG LEN          # 当前慢查询数量
SLOWLOG RESET        # 清空慢查询日志
```

## 慢查询阈值配置

```
# redis.conf
slowlog-log-slower-than 10000   # 10ms
slowlog-max-len 128             # 最多保存 128 条
```

## INFO stats 关键指标

| 指标 | 含义 |
|------|------|
| `instantaneous_ops_per_sec` | QPS |
| `total_commands_processed` | 累计命令数 |
| `instantaneous_input_kbps` | 输入带宽 |
| `instantaneous_output_kbps` | 输出带宽 |
| `rejected_connections` | 拒绝连接数 |
| `keyspace_hits/misses` | Key 命中率 |

## BIGKEY 检测

```
redis-cli --bigkeys          # 扫描各类型最大 Key
redis-cli --scan | head -100 | xargs redis-cli --bigkeys  # 指定 Key 范围
```

或用 `@slow-transformers` ragel:
```
MEMORY USAGE key
```

## latency 延迟分析

```
redis-cli --latency-history   # 延迟分布历史
redis-cli --latency           # 实时延迟
redis-cli --intrinsic-latency # 内在延迟测试
```

## 常见性能问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| KEYS 阻塞 | O(N) 全量扫描 | 用 SCAN 替代 |
| SMEMBERS 大集合 | O(N) | 用 SSCAN |
| HGETALL 大 Hash | O(N) | 用 HSCAN，每次 100 field |
| O(N) 命令批量执行 | 主线程阻塞 | 分散到从节点 |
