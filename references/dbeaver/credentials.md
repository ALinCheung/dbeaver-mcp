---
title: DBeaver — Armazenamento de Credenciais
description: Como o DBeaver armazena e criptografa senhas por OS
---

# DBeaver — Credenciais por OS

## Arquivo de credenciais

`credentials-config.json` no workspace do DBeaver, criptografado com AES-CBC.

### macOS
```
~/Library/DBeaverData/workspace6/General/.dbeaver/credentials-config.json
~/Library/Application Support/DBeaverData/workspace6/General/.dbeaver/credentials-config.json
```

### Linux
```
~/.local/share/DBeaverData/workspace6/General/.dbeaver/credentials-config.json
~/snap/dbeaver-ce/current/.local/share/DBeaverData/workspace6/General/.dbeaver/credentials-config.json
```

### Windows
```
%APPDATA%\DBeaverData\workspace6\General\.dbeaver\credentials-config.json
```

## Criptografia

- Algoritmo: AES-CBC, chave de 28 bytes (pública, fixa em todas as instalações)
- IV: 16 bytes nulos
- Encoding: Base64 após cifrar

A chave é conhecida publicamente e documentada em vários projetos open source. O nível de proteção é contra acesso casual, não contra um atacante com acesso ao sistema de arquivos.

## Estrutura do arquivo

```json
{
  "conn-id-abc123": {
    "#connection": {
      "user": "root",
      "password": "<base64-aes-encrypted>"
    }
  }
}
```

## Segurança no dbeaver-mcp

- Senhas são descriptografadas em memória, nunca escritas em disco ou logadas
- Apenas metadados de conexão (host, porta, banco) são exibidos ao usuário
- `credentials-config.json` nunca é lido pela skill diretamente — apenas pelo servidor local
