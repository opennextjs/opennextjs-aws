import * as fs from "node:fs/promises";
import logger from "../../logger.js";
import type { getManifests } from "../copyTracedFiles.js";
import * as buildHelper from "../helper.js";

// Either before or after should be provided, otherwise just use the field directly
export interface VersionedField<T> {
  /**
   * The version before which the field should be used
   * If the version is less than or equal to this, the field will be used
   */
  before?:
    | `${number}`
    | `${number}.${number}`
    | `${number}.${number}.${number}`;
  /**
   * The version after which the field should be used
   * If the version is greater than this, the field will be used
   */
  after?: `${number}` | `${number}.${number}` | `${number}.${number}.${number}`;
  field: T;
}

export type PatchCodeFn = (args: {
  /**
   * The code of the file that needs to be patched
   */
  code: string;
  /**
   * The final path of the file that needs to be patched
   */
  filePath: string;
  /**
   * All files that are traced and will be included in the bundle
   */
  tracedFiles: string[];
  /**
   * Next.js manifests that are used by Next at runtime
   */
  manifests: ReturnType<typeof getManifests>;
}) => Promise<string>;

interface IndividualPatch {
  pathFilter: RegExp;
  contentFilter?: RegExp;
  patchCode: PatchCodeFn;
}

export interface CodePatcher {
  name: string;
  patches: IndividualPatch | VersionedField<IndividualPatch>[];
}

export function extractVersionedField<T>(
  fields: VersionedField<T>[],
  version: string,
): T[] {
  const result: T[] = [];
  for (const field of fields) {
    if (
      field.before &&
      field.after &&
      buildHelper.compareSemver(version, field.before) <= 0 &&
      buildHelper.compareSemver(version, field.after) > 0
    ) {
      result.push(field.field);
    } else if (
      field.before &&
      buildHelper.compareSemver(version, field.before) <= 0
    ) {
      result.push(field.field);
    } else if (
      field.after &&
      buildHelper.compareSemver(version, field.after) > 0
    ) {
      result.push(field.field);
    }
  }
  return result;
}

export async function applyCodePatches(
  buildOptions: buildHelper.BuildOptions,
  tracedFiles: string[],
  manifests: ReturnType<typeof getManifests>,
  codePatcher: CodePatcher[],
) {
  const nextVersion = buildOptions.nextVersion;
  logger.time("Applying code patches");

  // We first filter against the version
  // We also flatten the array of patches so that we get both the name and all the necessary patches
  const patchesToApply = codePatcher.flatMap(({ name, patches }) =>
    Array.isArray(patches)
      ? extractVersionedField(patches, nextVersion).map((patch) => ({
          name,
          patch,
        }))
      : [{ name, patch: patches }],
  );

  await Promise.all(
    tracedFiles.map(async (filePath) => {
      // We check the filename against the filter to see if we should apply the patch
      const patchMatchingPath = patchesToApply.filter(({ patch }) => {
        return filePath.match(patch.pathFilter);
      });
      if (patchMatchingPath.length === 0) {
        return;
      }
      const content = await fs.readFile(filePath, "utf-8");
      // We filter a last time against the content this time
      const patchToApply = patchMatchingPath.filter(({ patch }) => {
        if (!patch.contentFilter) {
          return true;
        }
        return content.match(patch.contentFilter);
      });
      if (patchToApply.length === 0) {
        return;
      }

      // We apply the patches
      let patchedContent = content;

      for (const { patch, name } of patchToApply) {
        logger.debug(`Applying code patch: ${name} to ${filePath}`);
        patchedContent = await patch.patchCode({
          code: patchedContent,
          filePath,
          tracedFiles,
          manifests,
        });
      }
      await fs.writeFile(filePath, patchedContent);
    }),
  );
  logger.timeEnd("Applying code patches");
}
