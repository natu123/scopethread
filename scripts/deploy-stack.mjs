import { spawnSync } from "node:child_process";

const awsCommand = process.platform === "win32"
  ? "C:\\Program Files\\Amazon\\AWSCLIV2\\aws.exe"
  : "aws";
const nodeCommand = process.execPath;
const profile = "scopethread-dev";
const region = "ap-southeast-1";
const bootstrapStackName = "scopethread-bootstrap";
const applicationStackName = "scopethread";
const shouldApply = process.argv.includes("--apply");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function run(command, args, capture = false) {
  const result = spawnSync(command, args, {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });
  if (result.error) {
    fail(`${command} could not be started: ${result.error.message}`);
  }
  if (result.status !== 0) {
    if (capture && result.stderr) {
      console.error(result.stderr.trim());
    }
    fail(`${command} exited with status ${result.status}.`);
  }
  return result.stdout?.trim() ?? "";
}

if (process.argv.includes("--help")) {
  console.log(`Usage:
  npm run aws:deploy -- --apply

Without --apply, no AWS API is called. With --apply, the command requires the
scopethread-dev caller, reads only the fixed bootstrap outputs, runs the local
SAM checks, and deploys the fixed scopethread stack through the dedicated
CloudFormation service role.`);
} else if (!shouldApply) {
  console.log(
    "AWS deployment dry gate passed for stack scopethread. No AWS API was called. Re-run with --apply after explicit approval.",
  );
} else {
  const aws = ["--profile", profile, "--region", region];
  const identity = JSON.parse(
    run(awsCommand, ["sts", "get-caller-identity", ...aws, "--output", "json"], true),
  );
  if (!identity.Arn?.endsWith(":user/scopethread-dev")) {
    fail("AWS deployment refuses root or any caller other than scopethread-dev.");
  }

  const bootstrap = JSON.parse(
    run(awsCommand, [
      "cloudformation",
      "describe-stacks",
      "--stack-name",
      bootstrapStackName,
      ...aws,
      "--output",
      "json",
    ], true),
  ).Stacks?.[0];
  const outputs = Object.fromEntries(
    (bootstrap?.Outputs ?? []).map((entry) => [entry.OutputKey, entry.OutputValue]),
  );
  const artifactBucket = outputs.ArtifactBucketName;
  const cloudFormationRoleArn = outputs.CloudFormationExecutionRoleArn;
  const lambdaRoleArn = outputs.ApiFunctionExecutionRoleArn;
  const accountId = identity.Account;
  if (
    !bootstrap?.StackStatus?.endsWith("COMPLETE") ||
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(artifactBucket ?? "") ||
    cloudFormationRoleArn !==
      `arn:aws:iam::${accountId}:role/scopethread-cloudformation-execution` ||
    lambdaRoleArn !==
      `arn:aws:iam::${accountId}:role/scopethread-lambda-execution`
  ) {
    fail("The fixed deployment-bootstrap outputs are missing or invalid.");
  }

  run(nodeCommand, ["scripts/run-sam.mjs", "validate", "--lint", "--template-file", "infra/template.yaml"]);
  run(nodeCommand, ["scripts/run-sam.mjs", "build", "--template-file", "infra/template.yaml"]);
  run(nodeCommand, ["scripts/check-sam-artifact.mjs"]);
  run(nodeCommand, [
    "scripts/run-sam.mjs",
    "deploy",
    "--template-file",
    ".aws-sam/build/template.yaml",
    "--stack-name",
    applicationStackName,
    "--s3-bucket",
    artifactBucket,
    "--s3-prefix",
    applicationStackName,
    "--role-arn",
    cloudFormationRoleArn,
    "--parameter-overrides",
    `ApiFunctionRoleArn=${lambdaRoleArn}`,
    "--no-confirm-changeset",
    "--no-fail-on-empty-changeset",
    "--profile",
    profile,
    "--region",
    region,
  ]);

  const application = JSON.parse(
    run(awsCommand, [
      "cloudformation",
      "describe-stacks",
      "--stack-name",
      applicationStackName,
      ...aws,
      "--output",
      "json",
    ], true),
  ).Stacks?.[0];
  if (!application?.StackStatus?.endsWith("COMPLETE")) {
    fail("The ScopeThread application stack did not reach a complete state.");
  }
  console.log(
    `ScopeThread stack deployment verified with status ${application.StackStatus}.`,
  );
}
