import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
} from "fs";
import path from "path";

//TODO: need to make it work with monorepo
export async function copyTracedFiles(
  buildOutputPath: string,
  outputDir: string,
  routes: string[],
) {
  console.time("copyTracedFiles");
  const dotNextDir = path.join(buildOutputPath, ".next");
  const standaloneDir = path.join(dotNextDir, "standalone");
  const standaloneNextDir = path.join(standaloneDir, ".next");

  const extractFiles = (files: string[], from = standaloneNextDir) => {
    return files.map((f) => path.resolve(from, f));
  };

  // On next 14+, we might not have to include those files
  // For next 13, we need to include them otherwise we get runtime error
  const requiredServerFiles = JSON.parse(
    readFileSync(
      path.join(dotNextDir, "next-minimal-server.js.nft.json"),
      "utf8",
    ),
  );

  const filesToCopy = new Map<string, string>();

  // Files necessary by the server
  extractFiles(requiredServerFiles.files).forEach((f) => {
    filesToCopy.set(f, f.replace(standaloneDir, outputDir));
  });

  // create directory for pages
  mkdirSync(path.join(outputDir, ".next/server/pages"), { recursive: true });
  mkdirSync(path.join(outputDir, ".next/server/app"), { recursive: true });
  mkdirSync(path.join(outputDir, ".next/server/chunks"), { recursive: true });

  const computeCopyFilesForPage = (pagePath: string) => {
    const fullFilePath = `server/${pagePath}.js`;
    const requiredFiles = JSON.parse(
      readFileSync(
        path.join(standaloneNextDir, `${fullFilePath}.nft.json`),
        "utf8",
      ),
    );
    const dir = path.dirname(fullFilePath);
    extractFiles(
      requiredFiles.files,
      path.join(standaloneNextDir, dir),
    ).forEach((f) => {
      filesToCopy.set(f, f.replace(standaloneDir, outputDir));
    });

    filesToCopy.set(
      path.join(standaloneNextDir, fullFilePath),
      path.join(outputDir, ".next", fullFilePath),
    );
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
  }

  if (hasAppDir) {
    //App dir
    computeCopyFilesForPage("app/_not-found");
  }

  //Files we actually want to include
  routes.forEach((route) => {
    computeCopyFilesForPage(route);
  });

  //Actually copy the files
  filesToCopy.forEach((to, from) => {
    if (
      from.endsWith("development.js") ||
      (from.includes("node_modules") && from.includes("@edge-runtime"))
    ) {
      return;
    }
    mkdirSync(path.dirname(to), { recursive: true });
    copyFileSync(from, to);
  });

  // TODO: Recompute all the files.
  // If we recompute all the files, it might allow us to avoid loading unnecessary routes
  // We need to copy all the files at the root of the standaloneNextDir

  mkdirSync(path.join(outputDir, ".next"), { recursive: true });

  readdirSync(standaloneNextDir).forEach((f) => {
    if (statSync(path.join(standaloneNextDir, f)).isDirectory()) return;
    copyFileSync(
      path.join(standaloneNextDir, f),
      path.join(path.join(outputDir, ".next"), f),
    );
  });

  // We then need to copy all the files at the root of server

  mkdirSync(path.join(outputDir, ".next/server"), { recursive: true });

  readdirSync(path.join(standaloneNextDir, "server")).forEach((f) => {
    if (statSync(path.join(standaloneNextDir, "server", f)).isDirectory())
      return;
    if (f !== "server.js") {
      copyFileSync(
        path.join(standaloneNextDir, "server", f),
        path.join(path.join(outputDir, ".next/server"), f),
      );
    }
  });

  //TODO: We should also copy static html files, especially 404.html

  console.timeEnd("copyTracedFiles");
}
