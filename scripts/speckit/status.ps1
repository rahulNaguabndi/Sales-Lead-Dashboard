<#
.SYNOPSIS
  Progress snapshot of an unattended run-waves.ps1 build. Safe to run from any terminal at any time.
.EXAMPLE
  .\scripts\speckit\status.ps1          # one snapshot
  .\scripts\speckit\status.ps1 -Watch   # refresh every 20 s
#>
param([switch]$Watch, [int]$Seconds = 20)

$root = (git rev-parse --show-toplevel).Trim()
$logDir = Join-Path (Split-Path $root -Parent) 'ld-worktrees\logs'

function Get-LastActivity([string]$log) {
  $lines = @(Get-Content -LiteralPath $log -Tail 80 -ErrorAction SilentlyContinue)
  [array]::Reverse($lines)
  foreach ($l in $lines) {
    try { $e = $l | ConvertFrom-Json } catch { continue }
    if ($e.type -eq 'result') {
      return ("FINISHED ({0}) cost `${1:n2}: {2}" -f $e.subtype, $e.total_cost_usd, ("$($e.result)" -split "`n")[-1])
    }
    if ($e.type -eq 'assistant' -and $e.message.content) {
      foreach ($c in $e.message.content) {
        if ($c.type -eq 'tool_use') {
          $detail = if ($c.input.skill) { $c.input.skill } elseif ($c.input.command) { $c.input.command } elseif ($c.input.file_path) { Split-Path $c.input.file_path -Leaf } else { '' }
          return "tool: $($c.name) $detail"
        }
        if ($c.type -eq 'text' -and $c.text) { return "says: " + ($c.text -replace '\s+', ' ').Substring(0, [Math]::Min(100, $c.text.Length)) }
      }
    }
  }
  return '(starting…)'
}

do {
  if ($Watch) { Clear-Host }
  Write-Host ("EuroDrive build status @ {0}" -f (Get-Date -Format 'HH:mm:ss')) -ForegroundColor Cyan
  if (-not (Test-Path $logDir)) { Write-Host "No runs yet ($logDir not found)."; break }
  $rows = foreach ($log in Get-ChildItem -LiteralPath $logDir -Filter '*.jsonl' | Sort-Object Name) {
    $id = $log.BaseName
    $branch = git branch --list "0$($id.Substring(1))-*" 2>$null | ForEach-Object { $_.Trim(' ', '*', '+') } | Select-Object -First 1
    $ahead = if ($branch) { (git rev-list --count "main..$branch" 2>$null) } else { '-' }
    [pscustomobject]@{
      Item    = $id
      Commits = $ahead
      Idle    = ('{0:n0}m' -f ((Get-Date) - $log.LastWriteTime).TotalMinutes)
      Last    = Get-LastActivity $log.FullName
    }
  }
  $rows | Format-Table -AutoSize -Wrap
  Write-Host "Tags: $((git tag --list 'wave-*-done') -join ', ')"
  if ($Watch) { Start-Sleep -Seconds $Seconds }
} while ($Watch)
