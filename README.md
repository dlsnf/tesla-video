# Tesla Video Drive (example.com)

2022 테슬라 모델 3 롱레인지 브라우저에서 유튜브·트위치·직접 영상 URL을 재생하기 위한 서버입니다.

원 프로젝트 [madpowah/tesla-video-drive](https://github.com/madpowah/tesla-video-drive) 의 핵심(Drive Mode에서 `<video>`가 멈추는 문제를 canvas + MPEG1 + WebSocket으로 우회)을 그대로 쓰고, **유튜브 검색/VOD**, PIN 잠금, Rocky Linux 8 + Apache 2.4 + Docker 배포를 추가했습니다.

공개 주소:

```
http://example.com/tv/
```

기존 홈페이지(`http://example.com/`)는 건드리지 않습니다. `/tv/` 경로만 Node 컨테이너로 프록시합니다.

서버 파일 위치는 **`/var/www/html/tv`** 입니다. 맥 폴더명 `telsa_video`는 바꿔도 되고 안 바꿔도 됩니다.

---

## 꼭 읽기 — 안전 / 법령

운전 중 영상 시청은 위험하고, 대한민국 도로교통법상 문제될 수 있습니다.  
이 프로그램은 **주차, 충전, 동승자 화면** 용도로만 쓰세요. 주행 중 사용에 대한 책임은 사용자에게 있습니다.

Tesla는 Drive 모드에서 `<video>` 태그를 OS 수준으로 `pause()` 합니다. 마지막 프레임이 멈추고 소리만 남는 이유가 그것입니다. 이 서버는 `<video>`를 쓰지 않고:

1. 서버가 yt-dlp로 유튜브/트위치 주소를 얻습니다
2. ffmpeg가 MPEG1 + MP3로 다시 인코딩합니다
3. 영상은 WebSocket → JSMpeg → `<canvas>` (WebGL)
4. 소리는 테슬라가 막지 않는 `<audio>` 로 따로 재생합니다

---

## 왜 Docker 인가

서버에 이미 있는 구성:

| 항목 | 버전 | 이 프로젝트에서의 역할 |
|------|------|------------------------|
| Rocky Linux | 8.10 | 호스트 OS |
| Apache | 2.4.37 | `/tv/` 를 컨테이너로 프록시 + WebSocket |
| PHP | 8.1.33 | 사용하지 않음 (기존 사이트용) |
| MySQL | 10.3.39 | 사용하지 않음 |
| Python | 3.6.8 | **사용하지 않음** (yt-dlp가 너무 오래됨) |
| Docker | 26.1.3 | Node 20 + ffmpeg + 최신 yt-dlp 실행 |

호스트 Python 3.6.8 / 오래된 Node로는 유튜브를 안정적으로 받을 수 없습니다. 컨테이너 안에서만 최신 도구를 씁니다. Apache는 80 포트를 계속 갖고, 영상 서버는 `127.0.0.1:8742` 에만 붙습니다.

---

## 동작 구조

```
테슬라 브라우저  http://example.com/tv/
        │
        ▼
   Apache 2.4  (기존 사이트 + /tv/ 프록시)
        │  HTTP / WebSocket
        ▼
   Docker  tesla-video  (127.0.0.1:8742)
        │
        ├─ yt-dlp  → YouTube / Twitch URL
        └─ ffmpeg  → MPEG1-TS (영상) + MP3 (소리)
```

페이지:

| 주소 | 내용 |
|------|------|
| `/tv/` | 홈 |
| `/tv/player/` | 유튜브 검색 · URL 재생 |
| `/tv/twitch/` | 트위치 라이브 |
| `/tv/probe/` | 이 차량 브라우저 능력 진단 |

접속 PIN은 `.env`의 `ALLOWED_PINS` 에 적습니다. 예시 값을 그대로 쓰지 마세요.

---

## 1. 맥에서 할 일 (파일 준비)

이 폴더 전체가 서버에 올라갈 소스입니다.

1. `.env.example` 을 복사해 `.env` 를 만듭니다.
2. `ALLOWED_PINS` 를 본인만 아는 4자리로 바꿉니다. (여러 계정이면 콤마로)
3. 트위치를 쓸 때만 Twitch 개발자 콘솔 값을 넣습니다. 유튜브만 보면 비워도 됩니다.

GitHub에 **올리지 말 것**: `.env`, `node_modules/`, `data/` JSON, `youtube-cookies.txt`, `memo.txt`

서버(FTP)에는 `.env` 가 필요합니다. `node_modules/` 는 올리지 마세요.

---

## 2. FTP로 서버에 올리기 (FileZilla)

**주의: 기존 홈페이지 폴더(`public_html` / `/var/www/html`)에 넣지 마세요.**  
`.env`와 소스가 웹으로 그대로 열릴 수 있습니다. 홈 디렉터리나 `/opt` 아래에 올립니다.

### 2-1. FileZilla 설치 후 접속

1. FileZilla Client 실행
2. 상단 또는 사이트 관리자:

| 항목 | 값 |
|------|----|
| 프로토콜 | **SFTP** 를 강력히 권장 (FTP 21번도 가능) |
| 호스트 | `example.com` |
| 포트 | SFTP `22` / FTP `21` |
| 사용자 | 서버 SSH/FTP 계정 |
| 비밀번호 | 해당 계정 비밀번호 |

3. 연결

### 2-2. 서버 쪽 폴더 만들기

오른쪽(서버)에서 홈 위치로 간 다음 폴더를 만듭니다. 예:

```
/home/계정이름/tesla-video-drive
```

root 로 올릴 수 있으면 더 좋은 위치:

```
/opt/tesla-video-drive
```

### 2-3. 업로드

왼쪽(내 맥)에서 `Desktop/telsa_video` 안의 파일을 선택해 오른쪽 폴더로 드래그합니다.

- 덮어쓰기 나오면 **덮어쓰기**
- `public/js/jsmpeg.min.js` 는 약 125KB, 꼭 포함

업로드가 끝나면 서버에 SSH로 들어가야 합니다. Docker 실행과 Apache 설정은 FTP만으로는 불가능합니다.

---

## 3. SSH로 서버에 적용 (Rocky Linux 8.10)

터미널:

```bash
ssh 계정@example.com
```

### 3-1. 파일이 홈페이지 폴더에 올라갔다면 옮기기

```bash
sudo mkdir -p /opt/tesla-video-drive
sudo rsync -a ~/tesla-video-drive/ /opt/tesla-video-drive/
cd /opt/tesla-video-drive
```

FTP를 처음부터 `/opt/tesla-video-drive` 에 넣었다면 그 경로로 `cd` 만 하면 됩니다.

### 3-2. Docker 권한

```bash
docker version
sudo usermod -aG docker $USER
# 그룹 적용을 위해 한 번 로그아웃 후 재접속하는 것이 안전합니다.
```

### 3-3. 원클릭 설치 (root)

```bash
cd /opt/tesla-video-drive
sudo bash deploy/setup.sh
```

이 스크립트가 하는 일:

1. `.env` 가 없으면 생성
2. `docker compose up -d --build` 로 컨테이너 기동
3. `apache/tesla-video.conf` 를 `/etc/httpd/conf.d/` 에 복사
4. SELinux `httpd_can_network_connect=1` (Apache가 8742로 붙을 수 있게)
5. `httpd` reload
6. `http://127.0.0.1:8742/api/health` 확인

### 3-4. 수동으로 하는 경우 (스크립트 없이)

```bash
cd /opt/tesla-video-drive
cp -n .env.example .env
vi .env

docker compose up -d --build

sudo cp apache/tesla-video.conf /etc/httpd/conf.d/tesla-video.conf
sudo setsebool -P httpd_can_network_connect 1
sudo apachectl configtest
sudo systemctl reload httpd
```

방화벽에 8742를 열 필요 없습니다. Apache만 80/443, 컨테이너는 localhost 전용입니다.

### 3-5. 확인

PC 브라우저에서:

```
http://example.com/tv/api/health
```

예상 응답:

```json
{"ok":true,"ffmpeg":true,"ytdlp":true,"streams":0,"maxStreams":2,"pin":true,"base":"/tv"}
```

그다음:

```
http://example.com/tv/
```

PIN 키패드가 나오면 `.env`에 넣은 숫자를 입력합니다.

---

## 4. 테슬라 차에서 쓰는 방법 (2022 모델 3)

1. 차량 Wi‑Fi: 집 공유기 또는 폰 핫스팟. Premium Connectivity LTE도 됩니다.
2. 화면 하단 **웹 브라우저** 실행
3. 주소창에 `example.com/tv` 입력 (http 생략 가능)
4. PIN 입력
5. **유튜브** → 검색 또는 `youtube.com/watch?v=...` 붙여넣기 → 재생
6. 자주 쓰면 브라우저 **북마크**에 저장

화질:

- 핫스팟 / LTE: **360** 또는 **480**
- 집 Wi‑Fi / Supercharger Wi‑Fi: **720** 가능

소리가 영상보다 늦으면 **싱크 +2초** 를 누르세요. 원 프로젝트와 같이 오디오 HTTP 버퍼 때문에 수 초 밀릴 수 있습니다.

Drive 모드에서도 화면이 멈추지 않아야 정상입니다. 멈추면 `/tv/probe/` 에서 WebGL / WebSocket 이 YES 인지 확인하세요.

---

## 5. 자주 바꾸는 설정 (`.env`)

| 변수 | 의미 |
|------|------|
| `ALLOWED_PINS` | 접속 PIN 목록 (콤마 구분). 각 PIN이 계정 |
| `PUBLIC_BASE` | 공개 경로. 기본 `/tv` |
| `MAX_STREAMS` | 동시 재생 수. 기본 2 (CPU/트래픽 보호) |
| `TWITCH_CLIENT_ID` / `SECRET` | 트위치 팔로우 목록 가져올 때만 |

변경 후:

```bash
cd /opt/tesla-video-drive
docker compose up -d
```

---

## 6. 일상 운영

로그:

```bash
cd /opt/tesla-video-drive
docker compose logs -f --tail=100
```

유튜브가 갑자기 안 되면 yt-dlp 업데이트 (유튜브는 자주 깨집니다):

```bash
docker compose exec tesla-video pip3 install -U yt-dlp
```

컨테이너 재시작:

```bash
docker compose restart
```

소스 수정 후 다시 빌드:

```bash
docker compose up -d --build
```

나이 제한 영상은 브라우저에서 youtube.com 쿠키를 내보내 `youtube-cookies.txt` 로 저장한 뒤 프로젝트 루트에 두고 `docker-compose.yml` volumes 에 추가하세요.

---

## 7. 트러블슈팅

### `http://example.com/tv/` 가 404 / 기존 사이트가 나옴

- `/etc/httpd/conf.d/tesla-video.conf` 가 있는지
- `sudo apachectl -t` 성공인지
- `sudo systemctl reload httpd` 했는지
- 다른 vhost가 `/tv` 를 가로채는지

```bash
sudo grep -n "tv" /etc/httpd/conf.d/*.conf
curl -I http://127.0.0.1:8742/
curl -I http://example.com/tv/
```

### `503 Service Unavailable` / Proxy error

컨테이너가 안 떠 있습니다.

```bash
docker ps | grep tesla
docker compose -f /opt/tesla-video-drive/docker-compose.yml logs --tail=80
```

### Apache 에러 `Permission denied` 로 8742 연결 실패

SELinux입니다.

```bash
sudo setsebool -P httpd_can_network_connect 1
sudo systemctl reload httpd
```

### 검색은 되는데 화면이 까맣다

- PIN 세션이 WebSocket까지 안 넘어간 경우 → PIN 다시 입력
- 화질을 360으로
- `docker compose logs -f` 에 ffmpeg / yt-dlp 에러가 있는지
- 서버에서 유튜브가 막혀 있는지: `docker compose exec tesla-video yt-dlp -g "https://www.youtube.com/watch?v=dQw4w9WgXcQ"`

### 테슬라에서만 안 되고 PC는 됨

PC의 `<video>` 재생과 이 플레이어는 다릅니다. **PC 크롬에서도 `/tv/player/` 로 같은 canvas 플레이어를 테스트** 하세요.  
차에서만 실패하면 `/tv/probe/` 의 WebSocket, WebGL 을 봅니다.

### 기존 사이트가 깨짐

이 설정은 `/tv/` 만 프록시합니다. 루트 `/` 는 원래 DocumentRoot 입니다.  
문제가 있으면:

```bash
sudo rm /etc/httpd/conf.d/tesla-video.conf
sudo systemctl reload httpd
```

사이트가 즉시 원상 복구됩니다. 컨테이너는 사이트와 무관합니다.

```bash
cd /opt/tesla-video-drive && docker compose down
```

---

## 8. HTTPS (선택, 권장)

지금은 사이트가 HTTP 입니다. HTTP 페이지 + `ws://` 조합은 테슬라에서 동작하는 경우가 많습니다.  
나중에 인증서를 붙이면 WebSocket도 `wss://` 로 바뀝니다 (프론트가 프로토콜을 자동 선택).

Let’s Encrypt 예:

```bash
sudo dnf install -y certbot python3-certbot-apache
sudo certbot --apache -d example.com
```

인증서 적용 후 `http://` 가 `https://` 로 리다이렉트되면 차 북마크도 `https://example.com/tv/` 로 바꾸세요.

---

## 9. 트위치 OAuth (선택)

1. https://dev.twitch.tv/console/apps 에서 앱 등록
2. Redirect URL: `http://example.com/tv/api/twitch/callback`
3. Client ID / Secret 을 `.env` 에 넣고 컨테이너 재시작
4. 차에서 `/tv/twitch/` → Twitch 로그인 → 팔로우 채널 수입

유튜브만 쓰면 이 단계는 필요 없습니다.

---

## 라이선스

원 프로젝트와 같이 MIT.  
Tesla, YouTube, Twitch 상표는 각 권리자에게 있습니다.
