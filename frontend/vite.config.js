import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
   server: {
    host: "0.0.0.0",   // 🔑 allow external access
    port: 5173,        // optional (default is 5173)
    strictPort: true,  // optional (fails if port busy)
    proxy: {
      '/api': {
        target: 'http://44.223.169.80:5000',
        changeOrigin: true,
        secure: false
      }
    }
  }
})
