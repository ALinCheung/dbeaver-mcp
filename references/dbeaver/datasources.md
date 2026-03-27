---
title: DBeaver — Estrutura do data-sources.json
description: Campos e formato do arquivo de conexões do DBeaver
---

# DBeaver — data-sources.json

## Localização

Mesmo diretório do `credentials-config.json`:
```
<workspace>/.dbeaver/data-sources.json
```

## Estrutura principal

```json
{
  "connections": {
    "mysql-abc12345": {
      "name": "Produção MySQL",
      "driver": "mysql8",
      "configuration": {
        "host": "db.exemplo.com",
        "port": "3306",
        "database": "myapp",
        "user": "appuser",
        "url": "jdbc:mysql://db.exemplo.com:3306/myapp",
        "properties": {
          "useSSL": "true",
          "serverTimezone": "UTC"
        }
      },
      "folder": "Trabalho",
      "readOnly": false,
      "savePassword": true
    }
  }
}
```

## Campos importantes

| Campo | Tipo | Descrição |
|---|---|---|
| `name` | string | Nome exibido no DBeaver |
| `driver` | string | ID do driver (veja abaixo) |
| `configuration.host` | string | Hostname ou IP |
| `configuration.port` | string | Porta (como string) |
| `configuration.database` | string | Banco padrão |
| `configuration.user` | string | Usuário (pode estar aqui ou em credentials) |
| `configuration.url` | string | JDBC URL completa (opcional) |
| `configuration.properties` | object | Propriedades extras do driver |
| `folder` | string | Pasta organizacional no DBeaver |
| `savePassword` | bool | Se a senha está salva |

## Drivers MySQL comuns

| Driver ID | Versão |
|---|---|
| `mysql8` | MySQL 8.x (recomendado) |
| `mysql5` | MySQL 5.x |
| `mysql` | Genérico |
| `mariadb` | MariaDB |

## ID das conexões

O ID é gerado automaticamente no formato `<driver>-<hex8>`, ex: `mysql-a1b2c3d4`.
É usado como chave no `credentials-config.json` para vincular as credenciais.

## Propriedades úteis do driver MySQL

```json
{
  "useSSL": "true",
  "requireSSL": "false",
  "verifyServerCertificate": "false",
  "serverTimezone": "America/Sao_Paulo",
  "allowPublicKeyRetrieval": "true",
  "characterEncoding": "utf8"
}
```

## Notas de compatibilidade

- DBeaver 6.x: formato estável, suportado pelo dbeaver-mcp
- DBeaver 7.x+: mesmo formato, alguns campos extras ignorados pelo dbeaver-mcp
- O arquivo pode estar em Base64 em algumas versões — o dbeaver.py detecta automaticamente
