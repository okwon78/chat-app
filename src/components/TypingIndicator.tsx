import { useChatStore } from '../store/useChatStore'
import styles from './ChatRoom.module.css'

interface Props {
  roomId: string
}

const EMPTY: string[] = []

// 방의 현재 입력중 유저 표시 (typing 프레임). 서버가 송신자를 제외해 보내지만
// 방어적으로 자기 자신은 걸러낸다. 높이 점프 방지를 위해 빈 상태에도 자리를 유지.
export default function TypingIndicator({ roomId }: Props) {
  const typing = useChatStore((s) => s.typingByRoom[roomId] ?? EMPTY)
  const myUserId = useChatStore((s) => s.identity?.userId)

  const others = typing.filter((u) => u !== myUserId)
  const label =
    others.length === 0
      ? ''
      : others.length === 1
        ? `${others[0]} 님이 입력 중…`
        : others.length === 2
          ? `${others[0]}, ${others[1]} 님이 입력 중…`
          : `${others[0]} 외 ${others.length - 1}명이 입력 중…`

  return (
    <p className={styles.typing} aria-live="polite">
      {label || ' '}
    </p>
  )
}
