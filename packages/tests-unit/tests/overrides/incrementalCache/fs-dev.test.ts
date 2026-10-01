import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { IncrementalCache } from "@opennextjs/aws/types/overrides.js";
import { getMonorepoRelativePath } from "@opennextjs/aws/utils/normalize-path.js";
import { vi } from "vitest";

vi.mock("@opennextjs/aws/utils/normalize-path.js", () => ({
  getMonorepoRelativePath: vi.fn(),
}));

let directory: string;
let cache: IncrementalCache;

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "opennext-fs-cache-"));
  vi.mocked(getMonorepoRelativePath).mockReturnValue(directory);
  vi.stubEnv("OPEN_NEXT_BUILD_ID", "test-build");
  vi.resetModules();
  cache = (await import("@opennextjs/aws/overrides/incrementalCache/fs-dev.js"))
    .default;
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(directory, { recursive: true, force: true });
});

describe("fs-dev incremental cache", () => {
  it("reads build-time fetch entries from the createAssets layout", async () => {
    const fetchDirectory = path.join(directory, "cache/__fetch/test-build");
    await fs.mkdir(fetchDirectory, { recursive: true });
    const value = {
      kind: "FETCH",
      data: {
        headers: {},
        body: "build-time value",
        url: "https://example.com",
      },
      revalidate: false,
    };
    await fs.writeFile(
      path.join(fetchDirectory, "hash"),
      JSON.stringify(value),
    );

    expect(await cache.get("hash", "fetch")).toEqual({
      value,
      lastModified: expect.any(Number),
    });
  });

  it("keeps fetch and page entries with the same key separate", async () => {
    const page = { type: "app" as const, html: "Page content" };
    const fetch = {
      kind: "FETCH" as const,
      data: { headers: {}, body: "Fetch content", url: "https://example.com" },
      revalidate: false as const,
    };
    await cache.set("nested/key", page, "cache");
    await cache.set("nested/key", fetch, "fetch");

    expect((await cache.get("nested/key"))?.value).toEqual(page);
    expect((await cache.get("nested/key", "cache"))?.value).toEqual(page);
    expect((await cache.get("nested/key", "fetch"))?.value).toEqual(fetch);
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(directory, "cache/__fetch/test-build/nested/key"),
          "utf8",
        ),
      ),
    ).toEqual(fetch);

    await cache.delete("nested/key");

    await expect(cache.get("nested/key")).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect((await cache.get("nested/key", "fetch"))?.value).toEqual(fetch);
  });

  it("round-trips a route-scoped key without discarding its owner", async () => {
    const firstKey = `/route-cache/PAGES/${"a".repeat(64)}/$/index`;
    const secondKey = `/route-cache/PAGES/${"b".repeat(64)}/$/index`;
    const first = { type: "page" as const, html: "home", json: {} };
    const second = { type: "page" as const, html: "catch-all", json: {} };

    await cache.set(firstKey, first);
    await cache.set(secondKey, second);

    expect((await cache.get(firstKey))?.value).toEqual(first);
    expect((await cache.get(secondKey))?.value).toEqual(second);
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(directory, `cache/test-build${firstKey}.cache`),
          "utf8",
        ),
      ),
    ).toEqual(first);
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(directory, `cache/test-build${secondKey}.cache`),
          "utf8",
        ),
      ),
    ).toEqual(second);
  });
});
