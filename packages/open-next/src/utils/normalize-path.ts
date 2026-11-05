import path from "node:path";

export function normalizePath(path: string) {
  return path.replace(/\\/g, "/");
}

// See: https://github.com/vercel/next.js/blob/3ecf087f10fdfba4426daa02b459387bc9c3c54f/packages/next/src/shared/lib/utils.ts#L348
export function normalizeRepeatedSlashes(url: URL) {
  const urlNoQuery = url.host + url.pathname;
  return `${url.protocol}//${urlNoQuery
    .replace(/\\/g, "/")
    .replace(/\/\/+/g, "/")}${url.search}`;
}

/**
 * Percent-encodes the path delimiters of a decoded path segment.
 *
 * See: https://github.com/vercel/next.js/blob/3403955/packages/next/src/shared/lib/router/utils/escape-path-delimiters.ts#L2-L10
 *
 * @param segment The decoded path segment
 * @param escapeEncoded Whether to also escape already encoded delimiters (e.g. `%2F`)
 * @returns The segment with its delimiters encoded
 */
function escapePathDelimiters(
  segment: string,
  escapeEncoded?: boolean,
): string {
  return segment.replace(
    new RegExp(`([/#?]${escapeEncoded ? "|%(2f|23|3f|5c)" : ""})`, "gi"),
    (char: string) => encodeURIComponent(char),
  );
}

/**
 * Decodes a pathname the way Next.js does to key prerendered routes.
 *
 * Each segment is decoded while path delimiters (e.g. `%2F`) stay encoded,
 * so that an encoded delimiter does not split a segment.
 * Decoding must be atomic, as in Next.js: partially decoding a malformed path
 * could select a different route than the one Next.js would select.
 *
 * See: https://github.com/vercel/next.js/blob/3403955/packages/next/src/server/lib/router-utils/decode-path-params.ts#L11-L26
 *
 * @param pathname The percent-encoded pathname
 * @returns The decoded pathname
 * @throws {URIError} When the pathname contains a malformed escape sequence
 */
export function decodePathParams(pathname: string): string {
  return pathname
    .split("/")
    .map((segment) => escapePathDelimiters(decodeURIComponent(segment), true))
    .join("/");
}

export function getMonorepoRelativePath(relativePath = "../.."): string {
  return path.join(
    globalThis.monorepoPackagePath
      .split("/")
      .filter(Boolean)
      .map(() => "..")
      .join("/"),
    relativePath,
  );
}
