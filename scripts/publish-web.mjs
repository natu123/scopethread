import { spawnSync } from "node:child_process";

const expectedProfile = "scopethread-dev";
const stackNamePattern = /^[A-Za-z][A-Za-z0-9-]{0,127}$/;
const nodeCommand = process.execPath;
const npmCli = process.env.npm_execpath;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    env: options.env ?? process.env,
  });
  if (result.error) {
    fail(`${command} could not be started: ${result.error.message}`);
  }
  if (result.status !== 0) {
    if (options.capture && result.stderr) {
      console.error(result.stderr.trim());
    }
    fail(`${command} exited with status ${result.status}.`);
  }
  return result.stdout?.trim() ?? "";
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv.includes("--help")) {
  console.log(`Usage:
  npm run web:publish -- --stack-name scopethread --apply

The command verifies the scopethread-dev caller, reads CloudFormation outputs,
builds the web app with the deployed API URL, syncs the build to the retained
S3 web bucket, and creates a CloudFront invalidation.

Without --apply, the command exits before any AWS API call.`);
  process.exit(0);
}

const stackName = option("--stack-name");
const profile = option("--profile") ?? process.env.AWS_PROFILE ?? expectedProfile;
const region = option("--region") ?? process.env.AWS_REGION ?? "ap-southeast-1";
const apply = process.argv.includes("--apply");

if (!stackName || !stackNamePattern.test(stackName)) {
  fail("Provide a valid CloudFormation stack name with --stack-name.");
}
if (profile !== expectedProfile) {
  fail(`Web publishing requires the ${expectedProfile} AWS profile.`);
}
if (region !== "ap-southeast-1") {
  fail("ScopeThread web publishing is restricted to ap-southeast-1.");
}

if (!apply) {
  console.log(
    `Dry gate passed for stack ${stackName}. No AWS API was called. Re-run with --apply after explicit approval.`,
  );
  process.exit(0);
}

const aws = ["--profile", profile, "--region", region];
const identity = JSON.parse(
  run("aws", ["sts", "get-caller-identity", ...aws, "--output", "json"], {
    capture: true,
  }),
);
if (!identity.Arn?.endsWith(":user/scopethread-dev")) {
  fail("Web publishing refuses root or any AWS identity other than scopethread-dev.");
}

const stack = JSON.parse(
  run(
    "aws",
    [
      "cloudformation",
      "describe-stacks",
      "--stack-name",
      stackName,
      ...aws,
      "--output",
      "json",
    ],
    { capture: true },
  ),
).Stacks?.[0];
if (!stack || stack.StackStatus?.includes("ROLLBACK")) {
  fail("The target CloudFormation stack is unavailable or rolled back.");
}

const outputs = Object.fromEntries(
  (stack.Outputs ?? []).map((entry) => [entry.OutputKey, entry.OutputValue]),
);
const apiUrl = outputs.ApiUrl;
const bucketName = outputs.WebBucketName;
const distributionId = outputs.DistributionId;
const distributionDomainName = outputs.DistributionDomainName;
if (
  !/^https:\/\/[a-z0-9]+\.execute-api\.ap-southeast-1\.amazonaws\.com$/.test(
    apiUrl ?? "",
  ) ||
  !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucketName ?? "") ||
  !/^[A-Z0-9]{8,32}$/.test(distributionId ?? "") ||
  !/^[a-z0-9]+\.cloudfront\.net$/.test(distributionDomainName ?? "")
) {
  fail("The stack has missing or invalid web deployment outputs.");
}

console.log(`Publishing ScopeThread web assets to s3://${bucketName}.`);
if (!npmCli) {
  fail("The npm CLI path is unavailable. Run this publisher through npm run web:publish.");
}
run(nodeCommand, [npmCli, "run", "build", "--workspace", "@scopethread/web"], {
  env: { ...process.env, VITE_API_BASE_URL: apiUrl },
});
run("aws", [
  "s3",
  "sync",
  "apps/web/dist",
  `s3://${bucketName}`,
  "--delete",
  ...aws,
]);
run("aws", [
  "cloudfront",
  "create-invalidation",
  "--distribution-id",
  distributionId,
  "--paths",
  "/*",
  ...aws,
  "--output",
  "json",
]);
console.log(`Published https://${distributionDomainName}.`);
