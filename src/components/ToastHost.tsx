import { useChatStore } from '../store/useChatStore'
import styles from './ToastHost.module.css'

// error 프레임(코드별 안내) + room_closed(정보) 통지를 화면 우하단에 쌓아 보여준다.
// 소멸은 store가 TTL 타이머로 자동 처리하고, 클릭 시 즉시 닫는다(§5.5).
export default function ToastHost() {
  const toasts = useChatStore((s) => s.toasts)
  const dismissToast = useChatStore((s) => s.dismissToast)

  if (toasts.length === 0) return null

  return (
    <div className={styles.host} role="status" aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          className={t.kind === 'error' ? styles.toastError : styles.toastInfo}
          onClick={() => dismissToast(t.id)}
          title="클릭하면 닫힙니다"
        >
          <span className={styles.badge}>{t.kind === 'error' ? '오류' : '알림'}</span>
          <span className={styles.text}>{t.text}</span>
        </button>
      ))}
    </div>
  )
}
