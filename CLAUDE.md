# CLAUDE.md — chat-web

`../chat-server`(Go, WebSocket 기반 실시간 채팅 서버)를 **테스트/시연**하기 위한 React 웹 클라이언트. 개발 계획은 [PLAN.md](PLAN.md).

## 서버 참고 (원본: `../chat-server`)

이 웹앱은 `../chat-server`의 REST + WebSocket API를 소비한다. 서버 스펙이 곧 이 앱의 계약이므로, **API/프로토콜/에러 규격을 바꾸거나 확인할 땐 반드시 서버 원본을 근거로 삼는다.**

아래 핵심 문서는 컨텍스트에 자동 로드된다(@import):

- 서버 개요·모듈 맵·마일스톤: @../chat-server/CLAUDE.md
- 에러 규격(WS error 코드 + REST status 매핑): @../chat-server/docs/ERRORS.md

### 필요 시 직접 읽는 서버 파일 (on-demand)

전체 트리는 `../chat-server/`에서 접근 가능(`.claude/settings.json`의 `additionalDirectories`로 허용됨). 자주 보는 지점:

| 목적                             | 경로                                                       |
| -------------------------------- | ---------------------------------------------------------- |
| 원본 설계 스펙(§ 번호 근거)      | `../chat-server/PLAN.md`                                   |
| 작업 목록/진행                   | `../chat-server/TASKS.md`                                  |
| WS 프레임 타입(Envelope/payload) | `../chat-server/internal/ws/protocol.go`                   |
| WS dispatch/핸들러 로직          | `../chat-server/internal/ws/handler.go`                    |
| REST 라우트/DI                   | `../chat-server/internal/api/api.go`                       |
| REST 방/유저 핸들러              | `../chat-server/internal/api/rooms.go`, `users.go`         |
| 신원 추출(`?userId=&name=`)      | `../chat-server/internal/identity/identity.go`             |
| 도메인 모델(Room/Member)         | `../chat-server/internal/room/room.go`                     |
| config 기본값/env                | `../chat-server/internal/config/config.go`, `.env.example` |
| 교체 지점/배포                   | `../chat-server/docs/EXTENSION_POINTS.md`, `DEPLOYMENT.md` |

## 서버 기동 (이 앱의 전제)

```bash
cd ../chat-server
docker compose up -d postgres redis
ENABLE_TEST_API=true go run ./cmd/server   # :8080 — 유저 생성 위해 test API on
```

- 웹앱은 Vite dev proxy로 `/api`·`/ws`·`/healthz`·`/metrics`를 `:8080`에 프록시한다(서버가 CORS 미설정이므로 필수). 상세는 PLAN §2.3, §8.

## 규칙

- 프로토콜 타입(`src/types/protocol.ts`)은 서버 `internal/ws/protocol.go`와 **1:1로 동기화**한다. 서버 변경 시 여기부터 맞춘다.
- 에러 분기는 항상 `code`로(문구 `message`는 변할 수 있음). 매핑 근거는 `docs/ERRORS.md`.

### CLAUDE.md 현행화 규칙 (중요)

**[TASKS.md](TASKS.md)의 개별 태스크를 완료할 때마다** 다음을 즉시 수행한다:

1. 해당 태스크의 체크박스를 `[x]`(또는 진행중 `[~]`)로 업데이트한다.
2. 그 태스크로 **코드 상태·구조·결정이 바뀌었다면** 이 CLAUDE.md를 현행화한다. 대상:
   - 아래 **프로젝트 현황** 섹션(완료/진행 마일스톤, 최신 폴더 구조).
   - 새로 생긴 교체 지점·규약·비자명한 결정(예: 상태관리 선택 확정, 프록시 규칙, dedup 전략).
   - 서버 스펙과의 어긋남이나 새로 발견한 제약.
3. 순수 기계적 변경(오타·포맷)만 있으면 CLAUDE.md 갱신은 생략하고 체크박스만 업데이트한다 — 문서 노이즈를 만들지 않는다.

> 이 규칙은 셸 훅이 아니라 **에이전트가 지키는 작업 약속**이다. "현행화"는 무엇을 남길지 판단이 필요하므로 명령어로 자동화하지 않는다.

## 프로젝트 현황

- **완료 마일스톤**: W0 스캐폴드, W1 REST 계층, W2 WebSocket 계층 + Raw 로그, W3 채팅 UI, W4 presence/online/typing/room_closed + 에러 UX, **W5 다듬기/검증**(2026-07-08). W5 전 태스크 완료 — 모든 마일스톤 종료.
- **진행중**: 없음. (다음 작업은 서버 스펙 변경 추종 또는 신규 요구 시.)
- **확정된 결정**:
  - Vite 8 + **React 19** + TypeScript(strict) + Zustand + CSS Modules. PLAN §3은 React 18이었으나 `create-vite` 기본 템플릿이 React 19라 그대로 채택(함수형+hooks만 사용하므로 API 차이 없음).
  - lint는 eslint 대신 템플릿 기본 **oxlint**, 포맷은 **prettier**(단, `*.md`는 제외 — 계획 문서 포맷 churn 방지, `.prettierignore`).
  - **재연결은 수동 유지**(W5 결정, PLAN §10). 자동 지수백오프 미도입 — 이 앱은 presence/online/room_closed·에러 경로를 의도적으로 연결/해제하며 관찰하는 디버그 콘솔이라 조용한 자동 재연결이 관찰을 방해하고 소켓 수명에 묶인 상태(join/pending)를 예고 없이 리셋한다. IdentityBar [연결]/[재연결](현재 신원 재접속) + connState 배지 + RawLog 종료 code로 대체.
  - **단위 테스트는 Vitest**(W5). 설정은 `vite.config.ts`의 `test` 키(`defineConfig`는 `vitest/config`에서, `loadEnv`만 `vite`에서 — vitest가 재export 안 함), `environment: 'node'`(jsdom 불필요 — `window`/`WebSocket`은 `vi.stubGlobal`로 스텁), `include: src/**/*.test.ts`. 스크립트 `npm test`(vitest run)/`test:watch`. 테스트 파일은 `src` 아래라 `tsc -b`(build)가 타입체크하지만 vite entry에서 도달 불가라 프로덕션 번들엔 안 들어간다. **store 리듀서는 export 안 되는 클로저**(`wsClient.on`의 `onFrame`)라, 전역 `WebSocket`을 모킹해 `connect→소켓 onmessage`로 서버 프레임을 흘려보내는 실제 인바운드 경로로 검증한다(모듈 싱글턴 store라 `beforeEach`에서 상태 리셋).
  - dev proxy 타깃은 `VITE_SERVER_TARGET` env로 오버라이드(`vite.config.ts`가 http→ws 치환으로 WS 타깃 유도). 그 외 열린 질문은 PLAN §10.
  - 에러 표시는 `src/lib/errorMessages.ts`의 code→한글 매핑 단일 지점으로. 매핑에 없는 code나 JSON 아닌 에러 본문(예: test API off 시 mux의 텍스트 404)은 `ApiError.code = http_<status>`로 폴백 — UserManager는 `status===404`로 test API off를 감지해 패널을 비활성+안내로 전환한다.
  - "선택 유저"(유저 목록 클릭)는 App state로 보관 — RoomManager의 join userId/삭제 requestedBy로 쓰고, IdentityBar에 prop으로 내려 userId/name 입력칸을 채운다(직접 수정도 가능). WS 연결에 실제 쓴 신원의 확정본은 store의 `identity`.
  - **WS 계층 구조(W2)**: `WsClient`는 `useChatStore.ts`의 모듈 스코프 싱글턴(소켓은 React 상태가 아니라 store 액션 뒤의 리소스). store가 `on(handler)`로 connState/rawLog(링버퍼 상한 500)/서버 프레임(`onFrame` 리듀서)을 받는다. `encodeFrame`은 ts(unix 초)를 인자로 주입받는 순수 함수(W5 Vitest 대상). 재연결 시 stale 소켓 이벤트는 `this.ws === ws` 가드로 차단하고, 익명 연결은 userId 쿼리 파라미터 생략으로 표현한다. 연결 수립/종료/파싱 실패는 rawLog에 `meta` 방향으로 남긴다.
  - **채팅 상태(W3)**: 메시지 소스는 서버 브로드캐스트뿐(낙관적 append 없음) — `message` 리듀서가 서버 `id`로 dedup, `joined`는 recent로 **replace**(재join 중복 없음, `recent:null` 방어). 전송은 `sendChatMessage`가 `crypto.randomUUID()`로 clientMsgId를 만들어 `pendingSends`(상한 20)로 추적하고 `ack`가 전송중→전송됨(서버 id) 확정. 연결 종료/재연결 시 `joinedRooms`·`pendingSends`를 비운다(서버 membership이 소켓 수명). 활성 방은 RoomManager 행의 [채팅] 버튼 → `activeRoomId`. **에러 경로 재현을 위해 join 전 전송·4096B 초과 전송을 UI에서 막지 않는다**(not_joined/message_too_large가 W5 테스트 항목; error 프레임 토스트는 W4).
  - **presence/online/typing/toast(W4)**: 리듀서에 `presence`(방 roster 전체 교체, 서버가 본인 포함 전원에 전송) / `online`(전역 count, 미수신 null) / `typing`(방별 userId 목록 + **모듈 스코프 TTL 6s 자동 해제** — 서버는 자동만료 없이 `isTyping:false`에 의존) / `room_closed`(방 joinedRooms·messages·presence·typing 제거 + activeRoom 해제 + info 토스트) / `error`(코드별 토스트) 추가. **연결 종료 시 presence/typing/online/joined를 모두 비운다**(서버 주도 상태라 소켓 수명에 묶음). **토스트**는 store `toasts` + 모듈 스코프 TTL 타이머(6s)·상한 5, `ToastHost`가 우하단 렌더(error 빨강/info 파랑, 클릭 닫기). **typing 송신**은 `MessageComposer`가 담당: 상승엣지 1회 `true` + idle(3s)/전송/blur 시 `false`, **join 완료 & 식별 유저일 때만**(익명/미join은 서버가 anonymous_forbidden/not_joined로 거절하므로 게이트). typing 표시는 `TypingIndicator`(본인 방어적 제외), roster+online은 `PresencePanel`.
- **서버 스펙 관련 새로 확인한 제약**: `user_not_found`(400)는 참조 uuid가 **형식은 유효하지만 존재하지 않을 때**만 나온다. 비uuid 문자열(예: `"no-such-user"`)은 Postgres uuid 파싱 에러로 500 `internal`이 됨 — ERRORS.md에는 없는 동작이므로 FK 에러 경로 테스트는 유효 형식 uuid로 할 것.
- **로컬 환경 주의**: 이 머신의 `:8080`/`:5432`/`:6379`는 다른 스택(oauth_*)이 점유 중일 수 있음. chat-server는 이전 우회 그대로 — `HTTP_ADDR=:8090 DATABASE_URL=...:5433 REDIS_ADDR=localhost:6380 ENABLE_TEST_API=true`(컨테이너 `chat-pg-tmp`/`chat-redis-tmp`)로 호스트에서 `go run ./cmd/server` 실행(검증됨). chat-server repo에는 아무 변경도 두지 않는다.
- **chat-web은 컨테이너로 실행**: 이 repo의 `Dockerfile`(node:22-alpine, vite dev `--host`) + `docker-compose.yml`. 프록시 타깃은 `VITE_SERVER_TARGET=http://host.docker.internal:8090`(compose `environment`가 bind mount된 `.env`보다 우선 — vite `loadEnv`는 process.env 우선). 호스트에 노출하는 포트는 `5173` 하나뿐(점유 중인 8080/8090/5432/5433/6379/6380과 충돌 없음). `docker compose up -d --build` 후 http://localhost:5173 (REST 프록시 + WS 101 업그레이드 검증됨). 소스는 bind mount라 HMR 유지, `node_modules`는 익명 볼륨 — 의존성 변경 시 `--build` 재실행. 호스트에서 직접 `npm run dev` 할 때는 `.env`의 `VITE_SERVER_TARGET=http://localhost:8090` 사용.
- **폴더 구조**: W4 기준 — `src/types/{models,protocol}.ts`(REST 모델+`ApiError` / WS 프로토콜 미러), `src/lib/{rest,errorMessages,wsClient}.ts`, `src/store/useChatStore.ts`(zustand + `wsClient` 싱글턴 + 프레임 리듀서 + typing/toast 모듈 스코프 타이머), `src/components/{HealthBadge,UserManager,RoomManager,IdentityBar,RawLogPanel,ChatRoom,MessageList,MessageComposer,PresencePanel,TypingIndicator,ToastHost}.tsx`(CSS는 `IdentityBar/RawLogPanel/HealthBadge/PresencePanel/ToastHost.module.css` + 채팅 4종(ChatRoom/MessageList/MessageComposer/TypingIndicator) 공용 `ChatRoom.module.css`), `src/styles/panel.module.css`(패널 공용 스타일), `src/App.tsx`+`App.module.css`(헤더 + sticky IdentityBar + 2컬럼 그리드 + ToastHost), `src/main.tsx`·`index.css`, `vite.config.ts`(proxy + vitest `test`), 테스트 `src/lib/wsClient.test.ts`·`src/store/useChatStore.test.ts`(W5), `.env.example`, `tsconfig.*`(strict), `.oxlintrc.json`, `.prettierrc.json`.
