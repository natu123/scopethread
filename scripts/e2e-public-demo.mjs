import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const expectedProfile = "scopethread-dev";
const expectedRegion = "ap-southeast-1";
const stackNamePattern = /^[A-Za-z][A-Za-z0-9-]{0,127}$/;
const shouldApply = process.argv.includes("--apply");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.error) {
    fail(`${command} could not be started: ${result.error.message}`);
  }
  if (result.status !== 0) {
    if (result.stderr) {
      console.error(result.stderr.trim());
    }
    fail(`${command} exited with status ${result.status}.`);
  }
  return result.stdout.trim();
}

async function jsonRequest(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(60_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const code = payload && typeof payload.error === "string"
      ? payload.error
      : `HTTP_${response.status}`;
    const category = payload && typeof payload.category === "string"
      ? ` (${payload.category})`
      : "";
    const run = payload && typeof payload.runId === "string"
      ? ` Agent run: ${payload.runId}.`
      : "";
    throw new Error(
      `${new URL(url).pathname} failed with ${code}${category}.${run}`,
    );
  }
  return { response, payload };
}

if (process.argv.includes("--help")) {
  console.log(`Usage:
  npm run e2e:public-demo -- --stack-name scopethread --apply

Without --apply, no AWS or public HTTP request is made. With --apply, this
command verifies the scoped AWS caller, reads the named stack outputs, and runs
the complete paid public demo scenario through CloudFront and API Gateway.`);
  process.exit(0);
}

const stackName = option("--stack-name");
const profile = option("--profile") ?? process.env.AWS_PROFILE ?? expectedProfile;
const region = option("--region") ?? process.env.AWS_REGION ?? expectedRegion;
if (!stackName || !stackNamePattern.test(stackName)) {
  fail("Provide a valid CloudFormation stack name with --stack-name.");
}
if (profile !== expectedProfile) {
  fail(`Public E2E requires the ${expectedProfile} AWS profile.`);
}
if (region !== expectedRegion) {
  fail(`Public E2E is restricted to ${expectedRegion}.`);
}
if (!shouldApply) {
  console.log(
    `Public E2E dry gate passed for stack ${stackName}. No AWS or HTTP request was made. Re-run with --apply after explicit approval.`,
  );
  process.exit(0);
}

const aws = ["--profile", profile, "--region", region];
const identity = JSON.parse(
  run("aws", ["sts", "get-caller-identity", ...aws, "--output", "json"]),
);
if (!identity.Arn?.endsWith(":user/scopethread-dev")) {
  fail("Public E2E refuses root or any AWS identity other than scopethread-dev.");
}

const stack = JSON.parse(
  run("aws", [
    "cloudformation",
    "describe-stacks",
    "--stack-name",
    stackName,
    ...aws,
    "--output",
    "json",
  ]),
).Stacks?.[0];
if (!stack || stack.StackStatus?.includes("ROLLBACK")) {
  fail("The target CloudFormation stack is unavailable or rolled back.");
}
const outputs = Object.fromEntries(
  (stack.Outputs ?? []).map((entry) => [entry.OutputKey, entry.OutputValue]),
);
const apiUrl = outputs.ApiUrl;
const webDomain = outputs.DistributionDomainName;
if (
  !/^https:\/\/[a-z0-9]+\.execute-api\.ap-southeast-1\.amazonaws\.com$/.test(
    apiUrl ?? "",
  ) ||
  !/^[a-z0-9]+\.cloudfront\.net$/.test(webDomain ?? "")
) {
  fail("The stack has missing or invalid public endpoint outputs.");
}

try {
  const webResponse = await fetch(`https://${webDomain}`, {
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (!webResponse.ok) {
    throw new Error(`CloudFront returned HTTP ${webResponse.status}.`);
  }
  const expectedHeaders = new Map([
    ["content-security-policy", "frame-ancestors 'none'"],
    ["strict-transport-security", "max-age=31536000"],
    ["x-content-type-options", "nosniff"],
    ["x-frame-options", "DENY"],
    ["referrer-policy", "same-origin"],
  ]);
  for (const [header, expected] of expectedHeaders) {
    if (!webResponse.headers.get(header)?.includes(expected)) {
      throw new Error(`CloudFront response is missing ${header}.`);
    }
  }

  const health = await jsonRequest(`${apiUrl}/health`);
  if (health.payload?.status !== "ready") {
    throw new Error("The deployed API health response is not ready.");
  }

  const session = await jsonRequest(`${apiUrl}/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  const token = session.payload?.token;
  const projectId = session.payload?.projectId;
  const initialMemoryId = session.payload?.initialDecision?.id;
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(token ?? "") ||
    !projectId ||
    !initialMemoryId
  ) {
    throw new Error("The public demo session response is incomplete.");
  }
  const authorization = { authorization: `Bearer ${token}` };

  const initialMemory = await jsonRequest(
    `${apiUrl}/memory?projectId=${encodeURIComponent(projectId)}`,
    { headers: authorization },
  );
  if (
    !initialMemory.payload?.items?.some(
      (item) => item.id === initialMemoryId && item.status === "active",
    )
  ) {
    throw new Error("Initial CockroachDB decision was not restored.");
  }

  const analysis = await jsonRequest(`${apiUrl}/analyze`, {
    method: "POST",
    headers: {
      ...authorization,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      projectId,
      conversationText:
        "The client has approved adding an online booking button to every page.",
      idempotencyKey: `public-e2e-${randomUUID()}`,
    }),
  });
  const runId = analysis.payload?.runId;
  const conflict = analysis.payload?.result?.conflicts?.find(
    (candidate) => candidate.priorMemoryId === initialMemoryId,
  );
  if (
    !runId ||
    !conflict ||
    !analysis.payload?.result?.retrievedEvidenceIds?.includes(initialMemoryId)
  ) {
    throw new Error("The live agent did not ground the expected conflict.");
  }

  const reason =
    "The client approved online booking after revising the launch scope.";
  const revision = await jsonRequest(`${apiUrl}/revisions`, {
    method: "POST",
    headers: {
      ...authorization,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      projectId,
      agentRunId: runId,
      priorMemoryId: initialMemoryId,
      reason,
    }),
  });
  const replacementMemoryId = revision.payload?.replacementMemoryId;
  if (!replacementMemoryId || revision.payload?.changed !== true) {
    throw new Error("The public revision was not persisted as a change.");
  }

  const persisted = await jsonRequest(
    `${apiUrl}/memory?projectId=${encodeURIComponent(projectId)}`,
    { headers: authorization },
  );
  const prior = persisted.payload?.items?.find(
    (item) => item.id === initialMemoryId,
  );
  const replacement = persisted.payload?.items?.find(
    (item) => item.id === replacementMemoryId,
  );
  const link = persisted.payload?.links?.find(
    (candidate) =>
      candidate.relation === "supersedes" &&
      candidate.fromMemoryId === replacementMemoryId &&
      candidate.toMemoryId === initialMemoryId,
  );
  if (
    prior?.status !== "superseded" ||
    replacement?.status !== "active" ||
    link?.reason !== reason
  ) {
    throw new Error("The persisted decision chain is incomplete.");
  }

  console.log(
    `Public demo E2E succeeded. Agent run ${runId} persisted a verified revision chain; no session token was printed.`,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown error";
  fail(`Public demo E2E failed: ${message}`);
}
