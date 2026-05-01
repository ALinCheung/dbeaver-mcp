---
title: DBeaver — Workspace e Caminhos por OS
description: Onde o DBeaver armazena dados em cada sistema operacional
---

# DBeaver — Workspace por OS

## macOS

### Instalação padrão (.dmg)
```
~/Library/DBeaverData/workspace6/General/.dbeaver/
```

### Instalação via Homebrew Cask
```
~/Library/Application Support/DBeaverData/workspace6/General/.dbeaver/
```

### Localizar manualmente
No DBeaver: **Help → Installation Details → Configuration** — campo "User home directory".

## Linux

### Instalação .deb / .rpm / tar.gz
```
~/.local/share/DBeaverData/workspace6/General/.dbeaver/
```

### Snap
```
~/snap/dbeaver-ce/current/.local/share/DBeaverData/workspace6/General/.dbeaver/
```

### Flatpak
```
~/.var/app/io.dbeaver.DBeaverCommunity/data/DBeaverData/workspace6/General/.dbeaver/
```

## Windows

### Instalação padrão
```
%APPDATA%\DBeaverData\workspace6\General\.dbeaver\
C:\Users\<usuario>\AppData\Roaming\DBeaverData\workspace6\General\.dbeaver\
```

### Instalação portátil
```
<pasta-dbeaver>\workspace6\General\.dbeaver\
```

## Arquivos relevantes no workspace

| Arquivo | Conteúdo |
|---|---|
| `data-sources.json` | Metadados de todas as conexões |
| `credentials-config.json` | Senhas criptografadas |
| `drivers.json` | Drivers customizados |
| `connection-types.json` | Tipos de conexão (Dev, Prod, etc.) |

## Versões do workspace

O sufixo `workspace6` corresponde ao DBeaver 6+. Versões mais antigas usam `workspace4` ou `workspace5`. O dbeaver-mcp suporta apenas `workspace6`.

## Workspace customizado

Se o usuário iniciou o DBeaver com `-data /caminho/customizado`, o workspace estará nesse caminho. Nesse caso, passe o caminho manualmente:

```python
import dbeaver
ws = dbeaver.find_workspace()  # auto-detect
# ou
ws = Path("/caminho/customizado/General/.dbeaver")
conns = dbeaver.list_connections_safe(workspace=ws)
```

## Múltiplos workspaces

O DBeaver permite múltiplos workspaces. O dbeaver-mcp usa sempre o primeiro encontrado na ordem de candidatos. Se o usuário tiver workspaces múltiplos, precisará informar o caminho manualmente.
