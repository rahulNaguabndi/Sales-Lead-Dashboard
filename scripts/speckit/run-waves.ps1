<#
.SYNOPSIS
  Unattended, parallel Spec Kit build: one headless Claude session per feature, each in its own git worktree,
  wave by wave, with an automatic integration and gate check after each wave.

.EXAMPLE
  # Everything needed for today's demo (waves 0-3 of the MVP set)
  .\scripts\speckit\run-waves.ps1 -Set mvp

.EXAMPLE
  # Write specs/plans/tasks for ALL features in parallel (docs only, no code), without merging
  .\scripts\speckit\run-waves.ps1 -SpecOnly -AllWavesAtOnce

.EXAMPLE
  # Resume from wave 2 with at most 3 parallel sessions
  .\scripts\speckit\run-waves.ps1 -FromWave 2 -MaxParallel 3
#>
[CmdletBinding()]
param(
  [ValidateSet('full', 'mvp')] [string]$Set = 'full',
  [int]$FromWave = 0,
  [int]$ToWave = 4,
  [string[]]$Only,
  [int]$MaxParallel = 4,
  [double]$BudgetUsd = 25,
  [int]$TimeoutMinutes = 180,
  [ValidateSet('auto', 'acceptEdits', 'dontAsk', 'bypassPermissions')] [string]$PermissionMode = 'auto',
  [string]$Model,
  [switch]$SpecOnly,
  [switch]$AllWavesAtOnce,
  [switch]$SkipIntegrate,
  [switch]$KeepWorktrees,
  [switch]$DryRun
)

# 'Continue' on purpose: in Windows PowerShell 5.1, 'Stop' turns git's normal stderr chatter into terminating errors.
$ErrorActionPreference = 'Continue'

# F20 is left out on purpose: its caching decisions are still pending.
$WaveSets = @{
  full = @{ 0 = 'F01'; 1 = 'F02,F03,F09,F13'; 2 = 'F04,F05,F06,F10'; 3 = 'F07,F08,F11,F12,F14,F15'; 4 = 'F16,F17,F18,F19' }
  mvp  = @{ 0 = 'F01'; 1 = 'F02,F03,F09,F13'; 2 = 'F04,F05,F06,F10'; 3 = 'F12' }
}

$root = (git rev-parse --show-toplevel).Trim()
Set-Location -LiteralPath $root
$wtRoot = Join-Path (Split-Path $root -Parent) 'ld-worktrees'
$logDir = Join-Path $wtRoot 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Write-Step($msg) { Write-Host ("[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $msg) -ForegroundColor Cyan }

function Get-FeatureInfo([string]$id) {
  $file = Get-ChildItem -Path (Join-Path $root 'docs/features') -Filter "$id-*.md" | Select-Object -First 1
  if (-not $file) { throw "No spec file for $id in docs/features" }
  $slug = $file.BaseName.Substring($id.Length + 1)
  $num = '0' + $id.Substring(1)
  [pscustomobject]@{ Id = $id; Slug = $slug; Num = $num; Branch = "$num-$slug"; Worktree = (Join-Path $wtRoot $id) }
}

function Get-ReportStatus([string]$branch) {
  $path = git ls-tree -r --name-only $branch -- specs 2>$null | Where-Object { $_ -like '*/REPORT.md' } | Select-Object -First 1
  if (-not $path) { return 'NO-REPORT' }
  $text = git show "${branch}:$path" 2>$null | Out-String
  if ($text -match 'Status:\s*(DONE|PARTIAL|BLOCKED|SPECCED)') { return $Matches[1] }
  return 'UNKNOWN'
}

function Assert-CleanMain {
  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  if ($branch -ne 'main') { throw "Run from the main branch (currently on '$branch')." }
  if (git status --porcelain) { throw "Working tree has uncommitted changes. Commit or stash them first." }
}

function Build-ClaudeArgs([double]$budget) {
  $a = @('--permission-mode', $PermissionMode, '--output-format', 'stream-json', '--verbose', '--max-budget-usd', "$budget")
  if ($Model) { $a += @('--model', $Model) }
  return $a
}

function Prepare-Worktree($f) {
  $branchExists = [bool](git branch --list $f.Branch)
  if (Test-Path -LiteralPath $f.Worktree) {
    Write-Step "$($f.Id): reusing worktree"
  } elseif ($branchExists) {
    git worktree add $f.Worktree $f.Branch | Out-Null
  } else {
    git worktree add -b $f.Branch $f.Worktree main | Out-Null
  }
  # Bring in the previous waves' merged code (and any spec-only commits on main).
  git -C $f.Worktree merge main --no-edit -q 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { git -C $f.Worktree merge --abort 2>$null; Write-Warning "$($f.Id): could not merge main into branch; the session will start from the branch as-is." }
  $envFile = Join-Path $root '.env'
  if (Test-Path -LiteralPath $envFile) { Copy-Item -LiteralPath $envFile -Destination (Join-Path $f.Worktree '.env') -Force }
}

function Invoke-Wave([int]$wave, [string[]]$ids) {
  $features = $ids | ForEach-Object { Get-FeatureInfo $_ }
  Write-Step "Wave $wave -> $($ids -join ', ')"

  $queue = New-Object System.Collections.Queue
  $i = 0
  foreach ($f in $features) {
    $status = if (git branch --list $f.Branch) { Get-ReportStatus $f.Branch } else { 'NEW' }
    if ($status -eq 'DONE' -and -not $SpecOnly) { Write-Step "$($f.Id): already DONE, skipping"; continue }
    $i++
    $f | Add-Member -NotePropertyName Slot -NotePropertyValue $i
    $queue.Enqueue($f)
  }

  $running = @{}
  while ($queue.Count -gt 0 -or $running.Count -gt 0) {
    while ($queue.Count -gt 0 -and $running.Count -lt $MaxParallel) {
      $f = $queue.Dequeue()
      $budget = if ($f.Id -eq 'F01') { $BudgetUsd * 2 } else { $BudgetUsd }
      $mode = if ($SpecOnly) { ' spec-only' } else { '' }
      $prompt = "Invoke the build-feature skill with arguments: $($f.Id)$mode. Work fully autonomously, never ask questions, and end with the one-line status message."
      $port = 3100 + ($f.Slot * 10)
      $envs = @{ PORT = "$port"; SHOWROOM_PORT = "$($port + 1)"; REDIS_URL = "redis://localhost:6379/$($f.Slot)"; CI = '1' }
      $log = Join-Path $logDir "$($f.Id).jsonl"
      $cargs = Build-ClaudeArgs $budget

      if ($DryRun) {
        Write-Host "  DRY: [$($f.Worktree)] claude -p `"$prompt`" $($cargs -join ' ')  (PORT=$port)"
        continue
      }
      Prepare-Worktree $f
      Write-Step "$($f.Id): started (PORT=$port, log: $log)"
      $job = Start-Job -Name $f.Id -ArgumentList $f.Worktree, $prompt, $cargs, $envs, $log -ScriptBlock {
        param($wt, $prompt, $cargs, $envs, $log)
        Set-Location -LiteralPath $wt
        foreach ($k in $envs.Keys) { Set-Item -Path "Env:$k" -Value $envs[$k] }
        & claude -p $prompt @cargs 2>&1 | ForEach-Object { "$_" } | Out-File -FilePath $log -Encoding utf8
      }
      $running[$f.Id] = [pscustomobject]@{ Job = $job; Feature = $f; Started = Get-Date }
    }
    if ($DryRun) { break }
    if ($running.Count -eq 0) { continue }

    Wait-Job -Job ($running.Values | ForEach-Object { $_.Job }) -Any -Timeout 30 | Out-Null
    foreach ($key in @($running.Keys)) {
      $r = $running[$key]
      $elapsed = (Get-Date) - $r.Started
      if ($r.Job.State -in 'Completed', 'Failed', 'Stopped') {
        Write-Step ("{0}: finished ({1}) in {2:n0} min -> {3}" -f $key, $r.Job.State, $elapsed.TotalMinutes, (Get-ReportStatus $r.Feature.Branch))
        Remove-Job -Job $r.Job -Force
        $running.Remove($key)
      } elseif ($elapsed.TotalMinutes -gt $TimeoutMinutes) {
        Write-Warning "${key}: exceeded $TimeoutMinutes min; stopping (committed work is kept on branch $($r.Feature.Branch))"
        Stop-Job -Job $r.Job; Remove-Job -Job $r.Job -Force
        $running.Remove($key)
      }
    }
  }
  if ($DryRun) { return $true }

  $summary = $features | ForEach-Object { [pscustomobject]@{ Feature = $_.Id; Branch = $_.Branch; Status = (Get-ReportStatus $_.Branch) } }
  $summary | Format-Table -AutoSize | Out-String | Write-Host

  if ($SpecOnly -or $SkipIntegrate) { return $true }

  $mergeable = $summary | Where-Object { $_.Status -in 'DONE', 'PARTIAL' } | ForEach-Object { $_.Branch }
  if (-not $mergeable) { Write-Warning "Wave ${wave}: nothing mergeable. Stopping."; return $false }

  Write-Step "Wave ${wave}: integrating $($mergeable -join ', ')"
  $ilog = Join-Path $logDir "wave-$wave-integrate.jsonl"
  $iprompt = "Invoke the integrate-wave skill with arguments: $wave $($mergeable -join ' '). Work fully autonomously and end with the one-line result message."
  $iargs = Build-ClaudeArgs ($BudgetUsd)
  & claude -p $iprompt @iargs 2>&1 | ForEach-Object { "$_" } | Out-File -FilePath $ilog -Encoding utf8

  if (-not (git tag --list "wave-$wave-done")) {
    Write-Warning "Wave $wave gate NOT passed. See docs/speckit/runs/wave-$wave.md and $ilog. Stopping."
    return $false
  }
  Write-Step "Wave ${wave}: PASSED (tag wave-$wave-done)"
  if (-not $KeepWorktrees) {
    foreach ($f in $features) {
      if (Test-Path -LiteralPath $f.Worktree) {
        git worktree remove $f.Worktree 2>$null
        if ($LASTEXITCODE -ne 0) { Write-Warning "Left worktree $($f.Worktree) in place (it has untracked files)." }
      }
    }
  }
  return $true
}

# ---- main ----
if (-not $DryRun) { Assert-CleanMain }
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) { throw "claude CLI not found on PATH." }
if ($env:ANTHROPIC_API_KEY) { Write-Warning "ANTHROPIC_API_KEY is set in this shell: Claude Code sessions will bill that API key. Put the app's key in .env instead if that's not intended." }
if ((Test-Path (Join-Path $root 'docker-compose.yml')) -and -not $DryRun) { docker compose up -d redis 2>$null | Out-Null }

$waves = $WaveSets[$Set]
$selected = @()
foreach ($w in ($waves.Keys | Sort-Object)) {
  if ($w -lt $FromWave -or $w -gt $ToWave) { continue }
  $ids = @($waves[$w].Split(',') | Where-Object { -not $Only -or $Only -contains $_ })
  if ($ids) { $selected += , @($w, $ids) }
}

if ($AllWavesAtOnce) {
  if (-not $SpecOnly) { throw "-AllWavesAtOnce is only safe with -SpecOnly (implementation must follow wave order)." }
  $all = $selected | ForEach-Object { $_[1] } | ForEach-Object { $_ }
  Invoke-Wave -wave -1 -ids $all | Out-Null
} else {
  foreach ($pair in $selected) {
    $ok = Invoke-Wave -wave $pair[0] -ids $pair[1]
    if (-not $ok) { exit 1 }
    if (-not $DryRun -and -not $SpecOnly) { docker compose up -d redis 2>$null | Out-Null }
  }
}
Write-Step "All requested waves finished."
