type Options = {
  escape?: boolean;
  flags?: string;
};

/**
 * Constructs a regular expression for a path that supports separators for multiple platforms
 *  - Uses posix separators (`/`) as the input that should be made cross-platform.
 *  - Special characters are escaped by default but can be controlled through opts.escape.
 *  - Posix separators are always escaped.
 *
 * @example
 * ```ts
 * getCrossPlatformPathRegex("./middleware.mjs")
 * getCrossPlatformPathRegex(String.raw`\./middleware\.(mjs|cjs)`, { escape: false })
 * ```
 */
export function getCrossPlatformPathRegex(
  regex: string,
  { escape: shouldEscape = true, flags = "g" }: Options = {},
) {
  const newExpr = (
    shouldEscape ? regex.replace(/([[\]().*+?^$|{}\\])/g, "\\$1") : regex
  ).replaceAll("/", String.raw`(?:\/|\\)`);

  return new RegExp(newExpr, flags);
}
