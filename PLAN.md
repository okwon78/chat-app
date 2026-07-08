# Chat Web — 개발 계획 (PLAN.md)

`../chat-server`(WebSocket 기반 실시간 채팅 서버, Go)를 **수동으로 테스트/시연**하기 위한 React 웹 클라이언트. 서버의 REST 방 관리 API와 WebSocket 채팅 프로토콜을 모두 다룰 수 있는 개발자용 툴 겸 데모 UI를 목표로 한다.

> 서버 원본 스펙: [chat-server/CLAUDE.md](../chat-server/CLAUDE.md), [docs/ERRORS.md](../chat-server/docs/ERRORS.md), 프로토콜 원본 [internal/ws/protocol.go](../chat-server/internal/ws/protocol.go).

---

## 1. 목표와 범위

### 목표

- 서버의 **모든 표면을 손으로 두드려 볼 수 있는** 테스트 콘솔 + 실제 채팅 UI 제공.
- REST: 유저 생성/조회, 방 생성/조회/목록/삭제/입장.
- WS: 연결(신원 지정), join/leave/message/typing/ping 송신, 서버 이벤트(message/ack/typing/presence/online/room_closed/error/pong) 수신·표시.
- 원시 프레임 로그(raw envelope in/out)를 항상 노출해 디버깅 가능하게 한다.

### 비목표 (POC 범위 밖)

- 인증/세션(서버가 `?userId=&name=`를 무검증 신뢰 — §8). 웹앱도 userId를 "선택"만 한다.
- 반응형/모바일 최적화, 접근성 완비, 국제화.
- 메시지 영속화(서버가 Redis 링버퍼 500개만 보관 — 그대로 반영).

---

## 2. 서버 API 요약 (구현 기준)

### 2.1 REST (`application/json`)

| 메서드 | 경로                   | 본문 / 쿼리                  | 성공                  | 비고                                        |
| ------ | ---------------------- | ---------------------------- | --------------------- | ------------------------------------------- |
| GET    | `/healthz`             | —                            | 200 `{status,checks}` | pg/redis 핑                                 |
| GET    | `/metrics`             | —                            | 200 text              | Prometheus 텍스트                           |
| GET    | `/api/rooms`           | —                            | 200 `{rooms:[]}`      | 방 목록                                     |
| POST   | `/api/rooms`           | `{name, ownerId, isPrivate}` | 201 `Room`            | ownerId 없으면 400 `user_not_found`         |
| GET    | `/api/rooms/{id}`      | —                            | 200 `Room`            | 없으면 404 `not_found`                      |
| DELETE | `/api/rooms/{id}`      | `?userId=<owner>`            | 204                   | owner 아니면 403 `forbidden`                |
| POST   | `/api/rooms/{id}/join` | `{userId}`                   | 201 `Member`          | 중복이면 409 `already_member`               |
| POST   | `/api/test/users`      | `{displayName}`              | 201 `User`            | **`ENABLE_TEST_API=true` 필요**, 아니면 404 |
| GET    | `/api/test/users`      | —                            | 200 `{users:[]}`      | 위와 동일                                   |

**모델**

- `Room`: `{id, name, ownerId, isPrivate, createdAt}`
- `Member`: `{roomId, userId, role, joinedAt}`
- `User`: `{id, displayName, createdAt}`
- 에러: `{error:{code, message}}` (분기는 `code`로)

### 2.2 WebSocket — `GET /ws?userId=&name=`

- `userId` 있으면 식별 사용자, 없으면(허용 시) `guest:<uuid>` 익명(**읽기 전용**).
- 프레임 봉투(Envelope): `{ "type": string, "data": object, "ts": number }`

**클라이언트 → 서버**

| type      | data                          | 비고                                                         |
| --------- | ----------------------------- | ------------------------------------------------------------ |
| `join`    | `{roomId, lastSeenId?}`       | `lastSeenId` 있으면 그 이후만 catch-up, 없으면 recent 윈도우 |
| `leave`   | `{roomId}`                    |                                                              |
| `message` | `{roomId, body, clientMsgId}` | 익명 금지, body ≤ 4096B, join 후에만                         |
| `typing`  | `{roomId, isTyping}`          | 익명 금지, join 후에만                                       |
| `ping`    | `{}`                          | `pong` 응답                                                  |

**서버 → 클라이언트**

| type          | data                                                                                                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `joined`      | `{roomId, recent: StoredMessage[]}` (`StoredMessage`: `{id, senderId, body, ts}`)                                                                                       |
| `message`     | `{roomId, id, senderId, body, ts}`                                                                                                                                      |
| `ack`         | `{clientMsgId, id}` (자기 송신 확인)                                                                                                                                    |
| `typing`      | `{roomId, userId, isTyping}` (송신자 제외)                                                                                                                              |
| `presence`    | `{roomId, users: string[]}` (식별 유저만, 멤버십 변동 시)                                                                                                               |
| `online`      | `{count}` (전역 접속 수; 연결 직후 1회 + 주기적)                                                                                                                        |
| `room_closed` | `{roomId}` (방 하드삭제; 에러 아님, 뷰 정리)                                                                                                                            |
| `pong`        | `{}`                                                                                                                                                                    |
| `error`       | `{code, message}` (코드: `anonymous_forbidden`·`bad_envelope`·`bad_payload`·`unknown_type`·`rate_limited`·`room_not_found`·`not_joined`·`message_too_large`·`internal`) |

**핸드셰이크 거절**: `ALLOW_ANONYMOUS=false`인데 userId 없음 → HTTP 401. 그 외 신원 오류 → 400 (WS `error` 프레임 아님).

### 2.3 주의점 (웹앱 설계에 직접 영향)

- **CORS**: 서버 REST는 CORS 헤더를 세팅하지 않음. 브라우저에서 다른 origin으로 직접 호출하면 막힘 → **Vite dev proxy로 동일 origin처럼 프록시**한다(WS 포함). 프로덕션/정적 배포 시엔 별도 리버스 프록시 필요.
- **유저 생성 경로가 test API뿐**: 웹앱에서 "유저 만들기"가 되려면 서버를 `ENABLE_TEST_API=true`로 띄워야 함. off면 웹앱은 userId 수동 입력만 가능(안내 표시).
- **rate limit**: 기본 5 tok/s·burst 10. 빠른 연타 시 `rate_limited` 에러가 정상적으로 뜸(테스트 항목).
- **message 브로드캐스트는 송신자 포함**: 낙관적 렌더링 시 서버 `message`로 중복되지 않도록 `clientMsgId`/`id`로 dedup 필요.

---

## 3. 기술 스택 (결정)

| 항목       | 선택                                                   | 이유                                                                        |
| ---------- | ------------------------------------------------------ | --------------------------------------------------------------------------- |
| 빌드       | **Vite**                                               | 빠른 dev 서버 + 내장 proxy(REST/WS 한 번에)                                 |
| 언어       | **TypeScript**                                         | 프로토콜 타입을 서버 스키마와 1:1로 못박아 실수 방지                        |
| 프레임워크 | **React 18** (함수형 + hooks)                          | 요구사항                                                                    |
| 상태관리   | **Zustand** (경량)                                     | 전역 채팅 상태(연결/방/메시지/로그)를 보일러플레이트 없이. 필요 최소 의존성 |
| 스타일     | **CSS Modules** (또는 순수 CSS)                        | 무거운 UI 라이브러리 회피, POC에 충분                                       |
| 테스트     | **Vitest** + React Testing Library (선택, 핵심 로직만) | 프로토콜 인코더/리듀서 단위 테스트                                          |
| 라우팅     | 없음(단일 페이지 탭 전환)                              | 화면이 적어 오버킬 회피                                                     |

> 결정 근거를 남긴 이유: 사용자가 "react.js"만 지정했으므로 나머지는 POC 테스트 툴에 맞춰 최소·실용 우선으로 골랐다. TS/Zustand가 과하면 JS + Context로 다운그레이드 가능(§10 참고).

---

## 4. 폴더 구조

```
chat-web/
  index.html
  vite.config.ts            # dev proxy: /api, /ws, /healthz, /metrics → :8080
  .env.example              # VITE_SERVER_URL 등
  package.json
  tsconfig.json
  src/
    main.tsx
    App.tsx                 # 레이아웃 + 탭(Console / Chat)
    types/
      protocol.ts           # Envelope, 각 data 타입, 에러 코드 union (서버 스키마 미러)
      models.ts             # Room, Member, User
    lib/
      rest.ts               # fetch 래퍼 + 엔드포인트 함수 + 에러 파싱
      wsClient.ts           # WebSocket 래퍼: 연결/재연결/send helpers/이벤트 emit
    store/
      useChatStore.ts       # zustand: connection, identity, rooms, activeRoom,
                            #   messagesByRoom, presenceByRoom, online, rawLog
    components/
      IdentityBar.tsx       # userId/name 선택·생성, 연결/해제
      RoomManager.tsx       # REST: 방 목록/생성/조회/삭제, join
      UserManager.tsx       # REST: test users 생성/목록 (test API off면 안내)
      ChatRoom.tsx          # 활성 방: 메시지 리스트 + 입력창 + typing + presence
      MessageList.tsx
      MessageComposer.tsx   # body 입력, clientMsgId 생성, typing 디바운스
      PresencePanel.tsx     # presence users + online count
      RawLogPanel.tsx       # in/out envelope 타임라인(디버깅 핵심)
      HealthBadge.tsx       # /healthz 폴링 표시
    styles/
```

---

## 5. 핵심 모듈 설계

### 5.1 `types/protocol.ts`

- 서버 `protocol.go`를 그대로 미러링한 discriminated union.
  - `ClientFrame = JoinFrame | LeaveFrame | MessageFrame | TypingFrame | PingFrame`
  - `ServerFrame`: `type`으로 분기되는 union (`joined`/`message`/`ack`/`typing`/`presence`/`online`/`room_closed`/`pong`/`error`).
  - `WsErrorCode` = 리터럴 union(위 표).
- 목적: 수신 프레임 처리에서 `switch(frame.type)` 시 타입 좁히기 → 누락 컴파일 에러.

### 5.2 `lib/wsClient.ts`

- 얇은 클래스/팩토리: `connect(identity)`, `send(type, data)`, `close()`, `on(handler)`.
- 책임:
  - URL 조립: `/ws?userId=&name=` (userId 비우면 익명).
  - 아웃바운드: `{type, data, ts: Date.now()/1000}` 마샬 → 문자열 전송, **raw 로그로 emit**.
  - 인바운드: `JSON.parse` → `ServerFrame`로 검증 → 핸들러 + raw 로그 emit.
  - 편의 함수: `join/leave/sendMessage/typing/ping`.
  - `ping`은 앱 레벨 keepalive 확인용(서버가 별도 WS ping/pong도 함 — 30s). 수동 ping 버튼도 제공.
  - 재연결: 수동 재연결 버튼 우선. 자동 재연결은 선택(§10). 끊기면 상태를 `disconnected`로.
- **부수효과 없는 순수 인코딩 함수**(`encodeFrame`)를 분리해 단위 테스트.

### 5.3 `lib/rest.ts`

- `request<T>(method, path, body?)` → JSON 파싱, 비2xx면 `{error:{code,message}}` 파싱해 `ApiError` throw.
- 엔드포인트 함수: `listRooms`, `createRoom`, `getRoom`, `deleteRoom(id, ownerId)`, `joinRoom(id, userId)`, `createUser`, `listUsers`, `health`.
- base는 상대경로(`/api/...`) → dev proxy가 처리.

### 5.4 `store/useChatStore.ts` (zustand)

- 상태:
  - `identity: {userId, name} | null`, `connState: 'idle'|'connecting'|'open'|'closed'`
  - `rooms: Room[]`, `users: User[]`, `activeRoomId`
  - `joinedRooms: Set<roomId>`
  - `messagesByRoom: Record<roomId, ChatMessage[]>` (dedup 키 = 서버 `id`)
  - `presenceByRoom: Record<roomId, string[]>`, `online: number`
  - `rawLog: LogEntry[]` (방향/시각/type/원문, 최대 N개 링버퍼)
- 서버 프레임 → 상태 리듀서(핸들러):
  - `joined`: 해당 방 메시지 = recent로 세팅, joinedRooms 추가.
  - `message`: 방 메시지 append (id로 dedup — 자기 송신 중복 방지).
  - `ack`: composer의 pending clientMsgId를 확정(선택: "전송중→전송됨" 표시).
  - `typing`: 방 typing 상태 갱신(타임아웃으로 자동 해제).
  - `presence`: `presenceByRoom[roomId] = users`.
  - `online`: `online = count`.
  - `room_closed`: 해당 방 뷰/조인 상태 제거 + 토스트.
  - `error`: 코드별 사용자 메시지 토스트(§5.5).

### 5.5 에러 UX

- REST/WS 에러 코드 → 한글 안내 매핑 테이블 하나(`errorMessages.ts`).
- 특히 `anonymous_forbidden`(익명 송신), `not_joined`(join 안 함), `rate_limited`, `room_not_found`, `message_too_large`는 테스트 시나리오라 명확히 표시.

---

## 6. 화면 구성 (단일 페이지 + 2 영역)

상단 고정 **IdentityBar**: userId 선택(유저 목록 드롭다운/직접입력) · name · [연결]/[해제] · connState · online count · HealthBadge.

**좌측: 관리 콘솔**

- `UserManager`: displayName로 유저 생성, 목록(클릭 시 IdentityBar에 채움). test API off면 비활성 + 안내.
- `RoomManager`: 방 생성(name/ownerId/isPrivate), 목록(새로고침), 각 행에 [상세][join][삭제(owner)] , [WS join].

**우측: 채팅 + 디버그**

- `ChatRoom`(activeRoom): `MessageList`(senderId/본문/ts/id) + `MessageComposer`(입력·전송·typing) + `PresencePanel`(users, online).
- `RawLogPanel`: in/out 프레임 타임라인(색상 구분, JSON 펼치기, clear). **항상 노출** — 이게 이 앱의 핵심 가치.

레이아웃: CSS Grid 2컬럼(관리 | 채팅), 상단 바 sticky. 모바일은 세로 스택(최소 대응).

---

## 7. 주요 사용자 플로우 (수동 테스트 시나리오)

1. **부트스트랩**: 서버 `ENABLE_TEST_API=true`로 기동 → UserManager로 유저 2명 생성.
2. **방 생성/입장**: RoomManager로 유저A가 방 생성 → 목록 확인 → REST join(유저B).
3. **실시간 채팅**: 유저A/B 각각 브라우저 탭에서 연결 → WS join → 메시지 주고받기 → ack/message/presence 로그 확인.
4. **typing**: 한쪽 입력 중 → 상대 typing 표시 확인.
5. **online/presence**: 탭 여닫으며 online count·presence 변화 확인.
6. **에러 경로**: 익명 연결로 송신(`anonymous_forbidden`), join 없이 송신(`not_joined`), 연타(`rate_limited`), 4096B 초과(`message_too_large`), 삭제된 방 join(`room_not_found`).
7. **방 삭제**: owner가 DELETE → 다른 탭에서 `room_closed` 수신·뷰 정리 확인.

> 멀티 유저 시연은 **탭/창 2개** 또는 시크릿 창으로. (각 탭이 독립 WS 연결 = 독립 신원)

---

## 8. 개발 환경

### 8.1 Vite proxy (`vite.config.ts`)

```ts
server: {
  proxy: {
    '/api':     { target: 'http://localhost:8080', changeOrigin: true },
    '/healthz': 'http://localhost:8080',
    '/metrics': 'http://localhost:8080',
    '/ws':      { target: 'ws://localhost:8080', ws: true },
  },
}
```

- 타깃 주소는 `.env`(`VITE_SERVER_TARGET`)로 오버라이드 가능하게.

### 8.2 서버 기동 (전제)

```bash
cd ../chat-server
docker compose up -d postgres redis
ENABLE_TEST_API=true go run ./cmd/server   # :8080, 유저 생성 위해 test API on
```

### 8.3 웹앱 기동

```bash
cd chat-web
npm install
npm run dev        # Vite :5173, proxy로 :8080에 연결
```

---

## 9. 마일스톤 / 작업 목록

- **W0 — 스캐폴드**: `npm create vite@latest . -- --template react-ts`, 폴더 구조, proxy, `.env.example`, lint/format.
- **W1 — REST 계층**: `rest.ts` + 타입 + `UserManager`/`RoomManager`(목록·생성·삭제·join). HealthBadge.
- **W2 — WS 계층**: `wsClient.ts` + `protocol.ts` + IdentityBar 연결/해제 + `RawLogPanel`(in/out 로그). 이 시점에 프레임을 눈으로 확인 가능.
- **W3 — 채팅 UI**: store 리듀서 + `ChatRoom`/`MessageList`/`MessageComposer`/`PresencePanel`. join→message→ack→message 렌더링, dedup.
- **W4 — presence/online/typing/room_closed**: 나머지 서버 이벤트 반영 + 에러 코드 UX 매핑.
- **W5 — 다듬기**: 멀티탭 시나리오 점검, 에러 경로 6종 재현, README 작성, (선택) Vitest로 `encodeFrame`/리듀서 테스트.

각 마일스톤 완료 시 이 PLAN 하단 체크리스트와 README를 갱신한다.

---

## 10. 결정 필요 / 열린 질문

- **TS vs JS**: 기본 TS 제안. 팀이 순수 JS 선호면 `.jsx` + JSDoc로 전환(타입 안전성은 감소).
- **상태관리**: Zustand 제안. 의존성 0을 원하면 React Context + `useReducer`로 대체 가능(store 인터페이스는 동일 유지).
- **자동 재연결**: ~~기본은 수동 재연결. 데모 편의를 위해 지수백오프 자동 재연결을 넣을지 결정.~~ → **[결정 2026-07-08] 수동 유지(자동 미도입).** 디버그 콘솔이라 의도적 연결/해제 관찰이 핵심이고, 소켓 수명에 묶인 상태를 자동 재연결이 예고 없이 리셋한다. IdentityBar [연결]/[재연결] + connState 배지 + RawLog 종료 code로 충분.
- **정적 배포 여부**: dev proxy로 충분한지, 아니면 빌드 결과물을 서버가 서빙/CORS 허용할지. 서버에 CORS 미들웨어 추가는 chat-server 변경이 필요 → 별도 합의.
- **`isPrivate` 동작**: 서버 측 `is_private` 동작이 미결정(§CLAUDE.md). 웹앱은 일단 플래그 전달·표시만.

---

## 11. 검증

```bash
npm run build      # 타입체크 + 프로덕션 빌드 통과
npm run dev        # 서버(:8080) 띄운 상태에서 §7 시나리오 수동 점검
npm run test       # (선택) 단위 테스트
```

- 완료 정의: §7의 7개 플로우 + 6개 에러 경로가 UI/RawLog에서 재현·관찰됨.
