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
    {
      name: "experimental",
      testMatch: ["tests/experimental/*.test.ts"],
      use: {
        baseURL: process.env.EXPERIMENTAL_APP_URL || "http://localhost:3004",
      },
    },
  ],
  // Workaround for https://github.com/microsoft/playwright/issues/36371
  // It seems to be failing in our Github action
  // https://github.com/opennextjs/opennextjs-aws/actions/runs/19116336570/job/54627469525#step:15:171
  use: {
    launchOptions: {
      args: [
        "--disable-features=AcceptCHFrame,AutoExpandDetailsElement,AvoidUnnecessaryBeforeUnloadCheckSync,CertificateTransparencyComponentUpdater,DestroyProfileOnBrowserClose,DialMediaRouteProvider,ExtensionManifestV2Disabled,GlobalMediaControls,HttpsUpgrades,ImprovedCookieControls,LazyFrameLoading,LensOverlay,MediaRouter,PaintHolding,ThirdPartyStoragePartitioning,Translate,DeferRendererTasksAfterInput",
      ],
    },
  },
});
