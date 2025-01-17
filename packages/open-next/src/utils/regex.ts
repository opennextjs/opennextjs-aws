/**
 * Constructs a regular expression for a path that supports separators for multiple platforms
 *  - Uses posix separators (`/`) as the input that should be made cross-platform.
 *  - Special characters are escaped by default but can be controlled through opts.escape.
 *
 * @example
 * ```ts
 * getCrossPlatformPathRegex("./middleware.mjs")
 * getCrossPlatformPathRegex("\\./middleware\\.(mjs|cjs)", { escape: false })
 * ```
 */
export function getCrossPlatformPathRegex(
  regex: string,
  opts: { escape: boolean } = { escape: true },
) {
  const newExpr = (
    opts.escape ? regex.replace(/([[\]().*+?^$|{}\\])/g, "\\$1") : regex
  ).replaceAll("/", String.raw`(?:\/|\\)`);

  return new RegExp(newExpr, "g");
}
