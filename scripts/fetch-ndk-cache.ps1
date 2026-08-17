param(
  [Parameter(Mandatory = $true)]
  [string]$OutFile
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($env:GH_TOKEN)) {
  throw 'GH_TOKEN is not available to download the private NDK cache.'
}

$repo = $env:GITHUB_REPOSITORY
if ([string]::IsNullOrWhiteSpace($repo)) {
  $repo = 'miladmahmoudinia-prog/Aparatchi-Mobile'
}

$tag = 'android-toolchain-cache'
$assetName = 'android-ndk-r27b-windows.zip'
$apiBase = "https://api.github.com/repos/$repo"
$headers = @{
  Authorization = "Bearer $($env:GH_TOKEN)"
  Accept = 'application/vnd.github+json'
  'X-GitHub-Api-Version' = '2022-11-28'
  'User-Agent' = 'Aparatchi-SelfHosted-Runner'
}

$release = Invoke-RestMethod -Headers $headers -Uri "$apiBase/releases/tags/$tag" -Method Get
$asset = $release.assets | Where-Object { $_.name -eq $assetName } | Select-Object -First 1
if (-not $asset) {
  throw "Release asset $assetName was not found on tag $tag."
}

$assetHeaders = @{
  Authorization = "Bearer $($env:GH_TOKEN)"
  Accept = 'application/octet-stream'
  'X-GitHub-Api-Version' = '2022-11-28'
  'User-Agent' = 'Aparatchi-SelfHosted-Runner'
}

$parent = Split-Path -Parent $OutFile
if ($parent -and -not (Test-Path $parent)) {
  New-Item -ItemType Directory -Force -Path $parent | Out-Null
}

Invoke-WebRequest -Headers $assetHeaders -Uri "$apiBase/releases/assets/$($asset.id)" -OutFile $OutFile -MaximumRedirection 10
Write-Host "Downloaded cached NDK asset to $OutFile"
