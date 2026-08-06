import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@scopethread/bedrock": fileURLToPath(
        new URL("./packages/bedrock/src/index.ts", import.meta.url),
      ),
      "@scopethread/core": fileURLToPath(
        new URL("./packages/core/src/index.ts", import.meta.url),
      ),
      "@scopethread/database": fileURLToPath(
        new URL("./packages/database/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    coverage: {
      reporter: ["text", "html"],
    },
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts"],
  },
});
