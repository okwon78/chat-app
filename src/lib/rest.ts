// REST 클라이언트 (PLAN §5.3) — 상대경로로 호출해 Vite dev proxy를 경유한다.
// 라우트 원본: ../chat-server/internal/api/api.go Routes().

import { ApiError } from '../types/models'
import type { ApiErrorBody, HealthResponse, Member, Room, User } from '../types/models'

// 비2xx면 {error:{code,message}}를 파싱해 ApiError를 던진다. 본문이 그 형태가
// 아니면(JSON이 아니거나 다른 모양) code를 `http_<status>`로 대체한다.
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text()
    let code = `http_${res.status}`
    let message = text || res.statusText
    try {
      const parsed = JSON.parse(text) as Partial<ApiErrorBody>
      if (parsed.error?.code) {
        code = parsed.error.code
        message = parsed.error.message ?? message
      }
    } catch {
      // JSON 본문이 아닌 에러(예: mux의 "404 page not found") — http_<status> 유지
    }
    throw new ApiError(code, message, res.status)
  }

  if (res.status === 204) {
    return undefined as T
  }
  return (await res.json()) as T
}

// --- 방 관리 (§11) ---

export async function listRooms(): Promise<Room[]> {
  const res = await request<{ rooms: Room[] | null }>('GET', '/api/rooms')
  return res.rooms ?? []
}

export function createRoom(name: string, ownerId: string, isPrivate: boolean): Promise<Room> {
  return request<Room>('POST', '/api/rooms', { name, ownerId, isPrivate })
}

export function getRoom(id: string): Promise<Room> {
  return request<Room>('GET', `/api/rooms/${encodeURIComponent(id)}`)
}

// owner만 가능 (403 forbidden). 성공 시 204.
export function deleteRoom(id: string, ownerId: string): Promise<void> {
  return request<void>(
    'DELETE',
    `/api/rooms/${encodeURIComponent(id)}?userId=${encodeURIComponent(ownerId)}`,
  )
}

export function joinRoom(id: string, userId: string): Promise<Member> {
  return request<Member>('POST', `/api/rooms/${encodeURIComponent(id)}/join`, { userId })
}

// --- test API (§11.1) — ENABLE_TEST_API=true 아니면 404 (JSON 아님 → http_404) ---

export function createUser(displayName: string): Promise<User> {
  return request<User>('POST', '/api/test/users', { displayName })
}

export async function listUsers(): Promise<User[]> {
  const res = await request<{ users: User[] | null }>('GET', '/api/test/users')
  return res.users ?? []
}

// --- health ---

// /healthz는 unhealthy여도 503 + 같은 형태의 JSON 본문을 준다 → request<T>의
// 에러 경로를 타지 않고 직접 파싱한다. (네트워크 실패는 fetch가 reject)
export async function health(): Promise<HealthResponse> {
  const res = await fetch('/healthz')
  return (await res.json()) as HealthResponse
}
