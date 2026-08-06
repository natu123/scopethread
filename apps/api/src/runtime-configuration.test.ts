import { describe, expect, it, vi } from "vitest";
import {
  ConfigurationError,
  loadDatabaseUrl,
} from "./runtime-configuration.js";

function databaseUrl(
  username: string,
  password: string,
  database: string,
  sslmode: string,
): string {
  const url = new URL("postgresql://example.invalid:26257");
  url.username = username;
  url.password = password;
  url.pathname = database;
  url.searchParams.set("sslmode", sslmode);
  return url.toString();
}

const validRuntimeUrl = databaseUrl(
  "scopethread_app",
  "generated-password",
  "defaultdb",
  "verify-full",
);

function readerReturning(value: string | undefined) {
  const send = vi.fn().mockResolvedValue({ Parameter: { Value: value } });
  const destroy = vi.fn();
  return { reader: { send, destroy }, send, destroy };
}

describe("runtime database configuration", () => {
  it("uses a local database URL without calling Parameter Store", async () => {
    const factory = vi.fn();

    await expect(
      loadDatabaseUrl({ DATABASE_URL: " postgresql://local " }, factory),
    ).resolves.toBe("postgresql://local");
    expect(factory).not.toHaveBeenCalled();
  });

  it("requires one configured database source", async () => {
    await expect(loadDatabaseUrl({}, vi.fn())).rejects.toEqual(
      expect.objectContaining({
        name: "ConfigurationError",
        message:
          "DATABASE_URL or DATABASE_URL_PARAMETER_NAME is not configured.",
      }),
    );
  });

  it("decrypts the fixed runtime parameter in the configured region", async () => {
    const { reader, send, destroy } = readerReturning(validRuntimeUrl);
    const factory = vi.fn(() => reader);

    await expect(
      loadDatabaseUrl(
        {
          AWS_REGION: "ap-southeast-1",
          DATABASE_URL_PARAMETER_NAME: "/scopethread/prod/database-url",
        },
        factory,
      ),
    ).resolves.toBe(validRuntimeUrl);
    expect(factory).toHaveBeenCalledWith("ap-southeast-1");
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]?.[0].input).toEqual({
      Name: "/scopethread/prod/database-url",
      WithDecryption: true,
    });
    expect(destroy).toHaveBeenCalledOnce();
  });

  it.each([
    ["missing password", databaseUrl("scopethread_app", "", "defaultdb", "verify-full")],
    ["migration identity", databaseUrl("migration", "secret", "defaultdb", "verify-full")],
    ["wrong database", databaseUrl("scopethread_app", "secret", "other", "verify-full")],
    ["unverified TLS", databaseUrl("scopethread_app", "secret", "defaultdb", "require")],
  ])("rejects an invalid runtime URL: %s", async (_label, value) => {
    const { reader, destroy } = readerReturning(value);

    await expect(
      loadDatabaseUrl(
        { DATABASE_URL_PARAMETER_NAME: "/scopethread/prod/database-url" },
        () => reader,
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "ConfigurationError",
        message: "The database URL parameter is invalid.",
      }),
    );
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("normalizes Parameter Store failures without exposing their details", async () => {
    const secretBearingError = new Error(
      `Access denied while reading ${validRuntimeUrl}`,
    );
    const send = vi.fn().mockRejectedValue(secretBearingError);
    const destroy = vi.fn();

    await expect(
      loadDatabaseUrl(
        { DATABASE_URL_PARAMETER_NAME: "/scopethread/prod/database-url" },
        () => ({ send, destroy }),
      ),
    ).rejects.toEqual(
      new ConfigurationError(
        "The database URL parameter could not be loaded.",
      ),
    );
    expect(destroy).toHaveBeenCalledOnce();
  });
});
