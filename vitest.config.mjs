import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Redirect extension-only vscode imports to a local test stub.
      vscode: resolve("src/test/vscode.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      exclude: [
        "src/test/**",
        "src/**/*.test.ts",
      ],
    },
  },
});
