$ErrorActionPreference = "Stop"

$projectDirectory = Split-Path -Parent $PSScriptRoot
$dataDirectory = Join-Path $projectDirectory ".local-data\ai-test"
$databasePath = Join-Path $dataDirectory "staff-chief.db"

Set-Location $projectDirectory

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js 22 or newer is required."
}

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  throw "pnpm is required."
}

if (-not (Test-Path -LiteralPath $databasePath)) {
  Write-Host "Creating the isolated AI test dataset..."
  & pnpm seed:ai
  if ($LASTEXITCODE -ne 0) {
    throw "The AI test dataset could not be created."
  }
}

$env:STAFF_CHIEF_DATA_DIR = $dataDirectory

Write-Host "Starting Staff Chief with isolated AI test data at http://127.0.0.1:3000"
Write-Host "Personal Staff Chief data will not be used by this process."
Start-Process "http://127.0.0.1:3000"
& pnpm dev
