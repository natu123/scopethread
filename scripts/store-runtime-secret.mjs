import { GetParameterCommand, PutParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const runtimeEnvironmentPath = fileURLToPath(
  new URL("../.env.runtime.local", import.meta.url),
);
if (existsSync(runtimeEnvironmentPath)) {
  process.loadEnvFile(runtimeEnvironmentPath);
}

const expectedProfile = "scopethread-dev";
const expectedRegion = "ap-southeast-1";
const parameterName = "/scopethread/prod/database-url";
const shouldApply = process.argv.includes("--apply");
const connectionString = process.env.RUNTIME_DATABASE_URL?.trim();
const profile = process.env.AWS_PROFILE?.trim() || expectedProfile;
const region = process.env.AWS_REGION?.trim() || expectedRegion;

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function validRuntimeUrl(value) {
  try {
    const url = new URL(value);
    return (
      ["postgres:", "postgresql:"].includes(url.protocol) &&
      decodeURIComponent(url.username) === "scopethread_app" &&
      Boolean(url.password) &&
      url.pathname === "/defaultdb" &&
      url.searchParams.get("sslmode") === "verify-full"
    );
  } catch {
    return false;
  }
}

if (process.argv.includes("--help")) {
  console.log(`Usage:
  npm run aws:store-runtime-secret -- --apply

Without --apply, this command validates only local configuration. With --apply,
it refuses root, stores RUNTIME_DATABASE_URL as the fixed Parameter Store
SecureString ${parameterName}, and verifies metadata without printing the value.`);
} else if (!connectionString) {
  fail("RUNTIME_DATABASE_URL is empty. Provision .env.runtime.local first.");
} else if (!validRuntimeUrl(connectionString)) {
  fail(
    "RUNTIME_DATABASE_URL must use scopethread_app, defaultdb, a password, and verified TLS.",
  );
} else if (profile !== expectedProfile) {
  fail(`Secret storage requires the ${expectedProfile} AWS profile.`);
} else if (region !== expectedRegion) {
  fail(`Secret storage is restricted to ${expectedRegion}.`);
} else if (!shouldApply) {
  console.log(
    `Runtime-secret dry gate passed for ${parameterName}. No AWS API was called. Re-run with --apply after explicit approval.`,
  );
} else {
  const sts = new STSClient({ region });
  const ssm = new SSMClient({ region });
  try {
    const identity = await sts.send(new GetCallerIdentityCommand({}));
    if (!identity.Arn?.endsWith(":user/scopethread-dev")) {
      throw new Error(
        "Secret storage refuses root or any AWS identity other than scopethread-dev.",
      );
    }

    const stored = await ssm.send(
      new PutParameterCommand({
        Name: parameterName,
        Description: "ScopeThread Lambda runtime CockroachDB connection string.",
        Type: "SecureString",
        Tier: "Standard",
        Value: connectionString,
        Overwrite: true,
      }),
    );
    const verified = await ssm.send(
      new GetParameterCommand({ Name: parameterName, WithDecryption: false }),
    );
    if (
      verified.Parameter?.Name !== parameterName ||
      verified.Parameter.Type !== "SecureString" ||
      verified.Parameter.Version !== stored.Version
    ) {
      throw new Error("Parameter Store metadata verification failed.");
    }
    console.log(
      `Stored ${parameterName} as a Standard SecureString at version ${stored.Version}. The value was not printed.`,
    );
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "Unknown error";
    const safeMessage = rawMessage.replaceAll(connectionString, "[redacted]");
    fail(`Runtime-secret storage failed: ${safeMessage}`);
  } finally {
    sts.destroy();
    ssm.destroy();
  }
}
