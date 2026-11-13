import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests for pure helpers in app/lib. They run in plain Node, not workerd,
// so "cloudflare:workers" is replaced by a stub whose env tests can set.
export default defineConfig({
  resolve: {
    alias: {
      "~": fileURLToPath(new URL("./app", import.meta.url)),
      "cloudflare:workers": fileURLToPath(new URL("./test/cloudflare-workers.ts", import.meta.url)),
    },
  },
  test: {
    include: ["app/**/*.test.ts"],
    environment: "node",
  },
});
