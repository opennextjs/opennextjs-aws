import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import path from "node:path";

import {
  applyRule,
  parseCode,
} from "@opennextjs/aws/build/patch/astCodePatcher.js";

// Do not let a previous bundler's standalone output contribute stale files.
rmSync(".next", { recursive: true, force: true });
rmSync(".open-next", { recursive: true, force: true });
execFileSync(
  process.execPath,
  ["../../packages/open-next/dist/index.js", "build"],
  {
    stdio: "inherit",
  },
);

// Deliberately independent of the production filename/content filters and guard
// matcher: a broken filter must not hide a shipped ResponseCache copy.
const staleCheck = {
  rule: {
    pattern: "!$ENTRY.isStale || $CONTEXT.isPrefetch",
    inside: {
      kind: "if_statement",
      stopBy: "end",
      has: {
        field: "condition",
        stopBy: "end",
        pattern: "!$CONTEXT.isOnDemandRevalidate",
      },
    },
  },
};
const output = ".open-next/server-functions/default";
const patched = [];
for (const name of readdirSync(output, { recursive: true })) {
  if (!/\.m?js$/.test(name)) continue;
  const original = path.join(".next/standalone", name);
  if (!existsSync(original) || !statSync(original).isFile()) continue;
  const before = readFileSync(original, "utf8");
  if (!before.includes("isStale") || !before.includes("isPrefetch")) continue;
  const originalMatches = applyRule(staleCheck, parseCode(before)).matches;
  if (originalMatches.length === 0) continue;
  const after = readFileSync(path.join(output, name), "utf8");
  assert.equal(
    applyRule(staleCheck, parseCode(after)).matches.length,
    0,
    `Unpatched background revalidation in shipped file: ${name}`,
  );
  patched.push(name);
}

assert(
  patched.length > 0,
  "The fixture must exercise real ResponseCache copies",
);
assert(patched.some((name) => name.endsWith(".runtime.prod.js")));
const builtCode = readdirSync(".next", { recursive: true })
  .filter((name) => /\.m?js$/.test(name))
  .map((name) => path.join(".next", name))
  .filter((name) => statSync(name).isFile())
  .map((name) => readFileSync(name, "utf8"));
assert(
  builtCode.some(
    (code) =>
      code.includes("LOOKALIKE_CONTEXT") &&
      code.includes("isOnDemandRevalidate") &&
      code.includes("isPrefetch"),
  ),
  "The patch must not rewrite lookalike application expressions",
);
if ((process.env.NEXT_BUNDLER ?? "turbopack") === "turbopack") {
  assert(
    patched.some((name) => name.split(path.sep).includes("chunks")),
    "Turbopack must exercise a generated chunk, not just installed runtimes",
  );
}
console.log(
  `Verified ${patched.length} patched ResponseCache copies:\n${patched.join("\n")}`,
);
