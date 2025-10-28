# Appweb References

## Official Documentation

### Online Resources

- **Appweb Website**: https://www.embedthis.com/appweb/
- **Complete Documentation**: https://www.embedthis.com/appweb/doc/
- **User Guide**: https://www.embedthis.com/appweb/doc/users/
- **Configuration Reference**: https://www.embedthis.com/appweb/doc/users/configuration.html
- **Routing Guide**: https://www.embedthis.com/appweb/doc/users/routing.html
- **Security Guide**: https://www.embedthis.com/appweb/doc/users/security.html
- **API Reference**: https://www.embedthis.com/appweb/doc/api/

### Local Documentation

- **API Reference**: `doc/index.html` (generate with `make doc`)
- **Design Document**: `AI/designs/DESIGN.md` or `doc/DESIGN.md`
- **Project Plan**: `AI/plans/PLAN.md`
- **Procedures**: `AI/procedures/PROCEDURE.md`
- **Build Guide**: `CLAUDE.md` and `AGENTS.md`
- **Quick Start**: `README.md`

---

## Embedthis Products

### Ioto Device Agent

**Recommended successor to Appweb for new projects**

- **Website**: https://www.embedthis.com/ioto/
- **Documentation**: https://www.embedthis.com/ioto/doc/
- **Key Features**:
  - Modern fiber-based architecture
  - Integrated IoT cloud management
  - MQTT client built-in
  - Embedded database
  - Over-the-air updates
  - Safe runtime foundation

### GoAhead Web Server

**Ultra-compact embedded web server**

- **Website**: https://www.embedthis.com/goahead/
- **Documentation**: https://www.embedthis.com/goahead/doc/
- **Use Case**: Minimal footprint requirements (<100KB)

### Embedthis Builder

**Device update distribution and management**

- **Website**: https://www.embedthis.com/builder/
- **Purpose**: OTA update management for Appweb and Ioto deployments
- **Compliance**: EU Cyber Resilience Act (CRA) requirements

---

## Dependencies and Technologies

### SSL/TLS Libraries

#### OpenSSL (Preferred)

- **Website**: https://www.openssl.org/
- **Documentation**: https://www.openssl.org/docs/
- **Version**: 1.1.1+ or 3.0+
- **Why Preferred**: Better performance, broader platform support, more features

#### MbedTLS (Alternative)

- **Website**: https://www.trustedfirmware.org/projects/mbed-tls/
- **Documentation**: https://mbed-tls.readthedocs.io/
- **Use Case**: Embedded systems with limited resources

### Regular Expressions

#### PCRE (Perl Compatible Regular Expressions)

- **Website**: https://www.pcre.org/
- **Documentation**: https://www.pcre.org/current/doc/html/
- **Purpose**: Route pattern matching in Appweb

### Database

#### SQLite

- **Website**: https://www.sqlite.org/
- **Documentation**: https://www.sqlite.org/docs.html
- **Purpose**: ESP framework database support (SDB backend)

---

## Protocols and Standards

### HTTP Standards

- **HTTP/1.0**: RFC 1945 - https://www.rfc-editor.org/rfc/rfc1945
- **HTTP/1.1**: RFC 7230-7235 - https://www.rfc-editor.org/rfc/rfc7230
- **HTTP/2**: RFC 7540 - https://www.rfc-editor.org/rfc/rfc7540
- **HPACK**: RFC 7541 - https://www.rfc-editor.org/rfc/rfc7541

### WebSockets

- **WebSocket Protocol**: RFC 6455 - https://www.rfc-editor.org/rfc/rfc6455

### CGI Standards

- **CGI 1.1 Specification**: https://www.ietf.org/rfc/rfc3875.txt

### FastCGI

- **FastCGI Specification**: https://fastcgi-archives.github.io/FastCGI_Specification.html

### TLS/SSL

- **TLS 1.2**: RFC 5246 - https://www.rfc-editor.org/rfc/rfc5246
- **TLS 1.3**: RFC 8446 - https://www.rfc-editor.org/rfc/rfc8446

---

## Testing and Development Tools

### TestMe

- **Purpose**: Test framework for Appweb test suite
- **Language**: TypeScript/JavaScript
- **Runtime**: Bun
- **Installation**: `bun link testme` (if available)

### Bun

- **Website**: https://bun.sh/
- **Documentation**: https://bun.sh/docs
- **Purpose**: TypeScript/JavaScript runtime for tests

### Git

- **Website**: https://git-scm.com/
- **Documentation**: https://git-scm.com/doc
- **Git for Windows**: https://gitforwindows.org/ (includes bash)

### Build Tools

#### MakeMe

- **Purpose**: Embedthis build system (internal tool)
- **Configuration**: `main.me` files
- **Output**: Platform-specific Makefiles in `projects/`

#### Make/GNU Make

- **Website**: https://www.gnu.org/software/make/
- **Documentation**: https://www.gnu.org/software/make/manual/

---

## Platform-Specific Resources

### Windows

- **Visual Studio**: https://visualstudio.microsoft.com/
- **vcpkg**: https://vcpkg.io/ (dependency manager)
- **Windows Subsystem for Linux (WSL)**: https://docs.microsoft.com/en-us/windows/wsl/

### macOS

- **Xcode**: https://developer.apple.com/xcode/
- **Homebrew**: https://brew.sh/ (package manager for OpenSSL, etc.)

### Linux

- **GCC**: https://gcc.gnu.org/
- **Clang**: https://clang.llvm.org/

---

## Security Resources

### General Security

- **OWASP**: https://owasp.org/
- **OWASP Top 10**: https://owasp.org/www-project-top-ten/
- **CWE (Common Weakness Enumeration)**: https://cwe.mitre.org/

### Web Server Security

- **OWASP Application Security Verification Standard**: https://owasp.org/www-project-application-security-verification-standard/
- **Mozilla Web Security Guidelines**: https://infosec.mozilla.org/guidelines/web_security

### EU Cyber Resilience Act

- **Official Site**: https://digital-strategy.ec.europa.eu/en/policies/cyber-resilience-act
- **Purpose**: IoT product cybersecurity requirements
- **Impact**: Mandatory software updates for device lifetime

---

## Debugging Tools

### Memory Analysis

- **Valgrind**: https://valgrind.org/
  - Purpose: Memory leak detection, profiling
  - Tests: `test/leak/valgrind.tst.ts`

### Debuggers

- **GDB (GNU Debugger)**: https://www.gnu.org/software/gdb/
- **LLDB**: https://lldb.llvm.org/

---

## Community and Support

### Support Channels

- **Email Support**: support@embedthis.com
- **Security Reports**: security@embedthis.com (private disclosure)
- **GitHub Issues**: https://github.com/embedthis/appweb-core/issues

### Company

- **Embedthis Software**: https://www.embedthis.com/
- **About**: https://www.embedthis.com/about/
- **Contact**: https://www.embedthis.com/about/contact.html

---

## Revision History

- **2024-10**: Initial reference document for AI/Claude Code documentation structure
