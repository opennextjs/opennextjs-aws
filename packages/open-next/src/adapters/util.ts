export function setNodeEnv() {
  process.env.NODE_ENV = process.env.NODE_ENV ?? "production";
}

export function generateUniqueId() {
  return Math.random().toString(36).slice(2, 8);
}

export function escapeRegex(str: string) {
  let path = str.replace(/\(\.\)/g, "_µ1_");

  path = path.replace(/\(\.{2}\)/g, "_µ2_");

  path = path.replace(/\(\.{3}\)/g, "_µ3_");

  return path;
}

export function unescapeRegex(str: string) {
  let path = str.replace(/_µ1_/g, "(.)");

  path = path.replace(/_µ2_/g, "(..)");

  path = path.replace(/_µ3_/g, "(...)");

  return path;
}

// AWS cookies are in a single `set-cookie` string, delimited by a comma
export function parseCookies(
  cookies?: string | string[],
): string[] | undefined {
  if (!cookies) return;

  if (typeof cookies === "string") {
    return cookies.split(/(?<!Expires=\w+),/i).map((c) => c.trim());
  }

  return cookies;
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

  const parsedValue = parseInt(envValue);

  return isNaN(parsedValue) ? undefined : parsedValue;
}
