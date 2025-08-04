import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher";
import { rule } from "@opennextjs/aws/build/patch/patches/patchNodeEnvironment";
import { computePatchDiff } from "./util.js";

test("nodeEnvironment", () => {
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
if (process.env.NODE_ENV === 'development') {
    require('./node-environment-extensions/console-dev');
}

//# sourceMappingURL=node-environment.js.map`;
  expect(
        computePatchDiff(
          "node-environment.js",
          code,
          rule,
        ),
      ).toMatchInlineSnapshot(`
        "Index: node-environment.js
        ===================================================================
        --- node-environment.js
        +++ node-environment.js
        @@ -1,13 +1,13 @@
        -
         // This file should be imported before any others. It sets up the environment
         // for later imports to work properly.
         "use strict";
         Object.defineProperty(exports, "__esModule", {
             value: true
         });
         require("./node-environment-baseline");
        -require("./node-environment-extensions/error-inspect");
        +// Removed by OpenNext
        +// require("./node-environment-extensions/error-inspect");
         require("./node-environment-extensions/random");
         require("./node-environment-extensions/date");
         require("./node-environment-extensions/web-crypto");
         require("./node-environment-extensions/node-crypto");
        "
      `);
});
