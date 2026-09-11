#!/usr/bin/env bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

echo "=================================================="
echo "    Launching Outreach Master Web Engine          "
echo "=================================================="

# Check backend venv
if [ ! -d "$DIR/backend/venv" ]; then
    echo "[!] Creating Python virtual environment in backend/venv..."
    cd "$DIR/backend"
    python3 -m venv venv
    ./venv/bin/pip install -r requirements.txt
fi

# Check frontend node_modules
if [ ! -d "$DIR/frontend/node_modules" ]; then
    echo "[!] Installing frontend npm dependencies..."
    cd "$DIR/frontend"
    npm install
fi

echo "[*] Starting FastAPI Backend on http://127.0.0.1:8000..."
cd "$DIR/backend"
./venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload &
BACKEND_PID=$!

echo "[*] Starting Vite Frontend on http://localhost:5173..."
cd "$DIR/frontend"
npm run dev -- --host &
FRONTEND_PID=$!

cleanup() {
    echo ""
    echo "[*] Shutting down Outreach Master services..."
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

echo ""
echo "Outreach Master is running!"
echo "• Frontend: http://localhost:5173"
echo "• Backend API Docs: http://127.0.0.1:8000/api/docs"
echo "• Demo Login: admin@outreachmaster.com / admin123"
echo ""
echo "Press Ctrl+C to stop both servers."

wait
