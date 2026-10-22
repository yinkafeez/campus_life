import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // non-VITE_ vars are only visible here (never shipped to the browser)
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.DEV_API_TARGET || "http://localhost:5000";

  return {
    plugins: [react(), tailwindcss()],

    build: {
      // the lazily-loaded 3D engine chunk (three.js + drei) is ~900 kB raw / ~250 kB gzip by nature;
      // everything else stays far below this
      chunkSizeWarningLimit: 1000,
    },

    server: {
      port: 5173,
      // dev: the browser calls /api on the Vite origin and Vite forwards it to the backend,
      // so cookies are same-origin locally. Production uses VITE_API_URL instead.
      proxy: {
        "/api": { target: apiTarget, changeOrigin: true },
        // realtime (Socket.IO) — websockets go through the same proxy
        "/socket.io": { target: apiTarget, changeOrigin: true, ws: true },
      },
    },

    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.jsx"],
      css: { modules: { classNameStrategy: "non-scoped" } },
      restoreMocks: true,
      // the first test in a file also loads lazy screens: slow on a busy machine
      testTimeout: 15_000,
    },
  };
});
