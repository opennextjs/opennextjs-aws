import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import {
  createEmptyBodyRule,
  errorInspectRule,
} from "@opennextjs/aws/build/patch/patches/dropBabel.js";
import { describe, expect, test } from "vitest";

describe("babel-drop", () => {
  test("Drop body", () => {
    const code = `
class NextNodeServer extends _baseserver.default {
    constructor(options){
        // Initialize super class
        super(options);
        this.handleNextImageRequest = async (req, res, parsedUrl) => { /* ... */ };
    }
    async handleUpgrade() {
    // The web server does not support web sockets, it's only used for HMR in
    // development.
    }
    getEnabledDirectories(dev) {
        const dir = dev ? this.dir : this.serverDistDir;
        return {
            app: (0, _findpagesdir.findDir)(dir, "app") ? true : false,
            pages: (0, _findpagesdir.findDir)(dir, "pages") ? true : false
        };
    }
    /**
   * This method gets all middleware matchers and execute them when the request
   * matches. It will make sure that each middleware exists and is compiled and
   * ready to be invoked. The development server will decorate it to add warns
   * and errors with rich traces.
   */ async runMiddleware(params) {
        if (process.env.NEXT_MINIMAL) {
            throw new Error('invariant: runMiddleware should not be called in minimal mode');
        }
        // Middleware is skipped for on-demand revalidate requests
        if ((0, _apiutils.checkIsOnDemandRevalidate)(params.request, this.renderOpts.previewProps).isOnDemandRevalidate) {
            return {
                response: new Response(null, {
                    headers: {
                        'x-middleware-next': '1'
                    }
                })
            };
        }
      // ...
    }
    async runEdgeFunction(params) {
        if (process.env.NEXT_MINIMAL) {
            throw new Error('Middleware is not supported in minimal mode.');
        }
        let edgeInfo;
        const { query, page, match } = params;
        if (!match) await this.ensureEdgeFunction({
            page,
            appPaths: params.appPaths,
            url: params.req.url
        });
        // ...
    }
    // ...
}`;

    expect(
      patchCode(code, createEmptyBodyRule("runMiddleware")),
    ).toMatchInlineSnapshot(`
      "class NextNodeServer extends _baseserver.default {
          constructor(options){
              // Initialize super class
              super(options);
              this.handleNextImageRequest = async (req, res, parsedUrl) => { /* ... */ };
          }
          async handleUpgrade() {
          // The web server does not support web sockets, it's only used for HMR in
          // development.
          }
          getEnabledDirectories(dev) {
              const dir = dev ? this.dir : this.serverDistDir;
              return {
                  app: (0, _findpagesdir.findDir)(dir, "app") ? true : false,
                  pages: (0, _findpagesdir.findDir)(dir, "pages") ? true : false
              };
          }
          /**
         * This method gets all middleware matchers and execute them when the request
         * matches. It will make sure that each middleware exists and is compiled and
         * ready to be invoked. The development server will decorate it to add warns
         * and errors with rich traces.
         */ async runMiddleware(params) {
        throw new Error("runMiddleware should not be called with OpenNext");
      }
          async runEdgeFunction(params) {
              if (process.env.NEXT_MINIMAL) {
                  throw new Error('Middleware is not supported in minimal mode.');
              }
              let edgeInfo;
              const { query, page, match } = params;
              if (!match) await this.ensureEdgeFunction({
                  page,
                  appPaths: params.appPaths,
                  url: params.req.url
              });
              // ...
          }
          // ...
      }"
    `);

    expect(
      patchCode(code, createEmptyBodyRule("runEdgeFunction")),
    ).toMatchInlineSnapshot(`
      "class NextNodeServer extends _baseserver.default {
          constructor(options){
              // Initialize super class
              super(options);
              this.handleNextImageRequest = async (req, res, parsedUrl) => { /* ... */ };
          }
          async handleUpgrade() {
          // The web server does not support web sockets, it's only used for HMR in
          // development.
          }
          getEnabledDirectories(dev) {
              const dir = dev ? this.dir : this.serverDistDir;
              return {
                  app: (0, _findpagesdir.findDir)(dir, "app") ? true : false,
                  pages: (0, _findpagesdir.findDir)(dir, "pages") ? true : false
              };
          }
          /**
         * This method gets all middleware matchers and execute them when the request
         * matches. It will make sure that each middleware exists and is compiled and
         * ready to be invoked. The development server will decorate it to add warns
         * and errors with rich traces.
         */ async runMiddleware(params) {
              if (process.env.NEXT_MINIMAL) {
                  throw new Error('invariant: runMiddleware should not be called in minimal mode');
              }
              // Middleware is skipped for on-demand revalidate requests
              if ((0, _apiutils.checkIsOnDemandRevalidate)(params.request, this.renderOpts.previewProps).isOnDemandRevalidate) {
                  return {
                      response: new Response(null, {
                          headers: {
                              'x-middleware-next': '1'
                          }
                      })
                  };
              }
            // ...
          }
          async runEdgeFunction(params) {
        throw new Error("runEdgeFunction should not be called with OpenNext");
      }
          // ...
      }"
    `);
  });

  test("Error Inspect", () => {
    const code = `
// This file should be imported before any others. It sets up the environment
// for later imports to work properly.
"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
require("./node-environment-baseline");
require("./node-environment-extensions/error-inspect");
require("./node-environment-extensions/random");
require("./node-environment-extensions/date");
require("./node-environment-extensions/web-crypto");
require("./node-environment-extensions/node-crypto");
//# sourceMappingURL=node-environment.js.map
}`;

    expect(patchCode(code, errorInspectRule)).toMatchInlineSnapshot(`
      "// This file should be imported before any others. It sets up the environment
      // for later imports to work properly.
      "use strict";
      Object.defineProperty(exports, "__esModule", {
          value: true
      });
      require("./node-environment-baseline");
      // Removed by OpenNext
      // require("./node-environment-extensions/error-inspect");
      require("./node-environment-extensions/random");
      require("./node-environment-extensions/date");
      require("./node-environment-extensions/web-crypto");
      require("./node-environment-extensions/node-crypto");
      //# sourceMappingURL=node-environment.js.map
      }"
    `);
  });
});
