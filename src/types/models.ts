// REST 모델 타입 — 서버 원본과 1:1 미러 (변경 시 서버부터 확인):
//   Room/Member: ../chat-server/internal/room/room.go
//   User:        ../chat-server/internal/store/postgres/users.go
//   에러 규격:    ../chat-server/docs/ERRORS.md
// Go time.Time은 JSON에서 RFC3339 문자열로 직렬화된다 → string.

export interface Room {
  id: string
  name: string
  ownerId: string
  isPrivate: boolean
  createdAt: string
}

export interface Member {
  roomId: string
  userId: string
  role: string
  joinedAt: string
}

export interface User {
  id: string
  displayName: string
  createdAt: string
}

// GET /healthz — 200(ok) / 503(unhealthy) 모두 이 형태의 본문을 가진다.
export interface HealthResponse {
  status: 'ok' | 'unhealthy'
  checks: {
    postgres: 'ok' | 'down'
    redis: 'ok' | 'down'
  }
}

// REST 에러 본문: { error: { code, message } } (ERRORS.md §2).
// 분기는 반드시 code로 한다 — message는 변할 수 있다.
export interface ApiErrorBody {
  error: {
    code: string
    message: string
  }
}

// 비2xx 응답을 나타내는 예외. 서버가 JSON 에러 본문을 주지 않는 경로
// (예: test API off 시 mux의 텍스트 404)는 code가 `http_<status>`로 채워진다.
export class ApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}
