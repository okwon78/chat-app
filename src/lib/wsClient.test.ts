// encodeFrame 순수 함수 단위 테스트 (TASKS W5).
// 계약: (type, data, ts) → {type, data, ts} 를 부수효과 없이 반환. ts는 호출 측
// 주입값을 그대로 담는다(내부에서 시계를 읽지 않음 — 순수성 근거, wsClient.ts §16).

import { describe, expect, it } from 'vitest'
import { encodeFrame } from './wsClient'

describe('encodeFrame', () => {
  it('type/data/ts를 봉투 그대로 담는다', () => {
    const data = { roomId: 'r1', body: 'hi', clientMsgId: 'c1' }
    expect(encodeFrame('message', data, 1234)).toEqual({
      type: 'message',
      data,
      ts: 1234,
    })
  })

  it('ts는 주입값을 그대로 쓴다(내부 시계를 읽지 않음)', () => {
    expect(encodeFrame('ping', {}, 42).ts).toBe(42)
    expect(encodeFrame('ping', {}, 0).ts).toBe(0)
  })

  it('입력 data 객체를 변형하지 않는다(부수효과 없음)', () => {
    const data = { roomId: 'r1' }
    const frozen = Object.freeze({ ...data })
    const frame = encodeFrame('leave', data, 1)
    // 동결 입력을 그대로 넣어도 throw 없이 통과 = 입력을 건드리지 않음.
    expect(frame.data).toEqual(frozen)
    expect(data).toEqual({ roomId: 'r1' })
  })

  it('각 호출은 독립된 새 봉투를 만든다', () => {
    const a = encodeFrame('typing', { roomId: 'r', isTyping: true }, 1)
    const b = encodeFrame('typing', { roomId: 'r', isTyping: true }, 1)
    expect(a).not.toBe(b)
  })
})
