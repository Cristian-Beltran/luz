#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PIDS=()

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM

  if ((${#PIDS[@]})); then
    echo
    echo "Cerrando servidores..."
    kill "${PIDS[@]}" 2>/dev/null || true
    wait "${PIDS[@]}" 2>/dev/null || true
  fi

  exit "$exit_code"
}

start_service() {
  local name="$1"
  local directory="$2"
  shift 2

  (
    cd "$ROOT_DIR/$directory"
    echo "[$name] iniciando en $directory"
    exec "$@"
  ) &

  PIDS+=("$!")
}

trap cleanup EXIT INT TERM

start_service "backend" "hemodialisis-luz-backend" npm run start:dev
start_service "frontend" "hemodialisis-luz-frontend" npm run dev -- --host 0.0.0.0

LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"

echo
echo "Backend y frontend iniciados. Presiona Ctrl+C para cerrar ambos."
if [[ -n "${LAN_IP:-}" ]]; then
  echo "Frontend LAN: http://$LAN_IP:5173"
  echo "Vista publica MQTT: http://$LAN_IP:5173/public/monitoring"
  echo "Backend LAN: http://$LAN_IP:3000"
fi

set +e
wait -n "${PIDS[@]}"
status=$?
set -e

echo
echo "Uno de los servidores se detuvo; cerrando el resto."
exit "$status"
