import { useCallback, useEffect, useState } from 'react'
import { createUser, listUsers } from '../lib/rest'
import { describeError } from '../lib/errorMessages'
import { ApiError } from '../types/models'
import type { User } from '../types/models'
import styles from '../styles/panel.module.css'

interface Props {
  selectedUserId: string | null
  // 목록 항목 클릭 시 호출 — W1에서는 App이 보관, W2에서 IdentityBar 연결에 사용
  onSelectUser: (user: User) => void
}

type Notice = { kind: 'ok' | 'error'; text: string } | null

// test API(/api/test/users) 기반 유저 생성/목록. 서버가 ENABLE_TEST_API=true
// 없이 기동되면 라우트 자체가 없어 404(JSON 아님) → 패널을 비활성화하고 안내한다.
export default function UserManager({ selectedUserId, onSelectUser }: Props) {
  const [users, setUsers] = useState<User[]>([])
  const [displayName, setDisplayName] = useState('')
  const [notice, setNotice] = useState<Notice>(null)
  const [testApiOff, setTestApiOff] = useState(false)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setUsers(await listUsers())
      setTestApiOff(false)
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setTestApiOff(true)
        return
      }
      setNotice({ kind: 'error', text: describeError(e) })
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function handleCreate() {
    const name = displayName.trim()
    if (!name) return
    setBusy(true)
    setNotice(null)
    try {
      const u = await createUser(name)
      setDisplayName('')
      setNotice({ kind: 'ok', text: `유저 생성됨: ${u.displayName} (${u.id})` })
      await refresh()
    } catch (e) {
      setNotice({ kind: 'error', text: describeError(e) })
    } finally {
      setBusy(false)
    }
  }

  if (testApiOff) {
    return (
      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>유저 (test API)</h2>
        <p className={styles.muted}>
          test API가 꺼져 있습니다 (404). 유저 생성/목록을 쓰려면 서버를{' '}
          <code>ENABLE_TEST_API=true</code>로 기동하세요. 지금은 userId를 직접 입력해서만 쓸 수
          있습니다.
        </p>
        <div className={styles.row}>
          <button className={styles.btn} onClick={refresh}>
            다시 확인
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className={styles.panel}>
      <h2 className={styles.panelTitle}>유저 (test API)</h2>

      <div className={styles.row}>
        <input
          className={styles.input}
          placeholder="displayName"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCreate()
          }}
        />
        <button
          className={styles.btn}
          onClick={handleCreate}
          disabled={busy || !displayName.trim()}
        >
          생성
        </button>
        <button className={styles.btn} onClick={refresh} disabled={busy}>
          새로고침
        </button>
      </div>

      {notice && (
        <p className={notice.kind === 'ok' ? styles.noticeOk : styles.noticeError}>{notice.text}</p>
      )}

      {users.length === 0 ? (
        <p className={styles.muted}>유저가 없습니다. displayName으로 생성하세요.</p>
      ) : (
        <ul className={styles.list}>
          {users.map((u) => (
            <li
              key={u.id}
              className={`${u.id === selectedUserId ? styles.listItemSelected : styles.listItem} ${styles.clickable}`}
              onClick={() => onSelectUser(u)}
              title="클릭하면 이 유저로 선택 (IdentityBar/RoomManager에서 사용)"
            >
              <strong>{u.displayName}</strong>
              <span className={styles.mono}>{u.id}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
