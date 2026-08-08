[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[0-9A-Fa-f]{40}$')]
  [string] $CommitSha,

  [Parameter(Mandatory = $true)]
  [string] $OutputPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$serviceRoot = Split-Path -Parent $PSScriptRoot
$servicesRoot = Split-Path -Parent $serviceRoot
$repoRoot = Split-Path -Parent $servicesRoot
$outputFullPath = if ([System.IO.Path]::IsPathRooted($OutputPath)) {
  [System.IO.Path]::GetFullPath($OutputPath)
} else {
  [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $OutputPath))
}
$outputDirectory = Split-Path -Parent $outputFullPath
$stagingRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("shorevest-recruitment-" + [guid]::NewGuid().ToString('N'))
$serviceStagingRoot = Join-Path $stagingRoot 'services/recruitment-functions'

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Command,

    [string[]] $Arguments = @()
  )

  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Command failed with exit code $LASTEXITCODE"
  }
}

function Copy-DirectoryContents {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Source,

    [Parameter(Mandatory = $true)]
    [string] $Destination
  )

  if (-not (Test-Path -LiteralPath $Source -PathType Container)) {
    throw "Required directory is missing: $Source"
  }
  New-Item -ItemType Directory -Path $Destination -Force | Out-Null
  Copy-Item -Path (Join-Path $Source '*') -Destination $Destination -Recurse -Force
}

function Get-PayloadDigest {
  param([Parameter(Mandatory = $true)][string] $Root)

  $lines = Get-ChildItem -LiteralPath $Root -Recurse -File |
    Where-Object { $_.Name -ne 'deployment-metadata.json' } |
    Sort-Object FullName |
    ForEach-Object {
      $relative = [System.IO.Path]::GetRelativePath($Root, $_.FullName).Replace('\', '/')
      $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
      "$relative`n$hash"
    }

  $material = [System.Text.Encoding]::UTF8.GetBytes(($lines -join "`n"))
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    return ([System.BitConverter]::ToString($sha.ComputeHash($material))).Replace('-', '').ToLowerInvariant()
  } finally {
    $sha.Dispose()
  }
}

try {
  $servicePackagePath = Join-Path $serviceRoot 'package.json'
  $serviceLockPath = Join-Path $serviceRoot 'package-lock.json'
  $hostPath = Join-Path $serviceRoot 'host.json'

  if (-not (Test-Path -LiteralPath $serviceLockPath -PathType Leaf)) {
    throw 'The recruitment Functions package lock is required for an immutable build.'
  }
  if (-not (Test-Path -LiteralPath $servicePackagePath -PathType Leaf)) {
    throw 'The recruitment Functions package manifest is required.'
  }
  if (-not (Test-Path -LiteralPath $hostPath -PathType Leaf)) {
    throw 'The recruitment Functions host.json is required.'
  }

  Push-Location $serviceRoot
  try {
    Invoke-CheckedCommand -Command 'npm' -Arguments @('ci', '--omit=dev', '--no-audit', '--no-fund')
  } finally {
    Pop-Location
  }

  New-Item -ItemType Directory -Path $stagingRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $serviceStagingRoot -Force | Out-Null

  Copy-Item -LiteralPath $hostPath -Destination (Join-Path $stagingRoot 'host.json') -Force
  Copy-Item -LiteralPath $servicePackagePath -Destination (Join-Path $serviceStagingRoot 'package.json') -Force
  Copy-Item -LiteralPath $serviceLockPath -Destination (Join-Path $serviceStagingRoot 'package-lock.json') -Force

  $deploymentPackage = Get-Content -LiteralPath $servicePackagePath -Raw | ConvertFrom-Json
  $deploymentPackage.main = 'services/recruitment-functions/src/functions/index.js'
  [System.IO.File]::WriteAllText(
    (Join-Path $stagingRoot 'package.json'),
    (($deploymentPackage | ConvertTo-Json -Depth 20) + "`n"),
    [System.Text.UTF8Encoding]::new($false)
  )

  Copy-DirectoryContents -Source (Join-Path $serviceRoot 'src') -Destination (Join-Path $serviceStagingRoot 'src')
  Copy-DirectoryContents -Source (Join-Path $serviceRoot 'node_modules') -Destination (Join-Path $serviceStagingRoot 'node_modules')
  Copy-DirectoryContents -Source (Join-Path $repoRoot 'api/recruitment/core') -Destination (Join-Path $stagingRoot 'api/recruitment/core')
  Copy-DirectoryContents -Source (Join-Path $repoRoot 'assets/data/recruitment') -Destination (Join-Path $stagingRoot 'assets/data/recruitment')

  $forbidden = Get-ChildItem -LiteralPath $stagingRoot -Recurse -File | Where-Object {
    $_.Name -like 'local.settings*' -or
    $_.Name -like '.env*' -or
    $_.Extension -in @('.pem', '.key', '.pfx', '.p12', '.cer', '.crt', '.zip', '.tar', '.tgz', '.gz')
  }
  if ($forbidden) {
    $relativeForbidden = $forbidden | ForEach-Object {
      [System.IO.Path]::GetRelativePath($stagingRoot, $_.FullName).Replace('\', '/')
    }
    throw "Forbidden files found in deployment staging: $($relativeForbidden -join ', ')"
  }

  foreach ($ownedRuntimeRoot in @(
    (Join-Path $serviceStagingRoot 'src'),
    (Join-Path $stagingRoot 'api/recruitment/core')
  )) {
    Get-ChildItem -LiteralPath $ownedRuntimeRoot -Recurse -Filter '*.js' -File | ForEach-Object {
      Invoke-CheckedCommand -Command 'node' -Arguments @('--check', $_.FullName)
    }
  }

  Push-Location $stagingRoot
  try {
    Invoke-CheckedCommand -Command 'node' -Arguments @(
      '-e',
      "require('./services/recruitment-functions/src/appFactory.js'); require('./services/recruitment-functions/src/lib/eventGrid.js');"
    )
  } finally {
    Pop-Location
  }

  $metadata = [ordered]@{
    sourceCommit = $CommitSha.ToLowerInvariant()
    packagedAtUtc = [DateTime]::UtcNow.ToString('o')
    payloadSha256 = Get-PayloadDigest -Root $stagingRoot
    payloadSha256Scope = 'staged-files-excluding-deployment-metadata'
    archiveSha256Sidecar = ([System.IO.Path]::GetFileName($outputFullPath) + '.sha256')
  }
  $metadataPath = Join-Path $stagingRoot 'deployment-metadata.json'
  [System.IO.File]::WriteAllText(
    $metadataPath,
    (($metadata | ConvertTo-Json -Depth 4) + "`n"),
    [System.Text.UTF8Encoding]::new($false)
  )

  New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
  if (Test-Path -LiteralPath $outputFullPath) {
    Remove-Item -LiteralPath $outputFullPath -Force
  }
  Compress-Archive -Path (Join-Path $stagingRoot '*') -DestinationPath $outputFullPath -CompressionLevel Optimal

  $archiveHash = (Get-FileHash -LiteralPath $outputFullPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $sidecarPath = "$outputFullPath.sha256"
  [System.IO.File]::WriteAllText(
    $sidecarPath,
    "$archiveHash  $([System.IO.Path]::GetFileName($outputFullPath))`n",
    [System.Text.UTF8Encoding]::new($false)
  )

  Write-Output "Created $outputFullPath"
  Write-Output "SHA-256 $archiveHash"
  Write-Output "Digest sidecar $sidecarPath"

  # The deploy job runs this script after Azure login. Capture the latest Azure
  # deployment log without attempting another deployment so a failed publish
  # leaves actionable evidence in the repository status artifact.
  if ($env:AZURE_RESOURCE_GROUP -and $env:FUNCTION_APP) {
    $diagnosticPath = Join-Path $repoRoot 'recruitment-capture-live-health.json'
    try {
      $previousErrorPreference = $ErrorActionPreference
      $ErrorActionPreference = 'Continue'
      $deploymentLogOutput = & az functionapp log deployment show `
        --resource-group $env:AZURE_RESOURCE_GROUP `
        --name $env:FUNCTION_APP `
        --output json 2>&1
      $deploymentLogExitCode = $LASTEXITCODE
      $ErrorActionPreference = $previousErrorPreference
      $diagnostic = [ordered]@{
        diagnosticType = 'azure-function-deployment-log'
        capturedAtUtc = [DateTime]::UtcNow.ToString('o')
        sourceCommit = $CommitSha.ToLowerInvariant()
        commandExitCode = $deploymentLogExitCode
        deploymentLog = ($deploymentLogOutput -join "`n")
      }
      [System.IO.File]::WriteAllText(
        $diagnosticPath,
        (($diagnostic | ConvertTo-Json -Depth 20) + "`n"),
        [System.Text.UTF8Encoding]::new($false)
      )
    } catch {
      $diagnostic = [ordered]@{
        diagnosticType = 'azure-function-deployment-log'
        capturedAtUtc = [DateTime]::UtcNow.ToString('o')
        sourceCommit = $CommitSha.ToLowerInvariant()
        commandExitCode = -1
        deploymentLog = "Unable to read Azure deployment log: $($_.Exception.Message)"
      }
      [System.IO.File]::WriteAllText(
        $diagnosticPath,
        (($diagnostic | ConvertTo-Json -Depth 20) + "`n"),
        [System.Text.UTF8Encoding]::new($false)
      )
    }
  }
} finally {
  if (Test-Path -LiteralPath $stagingRoot) {
    Remove-Item -LiteralPath $stagingRoot -Recurse -Force
  }
}
