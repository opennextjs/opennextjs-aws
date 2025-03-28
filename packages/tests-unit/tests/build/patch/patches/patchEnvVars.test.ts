import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import { envVarRuleCreator } from "@opennextjs/aws/build/patch/patches/patchEnvVar.js";
import { describe, it } from "vitest";

const moduleCompiledCode = `
"use strict";
if (process.env.NEXT_RUNTIME === 'edge') {
    module.exports = require('next/dist/server/route-modules/app-page/module.js');
} else {
    if (process.env.__NEXT_EXPERIMENTAL_REACT) {
        if (process.env.NODE_ENV === 'development') {
            module.exports = require('next/dist/compiled/next-server/app-page-experimental.runtime.dev.js');
        } else if (process.env.TURBOPACK) {
            module.exports = require('next/dist/compiled/next-server/app-page-turbo-experimental.runtime.prod.js');
        } else {
            module.exports = require('next/dist/compiled/next-server/app-page-experimental.runtime.prod.js');
        }
    } else {
        if (process.env.NODE_ENV === 'development') {
            module.exports = require('next/dist/compiled/next-server/app-page.runtime.dev.js');
        } else if (process.env.TURBOPACK) {
            module.exports = require('next/dist/compiled/next-server/app-page-turbo.runtime.prod.js');
        } else {
            module.exports = require('next/dist/compiled/next-server/app-page.runtime.prod.js');
        }
    }
}
`;

const reactJSXRuntimeCode = `
'use strict';

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./cjs/react-jsx-runtime.production.js');
} else {
  module.exports = require('./cjs/react-jsx-runtime.development.js');
}
`;

describe("patch NODE_ENV", () => {
  it("should patch NODE_ENV in module.compiled", () => {
    expect(
      patchCode(
        moduleCompiledCode,
        envVarRuleCreator("NODE_ENV", '"production"'),
      ),
    ).toMatchInlineSnapshot(`
""use strict";
if (process.env.NEXT_RUNTIME === 'edge') {
    module.exports = require('next/dist/server/route-modules/app-page/module.js');
} else {
    if (process.env.__NEXT_EXPERIMENTAL_REACT) {
        if ("production" === 'development') {
            module.exports = require('next/dist/compiled/next-server/app-page-experimental.runtime.dev.js');
        } else if (process.env.TURBOPACK) {
            module.exports = require('next/dist/compiled/next-server/app-page-turbo-experimental.runtime.prod.js');
        } else {
            module.exports = require('next/dist/compiled/next-server/app-page-experimental.runtime.prod.js');
        }
    } else {
        if ("production" === 'development') {
            module.exports = require('next/dist/compiled/next-server/app-page.runtime.dev.js');
        } else if (process.env.TURBOPACK) {
            module.exports = require('next/dist/compiled/next-server/app-page-turbo.runtime.prod.js');
        } else {
            module.exports = require('next/dist/compiled/next-server/app-page.runtime.prod.js');
        }
    }
}
"`);
  });

  it("should patch NODE_ENV in react/jsx-runtime", () => {
    expect(
      patchCode(
        reactJSXRuntimeCode,
        envVarRuleCreator("NODE_ENV", '"production"'),
      ),
    ).toMatchInlineSnapshot(`
"'use strict';

if ("production" === 'production') {
  module.exports = require('./cjs/react-jsx-runtime.production.js');
} else {
  module.exports = require('./cjs/react-jsx-runtime.development.js');
}
"`);
  });
});

describe("patch NEXT_RUNTIME", () => {
  it("should patch NEXT_RUNTIME in module.compiled", () => {
    expect(
      patchCode(
        moduleCompiledCode,
        envVarRuleCreator("NEXT_RUNTIME", '"node"'),
      ),
    ).toMatchInlineSnapshot(`
""use strict";
if ("node" === 'edge') {
    module.exports = require('next/dist/server/route-modules/app-page/module.js');
} else {
    if (process.env.__NEXT_EXPERIMENTAL_REACT) {
        if (process.env.NODE_ENV === 'development') {
            module.exports = require('next/dist/compiled/next-server/app-page-experimental.runtime.dev.js');
        } else if (process.env.TURBOPACK) {
            module.exports = require('next/dist/compiled/next-server/app-page-turbo-experimental.runtime.prod.js');
        } else {
            module.exports = require('next/dist/compiled/next-server/app-page-experimental.runtime.prod.js');
        }
    } else {
        if (process.env.NODE_ENV === 'development') {
            module.exports = require('next/dist/compiled/next-server/app-page.runtime.dev.js');
        } else if (process.env.TURBOPACK) {
            module.exports = require('next/dist/compiled/next-server/app-page-turbo.runtime.prod.js');
        } else {
            module.exports = require('next/dist/compiled/next-server/app-page.runtime.prod.js');
        }
    }
}
"`);
  });
});

describe("patch TURBOPACK", () => {
  it("should patch TURBOPACK in module.compiled", () => {
    expect(
      patchCode(moduleCompiledCode, envVarRuleCreator("TURBOPACK", "false")),
    ).toMatchInlineSnapshot(`
""use strict";
if (process.env.NEXT_RUNTIME === 'edge') {
    module.exports = require('next/dist/server/route-modules/app-page/module.js');
} else {
    if (process.env.__NEXT_EXPERIMENTAL_REACT) {
        if (process.env.NODE_ENV === 'development') {
            module.exports = require('next/dist/compiled/next-server/app-page-experimental.runtime.dev.js');
        } else if (false) {
            module.exports = require('next/dist/compiled/next-server/app-page-turbo-experimental.runtime.prod.js');
        } else {
            module.exports = require('next/dist/compiled/next-server/app-page-experimental.runtime.prod.js');
        }
    } else {
        if (process.env.NODE_ENV === 'development') {
            module.exports = require('next/dist/compiled/next-server/app-page.runtime.dev.js');
        } else if (false) {
            module.exports = require('next/dist/compiled/next-server/app-page-turbo.runtime.prod.js');
        } else {
            module.exports = require('next/dist/compiled/next-server/app-page.runtime.prod.js');
        }
    }
}
"`);
  });
});
