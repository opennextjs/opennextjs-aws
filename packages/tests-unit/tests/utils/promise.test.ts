import { AsyncLocalStorage } from "node:async_hooks";

import { runWithOpenNextRequestContext } from "@opennextjs/aws/utils/promise.js";
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
