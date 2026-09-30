import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts",
  use: { baseURL: "http://localhost:3100", ...devices["Desktop Chrome"] },
  webServer: { command: "npm run dev -- -p 3100", url: "http://localhost:3100", reuseExistingServer: true },
});
