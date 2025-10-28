# Appweb Embedded Web Server - Design Document

## Executive Summary

Embedthis Appweb is a compact, fast, and secure embedded web server supporting HTTP/1.0, HTTP/1.1, and HTTP/2 protocols. As a **legacy module in maintenance mode**, it remains actively supported with security updates but no new feature development. Appweb is designed for embedded applications, IoT devices, and resource-constrained environments where a full-featured, production-ready web server is required.

**Key Characteristics:**
- **Compact Footprint**: 1-4MB memory footprint optimized for embedded systems
- **Event-Driven Architecture**: Multi-threaded with garbage collection for exceptional throughput
- **Protocol Support**: HTTP/1.0, HTTP/1.1, HTTP/2, and WebSocket protocols
- **Modular Design**: Extensible handler system with loadable modules
- **Comprehensive Security**: Defensive countermeasures, sandboxing, authentication, SSL/TLS
- **Cross-Platform**: Linux, macOS, Windows/WSL, VxWorks, ESP32, FreeRTOS
- **Dual Configuration**: Config-file driven or programmatic API

**Deployment Profile:**
- Widely deployed in networking equipment, telephony systems, mobile devices
- Suitable for enterprise web applications and embedded systems
- Optimized for hosting dynamic embedded web applications

## 1. Architecture Overview

### 1.1 High-Level Architecture

Appweb is built on a layered architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────┐
│                    Applications                         │
│          (CGI, FastCGI, ESP, PHP, Proxy)               │
├─────────────────────────────────────────────────────────┤
│                  Handler Modules                        │
│     (cgiHandler, fastHandler, espHandler, etc.)        │
├─────────────────────────────────────────────────────────┤
│              HTTP Protocol Stack (libhttp)              │
│   (HTTP/1.0, HTTP/1.1, HTTP/2, WebSockets)            │
├─────────────────────────────────────────────────────────┤
│         ESP Web Framework (libesp) - Optional           │
│   (MVC, Database EDI, Templating, Session Mgmt)        │
├─────────────────────────────────────────────────────────┤
│      Multi-Purpose Runtime (MPR) - libmpr               │
│   (GC, Threading, Events, I/O, Memory, SSL/TLS)        │
├─────────────────────────────────────────────────────────┤
│            OS Abstraction Layer (osdep)                 │
└─────────────────────────────────────────────────────────┘
```

### 1.2 Library Dependencies

The core library structure follows this dependency hierarchy:

```
libappweb (top-level integration)
│
├── libesp (optional ESP web framework)
│   └── libhttp
│       └── libmpr
│
├── libhttp (HTTP protocol implementation)
│   └── libmpr
│
└── libmpr (foundation runtime with GC)
    └── osdep (platform abstraction)
```

### 1.3 Key Architectural Differences from Modern Ioto Modules

Appweb represents a different architectural generation compared to modern Ioto modules:

| Aspect | Appweb (Legacy) | Modern Ioto Modules |
|--------|-----------------|---------------------|
| **Threading Model** | Multi-threaded with thread pools | Single-threaded with fiber coroutines |
| **Memory Management** | Garbage collection (GC) | Manual memory management |
| **Runtime Foundation** | MPR (Multi-Purpose Runtime) | Safe Runtime (`r/`) |
| **Module Integration** | Does NOT use: `r`, `json`, `crypt`, `uctx`, `web`, `url`, `mqtt`, `websockets`, `openai` | Tight integration with modern modules |
| **Concurrency** | Thread-pool with dispatcher pattern | Fiber-based cooperative multitasking |

## 2. Core Components

### 2.1 MPR - Multi-Purpose Runtime (Foundation Layer)

The MPR (`src/mpr/`) provides the foundation for all Appweb functionality:

#### 2.1.1 Memory Management
- **Generational Garbage Collector**: Automatic memory reclamation when objects become unreferenced
- **Fast Coalescing Allocator**: Optimized for frequent small allocations (<4K)
- **Free Queue System**: Quick allocation/deallocation using size-specific queues
- **Memory Quotas**: Configurable memory limits with GC triggers
- **Memory Debugging**: Optional allocation tracking and statistics (ME_MPR_ALLOC_CHECK)

**Configuration (main.me):**
```javascript
mpr: {
    alloc: {
        quota: 204800,    // Memory to allocate before GC trigger
        cache: 0,         // Buffer for quick allocations
        check: false,     // Enable allocation debug (slow)
    }
}
```

#### 2.1.2 Threading and Concurrency
- **Thread Pool Architecture**: Configurable worker threads shared across requests
- **Dispatcher Pattern**: Each request gets an event queue (dispatcher) for serialization
- **Thread Limiting**: Automatically limits threads based on CPU cores (threadLimitByCores)
- **Lock Management**: Mutex primitives with deadlock detection (debug builds)
- **Event-Driven I/O**: Non-blocking I/O with platform-specific event mechanisms

**Event Notifiers by Platform:**
- macOS/Solaris: `kqueue` (MPR_EVENT_KQUEUE)
- Linux 2.6+: `epoll` (MPR_EVENT_EPOLL)
- Windows: Async select (MPR_EVENT_ASYNC)
- VxWorks: Traditional select (MPR_EVENT_SELECT)

#### 2.1.3 Core MPR Services
- **File System**: Virtual file system with ROM support
- **Socket Layer**: Async sockets with SSL/TLS integration
- **Command Execution**: Process management for CGI/FastCGI
- **Logging**: Hierarchical logging with configurable levels
- **JSON/XML Parsing**: Data serialization support
- **String Functions**: Safe string operations preventing buffer overflows
- **Date/Time**: Cross-platform time handling

### 2.2 HTTP Protocol Stack (libhttp)

The HTTP library (`src/http/`) implements complete HTTP protocol support:

#### 2.2.1 Protocol Support
- **HTTP/1.0**: Legacy HTTP support
- **HTTP/1.1**: Full HTTP/1.1 with persistent connections, chunked encoding, pipelining
- **HTTP/2**: Binary framing, multiplexing, header compression (HPACK), server push
- **WebSockets**: Bidirectional communication with frame-based messaging

#### 2.2.2 Request/Response Pipeline

The HTTP pipeline uses a stage-based architecture for processing:

```
Client → [Network] → [Input Filters] → [Handler] → [Output Filters] → [Network] → Client
```

**Pipeline Stages:**
1. **Input Filters**: Request processing (decompression, upload handling, authentication)
2. **Router**: Route matching and request routing
3. **Handler**: Content generation (file, CGI, ESP, FastCGI, proxy)
4. **Output Filters**: Response processing (compression, chunking, range support)

**Key Pipeline Components:**
- `HttpQueue`: Bidirectional packet queues for data flow
- `HttpPacket`: Data containers with headers and content
- `HttpStage`: Processing stages (filters and handlers)
- `HttpNet`: Network connection management
- `HttpStream`: Request/response stream (HTTP/2) or connection (HTTP/1)

#### 2.2.3 Routing System

The routing engine provides flexible request mapping:

```c
typedef struct HttpRoute {
    char         *pattern;        // URI pattern (regex)
    char         *prefix;         // URI prefix
    char         *target;         // Target action
    HttpAuth     *auth;           // Authentication config
    MprHash      *handlers;       // Handler mapping
    MprHash      *headers;        // Required headers
    MprHash      *params;         // Route parameters
    int          flags;           // Route flags
} HttpRoute;
```

**Route Matching:**
- Pattern-based matching using PCRE regular expressions
- Condition evaluation (headers, params, methods)
- Target resolution (run, redirect, write)
- Update actions (set headers, params, language)

**Configuration Example (appweb.conf):**
```apache
<Route ^/api/>
    Prefix              /api
    SetHandler          espHandler
    Require             valid-user
    Header              set Cache-Control no-cache
</Route>
```

#### 2.2.4 Authentication and Authorization

Multi-mechanism authentication system:

**Supported Authentication Types:**
- **Basic Authentication** (ME_HTTP_BASIC): Username/password with Base64 encoding
- **Digest Authentication** (ME_HTTP_DIGEST): Challenge-response with MD5 hashing
- **PAM Authentication** (ME_HTTP_PAM): Pluggable Authentication Modules (Unix)
- **Form Authentication**: HTML form-based login
- **Custom**: Extensible authentication callbacks

**Authorization Model:**
```c
typedef struct HttpAuth {
    char         *type;           // Auth type (basic, digest, form)
    char         *realm;          // Authentication realm
    MprHash      *users;          // User database
    MprHash      *roles;          // Role definitions
    char         *store;          // Backend store (config, system)
    int          flags;           // Auth flags
} HttpAuth;
```

**User/Role Schema:**
```
User name password abilities...
Role name abilities...
```

#### 2.2.5 Security and Defense Mechanisms

**Defense Features (ME_HTTP_DEFENSE):**
- **DoS Protection**: Request rate limiting per client IP
- **IP Monitoring**: Track and ban abusive clients
- **Delay Enforcement**: Slow down suspicious clients (2-second delay)
- **Remedy Actions**: Execute custom commands on security events
- **Stealth Mode**: Minimize information disclosure

**Security Limits (Configurable via main.me and appweb.conf):**
```c
#define ME_MAX_CONNECTIONS              50    // Total concurrent connections
#define ME_MAX_CONNECTIONS_PER_CLIENT   20    // Per-client limit
#define ME_MAX_REQUESTS_PER_CLIENT      200   // Request limit per client
#define ME_MAX_CLIENTS                  32    // Unique client IPs
#define ME_MAX_RX_BODY                  512K  // Max request body
#define ME_MAX_UPLOAD                   UNLIMITED // Max file upload
#define ME_MAX_URI                      512   // Max URI length
#define ME_MAX_HEADERS                  512K  // Max header size
```

**TLS/SSL Support:**
- OpenSSL and MbedTLS backends (OpenSSL strongly preferred)
- Session caching and ticket-based resumption
- Configurable cipher suites and protocols
- Client certificate validation

**Configuration (main.me):**
```javascript
mpr: {
    ssl: {
        cache: 512,          // Session cache size (items)
        logLevel: 6,         // SSL logging level
        handshakes: 3,       // Max renegotiations
        ticket: true,        // Session ticket resumption
        timeout: 86400,      // Session duration (seconds)
    }
}
```

### 2.3 ESP - Embedded Server Pages (libesp)

ESP (`src/esp/`) is a complete MVC web framework for dynamic applications:

#### 2.3.1 Framework Architecture

```
┌─────────────────────────────────────────┐
│         ESP Application Layer           │
│  (Controllers, Views, Models, Routes)   │
├─────────────────────────────────────────┤
│         EDI - Database Interface        │
│      (SQLite/SDB, Memory/MDB)          │
├─────────────────────────────────────────┤
│         ESP Runtime & Templates         │
│   (Compilation, Caching, Session)      │
├─────────────────────────────────────────┤
│            HTTP Stack (libhttp)         │
└─────────────────────────────────────────┘
```

#### 2.3.2 EDI - Embedded Database Interface

Abstraction layer supporting multiple database backends:

**Supported Databases:**
- **MDB**: In-memory database (fast, volatile)
- **SDB**: SQLite database (persistent, SQL)

**EDI API:**
```c
typedef struct EdiRec {
    struct Edi    *edi;           // Database handle
    MprHash       *errors;        // Validation errors
    cchar         *tableName;     // Table name
    cchar         *id;            // Record ID
    int           nfields;        // Field count
    EdiField      fields[];       // Field data
} EdiRec;

// Core operations
EdiRec  *ediReadRec(Edi *edi, cchar *tableName, cchar *key);
int      ediUpdateRec(Edi *edi, EdiRec *rec);
int      ediDeleteRec(Edi *edi, cchar *tableName, cchar *key);
EdiGrid *ediReadTable(Edi *edi, cchar *tableName);
```

**Data Types:**
- `EDI_TYPE_BINARY`: Arbitrary binary data
- `EDI_TYPE_BOOL`: Boolean values
- `EDI_TYPE_DATE`: Date/time (stored as epoch)
- `EDI_TYPE_FLOAT`: Floating-point numbers
- `EDI_TYPE_INT`: Integer numbers
- `EDI_TYPE_STRING`: String data
- `EDI_TYPE_TEXT`: Multi-line text

#### 2.3.3 MVC Components

**Models:**
- Database record representation
- Field validation
- Business logic encapsulation

**Views:**
- ESP templating engine
- Server-side rendering
- Layout support

**Controllers:**
- Request handling
- Action routing
- Response generation

### 2.4 Handler Modules

Appweb uses pluggable handlers for different content types:

#### 2.4.1 File Handler (Built-in)
- Static file serving
- MIME type detection
- Range request support
- Directory listings (with DIR_MODULE)
- Conditional requests (ETag, If-Modified-Since)

#### 2.4.2 CGI Handler (ME_COM_CGI)
**Implementation:** `src/modules/cgiHandler.c` (~26K lines)

**Features:**
- CGI/1.1 standard compliance
- Async-pipe communication
- Non-blocking I/O
- Environment variable construction
- POST data handling
- Header parsing (Location, Status, Content-Type)

**Process Flow:**
```
1. Fork/Execute CGI program
2. Build CGI environment (QUERY_STRING, PATH_INFO, etc.)
3. Stream request body → CGI stdin
4. Parse CGI stdout → HTTP response headers + body
5. Monitor process completion
6. Stream response → client
```

#### 2.4.3 FastCGI Handler (ME_COM_FAST)
**Implementation:** `src/modules/fastHandler.c` (~60K lines)

**Features:**
- FastCGI protocol implementation
- Connection pooling to FastCGI servers
- Keep-alive connections
- Multiplexing multiple requests
- Load balancing and failover

**Advantages over CGI:**
- Persistent processes (no fork overhead)
- Connection reuse
- Better performance for dynamic content

#### 2.4.4 ESP Handler (ME_COM_ESP)
**Implementation:** `src/modules/espHandler.c` (~2.7K lines)

**Features:**
- ESP application loading
- Template compilation and caching
- Route integration
- Session management
- Database integration via EDI

#### 2.4.5 Proxy Handler (ME_COM_PROXY)
**Implementation:** `src/modules/proxyHandler.c` (~44K lines)

**Features:**
- Reverse proxy functionality
- Load balancing across backends
- Health monitoring
- Failover support
- Header manipulation

#### 2.4.6 Test Handler (ME_COM_TEST)
**Implementation:** `src/modules/testHandler.c` + `testWebSocketsHandler.c`

**Purpose:**
- Development and testing utilities
- WebSocket testing support
- Should be disabled in production builds

### 2.5 Configuration System

Appweb provides a powerful configuration file parser with directive-based syntax:

#### 2.5.1 Configuration Architecture

```c
typedef struct MaState {
    HttpHost   *host;           // Current virtual host
    HttpAuth   *auth;           // Authentication config
    HttpRoute  *route;          // Current route
    MprFile    *file;           // Config file handle
    char       *key;            // Current directive
    char       *configDir;      // Config directory
    char       *filename;       // Config file path
    int        lineNumber;      // Current line
    int        enabled;         // Block enabled flag
    int        flags;           // Parse flags
    struct MaState *prev;       // Previous state
    struct MaState *top;        // Top-level state
} MaState;
```

#### 2.5.2 Directive Processing

**Directive Callback:**
```c
typedef int (MaDirective)(MaState *state, cchar *key, cchar *value);

// Register custom directive
maAddDirective("CustomDirective", customDirectiveCallback);
```

**State Management:**
- `maPushState()`: Enter nested block (Route, VirtualHost, Directory)
- `maPopState()`: Exit nested block, restore previous state
- State inheritance for nested configurations

#### 2.5.3 Common Directives

**Server Configuration:**
- `Listen`: Bind address and port
- `ServerRoot`: Base directory
- `Documents`: Document root
- `ErrorLog` / `TraceLog`: Logging configuration
- `LoadModule`: Load handler modules

**Virtual Hosting:**
```apache
<VirtualHost *:80>
    ServerName example.com
    Documents /var/www/example
</VirtualHost>
```

**Routing:**
```apache
<Route ^/api/>
    Prefix /api
    SetHandler espHandler
    Target run request
</Route>
```

**Limits and Tuning:**
```apache
LimitMemory           64MB
LimitConnections      100
LimitRequestBody      10MB
LimitWorkers          4
RequestTimeout        30secs
```

**Security:**
```apache
<Directory /admin>
    AuthType basic
    AuthName "Administration"
    Require valid-user
</Directory>
```

#### 2.5.4 Tokenization and Parsing

The `maTokenize()` function provides powerful directive parsing:

**Format Specifiers:**
- `%B`: Boolean (on/off, true/false, yes/no)
- `%N`: Number (base 10)
- `%S`: String (removes quotes)
- `%P`: Path (removes quotes, expands ${PathVars})
- `%W`: Word list
- `%!`: Optional negate flag

**Example:**
```c
bool enabled;
char *path;
int count;

maTokenize(state, value, "%B %P %N", &enabled, &path, &count);
```

## 3. Build System and Configuration

### 3.1 MakeMe Build System

Appweb uses the MakeMe build system defined in `main.me`:

#### 3.1.1 Build Configuration

**Component Discovery and Requirements:**
```javascript
configure: {
    requires:  [ 'osdep', 'http', 'mpr', 'pcre' ],  // Required components
    discovers: [ 'ssl', 'watchdog', 'esp', 'mdb' ], // Auto-discovered
    extras:    [ 'cgi', 'dir', 'ejs', 'fast', 'php', 'proxy', 'sqlite' ],
}
```

**Build Tuning:**
```javascript
settings: {
    tune: 'size',  // Optimization: size | balanced | speed

    compiler: {
        fortify: true,  // Enable fortify source
    },

    platforms: [ 'local' ],  // Build for local platform
}
```

#### 3.1.2 Component Control

**Build-Time Toggles (ME_COM_*):**
```bash
# Enable/disable components
ME_COM_CGI=1 make              # Enable CGI handler
ME_COM_ESP=1 make              # Enable ESP framework
ME_COM_OPENSSL=1 make          # Use OpenSSL
ME_COM_MBEDTLS=0 make          # Disable MbedTLS
ME_COM_SQLITE=1 make           # Enable SQLite
```

**Configuration Flags (appweb.h):**
```c
#define ME_COM_CGI          0/1  // CGI handler
#define ME_COM_ESP          0/1  // ESP framework
#define ME_COM_FAST         0/1  // FastCGI handler
#define ME_COM_PROXY        0/1  // Proxy handler
#define ME_COM_SSL          0/1  // SSL/TLS support
#define ME_COM_MDB          0/1  // Memory database
#define ME_COM_SDB          0/1  // SQLite database
```

#### 3.1.3 Build Targets

**Standard Targets:**
```bash
make                    # Build with default configuration
make SHOW=1             # Show build commands
make OPTIMIZE=debug     # Debug build
make OPTIMIZE=release   # Release build
make clean              # Clean build artifacts
make install            # Install to system
```

**Development Targets:**
```bash
make test               # Run test suite
make run                # Run server
make format             # Format source code
make doc                # Generate documentation
make projects           # Generate IDE project files
```

### 3.2 Cross-Platform Support

#### 3.2.1 Platform Abstraction

The `osdep` layer (`src/osdep/`) provides platform independence:

**Key Abstractions:**
- Type definitions (ssize, bool, etc.)
- File system operations
- Network primitives
- Threading primitives
- Time/date functions
- Atomic operations

**Platform-Specific Code:**
- `#if ME_UNIX_LIKE`: Unix/Linux/macOS
- `#if ME_WIN_LIKE`: Windows
- `#if VXWORKS`: VxWorks RTOS
- `#if FREERTOS`: FreeRTOS

#### 3.2.2 Supported Platforms

**Primary Platforms:**
- Linux (x64, ARM, ARM64)
- macOS (x64, ARM64/M1)
- Windows (x64 via WSL or native)
- FreeBSD (ARM, x64)
- VxWorks (ARM)

**Embedded Platforms:**
- ESP32
- FreeRTOS
- Custom embedded Linux

### 3.3 IDE Integration

Pre-generated project files in `projects/` directory:

**Available Formats:**
- `appweb-{OS}-{PROFILE}.mk`: Make/NMake files
- `appweb-{OS}-{PROFILE}.sln`: Visual Studio solutions
- `appweb-{OS}-{PROFILE}.xcodeproj`: Xcode projects

**Profiles:**
- `default`: Standard build configuration
- `mine`: Custom development configuration

## 4. Request Processing Flow

### 4.1 Complete Request Lifecycle

```
1. Network Connection
   ├─→ TCP/TLS handshake
   ├─→ HTTP protocol negotiation (HTTP/1.1 or HTTP/2)
   └─→ Create HttpNet and HttpStream objects

2. Request Parsing
   ├─→ Parse request line (method, URI, version)
   ├─→ Parse headers
   ├─→ Validate request format
   └─→ Apply security limits

3. Route Resolution
   ├─→ Match URI against route patterns
   ├─→ Evaluate route conditions
   ├─→ Apply route updates (headers, params)
   └─→ Determine handler

4. Authentication (if required)
   ├─→ Extract credentials
   ├─→ Validate against user store
   ├─→ Check authorization (roles/abilities)
   └─→ Generate auth challenge if needed

5. Request Body Processing
   ├─→ Read request body (if present)
   ├─→ Apply input filters (decompression, upload)
   └─→ Validate content length/type

6. Handler Processing
   ├─→ Invoke appropriate handler (file, CGI, ESP, etc.)
   ├─→ Generate response content
   └─→ Set response headers

7. Response Filtering
   ├─→ Apply output filters (compression, chunking)
   ├─→ Range request processing
   └─→ Cache header generation

8. Response Transmission
   ├─→ Send status line and headers
   ├─→ Stream response body
   └─→ Apply flow control

9. Connection Management
   ├─→ Keep-alive or close decision
   ├─→ Update connection counters
   └─→ Cleanup resources
```

### 4.2 Thread and Event Flow

**Request Processing with Dispatchers:**
```
1. Accept connection on main thread
2. Create HttpNet object
3. Assign dispatcher (event queue) for request
4. Borrow thread from thread pool
5. Process request on dispatcher thread (serialized)
6. Return thread to pool when blocked/complete
7. Repeat for next event on this dispatcher
```

**Key Principle:** Each request runs on a dispatcher that serializes all activity, eliminating most lock requirements while still leveraging multi-threading.

### 4.3 Error Handling

**Error Response Flow:**
```
1. Detect error condition
2. Call httpError(stream, statusCode, message)
3. Generate error document (if ShowErrors enabled)
4. Log error details
5. Update monitoring counters
6. Apply defense remedies (if enabled)
7. Send response to client
```

## 5. Security Architecture

### 5.1 Security Principles

**Design Philosophy:**
1. **Secure by Default**: Minimal attack surface in default configuration
2. **Defense in Depth**: Multiple security layers
3. **Least Privilege**: Minimal permissions required
4. **Fail Securely**: Safe defaults on error conditions

### 5.2 Security Features

#### 5.2.1 Input Validation and Limits

**Request Limits:**
- URI length limiting (ME_MAX_URI)
- Header size limits (ME_MAX_HEADERS)
- Body size limits (ME_MAX_RX_BODY)
- Parameter count limits
- Nested route depth limits (ME_MAX_REWRITE)

**Validation:**
- URI format validation
- Header format validation
- Content-Length validation
- Multipart form validation

#### 5.2.2 DoS Protection

**Rate Limiting:**
```c
LimitConnections            50    // Total connections
LimitConnectionsPerClient   20    // Per-client connections
LimitRequestsPerClient      200   // Requests per client
LimitStreams                100   // HTTP/2 streams per connection
```

**Defense Mechanisms:**
- Request rate monitoring per client IP
- Automatic IP banning (configurable duration)
- Request delay enforcement for suspicious clients
- Resource exhaustion prevention

#### 5.2.3 Authentication Security

**Password Security:**
- Digest authentication (challenge-response)
- Secure password hashing
- Nonce-based replay protection
- Session token management

**CSRF Protection:**
```c
#define ME_XSRF_COOKIE    "XSRF-TOKEN"     // CSRF token cookie
#define ME_XSRF_HEADER    "X-XSRF-TOKEN"   // CSRF token header
#define ME_XSRF_PARAM     "-xsrf-"         // CSRF form parameter
```

#### 5.2.4 TLS/SSL Security

**Configuration:**
- Protocol version restrictions (TLS 1.2+)
- Cipher suite control
- Certificate validation
- Session ticket rotation
- HSTS support

**Best Practices:**
- Prefer OpenSSL over MbedTLS for production
- Enable session caching for performance
- Configure appropriate timeouts
- Use strong cipher suites

### 5.3 Security Considerations and Trade-offs

**Documented Acceptable Security Trade-offs:**

1. **Memory Allocation**: No explicit failure checks (global handler used)
2. **Debug Logging**: `rDebug()` may emit sensitive data in debug builds (intentional)
3. **Test Applications**: May use HTTP for self-signed certificates (development only)
4. **MD5 Support**: Legacy digest authentication (flagged as acceptable)
5. **Input Validation**: API inputs deemed validated by experienced developers
6. **DNS/Filesystem Integrity**: Out of scope for this project

**SECURITY Comments in Code:**
- Prefixed with "SECURITY Acceptable:" indicate intentional trade-offs
- Should not be flagged as security issues
- Document design decisions for embedded developers

## 6. Performance and Optimization

### 6.1 Performance Characteristics

**Design for Performance:**
- **Multi-threaded**: Leverages multi-core processors
- **Thread Pool**: Efficient thread reuse across requests
- **Non-blocking I/O**: Event-driven architecture
- **Garbage Collection**: Automatic memory management with minimal overhead
- **Zero-copy**: Direct buffer operations where possible

### 6.2 Tuning Parameters

#### 6.2.1 Memory Tuning

**Packet Sizing:**
```c
// Size-optimized (main.me: tune: 'size')
#define ME_PACKET_SIZE      (8 * 1024)
#define ME_CHUNK_SIZE       (8 * 1024)

// Speed-optimized (main.me: tune: 'speed')
#define ME_PACKET_SIZE      (32 * 1024)
#define ME_CHUNK_SIZE       (32 * 1024)

// Balanced (default)
#define ME_PACKET_SIZE      (16 * 1024)
#define ME_CHUNK_SIZE       (16 * 1024)
```

**Memory Limits:**
```apache
LimitMemory         64MB      # Total memory quota
LimitCache          1MB       # Response cache size
LimitCacheItem      256K      # Max cacheable item
```

#### 6.2.2 Connection Tuning

```apache
LimitWorkers            4     # Thread pool size (≈ CPU cores)
LimitConnections        50    # Total concurrent connections
LimitKeepAlive          400   # Max requests per connection
InactivityTimeout       30s   # Keep-alive timeout
RequestTimeout          5min  # Total request timeout
```

#### 6.2.3 HTTP/2 Tuning

```apache
Http2                   on    # Enable HTTP/2
LimitStreams            100   # Concurrent streams per connection
LimitHpackSize          64K   # HPACK table size
```

### 6.3 Caching

**Response Caching:**
```apache
Cache                   1hour          # Default cache duration
Header set Cache-Control "max-age=3600"
```

**Cache Control:**
- `LimitCache`: Total cache size
- `LimitCacheItem`: Maximum cacheable item size
- `ME_MAX_CACHE_DURATION`: Default cache lifetime

### 6.4 Performance Monitoring

**Built-in Counters:**
- Active connections
- Active requests
- Active processes (CGI/FastCGI)
- Bad request count
- Memory usage
- CPU usage

## 7. Deployment and Operations

### 7.1 Deployment Modes

#### 7.1.1 Standalone Server

**Production Deployment (src/server/appweb.conf):**
```bash
cd src/server
./appweb -v  # Verbose mode
```

**Configuration:**
- Minimal configuration
- HTTPS recommended (requires SSL cert setup)
- Production-hardened limits
- Error logging to file

#### 7.1.2 Development Server

**Development Deployment (test/appweb.conf):**
```bash
cd test
./appweb -v
```

**Configuration:**
- Full-featured (all modules enabled)
- HTTP for testing
- Verbose error messages (ShowErrors on)
- Extended timeouts
- Large limits for testing

#### 7.1.3 Embedded Integration

**Programmatic Server:**
```c
// Simple server without config file
maRunSimpleWebServer("0.0.0.0", 80, "/var/www", "/var/www/html");

// Server with config file
maRunWebServer("/etc/appweb/appweb.conf");

// Custom configuration
maConfigureServer("appweb.conf", "/home", "/docs", "127.0.0.1", 8080);
```

### 7.2 Configuration Files

#### 7.2.1 Configuration Hierarchy

**Load Order:**
1. Main configuration file (specified on command line)
2. Include files (via `Include` directive)
3. Local customizations (local.me, custom.me)

**Configuration Locations:**
- **Production**: `/etc/appweb/appweb.conf`
- **Development**: `./test/appweb.conf`
- **Minimal**: `./src/server/appweb.conf`

#### 7.2.2 Configuration Examples

**Basic HTTPS Server:**
```apache
Listen              443
ListenSecure        443
SSLCertificateFile  /etc/ssl/server.crt
SSLCertificateKeyFile /etc/ssl/server.key

Documents           /var/www/html
ErrorLog            /var/log/appweb/error.log level=2
```

**Virtual Host:**
```apache
<VirtualHost *:80>
    ServerName      www.example.com
    Documents       /var/www/example

    <Directory /admin>
        AuthType    basic
        AuthName    "Admin Area"
        Require     role administrator
    </Directory>
</VirtualHost>
```

**Reverse Proxy:**
```apache
<Route ^/api/>
    SetHandler      proxyHandler
    ProxyHost       backend:8080
    ProxyProtocol   http
</Route>
```

### 7.3 Logging and Monitoring

#### 7.3.1 Log Types

**Error Log:**
```apache
ErrorLog error.log level=2 backup=5 anew size=10MB
```

**Trace Log (detailed HTTP tracing):**
```apache
TraceLog trace.log level=3 formatter=pretty
```

**Custom Format:**
```apache
TraceLog stdout level=3 formatter=common format="%h %l %u %t \"%r\" %>s %b"
```

#### 7.3.2 Log Levels

**Error Log Levels:**
- 0: Fatal errors only
- 1: Errors
- 2: Warnings (default production)
- 3: Info
- 4: Debug
- 5: Trace

**Trace Detail Levels:**
- error=1: Errors
- request=2: Request/response summary
- headers=3: HTTP headers
- context=4: Context info
- packet=5: Packet details
- detail=6: Detailed trace
- content=10K: Content (first 10K bytes)

### 7.4 Watchdog and Process Management

**Watchdog (appman):**
- Automatic restart on crash
- Heartbeat monitoring
- Resource limit enforcement
- Process supervision

**Configuration:**
```javascript
watchdog: {
    name: 'appman',
}
```

### 7.5 Software Updates (Embedthis Updater)

**Auto-Update Support:**
- Included updater library (`src/updater/`)
- Download and apply updates automatically
- Integration with Embedthis Builder for update distribution
- Compliance with EU Cyber Resilience Act (CRA)

**Usage:**
- Built-in updater utility
- Can be invoked programmatically
- Supports versioned rollout
- Secure update verification

## 8. Development Guide

### 8.1 Development Workflow

#### 8.1.1 Building

**Standard Build:**
```bash
make                        # Build all components
make SHOW=1                 # Show commands
make OPTIMIZE=debug         # Debug build
```

**Component-Specific:**
```bash
ME_COM_ESP=1 ME_COM_CGI=1 make    # Enable specific components
ME_COM_OPENSSL=1 make              # Use OpenSSL
```

#### 8.1.2 Testing

**Test Suite:**
```bash
make test                   # Run all tests
cd test && tm              # Alternative test runner
cd test && tm basic/*      # Run specific tests
```

**Test Types:**
- C unit tests (`.tst.c`)
- Shell tests (`.tst.sh`)
- JavaScript tests (`.tst.js`)
- TypeScript tests (`.tst.ts`)

**Test Configuration (test/testme.json5):**
```json5
{
    name: 'appweb',
    workers: 2,             // Parallel test workers
    timeout: 300000,        // Test timeout (ms)
    depth: 1,              // Test iteration depth
}
```

#### 8.1.3 Debugging

**Enable Debug Logging:**
```apache
ErrorLog error.log level=5
TraceLog trace.log level=6
Trace debug=1 error=1 request=3 detail=6
```

**Debug Build:**
```bash
make OPTIMIZE=debug
lldb ./build/*/bin/appweb
```

**MPR-Specific Debugging:**
- Use `mprLog()` for logging (not `printf` or `rDebug`)
- Set `ME_MPR_DEBUG_LOGGING=1` for verbose MPR logs
- Enable memory checking: `mpr.alloc.check: true`

### 8.2 Extending Appweb

#### 8.2.1 Creating Custom Handlers

**Handler Structure:**
```c
typedef struct MyHandler {
    HttpQueue *readq;
    HttpQueue *writeq;
    // Handler-specific state
} MyHandler;

static HttpStage *createMyHandler() {
    HttpStage *stage = httpCreateHandler("myHandler", NULL);
    stage->open = openMyHandler;
    stage->start = startMyHandler;
    stage->incoming = incomingMyHandler;
    stage->outgoing = outgoingMyHandler;
    stage->close = closeMyHandler;
    return stage;
}

int httpMyHandlerInit(Http *http, MprModule *mp) {
    httpAddStage(createMyHandler());
    return 0;
}
```

**Registration in main.me:**
```javascript
targets: {
    myhandler: {
        description: 'My Custom Handler',
        path: 'src/modules/myHandler.c',
        depends: [ 'libmod_myhandler' ],
    }
}
```

**Configuration:**
```apache
LoadModule myHandler libmod_myhandler
AddHandler myHandler .myext
```

#### 8.2.2 Custom Directives

**Define Directive Handler:**
```c
static int myDirective(MaState *state, cchar *key, cchar *value) {
    bool enabled;
    char *path;

    if (!maTokenize(state, value, "%B %P", &enabled, &path)) {
        return MPR_ERR_BAD_SYNTAX;
    }

    // Apply directive logic

    return 0;
}

// Register directive
maAddDirective("MyDirective", myDirective);
```

**Usage in appweb.conf:**
```apache
MyDirective on /path/to/resource
```

#### 8.2.3 Custom Authentication

**Auth Callback:**
```c
static int myAuthCallback(HttpStream *stream, cchar *username, cchar *password) {
    // Validate credentials
    if (validateUser(username, password)) {
        httpSetStreamUser(stream, username);
        return HTTP_CODE_OK;
    }
    return HTTP_CODE_UNAUTHORIZED;
}

// Register auth type
httpSetAuthCallback(route->auth, myAuthCallback);
```

### 8.3 Code Conventions

**MPR-Specific Patterns:**
- Use **`mpr*` functions** for all MPR operations
- Leverage **garbage collection** - no manual free() needed
- Objects auto-freed when unreferenced
- Use `mprMark()` in manage functions to preserve references

**Memory Management:**
```c
// Allocate with GC
MyType *obj = mprAllocObj(MyType, manageMyType);

// Manager function marks referenced objects
static void manageMyType(MyType *obj, int flags) {
    if (flags & MPR_MANAGE_MARK) {
        mprMark(obj->someReference);
        mprMark(obj->anotherReference);
    }
}
```

**Threading:**
- Use MPR mutexes: `mprCreateLock()`
- Dispatchers for serialization: Request-specific event queues
- Thread-safe via dispatcher serialization (minimal locking needed)

**Naming Conventions:**
- MPR functions: `mpr*`
- HTTP functions: `http*`
- Appweb functions: `ma*`
- Public API: `PUBLIC` macro
- Internal: `static`

## 9. API Reference

### 9.1 Core Appweb API

**Server Management:**
```c
// High-level server creation
int maRunWebServer(cchar *configFile);
int maRunSimpleWebServer(cchar *ip, int port, cchar *home, cchar *documents);

// Configuration
int maConfigureServer(cchar *configFile, cchar *home, cchar *documents,
                     cchar *ip, int port);
int maParseConfig(cchar *path);

// Module loading
int maLoadModules(void);
int maLoadModule(cchar *name, cchar *libname);

// Directive registration
void maAddDirective(cchar *directive, MaDirective proc);
```

**Configuration Parsing:**
```c
// Tokenization
bool maTokenize(MaState *state, cchar *str, cchar *fmt, ...);
char *maGetNextArg(char *s, char **tok);

// State management
MaState *maPushState(MaState *state);
MaState *maPopState(MaState *state);
```

### 9.2 HTTP API Highlights

**Stream Management:**
```c
void httpError(HttpStream *stream, int status, cchar *fmt, ...);
void httpRedirect(HttpStream *stream, int status, cchar *uri);
void httpSetStatus(HttpStream *stream, int status);
void httpSetContentType(HttpStream *stream, cchar *mimeType);
```

**Request/Response:**
```c
cchar *httpGetParam(HttpStream *stream, cchar *name, cchar *defaultValue);
cchar *httpGetHeader(HttpStream *stream, cchar *key);
void  httpSetHeader(HttpStream *stream, cchar *key, cchar *fmt, ...);
ssize httpRead(HttpStream *stream, char *buf, ssize size);
ssize httpWrite(HttpQueue *q, cchar *fmt, ...);
```

**Routing:**
```c
HttpRoute *httpCreateRoute(HttpHost *host);
void httpAddRouteHandler(HttpRoute *route, cchar *name, cchar *extensions);
void httpSetRoutePattern(HttpRoute *route, cchar *pattern, int flags);
```

### 9.3 MPR API Highlights

**Memory:**
```c
void *mprAlloc(size_t size);
void *mprAllocObj(Type, ManageFunc);
void mprMark(void *ptr);
```

**Strings:**
```c
char *sfmt(cchar *fmt, ...);
char *sclone(cchar *str);
char *sjoin(cchar *str, ...);
```

**Logging:**
```c
void mprLog(cchar *tag, int level, cchar *fmt, ...);
```

## 10. Migration and Upgrade Path

### 10.1 Maintenance Status

**Current State:**
- **Maintenance Mode**: Active support, security updates only
- **No New Features**: Feature development frozen
- **Long-term Support**: Continued security maintenance

**Recommended Path:**
For new projects or future upgrades, consider [Ioto Device Agent](https://www.embedthis.com/ioto/):
- Modern architecture with fiber-based concurrency
- Integrated IoT capabilities (MQTT, cloud management)
- 20+ years of evolution beyond Appweb
- Active development and new features

### 10.2 Compatibility

**API Compatibility:**
```c
// Enable pre-Appweb 8 compatibility
settings: {
    compat: true,  // Enable compatibility defines
}
```

**Deprecation Warnings:**
```c
settings: {
    deprecatedWarnings: false,  // Disable deprecation warnings
}
```

### 10.3 Breaking Changes from Earlier Versions

**Appweb 8+ Changes:**
- Refactored authentication subsystem
- Updated route resolution algorithm
- HTTP/2 support additions
- ESP framework modernization

## 11. Troubleshooting

### 11.1 Common Issues

**Build Issues:**
- **Missing OpenSSL**: Install `libssl-dev` or configure path with `ME_COM_OPENSSL_PATH`
- **Windows Build**: Ensure Visual Studio tools in PATH or use WSL
- **Module Load Failures**: Check `ME_COM_*` flags match runtime expectations

**Runtime Issues:**
- **Port Already in Use**: Check `Listen` directive, ensure port available
- **Permission Denied**: Run with appropriate privileges or use port >1024
- **SSL Certificate Errors**: Verify certificate paths, use test certs from `certs/`
- **Module Not Found**: Ensure `LoadModule` directive present and library accessible

**Performance Issues:**
- **High Memory Usage**: Reduce `LimitMemory`, tune GC with `mpr.alloc.quota`
- **Connection Limits**: Increase `LimitConnections`, `LimitWorkers`
- **Slow Responses**: Check `LimitWorkers` ≈ CPU cores, enable caching

### 11.2 Debugging Techniques

**Enable Verbose Logging:**
```bash
./appweb -v  # Verbose mode
./appweb --log trace:6  # Maximum trace level
```

**Trace Specific Subsystems:**
```apache
Trace rx=4 tx=4 conn=3 request=3
```

**Memory Debugging:**
```javascript
mpr: {
    alloc: {
        check: true,  // Enable allocation checking
    }
}
```

**GDB/LLDB Debugging:**
```bash
gdb --args ./appweb -v
(gdb) break openCgi
(gdb) run
```

## 12. References and Resources

### 12.1 Documentation

**Local Documentation:**
- API Reference: `doc/index.html` (generate with `make doc`)
- Component Guides: `src/*/CLAUDE.md`
- Build Guide: `CLAUDE.md`

**Online Resources:**
- Appweb Website: https://www.embedthis.com/appweb/
- Documentation: https://www.embedthis.com/appweb/doc/
- Support: support@embedthis.com

### 12.2 Source Code Structure

**Key Directories:**
```
appweb/
├── src/
│   ├── mpr/           # MPR runtime (GC, threads, events, I/O)
│   ├── http/          # HTTP protocol stack
│   ├── esp/           # ESP web framework
│   ├── modules/       # Handler modules (CGI, FastCGI, ESP, proxy)
│   ├── server/        # Main server application
│   ├── utils/         # Utility programs
│   ├── osdep/         # Platform abstraction
│   ├── pcre/          # PCRE regex library
│   ├── ssl/           # SSL/TLS integration
│   ├── sqlite/        # SQLite database
│   ├── updater/       # Update mechanism
│   └── watchdog/      # Process watchdog
├── test/              # Test suite and full-featured config
├── doc/               # Generated documentation
├── certs/             # Test certificates
├── projects/          # Pre-generated IDE projects
└── samples/           # Example applications
```

### 12.3 Related Projects

**Embedthis Product Line:**
- **Ioto Device Agent**: Modern successor with IoT capabilities
- **GoAhead**: Ultra-compact web server for minimal footprint
- **Embedthis Builder**: Update distribution and device management

**Dependencies:**
- OpenSSL: https://www.openssl.org/ (preferred TLS backend)
- MbedTLS: https://www.trustedfirmware.org/projects/mbed-tls/
- PCRE: https://www.pcre.org/ (regex engine)

---

## Appendix A: Configuration Directive Reference

### Basic Server Directives

| Directive | Description | Example |
|-----------|-------------|---------|
| `Listen` | Bind HTTP address and port (IPv4/IPv6) | `Listen :80` or `Listen [::1]:8080` |
| `ListenSecure` | Bind HTTPS address and port | `ListenSecure :443` |
| `ServerName` | Server's primary DNS name/address | `ServerName http://localhost:7777` |
| `ServerRoot` / `Home` | Base server directory | `Home /var/appweb` |
| `Documents` | Document root for web content | `Documents /var/www/html` |
| `CanonicalName` | Canonical server name for redirects | `CanonicalName example.com:80` |
| `CharSet` | Default character encoding | `CharSet utf-8` |
| `Include` | Include additional config files (supports wildcards) | `Include apps/*.conf` |

### Logging Directives

| Directive | Description | Example |
|-----------|-------------|---------|
| `ErrorLog` | Error log configuration | `ErrorLog error.log level=2 size=10MB backup=5 anew` |
| `TraceLog` | HTTP request/response trace log | `TraceLog trace.log level=3 formatter=pretty` |
| `Trace` | Fine-grained trace control | `Trace debug=1 request=2 headers=3 content=10K` |
| `ProxyLog` | Proxy-specific logging | `ProxyLog proxy.log level=3 formatter=pretty` |
| `ProxyTrace` | Proxy-specific tracing | `ProxyTrace debug=1 error=1 request=2` |
| `LogRoutes` | Debug route table (full or compressed) | `LogRoutes full` |

**Log Formatters:**
- `pretty`: Human-readable format
- `common`: Apache common log format
- `detail`: Detailed format with all fields
- Custom format: `format="%h %l %u %t \"%r\" %>s %b"`

### Security & Authentication Directives

| Directive | Description | Example |
|-----------|-------------|---------|
| `AuthType` | Authentication method (basic, digest, form) | `AuthType basic example.com` |
| `AuthName` | Authentication realm name | `AuthName "Admin Area"` |
| `Require` | Authorization requirement | `Require user joshua` or `Require role executive` |
| `User` | Define user with password and abilities | `User ralph hash user admin purchase` |
| `Role` | Define role with abilities | `Role admin view manage` |
| `GroupAccount` | Unix group to run as | `GroupAccount APPWEB` |
| `UserAccount` | Unix user to run as | `UserAccount APPWEB` |
| `Stealth` | Hide server information (on/off) | `Stealth on` |
| `ShowErrors` | Show detailed errors to client (dev only) | `ShowErrors off` |

### SSL/TLS Directives

| Directive | Description | Example |
|-----------|-------------|---------|
| `SSLCertificateFile` | Server SSL certificate | `SSLCertificateFile certs/server.crt` |
| `SSLCertificateKeyFile` | Server SSL private key | `SSLCertificateKeyFile certs/server.key` |
| `SSLCACertificateFile` | CA certificate for client verification | `SSLCACertificateFile certs/ca.crt` |
| `SSLVerifyClient` | Require client certificate (on/off) | `SSLVerifyClient on` |
| `SSLCipherSuite` | Allowed cipher suites | `SSLCipherSuite TLS_AES_256_GCM_SHA384:...` |
| `SSLProtocol` | Allowed SSL/TLS protocols | `SSLProtocol ALL -SSLv2 -SSLv3 -TLSv1.0` |
| `SSLPreload` | Enable HSTS preload | `SSLPreload` |

### Timeout Directives

| Directive | Description | Default/Example |
|-----------|-------------|-----------------|
| `ExitTimeout` | Graceful shutdown timeout | `ExitTimeout 10secs` |
| `InactivityTimeout` | Keep-alive idle timeout | `InactivityTimeout 30secs` |
| `RequestTimeout` | Total request processing timeout | `RequestTimeout 5mins` |
| `RequestParseTimeout` | Header parsing timeout | `RequestParseTimeout 5secs` |
| `SessionTimeout` | Session inactivity timeout | `SessionTimeout 30mins` |

### Resource Limit Directives

| Directive | Description | Default |
|-----------|-------------|---------|
| `LimitMemory` | Total memory quota | `20MB` |
| `LimitCache` | Response cache size | `128K` |
| `LimitCacheItem` | Max single cached item | `16K` |
| `LimitChunk` | HTTP chunk size | `8K` |
| `LimitClients` | Max unique client IPs | `20` |
| `LimitConnections` | Max concurrent connections | `50` |
| `LimitConnectionsPerClient` | Per-client connection limit | `20` |
| `LimitFiles` | Max open files (0=unlimited) | `0` |
| `LimitKeepAlive` | Max requests per connection | `200` |
| `LimitPacket` | Network packet size | `8K` |
| `LimitProcesses` | Max CGI/FastCGI processes | `10` |
| `LimitRequestsPerClient` | Per-client request limit | `20` |
| `LimitRequestBody` | Max request body size | `64MB` |
| `LimitRequestForm` | Max form data size | `128K` |
| `LimitRequestHeader` | Max header total size | `32K` |
| `LimitRequestHeaderLines` | Max number of headers | `64` |
| `LimitResponseBody` | Max response body size | `2GB` |
| `LimitSessions` | Max concurrent sessions | `200` |
| `LimitStreams` | Max HTTP/2 concurrent streams | `50` |
| `LimitUpload` | Max file upload size | `200MB` |
| `LimitUri` | Max URI length | `4K` |
| `LimitWorkers` | Thread pool size | `4` |
| `LimitWebSocketsFrame` | Max WebSocket frame size | `4K` |
| `LimitWebSocketsMessage` | Max WebSocket message size | `2GB` |
| `LimitWebSocketsPacket` | WebSocket packet buffer | `8K` |

### Memory Management Directives

| Directive | Description | Example |
|-----------|-------------|---------|
| `MemoryPolicy` | Action on memory limit (abort/restart/continue) | `MemoryPolicy restart` |

### Routing Directives

| Directive | Description | Example |
|-----------|-------------|---------|
| `<Route pattern>` | Define route with regex pattern | `<Route ^/api/>` |
| `Prefix` | URI prefix to remove | `Prefix /api` |
| `Documents` | Override document root for route | `Documents /var/www/api` |
| `Methods` | HTTP methods (set/add) | `Methods set GET POST` or `Methods add DELETE` |
| `SetHandler` | Assign handler to route | `SetHandler espHandler` |
| `AddHandler` | Map handler to extensions | `AddHandler cgiHandler exe cgi pl` |
| `AddFilter` | Add pipeline filter | `AddFilter uploadFilter` |
| `Target` | Define route action | `Target run $1` or `Target write 200 "OK"` |
| `Condition` | Route eligibility test | `Condition match ${ssl:state} "CN=localhost"` |
| `Update` | Modify request parameters | `Update param from ${header:from}` |
| `Param` | Require request parameter | `Param name value` |
| `RequestHeader` | Require request header | `RequestHeader User-Agent custom` |
| `Reset` | Reset pipeline | `Reset pipeline` |
| `AutoFinalize` | Auto-finalize request (true/false) | `AutoFinalize false` |
| `Source` | ESP source file | `Source app/controller.c` |

### Caching Directives

| Directive | Description | Example |
|-----------|-------------|---------|
| `Cache` | Enable response caching | `Cache client=1day server=1hour extensions="html,css,js"` |
| `Cache` (modes) | Cache modes: all, unique, only | `Cache server=1day unique /api` |

**Cache Parameters:**
- `client=DURATION`: Browser cache duration
- `server=DURATION`: Server cache duration
- `extensions="list"`: File extensions to cache
- `types="list"`: MIME types to cache
- `methods="list"`: HTTP methods to cache
- `unique`: Cache each URI+params uniquely
- `only`: Cache only exact URIs specified

### Content & MIME Directives

| Directive | Description | Example |
|-----------|-------------|---------|
| `TypesConfig` | MIME types configuration file | `TypesConfig mime.types` |
| `Alias` | Map URI to filesystem path | `Alias /images/ /var/www/images/` |
| `ScriptAlias` | Map URI to CGI directory | `ScriptAlias /cgi-bin/ /var/cgi/` |
| `Redirect` | Redirect URI (temp/perm/code) | `Redirect temp ^/old /new` or `Redirect 410 ^/gone` |

### Header Directives

| Directive | Description | Example |
|-----------|-------------|---------|
| `Header` | Set/add/remove response headers | `Header set X-Custom "value"` |
| `Header remove` | Remove response header | `Header remove Server` |

**Common Header Operations:**
- Security: `Header set X-Frame-Options "DENY"`
- HSTS: `Header set Strict-Transport-Security "max-age=31536000; includeSubDomains"`
- CSP: `Header set Content-Security-Policy "default-src 'self'"`
- Cache: `Header set Cache-Control "no-cache"`

### Protocol Directives

| Directive | Description | Example |
|-----------|-------------|---------|
| `Http2` | Enable/disable HTTP/2 | `Http2 on` |
| `StreamInput` | Control request streaming | `StreamInput multipart/form-data /upload` |
| `WebSocketsProtocol` | WebSocket sub-protocol | `WebSocketsProtocol chat` |

### Language & Localization Directives

| Directive | Description | Example |
|-----------|-------------|---------|
| `AddLanguageDir` | Add language-specific directory | `AddLanguageDir en english` |
| `AddLanguageSuffix` | Add language suffix to filenames | `AddLanguageSuffix en .en before` |
| `DefaultLanguage` | Set default language | `DefaultLanguage en` |

### CGI Directives

| Directive | Description | Example |
|-----------|-------------|---------|
| `Action` | Map MIME type to CGI program | `Action application/x-perl /usr/bin/perl` |
| `CgiPrefix` | Prefix for CGI environment vars | `CgiPrefix CGI_` |
| `CgiEscape` | Escape shell chars in CGI vars | `CgiEscape on` |

### FastCGI Directives

| Directive | Description | Example |
|-----------|-------------|---------|
| `FastConnect` | Connect to FastCGI server | `FastConnect 127.0.0.1:9000 launch min=1 max=4` |

**FastConnect Parameters:**
- `host:port`: Server address
- `launch=program`: Auto-launch program
- `min=N`: Minimum proxy connections
- `max=N`: Maximum proxy connections
- `maxRequests=N`: Requests before recycling
- `multiplex=N`: Concurrent requests per connection
- `timeout=DURATION`: Idle timeout
- `keep=BOOL`: Use FastCGI keep-alive

### Proxy Directives

| Directive | Description | Example |
|-----------|-------------|---------|
| `ProxyConnect` | Connect to proxy backend | `ProxyConnect 127.0.0.1:8080 multiplex=unlimited` |
| `<ProxyConfig>` | Proxy-specific SSL/TLS config | See example below |

**ProxyConnect Parameters:** (same as FastConnect)

**ProxyConfig Block Example:**
```apache
<ProxyConfig>
    SSLVerifyClient off
    SSLCertificateFile    "certs/proxy.crt"
    SSLCertificateKeyFile "certs/proxy.key"
</ProxyConfig>
```

### Upload Directives

| Directive | Description | Example |
|-----------|-------------|---------|
| `UploadDir` | Directory for uploaded files | `UploadDir /tmp/uploads` |
| `UploadAutoDelete` | Auto-delete after processing | `UploadAutoDelete on` |

### ESP Directives

| Directive | Description | Example |
|-----------|-------------|---------|
| `EspApp` | Load ESP application | `EspApp prefix="/app" config="app/esp.json"` |

### Session Directives

| Directive | Description | Example |
|-----------|-------------|---------|
| `SessionCookie` | Session cookie configuration | `SessionCookie name="sid" persist=true visible=false` |

**SessionCookie Parameters:**
- `name=STRING`: Cookie name
- `persist=BOOL`: Persistent cookie
- `visible=BOOL`: Send to client
- `same=POLICY`: SameSite policy (lax/strict/none)

### Defense & Monitoring Directives

| Directive | Description | Example |
|-----------|-------------|---------|
| `Defense` | Define defense remedy | `Defense deny REMEDY=ban STATUS=406 PERIOD=5secs` |
| `Monitor` | Monitor security conditions | `Monitor "NotFoundErrors > 100" 5sec deny` |

**Defense Parameters:**
- `REMEDY`: Action (ban/delay/log/cmd)
- `STATUS`: HTTP status code
- `MESSAGE`: Error message
- `PERIOD`: Duration

### Directory Options

| Directive | Description | Example |
|-----------|-------------|---------|
| `Options` | Enable directory options | `Options Indexes` |
| `IndexOrder` | Directory listing sort order | `IndexOrder ascending name` |
| `IndexOptions` | Directory listing options | `IndexOptions FancyIndexing FoldersFirst` |

### Virtual Host Directives

| Directive | Description | Example |
|-----------|-------------|---------|
| `<VirtualHost addresses>` | Define virtual host | `<VirtualHost *:80>` |

**VirtualHost Example:**
```apache
<VirtualHost *:443>
    ServerName secure.example.com
    SSLCertificateFile certs/example.crt
    SSLCertificateKeyFile certs/example.key
    Documents /var/www/secure
</VirtualHost>
```

### Conditional Directives

| Directive | Description | Example |
|-----------|-------------|---------|
| `<if CONDITION>` | Conditional configuration | `<if SSL_MODULE>` ... `</if>` |

**Common Conditions:**
- `SSL_MODULE`, `ESP_MODULE`, `CGI_MODULE`, `FAST_MODULE`, `PROXY_MODULE`
- `HTTP2`, `UPLOAD`, `IPv6`
- `ME_DEBUG`

### Error Handling Directives

| Directive | Description | Example |
|-----------|-------------|---------|
| `ErrorDocument` | Custom error pages | `ErrorDocument 404 /notFound.esp` |

### Route Tokens and Variables

**System Tokens:**
- `${DOCUMENTS}`: Document root
- `${HOME}`: Server root
- `${BIN_DIR}`: Binary directory

**Request Tokens:**
- `${request:uri}`: Request URI
- `${request:query}`: Query string
- `${request:method}`: HTTP method
- `${request:scheme}`: http/https
- `${request:filename}`: Mapped filename
- `${request:Language}`: Detected language

**SSL Tokens:**
- `${ssl:CLIENT_S_CN}`: Client cert common name
- `${ssl:state}`: SSL state

**Header/Param Tokens:**
- `${header:NAME}`: Request header
- `${param:NAME}`: Request parameter

---

## Appendix B: Build Configuration Variables

### Component Toggles (ME_COM_*)

| Variable | Description | Default |
|----------|-------------|---------|
| `ME_COM_CGI` | Enable CGI handler | 0 |
| `ME_COM_ESP` | Enable ESP framework | 0 |
| `ME_COM_FAST` | Enable FastCGI handler | 0 |
| `ME_COM_PROXY` | Enable proxy handler | 0 |
| `ME_COM_SSL` | Enable SSL/TLS | 0 |
| `ME_COM_OPENSSL` | Use OpenSSL | 1 |
| `ME_COM_MBEDTLS` | Use MbedTLS | 0 |
| `ME_COM_SQLITE` | Enable SQLite | 0 |
| `ME_COM_MDB` | Enable memory database | 0 |

### Build Options

| Variable | Description | Values |
|----------|-------------|--------|
| `OPTIMIZE` | Optimization level | `debug`, `release` |
| `PROFILE` | Build profile | `dev`, `prod` |
| `SHOW` | Show build commands | `0`, `1` |
| `ME_TUNE_SIZE` | Optimize for size | `0`, `1` |
| `ME_TUNE_SPEED` | Optimize for speed | `0`, `1` |

---

## Appendix C: Error Codes

### HTTP Status Codes (Common)

| Code | Constant | Description |
|------|----------|-------------|
| 200 | `HTTP_CODE_OK` | Success |
| 301 | `HTTP_CODE_MOVED_PERMANENTLY` | Permanent redirect |
| 302 | `HTTP_CODE_MOVED_TEMPORARILY` | Temporary redirect |
| 304 | `HTTP_CODE_NOT_MODIFIED` | Cached content valid |
| 400 | `HTTP_CODE_BAD_REQUEST` | Malformed request |
| 401 | `HTTP_CODE_UNAUTHORIZED` | Authentication required |
| 403 | `HTTP_CODE_FORBIDDEN` | Access denied |
| 404 | `HTTP_CODE_NOT_FOUND` | Resource not found |
| 500 | `HTTP_CODE_INTERNAL_SERVER_ERROR` | Server error |
| 503 | `HTTP_CODE_SERVICE_UNAVAILABLE` | Server overloaded |

### MPR Error Codes

| Code | Constant | Description |
|------|----------|-------------|
| 0 | `MPR_ERR_OK` | Success |
| -1 | `MPR_ERR` | General error |
| -13 | `MPR_ERR_CANT_ALLOCATE` | Memory allocation failed |
| -21 | `MPR_ERR_CANT_OPEN` | Cannot open resource |
| -30 | `MPR_ERR_TIMEOUT` | Operation timed out |
| -33 | `MPR_ERR_WOULD_BLOCK` | Non-blocking operation would block |

---

*Document Version: 1.0*
*Appweb Version: 9.x*
*Last Updated: 2024*
