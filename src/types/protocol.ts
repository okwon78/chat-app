// WS 프로토콜 타입 — 서버 원본과 1:1 미러 (변경 시 서버부터 확인):
//   Envelope/payload: ../chat-server/internal/ws/protocol.go
//   dispatch 로직:    ../chat-server/internal/ws/handler.go
// 규칙(CLAUDE.md): 서버 protocol.go 변경 시 이 파일부터 동기화한다.

// 공통 프레임 봉투 (PLAN §6): {type, data, ts}. ts는 unix 초.
// 서버가 data/ts 모두 omitempty로 다루므로 optional.
export interface Envelope {
  type: string
  data?: unknown
  ts?: number
}

// --- 클라이언트 → 서버 payload (protocol.go join/leave/message/typingData) ---

export interface JoinData {
  roomId: string
  // (재)join 시 주면 그 이후 메시지만 catch-up, 없으면 recent 윈도우 (§12)
  lastSeenId?: string
}

export interface LeaveData {
  roomId: string
}

export interface MessageData {
  roomId: string
  body: string
  clientMsgId: string
}

export interface TypingData {
  roomId: string
  isTyping: boolean
}

// type → data 스키마 매핑. send<T>(type, data)의 타입 안전성 근거.
// ping의 data는 서버가 무시하므로 빈 객체를 보낸다.
export interface ClientDataMap {
  join: JoinData
  leave: LeaveData
  message: MessageData
  typing: TypingData
  ping: Record<string, never>
}

export type ClientFrameType = keyof ClientDataMap

// --- 서버 → 클라이언트 payload ---

// StoredMessage.id는 Redis Stream ID — 정렬 시퀀스 겸 dedup 키 (§12, W3).
export interface StoredMessage {
  id: string
  senderId: string
  body: string
  ts: number
}

export interface JoinedData {
  roomId: string
  recent: StoredMessage[]
}

// 브로드캐스트 message (protocol.go outMessageData) — 송신자 본인도 수신한다.
export interface ServerMessageData {
  roomId: string
  id: string
  senderId: string
  body: string
  ts: number
}

export interface AckData {
  clientMsgId: string
  id: string
}

export interface ServerTypingData {
  roomId: string
  userId: string
  isTyping: boolean
}

// 방 roster (§5.2) — 식별 유저만, 익명 guest 제외 (§8.2).
export interface PresenceData {
  roomId: string
  users: string[]
}

// 전역 접속 수 (§5.3) — 연결 직후 1회 + 주기적.
export interface OnlineData {
  count: number
}

// 방 하드삭제 통지 (M7) — 에러 아님, 클라이언트는 해당 방 뷰를 정리한다.
export interface RoomClosedData {
  roomId: string
}

// WS error 프레임 코드 9종 (protocol.go 상수, docs/ERRORS.md §1).
export type WsErrorCode =
  | 'anonymous_forbidden'
  | 'bad_envelope'
  | 'bad_payload'
  | 'unknown_type'
  | 'rate_limited'
  | 'room_not_found'
  | 'not_joined'
  | 'message_too_large'
  | 'internal'

export interface WsErrorData {
  code: WsErrorCode
  message: string
}

// type으로 좁혀지는 discriminated union — 수신 switch에서 누락 시 컴파일 에러.
export type ServerFrame =
  | { type: 'joined'; data: JoinedData; ts?: number }
  | { type: 'message'; data: ServerMessageData; ts?: number }
  | { type: 'ack'; data: AckData; ts?: number }
  | { type: 'typing'; data: ServerTypingData; ts?: number }
  | { type: 'presence'; data: PresenceData; ts?: number }
  | { type: 'online'; data: OnlineData; ts?: number }
  | { type: 'room_closed'; data: RoomClosedData; ts?: number }
  | { type: 'pong'; data?: Record<string, never>; ts?: number }
  | { type: 'error'; data: WsErrorData; ts?: number }

export type ServerFrameType = ServerFrame['type']
