# Appweb v9.3.0 Release Notes

**Release Date**: [FILL: release date, set when the release is cut]

## Overview

Appweb 9.3.0 is a security release. It is the result of two further internal security audits of Appweb and of the HTTP and MPR libraries it is built on, and it closes several hundred defects. The most serious are in routing and access control: several configurations that read as protected served requests without authentication, and a Windows batch CGI could be made to run arbitrary commands. Other areas with significant fixes are mutual TLS, request framing and HTTP/2, CGI, FastCGI and reverse proxy handling, uploads, sessions, logging and the build. Defaults are tightened throughout: TLS 1.2 is the minimum protocol, prior-knowledge HTTP/2 over cleartext is off, session cookies are `SameSite=Lax` and host-only, core dumps are off and log files are private.

This is a **breaking** release. Several configurations that started in 9.2.0 now fail at startup, because they did not do what they said, and a number of malformed or ambiguous requests now receive an error. See Compatibility before upgrading. Upgrading is recommended for all deployments.

Some security statements in the 9.2.0 release notes and user information were not true of 9.2.0. They are listed under Corrections to the 9.2.0 Documentation, with the fix that makes each one true in 9.3.0.


## Security Fixes

The severity of each item is the manufacturer's assessment for a deployment that uses the affected feature. Unless stated otherwise each was found by the manufacturer's own security review.

### Routing and access control

- **High**: Fixed a pattern that needs a regular-expression engine being dropped in a build without PCRE2. A `Route`, `Param` or `RequestHeader` pattern such as `^/(admin|private)/` was logged and ignored, the route never matched, and its `AuthType` and `Require` were lost, so the paths it was meant to protect were served by another route without credentials. An invalid pattern in a PCRE2 build was dropped the same way. Both are now a configuration error naming the pattern, and the server stops.
- **High**: Fixed `Require secure` failing open. Over plain HTTP the protected route was skipped and the request fell through to the next route, often one without authentication that served the same files. An insecure request now receives 403.
- **High**: Fixed a route's `Methods` restriction failing open. On a route with `AuthType` or `Allow`/`Deny`, a method outside the route's list fell through to an unprotected route, so a POST to a GET-only protected route was served without authentication. It now receives 405 with an `Allow` header.
- **High**: Fixed a negated route (`<Route !^/public/>`) being skipped by the router when it followed a positive route with the same leading text, which served its URIs without authentication depending only on declaration order. Fixed the router's quick pre-check ignoring a top-level alternation (`^/private|^/secret`) or an optional final character (`^/admins?/`), with the same effect.
- **High**: Fixed `Require` under a nested `AuthType none` passing the startup check and then being ignored. `AuthType none` now discards the inherited requirement, and a `Require` with no authentication type in scope stops startup.
- **High**: Fixed `Allow`, `Deny` and `Order` restricting nobody: an allow list never excluded a client, and `all` was ignored. They now follow Apache semantics.
- **Medium**: Fixed unanchored pattern consumers (`Condition match`, `Param`, `RequestHeader`, and a `ServerName` pattern) dropping a leading `^` and ignoring `$` in an alternation, so `^(alice|bob)$` matched `malice`. Anchors are honoured, and these patterns now match case-sensitively, as with PCRE2.
- **Medium**: Fixed regular-expression route patterns folding case by the build platform rather than by the case sensitivity of the route's `Documents` volume, and fixed Unicode composed and decomposed spellings, or non-ASCII case variants, of a protected path missing their route on a case- or normalization-insensitive volume. A path component must now match the stored spelling or the request receives 404, and malformed UTF-8 in a path receives 400.
- **Medium**: Fixed a redirect to the login page being overwritten by a route `Target` that writes a response, which served protected content to an unauthenticated client.
- **Medium**: Fixed the sensitive-file deny list (version control, editor backup and environment files) being checked against the request path rather than the file actually served, and an `Alias` prefix without a trailing slash matching across a path segment, so `/doc` matched `/docs.bak`.
- **Medium**: Fixed a configuration block left open at the end of a file, such as a `<Route>` with no `</Route>`, being dropped with the authentication it declared while the server started and served its URIs from the enclosing route. An unclosed block now stops startup, in the main configuration and in an included file.
- **Medium**: Fixed a configuration block left unbalanced by `<else>` or `</if>`, a misspelled `<if>` condition that evaluated false with no diagnostic, an `<else>` inside a false `<if>` that never ran, and a nested `<if>` inside a disabled block that re-enabled parsing. Each is now correct or a configuration error.

### TLS and mutual TLS

- **High**: Fixed `SSLVerifyClient` accepting any self-signed or untrusted client certificate, because a server did not verify the client certificate's issuer by default. Requiring a client certificate now verifies it against the configured CA unless `SSLVerifyIssuer off` is set. The commented mutual-TLS example in the shipped `appweb.conf` therefore now authenticates clients as written.
- **High**: Fixed a client reaching a virtual host whose client-certificate requirement was never applied, by sending SNI for one host and a `Host` header for another. A request whose `Host` selects a virtual host with a different TLS policy from the SNI host now receives 421 Misdirected Request, on OpenSSL, MbedTLS and HTTP/2.
- **High**: Fixed MbedTLS sharing one session cache and ticket key across every TLS configuration, so a session from an endpoint without client certificates could be resumed on one that requires them. Each configuration now has its own.
- **Medium**: Raised the build-time floors: OpenSSL 3.0 and MbedTLS 3.6.1 are now the minimum supported versions, and an older release is a compile error unless the integrator defines an explicit end-of-life override for a vendor-maintained branch. The default protocol floor is TLS 1.2, and renegotiation is off by default.
- **Medium**: OpenSSL TLS 1.2 now uses Appweb's default cipher list rather than OpenSSL's, which had included suites without forward secrecy. MbedTLS now honours `SSLProtocol`, `SSLVerifyDepth`, a forward-secret default cipher list, revocation alongside an untrusted issuer, and revocation-bounded session resumption. A cipher list that selects NULL, anonymous, export or low suites, or embeds `@SECLEVEL=0`, stops startup.
- **Medium**: After SNI selected a virtual host, only its certificate was applied; its verification mode, depth, protocols and options now apply as well. OpenSSL now loads intermediate certificates from the chain file and accepts EC keys. `${ssl:...}` certificate fields used in `Condition` and header rules are escaped, so one subject attribute cannot forge another.
- **Low**: TLS private keys are loaded before the privilege drop, so a key may be readable by root only, and a TLS configuration that cannot load stops startup.

### Authentication and sessions

- **High**: Fixed a BF2 password hash with a long salt ignoring the password. New BF2 hashes default to 16384 rounds, and `authpass` gains `--rounds`.
- **Medium**: Fixed a session created by a login in one realm also authenticating the same user name on other routes, realms and virtual hosts. Sessions are bound to the realm, user store and credential that verified them, and changing a password revokes that user's sessions.
- **Medium**: Fixed the Digest nonce-count replay store being emptied when the cache pruned its excess, which let a captured credential be replayed. Fixed the Digest nonce counter not being thread-safe.
- **Medium**: On XSRF-protected routes the token was checked only after a form login had created a session. It is now verified first, form credentials are accepted only from a POST body, and form logout accepts POST only.
- **Medium**: Fixed session table exhaustion locking out logins, and fixed a logout being undone by a concurrent request on the same session.
- **Medium**: The session cookie is host-only and `SameSite=Lax` by default, a session is bound to the client address it was created from, a credential with no colon is no longer accepted, and Basic authentication no longer reveals by timing whether a user name exists.
- **Low**: The `Authorization` scheme must match the route's authentication type, and CGI `AUTH_TYPE` is set only for an authenticated request. PAM authentication now runs the account check, so an expired or locked account cannot log in. Route `SessionTimeout` and `LimitSessions` apply to sessions created while routing.
- **Low**: The `http` client sends `--user` credentials only to the origin it was given, not to a redirect target on another origin or from HTTPS to HTTP, and it answers Digest challenges without extra options.

### Request framing and HTTP/2

- **High**: Fixed a chunk-size line accepting a bare CR as its terminator, a request-smuggling desynchronization behind a proxy. The request line and header block are parsed strictly: tab or multiple spaces as delimiters, an unbounded blank-line prologue, NUL bytes, and an absolute-form authority overridden by `Host` now receive an error response.
- **High**: Fixed a use-after-free reachable without authentication by any `Range` request carrying `If-Range`.
- **High**: Fixed one unauthenticated connection growing its input buffer to `LimitMemory` before the protocol was identified, which with `MemoryPolicy restart` stopped the server. Such input is now capped at `LimitRequestHeader`.
- **Medium**: Fixed an HTTP/2 stream rejected before header decoding leaving the HPACK table out of step for every later request on the connection. Reported privately by Jeppe Weikop, whom the manufacturer thanks. Further HTTP/2 fixes: a request body shorter than its declared length was accepted and passed to CGI and FastCGI; NUL in a header value truncated it; connection-specific header fields and malformed names were accepted; HPACK integer, window-size and stream-id overflows; an oversize response header desynchronized the peer; and a malicious HTTP/2 server could crash Appweb's HTTP/2 client.
- **Medium**: Keep-alive reuse checked the next request against the previous request's route limits, host and trace settings. Each request now starts from its own.
- **Medium**: The method-override header and parameter bypassed request-line validation; they are validated, and `-http-method-` is read only from a form body. A client `Keep-Alive: max=` can no longer reset `LimitKeepAlive`. Only WebSocket version 13 is accepted.
- **Medium**: Fixed the WebSocket handshake never checking `Origin`, which allowed cross-site WebSocket hijacking. A browser handshake from another origin now receives 403 unless the route lists it with the new `WebSocketsOrigin` directive.

### Response generation and caching

- **Medium**: Fixed the server response cache (`Cache server=`) storing private, `no-store` and `no-cache` responses, responses that vary on headers outside its key, responses to unverified credentials and partial responses, and keying entries without the host, so one request with a chosen `Host` could poison an entry for every client. Only storable 200 responses are now cached, keyed by host.
- **Medium**: Fixed stored cross-site scripting in directory listings, an unescaped link in redirect bodies, response headers and backend or CGI header values being expanded as `${}` templates, and multipart range boundaries derived from memory addresses. Static files of unknown type are served as `application/octet-stream`.
- **Medium**: Fixed range, PUT and conditional-request handling: off-by-one range boundaries, an unbounded range count (new `LimitRanges`), `If-Range` semantics, and repeated part headers in multi-range responses. A short or aborted PUT deleted or truncated the existing file; a PUT that replaces a whole file is now written to a staged copy and renamed into place, and a PUT target must be a regular file reached without following a symbolic link. `If-Match`, `If-None-Match` and `If-Unmodified-Since` are evaluated for PUT and DELETE, and a failed precondition receives 412.
- **Low**: `Cache client=` headers are decided from the final response, and `Vary` is set correctly for restricted CORS origins and compressed responses. ETags are quoted and change when content changes.

### CGI, FastCGI and reverse proxy

- **Critical (Windows)**: Fixed a `.bat` or `.cmd` CGI program running under an implicit `cmd.exe` with client-controlled ISINDEX arguments, which allowed unauthenticated remote command execution wherever a batch CGI was deployed. Arguments containing `cmd.exe` metacharacters are now rejected for batch programs.
- **High**: Fixed CGI ISINDEX argument injection: a query term beginning with `-` could pass options to an interpreter, the shape of CVE-2012-1823. Such a term now receives 400, and the terms follow an end-of-options marker.
- **High**: Fixed the reverse proxy forwarding the raw request target while routing and authentication had used the normalized path, so `/app/admin/../public` could reach a protected backend path. It now forwards the normalized path.
- **High**: Fixed a WebSocket upgrade through the proxy opening the tunnel before the backend accepted it, letting a client send unrouted, unauthenticated requests to the backend.
- **Medium**: Fixed a WebSocket tunnelled through the proxy relaying nothing the backend sent after its 101 response. The HTTP client ended the response at the 101 instead of opening the tunnel.
- **High**: Fixed a forked child returning into the server as a second copy when a proxy or FastCGI `launch=` program could not be executed, and fixed a failed fork leading the server to signal every process the server account may signal.
- **High**: Fixed FastCGI record lengths being truncated to 16 bits, so more than 64 KiB of parameters or body was parsed by the backend as attacker-controlled records.
- **Medium**: Fixed a client parameter setting the upload variables the server synthesizes for CGI, FastCGI and handlers (`FILE_*`, `UPLOAD_DIR`), which let a client point a program at an arbitrary server path. Client parameters with these names are discarded.
- **Medium**: CGI and FastCGI response parsing shares one parser: a program's status line is honoured, a status outside 200-599 or a header name that is not a token receives 502, header names with white space before the colon no longer bypass `Content-Length` and `Transfer-Encoding` validation, and a header block split across FastCGI records is reassembled.
- **Medium**: FastCGI rejects malformed records with 502, zeroes record padding, and reuses a backend connection only after the application has completed its request. A failed FastCGI or proxy open no longer leaks its application slot.
- **Medium**: CGI programs receive a minimal environment (the CGI variables plus `PATH`, `TZ`, `LANG`, `LC_ALL` and the Windows system variables), run in their own process group, and have inherited descriptors closed. Their standard error is logged rather than sent to the client. A program that ignores SIGTERM is killed after a grace period.
- **Medium**: The proxy drops client-supplied forwarding headers and sets its own `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Real-IP` and `X-Client`; strips hop-by-hop headers in both directions; and on a route where Appweb authenticates the client, forwards neither the `Authorization` header nor Appweb's session cookie. When it ends a backend response it answers 502 rather than leaving the client waiting.
- **Medium**: Fixed request header names containing an underscore (`X_Forwarded_For`) being exported to CGI and FastCGI as the same `HTTP_` variable as the hyphenated name, so a client could override a value a program takes for a trusted one. Such headers are no longer passed to CGI or FastCGI.
- **Low**: Hop-by-hop request headers are not exported to CGI or FastCGI as `HTTP_` variables, a chunked request gets `CONTENT_LENGTH`, gateway traces redact credentials, and an `Action`-mapped CGI script receives `REDIRECT_STATUS=200`.
- **Low**: Fixed a `Location` returned by a CGI or FastCGI program being expanded as a template, so a program that copied request data into `Location` disclosed the server's document, home and binary paths. The value is used as given, with characters not permitted in a URI percent-encoded.
- **Low**: Fixed a FastCGI interpreter named by `launch=` or `Action` receiving the file name of the request that launched it as an argument for its whole life. The interpreter is started with no arguments.
- **Low**: Fixed a FastCGI or proxy application's exit failing the next request on a reused keep-alive connection, and a failed launch `fork()` leaving a child reaper that could take another child's exit status.

### Uploads and files

- **Medium**: Upload temporary files are private, unpredictable and created exclusively, and staged files are deleted for a refused, failed or aborted upload whatever `UploadAutoDelete` says. Upload file names are restricted to a portable, shell-safe set, with Windows device and 8.3 names rejected on every platform. The multipart parser was rewritten at its boundaries: boundary parsing, per-part state, a part count limit (new `LimitUploadParts`), oversize fields and part headers (now 413), and a body that ends inside a part (now 400).
- **Medium**: The shipped configurations no longer define an unauthenticated upload route; the example is commented and requires authentication and TLS.
- **Low (Windows)**: Windows 8.3 short names and device names with trailing spaces (`CON .txt`) no longer reach the file system through a request path or PUT target.

### Server process, logging and runtime

- **Medium**: Fixed `http.server.account` in a JSON configuration taking the group from the `user` value and ignoring a failed lookup. It reads `group`, and an unknown user or group stops startup.
- **Medium**: `--chroot` and the `Chroot` directive enter the jail and then change to its root, so the working directory cannot be left outside it, and both stop startup when the effective account is root. The startup checks for a setuid binary, a writable binary or a writable server home stop the server instead of logging. The configuration file is searched for in the server home and then beside the executable, and the file chosen is logged.
- **Medium**: Credentials, session identifiers and XSRF tokens are redacted from every trace, including packet dumps, the common log formatter and TRACE responses. Log and trace files are created mode 0600 without following symbolic links, a trace log is capped without `backup=`, request-derived values cannot forge trace fields, records identify the client, connection and stream, core dumps are disabled by default, and the operator's umask is honoured.
- **Medium**: Directives that depend on a compiled-out feature are a configuration error rather than silently ignored: `Monitor`, `Defense` and the per-client limits without the defense module, `Cache` without caching, and Basic or form authentication and `Redirect secure` in a build without TLS. `LimitFrame` now sets the HTTP/2 maximum frame size.
- **Medium**: Lingering-close connections count against `LimitConnections` and `LimitConnectionsPerClient`, the listener backs off when descriptors run out, and an error response is no longer lost to a TCP reset when client input is unread.
- **High**: Hardened the MPR runtime: the `%n` format directive is removed; buffer, allocator and base64 overflows, select notifier out-of-bounds writes, date and number parsing overflows, and an XML nesting stack exhaustion are fixed; `mprRandom()` draws from the system random source on every platform.
- **Low**: The sample configurations name placeholder certificate paths instead of the bundled development certificates, whose private keys ship in the archive. The example credential files and the unused `future.json` and `rom.files` are removed from `src/server`, and its `install.conf` listens on the loopback interface only.
- **Low**: `watchdog` reads the whole process id from its pid file before signalling, and does not follow a symbolic link when writing the pid file as root.
- **Low (Windows)**: The service binary path is quoted and `watchdog --account` installs it under a less privileged account; `UserAccount` and `GroupAccount` warn that they have no effect on Windows; command pipes are anonymous; modules load by absolute path without the current directory in the DLL search; argument quoting handles tabs.
- **Low (VxWorks)**: `_exit()` ends the task, symbolic links are detected so `FollowSymlinks off` holds, and task timeouts, name resolution failures and `ftruncate` behave as documented.

## Supply Chain

- The vendored HTTP, MPR, osdep, certs, watchdog and makerom modules are pinned to exact versions, and every vendored file is recorded with its SHA-256 and the module version it came from. Each module version names one content: http 9.3.0, mpr 9.3.0, osdep 1.2.1, certs 1.3.1, watchdog 1.0.2 and makerom 1.0.1.
- The SBOM shipped in the commercial source distribution as `doc/sbom.json` is the one validated against the source tree when the archive is built: its component versions, pins, hashes and licences are checked, and packaging fails if they disagree. The 9.2.0 SBOM recorded the test runner at a version one patch newer than the release resolved; it described a development-only component and is left as published.
- The bundled root certificate list is refreshed (Mozilla, 2026-09-25). TLS clients, including the `http` utility and proxy backends, now trust the platform store by default and fall back to the bundled list.

## Build

- The project files set the hardening flags themselves. Linux and FreeBSD: `-fstack-protector-strong`, `-fstack-clash-protection`, `-D_FORTIFY_SOURCE=3` (glibc before 2.34 treats it as 2), position-independent executables (premake `--no-pie` for MMU-less targets), `-z relro -z now` and `-z noexecstack`. Windows: `/GS`, `/DYNAMICBASE`, `/NXCOMPAT`, `/HIGHENTROPYVA`, `/CETCOMPAT` and Control Flow Guard, including in the debug configuration, which now uses `/Zi` without incremental linking. CET (`-fcf-protection`) and branch protection (`-mbranch-protection`) are not requested because the Unix projects are per operating system, not per architecture; add them for your target if your toolchain supports them. `-fstack-clash-protection` needs GCC 8 or Clang 11; remove it from `projects/premake5.lua` for an older cross toolchain.
- The warning set adds `-Wformat-nonliteral`, and on GCC `-Wduplicated-branches` and `-Wduplicated-cond`. Format-string and implicit-declaration warnings fail the build, and the build is warning-free on macOS clang, Linux GCC and Windows MSVC.
- Optional features are compiled out when the projects are generated: `premake5 --without=cgi,proxy gmake` (the list is `cgi`, `fast`, `proxy`, `basic`, `cache`, `defense`, `digest`, `dir`, `http2`, `pam`, `sendfile`, `upload`, `websockets`). The generated makefiles hard-code every feature define, so setting `ME_COM_CGI=0` or similar in the environment of `make` has no effect. The unused `ME_HTTP_CMD` flag is removed.
- `<if PAM>` is true only where the PAM user store is compiled in, so it is false on Linux, FreeBSD and Windows builds.
- The test configuration keeps its symbols, so sanitizer reports from it can be resolved. On Windows, `make.bat` with no argument now builds the release configuration, as `make` does on Unix.
- The test handlers are no longer compiled into default binaries; only the test configuration carries them.

## Bug Fixes

- `AddType` never registered its type, so every `AddType` was a no-op and an `Action` keyed on that type never ran. Fixed.
- CGI standard input could close before all upload or form data was written, losing fields under load.
- A response written from an `httpCreateEvent()` callback on a foreign thread was not transmitted.
- The `http` client wrote diagnostics to standard output, corrupting the body for scripts. They go to standard error.
- The HTTP/2 client hung after sending GOAWAY, accepted a body shorter than its declared length and could not handle interim 1xx responses.
- Per-route `LimitRequestForm` and `LimitRequestBody` were not applied to buffered form and JSON requests, and `LimitRequestForm` now applies to JSON bodies.
- `Reset pipeline` left inherited handlers on a nested route, and child routes lost `WebSocketsProtocol` and the ping period.
- `Require secure` with an age and subdomains produced a wrong HSTS max-age.
- The sample `CrossOrigin` example used a combination the parser rejects, and the shipped `formatter=common` access log example produced no output. Both are corrected.
- Garbage collector defects that could free reachable memory under load, and a wait handler re-armed after removal, are fixed.
- A FastCGI `Location` response forwarded the application's body after the redirect page, which a keep-alive client read as the next response.
- A FastCGI `multiplex=1` application could be given a second request while still serving one. A safe request whose application exited without answering is retried on another application, and dead pooled connections are skipped.
- A redirect to an absolute URI on another host was given this server's port, and a bare `https://host` target inherited the request path.
- `--home` left the default route at the launch directory, so certificate paths and the Windows startup permission check used the wrong directory.
- A thread resuming from a yield could wait indefinitely under back-to-back collections, parked requests waited for the next event-loop wake when a worker yielded, and a lingering socket closed by another thread could be re-armed.

## EU Cyber Resilience Act

The commercial Appweb source distribution carries the CRA conformity documents for this release: the EU Declaration of Conformity, the user information and the software bill of materials. The open source release in the public GitHub repository carries none of them. A manufacturer that integrates the open source release into a product placed on the EU market is responsible for that product's conformity with the Cyber Resilience Act. Contact [sales@embedthis.com](mailto:sales@embedthis.com) for the commercial product.

## Compatibility

### Breaking Changes

- **Configurations that now stop startup.** Each of these previously started and did not do what it said: a `Route`, `Param` or `RequestHeader` pattern the build cannot compile (anchored alternations such as `^a|b` now need PCRE2); a `Require` with no authentication type in scope, including under `AuthType none`; an unknown `<if>` condition or an unbalanced `<else>` or `</if>`; a defense, per-client limit or `Cache` directive in a build without that feature; Basic or form authentication or `Redirect secure` in a build without TLS; a cipher list selecting insecure suites; an unknown `http.server.account` user or group in a JSON configuration; a TLS configuration that cannot load; a setuid or writable server binary or a writable server home; and `--chroot` or `Chroot` with a root account.

  *Migration:* the error names the directive, route or pattern. Fix the configuration rather than suppress the error: a server that started before the change was not enforcing it.

- **TLS library floors.** OpenSSL 3.0 and MbedTLS 3.6.1 are the minimum versions. Define the documented end-of-life override only for a branch your vendor still patches.

- **Client certificates are verified by default.** `SSLVerifyClient` now implies issuer verification. Set `SSLVerifyIssuer off` only if you deliberately accept self-signed client certificates.

- **Prior-knowledge HTTP/2 over cleartext (h2c) is off by default.** Enable it per server with `Http2Cleartext on`. HTTP/2 over TLS is unchanged.

- **A configuration block left unclosed at the end of a file stops startup.** In 9.2.0 it was logged as "Unclosed directives" and dropped.

- **The `http` client verifies the server certificate by default.** Scripts that call `http` against a server with a self-signed or private-CA certificate must pass that CA with `--ca`. `--noverify` disables verification; do not combine it with `--user` or `--password`.

- **`Allow`, `Deny` and `Order` follow Apache semantics.** `Order Allow,Deny` with only `Deny` lines denies everyone, and `all` is honoured. Review IP rules that appeared to work only because nothing was enforced.

- **Sessions from 9.2.0 are not recognised.** Users log in again after the upgrade, and again when their client address changes.

- **ESP remains a separate add-on**, as in 9.2.0.

### Behavior Changes

- A guarded route answers 405 with `Allow` for a method outside its `Methods` list, and `Require secure` answers 403 over HTTP.
- A request whose `Host` selects a virtual host with a different TLS policy from the SNI host receives 421.
- A WebSocket handshake whose `Origin` is not the request's own scheme, host and port receives 403. A handshake with no `Origin` (a non-browser client) is accepted. `WebSocketsOrigin origin[,origin...]` lists the permitted origins for a route and its children, replacing the same-origin default, and `WebSocketsOrigin *` admits any. Behind a TLS-terminating proxy the default compares against `http://`, so list the `https://` origin. A WebSocket upgrade forwarded by the proxy handler is checked only by the backend.
- `Condition match`, `Param`, `RequestHeader` and `ServerName` patterns are case-sensitive.
- Malformed UTF-8 in a request path, a double-encoded path, a decoded control character, an invalid method override and a CGI ISINDEX term beginning with `-` receive 400. `+` in a path is literal.
- A short HTTP/2 request body, a header field not permitted in HTTP/2, a chunk-size line ended by a bare CR and an unmasked client WebSocket frame are protocol errors.
- More than 16 ranges, or more than 512 upload parts, receive an error by default (`LimitRanges`, `LimitUploadParts`). An upload file name outside the portable set receives 400.
- Version control, editor backup and environment files under the document root receive 404, and are hidden from directory listings, unless `ServeSensitiveFiles on` is set.
- Static files of unknown type are `application/octet-stream`. Without `CanonicalName`, a local redirect sends a relative `Location`.
- The server response cache starts cold after the upgrade and stores only 200 responses, keyed by host.
- A PUT that replaces a whole file writes a staged copy and renames it; a ranged PUT still updates the file in place. A failed precondition receives 412, and a range that starts past the end of the file receives 416.
- Client parameters named `FILE_*` or `UPLOAD_DIR` are discarded.
- CGI programs receive a minimal environment and their standard error is logged. A CGI or FastCGI response with a header name that is not a token, or a status outside 200-599, receives 502.
- A `Location` from a CGI or FastCGI program is not expanded as a template; `${...}` and a leading `~` are sent as written.
- `CgiPrefix` and `CgiEscape` are accepted in every build, so a FastCGI-only build can set the variable prefix.
- `src/server/install.conf` no longer listens on port 80 on every interface.
- Log and trace files are created mode 0600, core dumps are off, and the umask is the operator's.
- The configuration file is searched for in the server home, then beside the executable. In a build that defines no fixed server root the server home is the current directory, so start the server with an absolute `--config` path.
- `LimitFiles` in the shipped configuration is 256 and never raises the hard limit.
- BF2 hashes created by `authpass` default to 16384 rounds; existing hashes keep their rounds.
- TLS clients trust the platform certificate store by default.

### New Directives and Options

- `Http2Cleartext on|off`, `WebSocketsOrigin`, `LimitRanges`, `LimitUploadParts`, `ServeSensitiveFiles on|off`, and `FastConnect ... wait=<duration>`.
- `authpass --rounds`, `watchdog --account`, `http --noverify`, and the premake options `--no-pie` and `--without`.
- JSON configuration reports unknown `http.*` keys, and adds `http.http2Cleartext`, `http.ssl.revoke`, `http.ssl.revokeChain`, `http.ssl.verify.depth`, `http.ssl.authority.path` and `http.websockets.origin`.

### Platforms and Protocols

- **Platform support**: Linux, macOS and Windows (native and WSL) are built and tested. VxWorks is supported in source but is not built or tested by the manufacturer. FreeRTOS and ESP32 are not supported; a build for them stops with an unsupported-target error.
- **TLS support**: OpenSSL 3.0 or later (default and preferred) and MbedTLS 3.6.1 or later. LibreSSL is API-compatible through the OpenSSL backend.
- **HTTP protocols**: HTTP/1.0, HTTP/1.1, HTTP/2 over TLS, and HTTP/2 over cleartext when `Http2Cleartext` is on.
- **API**: Core HTTP and MPR APIs remain compatible with 9.2.0, with additions. `httpSetRoutePattern()`, `httpAddRouteParam()` and `httpAddRouteRequestHeaderCheck()` now return a status. `httpRedirectUri()` redirects to a target without template expansion, for targets derived from a request or a gateway. `HttpUploadFile.size` is an `MprOff`. `httpSetJail()` is removed.

## Known Issues

These are open in 9.3.0. In the commercial source distribution, the user information, section 10.2, gives the mitigation for each.

- With MbedTLS, a server accepts a certificate and private key that do not match, and fails at the first handshake rather than at startup.

## Corrections to the 9.2.0 Documentation

The 9.2.0 release notes and user information made these statements, which were not true of 9.2.0. Each is true of 9.3.0 because of the fix listed above. The 9.2.0 documents are not reissued; a deployment that stays on 9.2.0 should read them with these corrections.

- *A pattern that needs a regular-expression engine fails at configuration parse in a build without PCRE2.* In 9.2.0 such a pattern was logged and dropped, and its route's authentication was lost.
- *Literal alternations are matched natively with the same meaning.* In 9.2.0 an unanchored consumer such as `Condition match` matched `^(alice|bob)$` against `malice`.
- *A route's authentication requirement is inherited by the paths it claims.* In 9.2.0 `Require secure`, a `Methods` restriction and a nested `AuthType none` each let requests fall through to an unprotected route.
- *Route case folding is probed from the document root.* In 9.2.0 this held for literal and prefix patterns but not for patterns matched by a regular-expression engine.
- *Privilege drop is fail-closed.* In 9.2.0 a failed account lookup under `http.server.account` in a JSON configuration was ignored.
- *A Digest credential is accepted once.* In 9.2.0 cache pruning could empty the nonce-count store.
- *CGI and FastCGI response framing is validated.* In 9.2.0 a header name with white space before the colon bypassed it.
- *Forked children no longer return into the server.* In 9.2.0 a failed proxy `launch=` program still did.
- *Windows reserved device names are refused.* In 9.2.0 a device name followed by a space passed.
- *The shipped mutual-TLS example authenticates clients.* In 9.2.0 issuer verification was off by default, so it accepted any self-signed certificate.
- *`Allow` and `Deny` restrict clients by address.* In 9.2.0 they restricted nobody.
- *The shipped `appweb.conf` is a production starting point with no handler beyond static file serving.* In 9.2.0 it did not start, and its CGI and FastCGI branches could serve script source.
- *The `Authorization` header is not passed to a proxied backend.* In 9.2.0 the proxy forwarded every request header.
- *OpenSSL 1.1.1 and MbedTLS 2.x are supported TLS backends.* Both are end of life with public vulnerabilities; 9.3.0 requires OpenSSL 3.0 or MbedTLS 3.6.1.
- The 9.2.0 release notes said the external HTTP/2 HPACK report was not fixed in that release. It is fixed in 9.3.0.

## Upgrading

Read Breaking Changes, then start the upgraded server against your configuration in a test environment. A configuration that stops startup names what to fix. Rebuild against OpenSSL 3.0 or MbedTLS 3.6.1 or later. Users must log in again after the upgrade.

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

**Previous Release:** 9.2.0

**Full Changelog:** https://github.com/embedthis/appweb/compare/v9.2.0...v9.3.0
