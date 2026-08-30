# User Information

Product: Embedthis Appweb
Version: 9.2.0
Release Date: 2026-08-06

This document provides required user information per the EU Cyber Resilience Act (CRA) Annex II. It
accompanies the product and is distributed with every release archive.

## 1. Manufacturer Information

| Field | Value |
|-------|-------|
| Manufacturer | EmbedThis Software |
| Address | PO Box 6, Bentleigh VIC 3204, Australia (ABN 18700298317) |
| Contact | dev@embedthis.com (general) |
| Website | https://www.embedthis.com |
| Vulnerability reporting | security@embedthis.com |

## 2. Product Identification

| Field | Value |
|-------|-------|
| Product name | Embedthis Appweb |
| Version | 9.2.0 |
| Product type | Software library (embeddable, multi-threaded HTTP/1 and HTTP/2 web server library `libappweb`) plus the `appweb` reference executable and the `watchdog`, `authpass` and `makerom` utilities |
| Release date | 2026-08-06 |
| Lifecycle phase | Maintenance mode — security updates and critical bug fixes only; no new features. Successor product line: Ioto Device Agent (https://www.embedthis.com/ioto/). |
| License | Distributed under three licenses — GPL-2.0, the Embedthis Commercial License, and the Embedthis Evaluation License. See `LICENSE.md` in the distribution, `EVAL.md` for the evaluation terms, and https://www.embedthis.com/licensing/. The GPL does not generally permit incorporating the software into non-open-source products; embedding in a proprietary product requires a commercial license. |
| Source repository | https://github.com/embedthis/appweb-core |

### 2.1 Conformity and Component Inventory

| Document | Where it is |
|----------|-------------|
| EU Declaration of Conformity | Accompanies this product: `doc/declaration-of-conformity.md` in the release archive. The signed original is held on file by the manufacturer and is available on request from dev@embedthis.com. The full declaration accompanies the product, so no separate internet address is published for it. |
| Software Bill of Materials | Accompanies this product: `doc/sbom.json` in the release archive, in CycloneDX 1.5 format. It is supplied for integrators assembling their own SBOM, and is produced to market surveillance authorities on reasoned request. |
| Release notes | `doc/release-notes.md` in the release archive |
| Integrity checksums | `SHA256SUMS`, published beside the release archive on the download channel (see §7.1) |

The remaining technical documentation — conformity dossier, risk assessment, Annex I matrix,
vulnerability disposition and test report — is retained by the manufacturer under CRA Annex VII and
produced to market surveillance authorities on reasoned request. It is not distributed with the
product.

## 3. Intended Purpose

Appweb is a compact embedded web server written in C, designed to be linked into device firmware or
run as a standalone server on resource-constrained hardware. It provides HTTP/1.0, HTTP/1.1 and
HTTP/2 service with keep-alive, chunked transfer encoding and WebSockets; optional TLS; and optional
handler components (CGI, FastCGI, reverse proxy, file upload, directory listing), with role-based
access control and route-level ability checks.

The product is intended for **embedded-systems and device developers (integrators)** who build it
into a larger firmware image or deploy it as a device-local server, and who are responsible for
configuring its routes, authentication, TLS stack, and deployment environment. It is designed for
constrained, often headless, device environments rather than as a general-purpose internet-facing
web server. It is multi-threaded and event-driven, using a worker-thread pool over non-blocking I/O,
with a garbage-collected runtime (MPR).

Appweb is in maintenance mode. New device projects should evaluate the Ioto Device Agent, the active
successor product line for embedded device connectivity.

### 3.1 What Is Not In This Product

- **ESP (Embedded Server Pages) and SQLite** are a separate add-on from 9.2.0 and are not in this
  archive. The conditional hooks that bind ESP back in as a plugin remain, disabled by default.
- **No regular-expression engine ships.** Route patterns, `Alias` prefixes, `{token}` segments and
  literal alternations are matched natively. Configurations that need true regular expressions must
  supply and patch their own PCRE2 library. See §7.3.

## 4. Security Properties

### 4.1 Data Protection

- **Confidentiality / integrity in transit**: provided by optional TLS (see 4.3). When TLS is
  enabled, request and response data are protected against eavesdropping and tampering on the
  network path.
- **Credential storage**: user credentials are stored as password hashes in the configured
  authentication file, not as plaintext. Blowfish/bcrypt is supported and is the recommended cipher
  for stored passwords; MD5 is retained only for legacy Digest interoperability.
- **Availability**: the worker-pool architecture is bounded by configurable resource limits —
  connection and request counts, request and response body sizes, header sizes, timeouts, and
  process counts for CGI. A monitoring and defensive-countermeasure facility (`Monitor` and `Defense`
  directives) can ban or delay clients that exceed configured thresholds.

### 4.2 Authentication and Access Control

- **Supported mechanisms**: Basic, Digest, Form-based login, and application-defined authentication.
- **Legacy caveat**: Basic and Digest authentication are legacy mechanisms and are **strongly
  discouraged for new deployments**. Basic transmits the password on every request, recoverable by
  anyone who can observe the connection unless TLS is in use. Digest depends on MD5. As of this
  release a Digest credential is bound to one resource and accepted once — the nonce expires, the
  `uri` is checked and the nonce count is tracked — but the mechanism remains legacy. Prefer
  Form-based authentication over TLS, or an integrator-supplied mechanism.
- **Authorization**: role- and ability-based checks are attached to routes. A route's authentication
  requirement is inherited by the paths it claims. Route selection folds case consistently with the
  file system, so a protective route cannot be evaded by changing the case of a URI on a
  case-insensitive volume.
- **Session identifiers** are drawn from the platform cryptographic random source. If that source is
  unavailable the request fails rather than issuing a guessable identifier.

### 4.3 Cryptography and TLS

- **TLS backends**: OpenSSL 1.1.1+ and OpenSSL 3.x (default and preferred), and MbedTLS 2.x/3.x.
  LibreSSL is API-compatible via the OpenSSL backend.
- **The TLS library is not bundled.** The integrator supplies it, chooses its version, and is
  responsible for patching it on their own schedule. This is deliberate: a device's TLS stack must
  track its own vendor's advisories, not Appweb's release cadence.
- **Certificates**: the `certs/` directory contains **self-signed development material only**. It
  exists so the test suite and samples run out of the box. It must never be deployed. Production
  deployments must supply their own certificates and private keys.
- **MD5** is used only where the Digest authentication standard requires it, and for the Digest
  nonce construction. It is not used to protect stored passwords in any recommended configuration.

### 4.4 Secure Defaults

- The `src/server/appweb.conf` shipped as the production starting point serves from a document root
  with no authenticated routes and no handlers beyond static file serving enabled by default.
- `test/appweb.conf` is a **development and test configuration**. It enables CGI, FastCGI, proxy,
  directory listing, upload and WebSocket routes and binds many ports. It is not a deployment
  template and must not be used as one.
- CGI and FastCGI routes should set `EnvPrefix` so that client-supplied form and query variables are
  namespaced away from variables an interpreter or loader consults. Request headers are additionally
  filtered: the proxy-selection variables of the httpoxy family and the caller's `Authorization`
  header are never passed to a CGI, FastCGI or proxied child process.

## 5. Reasonably Foreseeable Misuse

- **Deploying the test configuration.** `test/appweb.conf` is not hardened and is not a template.
- **Deploying the shipped certificates.** The `certs/` key material is public — it is in the source
  archive and the git repository. Any deployment using it has no transport security at all.
- **Exposing the server directly to the internet.** Appweb is designed for device-local and
  device-network service. Internet-facing deployment requires a hardened configuration, TLS, an
  authenticated route set, and connection rate limiting in front of it.
- **Removing or misconfiguring `UserAccount`/`GroupAccount`.** Appweb *does* drop privileges when
  these are configured, and they are active in the shipped `appweb.conf` (see §10.2). Deleting them,
  or pointing them at an account that turns out to be privileged, leaves the server running as
  whatever started it — and there is then no mechanism to catch it. Running privileged makes any
  memory-safety defect a full compromise.
- **Serving attacker-writable content directories**, or allowing uploads into a directory that is
  also served, which turns an upload into code execution when a handler is mapped there.
- **Relying on Basic or Digest without TLS.**
- **Assuming ESP is present.** From 9.2.0 it is a separate add-on; a configuration referencing ESP
  fails at parse unless the add-on is installed.

## 6. Vulnerability Reporting and Handling

| Field | Value |
|-------|-------|
| Reporting address | security@embedthis.com |
| Policy | https://www.embedthis.com/security |
| Advisories | https://github.com/embedthis/appweb-core/security/advisories |
| Acknowledgement | The manufacturer acknowledges receipt and provides an initial assessment; coordinated disclosure is the default |

Please report suspected vulnerabilities privately to the address above rather than in a public issue.

## 7. Secure Installation, Configuration and Update

### 7.1 Verifying the Distribution

The source archive is published with a SHA-256 checksum in `SHA256SUMS` on the download channel.
Verify before building:

```bash
shasum -a 256 -c SHA256SUMS
```

The checksum identifies the exact archive the Declaration of Conformity refers to.

### 7.2 Building

```bash
tar xzf appweb-9.2.0-src.tgz
cd appweb-9.2.0
make
make test
```

The recommended hardened build adds, via the integrator's toolchain: `-fstack-protector-strong`,
`-D_FORTIFY_SOURCE=2` (with `-O2` or higher), `-fPIE -pie`, `-Wl,-z,relro,-z,now` and
`-Wl,-z,noexecstack`. Appweb's own project files do not set these; the integrator's build governs.

### 7.3 Regular Expressions

If a configuration uses a pattern that requires a regular-expression engine — alternation inside a
route pattern, character classes, `{m,n}` repeats, lookahead, `{token=regexp}` fields, or a
`ServerName` written as `/regexp/` — build with PCRE2, which the integrator supplies:

```bash
cd projects && premake5 --pcre2 gmake
```

A pattern needing an engine in a build without one fails at **configuration parse**, naming the
pattern. It never fails silently at request time. Guard such configuration with `<if PCRE2>`.

### 7.4 Deployment Checklist

1. Start from `src/server/appweb.conf`, not `test/appweb.conf`.
2. Replace all `certs/` material with your own certificates and private keys.
3. Keep `UserAccount` and `GroupAccount` set to an unprivileged account. They are active in the
   shipped `appweb.conf`, and the server drops to them after binding privileged ports. If you remove
   them, start the server unprivileged instead — nothing else will do it for you.
4. Define an authenticated route set; verify that every route intended to be protected inherits an
   `AuthType` and the abilities you expect.
5. Set `EnvPrefix` on every CGI and FastCGI route.
6. Set explicit `Limit*` directives for request and body sizes, and configure `Monitor`/`Defense`
   for the traffic profile you expect.
7. Place connection rate limiting in front of the server if it is reachable from an untrusted
   network.
8. Restrict filesystem permissions on the authentication file, the TLS private key and the log
   directory.

### 7.5 Updates

Appweb is delivered as source and is compiled into the integrator's firmware or application. **The
manufacturer cannot deliver an update to an end device.** The integrator is responsible for:

- monitoring the advisory channel in §6,
- rebuilding their firmware against the updated Appweb source,
- and providing the device update and rollback mechanism to their own users.

Security updates are published to the channels in §6 for the support period in §9.

## 8. Data Handling

| Field | Value |
|-------|-------|
| Data persisted | The configured authentication file (usernames, realm, password hashes); the `appweb.conf` route and authorization configuration; the TLS private key and certificate; upload temporary files under the configured upload directory; access, error and trace logs at the configured paths. Session state and the response cache are held in memory only and do not survive a restart |
| Data location | Set entirely by the integrator's configuration; Appweb imposes no fixed location |
| Telemetry | None. Appweb initiates no unsolicited network traffic. Outbound connections are made only where the configuration directs them — to a FastCGI or proxy backend |
| Secure erase | On decommissioning, erase the authentication file, the TLS private key, residual upload temporary files, and the logs. Device-specific secure-erase steps depend on the storage medium and are the integrator's responsibility |

## 9. Support Period

| Field | Value |
|-------|-------|
| Support period | 5 years from the release date |
| Support start | 2026-08-06 |
| Support end | 2031-08-06 |
| Scope | Security updates and critical bug fixes. Appweb is in maintenance mode; no new features |
| Download availability | Published updates remain downloadable for at least 10 years |

## 10. Known Limitations

### 10.1 Architectural

- Appweb is a **component**, not a finished product. The security of the device it is built into
  depends on the integrator's configuration, the TLS library they supply, the privileges they run it
  with, and the update mechanism they provide.
- The TLS library, and PCRE2 where used, are integrator-supplied and integrator-patched.

### 10.2 Product Limitations in This Release

These are known and open at 9.2.0. They are stated here rather than left for a customer to discover.
Limitations that earlier releases carried and 9.2.0 fixed — Digest replay, session authentication
crossing protocols, the response cache ignoring who a response was for, symbolic links escaping the
document root, lenient request framing, and certificate revocation not being enforced — are described
in the release notes and are **not** repeated here.

**Deployment and privileges**

- **Privilege drop is available, active by default, and fail-closed — not a limitation, but you need
  to know how it behaves.** The `UserAccount` and `GroupAccount` directives ship active in
  `appweb.conf`. After privileged ports are bound, Appweb drops both user and group together, then
  verifies the drop: if the resulting uid or gid is not the one requested, or if the dropped
  privileges turn out to be recoverable, **startup aborts** rather than continuing in a degraded
  state. A server that refuses to start with `Privilege drop incomplete` or `Privileges are
  recoverable after drop` in the log is reporting exactly that, and the cause is normally the
  configured account rather than the server. If you remove both directives, no privilege drop occurs
  — run the server unprivileged, or drop privileges in the supervising process.
- **No deny-by-default for sensitive filenames.** A `.git/` directory, editor backup files or `*.bak`
  files under the document root are served. Do not deploy a document root containing them.

**TLS**

- **The OpenSSL backend loads only the first certificate from a chain file.** Intermediates in the
  same file are ignored, so a client that does not already hold the intermediate cannot build a path.
  Supply the intermediate through the CA file, or expect handshake failures with a chained
  certificate.
- **The OpenSSL backend loads RSA private keys only.** An EC/ECDSA key fails silently. Use an RSA key
  with this backend, or the MbedTLS backend.

**File and log permissions**

- **Upload temporary files are predictable and are created mode 0664**, by default under a
  world-writable temporary directory. Set the upload directory to a private location on a
  multi-user host.
- **Log and trace files are created mode 0664** and may contain session cookies and credentials at
  higher trace levels. Restrict the log directory.

**Protocol and interoperability**

- **The session cookie carries an explicit `domain=` derived from the Host header**, which is broader
  than the default host-only scope. Consider this when several hosts share a parent domain.
- **CGI and FastCGI children inherit the server's entire environment.** Variables present in the
  server's environment are visible to the child. Start the server with a minimal environment where
  the CGI programs are not fully trusted.
- **Directory listing writes on-disk filenames into HTML without full escaping.** Do not enable it on
  a directory whose filenames are attacker-influenced.
- **Responses of 2 GiB or larger** are not supported on all paths.

Each of these is tracked, and the manufacturer's disposition of every one is recorded in the
vulnerability disposition retained under Annex VII (§2.1). Fixes are published to the channels in §6
within the support period.

---

*This document is provided in accordance with Annex II of Regulation (EU) 2024/2847. It accompanies
every release archive as `doc/user-information.md`.*
