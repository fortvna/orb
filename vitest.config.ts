import { defineConfig } from "vitest/config";

/** Isolated from vite.config.ts so Start/Nitro/PWA plugins are not loaded. */
export default defineConfig({
  test: {
    include: ["src/lib/hypothesis/**/*.test.ts", "src/lib/market/**/*.test.ts"],
    environment: "node",
  },
  resolve: { tsconfigPaths: true },
});
