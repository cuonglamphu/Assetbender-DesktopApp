# Tạo base64 một dòng cho GitHub secret APPLE_CERTIFICATE (openssl base64 -A).
# Yêu cầu: OpenSSL — thường có sẵn trong Git for Windows (usr\bin\openssl.exe).
# Chạy:  pwsh -File scripts/encode-p12-for-github.ps1 path\to\cert.p12
# Không mở file .github-b64.txt bằng Notepad để copy — dùng VS Code / gh secret set.

param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string] $P12Path
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path -LiteralPath $P12Path)) {
  Write-Error "File not found: $P12Path"
  exit 1
}

$openssl = $null
foreach ($candidate in @(
    "${env:ProgramFiles}\Git\usr\bin\openssl.exe",
    "${env:ProgramFiles(x86)}\Git\usr\bin\openssl.exe"
  )) {
  if (Test-Path -LiteralPath $candidate) {
    $openssl = $candidate
    break
  }
}
if (-not $openssl) {
  $cmd = Get-Command openssl -ErrorAction SilentlyContinue
  if ($cmd) { $openssl = $cmd.Source }
}
if (-not $openssl) {
  Write-Host "OpenSSL not found. Install Git for Windows, or run: bash scripts/encode-p12-for-github.sh cert.p12" -ForegroundColor Yellow
  exit 1
}

$resolved = (Resolve-Path -LiteralPath $P12Path).Path
$out = [System.IO.Path]::ChangeExtension($resolved, ".github-b64.txt")
if ($out -eq $resolved) { $out = "$resolved.github-b64.txt" }

& $openssl base64 -A -in $resolved -out $out
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "OK: $out" -ForegroundColor Green
Write-Host "Paste the single line into GitHub secret APPLE_CERTIFICATE (use VS Code or gh CLI, not Notepad)."
Write-Host "Or: gh secret set APPLE_CERTIFICATE < `"$out`""
