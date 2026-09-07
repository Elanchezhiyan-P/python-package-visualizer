<#
.SYNOPSIS
  Full build pipeline for Python Package Visualizer.
  Runs: lint -> type-check -> build -> package -> install.

.DESCRIPTION
  Executes all compilation steps in sequence, stopping on the first failure.
  After packaging, installs the VSIX (with --force to overwrite).
  Run from the project root: .\scripts\build-all.ps1
#>

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot

# Native CLIs (cursor/code) may write Node deprecation warnings to stderr even on success.
# With $ErrorActionPreference = 'Stop', PowerShell treats that as a terminating error.
function Invoke-EditorCli {
  param(
    [Parameter(Mandatory)]
    [string] $EditorCmd,
    [Parameter(ValueFromRemainingArguments)]
    [string[]] $CliArgs
  )
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = & $EditorCmd @CliArgs 2>&1
    return @{ Output = $output; ExitCode = $LASTEXITCODE }
  } finally {
    $ErrorActionPreference = $prevEap
  }
}

Push-Location $projectRoot

# Read extension metadata from package.json
$pkgJson = Get-Content -Raw -Path 'package.json' | ConvertFrom-Json
$extName = $pkgJson.name
$extVersion = $pkgJson.version
$extPublisher = $pkgJson.publisher
$extId = "$extPublisher.$extName"
$vsixFile = "$extName-$extVersion.vsix"

$steps = @(
  @{ Name = 'Lint'; Cmd = 'npm run lint' },
  @{ Name = 'Type Check'; Cmd = 'npx tsc --noEmit' },
  @{ Name = 'Build'; Cmd = 'npm run build' },
  @{ Name = 'Package VSIX'; Cmd = 'vsce package' }
)

$total = $steps.Count + 1  # +1 for Install step
$stepNum = 0
$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Python Package Visualizer - Full Build" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$failed = $false

# ── Build steps ──────────────────────────────────────────────────────────
for ($i = 0; $i -lt $steps.Count; $i++) {
  $step = $steps[$i]
  $stepNum = $i + 1
  Write-Host "[$stepNum/$total] $($step.Name)..." -ForegroundColor Yellow

  $stepTimer = [System.Diagnostics.Stopwatch]::StartNew()
  Invoke-Expression $step.Cmd
  $exitCode = $LASTEXITCODE
  $stepTimer.Stop()

  if ($exitCode -ne 0) {
    Write-Host "`n  X $($step.Name) FAILED (exit code $exitCode)" -ForegroundColor Red
    Write-Host "  Pipeline stopped.`n" -ForegroundColor Red
    $failed = $true
    break
  }

  Write-Host "  OK $($step.Name) passed ($([math]::Round($stepTimer.Elapsed.TotalSeconds, 1))s)`n" -ForegroundColor Green
}

# ── Install VSIX ─────────────────────────────────────────────────────────
if (-not $failed) {
  $stepNum = $steps.Count + 1
  Write-Host "[$stepNum/$total] Install VSIX..." -ForegroundColor Yellow

  $stepTimer = [System.Diagnostics.Stopwatch]::StartNew()

  if (-not (Test-Path $vsixFile)) {
    Write-Host "  X VSIX file not found: $vsixFile" -ForegroundColor Red
    $failed = $true
  }
  else {
    # WHY: --force overwrites the existing version without needing uninstall first.
    # This is more reliable than uninstall+install, which can fail silently
    # when the extension is currently loaded by VS Code.
    # Prefer Cursor CLI when available (this project targets Cursor), fall back to VS Code.
    $editorCmd = if (Get-Command cursor -ErrorAction SilentlyContinue) { 'cursor' } else { 'code' }
    Write-Host "  Installing $vsixFile via $editorCmd (--force)..." -ForegroundColor DarkGray
    $installResult = Invoke-EditorCli -EditorCmd $editorCmd --install-extension $vsixFile --force
    $installOutput = $installResult.Output
    $exitCode = $installResult.ExitCode
    $stepTimer.Stop()

    # Show the raw output from the editor CLI for transparency
    foreach ($line in $installOutput) {
      Write-Host "  $line" -ForegroundColor DarkGray
    }

    if ($exitCode -ne 0) {
      Write-Host "  X Install FAILED (exit code $exitCode)" -ForegroundColor Red
      $failed = $true
    }
    else {
      # Verify the install by checking the installed extensions list
      $listResult = Invoke-EditorCli -EditorCmd $editorCmd --list-extensions --show-versions
      $installedRaw = $listResult.Output
      $match = $installedRaw | Select-String -Pattern "$extId@" -SimpleMatch
      if ($match) {
        $installedVersion = ($match -split '@')[1]
        if ($installedVersion -eq $extVersion) {
          Write-Host "  OK Verified: $extId@$installedVersion" -ForegroundColor Green
        }
        else {
          Write-Host "  ! Installed version is $installedVersion, expected $extVersion" -ForegroundColor Yellow
          Write-Host "  ! $editorCmd may need a restart to pick up the new version." -ForegroundColor Yellow
        }
      }
      else {
        Write-Host "  ! Could not verify installation. Extension not found in list." -ForegroundColor Yellow
      }
      Write-Host "  OK Install passed ($([math]::Round($stepTimer.Elapsed.TotalSeconds, 1))s)`n" -ForegroundColor Green
    }
  }
}


$stopwatch.Stop()

if (-not $failed) {
  Write-Host "========================================" -ForegroundColor Cyan
  Write-Host "  All steps completed in $([math]::Round($stopwatch.Elapsed.TotalSeconds, 1))s" -ForegroundColor Green
  Write-Host "========================================`n" -ForegroundColor Cyan
}

Pop-Location

if ($failed) { exit $exitCode }
