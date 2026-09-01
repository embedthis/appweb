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
  file system for literal, prefix, token and alternation patterns — but **not for patterns matched by
  a regular-expression engine**, which are compared case-sensitively even on a case-insensitive
  volume. On such a volume a protective route written as a regular expression can be evaded by
  changing the case of a URI. Write protective routes as literal or prefix patterns, or confirm the
  volume is case-sensitive. See §10.2.
- **Session identifiers** are drawn from the platform cryptographic random source. If that source is
  unavailable the request fails rather than issuing a guessable identifier.

### 4.3 Cryptography and TLS

- **TLS backends**: OpenSSL 1.1.1+ and OpenSSL 3.x (default and preferred), and MbedTLS 2.x/3.x.
  LibreSSL is API-compatible via the OpenSSL backend. **The two backends are not equivalent**: several
  TLS directives are enforced on OpenSSL and are inert or partial on MbedTLS. If your deployment
  depends on a protocol floor, a cipher policy, a verification depth or revocation checking, read
  §10.2 before choosing MbedTLS.
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
  with no authenticated routes and no handler beyond static file serving. It is a starting point
  rather than a hardened configuration: where the upload filter is built in, it also defines an
  **unauthenticated** `/upload/` route accepting up to 1 GB per request, and it sets `LimitFiles 0`.
  Read §10.2 before deploying it as it stands.
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
- **Two trust assumptions bound the product, and both are the integrator's to satisfy.** Appweb
  **trusts the name resolver**: name-resolution spoofing is out of the product boundary and is the
  platform or network operator's responsibility. Appweb also **trusts the file system it serves
  from**: tampering with the document root, the configuration file or on-disk key material is outside
  the product boundary. A threat model that includes either must place the control elsewhere — a
  verified or read-only filesystem, a resolver the device authenticates, or both.

### 10.2 Product Limitations in This Release

These are known and open at 9.2.0. They are stated here rather than left for a customer to discover.

**How to read this list.** It is the set of open limitations that should change how you configure,
build or deploy the product — not the whole of the manufacturer's open finding record, which is
larger and is retained under Annex VII (§2.1). Everything here is assessed by the manufacturer as
below the severity that would block a release, and each is scheduled against the support commitment
in §9. Limitations that earlier releases carried and 9.2.0 fixed — Digest replay, session
authentication crossing protocols, the response cache ignoring who a response was for, symbolic links
escaping the document root, lenient request framing, and certificate revocation not being enforced —
are described in the release notes and are **not** repeated here.

**Change these before you deploy the shipped configuration**

- **The shipped default configuration defines an unauthenticated file-upload route** — `/upload/`,
  present whenever the upload filter is built in — accepting up to 1 GB per request into a
  world-writable temporary directory. Remove it, or put it behind an authenticated route, before the
  server faces any network you do not control.
- **Default builds include the test handler.** The test handler and its WebSocket sibling are
  compiled in by default, so a stock binary carries request-handling code intended for the suite.
  Disable both for production firmware.
- **`LimitFiles 0` in the shipped configuration raises the descriptor limit to the kernel maximum**
  while still privileged, and the raised limit survives the privilege drop. Set an explicit value.
- **Configuration lookup searches the current working directory first**, so a configuration file in
  the working directory outranks the installed one. Always start the server with an absolute
  `--config` path.
- **`<if>` is not a security control.** An `<else>` inside a false `<if>` never executes, and an
  unrecognised condition key evaluates false with no diagnostic — or true when negated. The guards in
  the shipped sample configuration that were meant to prevent serving handler source are inert for
  this reason. Do not express a protection as a conditional block; remove what must not be served.
- **The sample cipher list is not what it claims.** It is described as offering perfect forward
  secrecy and includes suites that do not. Set your own cipher list.
- **No deny-by-default for sensitive filenames.** A `.git/` directory, editor backup files or `*.bak`
  files under the document root are served. Do not deploy a document root containing them.

**Privileges — how the drop behaves**

- **Privilege drop is available, active by default, and fail-closed.** The `UserAccount` and
  `GroupAccount` directives ship active in `appweb.conf`. After privileged ports are bound, Appweb
  drops both user and group together, then verifies the drop: if the resulting uid or gid is not the
  one requested, or if the dropped privileges turn out to be recoverable, **startup aborts** rather
  than continuing in a degraded state. A server that refuses to start with `Privilege drop incomplete`
  or `Privileges are recoverable after drop` in the log is reporting exactly that, and the cause is
  normally the configured account rather than the server. If you remove both directives, no privilege
  drop occurs — run the server unprivileged, or drop privileges in the supervising process. **On
  Windows this does not apply**: see Platform-specific below.

**Controls that are configured but do not act**

This is the group most worth reading, because each item looks configured and is not.

- **`Chroot` confines less than it appears to.** The `chroot()` call itself is real and the kernel
  enforces it — but the process enters the jail with a working directory that may resolve outside the
  new root, which is the textbook escape, and the recorded jail root is never consulted afterwards, so
  no path is re-checked against it in software. Treat `Chroot` as one layer, not as containment:
  prefer a container, a mount namespace, or a supervisor that chroots and changes directory before
  exec.
- **Compiling out the defence module silently disables every request-rate control.** With it absent,
  `LimitClients`, `LimitConnectionsPerClient`, `LimitRequestsPerClient`, `LimitProcesses` and all
  `Monitor`/`Defense` rules parse and are ignored. Keep it in, or place rate limiting in front.
- **Compiling out logging removes the security telemetry as well as the noise**, including the
  warnings that would otherwise tell you a control is absent, and turns log-driven defences into
  no-ops.
- **Session-to-client-address binding is inert**: a session presented from a different address is
  accepted rather than rejected. Do not treat address binding as a session control.
- **`LimitFrame` is parsed, clamped, stored and never read.**
- **TLS renegotiation control is inert on both backends.** Renegotiation is governed by a compile-time
  choice, not by configuration.
- **The startup security self-checks warn and continue.** A setuid binary, a world-writable binary or
  a world-writable working directory is detected and logged, and the server starts anyway. Treat
  those log lines as failures.

**TLS: the backends are not equivalent**

- **The default protocol floor is TLS 1.1**, which RFC 8996 deprecates. Set `SSLProtocol` explicitly —
  and note the next item.
- **`SSLProtocol` is a no-op on MbedTLS**, and **`SSLVerifyDepth` is not enforced there** either. A
  protocol floor or a chain-depth limit is effective only on the OpenSSL backend.
- **The curated default cipher list is applied only on OpenSSL.** MbedTLS falls back to its full
  compiled-in suite set.
- **Revocation-aware session bounding is OpenSSL-only.** On MbedTLS a session resumes for up to 24
  hours regardless of revocation state, and when a chain is untrusted with issuer verification off the
  entire verification bitmask is discarded, so a co-occurring revocation failure is lost.
- **Operator-supplied cipher strings are not validated on OpenSSL** — a string selecting null
  encryption is accepted as written — and are silently only partly applied on MbedTLS. Verify the
  negotiated suite from the client side rather than trusting the directive.
- **The OpenSSL backend loads only the first certificate from a chain file.** Intermediates in the
  same file are ignored, so a client that does not already hold the intermediate cannot build a path.
  Supply the intermediate through the CA file.
- **The OpenSSL backend loads RSA private keys only.** An EC/ECDSA key fails silently. Use an RSA key
  with this backend, or MbedTLS.
- **No minimum OpenSSL version is enforced.** The source still compiles against branches that have
  been end-of-life for years. Pin a supported branch yourself.
- **The bundled root certificate list is a 2023 snapshot** and is the default trust store for outbound
  connections. Supply and maintain your own.

**Logs and traces disclose credentials and identifiers**

- **At the trace level the shipped configuration uses, the `Authorization` header is written verbatim**,
  base64 credential included. Header tracing also records Digest response values and session cookies,
  response tracing records the live session identifier and the XSRF token, and session creation logs
  the session identifier. Treat trace output as credential material: raise the level only on a device
  you control, and purge what it wrote.
- **Log and trace files are created mode 0664**, and the server sets a fixed umask of 022 that
  overrides the operator's. Restrict the log directory.
- **The trace log has no size cap and does not rotate** unless a backup count is configured, which the
  shipped default does not.
- **CGI standard error is relayed to the client as the response body**, whatever the error-display
  setting. Do not let CGI programs write diagnostics to stderr in production.
- **Core dumps are never disabled.** A crash can write session identifiers, credentials and TLS
  private key material to disk. Disable them in the supervising environment.
- **Log records carry no client, connection or stream identity**, so entries cannot be attributed to a
  request under concurrency.

**Availability and resource limits**

- **A NUL byte in the request line or header block, and some malformed request lines, are held open
  with no response** until the parse timeout expires. This is a connection-slot exhaustion primitive;
  keep the parse timeout short and rate-limit in front of the server.
- **Multipart uploads have no limit on part or file count**, and byte-range counts are unbounded and
  allocated before validation.
- **There is no socket-layer accept backstop**, and an `accept()` failure has no backoff, so under
  descriptor exhaustion the event loop can spin.
- **The shared cache has no size backstop** in the default configuration.
- **Where a regular-expression engine is in use, the directory-listing filter can be driven into
  exponential backtracking** by an unauthenticated request. Do not enable directory listing on an
  exposed route.

**Routing, caching and response correctness**

- **Prefix routes and `Alias` have no path-segment boundary**: a prefix of `/public` also matches
  `/publicAdmin`. Terminate protective prefixes with a slash and verify the paths they claim.
- **Regular-expression route patterns are matched case-sensitively**, even on a case-insensitive
  volume — see §4.2. A protective route written as a regular expression can be evaded by changing the
  case of a URI.
- **Host and virtual-host name matching is case-sensitive**, contrary to host-equivalence rules, so a
  request whose Host differs only in case will not select the virtual host you expect.
- **The response cache key omits the content encoding and, by default, the query string and the
  method.** A cached body can be returned to a request that negotiated differently or asked a
  different question. Configure the cache to include the query string, or cache only static,
  parameter-free resources.
- **Byte-range handling is not reliable at the edges**: a 206 response can carry bytes from a
  different offset than its own `Content-Range` states, `If-Range` is inverted in both directions,
  and the multipart byte-range boundary is derived from memory addresses, disclosing pointer values.
  Avoid serving ranged content to untrusted clients where exactness matters.
- **Conformance gaps that break strict clients**: HEAD returns a body on error responses, ETags are
  emitted unquoted, and `If-None-Match: *` never matches.
- **Directory listing writes on-disk filenames into HTML and link attributes without escaping.** Do
  not enable it on a directory whose filenames are attacker-influenced.
- **Redirect targets and reflected header values are interpolated without escaping**, including a
  `Location` supplied by a CGI, FastCGI or proxied backend. Do not build redirects from request data
  or from an upstream you do not control.
- **Responses of 2 GiB or larger** are not supported on all paths.

**CGI, FastCGI and reverse proxy**

- **Children inherit the server's entire environment.** Start the server with a minimal environment
  where the programs are not fully trusted, and set `EnvPrefix` as §4.4 describes.
- **Do not build a command from request data.** The `Update cmd` mechanism expands client-controlled
  request tokens into a command string that is then split into arguments, and the ISINDEX argument
  path has no leading-dash guard — the shape of CVE-2012-1823 where an `Action` places an interpreter
  first.
- **Every FastCGI record transmitted carries uninitialised memory** in its padding bytes.
- **FastCGI framing is not defensive**: a backend that splits its header block across records has its
  response silently discarded, and malformed record framing hangs to the request timeout rather than
  failing the request.
- **A request pipelined behind a CGI request can turn the preceding response into a 502.** Disable
  keep-alive on CGI routes where clients pipeline.
- **A reverse-proxy backend response that is rejected hangs the downstream request** rather than
  ending it.

**Sessions, authentication and browser-facing defaults**

- **The session cookie carries an explicit `domain=` derived from the Host header**, broader than the
  default host-only scope, and carries **no `SameSite` attribute**. Cross-site request forgery
  protection is **off by default**, as are Content-Security-Policy and HSTS, and the default security
  header set includes a deprecated `X-XSS-Protection`. Set these for any browser-facing interface.
- **An undefined role name is accepted as a literal ability**, so a typo in an authorization rule
  produces a rule that grants rather than one that fails. Validate role names against the roles you
  defined.
- **Basic authentication leaks usernames by timing**, and a credential containing no colon is accepted
  as an empty password.
- **Always set an explicit allowed origin when enabling CORS.** The manufacturer is investigating
  whether a route with CORS enabled and no configured origin reflects the request `Origin` alongside
  credentialed access; naming the origins you accept avoids the question either way.
- **The cookie-deletion helper ignores the name it is given** and always deletes the session cookie,
  and the deletion cookie itself carries neither `HttpOnly` nor `Secure`.

**Files, uploads and privileged paths**

- **Upload temporary files are predictable and are created mode 0664**, by default under a
  world-writable temporary directory, and are opened without an exclusive-create guard. Set the upload
  directory to a private location on a multi-user host.
- **The upload filename sanitiser admits `:` (NTFS alternate data streams), trailing dots and spaces,
  and reserved device names.** Do not derive a stored path from a client-supplied filename.
- **PUT truncates before it checks.** The target is opened create-and-truncate with no
  symlink-follow guard, and its type is checked only after truncation; a `Range` on a PUT controls
  truncation and an unbounded seek, producing a sparse file of attacker-chosen apparent size. Do not
  enable PUT on an untrusted route.
- **The privileged change of ownership on log and trace paths follows symbolic links**, and the log is
  opened without a symlink-follow guard.
- **A stat-then-open race on the document path** can reopen a device or FIFO that the regular-file
  check exists to exclude.

**Platform-specific**

- **On Windows there is no privilege drop**: `UserAccount` and `GroupAccount` are silently ignored,
  and the installed service runs as LocalSystem with an unquoted binary path. Install into a path with
  no spaces, or install the service yourself with a quoted path and a dedicated account.
- **Windows 8.3 short names can bypass extension-based handler and route selection**, including the
  reserved-name URI validation. Disable 8.3 name generation on volumes serving content.
- **The RTOS targets are not built or tested by the manufacturer.** VxWorks, ESP32 and FreeRTOS are
  supported in source but are covered by neither the manufacturer's continuous integration nor its
  release testing, and several primitives are degraded on VxWorks specifically: `ftruncate` does
  nothing and reports success, `mkdir` discards permissions, temporary files land in a global working
  directory, name resolution cannot report failure, the process-exit path continues rather than
  stopping, symbolic links are not resolved so document-root containment does not hold, CGI pipe names
  are generated from an unlocked counter in a global namespace, and a unit mismatch in the task
  timeouts lets a CGI request stall the dispatcher. An integrator targeting these platforms must do
  their own verification.
- **`mprRandom()` is a seeded pseudo-random generator on Windows and the RTOS targets**, and sits in
  the public API beside the cryptographic `mprGetRandomBytes()`. Use `mprGetRandomBytes()` for
  anything security-relevant.

**Build hardening**

- **The project's own build files enable none of the standard hardening options** — no
  `_FORTIFY_SOURCE` (the documented knob for it is wired to nothing), no position-independent
  executables, weak rather than strong stack protection, link-time hardening only on Linux, no
  Control Flow Guard on Windows, and no diagnostic gate that turns a format-string warning into an
  error. §7.2 lists the flags to add; the integrator's build governs.

The manufacturer's disposition of every finding, including those not listed here, is recorded in the
vulnerability disposition retained under Annex VII (§2.1). Fixes are published to the channels in §6
within the support period.

---

*This document is provided in accordance with Annex II of Regulation (EU) 2024/2847. It accompanies
every release archive as `doc/user-information.md`.*
