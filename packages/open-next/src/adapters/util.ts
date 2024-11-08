//TODO: We should probably move all the utils to a separate location

import { DetachedPromiseRunner } from "utils/promise";

export function setNodeEnv() {
  process.env.NODE_ENV = process.env.NODE_ENV ?? "production";
}

export function generateUniqueId() {
  return Math.random().toString(36).slice(2, 8);
}

export function generateOpenNextRequestContext(isISRRevalidation = false) {
  return {
    requestId: Math.random().toString(36),
    pendingPromiseRunner: new DetachedPromiseRunner(),
    isISRRevalidation,
  };
}

/**
 * Create an array of arrays of size `chunkSize` from `items`
 * @param items Array of T
 * @param chunkSize size of each chunk
 * @returns T[][]
 */
export function chunk<T>(items: T[], chunkSize: number): T[][] {
  const chunked = items.reduce((acc, curr, i) => {
    const chunkIndex = Math.floor(i / chunkSize);
    acc[chunkIndex] = [...(acc[chunkIndex] ?? []), curr];
    return acc;
  }, new Array<T[]>());

  return chunked;
}

export function parseNumberFromEnv(
  envValue: string | undefined,
): number | undefined {
  if (typeof envValue !== "string") {
    return envValue;
  }

  const parsedValue = Number.parseInt(envValue);

  return isNaN(parsedValue) ? undefined : parsedValue;
}
