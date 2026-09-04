# Security policy

## Supported version

Staff Chief is an early MVP. Security fixes are applied only to the latest commit on `main`; no older release line is currently supported.

| Version                | Supported |
| ---------------------- | --------- |
| Latest `main`          | Yes       |
| Older commits or forks | No        |

## Reporting a vulnerability

Do not open a public issue containing exploit details, credentials, note content, database exports, company information, or personal data.

Prefer GitHub's private vulnerability reporting for this repository when it is available. Otherwise, contact the repository owner through the contact method published on the [ohcarioca GitHub profile](https://github.com/ohcarioca) and ask for a private reporting channel before sharing technical details.

Include only sanitized information in the initial contact:

- affected commit or version;
- affected component;
- impact summary;
- minimal reproduction outline without secrets;
- whether the issue requires local access or an AI analysis action.

Allow reasonable time for triage and remediation before public disclosure.

## Security scope

High-priority reports include:

- unintended network exposure beyond localhost;
- bypass of Host or Origin mutation checks;
- AI execution before explicit user confirmation;
- arbitrary command or SQL execution from app input or backup files;
- unauthorized reading of files or Codex credentials;
- source-validation bypass that attributes findings to data outside the snapshot;
- loss or corruption of the local database during normal save, archive, export, or restore flows;
- cross-site scripting or unsafe rendering of note content.

General support requests and non-security defects belong in the issue tracker after all sensitive information is removed.

## Deployment boundary

Staff Chief is designed for one trusted user on a local Windows workstation. It must not be exposed through a public IP, LAN binding, reverse proxy, tunnel, shared-hosting platform, or multi-user service. There is no application authentication or app-level encryption.

For the full threat model and data handling details, read [Security and privacy](docs/SECURITY_AND_PRIVACY.md).
