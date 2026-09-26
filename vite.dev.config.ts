import { resolve } from "node:path";
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

const __dirname = import.meta.dirname;

// Serves the UI as plain web pages with a mocked background, see src/dev.
export default defineConfig({
  root: "src",
  plugins: [preact()],
  envPrefix: "FASTMAIL_",
  envDir: __dirname,
  resolve: {
    alias: {
      "@bridge": resolve(__dirname, "src/dev/mockBridge.ts"),
    },
  },
});
