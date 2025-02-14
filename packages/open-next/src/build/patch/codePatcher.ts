import * as buildHelper from "../helper.js";
import * as fs from "node:fs/promises";

// Either before or after should be provided, otherwise just use the field directly
interface VersionedField<T> {
  before?: `${number}.${number}.${number}`;
  after?: `${number}.${number}.${number}`;
  field: T;
}

//TODO: create a version of this that would use ast-grep
type PatchCodeFn = (args: {
  // The content of the file that needs to be patched
  code: string;
  // The final path of the file that needs to be patched
  filePath: string;
  // All js files that will be included in this specific server function
  tracedFiles: string[];
  // All next.js manifest that are present at runtime - Key relative to `.next` folder
  manifests: Record<string, any>;
}) => Promise<string>;

export interface CodePatcher {
  name: string;
  filter: RegExp | VersionedField<RegExp>[];
  contentFilter?: RegExp | VersionedField<RegExp>[];
  patchCode: PatchCodeFn | VersionedField<PatchCodeFn>[];
}

function extractVersionedField<T>(
  fields: VersionedField<T>[],
  version: string,
): T[] {
  const result: T[] = [];
  for (const field of fields) {
    if (
      field.before &&
      field.after &&
      buildHelper.compareSemver(version, field.before) >= 0 &&
      buildHelper.compareSemver(version, field.after) < 0
    ) {
      result.push(field.field);
    } else if (
      field.before &&
      buildHelper.compareSemver(version, field.before) >= 0
    ) {
      result.push(field.field);
    } else if (
      field.after &&
      buildHelper.compareSemver(version, field.after) < 0
    ) {
      result.push(field.field);
    }
  }
  return result;
}

export async function applyCodePatches(
  buildOptions: buildHelper.BuildOptions,
  tracedFiles: string[],
  manifests: Record<string, any>,
  codePatcher: CodePatcher[],
) {
  await Promise.all(
    tracedFiles.map(async (filePath) => {
      const nextVersion = buildOptions.nextVersion;
      // We check the filename against the filter to see if we should apply the patch
      const patchToPotentiallyApply = codePatcher.filter((patch) => {
        const filters = Array.isArray(patch.filter)
          ? extractVersionedField(patch.filter, nextVersion)
          : [patch.filter];
        return filters.some((filter) => filePath.match(filter));
      });
      if (patchToPotentiallyApply.length === 0) {
        return;
      }
      const content = await fs.readFile(filePath, "utf-8");
      // We filter a last time against the content this time
      const patchToApply = patchToPotentiallyApply.filter((patch) => {
        if (!patch.contentFilter) {
          return true;
        }
        const contentFilters = Array.isArray(patch.contentFilter)
          ? extractVersionedField(patch.contentFilter, nextVersion)
          : [patch.contentFilter];
        return contentFilters.some((filter) =>
          // If there is no filter, we just return true to apply the patch
          filter ? content.match(filter) : true,
        );
      });
      if (patchToApply.length === 0) {
        return;
      }

      // We apply the patches

      patchToApply.forEach(async (patch) => {
        const patchCodeFns = Array.isArray(patch.patchCode)
          ? extractVersionedField(patch.patchCode, nextVersion)
          : [patch.patchCode];
        let patchedContent = content;
        for (const patchCodeFn of patchCodeFns) {
          patchedContent = await patchCodeFn({
            code: patchedContent,
            filePath,
            tracedFiles,
            manifests,
          });
        }
        await fs.writeFile(filePath, patchedContent);
      });
    }),
  );
}
