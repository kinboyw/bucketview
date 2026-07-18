# Security Policy

## Reporting a vulnerability

Please do not disclose security vulnerabilities in a public issue.

Use GitHub's private vulnerability reporting feature for this repository. Include a clear description, reproduction steps, affected versions, and the expected security impact.

## Credential safety

BucketView connects to S3-compatible services with user-provided credentials. When sharing logs, screenshots, configuration exports, or reproduction projects, remove:

- Access key IDs and secret access keys
- Session tokens
- Signed URLs and authorization headers
- Private endpoints and bucket names when sensitive
- Local application databases and mount configuration files
