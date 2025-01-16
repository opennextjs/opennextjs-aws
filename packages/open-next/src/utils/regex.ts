export function getCrossPlatformPathRegex(
  regex: string,
  opts: { escape: boolean } = { escape: true },
) {
  const newExpr = (
    opts.escape ? regex.replace(/([[\]().*+?^$|])/g, '\\$1') : regex
  ).replaceAll('/', '(?:\\/|\\\\)');

  return new RegExp(newExpr, 'g');
}
