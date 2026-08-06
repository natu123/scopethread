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
  "WebBucket",
  "WebDistribution",
];

for (const resource of requiredResources) {
  if (!template.Resources?.[resource]) {
    throw new Error(`Missing required infrastructure resource: ${resource}`);
  }
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
  "Infrastructure template and scoped Bedrock development policy are valid.",
);
