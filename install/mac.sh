#!/usr/bin/env bash
# install/mac.sh — Instala o dbeaver-mcp no macOS
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_DIR="$HOME/.skills/dbeaver-mcp"
PLIST_NAME="com.dbeaver-mcp.server"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"

echo "=== dbeaver-mcp — Instalação macOS ==="
echo ""

# 1. Node.js
if ! command -v node &>/dev/null; then
  echo "ERRO: Node.js não encontrado."
  echo "Instale via Homebrew: brew install node"
  echo "Ou via: https://nodejs.org/"
  exit 1
fi
echo "✓ Node.js: $(node --version)"

# 2. npm
if ! command -v npm &>/dev/null; then
  echo "ERRO: npm não encontrado."
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
if node -e "
  const { findWorkspace } = require('$INSTALL_DIR/dist/dbeaver.js');
  try { findWorkspace(); console.log('✓ Workspace encontrado'); }
  catch(e) { console.log('⚠ ' + e.message.split('\n')[0]); }
" 2>/dev/null; then
  :
else
  echo "⚠ Workspace do DBeaver não encontrado (o DBeaver pode não estar instalado)."
  echo "  O servidor MCP ainda será instalado — configure o DBeaver depois."
fi

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

# 8. Registrar no launchd (autostart com o Mac)
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
    <string>$(command -v node)</string>
    <string>$INSTALL_DIR/dist/index.js</string>
  </array>
  <key>RunAtLoad</key>
  <false/>
  <key>KeepAlive</key>
  <false/>
  <key>StandardErrorPath</key>
  <string>$HOME/.dbeaver-mcp/server.log</string>
  <key>WorkingDirectory</key>
  <string>$INSTALL_DIR</string>
</dict>
</plist>
EOF
launchctl load "$PLIST_PATH" 2>/dev/null || true
echo "✓ Registrado em LaunchAgents"

# 9. Registrar no Claude Code (se disponível)
echo ""
if command -v claude &>/dev/null; then
  echo "Registrando no Claude Code..."
  claude mcp add dbeaver-mcp -- node "$INSTALL_DIR/dist/index.js" 2>/dev/null && \
    echo "✓ Adicionado ao Claude Code" || \
    echo "⚠ Não foi possível adicionar automaticamente. Veja instruções abaixo."
else
  echo "Claude Code não encontrado. Adicione manualmente:"
  echo "  claude mcp add dbeaver-mcp -- node $INSTALL_DIR/dist/index.js"
fi

# 10. Claude Desktop config
CLAUDE_DESKTOP_CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
if [ -f "$CLAUDE_DESKTOP_CONFIG" ]; then
  echo ""
  echo "Detectado Claude Desktop. Para adicionar o MCP, inclua em claude_desktop_config.json:"
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
