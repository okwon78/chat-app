// store 프레임 리듀서 단위 테스트 (TASKS W5) — joined 세팅 / message dedup /
// room_closed 정리를 중심으로.
//
// reduceFrame은 store 생성 시 wsClient.on(...)의 onFrame으로 등록되는 클로저라
// 직접 export되지 않는다. 실제 경로 그대로 검증하려고 전역 WebSocket을 모킹해
// connect → 소켓 onmessage로 서버 프레임을 흘려보낸다(= 실제 인바운드 흐름).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ServerFrame } from '../types/protocol'

// wsClient.connect가 조립하는 ws:// URL의 host/scheme 출처.
vi.stubGlobal('window', { location: { protocol: 'http:', host: 'localhost' } })

// 최소 WebSocket 모킹 — wsClient가 쓰는 핸들러/필드만. 마지막 인스턴스를 노출해
// 테스트에서 open/message를 구동한다.
class MockWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  static last: MockWebSocket | null = null

  readyState = MockWebSocket.CONNECTING
  onopen: (() => void) | null = null
  onclose: ((ev: { code: number; reason: string }) => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  readonly url: string

  constructor(url: string) {
    this.url = url
    MockWebSocket.last = this
  }
  send(): void {}
  close(): void {
    this.readyState = MockWebSocket.CLOSED
  }

  // --- 테스트 구동 헬퍼 ---
  open(): void {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.()
  }
  deliver(frame: ServerFrame): void {
    this.onmessage?.({ data: JSON.stringify(frame) })
  }
}

vi.stubGlobal('WebSocket', MockWebSocket)

// 스텁이 자리잡은 뒤 import(모듈 로드 시 window/WebSocket 접근은 없지만 순서 명시).
const { useChatStore } = await import('./useChatStore')

// connect 후 열린 소켓을 돌려준다. connect가 이전 상태(joinedRooms/pending)를 리셋한다.
function connectAndOpen(userId = 'u-self'): MockWebSocket {
  useChatStore.getState().connect({ userId, name: 'self' })
  const ws = MockWebSocket.last
  if (!ws) throw new Error('mock socket not created')
  ws.open()
  return ws
}

beforeEach(() => {
  // 리듀서가 건드리는 상태를 초기값으로 되돌린다(싱글턴 store라 테스트 간 격리).
  useChatStore.setState({
    activeRoomId: null,
    joinedRooms: new Set<string>(),
    messagesByRoom: {},
    pendingSends: [],
    presenceByRoom: {},
    online: null,
    typingByRoom: {},
    toasts: [],
    rawLog: [],
  })
})

afterEach(() => {
  useChatStore.getState().disconnect()
  vi.clearAllTimers()
})

describe('joined 리듀서', () => {
  it('recent를 방 메시지로 세팅하고 joinedRooms에 추가한다', () => {
    const ws = connectAndOpen()
    ws.deliver({
      type: 'joined',
      data: {
        roomId: 'r1',
        recent: [{ id: '1-0', senderId: 'a', body: 'hello', ts: 1 }],
      },
    })
    const s = useChatStore.getState()
    expect(s.joinedRooms.has('r1')).toBe(true)
    expect(s.messagesByRoom['r1']).toEqual([{ id: '1-0', senderId: 'a', body: 'hello', ts: 1 }])
  })

  it('recent가 null이면 빈 배열로 방어한다', () => {
    const ws = connectAndOpen()
    // Go nil 슬라이스가 null로 마샬될 수 있음(빈 방).
    ws.deliver({ type: 'joined', data: { roomId: 'r1', recent: null as never } })
    expect(useChatStore.getState().messagesByRoom['r1']).toEqual([])
    expect(useChatStore.getState().joinedRooms.has('r1')).toBe(true)
  })

  it('재join은 replace라 중복이 쌓이지 않는다', () => {
    const ws = connectAndOpen()
    const recent = [{ id: '1-0', senderId: 'a', body: 'hi', ts: 1 }]
    ws.deliver({ type: 'joined', data: { roomId: 'r1', recent } })
    ws.deliver({ type: 'joined', data: { roomId: 'r1', recent } })
    expect(useChatStore.getState().messagesByRoom['r1']).toHaveLength(1)
  })
})

describe('message 리듀서', () => {
  it('방 메시지에 append한다', () => {
    const ws = connectAndOpen()
    ws.deliver({ type: 'joined', data: { roomId: 'r1', recent: [] } })
    ws.deliver({
      type: 'message',
      data: { roomId: 'r1', id: '2-0', senderId: 'a', body: 'x', ts: 2 },
    })
    expect(useChatStore.getState().messagesByRoom['r1']).toEqual([
      { id: '2-0', senderId: 'a', body: 'x', ts: 2 },
    ])
  })

  it('같은 서버 id는 dedup한다(자기 송신 브로드캐스트 중복 방지)', () => {
    const ws = connectAndOpen()
    ws.deliver({ type: 'joined', data: { roomId: 'r1', recent: [] } })
    const frame: ServerFrame = {
      type: 'message',
      data: { roomId: 'r1', id: '2-0', senderId: 'a', body: 'x', ts: 2 },
    }
    ws.deliver(frame)
    ws.deliver(frame)
    expect(useChatStore.getState().messagesByRoom['r1']).toHaveLength(1)
  })

  it('joined 없이 도착한 방도 새 배열로 시작한다', () => {
    const ws = connectAndOpen()
    ws.deliver({
      type: 'message',
      data: { roomId: 'r9', id: '5-0', senderId: 'b', body: 'y', ts: 5 },
    })
    expect(useChatStore.getState().messagesByRoom['r9']).toHaveLength(1)
  })
})

describe('ack 리듀서', () => {
  it('clientMsgId가 일치하는 pending을 acked로 확정한다', () => {
    const ws = connectAndOpen()
    useChatStore.setState({
      pendingSends: [{ clientMsgId: 'c1', roomId: 'r1', body: 'x', at: 0, state: 'sending' }],
    })
    ws.deliver({ type: 'ack', data: { clientMsgId: 'c1', id: '9-0' } })
    const p = useChatStore.getState().pendingSends[0]
    expect(p.state).toBe('acked')
    expect(p.id).toBe('9-0')
  })
})

describe('online 리듀서', () => {
  it('전역 count를 갱신한다', () => {
    const ws = connectAndOpen()
    ws.deliver({ type: 'online', data: { count: 3 } })
    expect(useChatStore.getState().online).toBe(3)
  })
})

describe('room_closed 리듀서', () => {
  it('해당 방의 joined/messages/presence/typing을 걷어내고 activeRoom을 해제한다', () => {
    const ws = connectAndOpen()
    ws.deliver({
      type: 'joined',
      data: { roomId: 'r1', recent: [{ id: '1-0', senderId: 'a', body: 'h', ts: 1 }] },
    })
    ws.deliver({ type: 'presence', data: { roomId: 'r1', users: ['a', 'b'] } })
    ws.deliver({ type: 'typing', data: { roomId: 'r1', userId: 'b', isTyping: true } })
    useChatStore.setState({ activeRoomId: 'r1' })

    ws.deliver({ type: 'room_closed', data: { roomId: 'r1' } })

    const s = useChatStore.getState()
    expect(s.joinedRooms.has('r1')).toBe(false)
    expect(s.messagesByRoom['r1']).toBeUndefined()
    expect(s.presenceByRoom['r1']).toBeUndefined()
    expect(s.typingByRoom['r1']).toBeUndefined()
    expect(s.activeRoomId).toBeNull()
  })

  it('info 토스트를 남기고, 다른 방 상태는 건드리지 않는다', () => {
    const ws = connectAndOpen()
    ws.deliver({ type: 'joined', data: { roomId: 'r1', recent: [] } })
    ws.deliver({ type: 'joined', data: { roomId: 'r2', recent: [] } })
    useChatStore.setState({ activeRoomId: 'r2' })

    ws.deliver({ type: 'room_closed', data: { roomId: 'r1' } })

    const s = useChatStore.getState()
    expect(s.joinedRooms.has('r2')).toBe(true)
    expect(s.activeRoomId).toBe('r2') // 닫힌 방이 아니면 유지
    expect(s.toasts).toHaveLength(1)
    expect(s.toasts[0].kind).toBe('info')
  })
})

describe('error 리듀서', () => {
  it('error 프레임은 error 토스트를 만든다', () => {
    const ws = connectAndOpen()
    ws.deliver({ type: 'error', data: { code: 'not_joined', message: 'x' } })
    const t = useChatStore.getState().toasts
    expect(t).toHaveLength(1)
    expect(t[0].kind).toBe('error')
  })
})

describe('연결 종료 정리', () => {
  it('disconnect 시 joined/presence/typing/online을 비운다(서버 주도 상태)', () => {
    const ws = connectAndOpen()
    ws.deliver({ type: 'joined', data: { roomId: 'r1', recent: [] } })
    ws.deliver({ type: 'presence', data: { roomId: 'r1', users: ['a'] } })
    ws.deliver({ type: 'online', data: { count: 2 } })

    useChatStore.getState().disconnect()

    const s = useChatStore.getState()
    expect(s.joinedRooms.size).toBe(0)
    expect(s.presenceByRoom).toEqual({})
    expect(s.typingByRoom).toEqual({})
    expect(s.online).toBeNull()
  })
})
