certs
===

Test SSL/TLS certificate generation.

**WARNING: All certificates are for testing only — never use in production.**

## Certificate Files

These are the files this module installs, as a flat directory. In a consuming product they are
installed into `certs/`; in this repository they are generated into `dist/`, which is what is
published.

| File | Purpose |
|------|---------|
| `ca.crt` / `ca.key` | Test Certificate Authority (signs test.crt) |
| `self.crt` / `self.key` | Self-signed server certificate |
| `test.crt` / `test.key` | CA-signed test server certificate |
| `ec.crt` / `ec.key` | Elliptic Curve (prime256v1) certificate |
| `aws.crt` | AWS IoT root CA certificate |
| `roots-min.crt` | Minimal root CA bundle |
| `openssl.conf` | OpenSSL CA configuration with certificate extensions |
| `*.ans` | Answer files providing non-interactive input to OpenSSL prompts |
| `Makefile` | Regenerates the certificates |

Default: 2048-bit RSA keys, 3650-day validity (10 years).

`make roots` additionally downloads the full Mozilla root CA bundle as `roots.crt`. It is not
published with the module because of its size.

## Building

The targets below regenerate the certificates. Sources live under `src/` in this repository and the
results are staged into `dist/`; a consuming product receives only the generated files.

```bash
make                    # Generate all test certificates
make build              # Same as above
make ca-cert            # Generate CA certificate (ca.crt, ca.key)
make self-signed-cert   # Generate self-signed certificate (self.crt, self.key)
make test-cert          # Generate CA-signed test certificate (test.crt, test.key)
make ec-cert            # Generate EC certificate (ec.crt, ec.key)
make cert-request       # Generate CSR for external CA (server.csr, server.key)
make show-certs         # Display all certificate details
make roots              # Download Mozilla root CA bundle
make package            # Copy distributable files to dist/
make cache              # Build, package and cache
make clean              # Remove all generated files
```

