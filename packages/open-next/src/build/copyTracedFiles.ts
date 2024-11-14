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
import type { NextConfig, PrerenderManifest } from "types/next-types";

import logger from "../logger.js";

const __dirname = url.fileURLToPath(new URL(".", import.meta.url));

function copyPatchFile(outputDir: string) {
  const patchFile = path.join(__dirname, "patch", "patchedAsyncStorage.js");
  const outputPatchFile = path.join(outputDir, "patchedAsyncStorage.cjs");
  copyFileSync(patchFile, outputPatchFile);
}

// eslint-disable-next-line sonarjs/cognitive-complexity
export async function copyTracedFiles(
  buildOutputPath: string,
  packagePath: string,
  outputDir: string,
  routes: string[],
  bundledNextServer: boolean,
) {
  const tsStart = Date.now();
  const dotNextDir = path.join(buildOutputPath, ".next");
  const standaloneDir = path.join(dotNextDir, "standalone");
  const standaloneNextDir = path.join(standaloneDir, packagePath, ".next");
  const outputNextDir = path.join(outputDir, packagePath, ".next");

  const extractFiles = (files: string[], from = standaloneNextDir) => {
    return files.map((f) => path.resolve(from, f));
  };

  // On next 14+, we might not have to include those files
  // For next 13, we need to include them otherwise we get runtime error
  const requiredServerFiles = JSON.parse(
    readFileSync(
      path.join(
        dotNextDir,
        bundledNextServer
          ? "next-minimal-server.js.nft.json"
          : "next-server.js.nft.json",
      ),
      "utf8",
    ),
  );

  const filesToCopy = new Map<string, string>();

  // Files necessary by the server
  extractFiles(requiredServerFiles.files).forEach((f) => {
    filesToCopy.set(f, f.replace(standaloneDir, outputDir));
  });

  // create directory for pages
  if (existsSync(path.join(standaloneDir, ".next/server/pages"))) {
    mkdirSync(path.join(outputNextDir, "server/pages"), {
      recursive: true,
    });
  }
  if (existsSync(path.join(standaloneDir, ".next/server/app"))) {
    mkdirSync(path.join(outputNextDir, "server/app"), {
      recursive: true,
    });
  }

  mkdirSync(path.join(outputNextDir, "server/chunks"), {
    recursive: true,
  });

  const computeCopyFilesForPage = (pagePath: string) => {
    const fullFilePath = `server/${pagePath}.js`;
    let requiredFiles: { files: string[] };
    try {
      requiredFiles = JSON.parse(
        readFileSync(
          path.join(standaloneNextDir, `${fullFilePath}.nft.json`),
          "utf8",
        ),
      );
    } catch (e) {
      if (existsSync(path.join(standaloneNextDir, fullFilePath))) {
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
File ${fullFilePath} does not exist
--------------------------------------------------------------------------------`);
    }
    const dir = path.dirname(fullFilePath);
    extractFiles(
      requiredFiles.files,
      path.join(standaloneNextDir, dir),
    ).forEach((f) => {
      filesToCopy.set(f, f.replace(standaloneDir, outputDir));
    });

    if (!existsSync(path.join(standaloneNextDir, fullFilePath))) {
      throw new Error(
        `This error should only happen for static 404 and 500 page from page router. Report this if that's not the case.,
        File ${fullFilePath} does not exist`,
      );
    }

    filesToCopy.set(
      path.join(standaloneNextDir, fullFilePath),
      path.join(outputNextDir, fullFilePath),
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
        computeCopyFilesForPage(alternativePath);
      }
    }
  };

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

  //Actually copy the files
  filesToCopy.forEach((to, from) => {
    if (
      //TODO: we need to figure which packages we could safely remove
      from.includes(path.join("node_modules", "caniuse-lite")) ||
      // from.includes("jest-worker") || This ones seems necessary for next 12
      from.includes(path.join("node_modules", "sharp"))
    ) {
      return;
    }
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

  readdirSync(standaloneNextDir).forEach((f) => {
    if (statSync(path.join(standaloneNextDir, f)).isDirectory()) return;
    copyFileSync(path.join(standaloneNextDir, f), path.join(outputNextDir, f));
  });

  // We then need to copy all the files at the root of server

  mkdirSync(path.join(outputNextDir, "server"), { recursive: true });

  readdirSync(path.join(standaloneNextDir, "server")).forEach((f) => {
    if (statSync(path.join(standaloneNextDir, "server", f)).isDirectory())
      return;
    if (f !== "server.js") {
      copyFileSync(
        path.join(standaloneNextDir, "server", f),
        path.join(path.join(outputNextDir, "server"), f),
      );
    }
  });

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
      JSON.parse(
        readFileSync(
          path.join(standaloneNextDir, "server/pages-manifest.json"),
          "utf8",
        ),
      ),
    );
    // Then we need to get all fallback: true dynamic routes html
    const prerenderManifest = JSON.parse(
      readFileSync(
        path.join(standaloneNextDir, "prerender-manifest.json"),
        "utf8",
      ),
    ) as PrerenderManifest;
    const config = JSON.parse(
      readFileSync(
        path.join(standaloneNextDir, "required-server-files.json"),
        "utf8",
      ),
    ).config as NextConfig;
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

    staticFiles.forEach((f: string) => {
      if (f.endsWith(".html")) {
        copyStaticFile(`server/${f}`);
      }
    });
  }

  logger.debug("copyTracedFiles:", Date.now() - tsStart, "ms");
}
