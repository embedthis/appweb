# Appweb Context

## Current Work Context

This document provides context for ongoing work and helps resume interrupted tasks.

---

## Project State (2025-10-27)

### Maintenance Mode Status

Appweb is in **maintenance mode**:
- ✓ Security updates ongoing
- ✓ Bug fixes for critical issues
- ✗ No new features planned
- ✓ Test suite stable and comprehensive
- ✓ Documentation comprehensive

### Recent Completed Work

1. **Test Suite Modernization**
   - Converted 150+ legacy Ejscript (.es) tests to TypeScript (.ts)
   - All test categories updated
   - Test infrastructure working correctly with TestMe and Bun
   - See `AI/logs/CONVERSION_SUMMARY.md` for detailed conversion notes

2. **Documentation Structure**
   - Created AI/ directory structure
   - Populated core documentation:
     - DESIGN.md (comprehensive architecture)
     - PLAN.md (project plan and status)
     - PROCEDURE.md (development procedures)
     - CHANGELOG.md (change history)
     - REFERENCES.md (external resources)
     - CONTEXT.md (this file)

---

## Architecture Overview

### Core Components

Appweb uses a **layered architecture** different from modern Ioto modules:

```
┌─────────────────────────────────────────┐
│     Handler Modules (CGI, ESP, etc.)    │
├─────────────────────────────────────────┤
│     HTTP Protocol Stack (libhttp)       │
│   HTTP/1.0, HTTP/1.1, HTTP/2, WebSockets│
├─────────────────────────────────────────┤
│     ESP Framework (libesp) - Optional   │
├─────────────────────────────────────────┤
│     MPR Runtime (libmpr) with GC        │
├─────────────────────────────────────────┤
│     Platform Abstraction (osdep)        │
└─────────────────────────────────────────┘
```

### Key Differences from Modern Modules

- **Multi-threaded** (not single-threaded with fibers)
- **Garbage collection** (not manual memory management)
- **MPR runtime** (not safe runtime `r/`)
- Does NOT use: `r`, `json`, `crypt`, `uctx`, `web`, `url`, `mqtt`, `websockets`, `openai`

---

## Development Environment

### Prerequisites

- C compiler (GCC, Clang, MSVC)
- OpenSSL or MbedTLS
- Make/GNU Make
- TestMe + Bun (for testing)
- Bash (Git for Windows on Windows)

### Build Commands

```bash
make                      # Standard build
make OPTIMIZE=debug       # Debug build
make test                # Run test suite
make doc                 # Generate documentation
```

---

## Test Suite Structure

### Test Organization

```
test/
├── auth/            - Authentication (Basic, Digest, Form, Blowfish)
├── basic/           - Core HTTP functionality
├── benchmark/       - Performance tests
├── cgi/             - CGI handler tests
├── cmd/             - Command-line tests
├── compress/        - Compression tests
├── conn/            - Connection management
├── error/           - Error handling
├── esp/             - ESP framework tests
│   ├── caching/     - ESP caching (12+ tests)
│   ├── chat/        - WebSocket chat
│   ├── session/     - Session management
│   ├── solo/        - Standalone ESP
│   └── websockets/  - WebSocket protocol (10+ tests)
├── fast/            - FastCGI handler
├── ipv6/            - IPv6 support
├── lang/            - Localization
├── leak/            - Memory leak detection (Valgrind)
├── listing/         - Directory listings
├── monitor/         - Security monitoring
├── proxy/           - Proxy handler
├── range/           - HTTP range requests
├── redirect/        - Redirects
├── regress/         - Regression tests
├── route/           - Routing engine
├── security/        - Security features
├── ssl/             - SSL/TLS
└── stress/          - Load/stress tests
```

### Test Configuration

- Main config: `test/testme.json5`
- Server config: `test/appweb.conf` (full-featured development config)
- Auth config: `test/auth.conf` (authentication testing)

---

## Component Status

### Enabled by Default

- File handler (static files)
- HTTP/1.0, HTTP/1.1, HTTP/2
- WebSockets
- Authentication (Basic, Digest, Form)
- Defense mechanisms (DoS protection)

### Optional Components (Build-Time)

- `ME_COM_CGI=1` - CGI handler
- `ME_COM_ESP=1` - ESP framework
- `ME_COM_FAST=1` - FastCGI handler
- `ME_COM_PROXY=1` - Proxy handler
- `ME_COM_SQLITE=1` - SQLite database
- `ME_COM_OPENSSL=1` - OpenSSL (preferred over MbedTLS)

---

## Known Issues and Considerations

### Test Execution

- Tests run in parallel (workers=2 by default)
- Some tests may require sequential execution
- Directory `test/.testme/` contains build artifacts
- Test cache directory: `test/cache/` (used by ESP caching tests)

### Platform-Specific

- **Windows**: Use `make.bat` which chains to `projects/windows.bat`
- **macOS**: Use Xcode project or command-line make
- **Linux**: Standard make works directly

### Security Acceptable Trade-offs

Code marked `SECURITY Acceptable:` documents intentional design:
- Memory allocation failures handled globally
- Debug builds may log sensitive data
- Test apps use HTTP (not HTTPS) for development
- MD5 for legacy Digest auth only
- API input validation delegated to developers

---

## File Locations

### Configuration Files

- Production minimal: `src/server/appweb.conf`
- Development full: `test/appweb.conf`
- Build config: `main.me`

### Documentation

- User docs: `doc/` (generated)
- AI docs: `AI/` (this structure)
- Design: `AI/designs/DESIGN.md`
- Plan: `AI/plans/PLAN.md`
- Procedures: `AI/procedures/PROCEDURE.md`
- References: `AI/references/REFERENCES.md`
- Changelog: `AI/logs/CHANGELOG.md`

### Source Code

- MPR runtime: `src/mpr/`
- HTTP stack: `src/http/`
- ESP framework: `src/esp/`
- Handler modules: `src/modules/`
- Server application: `src/server/`
- Platform abstraction: `src/osdep/`
- Third-party: `src/pcre/`, `src/sqlite/`, `src/ssl/`

---

## Common Tasks

### Running Tests

```bash
cd test
tm                        # All tests
tm auth/                  # Authentication tests
tm esp/caching/           # ESP caching tests
tm --depth 2              # Stress testing
```

### Debugging

```bash
# Verbose server
cd test
../build/*/bin/appweb -v

# With debugger (macOS)
lldb ../build/macosx-x64-debug/bin/appweb
```

### Documentation

```bash
make doc                  # Generate API docs
open doc/index.html       # View docs (macOS)
```

### Building Specific Configurations

```bash
ME_COM_ESP=1 ME_COM_CGI=1 make        # Enable components
ME_COM_OPENSSL=1 make                  # Use OpenSSL
make OPTIMIZE=release                  # Production build
```

---

## Migration Path

For new projects, consider **Ioto Device Agent**:
- Website: https://www.embedthis.com/ioto/
- Modern architecture with fibers
- Integrated IoT cloud management
- Active development
- Contact: support@embedthis.com

---

## Revision History

- **2025-10-27**: Initial context document created for AI/Claude Code documentation structure
