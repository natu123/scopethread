import { spawnSync } from "node:child_process";

const awsCommand = process.platform === "win32"
  ? "C:\\Program Files\\Amazon\\AWSCLIV2\\aws.exe"
  : "aws";
const profile = "scopethread";
const region = "ap-southeast-1";
const stackName = "scopethread-bootstrap";
const shouldApply = process.argv.includes("--apply");

function fail(message) {
  throw new Error(message);
}

function run(args, capture = false) {
  const result = spawnSync(awsCommand, args, {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });
  if (result.error) {
    fail(`AWS CLI could not be started: ${result.error.message}`);
  }
  if (result.status !== 0) {
    if (capture && result.stderr) {
      console.error(result.stderr.trim());
    }
    fail(`AWS CLI exited with status ${result.status}.`);
  }
  return result.stdout?.trim() ?? "";
}

if (process.argv.includes("--help")) {
  console.log(`Usage:
  npm run aws:bootstrap-deployment -- --apply

Without --apply, no AWS API is called. With --apply, the root profile creates
or updates only the fixed scopethread-bootstrap stack, then logs out. The stack
provides the artifact bucket, CloudFormation service role, Lambda execution
role, and scoped deployment policy for scopethread-dev.`);
} else if (!shouldApply) {
  console.log(
    "Deployment-bootstrap dry gate passed. No AWS API was called. Re-run with --apply after explicit approval.",
  );
} else {
  let callerVerified = false;
  try {
    const identity = JSON.parse(
      run([
        "sts",
        "get-caller-identity",
        "--profile",
        profile,
        "--output",
        "json",
      ], true),
    );
    if (!/^arn:aws:iam::[0-9]{12}:root$/.test(identity.Arn ?? "")) {
      fail("Deployment bootstrap requires the authenticated root profile.");
    }
    const developmentIdentity = JSON.parse(
      run([
        "sts",
        "get-caller-identity",
        "--profile",
        "scopethread-dev",
        "--output",
        "json",
      ], true),
    );
    if (
      developmentIdentity.Account !== identity.Account ||
      !developmentIdentity.Arn?.endsWith(":user/scopethread-dev")
    ) {
      fail(
        "Root and scopethread-dev profiles must resolve to the same AWS account.",
      );
    }
    callerVerified = true;

    run([
      "cloudformation",
      "deploy",
      "--template-file",
      "infra/deployment-bootstrap.yaml",
      "--stack-name",
      stackName,
      "--capabilities",
      "CAPABILITY_NAMED_IAM",
      "--parameter-overrides",
      "DevelopmentUserName=scopethread-dev",
      "ApplicationStackName=scopethread",
      "--no-fail-on-empty-changeset",
      "--profile",
      profile,
      "--region",
      region,
    ]);

    const stack = JSON.parse(
      run([
        "cloudformation",
        "describe-stacks",
        "--stack-name",
        stackName,
        "--profile",
        profile,
        "--region",
        region,
        "--output",
        "json",
      ], true),
    ).Stacks?.[0];
    const outputs = Object.fromEntries(
      (stack?.Outputs ?? []).map((entry) => [entry.OutputKey, entry.OutputValue]),
    );
    if (
      !stack?.StackStatus?.endsWith("COMPLETE") ||
      !outputs.ArtifactBucketName ||
      !/^arn:aws:iam::[0-9]{12}:role\/scopethread-cloudformation-execution$/.test(
        outputs.CloudFormationExecutionRoleArn ?? "",
      ) ||
      !/^arn:aws:iam::[0-9]{12}:role\/scopethread-lambda-execution$/.test(
        outputs.ApiFunctionExecutionRoleArn ?? "",
      )
    ) {
      fail("Deployment bootstrap outputs are incomplete or unsafe.");
    }
    console.log(
      `Deployment bootstrap verified with status ${stack.StackStatus}; no role credentials or secrets were printed.`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown bootstrap error";
    console.error(`Deployment bootstrap failed: ${message}`);
    process.exitCode = 1;
  } finally {
    if (callerVerified) {
      const logout = spawnSync(awsCommand, ["logout", "--profile", profile], {
        encoding: "utf8",
        stdio: "inherit",
      });
      if (logout.status !== 0) {
        console.error("Root profile logout did not complete successfully.");
        process.exitCode = 1;
      }
    }
  }
}
