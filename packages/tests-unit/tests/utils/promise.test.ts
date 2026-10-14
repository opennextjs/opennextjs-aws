import { AsyncLocalStorage } from "node:async_hooks";
import { setImmediate } from "node:timers/promises";

import * as logger from "@opennextjs/aws/adapters/logger.js";
import {
  DetachedPromise,
  DetachedPromiseRunner,
  runWithOpenNextRequestContext,
} from "@opennextjs/aws/utils/promise.js";
import { vi } from "vitest";

const NEXT_REQUEST_CONTEXT_SYMBOL = Symbol.for("@next/request-context");

function getNextRequestContext(): { waitUntil: (p: Promise<unknown>) => void } {
  //@ts-expect-error
  return globalThis[NEXT_REQUEST_CONTEXT_SYMBOL].get();
}

describe("runWithOpenNextRequestContext", () => {
  beforeEach(() => {
    globalThis.__openNextAls = new AsyncLocalStorage();
  });

  it("gives each overlapping request its own waitUntil", async () => {
    const waitUntilA = vi.fn();
    const waitUntilB = vi.fn();

    let resumeA!: () => void;
    const aPaused = new Promise<void>((resolve) => {
      resumeA = resolve;
    });
    let waitUntilSeenByA: unknown;

    const requestA = runWithOpenNextRequestContext(
      { isISRRevalidation: false, waitUntil: waitUntilA },
      async () => {
        // Request B starts and publishes its own context while A is paused.
        await aPaused;
        waitUntilSeenByA = getNextRequestContext().waitUntil;
      },
    );

    await runWithOpenNextRequestContext(
      { isISRRevalidation: false, waitUntil: waitUntilB },
      async () => {
        expect(getNextRequestContext().waitUntil).toBe(waitUntilB);
      },
    );

    resumeA();
    await requestA;

    expect(waitUntilSeenByA).toBe(waitUntilA);
  });

  it("falls back to the current request's pending promises without waitUntil", async () => {
    let done = false;

    await runWithOpenNextRequestContext(
      { isISRRevalidation: false },
      async () => {
        getNextRequestContext().waitUntil(
          new Promise<void>((resolve) =>
            setTimeout(() => {
              done = true;
              resolve();
            }, 10),
          ),
        );
      },
    );

    // The request awaits its pending promises before returning.
    expect(done).toBe(true);
  });
});

describe("DetachedPromiseRunner", () => {
  afterEach(() => vi.restoreAllMocks());

  it("handles late rejections before the earlier batch settles", async () => {
    const log = vi.spyOn(logger, "error").mockImplementation(() => {});
    const runner = new DetachedPromiseRunner();
    const initial = runner.withResolvers<void>();
    const draining = runner.await();
    const failure = new Error("late write failed");
    runner.add(Promise.reject(failure));
    // Crossing an event-loop turn also detects unhandled rejections in Vitest.
    await setImmediate();
    expect(log).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(failure);
    initial.resolve();
    await expect(draining).resolves.toBeUndefined();
  });

  it("allows overlapping drains to await the same work", async () => {
    const runner = new DetachedPromiseRunner();
    const work = runner.withResolvers<void>();
    const finished = vi.fn();
    const drains = [
      runner.await().then(finished),
      runner.await().then(finished),
    ];
    await setImmediate();
    expect(finished).not.toHaveBeenCalled();
    work.resolve();
    await Promise.all(drains);
    expect(finished).toHaveBeenCalledTimes(2);
  });

  it.each(["add", "withResolvers"] as const)(
    "awaits work registered with %s during an active drain",
    async (method) => {
      const runner = new DetachedPromiseRunner();
      const initial = runner.withResolvers<void>();
      const finished = vi.fn();
      const draining = runner.await().then(finished);
      const late =
        method === "withResolvers"
          ? runner.withResolvers<void>()
          : new DetachedPromise<void>();
      if (method === "add") runner.add(late.promise);
      initial.resolve();
      try {
        await setImmediate();
        expect(finished).not.toHaveBeenCalled();
      } finally {
        late.resolve();
        await draining;
      }
      expect(finished).toHaveBeenCalledOnce();
    },
  );

  it("awaits late writes through a streaming wrapper's waitUntil runner", async () => {
    globalThis.__openNextAls = new AsyncLocalStorage();
    const wrapper = new DetachedPromiseRunner();
    const resume = new DetachedPromise<void>();
    const write = new DetachedPromise<void>();
    const finished = vi.fn();
    await runWithOpenNextRequestContext(
      {
        isISRRevalidation: false,
        waitUntil: (promise) => wrapper.add(promise),
      },
      async () => {
        getNextRequestContext().waitUntil(
          resume.promise.then(() => {
            getNextRequestContext().waitUntil(write.promise);
          }),
        );
      },
    );
    const draining = wrapper.await().then(finished);
    resume.resolve();
    try {
      await setImmediate();
      expect(finished).not.toHaveBeenCalled();
    } finally {
      write.resolve();
      await draining;
    }
  });
});
