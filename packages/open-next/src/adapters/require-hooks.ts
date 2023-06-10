// Synchronously inject a require hook for webpack and webpack/. It's required to use the internal ncc webpack version.
// This is needed for userland plugins to attach to the same webpack instance as Next.js'.
// Individually compiled modules are as defined for the compilation in bundles/webpack/packages/*.

import type { NextConfig } from "./next-types.js";
import { error } from "./logger.js";

// This module will only be loaded once per process.

const mod = require("module");
const resolveFilename = mod._resolveFilename;
const hookPropertyMapApp = new Map();
const hookPropertyMapPage = new Map();

export function overrideHooks(config: NextConfig) {
  try {
    overrideDefault();
    overrideReact(config);
  } catch (e) {
    error("Failed to override Next.js require hooks.", e);
    throw e;
  }
}

function addHookAliases(
  aliases: [string, string][] = [],
  type: "app" | "page"
) {
  for (const [key, value] of aliases) {
    type === "app"
      ? hookPropertyMapApp.set(key, value)
      : hookPropertyMapPage.set(key, value);
  }
}

// Add default aliases
function overrideDefault() {
  addHookAliases(
    [
      // Use `require.resolve` explicitly to make them statically analyzable
      // styled-jsx needs to be resolved as the external dependency.
      ["styled-jsx", require.resolve("styled-jsx")],
      ["styled-jsx/style", require.resolve("styled-jsx/style")],
      ["styled-jsx/style", require.resolve("styled-jsx/style")],
    ],
    "app"
  );
}

// Override built-in React packages if necessary
function overrideReact(config: NextConfig) {
  addHookAliases(
    [
      ["react", require.resolve(`react`)],
      ["react/jsx-runtime", require.resolve(`react/jsx-runtime`)],
    ],
    "page"
  );

  // ignore: react/jsx-dev-runtime is not available on older version of Next.js ie. v13.1.6
  try {
    addHookAliases(
      [["react/jsx-dev-runtime", require.resolve(`react/jsx-dev-runtime`)]],
      "page"
    );
  } catch (e) {}

  if (config.experimental.appDir) {
    if (config.experimental.serverActions) {
      addHookAliases(
        [
          ["react", require.resolve(`next/dist/compiled/react-experimental`)],
          [
            "react/jsx-runtime",
            require.resolve(
              `next/dist/compiled/react-experimental/jsx-runtime`
            ),
          ],
          [
            "react/jsx-dev-runtime",
            require.resolve(
              `next/dist/compiled/react-experimental/jsx-dev-runtime`
            ),
          ],
          [
            "react-dom",
            require.resolve(
              `next/dist/compiled/react-dom-experimental/server-rendering-stub`
            ),
          ],
          [
            "react-dom/client",
            require.resolve(`next/dist/compiled/react-dom-experimental/client`),
          ],
          [
            "react-dom/server",
            require.resolve(`next/dist/compiled/react-dom-experimental/server`),
          ],
          [
            "react-dom/server.browser",
            require.resolve(
              `next/dist/compiled/react-dom-experimental/server.browser`
            ),
          ],
          [
            "react-dom/server.edge",
            require.resolve(
              `next/dist/compiled/react-dom-experimental/server.edge`
            ),
          ],
          [
            "react-server-dom-webpack/client",
            require.resolve(
              `next/dist/compiled/react-server-dom-webpack-experimental/client`
            ),
          ],
          [
            "react-server-dom-webpack/client.edge",
            require.resolve(
              `next/dist/compiled/react-server-dom-webpack-experimental/client.edge`
            ),
          ],
          [
            "react-server-dom-webpack/server.edge",
            require.resolve(
              `next/dist/compiled/react-server-dom-webpack-experimental/server.edge`
            ),
          ],
          [
            "react-server-dom-webpack/server.node",
            require.resolve(
              `next/dist/compiled/react-server-dom-webpack-experimental/server.node`
            ),
          ],
        ],
        "app"
      );
    } else {
      addHookAliases(
        [
          ["react", require.resolve(`next/dist/compiled/react`)],
          [
            "react/jsx-runtime",
            require.resolve(`next/dist/compiled/react/jsx-runtime`),
          ],
          [
            "react/jsx-dev-runtime",
            require.resolve(`next/dist/compiled/react/jsx-dev-runtime`),
          ],
          [
            "react-dom",
            require.resolve(
              `next/dist/compiled/react-dom/server-rendering-stub`
            ),
          ],
          [
            "react-dom/client",
            require.resolve(`next/dist/compiled/react-dom/client`),
          ],
          [
            "react-dom/server",
            require.resolve(`next/dist/compiled/react-dom/server`),
          ],
          [
            "react-dom/server.browser",
            require.resolve(`next/dist/compiled/react-dom/server.browser`),
          ],
          [
            "react-dom/server.edge",
            require.resolve(`next/dist/compiled/react-dom/server.edge`),
          ],
          [
            "react-server-dom-webpack/client",
            require.resolve(
              `next/dist/compiled/react-server-dom-webpack/client`
            ),
          ],
          [
            "react-server-dom-webpack/client.edge",
            require.resolve(
              `next/dist/compiled/react-server-dom-webpack/client.edge`
            ),
          ],
          [
            "react-server-dom-webpack/server.edge",
            require.resolve(
              `next/dist/compiled/react-server-dom-webpack/server.edge`
            ),
          ],
          [
            "react-server-dom-webpack/server.node",
            require.resolve(
              `next/dist/compiled/react-server-dom-webpack/server.node`
            ),
          ],
        ],
        "app"
      );
    }
  }
}

function isApp() {
  return (
    process.env.__NEXT_PRIVATE_PREBUNDLED_REACT === "next" ||
    process.env.__NEXT_PRIVATE_PREBUNDLED_REACT === "experimental"
  );
}

export function applyOverride() {
  mod._resolveFilename = function (
    originalResolveFilename: typeof resolveFilename,
    requestMapApp: Map<string, string>,
    requestMapPage: Map<string, string>,
    request: string,
    parent: any,
    isMain: boolean,
    options: any
  ) {
    const hookResolved = isApp()
      ? requestMapApp.get(request)
      : requestMapPage.get(request);
    if (hookResolved) request = hookResolved;
    return originalResolveFilename.call(mod, request, parent, isMain, options);

    // We use `bind` here to avoid referencing outside variables to create potential memory leaks.
  }.bind(null, resolveFilename, hookPropertyMapApp, hookPropertyMapPage);
}
