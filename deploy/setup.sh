#!/bin/bash
# Rocky Linux 8 + Apache + Docker
# 서버에서:  cd /var/www/html/tv && sudo bash deploy/setup.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[1/6] 프로젝트 경로: $ROOT"
echo "       권장 경로: /var/www/html/tv"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "[2/6] .env 를 새로 만들었습니다. ALLOWED_PINS 를 본인 PIN으로 바꾸세요."
else
  echo "[2/6] 기존 .env 사용"
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker 가 없습니다. 먼저 Docker 를 설치하세요."
  exit 1
fi

COMPOSE="docker compose"
if ! docker compose version >/dev/null 2>&1; then
  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE="docker-compose"
  else
    echo "docker compose 플러그인이 없습니다."
    exit 1
  fi
fi

echo "[3/6] 이미지 빌드 및 컨테이너 시작"
$COMPOSE up -d --build

if [ -d /etc/httpd/conf.d ]; then
  echo "[4/6] /var/www/html/tv 정적 노출 차단 설정 복사"
  cp "$ROOT/apache/tesla-video.conf" /etc/httpd/conf.d/tesla-video.conf
  if command -v getenforce >/dev/null 2>&1 && [ "$(getenforce)" != "Disabled" ]; then
    setsebool -P httpd_can_network_connect 1 || true
    echo "    SELinux httpd_can_network_connect=1"
  fi
  echo
  echo "    ★ httpd.conf 의 example.com VirtualHost 안에"
  echo "      apache/vhost-snippet.conf 내용을 붙여 넣었는지 확인하세요."
  echo "      (Alias /tv 가 아니라 ProxyPass /tv/ 이어야 합니다)"
  echo
  apachectl configtest
  systemctl reload httpd
  echo "[5/6] httpd reload 완료"
else
  echo "[4/6] /etc/httpd/conf.d 없음"
  echo "[5/6] skip"
fi

echo "[6/6] 헬스체크"
sleep 2
curl -fsS "http://127.0.0.1:8742/api/health" || true
echo
echo "브라우저: http://example.com/tv/"
echo "테스트:   http://example.com/tv/test/"
echo "로그: docker compose -f $ROOT/docker-compose.yml logs -f"
