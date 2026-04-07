#!/usr/bin/env bash
# Submit → poll status + log (không chỉ --wait im lặng) → staple .dmg
#
# Biến môi trường (App Store Connect API — cùng bộ với workflow):
#   APPLE_API_KEY          Key ID
#   APPLE_API_ISSUER       Issuer ID
#   APPLE_API_KEY_PATH     Đường dẫn file .p8
#
# Tham số:
#   $1  (tuỳ chọn) đường dẫn tới file .dmg hoặc .zip đã ký (mặc định: tìm *.dmg dưới src-tauri/target/**/bundle/)
#
# Thoát ≠ 0 nếu Invalid / timeout (mặc định 90 phút).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

for v in APPLE_API_KEY APPLE_API_ISSUER APPLE_API_KEY_PATH; do
  if [ -z "${!v:-}" ]; then
    echo "::error::Thiếu biến môi trường $v"
    exit 1
  fi
done

if [ -n "${1:-}" ]; then
  ARTIFACT="$1"
else
  ARTIFACT="$(find src-tauri/target -type f -path '*/bundle/*/*.dmg' 2>/dev/null | head -1 || true)"
fi

if [ -z "${ARTIFACT:-}" ] || [ ! -f "$ARTIFACT" ]; then
  echo "::error::Không tìm thấy .dmg (truyền \$1 hoặc build Tauri trước)."
  exit 1
fi

echo "::notice::Notarize (submit, không --wait): $ARTIFACT"

NOTARY_ARGS=(--key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER")

# Submit, không chờ — Apple trả id submission
SUBMIT_LOG="${RUNNER_TEMP:-/tmp}/notary-submit.log"
set +e
# Không dùng --wait: lấy submission id rồi poll bên dưới (log rõ hơn khi queue / Invalid).
xcrun notarytool submit "$ARTIFACT" "${NOTARY_ARGS[@]}" --verbose 2>&1 | tee "$SUBMIT_LOG"
SUBMIT_EC=${PIPESTATUS[0]}
set -e
if [ "$SUBMIT_EC" -ne 0 ]; then
  echo "::error::notarytool submit thất bại (exit $SUBMIT_EC)"
  exit "$SUBMIT_EC"
fi

# id: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
SUBMISSION_ID="$(grep -E '^[[:space:]]*id:' "$SUBMIT_LOG" | head -1 | sed -E 's/^[[:space:]]*id:[[:space:]]*//' | tr -d '\r')"
if [ -z "$SUBMISSION_ID" ]; then
  echo "::error::Không parse được submission id từ output submit. Log:"
  cat "$SUBMIT_LOG"
  exit 1
fi

echo "::notice::Submission ID: $SUBMISSION_ID — bắt đầu poll (mỗi 20s, log info + khi Invalid thì log chi tiết)"

MAX_WAIT_SEC="${NOTARY_MAX_WAIT_SEC:-5400}"
START_TS=$(date +%s)

while true; do
  NOW=$(date +%s)
  ELAPSED=$((NOW - START_TS))
  if [ "$ELAPSED" -ge "$MAX_WAIT_SEC" ]; then
    echo "::error::Hết thời gian chờ notarize (${MAX_WAIT_SEC}s)."
    xcrun notarytool info "$SUBMISSION_ID" "${NOTARY_ARGS[@]}" 2>&1 || true
    exit 1
  fi

  echo "----- $(date -u +"%Y-%m-%dT%H:%M:%SZ")  (elapsed ${ELAPSED}s / max ${MAX_WAIT_SEC}s) -----"
  INFO_OUT="${RUNNER_TEMP:-/tmp}/notary-info.txt"
  xcrun notarytool info "$SUBMISSION_ID" "${NOTARY_ARGS[@]}" 2>&1 | tee "$INFO_OUT"

  if grep -qiE 'status:[[:space:]]*Accepted' "$INFO_OUT"; then
    echo "::notice::Notarization Accepted — stapler staple"
    xcrun stapler staple "$ARTIFACT"
    echo "::notice::stapler xong: $ARTIFACT"
    exit 0
  fi

  if grep -qiE 'status:[[:space:]]*Invalid' "$INFO_OUT"; then
    echo "::error::Notarization Invalid — full log:"
    xcrun notarytool log "$SUBMISSION_ID" "${NOTARY_ARGS[@]}" 2>&1 || true
    exit 1
  fi

  sleep 20
done
