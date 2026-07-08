import { useChatStore, RAW_LOG_MAX } from '../store/useChatStore'
import type { RawLogEntry } from '../store/useChatStore'
import panel from '../styles/panel.module.css'
import styles from './RawLogPanel.module.css'

const DIR_MARK = { in: '←', out: '→', meta: '·' } as const

function formatTime(ms: number): string {
  const d = new Date(ms)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  const ms3 = String(d.getMilliseconds()).padStart(3, '0')
  return `${hh}:${mm}:${ss}.${ms3}`
}

function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

function Entry({ e }: { e: RawLogEntry }) {
  const head = (
    <>
      <span className={styles.time}>{formatTime(e.at)}</span>
      <span className={styles.mark}>{DIR_MARK[e.dir]}</span>
      {e.frameType && <span className={styles.frameType}>{e.frameType}</span>}
    </>
  )
  // meta는 프레임이 아니므로 펼칠 JSON이 없다 — 한 줄 텍스트로만.
  if (e.dir === 'meta') {
    return (
      <li className={`${styles.entry} ${styles.meta}`}>
        {head}
        <span className={styles.metaText}>{e.text}</span>
      </li>
    )
  }
  return (
    <li className={`${styles.entry} ${styles[e.dir]}`}>
      <details className={styles.details}>
        <summary className={styles.summary}>
          {head}
          <span className={styles.raw}>{e.text}</span>
        </summary>
        <pre className={styles.json}>{prettyJson(e.text)}</pre>
      </details>
    </li>
  )
}

// in/out 프레임 원문 타임라인 (PLAN §6) — 이 앱의 핵심 디버깅 가치라 항상 노출.
// 최신이 위로 오도록 column-reverse로 그린다(스크롤 고정 불필요).
export default function RawLogPanel() {
  const rawLog = useChatStore((s) => s.rawLog)
  const clearRawLog = useChatStore((s) => s.clearRawLog)

  return (
    <section className={panel.panel}>
      <div className={panel.row}>
        <h2 className={panel.panelTitle}>Raw 프레임 로그</h2>
        <span className={panel.muted}>
          {rawLog.length}건
          {rawLog.length >= RAW_LOG_MAX && ` (상한 ${RAW_LOG_MAX} — 오래된 것부터 버림)`}
        </span>
        <button className={panel.btnSmall} onClick={clearRawLog} disabled={rawLog.length === 0}>
          clear
        </button>
      </div>

      {rawLog.length === 0 ? (
        <p className={panel.muted}>아직 프레임이 없습니다. IdentityBar에서 연결해 보세요.</p>
      ) : (
        <ul className={styles.list}>
          {rawLog.map((e) => (
            <Entry key={e.seq} e={e} />
          ))}
        </ul>
      )}
    </section>
  )
}
