import { useCallback, useEffect, useState } from 'react'
import { createRoom, deleteRoom, getRoom, joinRoom, listRooms } from '../lib/rest'
import { describeError } from '../lib/errorMessages'
import { useChatStore } from '../store/useChatStore'
import type { Room } from '../types/models'
import styles from '../styles/panel.module.css'

interface Props {
  // 유저 목록에서 선택된 유저 — join의 userId, 삭제의 requestedBy로 쓴다.
  // owner가 아닌 유저를 선택하고 삭제를 누르면 403(forbidden) 경로를 재현할 수 있다.
  selectedUserId: string | null
}

type Notice = { kind: 'ok' | 'error'; text: string } | null

export default function RoomManager({ selectedUserId }: Props) {
  // 방 목록은 store에 둔다(W3) — ChatRoom이 활성 방 이름 조회에 함께 쓴다.
  const rooms = useChatStore((s) => s.rooms)
  const setRooms = useChatStore((s) => s.setRooms)
  const activeRoomId = useChatStore((s) => s.activeRoomId)
  const setActiveRoom = useChatStore((s) => s.setActiveRoom)
  const [name, setName] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [busy, setBusy] = useState(false)
  // roomId → 상세 조회 결과(getRoom). 행의 [상세] 토글로 채우고 비운다.
  const [detail, setDetail] = useState<Record<string, Room>>({})

  const refresh = useCallback(async () => {
    try {
      setRooms(await listRooms())
    } catch (e) {
      setNotice({ kind: 'error', text: describeError(e) })
    }
  }, [setRooms])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function run(action: () => Promise<string | null>) {
    setBusy(true)
    setNotice(null)
    try {
      const okText = await action()
      if (okText) setNotice({ kind: 'ok', text: okText })
      await refresh()
    } catch (e) {
      setNotice({ kind: 'error', text: describeError(e) })
    } finally {
      setBusy(false)
    }
  }

  function handleCreate() {
    run(async () => {
      const r = await createRoom(name.trim(), ownerId.trim(), isPrivate)
      setName('')
      return `방 생성됨: ${r.name} (${r.id})`
    })
  }

  function handleJoin(room: Room) {
    if (!selectedUserId) return
    run(async () => {
      const m = await joinRoom(room.id, selectedUserId)
      return `join 성공: ${m.userId} → ${room.name} (role=${m.role})`
    })
  }

  function handleDelete(room: Room) {
    if (!selectedUserId) return
    run(async () => {
      await deleteRoom(room.id, selectedUserId)
      if (room.id === activeRoomId) setActiveRoom(null)
      setDetail((d) => {
        const { [room.id]: _, ...rest } = d
        return rest
      })
      return `방 삭제됨: ${room.name}`
    })
  }

  async function toggleDetail(room: Room) {
    if (detail[room.id]) {
      setDetail((d) => {
        const { [room.id]: _, ...rest } = d
        return rest
      })
      return
    }
    try {
      const r = await getRoom(room.id)
      setDetail((d) => ({ ...d, [room.id]: r }))
    } catch (e) {
      setNotice({ kind: 'error', text: describeError(e) })
    }
  }

  const canCreate = !busy && name.trim() !== '' && ownerId.trim() !== ''

  return (
    <section className={styles.panel}>
      <h2 className={styles.panelTitle}>방 (REST)</h2>

      <div className={styles.row}>
        <input
          className={styles.input}
          placeholder="방 이름"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className={styles.input}
          placeholder="ownerId"
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value)}
        />
        <button
          className={styles.btnSmall}
          onClick={() => selectedUserId && setOwnerId(selectedUserId)}
          disabled={!selectedUserId}
          title="유저 목록에서 선택한 유저를 owner로"
        >
          선택 유저
        </button>
        <label className={styles.row}>
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
          />
          private
        </label>
        <button className={styles.btn} onClick={handleCreate} disabled={!canCreate}>
          생성
        </button>
        <button className={styles.btn} onClick={refresh} disabled={busy}>
          새로고침
        </button>
      </div>

      {notice && (
        <p className={notice.kind === 'ok' ? styles.noticeOk : styles.noticeError}>{notice.text}</p>
      )}
      {!selectedUserId && (
        <p className={styles.muted}>join/삭제는 유저 목록에서 유저를 먼저 선택해야 합니다.</p>
      )}

      {rooms.length === 0 ? (
        <p className={styles.muted}>방이 없습니다.</p>
      ) : (
        <ul className={styles.list}>
          {rooms.map((r) => (
            <li
              key={r.id}
              className={r.id === activeRoomId ? styles.listItemSelected : styles.listItem}
            >
              <strong>{r.name}</strong>
              {r.isPrivate && <span className={styles.muted}>private</span>}
              <span className={styles.mono}>{r.id}</span>
              <span className={styles.muted}>owner: {r.ownerId}</span>
              <button
                className={styles.btnSmall}
                onClick={() => setActiveRoom(r.id)}
                disabled={r.id === activeRoomId}
                title="이 방을 채팅 활성 방으로 (WS join은 채팅 패널에서)"
              >
                채팅
              </button>
              <button className={styles.btnSmall} onClick={() => toggleDetail(r)}>
                상세
              </button>
              <button
                className={styles.btnSmall}
                onClick={() => handleJoin(r)}
                disabled={busy || !selectedUserId}
                title="선택 유저로 REST join"
              >
                join
              </button>
              <button
                className={styles.btnSmall}
                onClick={() => handleDelete(r)}
                disabled={busy || !selectedUserId}
                title="선택 유저를 requestedBy로 삭제 (owner 아니면 403)"
              >
                삭제
              </button>
              {detail[r.id] && (
                <pre className={`${styles.detailJson} ${styles.mono}`}>
                  {JSON.stringify(detail[r.id], null, 2)}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
