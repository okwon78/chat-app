import { useEffect, useState } from 'react'
import { useChatStore } from '../store/useChatStore'
import type { User } from '../types/models'
import panel from '../styles/panel.module.css'
import styles from './IdentityBar.module.css'

interface Props {
  // 유저 목록(UserManager)에서 클릭한 유저 — 입력칸을 채운다 (직접 입력도 가능)
  selectedUser: User | null
}

const STATE_LABEL = {
  idle: '미연결',
  connecting: '연결 중…',
  open: '연결됨',
  closed: '종료됨',
} as const

// WS 연결 신원 입력 + [연결]/[해제]/[ping] + connState 표시 (PLAN §6 상단 바).
// userId를 비우면 익명(guest, 읽기 전용)으로 연결된다 — 서버가 무검증 신뢰(§8).
export default function IdentityBar({ selectedUser }: Props) {
  const connState = useChatStore((s) => s.connState)
  const identity = useChatStore((s) => s.identity)
  const online = useChatStore((s) => s.online)
  const connect = useChatStore((s) => s.connect)
  const disconnect = useChatStore((s) => s.disconnect)
  const ping = useChatStore((s) => s.ping)

  const [userId, setUserId] = useState('')
  const [name, setName] = useState('')

  useEffect(() => {
    if (selectedUser) {
      setUserId(selectedUser.id)
      setName(selectedUser.displayName)
    }
  }, [selectedUser])

  const open = connState === 'open'
  const connecting = connState === 'connecting'

  return (
    <section className={styles.bar}>
      <span className={`${styles.state} ${styles[connState]}`}>{STATE_LABEL[connState]}</span>

      <input
        className={`${panel.input} ${panel.mono} ${styles.userIdInput}`}
        placeholder="userId (비우면 익명·읽기 전용)"
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
      />
      <input
        className={panel.input}
        placeholder="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <button
        className={panel.btn}
        onClick={() => connect({ userId: userId.trim(), name: name.trim() })}
        disabled={connecting}
        title="기존 연결이 있으면 끊고 이 신원으로 다시 연결"
      >
        {open || connecting ? '재연결' : '연결'}
      </button>
      <button className={panel.btn} onClick={disconnect} disabled={!open && !connecting}>
        해제
      </button>
      <button
        className={panel.btn}
        onClick={ping}
        disabled={!open}
        title="ping 송신 → pong 수신을 RawLog에서 확인"
      >
        ping
      </button>

      {open && identity && (
        <span className={panel.muted}>
          {identity.userId ? (
            <>
              <span className={panel.mono}>{identity.userId}</span>
              {identity.name && ` (${identity.name})`}
            </>
          ) : (
            '익명 (읽기 전용)'
          )}
        </span>
      )}

      {/* 전역 접속 수(online 프레임, §5.3) — 우측 정렬 */}
      <span className={`${styles.online} ${panel.muted}`}>
        전체 접속 {online ?? '—'}
        {online !== null && '명'}
      </span>
    </section>
  )
}
