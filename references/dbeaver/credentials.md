---
title: DBeaver — Credential Storage
description: How DBeaver stores and encrypts passwords by OS
---

# DBeaver — Credentials by OS

## Credential File

`credentials-config.json` in the DBeaver workspace, encrypted with AES-CBC.

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
%APPDATA%\DBeaverData\workspace6/General\.dbeaver\credentials-config.json
```

## Encryption

- Algorithm: AES-CBC, 28-byte key (public, fixed across all installations)
- IV: 16 null bytes
- Encoding: Base64 after encryption

The key is publicly known and documented in several open source projects. The protection level is against casual access, not against an attacker with filesystem access.

## File Structure

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

## Security in dbeaver-mcp

- Passwords are decrypted in memory, never written to disk or logged
- Only connection metadata (host, port, database) is shown to the user
- `credentials-config.json` is never read by the skill directly — only by the local server