$ErrorActionPreference = "Stop"

function Require-Command([string]$Name, [string]$Help) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name was not found. $Help"
  }
}

Require-Command "node" "Install Node.js 22 or newer."
Require-Command "pnpm" "Install it with: npm install -g pnpm"
Require-Command "codex" "Open Codex once and complete sign-in before analyzing notes."

$nodeMajor = [int]((& node --version).TrimStart("v").Split(".")[0])
if ($nodeMajor -lt 22) {
  throw "Staff Chief requires Node.js 22 or newer."
}

$projectDirectory = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectDirectory

if (-not (Test-Path -LiteralPath (Join-Path $projectDirectory "node_modules"))) {
  & pnpm install
  if ($LASTEXITCODE -ne 0) { throw "Failed to install dependencies." }
}

if (-not (Test-Path -LiteralPath (Join-Path $projectDirectory ".next\BUILD_ID"))) {
  & pnpm build
  if ($LASTEXITCODE -ne 0) { throw "Failed to build the application." }
}

Start-Process "http://127.0.0.1:3000"
& pnpm start
