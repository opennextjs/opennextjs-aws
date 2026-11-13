import type { WaitUntil } from "types/open-next";
import { debug, error } from "../adapters/logger";
import { RequestCache } from "./requestCache";

/**
 * A `Promise.withResolvers` implementation that exposes the `resolve` and
 * `reject` functions on a `Promise`.
 * Copied from next https://github.com/vercel/next.js/blob/canary/packages/next/src/lib/detached-promise.ts
 * @see https://tc39.es/proposal-promise-with-resolvers/
 */
export class DetachedPromise<T = any> {
  public readonly resolve: (value: T | PromiseLike<T>) => void;
  public readonly reject: (reason: any) => void;
  public readonly promise: Promise<T>;

  constructor() {
    let resolve: (value: T | PromiseLike<T>) => void;
    let reject: (reason: any) => void;

    // Create the promise and assign the resolvers to the object.
    this.promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    // We know that resolvers is defined because the Promise constructor runs
    // synchronously.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.resolve = resolve!;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.reject = reject!;
  }
}

export class DetachedPromiseRunner {
  private promises: Promise<void>[] = [];

  /**
   * Create a deferred promise tracked by this runner.
   *
   * @returns The tracked promise and its resolve/reject functions.
   */
  public withResolvers<T>(): DetachedPromise<T> {
    const detachedPromise = new DetachedPromise<T>();
    this.add(detachedPromise.promise);
    return detachedPromise;
  }

  /**
   * Track background work and handle failures immediately.
   *
   * @param promise Work to await, including work registered during an active drain.
   * @returns Nothing; failures are logged rather than propagated.
   */
  public add<T>(promise: Promise<T>): void {
    // A late promise may reject before the current batch finishes. Attach its
    // rejection handler now so it cannot become an unhandled rejection.
    this.promises.push(promise.then(() => {}, error));
  }

  /**
   * Drain tracked work, including additions made while earlier work is pending.
   *
   * Work started after the drain has settled still needs a new runtime waitUntil.
   * @returns Resolves when all work registered during this drain has settled.
   */
  public async await(): Promise<void> {
    debug(`Awaiting ${this.promises.length} detached promises`);
    let awaited = 0;
    while (awaited < this.promises.length) {
      const batch = this.promises.slice(awaited);
      awaited = this.promises.length;
      await Promise.all(batch);
    }
  }
}

async function awaitAllDetachedPromise() {
  const store = globalThis.__openNextAls.getStore();

  const promisesToAwait =
    store?.pendingPromiseRunner.await() ?? Promise.resolve();
  if (store?.waitUntil) {
    store.waitUntil(promisesToAwait);
    return;
  }
  await promisesToAwait;
}

function provideNextAfterProvider() {
  const NEXT_REQUEST_CONTEXT_SYMBOL = Symbol.for("@next/request-context");

  // This is needed by some lib that relies on the vercel request context to properly await stuff.
  // Remove this when vercel builder is updated to provide '@next/request-context'.
  const VERCEL_REQUEST_CONTEXT_SYMBOL = Symbol.for("@vercel/request-context");

  // `get` resolves the store on every call rather than capturing it here: the
  // object is published on `globalThis`, which every request in the isolate
  // shares, so a captured store could belong to a different request.
  const nextAfterContext = {
    get: () => {
      const store = globalThis.__openNextAls.getStore();
      return {
        waitUntil:
          store?.waitUntil ??
          ((promise: Promise<unknown>) =>
            store?.pendingPromiseRunner.add(promise)),
      };
    },
  };

  //@ts-expect-error
  globalThis[NEXT_REQUEST_CONTEXT_SYMBOL] = nextAfterContext;
  // We probably want to avoid providing this everytime since some lib may incorrectly think they are running in Vercel
  // It may break stuff, but at the same time it will allow libs like `@vercel/otel` to work as expected
  if (process.env.EMULATE_VERCEL_REQUEST_CONTEXT) {
    //@ts-expect-error
    globalThis[VERCEL_REQUEST_CONTEXT_SYMBOL] = nextAfterContext;
  }
}

export function runWithOpenNextRequestContext<T>(
  {
    isISRRevalidation,
    waitUntil,
    requestId = Math.random().toString(36),
  }: {
    // Whether we are in ISR revalidation
    isISRRevalidation: boolean;
    // Extends the liftetime of the runtime after the response is returned.
    waitUntil?: WaitUntil;
    requestId?: string;
  },
  fn: () => Promise<T>,
): Promise<T> {
  return globalThis.__openNextAls.run(
    {
      requestId,
      pendingPromiseRunner: new DetachedPromiseRunner(),
      isISRRevalidation,
      waitUntil,
      writtenTags: new Set<string>(),
      requestCache: new RequestCache(),
    },
    async () => {
      provideNextAfterProvider();
      let result: T;
      try {
        result = await fn();
        // We always await all detached promises before returning the result
        // However we don't want to catch errors here, we want to let the parent handle it
      } finally {
        await awaitAllDetachedPromise();
      }
      return result;
    },
  );
}
