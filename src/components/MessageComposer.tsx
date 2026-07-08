import { useEffect, useRef, useState } from 'react'
import { useChatStore } from '../store/useChatStore'
import panel from '../styles/panel.module.css'
import styles from './ChatRoom.module.css'

interface Props {
  roomId: string
}

// 서버 message body 상한 (handler.go maxBodyBytes). 근접/초과 표시에만 쓰고
// 전송 자체는 막지 않는다 — message_too_large 에러 경로 재현이 테스트 항목(W5).
const MAX_BODY_BYTES = 4096
const COUNTER_SHOW_FROM = MAX_BODY_BYTES * 0.75

// 입력이 이 시간 동안 멈추면 typing=false를 보낸다(전송/blur 시에도 즉시 false).
const TYPING_IDLE_MS = 3000

const encoder = new TextEncoder()

// body 입력 + clientMsgId(crypto.randomUUID) 생성·전송, pending(전송중→전송됨) 표시,
// 그리고 typing 프레임 디바운스 송신(join+식별 유저일 때만 — 아니면 서버가 에러).
export default function MessageComposer({ roomId }: Props) {
  const connState = useChatStore((s) => s.connState)
  const sendChatMessage = useChatStore((s) => s.sendChatMessage)
  const sendTyping = useChatStore((s) => s.sendTyping)
  const pendingSends = useChatStore((s) => s.pendingSends)
  const joined = useChatStore((s) => s.joinedRooms.has(roomId))
  const isAnon = useChatStore((s) => !s.identity?.userId)
  const [body, setBody] = useState('')

  const bytes = encoder.encode(body).length
  const canSend = connState === 'open' && body.length > 0
  // typing 송신 조건: open + join 완료 + 식별 유저(익명/미join은 서버가 거절).
  const canType = connState === 'open' && joined && !isAnon
  // 이 방의 최근 전송 상태 — 전송중이 남아 있으면 ack 미수신(에러는 RawLog 확인).
  const roomPending = pendingSends.filter((p) => p.roomId === roomId).slice(-3)

  // 마지막으로 서버에 알린 typing 상태 + idle 타이머. React 상태가 아니라 ref로.
  const typingActive = useRef(false)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stopTyping = () => {
    if (idleTimer.current) {
      clearTimeout(idleTimer.current)
      idleTimer.current = null
    }
    if (typingActive.current) {
      typingActive.current = false
      if (canType) sendTyping(roomId, false)
    }
  }

  // 입력 발생 → typing=true(상승엣지 1회) + idle 타이머 리셋.
  function noteTyping() {
    if (!canType) return
    if (!typingActive.current) {
      typingActive.current = true
      sendTyping(roomId, true)
    }
    if (idleTimer.current) clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(stopTyping, TYPING_IDLE_MS)
  }

  // 방 전환/언마운트/연결 종료 시 idle 타이머 정리(스테일 false 송신 방지).
  useEffect(() => {
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current)
      idleTimer.current = null
      typingActive.current = false
    }
  }, [roomId])

  function handleSend() {
    if (!canSend) return
    stopTyping() // 전송 시 입력 종료 → typing 해제
    sendChatMessage(roomId, body)
    setBody('')
  }

  return (
    <div className={styles.composer}>
      <div className={panel.row}>
        <textarea
          className={`${panel.input} ${styles.composerInput}`}
          placeholder={
            connState === 'open' ? '메시지 (Enter 전송, Shift+Enter 줄바꿈)' : '연결 후 전송 가능'
          }
          value={body}
          rows={2}
          disabled={connState !== 'open'}
          onChange={(e) => {
            setBody(e.target.value)
            noteTyping()
          }}
          onBlur={stopTyping}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              handleSend()
            }
          }}
        />
        <button className={panel.btn} onClick={handleSend} disabled={!canSend}>
          전송
        </button>
      </div>

      {bytes >= COUNTER_SHOW_FROM && (
        <p className={bytes > MAX_BODY_BYTES ? panel.noticeError : panel.noticeOk}>
          {bytes} / {MAX_BODY_BYTES} bytes
          {bytes > MAX_BODY_BYTES && ' — 초과: 전송 시 message_too_large 에러'}
        </p>
      )}

      {roomPending.length > 0 && (
        <ul className={styles.pendingList}>
          {roomPending.map((p) => (
            <li key={p.clientMsgId} className={panel.muted}>
              {p.state === 'sending' ? '전송중…' : '전송됨'}{' '}
              <span className={panel.mono}>
                {p.body.length > 24 ? `${p.body.slice(0, 24)}…` : p.body}
              </span>{' '}
              {p.state === 'acked' ? (
                <span className={panel.mono}>→ id={p.id}</span>
              ) : (
                <span className={panel.mono}>(clientMsgId={p.clientMsgId.slice(0, 8)}…)</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
