import fs from "node:fs";
import path from "node:path";
import type { NextAdapterOutputs } from "../adapter";
import { addDebugFile } from "../debug.js";
import type * as buildHelper from "./helper.js";

export async function copyAdapterFiles(
  options: buildHelper.BuildOptions,
  fnName: string,
  outputs: NextAdapterOutputs,
) {
  const filesToCopy = new Map<string, string>();

  // Copying the files from outputs to the output dir
  for (const [key, value] of Object.entries(outputs)) {
    if (["pages", "pagesApi", "appPages", "appRoutes"].includes(key)) {
      for (const route of value as any[]) {
        const assets = route.assets;
        // We need to copy the filepaths to the output dir
        const relativeFilePath = path.relative(options.appPath, route.filePath);
        // console.log(
        //   "route.filePath",
        //   route.filePath,
        //   "relativeFilePath",
        //   relativeFilePath,
        // );
        filesToCopy.set(
          route.filePath,
          `${options.outputDir}/server-functions/${fnName}/${relativeFilePath}`,
        );

        for (const [relative, from] of Object.entries(assets || {})) {
          //          console.log("route.assets", from, relative);
          filesToCopy.set(
            from as string,
            `${options.outputDir}/server-functions/${fnName}/${relative}`,
          );
        }
        // copyFileSync(from, `${options.outputDir}/${relative}`);
      }
    }
  }

  console.log("\n### Copying adapter files");
  const debugCopiedFiles: Record<string, string> = {};
  for (const [from, to] of filesToCopy) {
    debugCopiedFiles[from] = to;

    //make sure the directory exists first
    fs.mkdirSync(path.dirname(to), { recursive: true });
    // For pnpm symlink we need to do that
    // see https://github.com/vercel/next.js/blob/498f342b3552d6fc6f1566a1cc5acea324ce0dec/packages/next/src/build/utils.ts#L1932
    let symlink = "";
    try {
      symlink = fs.readlinkSync(from);
    } catch (e) {
      //Ignore
    }
    if (symlink) {
      try {
        fs.symlinkSync(symlink, to);
      } catch (e: any) {
        if (e.code !== "EEXIST") {
          throw e;
        }
      }
    } else {
      fs.copyFileSync(from, to);
    }
  }

  // TODO(vicb): debug
  addDebugFile(options, "copied_files.json", debugCopiedFiles);

  return Array.from(filesToCopy.values());
}
