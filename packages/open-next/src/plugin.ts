import fs from "node:fs";
import { Plugin } from "esbuild";

export interface IPluginSettings {
  importPath: string;
}

/**
 * This plugin replaces the
 * `import { ...} from "./plugins/default.js";`
 * with a new path in server-adapter.js
 */

export default function openNextPlugin({ importPath }: IPluginSettings): Plugin {
  return {
    name: "opennext",
    setup(build) {
      build.onLoad({ filter: /server-adapter\.js/g }, async (args) => {
        let contents = await fs.promises.readFile(args.path, "utf8");
        contents = contents.replace("./plugins/default.js", importPath);
        return {
          contents,
        };
      });
    },
  };
}
