#!/usr/bin/env bash
# install/linux.sh — Instala o dbeaver-mcp no Linux
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="dbeaver-mcp"
SYSTEMD_USER_DIR="$HOME/.config/systemd/user"

echo "=== dbeaver-mcp — Instalação Linux ==="
echo ""

# 1. Python 3
if ! command -v python3 &>/dev/null; then
  echo "ERRO: Python 3 não encontrado."
  echo "Instale com: sudo apt install python3 python3-pip  (Debian/Ubuntu)"
  echo "         ou: sudo dnf install python3              (Fedora/RHEL)"
  exit 1
fi
PYTHON=$(command -v python3)
echo "✓ Python: $($PYTHON --version)"

# 2. pip
if ! $PYTHON -m pip --version &>/dev/null; then
  echo "ERRO: pip não encontrado."
  echo "Instale com: sudo apt install python3-pip"
  exit 1
fi

# 3. Dependências
echo ""
echo "Instalando dependências Python..."
$PYTHON -m pip install --quiet --upgrade \
  mysql-connector-python \
  pycryptodome
echo "✓ Dependências instaladas"

# 4. Verificar workspace DBeaver
echo ""
echo "Verificando workspace do DBeaver..."
if $PYTHON -c "import sys; sys.path.insert(0, '$REPO_DIR'); import dbeaver; dbeaver.find_workspace(); print('✓ Workspace encontrado')" 2>/dev/null; then
  :
else
  echo "⚠ Workspace do DBeaver não encontrado."
  echo "  Caminhos verificados:"
  echo "    ~/.local/share/DBeaverData/workspace6/General/.dbeaver"
  echo "    ~/snap/dbeaver-ce/current/..."
fi

# 5. Systemd user service (opcional, sem sudo)
echo ""
if command -v systemctl &>/dev/null; then
  echo "Instalando serviço systemd (usuário)..."
  mkdir -p "$SYSTEMD_USER_DIR"
  cat > "$SYSTEMD_USER_DIR/$SERVICE_NAME.service" <<EOF
[Unit]
Description=DBeaver MCP Server
After=graphical-session.target

[Service]
Type=simple
ExecStart=$PYTHON $REPO_DIR/scripts/server.py
WorkingDirectory=$REPO_DIR
Restart=no
StandardError=journal

[Install]
WantedBy=default.target
EOF
  systemctl --user daemon-reload 2>/dev/null || true
  echo "✓ Serviço systemd criado: ~/.config/systemd/user/$SERVICE_NAME.service"
  echo "  Para ativar: systemctl --user enable $SERVICE_NAME"
else
  echo "systemd não disponível. O servidor será iniciado sob demanda pelo Claude."
fi

# 6. Claude Code
echo ""
if command -v claude &>/dev/null; then
  echo "Registrando no Claude Code..."
  claude mcp add dbeaver-mcp -- "$PYTHON" "$REPO_DIR/scripts/server.py" 2>/dev/null && \
    echo "✓ Adicionado ao Claude Code" || \
    echo "⚠ Adicione manualmente: claude mcp add dbeaver-mcp -- python3 $REPO_DIR/scripts/server.py"
else
  echo "Claude Code não encontrado. Adicione manualmente:"
  echo "  claude mcp add dbeaver-mcp -- python3 $REPO_DIR/scripts/server.py"
fi

# 7. Claude Desktop (Linux)
CLAUDE_DESKTOP_CONFIG="$HOME/.config/Claude/claude_desktop_config.json"
if [ -f "$CLAUDE_DESKTOP_CONFIG" ]; then
  echo ""
  echo "Claude Desktop detectado. Adicione em claude_desktop_config.json:"
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
