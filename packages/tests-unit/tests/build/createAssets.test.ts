import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createCacheAssets } from "@opennextjs/aws/build/createAssets.js";
import type { BuildOptions } from "@opennextjs/aws/build/helper.js";

const BUILD_ID = "build-id";

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

function writeFile(filePath: string, content: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    typeof content === "string" ? content : JSON.stringify(content),
  );
}

describe("createCacheAssets", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "open-next-cache-assets-"));
    const nextDir = path.join(root, ".next");
    const serverDir = path.join(nextDir, "standalone/.next/server");
    const meta = { headers: { "x-next-cache-tags": "_N_T_/isr" } };

    writeFile(path.join(nextDir, "BUILD_ID"), BUILD_ID);
    writeFile(path.join(nextDir, "required-server-files.json"), {
      config: {},
    });
    writeFile(path.join(nextDir, "prerender-manifest.json"), {
      routes: {
        "/": { initialRevalidateSeconds: false, srcRoute: "/" },
        "/isr": { initialRevalidateSeconds: 60, srcRoute: "/isr" },
        "/blog/hello": {
          initialRevalidateSeconds: 60,
          srcRoute: "/blog/[slug]",
        },
      },
      dynamicRoutes: {},
    });
    writeFile(path.join(nextDir, "server/app-paths-manifest.json"), {
      "/page": "app/page.js",
      "/(group)/isr/page": "app/(group)/isr/page.js",
      "/blog/[slug]/page": "app/blog/[slug]/page.js",
    });
    writeFile(path.join(nextDir, "server/pages-manifest.json"), {});
    writeFile(path.join(serverDir, "pages-manifest.json"), {});

    for (const route of ["index", "isr", "blog/hello"]) {
      writeFile(path.join(serverDir, `app/${route}.html`), "<html></html>");
      writeFile(path.join(serverDir, `app/${route}.rsc`), "rsc");
      writeFile(path.join(serverDir, `app/${route}.meta`), meta);
    }
    // Not a response cache entry
    writeFile(path.join(serverDir, "app/_global-error.html"), "<html></html>");

    writeFile(path.join(root, "build/open-next.config.mjs"), "");
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function getOptions(nextVersion: string) {
    return {
      appBuildOutputPath: root,
      monorepoRoot: root,
      outputDir: path.join(root, ".open-next"),
      buildDir: path.join(root, "build"),
      nextVersion,
      config: { dangerous: {} },
    } as unknown as BuildOptions;
  }

  function listCacheFiles() {
    const cacheDir = path.join(root, ".open-next/cache", BUILD_ID);
    return (fs.readdirSync(cacheDir, { recursive: true }) as string[])
      .filter((file) => file.endsWith(".cache"))
      .map((file) => file.split(path.sep).join("/"))
      .sort();
  }

  it("should use the scoped route cache keys for next >= 16.3.8", () => {
    const { metaFiles } = createCacheAssets(getOptions("16.3.8"));

    const isrKey = `route-cache/APP_PAGE/${sha256("/(group)/isr/page")}/$/isr`;
    expect(listCacheFiles()).toEqual(
      [
        `route-cache/APP_PAGE/${sha256("/page")}/$/index.cache`,
        `${isrKey}.cache`,
        `route-cache/APP_PAGE/${sha256("/blog/[slug]/page")}/$/blog/hello.cache`,
        "_global-error.cache",
      ].sort(),
    );
    expect(metaFiles).toContainEqual({
      tag: { S: `${BUILD_ID}/_N_T_/isr` },
      path: { S: `${BUILD_ID}/${isrKey}` },
      revalidatedAt: { N: "1" },
    });
  });

  it("should use the plain paths for next < 16.3.8", () => {
    const { metaFiles } = createCacheAssets(getOptions("16.3.7"));

    expect(listCacheFiles()).toEqual(
      [
        "_global-error.cache",
        "blog/hello.cache",
        "index.cache",
        "isr.cache",
      ].sort(),
    );
    expect(metaFiles).toContainEqual({
      tag: { S: `${BUILD_ID}/_N_T_/isr` },
      path: { S: `${BUILD_ID}/isr` },
      revalidatedAt: { N: "1" },
    });
  });
});
