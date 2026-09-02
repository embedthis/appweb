# Security Policy

## Reporting a Vulnerability

Report suspected vulnerabilities **privately** to **security@embedthis.com**. Please do not open a
public issue, and please do not disclose the finding publicly before coordinating with us.

Include as much of the following as you can:

- The affected version, and the platform and TLS backend you built against.
- A description of the vulnerability and its impact.
- Steps to reproduce, ideally an isolated test case or a request capture rather than an application.
- Any proof-of-concept code or configuration needed to trigger it.
- Whether you intend to publish, and your preferred disclosure timeline.

## What to Expect

- **Acknowledgement** of your report, with an initial assessment.
- **Coordinated disclosure is the default.** The default coordination window is **90 days** from
  acknowledgement, by which point we intend to have published a fix and the advisory.
- **Fix first, advisory second.** The advisory is published once a fix or an effective documented
  mitigation is available, and once customers have had reasonable time to apply it.
- **Credit.** Advisories credit the reporter unless you ask us not to.

Appweb is embedded software. Device builders must take a fix, rebuild, re-qualify and ship an
update before operators can install it, so we defer broad public disclosure longer than a typical
enterprise-software policy would. Please plan for that. If a vulnerability is being exploited in the
wild, or is independently disclosed by a third party, we abandon the embargo and publish what
customers need to defend themselves.

If you intend to publish at a fixed deadline, say so in your first email. We will work to it and
tell you plainly if we cannot meet it.

## Supported Versions

Appweb is in **maintenance mode**: it receives security updates and critical bug fixes, but no new
features. Security fixes are made against the current release. Older releases are not patched
individually; upgrade to the current release to receive a fix.

## Published Advisories

Advisories are published at
https://github.com/embedthis/appweb/security/advisories, and licensed customers are notified
through Builder security alert subscriptions before an advisory is made public.

Every advisory identifies the affected version range, the impact with a CVSS v3.1 base score and
vector, the fixed version, available mitigations, the CWE classification, and the CVE identifier
where one has been assigned. Embedthis is not a CVE Numbering Authority; identifiers are requested
from MITRE or the appropriate CNA, and an advisory is never held back merely because a CVE has not
yet been issued.

## Security Policy

The full vulnerability disclosure policy is published at https://www.embedthis.com/security.
