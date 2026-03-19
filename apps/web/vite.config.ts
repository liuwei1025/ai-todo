import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  worker: {
    format: "es",
  },
  test: {
    environment: "jsdom",
    setupFiles: "./vitest.setup.ts",
    css: true,
    include: ["src/test/**/*.test.ts", "src/test/**/*.test.tsx"],
    exclude: ["e2e/**"],
  },
});
