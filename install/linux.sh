#!/usr/bin/env bash
# install/linux.sh — Instala o dbeaver-mcp no Linux
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_DIR="$HOME/.skills/dbeaver-mcp"
SERVICE_NAME="dbeaver-mcp"
SYSTEMD_USER_DIR="$HOME/.config/systemd/user"

echo "=== dbeaver-mcp — Instalação Linux ==="
echo ""

# 1. Node.js
if ! command -v node &>/dev/null; then
  echo "ERRO: Node.js não encontrado."
  echo "Instale com: sudo apt install nodejs npm  (Debian/Ubuntu)"
  echo "         ou: sudo dnf install nodejs       (Fedora/RHEL)"
  echo "         ou: https://nodejs.org/"
  exit 1
fi
echo "✓ Node.js: $(node --version)"

# 2. npm
if ! command -v npm &>/dev/null; then
  echo "ERRO: npm não encontrado."
  echo "Instale com: sudo apt install npm"
  exit 1
fi
echo "✓ npm: $(npm --version)"

# 3. Instalar em ~/.skills/dbeaver-mcp
echo ""
echo "Instalando em $INSTALL_DIR..."
mkdir -p "$HOME/.skills"
if [ "$REPO_DIR" != "$INSTALL_DIR" ]; then
  rm -rf "$INSTALL_DIR"
  mkdir -p "$INSTALL_DIR"
  rsync -a --exclude node_modules --exclude dist --exclude .git \
    "$REPO_DIR/" "$INSTALL_DIR/"
  echo "✓ Copiado para $INSTALL_DIR"
else
  echo "✓ Já executando de $INSTALL_DIR"
fi

# 4. Dependências
echo ""
echo "Instalando dependências Node.js..."
cd "$INSTALL_DIR" && npm install
echo "✓ Dependências instaladas"

# 5. Build
echo ""
echo "Compilando TypeScript..."
cd "$INSTALL_DIR" && npm run build
echo "✓ Build concluído"

# 6. Verificar workspace DBeaver
echo ""
echo "Verificando workspace do DBeaver..."
node -e "
  const { findWorkspace } = require('$INSTALL_DIR/dist/dbeaver.js');
  try { findWorkspace(); console.log('✓ Workspace encontrado'); }
  catch(e) { console.log('⚠ ' + e.message.split('\n')[0]); }
" 2>/dev/null || echo "⚠ Workspace do DBeaver não encontrado."

# 7. Criar diretório de configuração e settings padrão
echo ""
echo "Configurando diretório ~/.dbeaver-mcp..."
mkdir -p "$HOME/.dbeaver-mcp"
if [ ! -f "$HOME/.dbeaver-mcp/settings.json" ]; then
  cp "$INSTALL_DIR/settings.example.json" "$HOME/.dbeaver-mcp/settings.json"
  echo "✓ settings.json criado em ~/.dbeaver-mcp/"
else
  echo "✓ settings.json já existe em ~/.dbeaver-mcp/"
fi

# 8. Systemd user service (opcional, sem sudo)
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
ExecStart=$(command -v node) $INSTALL_DIR/dist/index.js
WorkingDirectory=$INSTALL_DIR
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

# 9. Claude Code
echo ""
if command -v claude &>/dev/null; then
  echo "Registrando no Claude Code..."
  claude mcp add dbeaver-mcp -- node "$INSTALL_DIR/dist/index.js" 2>/dev/null && \
    echo "✓ Adicionado ao Claude Code" || \
    echo "⚠ Adicione manualmente: claude mcp add dbeaver-mcp -- node $INSTALL_DIR/dist/index.js"
else
  echo "Claude Code não encontrado. Adicione manualmente:"
  echo "  claude mcp add dbeaver-mcp -- node $INSTALL_DIR/dist/index.js"
fi

# 10. Claude Desktop (Linux)
CLAUDE_DESKTOP_CONFIG="$HOME/.config/Claude/claude_desktop_config.json"
if [ -f "$CLAUDE_DESKTOP_CONFIG" ]; then
  echo ""
  echo "Claude Desktop detectado. Adicione em claude_desktop_config.json:"
  echo '  "mcpServers": {'
  echo '    "dbeaver-mcp": {'
  echo '      "command": "node",'
  echo "      \"args\": [\"$INSTALL_DIR/dist/index.js\"]"
  echo '    }'
  echo '  }'
fi

echo ""
echo "=== Instalação concluída! ==="
echo ""
echo "Instalado em: $INSTALL_DIR"
echo ""
echo "Teste rápido:"
echo "  echo '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\",\"params\":{}}' | node $INSTALL_DIR/dist/index.js"
