# Appweb Embedded Web Server

Embedthis Appweb is a compact, fast embedded web server supporting HTTP/1 and
HTTP/2. This is a **legacy module** that is maintained but not under active
development.

## Architecture Differences from Modern Modules

Appweb differs significantly from the modern Ioto modules (see `../CLAUDE.md`
for overall architecture):

### Core Components
- **MPR (Multi-Purpose Runtime)**: Foundation layer (`src/mpr/`) with **garbage
collection**
- **HTTP Protocol Stack**: HTTP/1 and HTTP/2 implementation (`src/http/`)
- **ESP (Embedded Server Pages)**: Web framework for dynamic content
(`src/esp/`)
- **Handler Modules**: CGI, FastCGI, ESP, and proxy functionality
(`src/modules/`)

### Library Dependencies
```
libappweb (top level)
├── libesp
├── libhttp
└── libmpr (foundation)
```

### Key Differences
- **Multi-threaded** (vs single-threaded modern modules)
- **Garbage collection** (vs manual memory management)
- **MPR runtime** (vs safe runtime `r/`)
- Does **not** use modern modules: `r`, `json`, `crypt`, `uctx`, `web`, `url`,
`mqtt`, `websockets`, `openai`

## Appweb-Specific Build Options

Beyond the standard build commands in `../CLAUDE.md`, Appweb supports:

```bash
# Component toggles
ME_COM_CGI=0 make              # Disable CGI handler
ME_COM_ESP=1 make              # Enable ESP framework
ME_COM_OPENSSL=1 make          # Use OpenSSL (vs MbedTLS)
ME_COM_SQLITE=1 make           # Enable SQLite database

# OpenSSL path when needed
ME_COM_OPENSSL_PATH=/path/to/openssl make

# Legacy debug flag (use OPTIMIZE=debug for consistency)
DEBUG=debug make
```

## Configuration Files

- **`main.me`** - Primary MakeMe build configuration
- **`appweb.conf`** - Runtime server configuration
- **`src/server/appweb.conf`** - Minimal production config
- **`test/appweb.conf`** - Full-featured development config

## Development Workflow

### Environment Setup
- **Production**: Use `src/server/` with minimal config
- **Development**: Use `test/` with full-featured config

### Adding Handler Modules
1. Create handler: `src/modules/yourHandler.c`
2. Register in `main.me` configuration
3. Initialize handler in module startup
4. Add unit tests in `test/`

### Logging and Debugging
- Use **`mprLog()`** for application logging (MPR-specific, not `rDebug()`)
- Configure log levels in `appweb.conf`
- Access request context via MPR threading model

### Testing Specifics
```bash
# Load/stress testing
cd test && testme --depth 2

# Standard unit tests (see ../CLAUDE.md for general testing)
make test
```

## Pre-generated IDE Projects

Available in `projects/` directory:
- `appweb-OS-PROFILE.mk` - Make/NMake files
- `appweb-OS-PROFILE.sln` - Visual Studio solutions
- `appweb-OS-PROFILE.xcodeproj` - Xcode projects

## MPR-Specific Conventions

- Use **MPR memory functions** (not `r/` runtime functions)
- Leverage **garbage collection** - objects auto-freed when unreferenced
- Use **MPR threading primitives** for multi-threaded operation
- Follow **`mpr*` naming conventions** for MPR-based code

## Resources

- **Parent documentation**: `../CLAUDE.md` for general build/test procedures
- **Sub-project guides**: `src/*/CLAUDE.md` for component-specific instructions
- **API documentation**: `doc/index.html` (generate with `make doc`)
- When doing security scans, ignore the ESP module
