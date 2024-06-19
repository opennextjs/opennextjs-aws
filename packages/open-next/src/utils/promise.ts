import { debug, error } from "../adapters/logger";

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
  private promises: DetachedPromise<any>[] = [];

  public withResolvers<T>(): DetachedPromise<T> {
    const detachedPromise = new DetachedPromise<T>();
    this.promises.push(detachedPromise);
    return detachedPromise;
  }

  public add<T>(promise: Promise<T>): void {
    const detachedPromise = new DetachedPromise<T>();
    this.promises.push(detachedPromise);
    promise.then(detachedPromise.resolve, detachedPromise.reject);
  }

  public async await(): Promise<void> {
    debug(`Awaiting ${this.promises.length} detached promises`);
    const results = await Promise.allSettled(
      this.promises.map((p) => p.promise),
    );
    const rejectedPromises = results.filter(
      (r) => r.status === "rejected",
    ) as PromiseRejectedResult[];
    rejectedPromises.forEach((r) => {
      error(r.reason);
    });
  }
}
