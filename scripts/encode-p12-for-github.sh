#!/usr/bin/env bash
# Tạo base64 một dòng cho GitHub secret APPLE_CERTIFICATE (openssl base64 -A).
# Chạy: Git Bash, WSL, hoặc macOS — không dùng Notepad lưu rồi copy (BOM/CRLF).
set -euo pipefail
if [ "${1:-}" = "" ] || [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
  echo "Usage: $0 path/to/certificate.p12"
  echo "Output:  <name>.github-b64.txt (one line, UTF-8 ASCII — paste into secret APPLE_CERTIFICATE)"
  exit 0
fi
P12="$1"
if [ ! -f "$P12" ]; then
  echo "File not found: $P12" >&2
  exit 1
fi
OUT="${P12%.p12}.github-b64.txt"
openssl base64 -A -in "$P12" -out "$OUT"
echo "OK: $OUT"
echo "Next: paste the single line into GitHub → Settings → Secrets → APPLE_CERTIFICATE"
echo "Or:   gh secret set APPLE_CERTIFICATE < \"$OUT\""
