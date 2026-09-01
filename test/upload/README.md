# Upload tests

Multipart upload coverage: the filter's rejection paths, the handler matrix, and the size sweep.

| File | Covers |
|------|--------|
| `multipart.ts` | Shared body builder and raw-socket sender. Not a test |
| `boundary.tst.ts` | Every documented rejection path in `uploadFilter.c`, and the client-filename policy |
| `handlers.tst.ts` | The same upload behind `fileHandler`, `cgiHandler`, `fastHandler` and `proxyHandler` |
| `sizes.tst.ts` | Zero bytes upward, boundaries straddling a write, and the per-file `LimitUpload` cap |

These drive a socket rather than a client library because a malformed multipart is precisely the
body a client library will not produce, and the straddle case needs the body divided at a chosen
offset rather than wherever the client flushes.

The routes they use are in `../appweb.conf` and `../proxy.conf`; the `/action/upload` reporting
fixture is `src/modules/testBenchHandler.c`. See
[`doc/features/scenario-tests/`](../../doc/features/scenario-tests/feature.md).

This directory previously held `test-sizes.es` and `test-cgi-upload.es`, manual Ejscript scripts for
an Appweb 4 server. Nothing ran them and Ejscript is not part of Appweb; they were deleted rather
than left beside live tests, which is how `stress/upload.tst.ts` came to target an endpoint that had
not existed for years.
