# Appweb Benchmark Suite

Performance benchmark suite for Appweb embedded web server, measuring throughput, latency, and identifying regressions across releases.

## Quick Start

```bash
# Build Appweb in debug mode (benchmarks require ME_DEBUG)
make OPTIMIZE=debug

# Run benchmarks from test/bench directory
cd test/bench
tm bench.tst.c

# Quick validation (5 seconds)
tm --duration 5 bench

# Standard benchmarks (30 seconds)
tm --duration 30 bench

# Release benchmarks (5 minutes)
tm --duration 300 bench
```

## Requirements

- **ME_DEBUG build**: Benchmark handler is only compiled in debug builds
- **TestMe**: Test framework with dynamic compilation
- **Certificates**: Located in `../../certs/` for HTTPS testing
- **Open ports**: 4200 (HTTP) and 4201 (HTTPS)

## What Gets Measured

The benchmark suite currently measures five key performance areas:

### 1. Static File Serving (HTTP Library)
- **1KB, 10KB, 100KB, 1MB files** via Appweb HTTP client library
- **Metrics**: Requests/sec, latency (avg, p95, p99, min, max), throughput (MB/s)

### 2. HTTPS Performance
- **TLS handshakes and session reuse** with same file sizes
- **Metrics**: Requests/sec, latency, overhead vs HTTP

### 3. File Uploads
- **1KB, 10KB, 100KB, 1MB uploads** via PUT requests
- **Metrics**: Uploads/sec, latency, throughput

### 4. Authentication
- **Digest authentication** (configurable qop) with inline user definitions
- **Metrics**: Auth requests/sec, latency

### 5. Action Routes
- **Simple actions**: Minimal processing overhead (`/test/success`)
- **JSON responses**: Action handler with JSON output (`/test/show`)
- **Metrics**: Actions/sec, latency

### Future Enhancements (TODO)
- **Raw HTTP/HTTPS**: Direct socket I/O bypassing HTTP library
- **WebSockets**: WebSocket echo performance
- **Mixed workload**: Realistic traffic patterns

## Understanding the Results

### Result Files

Results are automatically saved to:
- **doc/benchmarks/latest.json5** - Machine-readable JSON5 format
- **doc/benchmarks/latest.md** - Human-readable markdown table

Example output structure:
```
doc/benchmarks/
├── latest.json5         # Most recent benchmark run
├── latest.md            # Markdown table format
├── v9.0.0.json5        # Versioned baseline (manual)
└── v9.0.0.md           # Versioned baseline (manual)
```

### Key Metrics

| Metric | Description | Interpretation |
|--------|-------------|----------------|
| **Req/Sec** | Requests per second | Higher is better; main throughput metric |
| **Avg Latency** | Average response time (ms) | Lower is better; typical user experience |
| **P95 Latency** | 95th percentile (ms) | Lower is better; most users see this or better |
| **P99 Latency** | 99th percentile (ms) | Lower is better; worst case for most requests |
| **Min/Max** | Fastest/slowest request (ms) | Shows range; max may include outliers |
| **Bytes** | Total data transferred | Validates test execution |
| **Errors** | Failed requests | Should be 0 or very low (<0.1%) |
| **Iterations** | Completed requests | More iterations = better statistics |

### Timing Resolution

- **Precision**: Millisecond (using MPR `mprGetTicks()`)
- **Fast requests**: May show 0ms (below timing resolution)
- **Statistical smoothing**: Multiple iterations provide meaningful aggregates
- **Relative comparison**: Valid for regression detection even with sub-ms requests

## Duration Configuration

The benchmark suite uses **time-based execution** controlled by the `--duration` flag (which sets the `TESTME_DURATION` environment variable).

### Default Behavior

```bash
tm bench  # 120 seconds total (12s soak + 108s benchmark)
```

### Custom Durations

```bash
# Quick smoke test (5 seconds)
tm --duration 5 bench

# Standard benchmarks (30 seconds)
tm --duration 30 bench

# Comprehensive (5 minutes)
tm --duration 300 bench
```

### Duration Allocation

- **10% for soak phase**: Warm up all code paths
- **90% for benchmarks**: Full measurement with statistics
- **Per-group allocation**: Benchmark time divided across test groups (currently 5 groups)
- **File size multipliers**: Large files (100KB, 1MB) use 25% of base duration

### Benefits of Time-Based Testing

- **Predictable execution time**: Suite completes in known time
- **Adaptive iterations**: Faster servers run more iterations
- **Fair comparisons**: All configurations get same time budget
- **Flexible tuning**: Quick validation (5s) to comprehensive (5m)

## Test Execution Flow

### Phase 1: Preparation (prep.sh)
- Creates `site/` directory with test files
- Generates files: 1KB, 10KB, 100KB, 1MB
- Creates authentication test files
- Note: Users are defined inline in appweb.conf (ralph/pass5)

### Phase 2: Setup (setup.sh)
- Starts Appweb server on ports 4200 (HTTP), 4201 (HTTPS)
- Uses minimal `appweb.conf` for benchmarking
- Waits for health check to pass
- Saves server PID for monitoring

### Phase 3: Soak Phase (bench.tst.c)
- **Warm up**: Runs quick sweep of benchmarks
- Stabilizes MPR garbage collector
- Primes caches (file cache, digest cache, TLS sessions)
- Duration: 10% of specified duration (minimum 500ms)

### Phase 4: Benchmark Phase (bench.tst.c)
- **Timed execution**: Each test group runs for allocated duration
- **Statistics collection**: Captures per-request timing
- **Error tracking**: Records failed requests
- Duration: 90% of specified duration

### Phase 5: Analysis & Results
- **Statistics calculation**: Computes avg, p95, p99, min, max
- **Result saving**: Writes JSON5 and Markdown files
- **Cleanup**: Server shutdown via cleanup.sh

### Phase 6: Cleanup (cleanup.sh)
- Stops Appweb server
- Cleans up uploaded test files
- Preserves log files for debugging

## Configuration Files

### appweb.conf
Minimal configuration for maximum performance:
- No unnecessary logging
- Essential handlers only (fileHandler, testBenchHandler)
- Generous limits for benchmarking
- Digest authentication for `/auth/` routes
- Upload support for `/upload/` routes

### testme.json5
TestMe configuration for compilation:
- Links against: appweb, http, mpr, pcre, ssl, crypto
- 30-minute timeout for long benchmark runs
- Services: prep, setup, cleanup, healthcheck

## MPR-Specific Notes

Appweb uses the MPR (Multi-Purpose Runtime) which differs from the web server's safe runtime:

- **Garbage collection**: No manual memory deallocation with `mprFree`
- **HTTP library**: Uses Appweb's built-in `http` library (not URL library)
- **JSON**: Uses MPR JSON (strings mode) with `mprCreateJson`, `mprWriteJson`
- **Threading**: MPR uses thread worker pool (not fibers)
- **Timing**: Uses `mprGetTicks()` for millisecond precision

## Running Specific Tests

Run individual test groups using `TESTME_CLASS` environment variable:

```bash
# Static files only
TESTME_CLASS=static tm bench

# HTTPS only
TESTME_CLASS=https tm bench

# Uploads only
TESTME_CLASS=uploads tm bench

# Auth only
TESTME_CLASS=auth tm bench

# Actions only
TESTME_CLASS=actions tm bench
```

## Interpreting Performance

### Baseline Comparison

Compare against versioned baselines:
```bash
# Save current results as baseline
cp doc/benchmarks/latest.json5 doc/benchmarks/v9.0.0.json5
cp doc/benchmarks/latest.md doc/benchmarks/v9.0.0.md
git add doc/benchmarks/v9.0.0.*
```

### Regression Detection

Look for:
- **>10% decrease in req/sec**: Significant performance regression
- **>10% increase in p95/p99**: Latency degradation
- **Any errors**: Functional regression

### Platform Variations

Performance varies by:
- **CPU**: Faster CPUs = higher throughput
- **TLS library**: OpenSSL vs MbedTLS (OpenSSL typically faster)
- **Build profile**: Debug builds ~30% slower than release
- **System load**: Background processes impact results

## Troubleshooting

### Server won't start
- Check ports 4200/4201 are available: `lsof -i:4200`
- Build Appweb in debug mode: `make OPTIMIZE=debug`
- Check certificates exist: `ls -la ../../certs/`

### Authentication not working
- Users are defined inline in appweb.conf
- Default test user: ralph/pass5
- Check that digest authentication is enabled in the build

### Tests time out
- Increase timeout in testme.json5
- Check server is responding: `curl http://localhost:4200/`
- Review bench.log for errors

### High error rate
- Check server logs in bench.log
- Verify test files were created by prep.sh
- Ensure adequate system resources

## Known Limitations

1. **ME_DEBUG only**: Benchmark handler requires debug build
2. **HTTP library API**: Some advanced features need implementation:
   - Digest authentication header generation
   - WebSocket upgrade
3. **Raw socket tests**: Not yet implemented
4. **Mixed workload**: Placeholder only

## Contributing

When adding new benchmark tests:
1. Follow existing naming conventions (`testBenchmark*`)
2. Use time-based duration with `getBenchDuration()`
3. Record all metrics: iterations, timing, bytes, errors
4. Update `configureDuration()` group count
5. Add test to both soak and benchmark phases
6. Document in README.md

## License

Copyright (c) Embedthis Software. All Rights Reserved.
This software is distributed under a commercial license.
