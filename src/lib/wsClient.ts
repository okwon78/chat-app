// WS 클라이언트 (PLAN §5.2) — 얇은 래퍼. 상대 경로 /ws로 붙어 Vite dev proxy를
// 경유한다(같은 origin의 host를 ws(s) 스킴으로 조립). 프레임 스키마는
// src/types/protocol.ts (서버 protocol.go 미러).

import type { ClientDataMap, ClientFrameType, Envelope, ServerFrame } from '../types/protocol'

export type ConnState = 'idle' | 'connecting' | 'open' | 'closed'

// 연결 신원 (?userId=&name=) — 서버 identity.go가 무검증으로 신뢰한다(§8).
// userId가 빈 문자열이면 파라미터를 생략해 익명(guest, 읽기 전용)으로 연결.
export interface WsIdentity {
  userId: string
  name: string
}

// 순수 인코딩 함수 (TASKS W2) — 부수효과 없음. 순수성을 위해 ts(unix 초)는
// 호출 측이 주입한다. 서버는 인바운드 ts를 읽지 않지만 PLAN §6 봉투 규격을 따른다.
export function encodeFrame<T extends ClientFrameType>(
  type: T,
  data: ClientDataMap[T],
  ts: number,
): Envelope {
  return { type, data, ts }
}

export type LogDir = 'in' | 'out' | 'meta'

// 이벤트 수신자 — store가 구현한다(W2: rawLog/connState, W3: onFrame 리듀서).
export interface WsClientHandler {
  onState?: (state: ConnState) => void
  // 인/아웃 프레임 원문 + 연결 수립/종료 같은 부가 이벤트(meta). RawLog의 소스.
  onRaw?: (dir: LogDir, text: string, frameType?: string) => void
  onFrame?: (frame: ServerFrame) => void
}

export class WsClient {
  private ws: WebSocket | null = null
  private handler: WsClientHandler = {}
  private _state: ConnState = 'idle'

  get state(): ConnState {
    return this._state
  }

  on(handler: WsClientHandler): void {
    this.handler = handler
  }

  // 기존 연결이 있으면 끊고 새 신원으로 다시 연결한다.
  connect(identity: WsIdentity): void {
    this.close()

    const params = new URLSearchParams()
    if (identity.userId) params.set('userId', identity.userId)
    if (identity.name) params.set('name', identity.name)
    const qs = params.toString()
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const url = `${scheme}://${window.location.host}/ws${qs ? `?${qs}` : ''}`

    this.setState('connecting')
    this.handler.onRaw?.('meta', `연결 시도 → ${url}${identity.userId ? '' : ' (익명)'}`)

    const ws = new WebSocket(url)
    this.ws = ws

    // 각 콜백은 `this.ws === ws` 가드로 재연결 후 도착하는 stale 이벤트를 걸러낸다.
    ws.onopen = () => {
      if (this.ws !== ws) return
      this.handler.onRaw?.('meta', '연결됨')
      this.setState('open')
    }
    ws.onclose = (ev) => {
      if (this.ws !== ws) return
      this.ws = null
      // 핸드셰이크 거절(예: ALLOW_ANONYMOUS=false → HTTP 401)도 이 경로로 온다
      // — 브라우저는 HTTP 상태를 노출하지 않으므로 close code만 남는다.
      this.handler.onRaw?.(
        'meta',
        `연결 종료 (code=${ev.code}${ev.reason ? `, reason=${ev.reason}` : ''})`,
      )
      this.setState('closed')
    }
    ws.onerror = () => {
      if (this.ws !== ws) return
      this.handler.onRaw?.('meta', '소켓 오류 — 상세는 이어지는 종료 code 참고')
    }
    ws.onmessage = (ev) => {
      if (this.ws !== ws) return
      const text = typeof ev.data === 'string' ? ev.data : String(ev.data)
      let frame: ServerFrame | null = null
      try {
        const parsed: unknown = JSON.parse(text)
        if (parsed !== null && typeof parsed === 'object' && 'type' in parsed) {
          frame = parsed as ServerFrame
        }
      } catch {
        // JSON 아님 — 아래 meta 로그로만 남긴다
      }
      if (frame) {
        this.handler.onRaw?.('in', text, frame.type)
        this.handler.onFrame?.(frame)
      } else {
        this.handler.onRaw?.('meta', `파싱 불가 프레임: ${text}`)
      }
    }
  }

  // open이 아니면 보내지 않고 false — 호출 실수도 RawLog에서 보이게 meta로 남긴다.
  send<T extends ClientFrameType>(type: T, data: ClientDataMap[T]): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.handler.onRaw?.('meta', `send(${type}) 무시됨 — 연결이 open 상태가 아님`)
      return false
    }
    const text = JSON.stringify(encodeFrame(type, data, Math.floor(Date.now() / 1000)))
    this.ws.send(text)
    this.handler.onRaw?.('out', text, type)
    return true
  }

  close(): void {
    const ws = this.ws
    if (!ws) return
    // 콜백을 먼저 떼어 이 소켓의 이후 이벤트가 새 연결 상태를 덮지 않게 한다.
    this.ws = null
    ws.onopen = ws.onclose = ws.onerror = ws.onmessage = null
    ws.close()
    this.handler.onRaw?.('meta', '연결 해제 (클라이언트 요청)')
    this.setState('closed')
  }

  // --- 편의 함수 (PLAN §5.2) ---

  join(roomId: string, lastSeenId?: string): boolean {
    return this.send('join', lastSeenId ? { roomId, lastSeenId } : { roomId })
  }

  leave(roomId: string): boolean {
    return this.send('leave', { roomId })
  }

  sendMessage(roomId: string, body: string, clientMsgId: string): boolean {
    return this.send('message', { roomId, body, clientMsgId })
  }

  typing(roomId: string, isTyping: boolean): boolean {
    return this.send('typing', { roomId, isTyping })
  }

  ping(): boolean {
    return this.send('ping', {})
  }

  private setState(state: ConnState): void {
    this._state = state
    this.handler.onState?.(state)
  }
}
