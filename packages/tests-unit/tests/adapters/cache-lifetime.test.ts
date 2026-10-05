import { AsyncLocalStorage } from "node:async_hooks";

import Cache from "@opennextjs/aws/adapters/cache.js";
import {
  DetachedPromise,
  runWithOpenNextRequestContext,
} from "@opennextjs/aws/utils/promise.js";
import { vi } from "vitest";

describe("cache writes after the request returns", () => {
  beforeEach(() => {
    vi.stubGlobal("__openNextAls", new AsyncLocalStorage());
    vi.stubGlobal("openNextConfig", {});
  });

  afterEach(() => vi.unstubAllGlobals());

  it.each(["APP_PAGE", "APP_ROUTE", "PAGES", "REDIRECT", "delete"])(
    "keeps a late %s write alive independently of Next's background promise",
    async (kind) => {
      const resume = new DetachedPromise<void>();
      const storage = new DetachedPromise<void>();
      const tags = new DetachedPromise<void>();
      const tagsStarted = new DetachedPromise<void>();
      const incrementalCache = {
        set: vi.fn(() => storage.promise),
        delete: vi.fn(() => storage.promise),
      };
      const tagCache = {
        mode: "original",
        getByPath: vi.fn(async () => []),
        writeTags: vi.fn(() => {
          tagsStarted.resolve();
          return tags.promise;
        }),
      };
      vi.stubGlobal("incrementalCache", incrementalCache);
      vi.stubGlobal("tagCache", tagCache);
      const waitUntil = vi.fn<(promise: Promise<unknown>) => void>();
      const data = {
        APP_PAGE: {
          kind: "APP_PAGE" as const,
          html: "html",
          rscData: Buffer.from("rsc"),
          headers: { "x-next-cache-tags": "tag" },
        },
        APP_ROUTE: {
          kind: "APP_ROUTE" as const,
          body: Buffer.from("body"),
          status: 200,
          headers: {},
        },
        PAGES: { kind: "PAGES" as const, html: "html", pageData: {} },
        REDIRECT: { kind: "REDIRECT" as const, props: {} },
        delete: undefined,
      };
      let background!: Promise<void>;

      await runWithOpenNextRequestContext(
        { isISRRevalidation: false, waitUntil },
        async () => {
          background = resume.promise.then(() =>
            new Cache().set("key", data[kind as keyof typeof data]),
          );
          // Next keeps regeneration alive, but Cache.set must cover its own
          // detached write once this background promise has resolved.
          waitUntil(background);
        },
      );
      // The runner handed over in the request's finally has already settled.
      await waitUntil.mock.calls[1][0];
      resume.resolve();
      await background;

      try {
        expect(waitUntil).toHaveBeenCalledTimes(3);
        const write = waitUntil.mock.calls[2][0];
        const settled = vi.fn();
        void write.then(settled);
        expect(settled).not.toHaveBeenCalled();
        storage.resolve();

        if (kind === "APP_PAGE") {
          await tagsStarted.promise;
          expect(settled).not.toHaveBeenCalled();
          expect(tagCache.writeTags).toHaveBeenCalledWith([
            { path: "key", tag: "tag", revalidatedAt: 1 },
          ]);
        }
        tags.resolve();
        await write;
        expect(settled).toHaveBeenCalledOnce();
        expect(
          kind === "delete" ? incrementalCache.delete : incrementalCache.set,
        ).toHaveBeenCalledOnce();
      } finally {
        storage.resolve();
        tags.resolve();
      }
    },
  );
});
