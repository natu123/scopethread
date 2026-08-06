import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";

export class ConfigurationError extends Error {
  override readonly name = "ConfigurationError";
}

interface ParameterReader {
  send(command: GetParameterCommand): Promise<{
    Parameter?: { Value?: string };
  }>;
  destroy(): void;
}

type ParameterReaderFactory = (region: string) => ParameterReader;

function createParameterReader(region: string): ParameterReader {
  return new SSMClient({ region });
}

function validRuntimeDatabaseUrl(value: string): boolean {
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

export async function loadDatabaseUrl(
  environment: NodeJS.ProcessEnv = process.env,
  createReader: ParameterReaderFactory = createParameterReader,
): Promise<string> {
  const localConnectionString = environment.DATABASE_URL?.trim();
  if (localConnectionString) {
    return localConnectionString;
  }

  const parameterName = environment.DATABASE_URL_PARAMETER_NAME?.trim();
  if (!parameterName) {
    throw new ConfigurationError(
      "DATABASE_URL or DATABASE_URL_PARAMETER_NAME is not configured.",
    );
  }

  const reader = createReader(
    environment.AWS_REGION?.trim() || "ap-southeast-1",
  );
  let response: { Parameter?: { Value?: string } };
  try {
    response = await reader.send(
      new GetParameterCommand({ Name: parameterName, WithDecryption: true }),
    );
  } catch {
    throw new ConfigurationError(
      "The database URL parameter could not be loaded.",
    );
  } finally {
    reader.destroy();
  }

  const connectionString = response.Parameter?.Value?.trim();
  if (!connectionString) {
    throw new ConfigurationError("The database URL parameter is empty.");
  }
  if (!validRuntimeDatabaseUrl(connectionString)) {
    throw new ConfigurationError("The database URL parameter is invalid.");
  }
  return connectionString;
}
