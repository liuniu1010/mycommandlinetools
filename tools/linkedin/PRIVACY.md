# Privacy Policy

Effective date: 10 August 2026

My Command Line Tools is a personal command-line application used by its operator to access approved APIs, including LinkedIn APIs.

## Information Used

When the LinkedIn integration is authorized, the application may receive the authenticated member's identifier, name, profile picture, email address, OAuth access token, granted scopes, and token-expiration information. When the operator chooses to publish content, the application processes the text, link metadata, or image selected by the operator.

## How Information Is Used

The application uses this information only to:

- authenticate the operator with LinkedIn;
- display the authenticated operator's approved profile information;
- publish content that the operator explicitly reviews and confirms; and
- maintain the local command-line integration.

The application does not sell personal information, build advertising profiles, scrape LinkedIn, automate job applications, or access restricted LinkedIn Talent APIs.

## Storage and Sharing

OAuth tokens and available account metadata are stored locally on the operator's device. They are not intentionally transmitted to any third party other than LinkedIn as required to perform an operator-requested API call. Content selected for publication is sent to LinkedIn only after explicit confirmation.

## Retention and Deletion

Local authorization data is retained until the operator deletes `tools/linkedin/.token.json`, revokes the application's access in LinkedIn, or removes the application. Published content is retained by LinkedIn according to the operator's LinkedIn settings and LinkedIn's policies.

## Security

The application restricts its local token file to the operating-system user where supported. No method of storage or transmission is completely secure, and the operator is responsible for protecting the device and developer credentials.

## Changes

This policy may be updated when the application's data practices or supported APIs change. Material changes will be reflected in this document with a revised effective date.

## Contact

Questions about this policy can be submitted through the project's issue tracker at https://github.com/liuniu1010/mycommandlinetools/issues.
