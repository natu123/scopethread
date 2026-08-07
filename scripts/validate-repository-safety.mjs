import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import {
  findForbiddenContent,
  isForbiddenSecretPath,
} from "./repository-safety-rules.mjs";

const repositoryUrl = new URL("..", import.meta.url);
const textExtensions = new Set([
  "",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".sql",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);
const trackedOutput = execFileSync("git", ["ls-files", "-z"], {
  cwd: repositoryUrl,
  encoding: "utf8",
});
const trackedFiles = trackedOutput.split("\0").filter(Boolean);

for (const path of trackedFiles) {
  if (isForbiddenSecretPath(path)) {
    throw new Error(`Local secret file must not be tracked: ${path}`);
  }
  if (!textExtensions.has(extname(path).toLowerCase())) {
    continue;
  }
  const content = await readFile(new URL(path.replaceAll("\\", "/"), repositoryUrl), "utf8");
  for (const rule of findForbiddenContent(content)) {
    throw new Error(`Tracked ${rule} detected in ${path}.`);
  }
}

const ignoredOutput = execFileSync(
  "git",
  ["check-ignore", ".env.local", ".env.runtime.local"],
  { cwd: repositoryUrl, encoding: "utf8" },
);
const ignoredFiles = new Set(ignoredOutput.trim().split(/\r?\n/));
for (const path of [".env.local", ".env.runtime.local"]) {
  if (!ignoredFiles.has(path)) {
    throw new Error(`Local secret file is not ignored: ${path}`);
  }
}

const example = await readFile(new URL("../.env.example", import.meta.url), "utf8");
for (const name of ["DATABASE_URL", "RUNTIME_DATABASE_URL", "VITE_API_BASE_URL"]) {
  const match = example.match(new RegExp(`^${name}=(.*)$`, "m"));
  if (match?.[1]?.trim()) {
    throw new Error(`${name} must be empty in .env.example.`);
  }
}

console.log(
  `Repository safety verified across ${trackedFiles.length} tracked files; local secret files remain ignored.`,
);
