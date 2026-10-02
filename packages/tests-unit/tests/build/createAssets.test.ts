import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  createCacheAssets,
  resolveCacheFilePath,
} from "@opennextjs/aws/build/createAssets.js";
import type { BuildOptions } from "@opennextjs/aws/build/helper.js";

let directory: string;
let appBuildOutputPath: string;
let outputDir: string;
let buildDir: string;

/**
 * Creates the minimum standalone Next.js filesystem used by cache packaging.
 *
 * @returns Build options rooted in a fresh temporary directory.
 */
async function createBuild(): Promise<BuildOptions> {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "opennext-assets-"));
  appBuildOutputPath = path.join(directory, "app");
  outputDir = path.join(directory, "output");
  buildDir = path.join(directory, "build");
  await fs.mkdir(
    path.join(appBuildOutputPath, ".next/standalone/.next/server"),
    { recursive: true },
  );
  await fs.mkdir(buildDir, { recursive: true });
  await fs.writeFile(path.join(appBuildOutputPath, ".next/BUILD_ID"), "build");
  await fs.writeFile(
    path.join(appBuildOutputPath, ".next/required-server-files.json"),
    JSON.stringify({ config: {} }),
  );
  await fs.writeFile(
    path.join(
      appBuildOutputPath,
      ".next/standalone/.next/server/pages-manifest.json",
    ),
    "{}",
  );
  await fs.writeFile(path.join(buildDir, "open-next.config.mjs"), "export {};");

  return {
    appBuildOutputPath,
    appPackageJsonPath: path.join(appBuildOutputPath, "package.json"),
    appPath: appBuildOutputPath,
    appPublicPath: path.join(appBuildOutputPath, "public"),
    buildDir,
    config: {},
    debug: false,
    minify: false,
    monorepoRoot: appBuildOutputPath,
    nextVersion: "16.3.8",
    openNextVersion: "test",
    openNextDistDir: directory,
    outputDir,
    packager: "pnpm",
    tempBuildDir: path.join(directory, "temp"),
  };
}

/**
 * Writes one set of response artifacts at a Next.js server-relative path.
 *
 * @param relativeBase Path below `.next/server`, without an extension.
 * @param files Extension-to-content map for the response artifact.
 * @returns A promise that resolves once every file has been written.
 */
async function writeArtifact(
  relativeBase: string,
  files: Record<string, string | object>,
): Promise<void> {
  const base = path.join(
    appBuildOutputPath,
    ".next/standalone/.next/server",
    relativeBase,
  );
  await fs.mkdir(path.dirname(base), { recursive: true });
  await Promise.all(
    Object.entries(files).map(([extension, content]) =>
      fs.writeFile(
        `${base}.${extension}`,
        typeof content === "string" ? content : JSON.stringify(content),
      ),
    ),
  );
}

/**
 * Reads one serialized OpenNext response cache entry.
 *
 * @param cacheKey Opaque or legacy response cache key.
 * @returns Parsed cache entry.
 */
async function readCache(cacheKey: string): Promise<Record<string, unknown>> {
  return JSON.parse(
    await fs.readFile(
      path.join(outputDir, `cache/build/${cacheKey}.cache`),
      "utf8",
    ),
  );
}

afterEach(async () => {
  if (directory) {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

describe("createCacheAssets", () => {
  it("packages historical seeds under their opaque route-scoped keys", async () => {
    const options = await createBuild();
    const pagesKey = `/route-cache/PAGES/${"a".repeat(64)}/$/shared`;
    const appKey = `/route-cache/APP_PAGE/${"b".repeat(64)}/$/shared`;
    await writeArtifact("pages/shared", {
      html: "pages owner",
      json: { owner: "pages" },
      meta: {
        headers: { "x-next-cache-tags": "shared-tag,pages-tag" },
        routeCache: {
          key: pagesKey,
          owner: { kind: "PAGES", sourceRoute: "/shared" },
          isFallback: false,
        },
      },
    });
    await writeArtifact("app/shared", {
      html: "app owner",
      rsc: "app rsc",
      meta: {
        headers: { "x-next-cache-tags": "shared-tag,app-tag" },
        routeCache: {
          key: appKey,
          owner: { kind: "APP_PAGE", sourceRoute: "/shared/page" },
          isFallback: false,
        },
      },
    });

    const result = createCacheAssets(options);

    expect(await readCache(pagesKey.slice(1))).toMatchObject({
      type: "page",
      html: "pages owner",
      json: { owner: "pages" },
      meta: { routeCache: { key: pagesKey } },
    });
    expect(await readCache(appKey.slice(1))).toMatchObject({
      type: "app",
      html: "app owner",
      rsc: "app rsc",
      meta: { routeCache: { key: appKey } },
    });
    expect(result.metaFiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: { S: `build/${pagesKey.slice(1)}` } }),
        expect.objectContaining({ path: { S: `build/${appKey.slice(1)}` } }),
      ]),
    );
    expect(new Set(result.metaFiles.map(({ path }) => path.S))).toEqual(
      new Set([`build/${pagesKey.slice(1)}`, `build/${appKey.slice(1)}`]),
    );
  });

  it("preserves encoded pathname suffixes and PPR segment payloads", async () => {
    const options = await createBuild();
    const hash = "e".repeat(64);
    const key = `/route-cache/APP_PAGE/${hash}/$/article/a%2Fb`;
    const relativeBase = "app/article/a%2Fb";
    await writeArtifact(relativeBase, {
      html: "",
      meta: {
        postponed: "resume-data",
        segmentPaths: ["/children"],
        routeCache: {
          key,
          owner: {
            kind: "APP_PAGE",
            sourceRoute: "/article/[slug]/page",
          },
          isFallback: true,
        },
      },
    });
    const segmentDirectory = path.join(
      appBuildOutputPath,
      ".next/standalone/.next/server",
      `${relativeBase}.segments`,
    );
    await fs.mkdir(segmentDirectory, { recursive: true });
    await fs.writeFile(
      path.join(segmentDirectory, "children.segment.rsc"),
      "segment payload",
    );

    createCacheAssets(options);

    expect(await readCache(key.slice(1))).toMatchObject({
      type: "app",
      html: "",
      segmentData: { "/children": "segment payload" },
      meta: {
        postponed: "resume-data",
        routeCache: { key, isFallback: true },
      },
    });
  });

  it("retains legacy paths when route ownership metadata is absent", async () => {
    const options = await createBuild();
    await writeArtifact("pages/legacy", {
      html: "legacy page",
      json: { legacy: true },
      meta: { headers: { "x-next-cache-tags": "legacy-tag" } },
    });

    const result = createCacheAssets(options);

    expect(await readCache("legacy")).toMatchObject({
      type: "page",
      html: "legacy page",
      json: { legacy: true },
    });
    expect(result.metaFiles).toContainEqual(
      expect.objectContaining({ path: { S: "build/legacy" } }),
    );
  });

  it("keeps root and literal index keys distinct", async () => {
    const options = await createBuild();
    const hash = "d".repeat(64);
    const rootKey = `/route-cache/PAGES/${hash}/$/index`;
    const literalIndexKey = `/route-cache/PAGES/${hash}/$/index/index`;
    await writeArtifact("pages/index", {
      html: "root",
      json: { route: "root" },
      meta: {
        routeCache: {
          key: rootKey,
          owner: { kind: "PAGES", sourceRoute: "/" },
          isFallback: false,
        },
      },
    });
    await writeArtifact("pages/index/index", {
      html: "literal index",
      json: { route: "literal-index" },
      meta: {
        routeCache: {
          key: literalIndexKey,
          owner: { kind: "PAGES", sourceRoute: "/index" },
          isFallback: false,
        },
      },
    });

    createCacheAssets(options);

    expect(await readCache(rootKey.slice(1))).toMatchObject({ html: "root" });
    expect(await readCache(literalIndexKey.slice(1))).toMatchObject({
      html: "literal index",
    });
  });

  it("does not publish an artifact with an escaping metadata key", async () => {
    const options = await createBuild();
    await writeArtifact("pages/unsafe", {
      html: "must not be published",
      json: { unsafe: true },
      meta: {
        routeCache: {
          key: "../../outside",
          owner: { kind: "PAGES", sourceRoute: "/unsafe" },
          isFallback: false,
        },
      },
    });

    createCacheAssets(options);

    await expect(
      fs.stat(path.join(directory, "outside.cache")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      fs.stat(path.join(outputDir, "cache/build/unsafe.cache")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("omits build-time tag records when the tag cache is disabled", async () => {
    const options = await createBuild();
    options.config.dangerous = { disableTagCache: true };
    const key = `/route-cache/PAGES/${"f".repeat(64)}/$/tagged`;
    await writeArtifact("pages/tagged", {
      html: "tagged",
      json: {},
      meta: {
        headers: { "x-next-cache-tags": "disabled-tag" },
        routeCache: {
          key,
          owner: { kind: "PAGES", sourceRoute: "/tagged" },
          isFallback: false,
        },
      },
    });

    const result = createCacheAssets(options);

    expect(result).toEqual({ useTagCache: false, metaFiles: [] });
    await expect(
      fs.stat(path.join(outputDir, "dynamodb-provider/dynamodb-cache.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects cache keys that escape the output directory", async () => {
    const output = path.join(os.tmpdir(), "cache-output");

    expect(() => resolveCacheFilePath(output, "../../outside")).toThrow(
      "Cache key resolves outside the cache output",
    );
  });
});
