import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const defaultWindowsRuntime = join(
  process.env.ProgramFiles ?? "C:\\Program Files",
  "Amazon",
  "AWSSAMCLI",
  "runtime",
  "python.exe",
);

if (process.platform === "win32" && !existsSync(defaultWindowsRuntime)) {
  throw new Error(
    `AWS SAM CLI was not found at its default MSI location: ${defaultWindowsRuntime}`,
  );
}

const command =
  process.platform === "win32" ? defaultWindowsRuntime : "sam";
const commandArguments =
  process.platform === "win32"
    ? ["-m", "samcli", ...process.argv.slice(2)]
    : process.argv.slice(2);
const result = spawnSync(command, commandArguments, {
  stdio: "inherit",
  env: {
    ...process.env,
    SAM_CLI_TELEMETRY: "0",
  },
});

if (result.error) {
  throw result.error;
}

process.exitCode = result.status ?? 1;
