# Patch coverage gate: changed src/ files must meet line threshold after unit test run.
param(
  [string]$BaseRef = "origin/main"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

npm run test:coverage
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npx c8 check-coverage --config c8.json
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

node scripts/check-patch-coverage.mjs $BaseRef
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Coverage checks passed (global floor + patch gate)."
