import { useEffect, useState } from 'react'
import { health } from '../lib/rest'
import styles from './HealthBadge.module.css'

const POLL_MS = 10_000

// null = 첫 폴링 전. 'unreachable' = fetch 자체 실패(서버/프록시 다운) —
// /healthz는 unhealthy여도 503 + JSON 본문으로 응답하므로 이 둘은 구분된다.
type HealthState = {
  server: 'ok' | 'unhealthy' | 'unreachable'
  postgres: 'ok' | 'down'
  redis: 'ok' | 'down'
} | null

export default function HealthBadge() {
  const [state, setState] = useState<HealthState>(null)

  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const h = await health()
        if (cancelled) return
        setState({
          server: h.status === 'ok' ? 'ok' : 'unhealthy',
          postgres: h.checks.postgres,
          redis: h.checks.redis,
        })
      } catch {
        if (!cancelled) setState({ server: 'unreachable', postgres: 'down', redis: 'down' })
      }
    }

    poll()
    const id = setInterval(poll, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  if (state === null) {
    return (
      <span className={styles.badge}>
        <span className={styles.unknown}>health: …</span>
      </span>
    )
  }

  if (state.server === 'unreachable') {
    return (
      <span className={styles.badge}>
        <span className={styles.down}>server unreachable</span>
      </span>
    )
  }

  return (
    <span className={styles.badge}>
      <span className={state.server === 'ok' ? styles.ok : styles.down}>server {state.server}</span>
      <span className={state.postgres === 'ok' ? styles.ok : styles.down}>pg {state.postgres}</span>
      <span className={state.redis === 'ok' ? styles.ok : styles.down}>redis {state.redis}</span>
    </span>
  )
}
