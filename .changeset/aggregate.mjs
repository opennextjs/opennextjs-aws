import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const { version } = JSON.parse(
  await fs.readFile("./packages/open-next/package.json"),
);

const changes = new Set();

// We only need to look for changes in packages/open-next
const changelog = path.join("packages", "open-next", "CHANGELOG.md");
const lines = (await fs.readFile(changelog)).toString().split("\n");
let start = false;
for (const line of lines) {
  if (!start) {
    if (line === `## ${version}`) {
      start = true;
      continue;
    }
  }

  if (start) {
    if (line.startsWith("-") || line.startsWith("*")) {
      if (line.includes("Updated dependencies")) continue;
      if (line.includes("@serverless-stack/")) continue;

      changes.add(line);
      continue;
    }

    if (line.startsWith("## ")) break;
  }
}

const notes = ["#### Changes", ...changes].join("\n");
console.log(notes);

const delimiter = randomUUID();
await fs.appendFile(
  process.env.GITHUB_OUTPUT,
  `version=v${version}\nnotes<<${delimiter}\n${notes}\n${delimiter}\n`,
);

execSync(`git tag v${version}`);
execSync("git push origin --tags");
