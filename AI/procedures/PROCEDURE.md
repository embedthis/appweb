# Appweb Development Procedures

## Overview

This document outlines standard procedures for working with the Appweb embedded web server. Appweb is in maintenance mode, so procedures focus on testing, bug fixes, security updates, and documentation maintenance.

---

## Table of Contents

1. [Build Procedures](#build-procedures)
2. [Testing Procedures](#testing-procedures)
3. [Debugging Procedures](#debugging-procedures)
4. [Documentation Procedures](#documentation-procedures)
5. [Security Procedures](#security-procedures)
6. [Release Procedures](#release-procedures)
7. [Git Procedures](#git-procedures)

---

## Build Procedures

### Standard Build

```bash
# From project root
make                          # Build with defaults
make SHOW=1                   # Show build commands
make OPTIMIZE=debug           # Debug build
make OPTIMIZE=release         # Release build
```

### Component-Specific Builds

```bash
# Enable specific components
ME_COM_ESP=1 ME_COM_CGI=1 make

# Select TLS backend
ME_COM_OPENSSL=1 ME_COM_MBEDTLS=0 make

# Specify OpenSSL path if needed
ME_COM_OPENSSL_PATH=/usr/local/opt/openssl make
```

### Clean Build

```bash
make clean                    # Clean build artifacts
make clean ; make             # Full rebuild
```

### IDE Builds

**Visual Studio (Windows)**:

1. Open `projects/appweb-windows-default.sln`
2. Set appweb project as startup project
3. Configure debugging:
   - Working directory: `$(ProjectDir)\..\..\test`
   - Arguments: `-v`
4. Build → Solution

**Xcode (macOS)**:

1. Open `projects/appweb-macosx-default.xcodeproj`
2. Edit Scheme → Build: Select all targets
3. Edit Scheme → Run/Debug:
   - Executable: appweb
   - Arguments: `-v`
   - Working directory: Absolute path to `./test`
4. Product → Build

---

## Testing Procedures

### Running All Tests

```bash
# From project root
make test

# Alternative: Direct TestMe invocation
cd test
tm                           # Run all tests
```

### Running Specific Tests

```bash
cd test

# Run tests matching a pattern
tm basic/*                   # All basic tests
tm auth/basic.tst.ts        # Specific test file
tm cgi/                     # All CGI tests

# Run with increased load (depth)
tm --depth 2                # Stress testing
```

### Running Test Suites

```bash
cd test

# By test category
tm aa-first/                # Initialization tests first
tm auth/                    # Authentication tests
tm esp/caching/             # ESP caching tests
tm security/                # Security tests
tm stress/                  # Stress tests
```

### Test Configuration

Edit `test/testme.json5`:

```json5
{
    name: 'appweb',
    workers: 2,              // Parallel test workers
    timeout: 300000,         // Test timeout (ms)
    depth: 1,               // Test iteration depth
}
```

### Debugging Failing Tests

```bash
cd test

# Run with verbose output
tm -v test-name

# Run single test without parallel execution
tm --workers 1 test-name

# Check test output
cat test/.testme/test-name.log
```

### Test Development Guidelines

1. **Test Naming**: Use unique names (avoid conflicts with parent/sibling dirs)
2. **Parallel Safety**: Tests must run safely in parallel
3. **File Creation**: Use `getpid()` for unique filenames
4. **Portability**: Tests must run on Linux, macOS, Windows
5. **Test Type Selection**:
   - C tests (`.tst.c`): Low-level, performance-critical code
   - Shell tests (`.tst.sh`): Simple command execution
   - TypeScript tests (`.tst.ts`): HTTP protocol, handlers, framework

---

## Debugging Procedures

### Enable Verbose Logging

**Command Line**:

```bash
cd test
./appweb -v                 # Verbose mode
./appweb --log trace:6      # Maximum trace level
```

**Configuration** (`appweb.conf`):

```apache
ErrorLog error.log level=5   # Debug level
TraceLog trace.log level=6   # Detailed trace
Trace debug=1 error=1 request=3 detail=6
```

### Debugging with GDB/LLDB

```bash
# Build debug version
make OPTIMIZE=debug

# macOS
cd test
lldb ../build/macosx-x64-debug/bin/appweb
(lldb) settings set target.run-args -v
(lldb) b httpProcessRequest
(lldb) run

# Linux
cd test
gdb --args ../build/linux-x64-debug/bin/appweb -v
(gdb) break httpProcessRequest
(gdb) run
```

### Common Debugging Breakpoints

```
httpProcessRequest          # Request entry point
httpRouteRequest           # Route matching
maParseConfig              # Configuration parsing
mprCreateEvent             # Event creation
httpError                  # Error handling
```

### Memory Debugging

Enable MPR memory checking in `main.me`:

```javascript
mpr: {
    alloc: {
        check: true,        # Enable allocation checking
    }
}
```

### Valgrind Testing

```bash
cd test
valgrind --leak-check=full --track-origins=yes ../build/*/bin/appweb -v
```

### Trace Specific Subsystems

```apache
# In appweb.conf
Trace rx=4 tx=4 conn=3 request=3 detail=6
```

**Trace Levels**:
- 0: Off
- 1: Errors
- 2: Warnings
- 3: Info (request summaries)
- 4: Debug
- 5: Detailed debug
- 6: Full trace

---

## Documentation Procedures

### Generating API Documentation

```bash
make doc
open doc/index.html         # macOS
xdg-open doc/index.html     # Linux
```

### Documentation Standards

1. **API Documentation**: All public APIs in headers must be fully documented
2. **Format**: Doxygen-compatible comments
3. **Avoid**:
   - `@return Void` (just omit)
   - `@defgroup` (not used in this project)

**Example**:

```c
/**
    Process an HTTP request
    @param stream The HTTP stream object
    @return Zero if successful, otherwise a negative error code
 */
PUBLIC int httpProcessRequest(HttpStream *stream);
```

### Update Documentation After Changes

1. Update inline API documentation in headers
2. Update DESIGN.md if architecture changes
3. Update PLAN.md if priorities change
4. Update PROCEDURE.md if workflows change
5. Run `make doc` to verify documentation builds
6. Update CHANGELOG.md with user-facing changes

### Documentation Files to Maintain

- `README.md` - Project overview and quick start
- `CLAUDE.md` - AI/developer guidance
- `doc/DESIGN.md` - Architecture and implementation
- `doc/CHANGELOG.md` - User-facing change log
- `AI/designs/DESIGN.md` - Copy of design doc
- `AI/plans/PLAN.md` - Current project plan
- `AI/procedures/PROCEDURE.md` - This file
- `AI/references/REFERENCES.md` - External references

---

### Acceptable Security Trade-offs

Code marked with `SECURITY Acceptable:` indicates intentional design decisions:

- Memory allocation failures handled globally (not checked per-call)
- Debug builds may log sensitive data via `mprLog()`
- Test apps may use HTTP for self-signed cert development
- MD5 support for legacy Digest auth (not general crypto)
- API inputs validated by experienced developers (not double-checked)

---

## Index of Related Procedures

None currently (single procedure document for maintenance mode).

---

## Revision History

- **2024-10**: Initial procedure document for AI/Claude Code documentation structure
