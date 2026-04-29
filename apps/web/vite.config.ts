import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// リポジトリ直下の .env / .env.local を読む（VITE_* のみクライアントに露出）
export default defineConfig({
  envDir: path.resolve(__dirname, '../..'),
  plugins: [react()],
  resolve: {
    alias: {
      '@numeron/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
    },
  },
  server: {
    port: 5173,
  },
})
