# install/windows.ps1 — Instala o dbeaver-mcp no Windows
# Execute como: powershell -ExecutionPolicy Bypass -File install\windows.ps1
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoDir = Split-Path -Parent $PSScriptRoot

Write-Host "=== dbeaver-mcp — Instalacao Windows ===" -ForegroundColor Cyan
Write-Host ""

# 1. Python 3
$Python = $null
foreach ($candidate in @("python", "python3", "py")) {
    try {
        $ver = & $candidate --version 2>&1
        if ($ver -match "Python 3") {
            $Python = $candidate
            Write-Host "OK Python: $ver" -ForegroundColor Green
            break
        }
    } catch {}
}
if (-not $Python) {
    Write-Host "ERRO: Python 3 nao encontrado." -ForegroundColor Red
    Write-Host "Instale em: https://www.python.org/downloads/"
    Write-Host "Marque 'Add Python to PATH' durante a instalacao."
    exit 1
}

# 2. Dependencias
Write-Host ""
Write-Host "Instalando dependencias Python..."
& $Python -m pip install --quiet --upgrade mysql-connector-python pycryptodome
Write-Host "OK Dependencias instaladas" -ForegroundColor Green

# 3. Verificar workspace DBeaver
Write-Host ""
Write-Host "Verificando workspace do DBeaver..."
$testScript = @"
import sys
sys.path.insert(0, r'$RepoDir')
import dbeaver
try:
    ws = dbeaver.find_workspace()
    print(f'OK Workspace encontrado: {ws}')
except FileNotFoundError as e:
    print(f'AVISO: {e}')
"@
& $Python -c $testScript

# 4. Registrar como Task Agendada (opcional, inicia sob demanda)
Write-Host ""
Write-Host "Criando atalho de registro no Claude..."

$RegisterScript = @"
@echo off
echo Registrando dbeaver-mcp no Claude Code...
claude mcp add dbeaver-mcp -- $Python $RepoDir\scripts\server.py
echo.
echo Concluido! Reinicie o Claude Code.
pause
"@
$RegisterScript | Out-File -FilePath "$RepoDir\register-claude.bat" -Encoding ASCII
Write-Host "OK Criado register-claude.bat" -ForegroundColor Green

# 5. Claude Code
Write-Host ""
$claudeCmd = Get-Command claude -ErrorAction SilentlyContinue
if ($claudeCmd) {
    Write-Host "Registrando no Claude Code..."
    try {
        & claude mcp add dbeaver-mcp -- $Python "$RepoDir\scripts\server.py"
        Write-Host "OK Adicionado ao Claude Code" -ForegroundColor Green
    } catch {
        Write-Host "AVISO: Nao foi possivel adicionar automaticamente." -ForegroundColor Yellow
        Write-Host "  Execute: register-claude.bat"
    }
} else {
    Write-Host "Claude Code nao encontrado. Execute register-claude.bat apos instalar."
}

# 6. Claude Desktop (Windows)
$ClaudeDesktopConfig = "$env:APPDATA\Claude\claude_desktop_config.json"
if (Test-Path $ClaudeDesktopConfig) {
    Write-Host ""
    Write-Host "Claude Desktop detectado. Adicione em claude_desktop_config.json:" -ForegroundColor Yellow
    Write-Host '  "mcpServers": {'
    Write-Host '    "dbeaver-mcp": {'
    Write-Host "      `"command`": `"$Python`","
    Write-Host "      `"args`": [`"$RepoDir\scripts\server.py`"]"
    Write-Host '    }'
    Write-Host '  }'
}

Write-Host ""
Write-Host "=== Instalacao concluida! ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Teste rapido (PowerShell):"
Write-Host "  '{`"jsonrpc`":`"2.0`",`"id`":1,`"method`":`"tools/list`",`"params`":{}}' | $Python $RepoDir\scripts\server.py"
