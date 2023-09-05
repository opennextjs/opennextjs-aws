export * from "./binary";

// TODO: move util functions from open-next here (if/where it makes sense)
export function add(a: number, b: number) {
  return a + b;
}

export function generateUniqueId() {
  return Math.random().toString(36).slice(2, 8);
}

export async function wait(n: number = 1000) {
  return new Promise((res) => {
    setTimeout(res, n);
  });
}

export function fixSWRCacheHeader(headers: Record<string, string | undefined>) {
  // WORKAROUND: `NextServer` does not set correct SWR cache headers — https://github.com/serverless-stack/open-next#workaround-nextserver-does-not-set-correct-swr-cache-headers
  if (headers["cache-control"]) {
    headers["cache-control"] = headers["cache-control"].replace(
      /\bstale-while-revalidate(?!=)/,
      "stale-while-revalidate=2592000", // 30 days
    );
  }
}
