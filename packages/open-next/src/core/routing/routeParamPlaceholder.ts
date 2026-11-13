import { dynamicRouteMatcher } from "./routeMatcher";

// The placeholders of a route pattern: `[slug]`, `[...slug]` or `[[...slug]]`
const PLACEHOLDER_REGEX = /\[\[\.\.\.[^\]]+\]\]|\[(?:\.\.\.)?[^\]]+\]/g;

// A placeholder starts with `[`, which is either literal or percent encoded in the pathname
const OPENING_BRACKET_REGEX = /\[|%5b/i;

/**
 * Returns whether a segment of the pathname is the placeholder of a matched dynamic App Router page.
 *
 * Next.js versions before 16.4.5 treat a param whose value is its placeholder (e.g. `[slug]` for `[slug]`) as an
 * unresolved fallback param. Such values are not legitimate and must not reach Next.js.
 *
 * Segments are decoded like Next.js decodes param values (catch-all values are split on `/` first).
 * Segments with a malformed percent encoding never match.
 * Pathnames without an opening bracket return early, without matching the dynamic routes.
 *
 * @param pathname The internal pathname, which may include the basePath, a locale prefix and a trailing slash
 * @returns Whether a segment of the pathname is a placeholder of a matched dynamic App Router page
 */
export function hasRouteParamPlaceholder(pathname: string): boolean {
  if (!OPENING_BRACKET_REGEX.test(pathname)) {
    return false;
  }
  const placeholders = new Set(
    dynamicRouteMatcher(pathname)
      .filter(({ type }) => type === "app")
      .flatMap(({ route }) => route.match(PLACEHOLDER_REGEX) ?? []),
  );
  return (
    placeholders.size > 0 &&
    pathname.split("/").some((segment) => placeholders.has(safeDecode(segment)))
  );
}

/**
 * Decodes a URI component without throwing.
 *
 * @param value The encoded value
 * @returns The decoded value, or an empty string when the encoding is malformed
 */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}
