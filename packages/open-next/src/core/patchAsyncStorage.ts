const mod = require("module");

const resolveFilename = mod._resolveFilename;

export function patchAsyncStorage() {
  mod._resolveFilename = ((
    originalResolveFilename: typeof resolveFilename,
    request: string,
    parent: any,
    isMain: boolean,
    options: any,
  ) => {
    if (
      request.endsWith("static-generation-async-storage.external") ||
      request.endsWith("static-generation-async-storage.external.js")
    ) {
      return require.resolve("./patchedAsyncStorage.cjs");
    } else if (
      request.endsWith("static-generation-async-storage.external.original")
    ) {
      return originalResolveFilename.call(
        mod,
        request.replace(".original", ".js"),
        parent,
        isMain,
        options,
      );
    } else
      return originalResolveFilename.call(
        mod,
        request,
        parent,
        isMain,
        options,
      );

    // We use `bind` here to avoid referencing outside variables to create potential memory leaks.
  }).bind(null, resolveFilename);
}
