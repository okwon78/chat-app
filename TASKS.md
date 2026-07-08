# Chat Web TASKS

[PLAN.md](PLAN.md)의 마일스톤(§9)을 실행 가능한 단위로 분해한 작업 목록. 서버 스펙 근거는 [CLAUDE.md](CLAUDE.md)의 참고 지점(특히 `../chat-server/internal/ws/protocol.go`, `docs/ERRORS.md`).

- 표기: `[ ]` 미착수 · `[~]` 진행중 · `[x]` 완료
- 각 태스크의 `→` 는 완료 판정(acceptance) 기준.
- 마일스톤은 대체로 순차 의존(W1 REST → W2 WS → W3 채팅). 마일스톤 내부 태스크는 병렬 가능.

---

## W0 — 스캐폴드 (선행)

- [x] **Vite 프로젝트 초기화** — `npm create vite@latest . -- --template react-ts` (빈 디렉터리 아니면 기존 `PLAN.md`/`CLAUDE.md`/`.git` 보존) → `npm run dev` 기동 확인 *(scratchpad에 생성 후 복사로 기존 파일 보존. 템플릿 기본이 React 19 + oxlint로 바뀜 — CLAUDE.md 참고)*
- [x] **의존성 설치** — `react`, `react-dom`, `zustand` + dev(`vite`, `typescript`, `@vitejs/plugin-react`, `@types/*`) → `npm install` 성공
- [x] **폴더 스켈레톤** (PLAN §4) — `src/{types,lib,store,components,styles}` 생성
- [x] **Vite dev proxy** (`vite.config.ts`) — `/api`·`/healthz`·`/metrics`(http) + `/ws`(ws) → `:8080`. 타깃은 `VITE_SERVER_TARGET` env로 오버라이드 → 프록시 경유로 `curl localhost:5173/healthz` 200 *(로컬 :8080 점유로 서버를 :8090에 띄워 오버라이드 경로로 검증 — REST 200 + WS 101 확인)*
- [x] **`.env.example`** — `VITE_SERVER_TARGET=http://localhost:8080` 등 문서화
- [x] **lint/format** — eslint + prettier(또는 biome) 최소 설정, `tsconfig` strict *(eslint 대신 템플릿 기본 oxlint 채택 + prettier. md는 포맷 제외)*
- [x] **`.gitignore`** — `node_modules`, `dist`, `.env`, `*.local`
- [x] **README 갱신** — 서버 기동(ENABLE_TEST_API=true) + `npm run dev` 실행법

---

## W1 — REST 계층

- [x] **모델 타입** (`src/types/models.ts`) — `Room`/`Member`/`User` + `ApiError`(`{error:{code,message}}`) — 서버 `room.go`·`users.go` 미러
- [x] **REST 클라이언트** (`src/lib/rest.ts`) — `request<T>(method, path, body?)`: JSON 파싱, 비2xx면 `{error:{code,message}}` 파싱해 `ApiError` throw
  - 엔드포인트 함수: `listRooms`·`createRoom`·`getRoom`·`deleteRoom(id, ownerId)`·`joinRoom(id, userId)`·`createUser`·`listUsers`·`health`
  - → 각 함수가 상대경로(`/api/...`)로 프록시 경유 *(JSON 아닌 에러 본문(예: test API off의 텍스트 404)은 code=`http_<status>`로 폴백)*
- [x] **에러 메시지 매핑** (`src/lib/errorMessages.ts`) — REST/WS `code` → 한글 안내(§ERRORS.md 기반). `user_not_found`·`not_found`·`forbidden`·`already_member`·`invalid_request` 등
- [x] **HealthBadge** (`components/HealthBadge.tsx`) — `/healthz` 주기 폴링, pg/redis 상태 뱃지(200/503)
- [x] **UserManager** (`components/UserManager.tsx`) — displayName로 유저 생성 + 목록. **test API off(404)면 비활성 + 안내 문구**. 목록 항목 클릭 → IdentityBar에 userId 채움 *(IdentityBar가 아직 없어 App state(선택 유저)로 보관 — W2에서 연결)*
- [x] **RoomManager** (`components/RoomManager.tsx`) — 방 생성(name/ownerId/isPrivate) + 목록(새로고침). 각 행: [상세]·[REST join(userId)]·[삭제(owner)]
- [x] **수동 검증** — 서버(ENABLE_TEST_API=true) 띄운 채 유저2명 생성 → 방 생성 → 목록/상세 → join → 삭제. FK 거절(400 `user_not_found`)·owner-only 삭제(403)·중복 join(409)이 UI에 표시됨 *(2026-07-08 headless Chrome으로 전체 플로우 + 에러 3종 UI 확인. 주의: `user_not_found`는 ownerId/userId가 uuid 형식일 때만 — 비uuid 문자열은 500 `internal`)*

---

## W2 — WebSocket 계층 + Raw 로그

- [x] **프로토콜 타입** (`src/types/protocol.ts`) — 서버 `protocol.go`와 1:1
  - `Envelope{type,data,ts}`, C→S(`join`/`leave`/`message`/`typing`/`ping`)
  - S→C 유니온(`joined`/`message`/`ack`/`typing`/`presence`/`online`/`room_closed`/`pong`/`error`) — `type` discriminated union
  - `WsErrorCode` 리터럴 유니온(9종): `anonymous_forbidden`·`bad_envelope`·`bad_payload`·`unknown_type`·`rate_limited`·`room_not_found`·`not_joined`·`message_too_large`·`internal`
  - _(추가: `ClientDataMap`(type→data 매핑)으로 `send<T>(type, data)` 타입 체크)_
- [x] **`encodeFrame`** (순수 함수) — `(type, data) → Envelope` 직렬화. 부수효과 없음(테스트 대상) _(순수성 유지 위해 ts(unix 초)는 호출 측이 주입 — `wsClient.ts`에 위치)_
- [x] **WS 클라이언트** (`src/lib/wsClient.ts`) — `connect(identity)`·`send(type,data)`·`close()`·`on(handler)`
  - URL 조립 `/ws?userId=&name=` (userId 비면 익명)
  - 편의: `join`·`leave`·`sendMessage`·`typing`·`ping`
  - 인/아웃 모든 프레임을 **raw 로그로 emit**, 인바운드는 `JSON.parse` → `ServerFrame` 핸들러 전달
  - 연결 상태 전이(`idle`/`connecting`/`open`/`closed`) 통지 _(+연결 수립/종료/파싱 실패는 `meta` 방향으로 raw 로그에 남김)_
- [x] **store 뼈대** (`src/store/useChatStore.ts`, zustand) — `identity`·`connState`·`rawLog`(링버퍼 상한 500) + WS 액션(connect/disconnect/send/ping). 나머지 상태는 W3에서 확장
- [x] **IdentityBar** (`components/IdentityBar.tsx`) — userId/name 입력(유저 목록에서 선택 or 직접) + [연결]/[해제] + connState 표시 _(+수동 [ping] 버튼 — PLAN §5.2)_
- [x] **RawLogPanel** (`components/RawLogPanel.tsx`) — in/out 프레임 타임라인(방향 색상, JSON 펼치기, clear). **항상 노출**
- [x] **수동 검증** — 연결 후 `ping`→`pong`, 익명/식별 각각 연결. 아웃/인 프레임이 RawLog에 정확히 찍힘 _(2026-07-08 headless Chrome(CDP)으로 검증: 식별/익명 연결 · 연결 직후 `online` 수신 · ping→pong 왕복 · 해제가 모두 RawLog에 방향 표시와 함께 기록됨. 서버는 :8090 우회로 기동)_

---

## W3 — 채팅 UI (핵심 이벤트)

- [x] **store 확장** — `rooms`·`activeRoomId`·`joinedRooms(Set)`·`messagesByRoom(Record<roomId, ChatMessage[]>)` + 서버 프레임 리듀서 _(+`pendingSends`(ack 추적, 상한 20). `rooms`는 RoomManager가 REST로 채움. 연결 종료/재연결 시 `joinedRooms` 초기화)_
- [x] **`joined` 처리** — 해당 방 메시지 = `recent`로 세팅, `joinedRooms` 추가 _(재join도 replace라 중복 없음. 빈 방의 `recent:null` 방어)_
- [x] **`message` 처리** — 방 메시지 append, **서버 `id`로 dedup**(자기 송신 브로드캐스트 중복 방지)
- [x] **`ack` 처리** — composer의 pending `clientMsgId` 확정(전송중→전송됨 표시) _(전송중이 계속 남으면 서버 거절 신호 — RawLog의 error 확인 유도)_
- [x] **ChatRoom** (`components/ChatRoom.tsx`) — 활성 방 컨테이너(join 버튼 포함) _(활성 방은 RoomManager 행의 [채팅] 버튼으로 지정. join 전 전송을 막지 않음 — not_joined 재현용, W5)_
- [x] **MessageList** (`components/MessageList.tsx`) — senderId/본문/ts/id 렌더, 자동 스크롤 _(본인 메시지는 우측 정렬 하이라이트)_
- [x] **MessageComposer** (`components/MessageComposer.tsx`) — body 입력, `clientMsgId` 생성(crypto.randomUUID), 전송. 4096B 근접 시 카운터 _(75% 이상부터 표시, 초과 시 경고만 하고 전송은 허용 — message_too_large 재현용)_
- [x] **수동 검증** — 탭 2개(유저A/B)에서 join → 메시지 왕복 → 양쪽 MessageList 갱신, ack 확인, dedup으로 중복 없음 _(2026-07-08 headless Chrome 탭 2개(CDP)로 검증: A/B 각각 연결→join(recent 수신)→왕복 전송. 양쪽 MessageList에 각 메시지 정확히 1건, ack로 전송중→전송됨(id 확정), 재join 후에도 중복 없음)_

---

## W4 — presence / online / typing / room_closed + 에러 UX

- [x] **store 확장** — `presenceByRoom(Record<roomId,string[]>)`·`online:number|null`·`typingByRoom(Record<roomId,string[]>)`·`toasts` _(+연결 종료 시 presence/typing/online/joined 정리 — 서버 주도 상태라 소켓 수명에 묶음)_
- [x] **`presence` 처리** — 방 roster 전체 교체(식별 유저만). 서버가 join한 소켓 전원(본인 포함)에 재전송하므로 PresencePanel이 본인을 `나`로 표시
- [x] **`online` 처리** — 전역 카운트 갱신(연결 직후 1회 count 포함 + 주기적). IdentityBar·PresencePanel에 표시
- [x] **`typing` 처리** — 방 typing 목록 + **TTL(6s) 자동 해제**(모듈 스코프 타이머). Composer가 상승엣지 1회 `true`+idle(3s)/전송/blur 시 `false` 디바운스 송신(join+식별일 때만)
- [x] **`room_closed` 처리** — 해당 방 joinedRooms/messages/presence/typing 제거 + activeRoom 해제 + info 토스트(에러 아님)
- [x] **PresencePanel** (`components/PresencePanel.tsx`) — presence users(본인 강조) + online count. typing은 별도 `TypingIndicator`로 MessageList 아래 표시
- [x] **`error` 프레임 UX** — `ToastHost`가 코드별 토스트(§errorMessages, error=빨강/info=파랑, 6s 자동소멸+클릭 닫기). `anonymous_forbidden`·`not_joined`·`rate_limited`·`room_not_found`·`message_too_large` 매핑 표시
- [x] **App 레이아웃** (`App.tsx`) — 상단 IdentityBar(**sticky**, online 우측) + 2컬럼(관리 콘솔 | 채팅+RawLog) Grid + `ToastHost`
- [x] **수동 검증** — 2026-07-08 Node22 내장 WebSocket 하니스로 서버 프레임 계약 e2e 확인: 소켓 여닫음에 `online` 변동(0→2→4), `presence` roster(양쪽 수신), A 입력→B만 `typing`(송신자 제외), message/ack 왕복, 미join 소켓 `not_joined`·익명 송신 `anonymous_forbidden`, owner 삭제 시 A·B 모두 `room_closed` 수신. 리듀서/렌더는 이 계약 위에서 tsc+build 클린 _(브라우저 시각 확인은 아니고 프레임 계약 레벨 검증)_

---

## W5 — 다듬기 / 검증

- [x] **에러 경로 6종 재현** (PLAN §7) — 익명 송신(`anonymous_forbidden`)·미join 송신(`not_joined`)·연타(`rate_limited`)·4096B 초과(`message_too_large`)·삭제된 방 join(`room_not_found`)·bad payload. RawLog에서 관찰 _(2026-07-08 프록시(:5173) 경유 Node WS 하니스로 6종 전부 재현 + 보너스 `bad_envelope`. 트리거 순서는 handler.go 기준 — `message_too_large`는 not_joined보다 먼저 체크되어 join 없이도 발생, `rate_limited`는 join 후 burst 10 수용 뒤 발생 확인)_
- [x] **(선택) 단위 테스트** (Vitest) — `encodeFrame` + store 리듀서(`message` dedup, `joined` 세팅, `room_closed` 정리) _(2026-07-08 vitest 4, node 환경 + 전역 `WebSocket`/`window` 스텁으로 실제 인바운드 경로(connect→소켓 onmessage) 구동. `src/lib/wsClient.test.ts`(encodeFrame 순수성)·`src/store/useChatStore.test.ts`(joined/message dedup/ack/online/room_closed/error/disconnect 정리) 16 tests green. `npm test`/`test:watch`)_
- [x] **자동 재연결 여부 결정** (PLAN §10) — **수동 유지로 확정(자동 미도입)**. 이 앱은 presence/online/room_closed·에러 경로를 의도적으로 연결/해제하며 관찰하는 디버그 콘솔이라, 조용한 지수백오프는 그 관찰을 방해하고 소켓 수명에 묶인 상태를 예고 없이 리셋한다. IdentityBar [연결]/[재연결](현재 신원 재접속) + connState 배지 + RawLog 종료 code로 충분. 근거는 PLAN §10·README 알려진 제약. 코드 변경 없음
- [x] **README 완성** — 화면 구성(ASCII 레이아웃) + §7 시연 시나리오 7단계 + 에러 6종 표 + 알려진 제약(CORS→proxy·익명 읽기전용·test API·비영속·rate limit·membership 소켓수명·수동 재연결·isPrivate) + 스크립트(test 포함) _(스크린샷은 텍스트 레이아웃/시나리오로 대체 — RawLog 중심 콘솔이라 프레임 관찰이 핵심)_
- [x] **`npm run build` 통과** — 타입체크 + 프로덕션 빌드 클린 _(2026-07-08 tsc -b + vite build 클린, 43 모듈, 테스트 파일은 번들 미포함. oxlint/prettier도 클린)_
- [x] **완료 정의 점검** — PLAN §7의 7개 플로우 + 6개 에러 경로가 재현됨 _(2026-07-08 프록시 경유 WS 하니스 2종: 정상 플로우 10/10(부트스트랩·방생성/REST join·양쪽 joined·presence roster·online≥2·message 왕복·ack·typing 송신자제외·owner삭제 room_closed) + 에러 6/6. 프레임 계약 레벨 검증이며, 리듀서/렌더 레이어는 Vitest 16건 + build 클린으로 커버)_

---

## 상시 규칙

- 프로토콜/모델 타입은 서버 원본(`../chat-server/internal/ws/protocol.go`·`internal/room/room.go`) 변경 시 **먼저 동기화**한다.
- 에러 분기는 항상 `code`로(문구는 변할 수 있음).
- **개별 태스크를 완료할 때마다** 이 TASKS.md 체크박스를 갱신하고, 코드 상태·구조·결정이 바뀌었으면 [CLAUDE.md](CLAUDE.md)를 현행화한다(현행화 규칙은 CLAUDE.md 참조). 마일스톤 종료 시 README도 함께 점검한다.
