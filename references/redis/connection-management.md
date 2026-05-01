---
title: Redis 连接管理
description: Redis 连接配置与驱动支持
tags: redis, connection, ioredis, host, port, password
---

# Redis 连接管理

## 连接参数

| 参数 | 来源 | 说明 |
|------|------|------|
| `host` | DBeaver 连接配置 | Redis 服务器地址 |
| `port` | DBeaver 连接配置 | 默认 6379 |
| `password` | DBeaver 连接配置 | 无密码时为空 |
| `database` | DBeaver 连接配置 | 默认 DB 0 |

## 支持的驱动标识

- `redis`（主要标识）

## 连接测试

```bash
PING
# 返回: PONG
```

## 常用连接命令

```
CLIENT LIST           # 查看所有客户端连接
CLIENT KILL <ip:port> # 杀掉指定客户端
INFO clients          # 查看客户端统计
```

## 超时配置

Redis 默认 `timeout 0`（永不超时）。生产环境建议设置：
```
CONFIG SET timeout 300
```

## 连接池

ioredis 使用默认连接池，无需额外配置最大连接数。
