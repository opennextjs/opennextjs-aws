import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import { createPatch } from "diff";

/**
 * Compute the diff resulting of applying the `rule` to `src`.
 *
 * @param filename Filename used in the patch output
 * @param src Content of the source code
 * @param rule ASTgrep rule
 * @returns diff in unified diff format
 */
export function computePatchDiff(
  filename: string,
  src: string,
  rule: string,
): string {
  const dst = patchCode(src, rule);
  return createPatch(filename, src, dst);
}
