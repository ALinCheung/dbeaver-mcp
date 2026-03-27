#!/usr/bin/env bash
# install/mac.sh — Instala o dbeaver-mcp no macOS
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLIST_NAME="com.dbeaver-mcp.server"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"

echo "=== dbeaver-mcp — Instalação macOS ==="
echo ""

# 1. Python 3
if ! command -v python3 &>/dev/null; then
  echo "ERRO: Python 3 não encontrado."
  echo "Instale via Homebrew: brew install python"
  exit 1
fi
PYTHON=$(command -v python3)
echo "✓ Python: $($PYTHON --version)"

# 2. Dependências
echo ""
echo "Instalando dependências Python..."
$PYTHON -m pip install --quiet --upgrade \
  mysql-connector-python \
  pycryptodome
echo "✓ Dependências instaladas"

# 3. Testar leitura do DBeaver
echo ""
echo "Verificando workspace do DBeaver..."
if $PYTHON -c "import sys; sys.path.insert(0, '$REPO_DIR'); import dbeaver; dbeaver.find_workspace(); print('✓ Workspace encontrado')" 2>/dev/null; then
  :
else
  echo "⚠ Workspace do DBeaver não encontrado (o DBeaver pode não estar instalado)."
  echo "  O servidor MCP ainda será instalado — configure o DBeaver depois."
fi

# 4. Registrar no launchd (autostart com o Mac)
echo ""
echo "Registrando no launchd..."
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$PLIST_NAME</string>
  <key>ProgramArguments</key>
  <array>
    <string>$PYTHON</string>
    <string>$REPO_DIR/scripts/server.py</string>
  </array>
  <key>RunAtLoad</key>
  <false/>
  <key>KeepAlive</key>
  <false/>
  <key>StandardErrorPath</key>
  <string>$HOME/.dbeaver-mcp/server.log</string>
  <key>WorkingDirectory</key>
  <string>$REPO_DIR</string>
</dict>
</plist>
EOF
launchctl load "$PLIST_PATH" 2>/dev/null || true
echo "✓ Registrado em LaunchAgents"

# 5. Registrar no Claude Code (se disponível)
echo ""
if command -v claude &>/dev/null; then
  echo "Registrando no Claude Code..."
  claude mcp add dbeaver-mcp -- "$PYTHON" "$REPO_DIR/scripts/server.py" 2>/dev/null && \
    echo "✓ Adicionado ao Claude Code" || \
    echo "⚠ Não foi possível adicionar automaticamente. Veja instruções abaixo."
else
  echo "Claude Code não encontrado. Adicione manualmente:"
  echo "  claude mcp add dbeaver-mcp -- python3 $REPO_DIR/scripts/server.py"
fi

# 6. Claude Desktop config
CLAUDE_DESKTOP_CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
if [ -f "$CLAUDE_DESKTOP_CONFIG" ]; then
  echo ""
  echo "Detectado Claude Desktop. Para adicionar o MCP, inclua em claude_desktop_config.json:"
  echo '  "mcpServers": {'
  echo '    "dbeaver-mcp": {'
  echo "      \"command\": \"$PYTHON\","
  echo "      \"args\": [\"$REPO_DIR/scripts/server.py\"]"
  echo '    }'
  echo '  }'
fi

echo ""
echo "=== Instalação concluída! ==="
echo ""
echo "Teste rápido:"
echo "  echo '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\",\"params\":{}}' | python3 $REPO_DIR/scripts/server.py"
