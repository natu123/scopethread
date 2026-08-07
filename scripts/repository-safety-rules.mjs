import { basename } from "node:path";

export const forbiddenSecretBasenames = new Set([
  ".env",
  ".env.local",
  ".env.runtime.local",
]);

export const forbiddenContentRules = [
  {
    name: "AWS access key",
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  },
  {
    name: "private key",
    pattern: /-----BEGIN (?:EC |OPENSSH |RSA )?PRIVATE KEY-----/,
  },
  {
    name: "credential-bearing PostgreSQL URL",
    pattern: /postgres(?:ql)?:\/\/[^:\s/@]+:[^@\s/]+@/i,
  },
  {
    name: "AWS account ID in an ARN",
    pattern: /\barn:aws[a-z-]*:[^:\s]*:[^:\s]*:\d{12}:/,
  },
  {
    name: "labeled AWS account ID",
    pattern: /\bAWS\s+account\s+ID\D{0,20}\d{12}\b/i,
  },
];

export function isForbiddenSecretPath(path) {
  return forbiddenSecretBasenames.has(basename(path.replaceAll("\\", "/")));
}

export function findForbiddenContent(content) {
  return forbiddenContentRules
    .filter(({ pattern }) => pattern.test(content))
    .map(({ name }) => name);
}
