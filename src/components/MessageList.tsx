import { useEffect, useRef } from 'react'
import { useChatStore } from '../store/useChatStore'
import type { ChatMessage } from '../store/useChatStore'
import panel from '../styles/panel.module.css'
import styles from './ChatRoom.module.css'

interface Props {
  roomId: string
}

// 선택자가 매번 새 배열을 만들면 리렌더 루프가 되므로 빈 방은 공용 상수로.
const EMPTY: ChatMessage[] = []

function formatTs(tsSec: number): string {
  const d = new Date(tsSec * 1000)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

// 활성 방의 메시지 렌더 (senderId/본문/ts/id) + 새 메시지 시 자동 스크롤.
export default function MessageList({ roomId }: Props) {
  const messages = useChatStore((s) => s.messagesByRoom[roomId] ?? EMPTY)
  const myUserId = useChatStore((s) => s.identity?.userId)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  return (
    <div ref={scrollRef} className={styles.messageList}>
      {messages.length === 0 ? (
        <p className={panel.muted}>메시지가 없습니다. join하면 recent 히스토리를 받아옵니다.</p>
      ) : (
        messages.map((m) => (
          <div key={m.id} className={m.senderId === myUserId ? styles.messageMine : styles.message}>
            <div className={styles.messageMeta}>
              <span className={styles.sender}>{m.senderId}</span>
              <span className={panel.muted}>{formatTs(m.ts)}</span>
              <span className={`${panel.mono} ${styles.msgId}`} title="서버 메시지 id (dedup 키)">
                {m.id}
              </span>
            </div>
            <div className={styles.messageBody}>{m.body}</div>
          </div>
        ))
      )}
    </div>
  )
}
