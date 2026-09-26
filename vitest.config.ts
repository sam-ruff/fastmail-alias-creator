import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";

const __dirname = import.meta.dirname;

export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: {
      "@bridge": resolve(__dirname, "src/dev/mockBridge.ts"),
    },
  },
  test: {
    environment: "happy-dom",
    include: ["tests/unit/**/*.test.{ts,tsx}"],
  },
});
