import { defineConfig } from "@playwright/test";

export default defineConfig({
  projects: [
    {
      name: "appDirOnly",
      testMatch: ["tests/appDirOnly/*.test.ts"],
      use: {
        baseURL: process.env.APP_DIR_ONLY_URL || "http://localhost:3000",
      },
    },
    {
      name: "PagesOnly",
      testMatch: ["tests/pagesOnly/*.test.ts"],
      // Other configurations specific to folder1
      use: {
        baseURL: process.env.PAGES_ONLY_URL || "http://localhost:3001",
      },
    },
    {
      name: "AppDirAndPages",
      testMatch: ["tests/appDirAndPages/*.test.ts"],
      // Other configurations specific to folder1
      use: {
        baseURL: process.env.APP_DIR_AND_PAGES_URL || "http://localhost:3002",
      },
    },
  ],
});
