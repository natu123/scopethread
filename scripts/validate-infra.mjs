import { readFile } from "node:fs/promises";
import { parseDocument } from "yaml";

const templatePath = new URL("../infra/template.yaml", import.meta.url);
const developmentPolicyPath = new URL(
  "../infra/iam/scopethread-bedrock-development-policy.json",
  import.meta.url,
);
const source = await readFile(templatePath, "utf8");
const document = parseDocument(source);

if (document.errors.length > 0) {
  throw new Error(
    `Invalid infrastructure YAML:\n${document.errors.map((error) => error.message).join("\n")}`,
  );
}

const template = document.toJS();
const requiredResources = [
  "HttpApi",
  "ApiFunction",
  "ApiFunctionLogGroup",
  "WebBucket",
  "WebSecurityHeadersPolicy",
  "WebDistribution",
];

for (const resource of requiredResources) {
  if (!template.Resources?.[resource]) {
    throw new Error(`Missing required infrastructure resource: ${resource}`);
  }
}

const apiFunction = template.Resources.ApiFunction;
const buildProperties = apiFunction.Metadata?.BuildProperties;

if (apiFunction.Properties?.CodeUri !== "..") {
  throw new Error("The Lambda build context must include the monorepo root.");
}

if (apiFunction.Properties?.Handler !== "apps/api/src/handler.handler") {
  throw new Error("The Lambda handler must resolve from the monorepo root.");
}

if (
  apiFunction.Metadata?.BuildMethod !== "esbuild" ||
  !buildProperties?.EntryPoints?.includes("apps/api/src/handler.ts")
) {
  throw new Error("The Lambda must bundle the TypeScript handler with esbuild.");
}

if (
  buildProperties.Format !== "cjs" ||
  !buildProperties.OutExtension?.includes(".js=.cjs")
) {
  throw new Error(
    "The Lambda artifact must use an explicit CommonJS file extension.",
  );
}

const apiFunctionLogGroup = template.Resources.ApiFunctionLogGroup;
if (
  apiFunctionLogGroup.Type !== "AWS::Logs::LogGroup" ||
  apiFunctionLogGroup.Properties?.RetentionInDays !== 14
) {
  throw new Error("The Lambda log group must retain logs for exactly 14 days.");
}
if (
  apiFunctionLogGroup.DeletionPolicy !== "Delete" ||
  apiFunctionLogGroup.UpdateReplacePolicy !== "Delete"
) {
  throw new Error("The Lambda log group must be removed with the demo stack.");
}

const webSecurityHeadersPolicy = template.Resources.WebSecurityHeadersPolicy;
const securityHeaders =
  webSecurityHeadersPolicy.Properties?.ResponseHeadersPolicyConfig
    ?.SecurityHeadersConfig;
const contentSecurityPolicy =
  securityHeaders?.ContentSecurityPolicy?.ContentSecurityPolicy;
if (
  webSecurityHeadersPolicy.Type !==
    "AWS::CloudFront::ResponseHeadersPolicy" ||
  !contentSecurityPolicy?.includes("default-src 'self'") ||
  !contentSecurityPolicy.includes("frame-ancestors 'none'") ||
  securityHeaders?.FrameOptions?.FrameOption !== "DENY" ||
  securityHeaders?.ContentTypeOptions?.Override !== true ||
  securityHeaders?.StrictTransportSecurity?.AccessControlMaxAgeSec !== 31536000
) {
  throw new Error("The CloudFront web security headers are incomplete.");
}

const defaultCacheBehavior =
  template.Resources.WebDistribution.Properties?.DistributionConfig
    ?.DefaultCacheBehavior;
if (!defaultCacheBehavior?.ResponseHeadersPolicyId) {
  throw new Error(
    "The CloudFront default behavior must attach the web security headers policy.",
  );
}

const revisionEvent = apiFunction.Properties?.Events?.ConfirmRevision;
const sessionEvent = apiFunction.Properties?.Events?.CreateSession;
const memoryEvent = apiFunction.Properties?.Events?.InspectMemory;
const dismissalEvent = apiFunction.Properties?.Events?.DismissConflict;
if (
  sessionEvent?.Type !== "HttpApi" ||
  sessionEvent.Properties?.Method !== "POST" ||
  sessionEvent.Properties?.Path !== "/sessions"
) {
  throw new Error("The Lambda must expose POST /sessions through HTTP API.");
}
if (
  memoryEvent?.Type !== "HttpApi" ||
  memoryEvent.Properties?.Method !== "GET" ||
  memoryEvent.Properties?.Path !== "/memory"
) {
  throw new Error("The Lambda must expose GET /memory through HTTP API.");
}
if (
  revisionEvent?.Type !== "HttpApi" ||
  revisionEvent.Properties?.Method !== "POST" ||
  revisionEvent.Properties?.Path !== "/revisions"
) {
  throw new Error("The Lambda must expose POST /revisions through HTTP API.");
}
if (
  dismissalEvent?.Type !== "HttpApi" ||
  dismissalEvent.Properties?.Method !== "POST" ||
  dismissalEvent.Properties?.Path !== "/conflicts/dismiss"
) {
  throw new Error(
    "The Lambda must expose POST /conflicts/dismiss through HTTP API.",
  );
}

const httpApi = template.Resources.HttpApi;
if (!httpApi.Properties?.CorsConfiguration?.AllowHeaders?.includes("authorization")) {
  throw new Error("The HTTP API CORS policy must allow the session token header.");
}
if (
  !httpApi.Properties?.DefaultRouteSettings?.ThrottlingBurstLimit ||
  !httpApi.Properties?.DefaultRouteSettings?.ThrottlingRateLimit
) {
  throw new Error("The public HTTP API must define default throttling.");
}
if (!httpApi.Properties?.RouteSettings?.["POST /sessions"]?.ThrottlingRateLimit) {
  throw new Error("Demo session creation must have route-specific throttling.");
}

const developmentPolicy = JSON.parse(
  await readFile(developmentPolicyPath, "utf8"),
);
const statements = developmentPolicy.Statement ?? [];
const developmentActions = statements.flatMap((statement) =>
  Array.isArray(statement.Action) ? statement.Action : [statement.Action],
);
const invokeResources = statements
  .filter((statement) => {
    const actions = Array.isArray(statement.Action)
      ? statement.Action
      : [statement.Action];
    return actions.includes("bedrock:InvokeModel");
  })
  .flatMap((statement) =>
    Array.isArray(statement.Resource)
      ? statement.Resource
      : [statement.Resource],
  );

const requiredModelResources = [
  "cohere.embed-multilingual-v3",
  "global.amazon.nova-2-lite-v1:0",
  "amazon.nova-2-lite-v1:0",
];

for (const modelId of requiredModelResources) {
  if (!invokeResources.some((resource) => resource?.endsWith(modelId))) {
    throw new Error(
      `Missing Bedrock invoke permission for required model: ${modelId}`,
    );
  }
}

if (invokeResources.includes("*")) {
  throw new Error("Bedrock invoke permissions must not use a wildcard resource.");
}

const forbiddenDevelopmentActions = [
  "aws-marketplace:Subscribe",
  "aws-marketplace:Unsubscribe",
];

for (const action of forbiddenDevelopmentActions) {
  if (developmentActions.includes(action)) {
    throw new Error(
      `Development policy must not retain account-level Marketplace permission: ${action}`,
    );
  }
}

console.log(
  "Infrastructure template, log retention, web security headers, and scoped Bedrock development policy are valid.",
);
