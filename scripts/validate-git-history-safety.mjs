import { execFileSync, spawnSync } from "node:child_process";

import {
  findForbiddenContent,
  isForbiddenSecretPath,
} from "./repository-safety-rules.mjs";

const repositoryUrl = new URL("..", import.meta.url);
const objectListing = execFileSync(
  "git",
  ["rev-list", "--objects", "--all"],
  { cwd: repositoryUrl, encoding: "utf8" },
);

const pathsByObject = new Map();
for (const line of objectListing.split(/\r?\n/)) {
  if (!line) {
    continue;
  }
  const match = line.match(/^([0-9a-f]+)(?: (.*))?$/i);
  if (!match) {
    throw new Error("Git returned an unexpected object listing.");
  }
  const [, objectId, path] = match;
  const paths = pathsByObject.get(objectId) ?? new Set();
  if (path) {
    paths.add(path);
  }
  pathsByObject.set(objectId, paths);
}

const objectIds = [...pathsByObject.keys()];
const batchCheck = spawnSync(
  "git",
  ["cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"],
  {
    cwd: repositoryUrl,
    encoding: "utf8",
    input: `${objectIds.join("\n")}\n`,
  },
);
if (batchCheck.status !== 0) {
  throw new Error(
    `Unable to inspect Git object metadata: ${batchCheck.stderr?.trim() || "unknown error"}`,
  );
}

const blobSizes = new Map();
for (const line of batchCheck.stdout.trim().split(/\r?\n/)) {
  const match = line.match(/^([0-9a-f]+) (\S+) (\d+)$/i);
  if (!match) {
    throw new Error("Git returned unexpected object metadata.");
  }
  const [, objectId, type, rawSize] = match;
  if (type === "blob") {
    blobSizes.set(objectId, Number(rawSize));
  }
}

const findings = [];
for (const [objectId, size] of blobSizes) {
  const paths = [...(pathsByObject.get(objectId) ?? [])];
  for (const path of paths) {
    if (isForbiddenSecretPath(path)) {
      findings.push({ objectId, path, rule: "forbidden secret path" });
    }
  }

  const content = execFileSync("git", ["cat-file", "blob", objectId], {
    cwd: repositoryUrl,
    encoding: "buffer",
    maxBuffer: Math.max(size + 1, 1024 * 1024),
  }).toString("latin1");
  for (const rule of findForbiddenContent(content)) {
    findings.push({
      objectId,
      path: paths[0] ?? "(path unavailable)",
      rule,
    });
  }
}

if (findings.length > 0) {
  const safeSummary = findings
    .slice(0, 20)
    .map(
      ({ objectId, path, rule }) =>
        `- ${rule} in blob ${objectId.slice(0, 12)} (${path})`,
    )
    .join("\n");
  const remainder = findings.length > 20
    ? `\n- ${findings.length - 20} additional finding(s) omitted.`
    : "";
  throw new Error(
    `Git history safety failed with ${findings.length} finding(s):\n${safeSummary}${remainder}`,
  );
}

console.log(
  `Git history safety verified across ${blobSizes.size} reachable blobs; no forbidden credential patterns or secret paths were detected.`,
);
