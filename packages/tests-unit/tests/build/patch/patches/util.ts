import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  type NextPackage,
  getInstalledNextPackages as getNextPackages,
} from "@opennextjs/aws/build/patch/testUtils.js";

export {
  computePatchDiff,
  getNextFilesToPatch,
} from "@opennextjs/aws/build/patch/testUtils.js";

const examplesDir = fileURLToPath(
  new URL("../../../../../../examples", import.meta.url),
);

/**
 * Get the Next.js packages installed in the examples.
 *
 * The e2e workflow installs the latest version of Next in these examples.
 *
 * @param examples Name of the examples
 * @returns the path and version of the Next.js packages, deduplicated by version
 */
export function getInstalledNextPackages(
  examples = ["app-router", "pages-router", "app-pages-router"],
): NextPackage[] {
  return getNextPackages(
    examples.map((example) => path.join(examplesDir, example)),
  );
}
