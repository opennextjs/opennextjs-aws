/** @type {import('vite').UserConfig} */

import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [],
  test: {
    globals: true,
    environment: "node",
    setupFiles: "./setup.ts",
    coverage: {
      all: true,
    },
  },
});
