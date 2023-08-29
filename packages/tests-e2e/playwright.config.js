import { defineConfig } from "@playwright/test";

export default defineConfig({
  projects: [
    {
      name: "appRouter",
      testMatch: ["tests/appRouter/*.test.ts"],
      use: {
        baseURL: process.env.APP_ROUTER_URL || "http://localhost:3001",
      },
    },
    {
      name: "pagesRouter",
      testMatch: ["tests/pagesRouter/*.test.ts"],
      use: {
        baseURL: process.env.PAGES_ROUTER_URL || "http://localhost:3002",
      },
    },
    {
      name: "appPagesRouter",
      testMatch: ["tests/appPagesRouter/*.test.ts"],
      use: {
        baseURL: process.env.APP_PAGES_ROUTER_URL || "http://localhost:3003",
      },
    },
  ],
});
