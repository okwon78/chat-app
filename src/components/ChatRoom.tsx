import { useChatStore } from '../store/useChatStore'
import MessageList from './MessageList'
import MessageComposer from './MessageComposer'
import PresencePanel from './PresencePanel'
import TypingIndicator from './TypingIndicator'
import panel from '../styles/panel.module.css'

// 활성 방 컨테이너 (PLAN §6) — WS join/leave + Presence + MessageList + typing + Composer.
// join 없이도 전송은 가능하게 둔다(not_joined 에러 경로 재현이 테스트 항목, W5).
export default function ChatRoom() {
  const activeRoomId = useChatStore((s) => s.activeRoomId)
  const rooms = useChatStore((s) => s.rooms)
  const connState = useChatStore((s) => s.connState)
  const joinedRooms = useChatStore((s) => s.joinedRooms)
  const wsJoin = useChatStore((s) => s.wsJoin)
  const wsLeave = useChatStore((s) => s.wsLeave)

  if (!activeRoomId) {
    return (
      <section className={panel.panel}>
        <h2 className={panel.panelTitle}>채팅</h2>
        <p className={panel.muted}>방 목록에서 [채팅]을 눌러 방을 선택하세요.</p>
      </section>
    )
  }

  const room = rooms.find((r) => r.id === activeRoomId)
  const joined = joinedRooms.has(activeRoomId)
  const open = connState === 'open'

  return (
    <section className={panel.panel}>
      <div className={panel.row}>
        <h2 className={panel.panelTitle}>채팅 — {room?.name ?? '(이름 미상)'}</h2>
        <span className={`${panel.mono} ${panel.muted}`}>{activeRoomId}</span>
        <span className={joined ? panel.noticeOk : panel.muted}>
          {joined ? 'joined' : 'not joined'}
        </span>
        <button
          className={panel.btnSmall}
          onClick={() => wsJoin(activeRoomId)}
          disabled={!open}
          title="WS join — joined 프레임의 recent로 히스토리를 받는다"
        >
          join
        </button>
        <button
          className={panel.btnSmall}
          onClick={() => wsLeave(activeRoomId)}
          disabled={!open || !joined}
        >
          leave
        </button>
      </div>

      {!open && <p className={panel.muted}>IdentityBar에서 연결한 뒤 join하세요.</p>}
      {open && !joined && (
        <p className={panel.muted}>
          join 전입니다 — 이 상태로 전송하면 not_joined 에러를 재현할 수 있습니다 (RawLog 확인).
        </p>
      )}

      <PresencePanel roomId={activeRoomId} />
      <MessageList roomId={activeRoomId} />
      <TypingIndicator roomId={activeRoomId} />
      <MessageComposer roomId={activeRoomId} />
    </section>
  )
}
