#!/usr/bin/env bash
# ==============================================================================
# JIT Protocol Synthesis Studio - 一鍵啟動腳本
# ==============================================================================

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

PORT="${PORT:-3005}"

echo "========================================================================"
echo "⚡ 正在啟動 JIT Protocol Synthesis Studio (動態至靜態 API 與 k6 壓測中心)"
echo "========================================================================"

# 1. 檢查 node_modules
if [ ! -d "node_modules" ]; then
  echo "📦 正在安裝專案依賴 (npm install)..."
  npm install
fi

# 2. 檢查 .env
if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    cp .env.example .env
    echo "⚠️  未檢測到 .env，已自動由 .env.example 複製建立。"
  fi
fi

# 3. 檢查 k6 二進制
if [ -f "bin/k6" ]; then
  chmod +x bin/k6
  echo "✅ Grafana k6 壓力測試引擎就緒: $(./bin/k6 version | head -n 1)"
else
  echo "ℹ️  未發現 bin/k6，壓測將自動使用內嵌高並發 Runner。"
fi

# 4. 建立必要目錄
mkdir -p specs generated/typescript generated/python generated/proto TMP

echo ""
echo "🚀 伺服器啟動於: http://localhost:${PORT}"
echo "   - 🌐 瀏覽器開啟: http://localhost:${PORT} (前端視覺化觀測與一鍵壓測控制台)"
echo "   - ⚡ 動態 API 入口: http://localhost:${PORT}/api/jit"
echo "   - 提示：按 Ctrl+C 可隨時停止服務"
echo "========================================================================"
echo ""

exec npx tsx docs/examples/ts_server.ts
