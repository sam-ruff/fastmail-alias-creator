import { resolve } from "node:path";
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

const __dirname = import.meta.dirname;

// Builds the popup and options pages. The background script has its own
// config because it must be a single classic script.
export default defineConfig({
  root: "src",
  publicDir: resolve(__dirname, "public"),
  plugins: [preact()],
  resolve: {
    alias: {
      "@bridge": resolve(__dirname, "src/ui/runtimeBridge.ts"),
    },
  },
  envPrefix: "FASTMAIL_",
  envDir: __dirname,
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    target: "firefox140",
    // Readable output keeps Mozilla's review simple; the size cost is irrelevant for an extension.
    minify: false,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "src/popup/index.html"),
        options: resolve(__dirname, "src/options/index.html"),
      },
    },
  },
});
