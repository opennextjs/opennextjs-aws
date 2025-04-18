import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const THANKLESS_COMMITTERS = ["thdxr", "fwang", "jayair", "conico974"];

const { version } = JSON.parse(
  await fs.readFile("./packages/open-next/package.json"),
);

const changes = new Set();

// We only need to look for changes in packages/open-next
const changelog = path.join("packages", "open-next", "CHANGELOG.md");
const lines = (await fs.readFile(changelog)).toString().split("\n");
let start = false;
for (let line of lines) {
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

      for (const user of THANKLESS_COMMITTERS) {
        line = line.replace(
          `Thanks [@${user}](https://github.com/${user})! `,
          "",
        );
      }
      changes.add(line);
      continue;
    }

    if (line.startsWith("## ")) break;
  }
}

const notes = ["#### Changes", ...changes];
console.log(notes.join("\n"));
console.log(`::set-output name=notes::${notes.join("%0A")}`);
console.log(`::set-output name=version::v${version}`);

execSync(`git tag v${version}`);
execSync("git push origin --tags");
