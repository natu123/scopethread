# AWS Development Runbook

This runbook keeps ScopeThread development off the AWS account root user and avoids long-lived access keys.

## Verified AWS Configuration

- Region: `ap-southeast-1` (Singapore).
- Development IAM user: `scopethread-dev`.
- CLI authentication: browser-based `aws login` with temporary credentials.
- Embedding model: `cohere.embed-multilingual-v3`.
- Chat inference profile: `global.amazon.nova-2-lite-v1:0`.
- Development policy: `infra/iam/scopethread-bedrock-development-policy.json`.

## One-Time Console Setup

The account owner must perform these secret-bearing steps in the AWS console:

1. Enable console access for `scopethread-dev`.
2. Set and change the initial console password without sharing it.
3. Register a passkey or another supported MFA device for `scopethread-dev`.

Do not create an access key.

## Sign In from AWS CLI

```powershell
aws login --profile scopethread-dev
```

When prompted for a region, enter `ap-southeast-1`. Complete the browser flow as the `scopethread-dev` IAM user, not as the root user.

Verify the caller before any model invocation:

```powershell
aws sts get-caller-identity --profile scopethread-dev
```

The returned ARN must end with `:user/scopethread-dev`.

## One-Time Third-Party Model Access

`cohere.embed-multilingual-v3` is a third-party serverless model. The AWS account owner must review its EULA and on-demand pricing, then enable the model once from Amazon Bedrock in Singapore.

Do not grant `aws-marketplace:Subscribe` or `aws-marketplace:Unsubscribe` to `scopethread-dev`. After the account-level model agreement is active, the development user needs only the scoped Bedrock invoke permission already defined in `infra/iam/scopethread-bedrock-development-policy.json`.

Do not create a SageMaker endpoint, Provisioned Throughput, or a dedicated instance. ScopeThread uses Bedrock serverless on-demand inference.

## Run the Live Vector-Memory Gate

Set `AWS_PROFILE=scopethread-dev` in the uncommitted `.env.local` file. Then run:

```powershell
npm run e2e:vector-memory -- --apply
```

This command performs two paid on-demand embedding calls, updates the fictional demo memory with the generated embedding, and verifies CockroachDB vector retrieval. It refuses root or any AWS identity other than `scopethread-dev`.

## Run the Live Agent-Memory Gate

After the vector-memory gate succeeds, review and run:

```powershell
npm run e2e:agent-memory -- --apply
```

This command uses the production analysis workflow. It creates a query embedding, retrieves the seeded booking decision from CockroachDB, asks Amazon Nova to analyze a conflicting request, embeds the extracted memories, and persists the new conversation and conflict link in one transaction. It verifies that the prior decision remains intact. Repeating the command uses the same idempotency key and does not create a duplicate conversation.

The command performs paid on-demand Bedrock calls and refuses root or any AWS identity other than `scopethread-dev`.

## End the Session

```powershell
aws logout --profile scopethread-dev
```

Use the root profile only for account-level administration. End its current cached session after the development profile is verified:

```powershell
aws logout --profile scopethread
```
