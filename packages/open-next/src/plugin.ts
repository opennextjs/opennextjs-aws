import { readFile } from "node:fs/promises";
import path from "node:path";

import { Plugin } from "esbuild";

export interface IPluginSettings {
  target: RegExp;
  replacements: string[];
}

const overridePattern = /\/\/#override (\w+)\n([\s\S]*?)\n\/\/#endOverride/gm;
const importPattern = /\/\/#import([\s\S]*?)\n\/\/#endImport/gm;

/**
 *
 * openNextPlugin({
 *   target: /plugins\/default\.js/g,
 *   replacements: ["./13_4_13.js"],
 * })
 *
 * To inject arbritary code by using (import at top of file):
 *
 * //#import
 *
 * import data from 'data'
 * const datum = data.datum
 *
 * //#endImport
 *
 * To replace code:
 *
 * //#override id1
 *
 * export function overrideMe() {
 *    // I will replace the "id1" block in the target file
 * }
 *
 * //#endOverride
 *
 *
 * @param opts.target - the target file to replace
 * @param opts.replacements - list of files used to replace the imports/overrides in the target
 *                          - the path is relative to the target path
 * @returns
 */
export default function openNextPlugin({
  target,
  replacements,
}: IPluginSettings): Plugin {
  return {
    name: "opennext",
    setup(build) {
      build.onLoad({ filter: target }, async (args) => {
        let contents = await readFile(args.path, "utf-8");

        await Promise.all(
          replacements.map(async (fp) => {
            const p = path.join(args.path, "..", fp);
            const replacementFile = await readFile(p, "utf-8");
            const matches = replacementFile.matchAll(overridePattern);

            const importMatch = replacementFile.match(importPattern);
            const addedImport = importMatch ? importMatch[0] : "";

            contents = `${addedImport}\n${contents}`;

            for (const match of matches) {
              const replacement = match[2];
              const id = match[1];
              const pattern = new RegExp(
                `\/\/#override (${id})\n([\\s\\S]*?)\n\/\/#endOverride`,
              );
              contents = contents.replace(pattern, replacement);
            }
          }),
        );

        return {
          contents,
        };
      });
    },
  };
}
