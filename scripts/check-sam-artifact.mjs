import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const artifactPath = "../.aws-sam/build/ApiFunction/handler.cjs";
const { handler } = require(artifactPath);

if (typeof handler !== "function") {
  throw new Error("The built Lambda artifact does not export handler.");
}

const response = await handler({
  rawPath: "/health",
  requestContext: {
    requestId: "sam-artifact-smoke-test",
    http: { method: "GET" },
  },
});
const body = JSON.parse(response.body ?? "{}");

if (response.statusCode !== 200 || body.service !== "scopethread-api") {
  throw new Error(
    `The built Lambda artifact returned an unexpected response: ${JSON.stringify(response)}`,
  );
}

console.log("Built Lambda artifact health check succeeded.");
