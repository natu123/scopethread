import { describe, expect, it } from "vitest";

import {
  findForbiddenContent,
  isForbiddenSecretPath,
} from "./repository-safety-rules.mjs";

describe("repository safety rules", () => {
  it.each([
    ".env",
    ".env.local",
    "nested/.env.runtime.local",
    "nested\\.env.local",
  ])("rejects secret path %s", (path) => {
    expect(isForbiddenSecretPath(path)).toBe(true);
  });

  it.each([
    ".env.example",
    "docs/environment.md",
    "nested/.env.local.example",
  ])("allows non-secret path %s", (path) => {
    expect(isForbiddenSecretPath(path)).toBe(false);
  });

  it.each([
    ["AWS access key", ["AKIA", "ABCDEFGHIJKLMNOP"].join("")],
    ["AWS access key", ["ASIA", "ABCDEFGHIJKLMNOP"].join("")],
    ["private key", ["-----BEGIN ", "PRIVATE KEY-----"].join("")],
    ["private key", ["-----BEGIN OPENSSH ", "PRIVATE KEY-----"].join("")],
    [
      "credential-bearing PostgreSQL URL",
      ["postgresql://user", ":password@example.invalid/app"].join(""),
    ],
    [
      "AWS account ID in an ARN",
      ["arn:aws:iam::123456", "789012:role/example"].join(""),
    ],
    [
      "labeled AWS account ID",
      ["AWS account ID: 123456", "789012"].join(""),
    ],
  ])("detects %s without returning the matched value", (rule, content) => {
    expect(findForbiddenContent(content)).toContain(rule);
    expect(findForbiddenContent(content)).not.toContain(content);
  });

  it("allows placeholders without credential values", () => {
    expect(
      findForbiddenContent(
        "DATABASE_URL=\nAWS_ACCOUNT_ID=\narn:aws:iam::${AWS_ACCOUNT_ID}:role/example",
      ),
    ).toEqual([]);
  });
});
