# chat-web

[`../chat-server`](../chat-server)(Go, WebSocket 기반 실시간 채팅 서버)를 **테스트/시연**하기 위한 React 웹 클라이언트. 서버의 REST 방 관리 API와 WebSocket 채팅 프로토콜을 손으로 두드려 보는 개발자용 콘솔 겸 데모 UI다. 개발 계획은 [PLAN.md](PLAN.md), 작업 목록은 [TASKS.md](TASKS.md).

핵심 가치는 화면 하단에 **항상 노출되는 RawLog** — 주고받는 모든 WS 프레임(in/out/meta)을 그대로 보여줘 프로토콜을 눈으로 검증할 수 있다.

## 스택

Vite 8 + React 19 + TypeScript(strict) + Zustand + CSS Modules, oxlint/prettier, Vitest — 근거는 PLAN §3.

## 화면 구성

상단 sticky **IdentityBar**(userId/name · [연결]/[재연결]/[해제] · [ping] · connState · 전체 접속 수 · HealthBadge) 아래 2컬럼:

```
┌ IdentityBar ─────────────────────────────────────────────┐
│  종료됨  [userId][name] [연결][해제][ping]   전체 접속 3명 │
├──────────────────────┬───────────────────────────────────┤
│  관리 콘솔            │  채팅                             │
│  · HealthBadge       │  · ChatRoom (활성 방)             │
│  · UserManager       │    MessageList + TypingIndicator  │
│  · RoomManager       │    MessageComposer                │
│    [상세][join][삭제] │  · PresencePanel (roster+online)  │
│    [채팅]            │  · RawLog (in/out/meta, 항상)     │
└──────────────────────┴───────────────────────────────────┘
```

## 실행

### 1. 서버 기동 (전제)

```bash
cd ../chat-server
docker compose up -d postgres redis
ENABLE_TEST_API=true go run ./cmd/server   # :8080 — 유저 생성 위해 test API on
```

> - `ENABLE_TEST_API=true`가 아니면 웹앱의 유저 생성이 404가 되고(UserManager 비활성+안내), userId 수동 입력만 가능하다.
> - `:8080`이 이미 사용 중이면 `HTTP_ADDR=:8090` 등으로 바꿔 띄우고 아래 `VITE_SERVER_TARGET`을 맞춘다.

### 2. 웹앱 기동

```bash
npm install
npm run dev        # Vite :5173 — /api·/ws·/healthz·/metrics를 서버로 프록시
```

서버 주소가 기본(`http://localhost:8080`)과 다르면:

```bash
cp .env.example .env   # VITE_SERVER_TARGET 수정, 또는:
VITE_SERVER_TARGET=http://localhost:8090 npm run dev
```

서버가 CORS를 설정하지 않으므로 **반드시 프록시 경유**(`:5173`)로 접근한다 (PLAN §2.3).

### 2-b. 컨테이너로 기동 (선택)

호스트 포트 충돌을 피하려면 이 repo의 `Dockerfile` + `docker-compose.yml`로:

```bash
docker compose up -d --build   # http://localhost:5173 (프록시 타깃은 host.docker.internal:8090)
```

소스는 bind mount라 HMR이 유지된다. 의존성 변경 시 `--build` 재실행.

## 시연 시나리오 (PLAN §7)

멀티 유저는 **탭/창 2개**(또는 시크릿 창)로 — 각 탭이 독립 WS 연결 = 독립 신원이다.

1. **부트스트랩** — UserManager로 유저 A·B 생성(test API on 필요).
2. **방 생성/입장** — RoomManager에서 A가 방 생성 → 목록 확인 → 행의 [join]으로 B를 REST join.
3. **실시간 채팅** — 탭1은 A, 탭2는 B로 IdentityBar에서 [연결] → RoomManager 행의 [채팅]으로 활성화 → ChatRoom에서 WS join → 메시지 왕복. RawLog에서 `message`/`ack`/`joined` 확인, MessageList는 서버 `id`로 dedup.
4. **typing** — 한쪽 입력 중 → 상대 탭 TypingIndicator에 표시(3s idle/전송/blur 시 해제).
5. **online/presence** — 탭을 여닫으며 IdentityBar의 접속 수, PresencePanel roster 변화 확인.
6. **에러 경로** — 아래 표 6종을 RawLog/토스트로 관찰(웹앱이 UI에서 막지 않도록 설계됨).
7. **방 삭제** — owner가 RoomManager에서 [삭제] → 다른 탭이 `room_closed` 수신 → 해당 방 뷰 정리 + info 토스트.

## 에러 경로 6종 (PLAN §7.6)

에러 분기는 항상 `code`로 하고(문구는 변할 수 있음), 코드→한글 안내는 `src/lib/errorMessages.ts` 단일 지점. WS `error` 프레임은 우하단 토스트(빨강)로도 뜬다.

| # | 코드 | 재현 방법 | 관찰 |
|---|---|---|---|
| 1 | `anonymous_forbidden` | 익명(userId 비움) 연결로 메시지 전송 | error 토스트 |
| 2 | `not_joined` | 식별 연결, join 없이 전송 | error 토스트 |
| 3 | `rate_limited` | join 후 빠른 연타(버스트 10 초과) | 10개 후 error |
| 4 | `message_too_large` | 4096B 초과 본문 전송(Composer가 75%부터 카운터, 초과해도 전송 허용) | error 토스트 |
| 5 | `room_not_found` | 삭제된/없는(유효 uuid) 방 join | error 토스트 |
| 6 | `bad_payload` | roomId/body 누락 프레임 | error 토스트 |

> 2026-07-08 프록시(:5173) 경유 WS 하니스로 6종 전부 재현 확인(+보너스 `bad_envelope`). 트리거 순서는 `../chat-server/internal/ws/handler.go` 기준: `onMessage`에서 anon → bad_payload → message_too_large → not_joined → rate_limited 순으로 검사되므로 `message_too_large`는 join 없이도 발생한다.

## 알려진 제약

- **CORS 미설정** → 브라우저에서 서버로 직접 호출 불가. 반드시 Vite dev proxy(같은 origin) 경유. 정적 배포 시 별도 리버스 프록시 필요.
- **유저 생성은 test API뿐** → `ENABLE_TEST_API=true`가 아니면 UserManager 비활성. userId는 서버가 무검증 신뢰(`?userId=&name=`)하므로 수동 입력도 동작한다.
- **익명 연결은 읽기 전용** → userId를 비우면 `guest:<uuid>`로 붙고 message/typing은 `anonymous_forbidden`.
- **메시지 비영속** → 서버는 방당 Redis 링버퍼 500개만 보관. join 시 `recent`로 그만큼만 복원된다.
- **rate limit** → 기본 5 tok/s · burst 10. 연타 시 `rate_limited`가 정상 발생(테스트 항목).
- **membership은 소켓 수명** → 연결이 끊기면 서버가 join/presence를 정리한다. 그래서 웹앱도 연결 종료 시 joined/presence/typing/online을 비운다.
- **재연결은 수동(자동 없음)** → 자동 지수백오프를 두지 않는 게 이 콘솔의 의도적 결정(PLAN §10): presence/online/room_closed와 에러 경로를 **직접 연결/해제하며 관찰**하는 도구라, 조용한 자동 재연결은 그 관찰을 방해하고 소켓 수명에 묶인 상태를 예고 없이 리셋한다. 끊기면 connState가 `종료됨`, 종료 code는 RawLog에 남고, IdentityBar [연결]/[재연결]로 현재 신원으로 다시 붙는다.
- **`isPrivate`** → 서버 동작 미확정(§CLAUDE.md). 웹앱은 플래그 전달·표시만.

## 스크립트

| 명령 | 동작 |
|---|---|
| `npm run dev` | dev 서버 + 프록시 |
| `npm run build` | 타입체크(tsc -b) + 프로덕션 빌드 |
| `npm test` | Vitest 단위 테스트(`encodeFrame` + store 리듀서) |
| `npm run test:watch` | Vitest watch |
| `npm run lint` | oxlint |
| `npm run format` | prettier (md 제외) |
