import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // The stdio child-process harness spawns `node dist/cli.js`, which can take a
    // moment under cold Node start; give conformance/integration tests headroom.
    testTimeout: 20_000,
  },
});
