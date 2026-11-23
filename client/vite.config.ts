// Settings for Vite, which runs the dev server (npm run dev) and builds client/dist, and for
// Vitest, which runs the client's unit tests with the same settings.

// Lets Vite understand JSX and refresh components in place while editing.
import react from '@vitejs/plugin-react'
// Vitest's version of defineConfig also types the `test` section below.
import { defineConfig } from 'vitest/config'

// The API server's address during development. server/src/index.ts listens on 3000 unless PORT
// is set, so API_SERVER can point the proxy at a server on another port.
const API_SERVER = process.env.API_SERVER ?? 'http://localhost:3000'

// https://vite.dev/config/
export default defineConfig({
  // Turns the React support on.
  plugins: [react()],
  // Settings for the development server only; the production build ignores them.
  server: {
    // Every API call goes to the Express server, so the browser sees one origin and needs no CORS.
    proxy: { '/api': API_SERVER },
  },
  // The unit tests: plain functions only, so Node is enough and no browser is simulated.
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
