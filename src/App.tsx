import { useState } from 'react'
import HealthBadge from './components/HealthBadge'
import IdentityBar from './components/IdentityBar'
import UserManager from './components/UserManager'
import RoomManager from './components/RoomManager'
import ChatRoom from './components/ChatRoom'
import RawLogPanel from './components/RawLogPanel'
import ToastHost from './components/ToastHost'
import type { User } from './types/models'
import styles from './App.module.css'

// 헤더 + sticky IdentityBar(WS 연결/online) + 2컬럼(관리 콘솔 | 채팅+RawLog) + 토스트.
// 유저 목록 클릭 → IdentityBar 입력칸을 채우고, 방 목록 [채팅] → 활성 방.
// W4: presence/typing은 ChatRoom 안에서, error/room_closed는 ToastHost로 통지.
function App() {
  const [selectedUser, setSelectedUser] = useState<User | null>(null)

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1 className={styles.title}>chat-web</h1>
        <HealthBadge />
      </header>

      <IdentityBar selectedUser={selectedUser} />

      <main className={styles.grid}>
        <div className={styles.column}>
          <UserManager selectedUserId={selectedUser?.id ?? null} onSelectUser={setSelectedUser} />
          <RoomManager selectedUserId={selectedUser?.id ?? null} />
        </div>
        <div className={styles.column}>
          <ChatRoom />
          <RawLogPanel />
        </div>
      </main>

      <ToastHost />
    </div>
  )
}

export default App
