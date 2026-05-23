---
title: DBeaver — Workspace and Paths by OS
description: Where DBeaver stores data on each operating system
---

# DBeaver — Workspace by OS

## macOS

### Standard Installation (.dmg)
```
~/Library/DBeaverData/workspace6/General/.dbeaver/
```

### Homebrew Cask Installation
```
~/Library/Application Support/DBeaverData/workspace6/General/.dbeaver/
```

### Finding Manually
In DBeaver: **Help → Installation Details → Configuration** — field "User home directory".

## Linux

### Standard Installation .deb / .rpm / tar.gz
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

### Standard Installation
```
%APPDATA%\DBeaverData\workspace6\General\.dbeaver\
C:\Users\<user>\AppData\Roaming\DBeaverData\workspace6\General\.dbeaver\
```

### Portable Installation
```
<dbeaver-folder>\workspace6\General\.dbeaver\
```

## Relevant Files in Workspace

| File | Contents |
|---|---|
| `data-sources.json` | Metadata for all connections |
| `credentials-config.json` | Encrypted passwords |
| `drivers.json` | Custom drivers |
| `connection-types.json` | Connection types (Dev, Prod, etc.) |

## Workspace Versions

The `workspace6` suffix corresponds to DBeaver 6+. Older versions use `workspace4` or `workspace5`. dbeaver-mcp only supports `workspace6`.

## Custom Workspace

If the user started DBeaver with `-data /custom/path`, the workspace will be at that path. In this case, pass the path manually:

```python
import dbeaver
ws = dbeaver.find_workspace()  # auto-detect
# or
ws = Path("/custom/path/General/.dbeaver")
conns = dbeaver.list_connections_safe(workspace=ws)
```

## Multiple Workspaces

DBeaver allows multiple workspaces. dbeaver-mcp always uses the first found in candidate order. If the user has multiple workspaces, they will need to provide the path manually.