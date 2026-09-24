#!/usr/bin/env bash
# ==============================================================================
# JIT Protocol Synthesis Studio - 一鍵啟動腳本 (支援 HF Spaces & --share 公網通道)
# ==============================================================================

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

SHARE_MODE=false
for arg in "$@"; do
  if [ "$arg" == "--share" ]; then
    SHARE_MODE=true
  fi
done

# 1. 智慧檢測執行環境 (Hugging Face Spaces vs Local)
if [ -n "$SPACE_ID" ] || [ -n "$SPACE_HOST" ]; then
  PORT="${PORT:-7860}"
  IS_HF_SPACE=true
else
  PORT="${PORT:-3005}"
  IS_HF_SPACE=false
fi
export PORT

echo "========================================================================"
echo "⚡ 正在啟動 JIT Protocol Synthesis Studio (動態至靜態 API 與 k6 壓測中心)"
echo "========================================================================"

# 2. 檢查 node_modules
if [ ! -d "node_modules" ]; then
  echo "📦 正在安裝專案依賴 (npm install)..."
  npm install
fi

# 3. 檢查 .env
if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    cp .env.example .env
    echo "⚠️  未檢測到 .env，已自動由 .env.example 複製建立。"
  fi
fi

# 4. 檢查 k6 二進制
if [ -f "bin/k6" ]; then
  chmod +x bin/k6
  echo "✅ Grafana k6 壓力測試引擎就緒: $(./bin/k6 version | head -n 1)"
else
  echo "ℹ️  未發現 bin/k6，壓測將自動使用內嵌高並發 Runner。"
fi

# 5. 建立必要目錄
mkdir -p specs generated/typescript generated/python generated/proto TMP .jit

echo ""
echo "🚀 伺服器啟動於: http://localhost:${PORT}"
echo "   - 🌐 瀏覽器開啟: http://localhost:${PORT} (前端視覺化觀測與一鍵壓測控制台)"
echo "   - ⚡ 動態 API 入口: http://localhost:${PORT}/api/jit"

if [ "$IS_HF_SPACE" = true ]; then
  echo "   - ☁️  環境: Hugging Face Spaces (Port: ${PORT})"
  if [ -n "$SPACE_HOST" ]; then
    echo "   - 🌍 公網 Space 網址: https://${SPACE_HOST}"
  fi
  if [ -z "$MASTER_PASSWORD" ]; then
    echo "   - ⚠️  注意: 尚未設定 MASTER_PASSWORD！請至 Space Settings -> Variables and secrets 加入 MASTER_PASSWORD 保護管理操作。"
  else
    echo "   - 🛡️  MASTER_PASSWORD 密碼保護已由 HF Space Secrets 載入。"
  fi
elif [ "$SHARE_MODE" = true ]; then
  echo "   - 🌐 一鍵外網通道: 已啟用 (--share)"
  (
    sleep 3
    if command -v cloudflared &> /dev/null; then
      cloudflared tunnel --url "http://localhost:${PORT}"
    else
      npx -y localtunnel --port "${PORT}"
    fi
  ) &
fi

echo "   - 提示：按 Ctrl+C 可隨時停止服務"
echo "========================================================================"
echo ""

exec npx tsx watch docs/examples/ts_server.ts
