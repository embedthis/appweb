# Appweb Test Suite

This directory contains the comprehensive test suite for the Appweb embedded web server, covering HTTP protocol compliance, security features, handlers, and performance testing.

## Quick Start

```bash
# From project root
make test

# Or from test directory
cd test
tm                    # Run all tests
tm basic/*           # Run specific test category
tm auth/basic.tst.ts # Run single test
```

---

## Table of Contents

- [About TestMe](#about-testme)
- [Test Organization](#test-organization)
- [Configuration Files](#configuration-files)
- [Running Tests](#running-tests)
- [Writing Tests](#writing-tests)
- [Test Types](#test-types)
- [Test Environment](#test-environment)
- [Troubleshooting](#troubleshooting)

---

## About TestMe

**TestMe** is a modern test framework designed for cross-platform testing of web servers and applications.

### Key Features

- **Multi-Language Support**: C, TypeScript/JavaScript, Shell scripts
- **Parallel Execution**: Run tests concurrently for faster execution
- **Cross-Platform**: Works on Linux, macOS, and Windows
- **Runtime**: Bun for TypeScript/JavaScript tests
- **Built-in Assertions**: Comprehensive matching functions (`ttrue`, `tequal`, etc.)
- **Service Management**: Automatic server startup/shutdown

### TestMe Installation

TestMe is typically installed globally:

```bash
# Install testme globally (if available)
bun install -g testme

# Link testme for local import
bun link testme
```

### TestMe Commands

```bash
tm                      # Run all tests
tm pattern              # Run tests matching pattern
tm --workers N          # Set parallel workers (default: 2)
tm --depth N            # Set test iteration depth (load testing)
tm --verbose            # Verbose output
tm --help               # Show help
```

---

## Test Organization

The test suite is organized by functionality:

```
test/
├── auth/              # Authentication tests
├── basic/             # Core HTTP functionality
├── benchmark/         # Performance benchmarks
├── cache/             # ESP cache content files
├── cgi-bin/           # CGI executable scripts
├── cgi/               # CGI handler tests
├── cmd/               # Command-line utility tests
├── compress/          # Content compression tests
├── conn/              # Connection management tests
├── error/             # Error handling tests
├── esp/               # ESP framework tests
│   ├── caching/       # ESP caching functionality
│   ├── chat/          # WebSocket chat application
│   ├── session/       # Session management
│   ├── solo/          # Standalone ESP tests
│   └── websockets/    # WebSocket protocol tests
├── fast-bin/          # FastCGI executable programs
├── fast/              # FastCGI handler tests
├── ipv6/              # IPv6 connectivity tests
├── lang/              # Language/localization tests
├── leak/              # Memory leak detection (Valgrind)
├── listing/           # Directory listing tests
├── monitor/           # Security monitoring tests
├── proxy/             # Proxy handler tests
├── range/             # HTTP range request tests
├── redirect/          # Redirect functionality tests
├── regress/           # Regression tests
├── route/             # Routing engine tests
├── security/          # Security feature tests
├── ssl/               # SSL/TLS tests
├── stress/            # Load and stress tests
├── tmp/               # Temporary test files
├── upload/            # File upload tests
└── utils/             # Test utilities
```

### Test Directory Details

#### auth/
**Purpose**: Authentication mechanism testing

**Tests**:
- `basic.tst.ts` - HTTP Basic authentication
- `digest.tst.ts` - HTTP Digest authentication
- `form.tst.ts` - HTML form-based authentication
- `blowfish.tst.ts` - Blowfish password hashing

**Configuration**: Uses `auth.conf` for authentication setup

#### basic/
**Purpose**: Core HTTP protocol functionality

**Tests**:
- `alias.tst.ts` - URI aliasing
- `chunk.tst.ts` - Chunked transfer encoding
- `dir.tst.ts` - Directory handling
- `form.tst.ts` - HTML form submissions
- `get.tst.ts` - HTTP GET requests
- `header.tst.ts` - HTTP header handling
- `methods.tst.ts` - HTTP methods (GET, POST, PUT, DELETE, etc.)
- `misc.tst.ts` - Miscellaneous HTTP features
- `post.tst.ts` - HTTP POST requests
- `put.tst.ts` - HTTP PUT requests
- `query.tst.ts` - Query string handling
- `read.tst.ts` - File reading and streaming
- `redirect.tst.ts` - HTTP redirects
- `reuse.tst.ts` - Connection reuse/keep-alive
- `secure.tst.ts` - Security features
- `stream.tst.ts` - Response streaming
- `upload.tst.ts` - File uploads
- `vhost.tst.ts` - Virtual host support

#### benchmark/
**Purpose**: Performance measurement

**Tests**:
- `http.tst.ts` - HTTP throughput benchmarking

**Configuration**: `benchmark.conf` with optimized settings

#### cache/, esp/caching/
**Purpose**: Response caching tests

**cache/**: Content files served by ESP with caching directives
**esp/caching/**: Test files for ESP caching functionality

**Tests** (in esp/caching/):
- `api.tst.ts` - Caching API control
- `big.tst.ts` - Large response caching
- `client.tst.ts` - Client-side caching
- `combined.tst.ts` - Combined caching modes
- `ext.tst.ts` - Extension-based caching
- `handlers.tst.ts` - Handler-specific caching
- `limits.tst.ts` - Cache size limits
- `manual.tst.ts` - Manual cache control
- `methods.tst.ts` - HTTP method caching
- `only.tst.ts` - Selective caching
- `types.tst.ts` - MIME type caching
- `unique.tst.ts` - Unique URI caching

#### cgi-bin/, cgi/
**Purpose**: CGI handler testing

**cgi-bin/**: CGI executable scripts (script, test.bat, test.php, etc.)
**cgi/**: Test files for CGI functionality

**Tests** (in cgi/):
- `alias.tst.ts` - CGI script aliasing
- `args.tst.ts` - Command-line arguments
- `big-post.tst.ts` - Large POST data
- `big-response.tst.ts` - Large CGI responses
- `encoding.tst.ts` - Character encoding
- `extra.tst.ts` - Extra path info
- `location.tst.ts` - Location header handling
- `nph.tst.ts` - Non-parsed header scripts
- `pausing.tst.ts` - Request pausing
- `post.tst.ts` - POST data to CGI
- `programs.tst.ts` - Different CGI programs
- `query.tst.ts` - Query string parameters
- `quoting.tst.ts` - Special character quoting
- `status.tst.ts` - Status code handling

**Support**: `cgi.ts` - Helper functions for CGI tests

#### cmd/
**Purpose**: Command-line utility testing

**Tests**:
- `http.tst.ts` - HTTP command-line client

#### compress/
**Purpose**: Content compression testing

**Tests**:
- `gzip.tst.ts` - Gzip compression

#### conn/
**Purpose**: Connection management

**Tests**:
- `delay.tst.ts` - Connection delays
- `whitespace.tst.ts` - Whitespace in requests

#### error/
**Purpose**: Error handling and error documents

**Tests**:
- `errordoc.tst.ts` - Custom error documents

#### esp/
**Purpose**: ESP (Embedded Server Pages) framework testing

**Subdirectories**:
- `caching/` - Caching functionality (see above)
- `chat/` - WebSocket chat application
- `session/` - Session management
- `solo/` - Standalone ESP tests
- `websockets/` - WebSocket protocol tests

**Tests** (root esp/):
- `big.tst.ts` - Large ESP responses
- `directives.tst.ts` - ESP directives
- `dump.tst.ts` - State dumping
- `get.tst.ts` - GET requests to ESP
- `include.tst.ts` - ESP includes
- `redirect.tst.ts` - ESP redirects
- `reload.tst.ts` - ESP reload functionality
- `uri-exploit.tst.ts` - URI security testing

**WebSocket Tests** (esp/websockets/):
- `big.tst.ts` - Large WebSocket messages
- `close.tst.ts` - Connection closing
- `construct.tst.ts` - WebSocket construction
- `empty.tst.ts` - Empty messages
- `frames.tst.ts` - Frame handling
- `len-150.tst.ts` - 150 byte messages
- `len-1500.tst.ts` - 1500 byte messages
- `len-8200.tst.ts` - 8200 byte messages
- `len-256K.tst.ts` - 256KB messages
- `open.tst.ts` - Connection opening
- `send.tst.ts` - Sending messages
- `sendBlock.tst.ts` - Blocking send
- `ssl.tst.ts` - Secure WebSockets

#### fast-bin/, fast/
**Purpose**: FastCGI handler testing

**fast-bin/**: FastCGI executable programs
**fast/**: Test files for FastCGI functionality

**Tests** (in fast/):
- `args.tst.ts` - FastCGI arguments
- `big-post.tst.ts` - Large POST data
- `big-response.tst.ts` - Large responses
- `location.tst.ts` - Location headers
- `pausing.tst.ts` - Request pausing
- `post.tst.ts` - POST requests
- `programs.tst.ts` - Different FastCGI programs
- `query.tst.ts` - Query strings
- `quoting.tst.ts` - Character quoting
- `status.tst.ts` - Status codes

**Support**: `fast.ts` - Helper functions

#### ipv6/
**Purpose**: IPv6 protocol support

**Tests**:
- `getv6.tst.ts` - IPv6 GET requests

#### lang/
**Purpose**: Language and localization

**Tests**:
- `default.tst.ts` - Default language
- `root.tst.ts` - Language root
- `suffix.tst.ts` - Language suffixes
- `target.tst.ts` - Language targets

#### leak/
**Purpose**: Memory leak detection

**Tests**:
- `valgrind.tst.ts` - Valgrind memory analysis

**Requirements**: Valgrind must be installed

#### listing/
**Purpose**: Directory listing functionality

**Tests**:
- `dirlist.tst.ts` - Directory listings

#### monitor/
**Purpose**: Security monitoring and defense

**Tests**:
- `ban.tst.ts` - IP banning

#### proxy/
**Purpose**: Reverse proxy handler

**Tests**:
- `chunk.tst.ts` - Chunked encoding
- `get.tst.ts` - GET requests
- `post.tst.ts` - POST requests
- `put.tst.ts` - PUT requests
- `timeout.tst.ts` - Timeout handling
- `upload.tst.ts` - File uploads
- `websockets-1.tst.ts` - WebSocket proxying (basic)
- `websockets-2.tst.ts` - WebSocket proxying (advanced)

**Configuration**: `proxy.conf`

#### range/
**Purpose**: HTTP range request support

**Tests**:
- `ranges.tst.ts` - Byte range requests

#### redirect/
**Purpose**: HTTP redirect functionality

**Tests**:
- `redirect.tst.ts` - Various redirect types

#### regress/
**Purpose**: Regression testing for fixed bugs

**Tests**:
- `01000-chunk.tst.ts` - Issue #1000: Chunking bug
- `bad-path.tst.ts` - Invalid path handling
- `connect.tst.ts` - Connection issues
- `headers.tst.ts` - Header parsing bugs
- `headers-2.tst.ts` - Additional header issues
- `missing.tst.ts` - Missing resource handling
- `zero.tst.ts` - Zero-length responses

#### route/
**Purpose**: Routing engine functionality

**Tests**:
- `auth.tst.ts` - Route-based authentication
- `cmd.tst.ts` - Command targets
- `condition.tst.ts` - Route conditions
- `fullpat.tst.ts` - Full pattern matching
- `missing.tst.ts` - Missing routes
- `optional.tst.ts` - Optional route parameters
- `param.tst.ts` - Route parameters
- `token.tst.ts` - Token substitution
- `var.tst.ts` - Variable substitution

#### security/
**Purpose**: Security feature testing

**Tests**:
- `dos.tst.ts` - DoS protection
- `huge-uri.tst.ts` - Large URI handling
- `traversal.tst.ts` - Path traversal prevention
- `uri.tst.ts` - URI validation

#### ssl/
**Purpose**: SSL/TLS functionality

**Tests**:
- `cert.tst.ts` - Certificate handling
- `condition.tst.ts` - SSL conditions
- `repeat.tst.ts` - Repeated connections
- `ssl.tst.ts` - Basic SSL/TLS

**Certificates**: Test certificates in `../certs/`

#### stress/
**Purpose**: Load and stress testing

**Tests**:
- `badUrl.tst.ts` - Malformed URLs
- `bigForm.tst.ts` - Large form submissions
- `bigUrl.tst.ts` - Large URLs
- `cgi-dos.tst.ts` - CGI DoS protection
- `foreign.tst.ts` - Foreign character handling
- `huge.tst.ts` - Huge requests
- `hugeForm.tst.ts` - Huge form data
- `post.tst.ts` - POST stress
- `upload.tst.ts` - Upload stress

---

## Configuration Files

### testme.json5

**Purpose**: Main TestMe configuration

**Location**: `test/testme.json5`

**Contents**:
- **compiler**: C compiler settings for C tests
  - GCC flags and libraries
  - MSVC flags and libraries
  - Include paths and link paths
- **environment**: Environment variables for tests
  - `TM_HTTP`: HTTP test URL (http://localhost:4100)
  - `TM_HTTPS`: HTTPS test URL (https://localhost:4443)
  - `TM_HTTPV6`: IPv6 test URL
  - Test port configurations
- **services**: Test lifecycle scripts
  - `setup`: Start server (`setup.sh`)
  - `prep`: Prepare test environment (`prep.sh`)
  - `cleanup`: Clean up after tests (`cleanup.sh`)

**Key Settings**:
```json5
{
    environment: {
        TM_HTTP: 'http://localhost:4100',
        TM_HTTPS: 'https://localhost:4443',
        TM_HTTP_PORT: '4100',
    }
}
```

### appweb.conf

**Purpose**: Full-featured Appweb configuration for testing

**Location**: `test/appweb.conf`

**Features**:
- All modules enabled (CGI, ESP, FastCGI, Proxy)
- Multiple listen ports for different test scenarios
- Virtual hosts configuration
- Security features enabled
- Verbose error messages (`ShowErrors on`)
- Extended timeouts for debugging
- Large resource limits for stress testing

**Listen Ports**:
- 4100: Main HTTP port
- 4200: Named virtual host
- 4300: Virtual host testing
- 4443: HTTPS (SSL/TLS)
- 5443: Self-signed certificate testing
- 6443: Client certificate testing
- 7443: Test certificate

### auth.conf

**Purpose**: Authentication testing configuration

**Location**: `test/auth.conf`

**Contains**:
- User definitions with passwords and roles
- Role definitions with abilities
- Authentication realms
- Protected directory configurations

### proxy.conf

**Purpose**: Proxy handler testing configuration

**Location**: `test/proxy.conf`

**Contains**:
- Proxy backend configuration
- ProxyConnect directives
- Upstream server settings

### benchmark.conf

**Purpose**: Performance benchmarking configuration

**Location**: `test/benchmark.conf`

**Optimizations**:
- Minimal logging
- Large connection limits
- Optimized buffer sizes

---

## Running Tests

### Basic Execution

```bash
# From project root
make test

# From test directory
cd test
tm                    # All tests
tm --verbose          # Verbose output
```

### Selective Testing

```bash
# Run specific category
tm basic/             # All basic tests
tm auth/              # All authentication tests
tm esp/caching/       # All ESP caching tests

# Run single test
tm basic/get.tst.ts

# Pattern matching
tm "**/get.tst.ts"    # All get tests
tm "auth/*.tst.ts"    # All auth tests
```

### Parallel Execution

```bash
# Adjust worker count
tm --workers 1        # Sequential execution
tm --workers 4        # 4 parallel workers

# Default is 2 workers (from testme.json5)
```

### Load/Stress Testing

```bash
# Increase iteration depth
tm --depth 2          # Run tests multiple times
tm --depth 5          # Heavy load testing

# Stress specific tests
tm stress/ --depth 3
```

### Platform-Specific

```bash
# Windows (from test directory)
tm

# Linux/macOS
tm

# With specific compiler
CC=clang tm
```

---

## Writing Tests

### Test File Naming

- **C Tests**: `name.tst.c` - Compiled and executed
- **TypeScript Tests**: `name.tst.ts` - Run with Bun
- **JavaScript Tests**: `name.tst.js` - Run with Bun (legacy)
- **Shell Tests**: `name.tst.sh` - Executed with bash

### TypeScript Test Structure

```typescript
import { testme } from 'testme'

testme({
    name: 'Test Name',
    timeout: 30000,  // 30 seconds
    test: async () => {
        // Test code here
        let response = await http.get(HTTP + '/path')

        // Assertions
        ttrue(response.status == 200)
        tequal(response.body, 'expected')
        tcontains(response.body, 'substring')
    }
})
```

### C Test Structure

```c
#include "testme.h"

int main(int argc, char **argv) {
    // Setup

    // Test code

    // Assertions
    ttrue(condition, "description");
    tequal(actual, expected, "description");

    // Cleanup
    return 0;
}
```

### TestMe Assertion Functions

**TypeScript/JavaScript**:
- `ttrue(condition, message?)` - Assert true
- `tfalse(condition, message?)` - Assert false
- `tequal(actual, expected, message?)` - Assert equality
- `tcontains(haystack, needle, message?)` - Assert contains
- `tmatch(string, pattern, message?)` - Assert regex match

**C**:
- `ttrue(condition, description)` - Assert true
- `tequal(actual, expected, description)` - Assert equality
- `tcontains(haystack, needle, description)` - Assert contains

### Test Guidelines

1. **Unique Names**: Avoid conflicts with parent/sibling directories
2. **Parallel Safe**: Tests must not interfere with each other
3. **Unique Files**: Use `getpid()` or similar for temporary files
4. **Portable**: Run on Linux, macOS, Windows
5. **Cleanup**: Remove temporary files after test
6. **Self-Contained**: Don't depend on test execution order

### Test Type Selection

- **C Tests**: Low-level functionality, performance-critical code
- **TypeScript Tests**: HTTP protocol, handlers, web framework
- **Shell Tests**: Simple command execution, file operations

---

## Test Environment

### Environment Variables

Available in all tests (from `testme.json5`):

- `HTTP` / `TM_HTTP`: Main HTTP URL (http://localhost:4100)
- `HTTPS` / `TM_HTTPS`: HTTPS URL (https://localhost:4443)
- `HTTPV6` / `TM_HTTPV6`: IPv6 URL (http://[::1]:4100)
- `TM_SELFCERT`: Self-signed cert URL (https://localhost:5443)
- `TM_CLIENTCERT`: Client cert URL (https://localhost:6443)
- `TM_TESTCERT`: Test cert URL (https://localhost:7443)
- `TM_NAMED`: Named virtual host (http://localhost:4200)
- `TM_VIRT`: Virtual host (http://localhost:4300)
- `TM_HTTP_PORT`: HTTP port number (4100)
- `BIN`: Build binary directory
- `PATH`: Includes build binary directory

### TypeScript/JavaScript Globals

Available in TypeScript tests:

```typescript
import { testme, http, HTTP, HTTPS } from 'testme'

// HTTP client
let response = await http.get(HTTP + '/path')
let response = await http.post(HTTP + '/path', data)
let response = await http.put(HTTP + '/path', data)
let response = await http.delete(HTTP + '/path')

// Response properties
response.status         // HTTP status code
response.statusText     // Status text
response.body           // Response body (string)
response.headers        // Response headers (object)
```

### Test Lifecycle

1. **prep.sh** - Runs once before all tests (if exists)
2. **setup.sh** - Starts Appweb server for tests
3. **Tests** - Execute in parallel (default 2 workers)
4. **cleanup.sh** - Runs after all tests complete

### Temporary Files

- Put temporary files in `test/.test/` directory
- Clean up in test or via `cleanup.sh`
- Use unique names (include PID or random ID)

---

## Troubleshooting

### Common Issues

#### Port Already in Use

```bash
# Check if appweb is running
ps aux | grep appweb

# Kill existing process
killall appweb

# Or use different port in testme.json5
```

#### Test Failures

```bash
# Run with verbose output
tm --verbose test-name

# Check server log
cat test/appweb.log

# Run single test
tm --workers 1 test-name
```

#### Build Issues for C Tests

```bash
# Check compiler settings in testme.json5
# Verify include paths point to build directory
# Ensure libraries are built: make
```

#### SSL Certificate Errors

```bash
# Use test certificates from ../certs/
# Check certificate paths in appweb.conf
# Verify OpenSSL/MbedTLS is installed
```

### Debugging Tests

```bash
# Verbose test output
tm --verbose test-name

# Keep server running
./setup.sh
# In another terminal:
tm --workers 1 test-name
# Server keeps running for inspection

# Check test artifacts
ls -la .testme/       # Build artifacts (if exists)
cat appweb.log           # Server log
```

### Server Debugging

```bash
# Start server manually with verbose logging
cd test
../build/*/bin/appweb -v

# In another terminal, run tests
tm --workers 1
```

### Memory Debugging

```bash
# Run with Valgrind
cd test
tm leak/valgrind.tst.ts

# Manual Valgrind
valgrind --leak-check=full ../build/*/bin/appweb -v
```

---

## Test Statistics

- **Total Test Files**: 150+ tests
- **Test Categories**: 25+ categories
- **Test Types**: TypeScript (primary), C, Shell
- **Coverage Areas**:
  - HTTP/1.0, HTTP/1.1, HTTP/2
  - WebSockets
  - Authentication (Basic, Digest, Form)
  - Handlers (File, CGI, FastCGI, ESP, Proxy)
  - Security (DoS, input validation, TLS)
  - Performance and stress testing
  - Platform compatibility

---

## Support Files

### Scripts

- **setup.sh**: Start Appweb server for testing
- **cleanup.sh**: Clean up test artifacts
- **prep.sh**: Prepare test environment (if needed)

### Directories

- **.testme/**: TestMe build artifacts (if exists)
- **tmp/**: Temporary test files
- **node_modules/**: Node.js dependencies (if exists)
- **utils/**: Test utility scripts

---

## Contributing

When adding new tests:

1. Follow existing test structure
2. Use appropriate test type (C/TypeScript/Shell)
3. Include descriptive test names
4. Add assertions with clear messages
5. Ensure tests are parallel-safe
6. Clean up temporary files
7. Test on multiple platforms
8. Update this README if adding new test category

---

## See Also

- [TestMe Documentation](https://www.embedthis.com/testme/) (if available)
- [Appweb Documentation](https://www.embedthis.com/appweb/doc/)
- [Build Guide](../CLAUDE.md)
- [Development Procedures](../AI/procedures/PROCEDURE.md)

---

**Last Updated**: 2025-10-27
