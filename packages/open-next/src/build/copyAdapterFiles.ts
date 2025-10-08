import type { NextAdapterOutputs } from "../adapter";
import type * as buildHelper from "./helper.js";
import fs, { copyFileSync } from "node:fs";
import path from "node:path";

export async function copyAdapterFiles(
    options: buildHelper.BuildOptions,
    fnName: string,
    outputs: NextAdapterOutputs) {
    const filesToCopy = new Map<string, string>();

      //Copying the files from outputs to the output dir
      for (const [key, value] of Object.entries(outputs)) {
          if (["pages", "pagesApi", "appPages", "appRoutes"].includes(key)) {
              for (const route of ( value as any[])) {
                  const assets = route.assets;
                  // We need to copy the filepaths to the output dir
                  const relativeFilePath = path.relative(options.appPath, route.filePath);
                  console.log('route.filePath', route.filePath, 'relativeFilePath', relativeFilePath);
                  filesToCopy.set(route.filePath, `${options.outputDir}/server-functions/${fnName}/${relativeFilePath}`);

                  // console.log('route.assets', assets);
                  for (const [relative, from] of Object.entries(assets || {})) {
                      filesToCopy.set(from as string, `${options.outputDir}/server-functions/${fnName}/${relative}`);
                  }
                  // copyFileSync(from, `${options.outputDir}/${relative}`);
              }
          }
      }
      for (const [from, to] of filesToCopy) {
          // console.log(`Copying ${from} to ${to}`);
          //make sure the directory exists first
          const dir = path.dirname(to);
          await fs.promises.mkdir(dir, { recursive: true });
          copyFileSync(from, to);
      }
      return Array.from(filesToCopy.values());
    }