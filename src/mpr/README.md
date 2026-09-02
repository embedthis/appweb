Embedthis MPR -- Multithreaded Portable Runtime
===

The Multithreaded Portable Runtime (MPR) is a portable C runtime library for embedded applications. It provides the foundation layer for the [Appweb](https://www.embedthis.com/appweb/) embedded web server and other Embedthis products.

The MPR offers cross-platform abstractions for memory management, threading, events, I/O, networking, and cryptography. It includes a foundation of safe routines for secure programming that help prevent buffer overflows and other security threats. The MPR can be used in both C and C++ programs.

## Key Features

- **Garbage-collected memory** -- Fast coalescing allocator with generational garbage collection. No explicit `free()` calls required.
- **Thread pool with dispatchers** -- High-performance thread pool that shares threads across requests via serialized dispatcher queues.
- **Cross-platform I/O** -- Unified socket and file I/O with platform-optimized backends (kqueue, epoll, select).
- **TLS support** -- Pluggable TLS via OpenSSL (preferred) or MbedTLS.
- **Safe string handling** -- Buffer-safe string operations to prevent overflows.
- **JSON parsing** -- Built-in JSON parser and serializer.
- **Logging and diagnostics** -- Configurable logging subsystem.
- **Dynamic modules** -- Runtime loading of shared libraries.
- **Null-tolerant APIs** -- Most functions handle NULL arguments gracefully.

## Supported Platforms

- Linux (x64, ARM)
- macOS (x64, ARM)
- FreeBSD
- Windows
- VxWorks RTOS

## Building

### Prerequisites

- GCC, Clang, or Visual Studio C compiler
- GNU Make (or gmake)
- OpenSSL or MbedTLS for TLS support

### Quick Build

```bash
make
```

Build output is placed in the `build/bin/` directory.

### Build Options

```bash
make OPTIMIZE=release       # Release build (default: debug)
make SHOW=1                 # Display build commands
```

### Build Targets

| Target | Description |
|--------|-------------|
| `make build` | Build libmpr and test tools (default) |
| `make clean` | Remove build artifacts |
| `make test` | Run unit tests |
| `make doc` | Generate API documentation |
| `make format` | Format source code |
| `make package` | Build amalgamated mprLib.c source |
| `make help` | Show all targets and options |

### Project Files

Pre-generated project files are provided under `projects/` for:

- **gmake2** -- GNU Make (used by the top-level Makefile)
- **vs2022** -- Visual Studio 2022
- **xcode** -- Xcode

To regenerate project files (requires [Premake5](https://premake.github.io/)):

```bash
make projects
```

### Windows Build

Open the Visual Studio solution at `projects/vs2022/` or run the build script:

```bash
projects/windows.bat
```

## Testing

Unit tests use the [TestMe](https://www.embedthis.com/testme/) framework:

```bash
make test
```

Or run directly from the test directory:

```bash
cd test && tm
```

## Architecture

### Subsystems

| Subsystem | Source | Description |
|-----------|--------|-------------|
| Memory | mem.c | Garbage-collected allocator with generational collection |
| Threading | thread.c, lock.c, atomic.c | Thread pool, mutexes, atomic operations |
| Events | event.c, dispatcher.c | Event loop and dispatcher-based serialization |
| I/O | socket.c, file.c, disk.c | Network sockets and file system abstraction |
| Paths | path.c | Cross-platform path manipulation |
| Strings | string.c, wide.c | Safe string operations and wide character support |
| Buffers | buf.c | Dynamic buffer management |
| Commands | cmd.c | Child process execution |
| JSON | json.c | JSON parsing and serialization |
| Crypto | crypt.c | Hashing, encoding, password management |
| SSL/TLS | openssl.c, mbedtls.c | TLS via OpenSSL or MbedTLS |
| Logging | log.c | Configurable logging subsystem |
| Signals | signal.c | Cross-platform signal handling |
| XML | xml.c | XML parsing |
| Cache | cache.c | In-memory key-value cache |
| Modules | module.c | Dynamic module loading |

### Threading Model

The MPR uses a dispatcher-based concurrency model:

1. Incoming requests are assigned a **dispatcher** (event queue).
2. Each dispatcher serializes all activity for its request, providing single-threaded execution semantics.
3. Threads are borrowed from a **thread pool** to service dispatchers and returned when work completes.

This model provides thread safety without pervasive locking, as most code runs within serialized dispatchers. Non-MPR threads must synchronize via `mprCreateEvent()`.

### Memory Management

The MPR garbage collector provides automatic memory management:

- Fast immediate-coalescing allocator optimized for small blocks (< 4K).
- Generational garbage collection reclaims unreferenced objects.
- Returns memory to the OS when no longer needed.
- All allocations use the `mprAlloc()` family of functions.

## API

All public APIs are declared in the single header [src/mpr.h](src/mpr.h). Functions follow the `mpr*` naming convention:

- `mprCreate*` / `mprDestroy*` -- Object lifecycle
- `mprGet*` / `mprSet*` -- Property access
- `mprAdd*` / `mprRemove*` -- Collection operations

## Documentation

- [Appweb Documentation](https://www.embedthis.com/appweb/doc/) (includes MPR API reference)
- Local API docs: `doc/api/`

## Licensing

See [LICENSE.md](LICENSE.md) for details.

## Resources

- [Embedthis Website](https://www.embedthis.com/)
- [Appweb Documentation](https://www.embedthis.com/appweb/doc/)
- [MakeMe Build Tool](https://www.embedthis.com/makeme/)
- [TestMe Test Framework](https://www.embedthis.com/testme/)
