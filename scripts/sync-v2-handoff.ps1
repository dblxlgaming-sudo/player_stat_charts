param(
  [Parameter(Mandatory=$true)][string]$SourceCsv
)
$ErrorActionPreference='Stop'
$source=(Resolve-Path -LiteralPath $SourceCsv).Path
$repo=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$targetDir=Join-Path $repo 'data'
$target=Join-Path $targetDir 'player-stat-v2.csv'
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
Copy-Item -LiteralPath $source -Destination $target -Force
Write-Output $target
