import { useChatStore } from '../store/useChatStore'
import panel from '../styles/panel.module.css'
import styles from './PresencePanel.module.css'

interface Props {
  roomId: string
}

const EMPTY: string[] = []

// 활성 방 roster(presence, 식별 유저만) + 전역 접속 수(online) 표시 (PLAN §5.2/§5.3).
// presence는 멤버십 변동 시 서버가 최대 5s 주기로 재전송하므로 약간의 지연이 있을 수 있다.
export default function PresencePanel({ roomId }: Props) {
  const users = useChatStore((s) => s.presenceByRoom[roomId] ?? EMPTY)
  const online = useChatStore((s) => s.online)
  const myUserId = useChatStore((s) => s.identity?.userId)

  return (
    <div className={styles.presence}>
      <div className={panel.row}>
        <span className={styles.heading}>Presence</span>
        <span className={panel.muted}>
          전체 접속 {online ?? '—'}
          {online !== null && '명'}
        </span>
      </div>
      {users.length === 0 ? (
        <p className={panel.muted}>이 방의 식별 멤버가 없습니다. (익명은 roster에서 제외)</p>
      ) : (
        <ul className={styles.roster}>
          {users.map((u) => (
            <li key={u} className={u === myUserId ? styles.meChip : styles.chip}>
              <span className={panel.mono}>{u}</span>
              {u === myUserId && <span className={styles.meTag}>나</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
