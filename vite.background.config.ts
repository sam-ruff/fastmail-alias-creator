import { resolve } from "node:path";
import { defineConfig } from "vite";

const __dirname = import.meta.dirname;

export default defineConfig({
  envPrefix: "FASTMAIL_",
  envDir: __dirname,
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: false,
    target: "firefox140",
    lib: {
      entry: resolve(__dirname, "src/background/index.ts"),
      formats: ["iife"],
      name: "background",
      fileName: () => "background.js",
    },
  },
});
