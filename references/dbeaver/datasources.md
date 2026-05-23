---
title: DBeaver — data-sources.json Structure
description: Fields and format of DBeaver's connection file
---

# DBeaver — data-sources.json

## Location

Same directory as `credentials-config.json`:
```
<workspace>/.dbeaver/data-sources.json
```

## Main Structure

```json
{
  "connections": {
    "mysql-abc12345": {
      "name": "Production MySQL",
      "driver": "mysql8",
      "configuration": {
        "host": "db.example.com",
        "port": "3306",
        "database": "myapp",
        "user": "appuser",
        "url": "jdbc:mysql://db.example.com:3306/myapp",
        "properties": {
          "useSSL": "true",
          "serverTimezone": "UTC"
        }
      },
      "folder": "Work",
      "readOnly": false,
      "savePassword": true
    }
  }
}
```

## Important Fields

| Field | Type | Description |
|---|---|---|
| `name` | string | Display name in DBeaver |
| `driver` | string | Driver ID (see below) |
| `configuration.host` | string | Hostname or IP |
| `configuration.port` | string | Port (as string) |
| `configuration.database` | string | Default database |
| `configuration.user` | string | User (may be here or in credentials) |
| `configuration.url` | string | Full JDBC URL (optional) |
| `configuration.properties` | object | Extra driver properties |
| `folder` | string | Organizational folder in DBeaver |
| `savePassword` | bool | Whether password is saved |

## Common MySQL Drivers

| Driver ID | Version |
|---|---|
| `mysql8` | MySQL 8.x (recommended) |
| `mysql5` | MySQL 5.x |
| `mysql` | Generic |
| `mariadb` | MariaDB |

## Connection IDs

The ID is auto-generated in format `<driver>-<hex8>`, e.g., `mysql-a1b2c3d4`.
It is used as key in `credentials-config.json` to link credentials.

## Useful MySQL Driver Properties

```json
{
  "useSSL": "true",
  "requireSSL": "false",
  "verifyServerCertificate": "false",
  "serverTimezone": "UTC",
  "allowPublicKeyRetrieval": "true",
  "characterEncoding": "utf8"
}
```

## Compatibility Notes

- DBeaver 6.x: stable format, supported by dbeaver-mcp
- DBeaver 7.x+: same format, some extra fields ignored by dbeaver-mcp
- The file may be Base64 encoded in some versions — dbeaver.py detects automatically