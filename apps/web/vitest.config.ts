import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@qpcr/contracts": path.resolve(import.meta.dirname, "../../packages/contracts/src/index.ts"),
      "@": path.resolve(import.meta.dirname, ".")
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"]
  }
});
