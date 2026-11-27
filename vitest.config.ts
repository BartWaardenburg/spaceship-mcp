import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"],
    coverage: {
      reporter: ["text", "json-summary", "html"],
    },
  },
});
