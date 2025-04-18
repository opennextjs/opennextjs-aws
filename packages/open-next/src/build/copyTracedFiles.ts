import url from "node:url";

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  loadAppPathsManifest,
  loadBuildId,
  loadConfig,
  loadFunctionsConfigManifest,
  loadMiddlewareManifest,
  loadPagesManifest,
  loadPrerenderManifest,
} from "config/util.js";
import { getCrossPlatformPathRegex } from "utils/regex.js";
import logger from "../logger.js";
import {
  INSTRUMENTATION_TRACE_FILE,
  MIDDLEWARE_TRACE_FILE,
} from "./constant.js";

const __dirname = url.fileURLToPath(new URL(".", import.meta.url));

//TODO: we need to figure which packages we could safely remove
const EXCLUDED_PACKAGES = [
  "caniuse-lite",
  "sharp",
  // This seems to be only in Next 15
  // Some of sharp deps are under the @img scope
  "@img",
];

function isExcluded(srcPath: string) {
  return EXCLUDED_PACKAGES.some((excluded) =>
    srcPath.match(getCrossPlatformPathRegex(`/node_modules/${excluded}/`)),
  );
}

function copyPatchFile(outputDir: string) {
  const patchFile = path.join(__dirname, "patch", "patchedAsyncStorage.js");
  const outputPatchFile = path.join(outputDir, "patchedAsyncStorage.cjs");
  copyFileSync(patchFile, outputPatchFile);
}

interface CopyTracedFilesOptions {
  buildOutputPath: string;
  packagePath: string;
  outputDir: string;
  routes: string[];
  bundledNextServer: boolean;
  skipServerFiles?: boolean;
}

export function getManifests(nextDir: string) {
  return {
    buildId: loadBuildId(nextDir),
    config: loadConfig(nextDir),
    prerenderManifest: loadPrerenderManifest(nextDir),
    pagesManifest: loadPagesManifest(nextDir),
    appPathsManifest: loadAppPathsManifest(nextDir),
    middlewareManifest: loadMiddlewareManifest(nextDir),
    functionsConfigManifest: loadFunctionsConfigManifest(nextDir),
  };
}

// eslint-disable-next-line sonarjs/cognitive-complexity
export async function copyTracedFiles({
  buildOutputPath,
  packagePath,
  outputDir,
  routes,
  bundledNextServer,
  skipServerFiles,
}: CopyTracedFilesOptions) {
  const tsStart = Date.now();
  const dotNextDir = path.join(buildOutputPath, ".next");
  const standaloneDir = path.join(dotNextDir, "standalone");
  const standaloneNextDir = path.join(standaloneDir, packagePath, ".next");
  const standaloneServerDir = path.join(standaloneNextDir, "server");
  const outputNextDir = path.join(outputDir, packagePath, ".next");

  // Files to copy
  // Map from files in the `.next/standalone` to files in the `.open-next` folder
  const filesToCopy = new Map<string, string>();

  // Node packages
  // Map from folders in the project to folders in the `.open-next` folder
  // The map might also include the mono-repo path.
  const nodePackages = new Map<string, string>();

  /**
   * Extracts files and node packages from a .nft.json file
   * @param nftFile path to the .nft.json file relative to `.next/`
   */
  const processNftFile = (nftFile: string) => {
    const subDir = path.dirname(nftFile);
    const files: string[] = JSON.parse(
      readFileSync(path.join(dotNextDir, nftFile), "utf8"),
    ).files;

    files.forEach((tracedPath: string) => {
      const src = path.join(standaloneNextDir, subDir, tracedPath);
      const dst = path.join(outputNextDir, subDir, tracedPath);
      filesToCopy.set(src, dst);

      const module = path.join(dotNextDir, subDir, tracedPath);
      if (module.endsWith("package.json")) {
        nodePackages.set(path.dirname(module), path.dirname(dst));
      }
    });
  };

  // Files necessary by the server
  if (!skipServerFiles) {
    // On next 14+, we might not have to include those files
    // For next 13, we need to include them otherwise we get runtime error
    const nftFile = bundledNextServer
      ? "next-minimal-server.js.nft.json"
      : "next-server.js.nft.json";

    processNftFile(nftFile);
  }
  // create directory for pages
  if (existsSync(path.join(standaloneNextDir, "server/pages"))) {
    mkdirSync(path.join(outputNextDir, "server/pages"), {
      recursive: true,
    });
  }
  if (existsSync(path.join(standaloneNextDir, "server/app"))) {
    mkdirSync(path.join(outputNextDir, "server/app"), {
      recursive: true,
    });
  }

  mkdirSync(path.join(outputNextDir, "server/chunks"), {
    recursive: true,
  });

  const computeCopyFilesForPage = (pagePath: string) => {
    const serverPath = `server/${pagePath}.js`;

    try {
      processNftFile(`${serverPath}.nft.json`);
    } catch (e) {
      if (existsSync(path.join(dotNextDir, serverPath))) {
        //TODO: add a link to the docs
        throw new Error(
          `
--------------------------------------------------------------------------------
${pagePath} cannot use the edge runtime.
OpenNext requires edge runtime function to be defined in a separate function.
See the docs for more information on how to bundle edge runtime functions.
--------------------------------------------------------------------------------
        `,
        );
      }
      throw new Error(`
--------------------------------------------------------------------------------
We cannot find the route for ${pagePath}.
File ${serverPath} does not exist
--------------------------------------------------------------------------------`);
    }

    if (!existsSync(path.join(standaloneNextDir, serverPath))) {
      throw new Error(
        `This error should only happen for static 404 and 500 page from page router. Report this if that's not the case.,
        File ${serverPath} does not exist`,
      );
    }

    filesToCopy.set(
      path.join(standaloneNextDir, serverPath),
      path.join(outputNextDir, serverPath),
    );
  };

  const safeComputeCopyFilesForPage = (
    pagePath: string,
    alternativePath?: string,
  ) => {
    try {
      computeCopyFilesForPage(pagePath);
    } catch (e) {
      if (alternativePath) {
        safeComputeCopyFilesForPage(alternativePath);
      }
    }
  };

  // Check for instrumentation trace file
  if (existsSync(path.join(dotNextDir, INSTRUMENTATION_TRACE_FILE))) {
    // We still need to copy the nft.json file so that computeCopyFilesForPage doesn't throw
    copyFileSync(
      path.join(dotNextDir, INSTRUMENTATION_TRACE_FILE),
      path.join(standaloneNextDir, INSTRUMENTATION_TRACE_FILE),
    );
    computeCopyFilesForPage("instrumentation");
    logger.debug("Adding instrumentation trace files");
  }

  if (existsSync(path.join(dotNextDir, MIDDLEWARE_TRACE_FILE))) {
    // We still need to copy the nft.json file so that computeCopyFilesForPage doesn't throw
    copyFileSync(
      path.join(dotNextDir, MIDDLEWARE_TRACE_FILE),
      path.join(standaloneNextDir, MIDDLEWARE_TRACE_FILE),
    );
    computeCopyFilesForPage("middleware");
    logger.debug("Adding node middleware trace files");
  }

  const hasPageDir = routes.some((route) => route.startsWith("pages/"));
  const hasAppDir = routes.some((route) => route.startsWith("app/"));

  // We need to copy all the base files like _app, _document, _error, etc
  // One thing to note, is that next try to load every routes that might be needed in advance
  // So if you have a [slug].tsx at the root, this route will always be loaded for 1st level request
  // along with _app and _document
  if (hasPageDir) {
    //Page dir
    computeCopyFilesForPage("pages/_app");
    computeCopyFilesForPage("pages/_document");
    computeCopyFilesForPage("pages/_error");

    // These files can be present or not depending on if the user uses getStaticProps
    safeComputeCopyFilesForPage("pages/404");
    safeComputeCopyFilesForPage("pages/500");
  }

  if (hasAppDir) {
    //App dir
    // In next 14.2.0, _not-found is at 'app/_not-found/page'
    safeComputeCopyFilesForPage("app/_not-found", "app/_not-found/page");
  }

  //Files we actually want to include
  routes.forEach((route) => {
    computeCopyFilesForPage(route);
  });

  // Only files that are actually copied
  const tracedFiles: string[] = [];

  //Actually copy the files
  filesToCopy.forEach((to, from) => {
    // We don't want to copy excluded packages (i.e sharp)
    if (isExcluded(from)) {
      return;
    }
    tracedFiles.push(to);
    mkdirSync(path.dirname(to), { recursive: true });
    let symlink = null;
    // For pnpm symlink we need to do that
    // see https://github.com/vercel/next.js/blob/498f342b3552d6fc6f1566a1cc5acea324ce0dec/packages/next/src/build/utils.ts#L1932
    try {
      symlink = readlinkSync(from);
    } catch (e) {
      //Ignore
    }
    if (symlink) {
      try {
        symlinkSync(symlink, to);
      } catch (e: any) {
        if (e.code !== "EEXIST") {
          throw e;
        }
      }
    } else {
      copyFileSync(from, to);
    }
  });

  readdirSync(standaloneNextDir)
    .filter(
      (fileOrDir) =>
        !statSync(path.join(standaloneNextDir, fileOrDir)).isDirectory(),
    )
    .forEach((file) =>
      copyFileSync(
        path.join(standaloneNextDir, file),
        path.join(outputNextDir, file),
      ),
    );

  // We then need to copy all the files at the root of server

  mkdirSync(path.join(outputNextDir, "server"), { recursive: true });

  readdirSync(standaloneServerDir)
    .filter(
      (fileOrDir) =>
        !statSync(path.join(standaloneServerDir, fileOrDir)).isDirectory(),
    )
    .filter((file) => file !== "server.js")
    .forEach((file) =>
      copyFileSync(
        path.join(standaloneServerDir, file),
        path.join(path.join(outputNextDir, "server"), file),
      ),
    );

  // Copy patch file
  copyPatchFile(path.join(outputDir, packagePath));

  // TODO: Recompute all the files.
  // vercel doesn't seem to do it, but it seems wasteful to have all those files
  // we replace the pages-manifest.json with an empty one if we don't have a pages dir so that
  // next doesn't try to load _app, _document
  if (!hasPageDir) {
    writeFileSync(path.join(outputNextDir, "server/pages-manifest.json"), "{}");
  }

  //TODO: Find what else we need to copy
  const copyStaticFile = (filePath: string) => {
    if (existsSync(path.join(standaloneNextDir, filePath))) {
      mkdirSync(path.dirname(path.join(outputNextDir, filePath)), {
        recursive: true,
      });
      copyFileSync(
        path.join(standaloneNextDir, filePath),
        path.join(outputNextDir, filePath),
      );
    }
  };
  // Get all the static files - Should be only for pages dir
  // Ideally we would filter only those that might get accessed in this specific functions
  // Maybe even move this to s3 directly
  if (hasPageDir) {
    // First we get truly static files - i.e. pages without getStaticProps
    const staticFiles: Array<string> = Object.values(
      loadPagesManifest(standaloneNextDir),
    );
    // Then we need to get all fallback: true dynamic routes html
    const prerenderManifest = loadPrerenderManifest(standaloneNextDir);
    const config = loadConfig(standaloneNextDir);
    const locales = config.i18n?.locales;
    Object.values(prerenderManifest.dynamicRoutes).forEach((route) => {
      if (typeof route.fallback === "string") {
        if (locales) {
          locales.forEach((locale) => {
            staticFiles.push(`pages/${locale}${route.fallback}`);
          });
        } else {
          staticFiles.push(`pages${route.fallback}`);
        }
      }
    });

    staticFiles
      .filter((file) => file.endsWith(".html"))
      .forEach((file) => copyStaticFile(`server/${file}`));
  }

  logger.debug("copyTracedFiles:", Date.now() - tsStart, "ms");

  return {
    tracedFiles,
    nodePackages,
    manifests: getManifests(standaloneNextDir),
  };
}
