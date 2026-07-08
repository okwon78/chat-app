// defineConfig는 vitest/config에서 가져와 `test` 키까지 타입이 잡히게 한다(vite 설정 확장).
// loadEnv는 vitest/config가 재export하지 않으므로 vite에서 직접 가져온다.
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// dev proxy: chat-server가 CORS 헤더를 세팅하지 않으므로 REST/WS 전부 동일 origin으로 프록시한다 (PLAN §2.3, §8)
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_SERVER_TARGET || 'http://localhost:8080'
  const wsTarget = target.replace(/^http/, 'ws')

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': { target, changeOrigin: true },
        '/healthz': { target, changeOrigin: true },
        '/metrics': { target, changeOrigin: true },
        '/ws': { target: wsTarget, ws: true },
      },
    },
    // 단위 테스트(TASKS W5) — encodeFrame + store 리듀서. WebSocket/window는 각
    // 테스트에서 스텁하므로 node 환경으로 충분(jsdom 불필요).
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  }
})
