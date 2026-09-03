$ErrorActionPreference = "Stop"

function Require-Command([string]$Name, [string]$Help) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name não foi encontrado. $Help"
  }
}

Require-Command "node" "Instale o Node.js 22 ou superior."
Require-Command "pnpm" "Instale com: npm install -g pnpm"
Require-Command "codex" "Abra o Codex uma vez e conclua o login antes de analisar notas."

$nodeMajor = [int]((& node --version).TrimStart("v").Split(".")[0])
if ($nodeMajor -lt 22) {
  throw "O Staff Chief requer Node.js 22 ou superior."
}

$projectDirectory = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectDirectory

if (-not (Test-Path -LiteralPath (Join-Path $projectDirectory "node_modules"))) {
  & pnpm install
  if ($LASTEXITCODE -ne 0) { throw "Falha ao instalar dependências." }
}

if (-not (Test-Path -LiteralPath (Join-Path $projectDirectory ".next\BUILD_ID"))) {
  & pnpm build
  if ($LASTEXITCODE -ne 0) { throw "Falha ao preparar o aplicativo." }
}

Start-Process "http://127.0.0.1:3000"
& pnpm start
