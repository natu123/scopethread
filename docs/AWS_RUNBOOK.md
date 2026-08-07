# AWS Development Runbook

This runbook keeps ScopeThread development off the AWS account root user and avoids long-lived access keys.

## Verified AWS Configuration

- Region: `ap-southeast-1` (Singapore).
- Development IAM user: `scopethread-dev`.
- CLI authentication: browser-based `aws login` with temporary credentials.
- Embedding model: `cohere.embed-multilingual-v3`.
- Chat inference profile: `global.amazon.nova-2-lite-v1:0`.
- Development policy: `infra/iam/scopethread-bedrock-development-policy.json`.
- Applied inline policy: `ScopeThreadBedrockDevelopment`, structurally matched and IAM-simulated on 2026-08-06.
- Deployment bootstrap: `scopethread-bootstrap` reached `CREATE_COMPLETE` on 2026-08-06.
- Nova quota: AWS Support approved and activated `global.amazon.nova-2-lite-v1:0` on 2026-08-07. Tokens per day scales automatically with Tokens per minute and requires no separate request.

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

Live status: this gate succeeded on 2026-08-07 with one retrieved evidence record, one grounded conflict, and two transactionally persisted embedded memories.

## End the Session

```powershell
aws logout --profile scopethread-dev
```

Use the root profile only for account-level administration. End its current cached session after the development profile is verified:

```powershell
aws logout --profile scopethread
```

## Bootstrap the Deployment Roles

Live status: the fixed bootstrap stack and all four resources are `CREATE_COMPLETE`. Re-running the apply command is still an explicit mutation gate and should be used only for reviewed template updates.

Run this one-time local gate before the first AWS deployment:

```powershell
npm run aws:bootstrap-deployment
```

It makes no AWS call. After explicit approval, authenticate the `scopethread` root profile and run:

```powershell
npm run aws:bootstrap-deployment -- --apply
```

The fixed `scopethread-bootstrap` stack creates a retained private and versioned artifact bucket, a CloudFormation-only service role, a Lambda-only execution role, and the customer-managed `ScopeThreadDeployment` policy for `scopethread-dev`. The script verifies the fixed outputs and logs out the root profile. Do not use root for the application deployment.

## Deploy the SAM Application

Live status: the fixed `scopethread` stack and all 15 resources reached `CREATE_COMPLETE` on 2026-08-06. API health and the no-Bedrock session-memory smoke path are verified. Re-running apply is an explicit stack-update gate.

Authenticate as `scopethread-dev`, then run the local gate:

```powershell
npm run aws:deploy
```

After explicit approval, deploy with:

```powershell
npm run aws:deploy -- --apply
```

The guarded deployer reads only the fixed bootstrap stack outputs, runs SAM lint and build checks, uploads artifacts to the bootstrap bucket, and deploys only the fixed `scopethread` stack through the dedicated CloudFormation role. It refuses root and does not accept free-form role, bucket, region, profile, or stack targets.

## Publish the Static Web Application

Deploying the SAM stack and publishing the browser build are separate external changes. The SAM stack must exist successfully before this step.

Live status: the static web application was published and verified at `https://d2kn7tl59k7usc.cloudfront.net/` on 2026-08-06. Re-publishing changes the retained web bucket and creates a new CloudFront invalidation, so treat every later run as a separate explicit gate.

First, verify the local safety gate. This does not call AWS:

```powershell
npm run web:publish -- --stack-name scopethread
```

After reviewing the exact stack name and receiving explicit approval, publish with:

```powershell
npm run web:publish -- --stack-name scopethread --apply
```

The guarded publisher performs these operations in order:

1. Refuses root and requires the `scopethread-dev` IAM user.
2. Reads the deployed stack outputs from CloudFormation.
3. Builds the web application with the deployed `ApiUrl` as `VITE_API_BASE_URL`.
4. Synchronizes only `apps/web/dist` to the stack's retained S3 web bucket.
5. Deletes stale objects only inside that target bucket.
6. Creates a CloudFront invalidation for the published files.

The script never accepts a bucket name or distribution ID from free-form command input. Both targets must come from the named CloudFormation stack.

## Provision the Runtime Database Identity

Live status: `scopethread_app` was provisioned and verified on 2026-08-06. Re-running the apply command rotates its password, so treat every later run as a separate explicit gate.

Keep `.env.local` for migration and maintenance only. After migration `0003_runtime_role.sql` is applied, verify the local gate:

```powershell
npm run db:provision-runtime
```

This command does not connect to CockroachDB or write a file without `--apply`. After explicit approval, create or rotate the Lambda SQL user with:

```powershell
npm run db:provision-runtime -- --apply
```

The guarded provisioner:

1. Requires the non-login `scopethread_runtime` role from migration `0003`.
2. Generates a cryptographically random password without printing it.
3. Creates or rotates the fixed `scopethread_app` login and grants the runtime role.
4. Connects as `scopethread_app` and verifies the exact table privileges and absence of public-schema `CREATE`.
5. Writes the runtime connection string only to ignored `.env.runtime.local` as `RUNTIME_DATABASE_URL`.

Do not copy that value into a command, commit, issue, screenshot, or chat. A later deployment step must transfer it directly to the Parameter Store `SecureString` without displaying it.

## Store the Runtime Connection in Parameter Store

Live status: `/scopethread/prod/database-url` was stored as a Standard `SecureString` at version 1 and verified without decryption on 2026-08-06. Re-running the apply command creates a new parameter version, so treat every later run as a separate explicit gate.

After `.env.runtime.local` has been generated, verify the local gate:

```powershell
npm run aws:store-runtime-secret
```

After explicit approval, store it with:

```powershell
npm run aws:store-runtime-secret -- --apply
```

The script uses the AWS SDK rather than placing the connection string in command-line arguments. It refuses root, requires `scopethread-dev` in Singapore, writes only the fixed `/scopethread/prod/database-url` parameter as a Standard `SecureString`, and verifies only non-secret metadata. The value is never printed.

## Run the Public Demo E2E

After the SAM stack and static web application are deployed, verify the dry gate:

```powershell
npm run e2e:public-demo -- --stack-name scopethread
```

After explicit approval, run the paid live scenario:

```powershell
npm run e2e:public-demo -- --stack-name scopethread --apply
```

The script obtains the API and CloudFront targets only from the named CloudFormation stack. It verifies the CloudFront security headers, API readiness, a short-lived demo session, initial memory restoration, Nova conflict detection grounded in the seeded CockroachDB decision, revision confirmation, and the persisted `supersedes` chain after reloading memory. It never prints the session token.
