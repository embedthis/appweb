Embedthis Appweb
===

<p align="center">
  <a href="https://github.com/embedthis/appweb/actions/workflows/ci.yml"><img src="https://github.com/embedthis/appweb/actions/workflows/ci.yml/badge.svg" alt="CI Status"></a>
</p>

Appweb is a compact, fast and secure embedded web server supporting HTTP/1, HTTP/2, and WebSockets. With a 1-4MB memory footprint, event-driven multi-threaded architecture, and comprehensive security features, it's optimized for embedded applications, IoT devices, and resource-constrained environments.

**Key Features:**
- **Compact & Fast**: 1-4MB footprint with exceptional throughput
- **Protocol Support**: HTTP/1.0, HTTP/1.1, HTTP/2, WebSockets
- **Security First**: Sandboxing, authentication (Basic, Digest, Form), SSL/TLS, defensive countermeasures
- **Modular Architecture**: Loadable handlers for CGI, FastCGI, PHP, Proxy
- **Production Ready**: Widely deployed in networking equipment, telephony, mobile devices
- **Cross-Platform**: Linux, macOS, Windows, VxWorks

## Status

Appweb is in a **maintenance phase**. It is actively supported and will receive security updates as required, but it will not have new features added.

## ESP is a Separate Add-On

ESP (Embedded Server Pages) is a **separate add-on product** and is no longer bundled with Appweb. SQLite shipped only as the ESP database backend, so it has moved to the add-on as well.

Appweb keeps the hooks needed to bind ESP back in as a plugin: the `espHandler` module, the `httpEspInit()` entry point, and the `ESP_MODULE` configuration conditional. To build with the add-on, install the `esp` and `sqlite` paks (which populate `src/esp` and `src/sqlite`) and regenerate the projects with ESP enabled:

```bash
cd projects && premake5 --esp gmake
```

If you are creating a new device or planning your upgrade path for the future, we recommend you consider the [Ioto Device Agent](https://www.embedthis.com/ioto/). It incorporates everything we've learned from Appweb over 20 years of developing device management software. Talk to us about how to upgrade to Ioto at [Support](mailto:support@embedthis.com).

## Regular Expressions (Optional)

Appweb ships **no regular expression engine**. Route patterns, `Alias` prefixes, `{token}` segments, and alternations of literals are matched natively by a compact, non-backtracking matcher, which covers the great majority of configurations.

Some pattern constructs are genuine regular expressions and need an engine: sub-expressions in a route such as `(user|admin)`, character classes such as `[a-z]`, repeat counts such as `{2,4}`, lookahead, token fields with a pattern such as `{cmd=[0-9]+}`, and a `ServerName` written as a regular expression (beginning and ending with `/`).

If you need these, supply your own [PCRE2](https://www.pcre.org/) library and regenerate the projects with the `--pcre2` option. You own the library: you choose the version and patch it on your own schedule.

```bash
brew install pcre2            # macOS. Or: apt install libpcre2-dev, vcpkg install pcre2
cd projects && premake5 --pcre2 gmake
cd .. && make
```

If PCRE2 is installed in a non-standard location, name it with `--pcre2-path=/opt/pcre2`. If a configuration uses a pattern that needs an engine and Appweb was built without PCRE2, the server reports the offending pattern when it parses the configuration and does not start — it never fails silently at request time. Guard such configuration with the `<if PCRE2>` conditional.

## Security for Devices

The European Union has introduced the Cyber Resilience Act (CRA), a regulation aimed at enhancing cybersecurity for IoT products. This legislation mandates that manufacturers ensure their products are secure throughout their entire lifecycle, from design to decommissioning. This requires that software updates are provided for the lifetime of the device.

To meet this need, the [EmbedThis Builder](https://www.embedthis.com/builder/) can be used to publish, distribute, manage and track software updates for your Appweb devices.


## Licensing

See [LICENSE.md](LICENSE.md) for details.

## Documentation

**Online Documentation:**
- Complete User Guide: https://www.embedthis.com/appweb/doc/
- Configuration Reference: https://www.embedthis.com/appweb/doc/users/configuration.html
- Routing Guide: https://www.embedthis.com/appweb/doc/users/routing.html
- Security Guide: https://www.embedthis.com/appweb/doc/users/security.html

**Local Documentation (included in the source archive):**
- API Reference: `doc/api/appweb.html`, `doc/api/http.html`, `doc/api/mpr.html`, `doc/api/osdep.html`
- Manual pages: `doc/man/`
- Release notes, CRA user information and Declaration of Conformity: `doc/`

## Building from Source

You can build Appweb with make, Visual Studio or Xcode.

## To Build with Make:

### Linux or MacOS

    make

or to see the commands as they are invoked:

    make SHOW=1

You can pass make variables to tailor the build. For a list of targets and variables:

	make help

### Windows

make

The make.bat runs projects/windows.bat to locate the Visual Studio compiler. If you have setup
your CMD environment for Visual Studio by running the Visual Studio vsvarsall.bat, then that edition of
Visual Studio will be used. If not, windows.bat will attempt to locate the most recent Visual Studio version.

## To Build with Visual Studio:

To build with Visual Studio, you will need to install the [vcpkg](https://vcpkg.io/en/) dependency manager and install openssl.

    git clone https://github.com/microsoft/vcpkg.git
    cd vcpkg
    .\bootstrap-vcpkg.bat
    .\vcpkg integrate install
    .\vcpkg install openssl

Then open the Visual Studio solution file at:

    projects/vs2022/appweb.sln

Then select Build -> Solution.

To run the debugger, right-click on the "appweb" project and set it as the startup project. Then modify the project properties and set the Debugging configuration properties. Set the working directory to be:

    $(ProjectDir)\..\..\test

Set the arguments to be
    -v

Then start debugging.

You may need to install the Windows Power Shell if not already installed on your system.

    winget install --id Microsoft.PowerShell --source winget

## To Build with Xcode.

Open the workspace:

    projects/xcode/appweb.xcworkspace

Choose Product -> Scheme -> Edit Scheme, and select "Build" on the left of the dialog. Click the "+" symbol at the bottom in the center and then select all targets to be built. Before leaving this dialog, set the debugger options by selecting "Run/Debug" on the left hand side. Under "Info" set the Executable to be "appweb", set the launch arguments to be "-v" and set the working directory to be an absolute path to the "./test" directory in the appweb source. The click "Close" to save.

Click Project -> Build to build.

Click Project -> Run to run.

## To Run:

The src/server directory contains a minimal appweb.conf suitable for production use without SSL. The test directory contains an appweb.conf that is fully configured for testing. When using the src/server/appweb.conf, change to the src/server directory to run. When using the test/appweb.conf, change to the test directory to run.

## Testing

The test suite is located in the `test/` directory and uses the [TestMe](https://www.embedthis.com/testme/) framework. 

The test suite requires the following prerequisites:

- **Bun**: v1.2.23 or later
- **TestMe**: Test runner (installed globally)

Install Bun by following the instructions at: 

    https://bun.com/docs/installation

Install TestMe globally with:

    bun install -g --trust @embedthis/testme

Run the tests with:

    make test

or manually via the `tm` command. 

    tm

To run a specific test or group of tests, use the `tm` command with the test name.

    tm basic/

## Reporting Security Issues

Please report suspected vulnerabilities privately to security@embedthis.com rather than in a public
issue. See [SECURITY.md](SECURITY.md).

## Resources
---
  - [Appweb web site](https://www.embedthis.com/)
  - [Embedthis web site](https://www.embedthis.com/)
