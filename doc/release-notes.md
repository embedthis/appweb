# Appweb v9.2.0 Release Notes

**Release Date**: 2026-09-02

## Overview

Appweb 9.2.0 is a security and restructuring release closing thirteen security defects: a
route-authentication bypass, a pre-authentication memory-safety defect in the Digest parser, session
identifier prediction, an mTLS client-certificate bypass, CGI and FastCGI environment injection
(httpoxy), disclosure of the server secret in the Digest challenge, three request-framing and
request-smuggling defects, a symbolic-link escape from the document root, unbounded Digest replay, CGI
response splitting, and silently unenforced certificate revocation. It also removes the vendored
regular-expression engine and unbundles ESP (Embedded Server Pages) and its SQLite backend as a separate
add-on.

This is a **breaking** release. The framing, Digest and CGI-header fixes tighten what the server accepts,
and anyone who relied on the bundled ESP handler or SQLite is affected. See Compatibility for the full
list and for migration guidance. Upgrading is recommended for all deployments.

**Appweb remains in maintenance mode** with ongoing security updates and critical bug fixes. For new projects,
consider migrating to [Ioto Device Agent](https://www.embedthis.com/ioto/).

## Security Fixes


- **Critical**: Fixed a route-authentication bypass via case-variant URIs. Route selection compared the
  request path byte-exactly while the kernel folded case when opening the file, so on a case-insensitive
  document root (macOS APFS/HFS+, Windows NTFS/FAT, exFAT, vfat, SMB) an upper- or mixed-case spelling of a
  protected URI fell through to an unprotected route and served the document **with no credentials**. That one
  comparison gates route authentication, abilities, and TLS enforcement. Route selection, prefix stripping,
  and pattern-literal matching now fold consistently with the file system. Folding can only widen the set of
  URIs a protective route claims, never narrow it. Found internally; no separate advisory.

  Deployments serving from a case-insensitive volume with any authenticated route should upgrade
  immediately. Case-sensitive volumes were not affected.

- **Critical**: Fixed a pre-authentication out-of-bounds read and write in the Digest `Authorization` parser
  (CWE-125, CWE-787). The quoted-pair unescape loop advanced its read pointer twice per iteration with no
  guard for a backslash immediately before the terminator, so a value ending in a single backslash stepped
  over the NUL and kept reading — and writing — into adjacent heap memory. The parse runs before any
  credential is verified. The loop now advances by exactly one per iteration and requires a following
  character before consuming a backslash. A related defect that let an escaped quote terminate a value early
  is fixed in the same change. Memory-safety defect, found internally; no separate advisory.

  Deployments with any `AuthType digest` route should upgrade immediately.

- **Critical**: Fixed session-identifier prediction. The session id — the sole bearer token for an
  authenticated session — was an MD5 over a heap pointer, the millisecond tick count, and a global counter
  that was itself emitted verbatim in the id. None of the three inputs is a cryptographic random source, and
  on a target without ASLR the pointer is constant across boots. Session ids are now drawn from the
  cryptographic random source; if that source is unavailable the request fails rather than issuing a
  guessable id. Found internally; no separate advisory.

  Invalidate active sessions (or restart the server) after upgrading so any pre-upgrade id is discarded.

- **High (configuration-gated)**: Fixed CGI and FastCGI environment injection from request headers, the httpoxy
  family (CWE-454, the class of CVE-2016-5385). Every request header is exposed to a CGI or FastCGI child as an
  `HTTP_`-prefixed environment variable, so a client sending a `Proxy:` header set `HTTP_PROXY` in the child — which
  many HTTP client libraries read as their outbound proxy, redirecting the child's outbound requests to an attacker.
  An `Authorization:` header likewise handed the caller's credentials to the child. Appweb now filters the names that
  must never reach a child process — the proxy-selection variables, the caller's authorization, the dynamic loader
  controls and the interpreter and shell variables — in both handlers, from a single shared list. Ordinary headers are
  unaffected. Found internally. (Advisory APPWEB-SA-2026-0002.)

  Deployments running CGI or FastCGI where the script or backend makes outbound HTTP requests should upgrade as a
  priority. As an interim measure the `Proxy:` header can be stripped at a front-end proxy.

- **Medium (defence-in-depth)**: Fixed disclosure of the server secret in the Digest authentication nonce. The nonce
  was the base64 of `secret:realm:time:counter`, and base64 is a transport encoding rather than a confidentiality
  protection, so any client that solicited a Digest challenge could decode the nonce and read the server secret
  verbatim. No authentication was required to obtain a challenge. The secret is now bound into the nonce through a
  one-way hash and is never transmitted; the server recomputes and compares it in constant time to validate a nonce it
  issued. Found internally. (Advisory APPWEB-SA-2026-0001.)

  Deployments with any `AuthType digest` route should upgrade. Any integrity key derived from the server secret should
  be treated as having been public and rotated.

- **High (configuration-gated)**: Fixed an mTLS client-certificate bypass in `verifyPeerCertificate()`. The
  configured chain-depth limit was enforced only when no other verifier error had already been set. Builds
  linked against LibreSSL 3.2.x or 3.3.2–3.3.6 — whose legacy X.509 verifier surfaces an over-depth chain as
  `X509_V_ERR_UNABLE_TO_GET_ISSUER_CERT_LOCALLY` (error 20) rather than `X509_V_ERR_CERT_CHAIN_TOO_LONG`
  (error 22) — skipped the depth guard, so with `SSLVerifyClient require` and `SSLVerifyIssuer off` an
  attacker-controlled chain longer than `SSLVerifyDepth` (default 10) was accepted and the handshake completed
  as an authenticated client with no trusted key material. The fix enforces the depth limit unconditionally
  from `X509_STORE_CTX_get_error_depth()`, removing all dependence on backend-specific error mapping.
  OpenSSL (the default and preferred backend), BoringSSL, AWS-LC, LibreSSL 4.x, and the MbedTLS backend were
  not exploitable in practice; the fix applies to all backends as defence in depth.
  (Advisory APPWEB-SA-2026-0003.)

  Operators running mTLS with `SSLVerifyIssuer off` against an affected LibreSSL release should upgrade as a
  priority.

- **High**: Fixed three request-framing defects that together made request smuggling possible behind a
  proxy. The chunk-size line was not parsed against its grammar and the size was truncated through an
  `int`, so a 2^32 chunk framed as end-of-body; `Content-Length` was converted by a lenient helper that
  stopped at the first non-digit and detected no overflow, so `5abc` framed a 5-byte body and
  `18446744073709551716` wrapped to 100; and `Transfer-Encoding` was matched case-sensitively, was not
  rejected when combined with `Content-Length`, and was honoured on HTTP/1.0. A front-end that read the
  same bytes differently disagreed with Appweb about where a request ended. All three are now parsed
  against their RFC 9112 grammars and ambiguous framing is refused. A repeated single-valued header — the
  guard that was supposed to catch a duplicate `Content-Length` and could never fire — is also rejected.
  Found internally; no separate advisory.

  Deployments behind a caching proxy or load balancer should upgrade as a priority. See Behavior Changes
  for what is now refused.

- **High**: Fixed a symbolic-link escape from the document root. Containment was checked on the
  unresolved path, so a symlink inside the document root pointing outside it was followed and its target
  served. Containment is now checked on the resolved path. Found internally; no separate advisory.

- **High**: Fixed unbounded Digest replay. A captured `Authorization` header could be replayed against
  any request line, for as long as the server ran: the `uri` parameter was trusted rather than compared
  with the request-target, the nonce count was not tracked, and the staleness check compared a
  millisecond timestamp against a seconds one so it never fired. A Digest credential is now bound to one
  resource and accepted once. Found internally; no separate advisory.

- **High**: Fixed CGI and FastCGI response splitting. A response header value containing a bare CR was
  forwarded verbatim; a lone CR is not a line terminator to the gateway parser but is one to many
  clients, caches and proxies, so a CGI reflecting request-derived text into a header let the requester
  end a header — or the response — of its own. The CGI `Status:` value was also converted with `atoi` and
  installed unchecked. Both are now validated, and every transmission-header setter in the HTTP library
  discards a name or value containing CR or LF as a backstop. Found internally; no separate advisory.

- **High**: Fixed certificate revocation never being enforced. The OpenSSL backend loaded a configured
  CRL but never set the revocation-check flag, so a revoked client certificate was accepted and mTLS
  revocation was silently inoperative — the worst failure mode for a control an operator has explicitly
  configured. Found internally; no separate advisory.

  Deployments relying on CRL-based revocation for mTLS should upgrade immediately and treat any
  revocation since deployment as not having taken effect.

- **High (configuration-gated)**: Fixed permissive CORS with credentials. When `CrossOrigin` enabled
  credentials, the configured `origin=` allow-list was skipped entirely and whatever `Origin` the client
  sent was reflected back alongside `Access-Control-Allow-Credentials: true` — so the more restrictive the
  operator's intent, the more permissive the result. Any page on the internet could then issue credentialed
  requests to the device and read the responses using a logged-in operator's session. A credentialed
  response is now emitted only for an `Origin` that matches the configured non-wildcard list, and a response
  that varies by origin carries `Vary: Origin`. `CrossOrigin` now also rejects at config parse a `credentials`
  setting with a wildcard or absent origin, a combination browsers refuse and which therefore hid the
  misconfiguration during testing. Found internally; no separate advisory.

  Deployments using `CrossOrigin ... credentials=` should upgrade and review their origin list.

- **High (configuration-gated)**: Fixed parameter smuggling from multipart uploads into CGI, FastCGI and
  PHP. A multipart form field was replayed to the gateway as an `application/x-www-form-urlencoded` body
  without escaping, so a field name or value containing `&` or `=` created parameters that existed for the
  gateway but not in Appweb's own parameter table. A route condition, an update rule, an access check or an
  audit record made its decision on one view of the request while the script acted on another. Both the name
  and the value are now percent-encoded. Found internally; no separate advisory.

- **High (Unix)**: Fixed two forked children that returned into the server's own control flow instead of
  exiting. When a CGI program's directory could not be entered, and when a launched FastCGI program could
  not be executed, the child unwound back into the parent's code and re-entered the event loop as a second
  copy of the server — holding a duplicate of every descriptor the parent had, including the listening
  socket. The FastCGI case is reachable by ordinary misconfiguration, such as a launch program renamed by a
  package upgrade, and each request that found no free application forked another copy. Found internally; no
  separate advisory.

- **High (Unix)**: Fixed privilege-drop failures being logged and ignored. A failing `setgid`,
  `setgroups` or `initgroups` in the `UserAccount`/`GroupAccount` path recorded a critical message and then
  continued to serve requests with the privileges it had failed to give up. Such a failure is now fatal at
  startup, the drop is verified afterwards against the configured uid and gid, and the server refuses to
  start if the privileges can be recovered. `UserAccount` without `GroupAccount` now also drops to the
  user's primary group; it previously changed only the uid. Found internally; no separate advisory.

- **Medium**: Fixed log injection through traced request data (CWE-117). A username, header value or other
  request-derived string containing CR or LF was written to the trace log unescaped, letting a client forge
  whole log entries. All formatters now route request-derived text through a single escaping step covering
  CR, LF, TAB, the control range, the double quote that delimits common-format fields, and the backslash.
  The `formatter=common` access log, which replaced the trace event table and listened for an event that
  never fired, also produced no output at all; it is fixed. Found internally; no separate advisory.

- **Medium**: Fixed an uninitialised read parsing a request `Content-Range` header. Two continuation
  pointers were passed to the split chain uninitialised, so a truncated header such as `Content-Range: bytes`
  read indeterminate memory. Each component is now parsed against the grammar and a malformed range is
  refused. Found internally; no separate advisory.

- **Medium**: Fixed a directory-index rewrite that bypassed document-root containment. A request for a
  directory selected its index file by assigning the path directly, skipping the check that a resolved file
  lies inside the document root — so a symbolic link named `index.html` pointing outside the root was served
  for `GET /dir/` even though `GET /dir/index.html` was refused. Found internally; no separate advisory.

- **Medium**: Fixed route case-folding being chosen by platform rather than by the document root. Whether
  route matching folds case is now probed from the configured `Documents` directory, so a case-folding
  volume on Linux (vfat, exFAT, SMB) is handled correctly and a case-sensitive volume on macOS is not folded
  unnecessarily. Found internally; no separate advisory.

- **Medium (Windows)**: Fixed request paths reaching the file system through Win32 namespace aliases. A
  path segment with a trailing dot or space, an embedded colon, or a reserved device basename (`CON`, `NUL`,
  `COM1` and friends) is now refused before routing, so a trailing-dot spelling can no longer miss the
  extension-to-handler map and be served as a static file. Windows child processes also no longer inherit
  every inheritable handle — including the listening socket and live client connections. Found internally;
  no separate advisory.

- **Medium (VxWorks)**: Fixed the CGI task entry point being selectable through the child environment,
  which is populated from request data. The entry point is now derived from the program path alone, and
  `ENTRYPOINT` is refused as a child environment variable. Note that CGI on VxWorks runs in the server's own
  address space; see `doc/man` and the deployment documentation for what that means for the threat model.
  Found internally; no separate advisory.

- **Medium**: Fixed a request rejected by the per-client concurrency limit never decrementing the counter
  it had just incremented, so the limit ratcheted down until a client was locked out permanently. Fixed a
  blocked `sendfile` transfer whose stream was destroyed leaving the garbage collector free to reclaim the
  file being written from. Found internally; no separate advisory.

- **High**: Fixed an authorization requirement that enforced nothing and said nothing. `Require
  ability|role|user|valid-user` recorded the requirement on the route, but the check that reads it at
  request time is installed by `AuthType` — so a route carrying a `Require` with no `AuthType` anywhere in
  its ancestry parsed without error, started without a warning and **served every client**. Nothing in the
  configuration, the logs or the startup output distinguished it from a route that was genuinely
  protected. Such a configuration is now rejected and the server does not start, naming the route. The
  same defect and the same repair apply to `auth.require` in a JSON configuration. Found internally; no
  separate advisory. **See Breaking Changes.**

  Deployments with a `Require` or `auth.require` on any route should check that an `AuthType` or
  `auth.type` is in scope for it before upgrading — see the migration note below.

- **High**: Fixed a CGI or FastCGI `Content-Length` being echoed to the client and never checked against
  the body that followed (CWE-444). Appweb took the gateway program's declared length at face value, made
  it the response content length, turned off chunking, and then forwarded however many bytes the program
  actually wrote. Where the two disagreed the response did not match its own framing statement: declaring
  **more** than was sent left the client reading the next response on the connection as the tail of this
  one; declaring **less** left the excess at the head of the client's buffer to be parsed as the start of
  the next response — gateway output injected into a later response, and behind a connection-pooling proxy
  into a **different client's** response. Both handlers now count the bytes they forward and end the
  connection on a disagreement. A declared length that is not a plain decimal number that fits is
  `502 Bad Gateway`, raised before any response header is committed. The reverse-proxy handler was never
  affected: it discards the backend's length and frames the client response itself. Found internally; no
  separate advisory.

  Deployments serving CGI or FastCGI programs should upgrade, most sharply where Appweb sits behind a
  proxy, cache or load balancer that pools connections. A correct program is unaffected.

- **Medium**: Fixed a memory ceiling that did not bind. `LimitMemory` set a limit that nothing enforced:
  crossing it logged a line, called the memory notifier, and then completed the allocation, so a server
  could run at many times its configured limit and keep accepting work. Measured with a 4 MB limit, none
  of 64 allocations was refused at 67 MB resident. The limit is now enforced by shedding load rather than
  by failing an allocation — at or above it the server stops accepting new connections, answers a new
  request on an established connection with `503`, and prunes its caches, resuming when memory is
  reclaimed. `MemoryPolicy continue` now prunes the cache, which it had always claimed to do and never
  did. Found internally; no separate advisory. **See Behavior Changes.**

- **Medium**: Fixed two defects in configuration parsing that silently discarded a security setting. An
  `Order` directive cleared every other authentication flag on the route, so `AuthSession off` written
  before it was undone without a word. And `auth.require.roles` written as a plain string rather than a
  list was discarded entirely when the configuration was parsed, rather than merely left unenforced.
  Found internally; no separate advisory.

- **Medium**: Fixed a stack overflow collecting a wide JSON document. Garbage collection marked an
  object's properties by recursing from each into the next, one stack frame per property, so a wide
  document terminated the process — measured at 20,000 properties against a default 512 KB thread stack,
  and fewer on targets with smaller stacks. Properties are now marked from their parent, iteratively.
  Affects applications that build wide trees through the JSON API; a parsed document, configuration files
  included, could not reach the threshold. Found internally; no separate advisory.

- **Medium**: Fixed a route-scoped `User` rewriting that credential server-wide. A nested route
  redeclaring a user its parent had declared updated the parent's credential in place, so the password the
  parent route declared stopped working on the parent route. Found internally; no separate advisory.

## Supply Chain

- **The vendored PCRE 7.7 regular-expression engine has been removed.** Appweb now ships no regexp engine.
  Route patterns, `Alias` prefixes, `{token}` segments, and literal alternations are matched natively by a
  non-backtracking matcher, which covers every configuration Appweb ships. This removes an end-of-life 2008
  third-party parser that matched attacker-controlled request paths, host names, headers, and form fields
  from the default build, eliminates its ReDoS exposure, and drops 18,177 lines of C and roughly 137 KB
  (about 10%) from `libappweb`.

  Deployments that genuinely need regular expressions — alternation inside a route pattern, character
  classes, `{m,n}` repeats, lookahead, `{token=regexp}` fields, or a `ServerName` written as `/regexp/` —
  build with `ME_COM_PCRE2=1` and link a PCRE2 library they supply and patch on their own schedule
  (`cd projects && premake5 --pcre2 gmake`). The PCRE2 backend sets explicit match and depth limits. A
  pattern needing an engine in a build without one now fails at **config parse**, naming the pattern, rather
  than at request time; guard such configuration with the `<if PCRE2>` conditional.

## Bug Fixes

- **Negated route patterns now work.** `<Route !pattern>` with a literal pattern previously matched nothing
  at all: the `startWith` literal fast-reject was applied without regard to the negation, so a path that did
  not match was skipped before the negation could invert the result, and a path that did match was then
  rejected by the inversion.
- `TEST_WEBSOCKETS_MODULE` was not a recognised `<if>` conditional, and the test WebSocket route named an
  unregistered handler stage. Together these prevented the test server from starting.
- **Launched FastCGI and proxy backends are now shut down with the server.** An application started by
  `FastConnect ... launch` or `ProxyConnect ... launch=` is forked by the server but is not in its process group, so it
  outlived the server and kept holding its listening socket. A subsequent start then found the address in use, or --
  where the endpoint is declared `multiple` -- bound alongside the orphan and split connections between a live backend
  and a stale one. Both handlers now reap the applications they launched when the runtime stops.

## Improvements

- **Build**: Imported the `certs` pak sources so test certificates are available directly in the source tree.
- **Test**: Test dependencies are installed rather than linked, improving build reproducibility.
- **Test**: WebSocket coverage runs against the built-in `testWebSocketsHandler` rather than an ESP
  application, including the proxy WebSocket tests. Tests that previously used ESP pages purely as a
  POST/form endpoint now use a handler-independent `Target write` echo route, so the suite no longer depends
  on the ESP add-on.
- **Documentation**: Migrated the module documentation to the `doc/` structure.

## Testing

- Full TestMe suite: **182 of 182 tests passing**, 2075 of 2075 assertions, from a clean build on
  macOS arm64. The source archive runs one test fewer — the fuzzing group builds only against an
  internal repository and is not distributed — and passes **181 of 181 with 2068 assertions** from a
  clean unpack.
- **The suite is verified on Linux for this release**: Ubuntu 24.04 on aarch64 with GCC 13.3 and
  OpenSSL 3.0.13, **181 passed, 0 failed**, with the same non-distributed group skipped. Linux
  verification is now a local step rather than a CI round trip, so it runs before a release rather
  than after one.
- **The suite is verified on Windows for this release**, for the first time: **159 passed, 0 failed**
  of 183, with 1297 of 1297 assertions, over two consecutive runs on Windows 11 with Visual Studio
  2026 and OpenSSL 3.6. The Windows-specific fixes in these notes are exercised on Windows, not
  inferred from POSIX. Two limits are worth stating plainly. The 24 tests not run are the FastCGI and
  reverse-proxy groups and one fuzzing group: **neither the FastCGI handler nor the proxy handler is
  built on Windows**, so those features have no coverage there and the notes below should be read
  accordingly. And the build is x64; a native ARM64 Windows target is not produced.
- Clean build with **zero compiler and zero linker warnings on macOS clang**. GCC is not yet at
  parity: the same source emits warnings there, none currently known to indicate a defect, and
  closing that gap is tracked for a later release.
- **The vendored HTTP and MPR sources are now verified against their upstream packages on every run.**
  Both are large generated files; nothing checked that a fix present in one was present in the other, so
  a re-import could silently revert one. A guard test now compares all five vendored files byte for byte
  and fails if any diverges.
- New regression tests cover the Digest nonce construction, the CGI and FastCGI environment
  filtering, session lifecycle and identifier properties, and TLS.
- **The TLS test group now runs.** Four of its five tests previously gated on a capability the test
  client does not have and reported success while asserting nothing, so server-certificate
  verification, client certificates and SNI were unverified. They are rewritten and now assert the
  negative cases as well — that verification rejects an unrelated CA, and that an endpoint requiring
  a client certificate refuses a request without one.
- The in-process fuzz-replay harnesses over the chunk-size parser and URL decoder now run as part of
  the suite rather than by hand.
- New regressions assert that a forked CGI or FastCGI child that cannot start does not survive as a
  second copy of the server, by counting processes rather than inspecting the response — the response is
  unchanged either way, which is how that class of defect goes unnoticed.
- Checksums for the source archive are published alongside these notes in [SHA256SUMS](SHA256SUMS).

## Compatibility

### Breaking Changes

- **A `Require` with no `AuthType` in scope now stops the server from starting.** Previously such a route
  parsed cleanly, started cleanly and served every client — the configuration read as protected and was
  not. It now fails closed: the configuration is rejected and the server exits, naming the offending
  route. The same applies to `auth.require` with no `auth.type` in a JSON configuration.

  *Migration:* if your server does not start after upgrading, the error names the route. Add the missing
  `AuthType` (or `auth.type`) to that route or an enclosing one, or remove the `Require` if the route is
  meant to be public. **Do not suppress the error** — a server that started before this change was
  serving that route to everyone.

  *Not affected:* `Require secure`, which installs its own check and needs no `AuthType`; an `AuthType`
  written after the `Require` in the same block; and an `AuthType` inherited from an enclosing route. The
  check runs once the whole configuration has been read, so all three keep working.

- **ESP is now a separate add-on product and is no longer bundled with Appweb.** `src/esp/` and the ESP test
  suite have been removed. The conditional hooks that bind ESP back in as a plugin remain, all gated on
  `ME_COM_ESP` (default 0).

  *Migration:* to build with ESP, install the `esp` and `sqlite` paks (which populate `src/esp` and
  `src/sqlite`) and regenerate the projects: `cd projects && premake5 --esp gmake`. A new `--esp` premake
  option was added for this.

- **SQLite has been removed.** It shipped solely as ESP's SDB database backend and now ships with the ESP
  add-on.

  *Migration:* SQLite returns automatically when you install the ESP add-on as above. Deployments that did
  not use ESP were not using SQLite and need no action.

- **`CrossOrigin` now requires an `origin=` argument, and rejects `credentials` with a wildcard or absent
  origin.** Both are config parse errors, so a server with such a directive will not start.

  *Migration:* name the origins you intend to allow — `CrossOrigin origin=https://app.example.com
  credentials=yes`. `origin=all` (equivalent to `*`) and `origin=client` (reflect the caller) are accepted
  without credentials. There is no configuration that reflects an arbitrary origin *and* allows credentials,
  because a browser will not honour one and it is not a policy that can be stated safely.

- **A privilege-drop failure is now fatal.** A `setgid`, `setgroups` or `initgroups` failure under
  `UserAccount`/`GroupAccount`, or a post-drop verification that finds the privileges recoverable, stops
  startup instead of logging and continuing.

  *Migration:* a deployment where the drop was silently failing has been running with privileges it
  intended to give up. Check that the configured user and group exist and that the server is started as
  root, then restart.

- **`UserAccount` without `GroupAccount` now drops the primary group as well as the user.** It previously
  changed only the uid, leaving the process in the invoking user's group.

  *Migration:* check that files the server must write — logs, upload directories, caches — are accessible
  to the target user's primary group, or set `GroupAccount` explicitly.

- **A build with `ME_HTTP_UPLOAD=0` or `ME_HTTP_WEB_SOCKETS=0` now rejects the corresponding directives.**
  They were previously registered regardless and silently ignored.

  *Migration:* remove `UploadDir`, `UploadAutoDelete`, `LimitUpload`, `LimitWebSockets*`,
  `WebSocketsProtocol` and `WebSocketsPing` from configurations used with those builds, or enable the
  feature.

- **`make` with no arguments now builds a release binary.** It previously built an unstripped `-O0` debug
  binary with assertions live. `make OPTIMIZE=debug` selects the old behaviour.

### Behavior Changes

- **A server that reaches its `LimitMemory` now sheds load.** At or above the limit it stops accepting new
  connections, answers a new request on an established connection with `503`, and prunes its caches,
  resuming as soon as memory is reclaimed. Previously the limit was not enforced at all: crossing it
  logged a line and the allocation completed anyway, and only `MemoryPolicy abort`, `restart` and `exit`
  had any effect — each of which takes the whole server down. A deployment whose `LimitMemory` is set
  below its real working set will now start refusing connections where it previously ran on. Size the
  limit for the working set you expect, and treat `503`s together with *"Memory use … exceeds the
  configured limit"* in the error log as the signal that it is too low. `MemoryPolicy continue` now
  prunes the cache rather than doing nothing.

- **A CGI or FastCGI program whose `Content-Length` disagrees with its body now loses the connection.**
  Appweb forwards what the declared length covers and then ends the connection rather than emitting a
  response that does not match its own framing. A malformed declared length is `502 Bad Gateway`. A
  program whose `Content-Length` matches what it writes is served exactly as before, keep-alive included.

- On a case-insensitive document root, route patterns now match case-insensitively. A route intended to
  protect `/auth/basic/` now also claims `/AUTH/BASIC/`. This is the fail-safe direction, but a configuration
  that deliberately relied on case to distinguish two routes on such a volume must be reviewed.
- Session ids are newly issued on upgrade; ids from a prior release are not recognised.
- A configuration using a pattern that requires a regular-expression engine now fails at config parse in a
  build without PCRE2, naming the pattern.

**Requests that were previously accepted and are now refused.** These follow from the framing, Digest and
CGI-header fixes. Each was accepted only because the parse was lenient, so a client sending one was already
relying on undefined behaviour — but a deployment with such a client will see it start failing.

- `Content-Length` must be exactly `1*DIGIT`; anything else is `400` and the connection closes. A value too
  large for an `int64` is `413`. Surrounding white space remains legal.
- A repeated single-valued header (`Authorization`, `Content-Length`, `Content-Type`, `Host`,
  `If-Modified-Since`, `Proxy-Authorization`, `Referer`, `Transfer-Encoding`, `User-Agent`) is `400`.
  `Cookie` and `Set-Cookie` are the documented exception and still permit duplicates.
- A chunk-size line that is not valid hexadecimal, and `Transfer-Encoding` combined with `Content-Length`
  or sent on HTTP/1.0, are refused.
- A Digest `Authorization` header is accepted only for the resource its `uri` names, only once per
  `(nonce, nc)` pair, and only with a `realm` matching the route's. A nonce older than 60 seconds is stale.
  A request omitting `qop` against a challenge that advertised it is refused. Clients that reuse a
  credential across requests, or omit the nonce count, must be updated; the bundled HTTP client already is.
- A CGI or FastCGI response header containing CR or LF is `502`, and a CGI `Status:` must be a three-digit
  final code in 200-599. Programs relying on a status outside that range must be changed.
- A symbolic link inside the document root that resolves outside it is no longer followed.
- A request `Content-Range` header that is not `bytes first-last/complete-length`, with each component a
  plain decimal and `first <= last < complete-length`, is `400` and the connection closes.
- On Windows, a request path segment with a trailing dot or space, an embedded colon, or a reserved device
  basename is refused.
- A `GET` for a directory whose index file resolves outside the document root is `404`, matching the
  request for that index file by name.
- A multipart form field replayed to a CGI, FastCGI or PHP gateway is percent-encoded, so a field whose
  value contains `&`, `=`, `+`, `%` or a space now reaches the gateway with different bytes than before —
  and, for the first time, with the same parameters Appweb itself parsed. A gateway that was relying on the
  old merged parse must be reviewed.

### Platforms and Protocols

- **Platform support**: Linux, macOS, Windows (native and WSL), VxWorks. Tier 1 platforms are built
  and tested on CI. FreeRTOS/ESP32 is not supported in this release because no MPR OS adaptation layer
  is provided for that target.
- **API stability**: Core HTTP/MPR APIs are unchanged and remain compatible with Appweb 9.0.x / 9.1.x. The
  break is structural — the ESP handler and SQLite backend are no longer present in the core product. Code
  that linked directly against ESP or SQLite symbols must install the add-on.
- **TLS support**: OpenSSL 1.1.1+, OpenSSL 3.x (default and preferred), MbedTLS 2.x/3.x. LibreSSL is
  API-compatible via the OpenSSL backend.
- **HTTP protocols**: HTTP/1.0, HTTP/1.1, HTTP/2.

## Upgrading

Drop-in replacement for 9.1.0 for deployments that do not use ESP or SQLite. No configuration changes
required. Deployments using ESP must install the add-on as described under Breaking Changes.

## Resources

- **Homepage**: https://www.embedthis.com/appweb/
- **Documentation**: https://www.embedthis.com/appweb/doc/
- **GitHub**: https://github.com/embedthis/appweb
- **Support**: support@embedthis.com
- **Security Issues**: security@embedthis.com (private disclosure)

## License

Appweb is distributed under a dual license model:

- Commercial license for proprietary applications
- GPL v2+ for open source projects

See https://www.embedthis.com/licensing/ for details.

---

**Previous Release:** 9.1.0
**Full Changelog:** https://github.com/embedthis/appweb/compare/v9.1.0...v9.2.0
