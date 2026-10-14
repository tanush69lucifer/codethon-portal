#!/usr/bin/env bash
# One-shot deploy on a fresh Ubuntu 22.04/24.04 VM (x86_64 or ARM64).
#   git clone <your repo> codethon && cd codethon
#   cp .env.example .env && nano .env        # fill JWT_SECRET, ADMIN_*, PUBLIC_URL, DOMAIN
#   bash scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER" || true
fi

[ -f .env ] || { echo "Create .env first (cp .env.example .env)"; exit 1; }
grep -q '^JWT_SECRET=change-me' .env && { echo "Set a real JWT_SECRET in .env"; exit 1; }

echo "Building Java sandbox image..."
sudo docker build -t codethon-java-runner:latest ./judge

echo "Sandbox self-test (must print 3)..."
printf 'public class Main{public static void main(String[] a){System.out.println(1+2);}}' > /tmp/Main.java
mkdir -p /tmp/jt/tests && cp /tmp/Main.java /tmp/jt/ && echo "" > /tmp/jt/tests/1.in
tar -C /tmp/jt -cf - . | sudo docker run --rm -i --network none --read-only --tmpfs /tmp:rw,nosuid,size=256m \
  --cap-drop ALL --security-opt no-new-privileges --memory 768m --cpus 1 --pids-limit 160 \
  -e N_TESTS=1 codethon-java-runner:latest | tar -xOf - ./1.out
rm -rf /tmp/jt /tmp/Main.java

echo "Starting stack..."
sudo docker compose up -d --build
sudo docker compose ps
echo "Done. Open https://$(grep '^DOMAIN=' .env | cut -d= -f2) and log in as ADMIN_EMAIL."
