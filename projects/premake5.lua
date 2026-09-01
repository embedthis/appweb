--
--  projects/premake5.lua: Appweb Web Server Build
--
--  Builds libappweb (shared library), appweb, http, authpass, cgiProgram, fastProgram, watchdog.
--
--  Usage (run from the projects/ directory):
--      premake5 gmake2                    # Generate GNU Makefiles for all platforms
--      premake5 vs2022                    # Generate VS2022 projects for Windows
--      premake5 xcode4                    # Generate Xcode projects for macOS
--      make config=debug_macosx           # Build for macOS
--      make config=release_linux          # Build for Linux
--

local ROOT = ".."

-- Read version from package.json (single source of truth)
local pakContent = io.readfile(ROOT .. "/package.json")
local VERSION = pakContent:match('"version"%s*:%s*"([^"]+)"') or "0.0.0"
local isVS = (_ACTION == "vs2022")
local isXcode = (_ACTION == "xcode4")

---------------------------------------------------------------------
--  Options
---------------------------------------------------------------------

newoption {
    trigger     = "tls",
    value       = "PROVIDER",
    description = "TLS provider: openssl (default) or mbedtls",
    default     = "openssl",
    allowed     = {
        { "openssl", "OpenSSL (default)" },
        { "mbedtls", "MbedTLS" },
    }
}

newoption {
    trigger     = "openssl-path",
    value       = "PATH",
    description = "Path to OpenSSL for every platform, overriding the per-platform defaults " ..
                  "(/opt/homebrew on macOS, /usr on Linux/FreeBSD, C:/Program Files/OpenSSL on Windows)",
}

newoption {
    trigger     = "mbedtls-path",
    value       = "PATH",
    description = "Path to MbedTLS installation",
}

--
--  Regular expressions are optional and the library is supplied by the deployer.
--  Appweb and the HTTP library ship no regexp engine: literals, Alias prefixes, {token}
--  segments and literal alternations are matched natively. Only lookahead, alternation in a
--  route, character classes and {token=regexp} fields need an engine.
--
--      brew install pcre2          # or apt install libpcre2-dev, or vcpkg install pcre2
--      premake5 --pcre2 gmake
--
newoption {
    trigger     = "pcre2",
    description = "Build with regular expression support using a customer-supplied PCRE2 library",
}

newoption {
    trigger     = "pcre2-path",
    value       = "PATH",
    description = "Path to the PCRE2 installation (default: /opt/homebrew on macOS, /usr elsewhere)",
}

newoption {
    trigger     = "fcgi-path",
    value       = "PATH",
    description = "Path to the FastCGI installation on macOS (default: /opt/homebrew)",
}

--
--  ESP is a separate add-on product and is not bundled with Appweb.
--  To build with it, install the esp and sqlite paks (which populate src/esp and src/sqlite)
--  and regenerate with: premake5 --esp gmake
--
newoption {
    trigger     = "esp",
    description = "Build with the ESP add-on (requires the esp and sqlite paks under src/)",
}

--
--  TLS library locations are platform specific, exactly as the PCRE2 ones are. Without this,
--  a Linux makefile generated on a macOS host carries "/opt/homebrew" include and library
--  paths. Override with --openssl-path.
--
local opensslOverride = _OPTIONS["openssl-path"]
local opensslMacPath  = opensslOverride or "/opt/homebrew"
local opensslUnixPath = opensslOverride or "/usr"
local opensslWinPath  = opensslOverride or "C:/Program Files/OpenSSL"

local opensslPaths = {
    macosx  = opensslMacPath,
    linux   = opensslUnixPath,
    freebsd = opensslUnixPath,
    windows = opensslWinPath,
}

--
--  On Windows the OpenSSL location is discovered at build time by projects/openssl-prep.bat, which
--  exports ME_COM_OPENSSL_PATH. msbuild expands $(NAME) from the environment, so naming it here lets
--  a vcpkg or other non-default install be found without regenerating the projects. The INCLUDE and
--  LIB variables that script also sets cannot do this, because msbuild overwrites both from the
--  project's own IncludePath and LibraryPath. The literal default is kept alongside it so an IDE
--  build with OpenSSL in its usual place still resolves, and a directory that does not exist costs
--  nothing: the compiler and linker skip it.
--
local opensslWinEnv = "$(ME_COM_OPENSSL_PATH)"

--
--  The Windows projects compile /MTd and /MT, so OpenSSL must be built against the static CRT.
--  The Shining Light installer puts its import libraries under lib/VC/<arch>/<crt>; vcpkg puts them
--  in lib, and the triplet that matches is x64-windows-static. The x64-windows triplet is
--  dynamic-CRT and fails at link with a RuntimeLibrary mismatch.
--
local function opensslWinLibDirs(roots)
    local dirs = {}
    for _, root in ipairs(roots) do
        table.insert(dirs, root .. "/lib")
        for _, crt in ipairs({ "MTd", "MT", "MDd", "MD" }) do
            table.insert(dirs, root .. "/lib/VC/x64/" .. crt)
        end
    end
    return dirs
end

--
--  Iterate an ordered list, never pairs() over the table above: the generated files are committed
--  and diffed, so the emission order has to be stable from run to run. Keep this list in step with
--  the platforms{} blocks in the workspace below.
--
local platformList
if isVS then
    platformList = { "windows" }
elseif isXcode then
    platformList = { "macosx" }
else
    platformList = { "macosx", "linux", "freebsd" }
end

local mbedtlsPath = _OPTIONS["mbedtls-path"] or "/usr"
local tlsProvider = _OPTIONS["tls"] or "openssl"
local withPcre2 = _OPTIONS["pcre2"] ~= nil

--
--  The PCRE2 library is supplied by the deployer, and its location is platform specific.
--  These must not be mixed: generating a Linux makefile on a macOS host must not bake a
--  Homebrew path into it. Override any of them with --pcre2-path.
--
local pcre2Override  = _OPTIONS["pcre2-path"]
local pcre2MacPath   = pcre2Override or "/opt/homebrew"
local pcre2UnixPath  = pcre2Override or "/usr"
local pcre2WinPath   = pcre2Override or ((os.getenv("USERPROFILE") or "C:/Users/Default") .. "/vcpkg/installed/x64-windows")
local fcgiOverride   = _OPTIONS["fcgi-path"]
local fcgiMacPath    = fcgiOverride or "/opt/homebrew"
local withEsp = _OPTIONS["esp"] ~= nil

---------------------------------------------------------------------
--  Workspace
---------------------------------------------------------------------

workspace "appweb"
    configurations { "debug", "release" }
    language       "C"
    warnings       "Extra"
    objdir         (ROOT .. "/build/obj/%{prj.name}-%{cfg.platform}-%{cfg.buildcfg}")
    targetdir      (ROOT .. "/build/bin")

    if isVS then
        platforms { "windows" }
        location  "vs2022"
        cdialect  "C11"
        architecture "x86_64"
        characterset "MBCS"
        staticruntime "On"
    elseif isXcode then
        platforms { "macosx" }
        location  "xcode"
        cdialect  "gnu11"
    else
        platforms { "macosx", "linux", "freebsd" }
        location  "gmake2"
        cdialect  "gnu11"
    end

    -- Common include paths (appweb and all vendored libraries)
    includedirs {
        ROOT .. "/src",
        ROOT .. "/src/osdep",
        ROOT .. "/src/mpr",
        ROOT .. "/src/http",
    }

    -- ESP add-on: sqlite is the ESP database backend and is required only by ESP
    if withEsp then
        includedirs {
            ROOT .. "/src/esp",
            ROOT .. "/src/sqlite",
        }
        defines {
            "ME_COM_ESP=1",
            "ME_COM_MDB=1",
            "ME_COM_SQLITE=1",
        }
    end

    -- Dynamic defines
    defines {
        'ME_VERSION="' .. VERSION .. '"',
        "ME_APPWEB_PRODUCT=1",
        'ME_APP_PREFIX="/usr/local/lib/appweb"',
        -- Enable core components
        "ME_COM_CGI=1",
        "ME_COM_FAST=1",
        "ME_COM_PROXY=1",
        -- HTTP feature flags
        "ME_HTTP_BASIC=1",
        "ME_HTTP_CACHE=1",
        "ME_HTTP_CMD=1",
        "ME_HTTP_DEFENSE=1",
        "ME_HTTP_DIGEST=1",
        "ME_HTTP_DIR=1",
        "ME_HTTP_HTTP2=1",
        "ME_HTTP_PAM=1",
        "ME_HTTP_SENDFILE=1",
        "ME_HTTP_UPLOAD=1",
        "ME_HTTP_WEB_SOCKETS=1",
    }

    -- Regular expression engine (optional, supplied by the deployer)
    if withPcre2 then
        defines { "ME_COM_PCRE2=1" }
    else
        defines { "ME_COM_PCRE2=0" }
    end

    -- TLS provider defines
    if tlsProvider == "openssl" then
        defines {
            "ME_COM_OPENSSL=1",
            "ME_COM_MBEDTLS=0",
            "ME_COM_SSL=1",
            'ME_COM_MBEDTLS_PATH="' .. mbedtlsPath .. '"',
        }
    else
        defines {
            "ME_COM_OPENSSL=0",
            "ME_COM_MBEDTLS=1",
            "ME_COM_SSL=1",
            'ME_COM_MBEDTLS_PATH="' .. mbedtlsPath .. '"',
        }
        includedirs { mbedtlsPath .. "/include" }
    end

    --
    --  ME_COM_OPENSSL_PATH is emitted whichever provider is selected, and like the include and
    --  library paths it must follow the target platform rather than the generating host. These
    --  project files are committed and shipped, so a single host-derived value would hand a Linux
    --  build the macOS Homebrew prefix.
    --
    for _, platform in ipairs(platformList) do
        filter("platforms:" .. platform)
            defines { 'ME_COM_OPENSSL_PATH="' .. opensslPaths[platform] .. '"' }
    end
    filter {}

    -----------------------------------------------------------------
    --  Debug / Release
    -----------------------------------------------------------------
    filter "configurations:debug"
        symbols  "On"
        optimize "Off"
        defines  { "ME_DEBUG=1" }

    filter "configurations:release"
        symbols  "Off"
        optimize "On"

    filter {}

    if not isVS then
        filter "configurations:debug"
            linkoptions { "-g" }
        filter {}
        --
        --  No explicit "-s" for release. symbols "Off" already strips where the linker supports it, so
        --  passing it again emitted "-s -s" on Linux, and Apple's linker answers it with
        --  "ld: warning: -s is obsolete" once per link: six warnings in a build reported as clean.
        --
    end

    -----------------------------------------------------------------
    --  Platform-specific flags
    -----------------------------------------------------------------
    if isVS then
        filter "platforms:windows"
            system  "windows"
            toolset "msc"
            disablewarnings {
                "4100",     -- unreferenced formal parameter
                "4127",     -- conditional expression is constant
                "4133",     -- incompatible types (char*/LPCWSTR)
                "4152",     -- function/data pointer conversion
                "4244",     -- conversion, possible loss of data
                "4389",     -- signed/unsigned mismatch
            }
        filter {}
    else
        filter "platforms:macosx"
            system  "macosx"
            toolset "clang"
            buildoptions {
                "-Wno-sign-conversion",
                "-Wno-unused-parameter",
                "-Wno-unused-result",
                "-Wshorten-64-to-32",
                "-Wall",
                "-Wno-unknown-warning-option",
                "-fstack-protector",
                "--param=ssp-buffer-size=4",
                "-Wformat", "-Wformat-security",
                "-Wno-sign-compare",
                "-Wno-cast-function-type-mismatch",
                "-Wno-shorten-64-to-32"
            }
            linkoptions {
                "-Wl,-no_warn_duplicate_libraries",
                "-Wl,-rpath,@executable_path/",
                "-Wl,-rpath,@loader_path/",
            }
            links { "dl", "pthread", "m", "pam" }

        filter "platforms:linux"
            system  "linux"
            toolset "gcc"
            buildoptions {
                "-Wno-unused-parameter",
                "-Wno-unused-result",
                "-Wall",
                "-fstack-protector",
                "--param=ssp-buffer-size=4",
                "-Wformat", "-Wformat-security",
                "-Wsign-compare",
            }
            linkoptions {
                "-Wl,-z,relro,-z,now",
                "-Wl,--as-needed",
                "-Wl,--no-copy-dt-needed-entries",
                "-Wl,-z,noexecheap",
                "-Wl,--no-warn-execstack",
            }
            links { "rt", "dl", "pthread", "m" }

        filter "platforms:freebsd"
            system  "bsd"
            toolset "gcc"
            buildoptions {
                "-Wno-unused-parameter",
                "-Wno-unused-result",
                "-Wall",
                "-fstack-protector",
                "--param=ssp-buffer-size=4",
                "-Wformat", "-Wformat-security",
                "-Wsign-compare",
            }
            links { "dl", "pthread", "m" }

        filter {}
    end


---------------------------------------------------------------------
--  libappweb (shared library)
---------------------------------------------------------------------

project "appweb-lib"
    kind       "SharedLib"
    if isVS then
        targetname "libappweb"
    else
        targetname "appweb"
    end

    files {
        -- Appweb core sources
        ROOT .. "/src/config.c",
        ROOT .. "/src/convenience.c",
        ROOT .. "/src/rom.c",
        -- Handler modules. espHandler.c compiles to nothing unless ME_COM_ESP is set.
        ROOT .. "/src/modules/cgiHandler.c",
        ROOT .. "/src/modules/espHandler.c",
        ROOT .. "/src/modules/fastHandler.c",
        ROOT .. "/src/modules/proxyHandler.c",
        ROOT .. "/src/modules/testHandler.c",
        ROOT .. "/src/modules/testBenchHandler.c",
        ROOT .. "/src/modules/testWebSocketsHandler.c",
        -- Vendored libraries (compiled into the shared library)
        ROOT .. "/src/mpr/mprLib.c",
        ROOT .. "/src/http/httpLib.c",
    }

    -- ESP add-on sources
    if withEsp then
        files {
            ROOT .. "/src/esp/espLib.c",
            ROOT .. "/src/sqlite/sqlite3.c",
        }
    end

    -- TLS libraries. Paths are per-platform and never shared: a Linux makefile generated on a
    -- macOS host must not carry Homebrew paths.
    filter "platforms:macosx"
        if tlsProvider == "openssl" then
            includedirs { opensslMacPath .. "/include" }
            libdirs     { opensslMacPath .. "/lib" }
            links       { "ssl", "crypto" }
        else
            includedirs { mbedtlsPath .. "/include" }
            libdirs     { mbedtlsPath .. "/lib", mbedtlsPath .. "/library" }
            links       { "mbedtls", "mbedcrypto", "mbedx509" }
        end

    filter "platforms:linux or freebsd"
        if tlsProvider == "openssl" then
            includedirs { opensslUnixPath .. "/include" }
            libdirs     { opensslUnixPath .. "/lib" }
            links       { "ssl", "crypto" }
        else
            includedirs { mbedtlsPath .. "/include" }
            libdirs     { mbedtlsPath .. "/lib", mbedtlsPath .. "/library" }
            links       { "mbedtls", "mbedcrypto", "mbedx509" }
        end

    -- Regular expression library (optional). Paths are per-platform and never shared.
    filter "platforms:macosx"
        if withPcre2 then
            includedirs { pcre2MacPath .. "/include" }
            libdirs     { pcre2MacPath .. "/lib" }
            links       { "pcre2-8" }
        end

    filter "platforms:linux or freebsd"
        if withPcre2 then
            includedirs { pcre2UnixPath .. "/include" }
            libdirs     { pcre2UnixPath .. "/lib" }
            links       { "pcre2-8" }
        end

    filter "platforms:windows"
        if withPcre2 then
            includedirs { pcre2WinPath .. "/include" }
            libdirs     { pcre2WinPath .. "/lib" }
            links       { "pcre2-8" }
        end

    filter "platforms:windows"
        --
        --  psapi is for GetProcessMemoryInfo in mprGetMem. Windows 7 and later forward it from
        --  kernel32, but only when the SDK selects PSAPI_VERSION 2, so link psapi explicitly.
        --
        links   { "ws2_32", "advapi32", "user32", "kernel32", "oldnames", "shell32", "psapi" }
        if tlsProvider == "openssl" then
            includedirs { opensslWinEnv .. "/include", opensslWinPath .. "/include" }
            libdirs(opensslWinLibDirs({ opensslWinEnv, opensslWinPath }))
            links   { "libssl", "libcrypto" }
        else
            libdirs { mbedtlsPath .. "/lib", mbedtlsPath .. "/library" }
            links   { "mbedtls", "mbedcrypto", "mbedx509" }
        end
    filter {}


---------------------------------------------------------------------
--  appweb (server executable)
---------------------------------------------------------------------

project "appweb"
    kind       "ConsoleApp"
    links      { "appweb-lib" }
    dependson  { "appweb-lib" }
    libdirs    { ROOT .. "/build/bin" }

    files { ROOT .. "/src/server/appweb.c" }

    filter "platforms:windows"
        links   { "ws2_32", "advapi32", "user32", "kernel32", "oldnames", "shell32" }
    filter {}


---------------------------------------------------------------------
--  httpcmd (http client utility)
---------------------------------------------------------------------

--
--  The target is named "http", matching doc/man/http.1 and the upstream http repository's own
--  httpcmd project. The premake project cannot also be called "http": the source file it builds
--  is src/http/http.c and premake derives object paths from the project name.
--
project "httpcmd"
    kind       "ConsoleApp"
    targetname "http"
    links      { "appweb-lib" }
    dependson  { "appweb-lib" }
    libdirs    { ROOT .. "/build/bin" }

    files { ROOT .. "/src/http/http.c" }

    filter "platforms:windows"
        links   { "ws2_32", "advapi32", "user32", "kernel32", "oldnames", "shell32" }
    filter {}


---------------------------------------------------------------------
--  authpass (password utility)
---------------------------------------------------------------------

project "authpass"
    kind       "ConsoleApp"
    links      { "appweb-lib" }
    dependson  { "appweb-lib" }
    libdirs    { ROOT .. "/build/bin" }

    files { ROOT .. "/src/utils/authpass.c" }

    filter "platforms:windows"
        links   { "ws2_32", "advapi32", "user32", "kernel32", "oldnames", "shell32" }
    filter {}


---------------------------------------------------------------------
--  cgiProgram (CGI test utility)
---------------------------------------------------------------------

--
--  cgiProgram is a standalone libc program. It must not link libappweb: the tests copy it
--  out of build/bin into cgi-bin, where an @rpath reference to libappweb.dylib cannot resolve.
--
project "cgiProgram"
    kind       "ConsoleApp"

    files { ROOT .. "/src/utils/cgiProgram.c" }

    filter "platforms:windows"
        links   { "ws2_32", "advapi32", "user32", "kernel32", "oldnames", "shell32" }
    filter {}


---------------------------------------------------------------------
--  fastProgram (FastCGI test utility)
---------------------------------------------------------------------

--
--  fastProgram links libfcgi only. As with cgiProgram, it is copied out of build/bin into
--  fast-bin, so it must not carry an @rpath reference to libappweb.dylib.
--
--  Not emitted for Windows. The FastCGI handler is ME_UNIX_LIKE only (fastHandler.c compiles to
--  nothing there), so there is no handler for the fixture to exercise, and libfcgi is not among the
--  dependencies a Windows build is expected to have. Emitting it only ever failed the whole Windows
--  build on a missing fcgiapp.h. test/fast/skip.sh already skips the group when the fixture is
--  absent, so the tests report as skipped rather than failing.
--
if not isVS then

project "fastProgram"
    kind       "ConsoleApp"
    links      { "fcgi" }

    files { ROOT .. "/src/utils/fastProgram.c" }

    filter "platforms:macosx"
        includedirs { fcgiMacPath .. "/include" }
        libdirs     { fcgiMacPath .. "/lib" }
    filter {}

end


---------------------------------------------------------------------
--  watchdog (process manager)
---------------------------------------------------------------------

project "watchdog"
    kind       "ConsoleApp"
    links      { "appweb-lib" }
    dependson  { "appweb-lib" }
    libdirs    { ROOT .. "/build/bin" }

    files { ROOT .. "/src/watchdog/watchdog.c" }

    filter "platforms:windows"
        kind    "WindowedApp"
        links   { "ws2_32", "advapi32", "user32", "kernel32", "oldnames", "shell32" }
    filter {}


---------------------------------------------------------------------
--  House build output
---------------------------------------------------------------------

--
--  Premake prints "Linking appweb" and a bare file name per compile. This project prints
--  "      [Link] appweb" and "        [CC] appweb.c", and drops premake's directory-creation lines,
--  per-project build banner and wiki footer.
--
--  Applied here as part of generation rather than by hand to the generated makefiles, so those stay
--  a pure function of this file and a hand edit cannot vanish at the next regeneration.
--  "make verify-projects" proves it and fails if they ever diverge.
--
local houseStyle = {
    --  Compile: premake emits the bare file name, quoted or not depending on the rule
    { '\n\t@echo "%$%(notdir %$<%)"\n',  '\n\t@echo "        [CC] $(notdir $<)"\n' },
    { '\n\t@echo %$%(notdir %$<%)\n',    '\n\t@echo "        [CC] $(notdir $<)"\n' },

    --  Link and clean: name the action and the target the way every other Embedthis build does
    { '\n\t@echo Linking ([%w%-_%.]+)\n',  '\n\t@echo "      [Link] %1"\n' },
    { '\n\t@echo Cleaning ([%w%-_%.]+)\n', '\n\t@echo "     [Clean] %1"\n' },

    --  Noise: creating a directory, and the per-project build banner
    { '\n\t@echo Creating %$%(TARGETDIR%)\n', '\n' },
    { '\n\t@echo Creating %$%(OBJDIR%)\n',    '\n' },
    { '\n\t@echo "==== Building [^\n]*\n',    '\n' },
}

--
--  The workspace makefile defaults to release. Premake defaults to the first configuration, which is
--  debug, so a bare "make" in this directory would build a different thing from a bare "make" at the
--  top, where OPTIMIZE defaults to release. The per-project makefiles keep premake's default: they are
--  driven by the workspace file, which always passes config= explicitly.
--
local workspaceStyle = {
    { '\nifndef config\n  config=debug_(%w+)\n', '\nifndef config\n  config=release_%1\n' },
}

local function applyHouseStyle(dir)
    local files = os.matchfiles(dir .. "/*.make")
    table.insert(files, dir .. "/Makefile")

    local count = 0
    for _, file in ipairs(files) do
        local text = io.readfile(file)
        if text then
            local original = text
            for _, rule in ipairs(houseStyle) do
                text = text:gsub(rule[1], rule[2])
            end
            if path.getname(file) == "Makefile" then
                for _, rule in ipairs(workspaceStyle) do
                    text = text:gsub(rule[1], rule[2])
                end
            end
            --  Premake leaves the workspace makefile without a final newline
            if text:sub(-1) ~= "\n" then
                text = text .. "\n"
            end
            if text ~= original then
                io.writefile(file, text)
                count = count + 1
            end
        end
    end
    return count
end

--
--  Hook the action rather than the emitters. The message-emitting functions inside the gmake module
--  are internal and have been renamed between premake releases; a text pass over the finished output
--  is the same transformation that was being applied by hand, and it survives a generator upgrade.
--
if not isVS and not isXcode then
    local action = premake.action.get(_ACTION)
    if action then
        local prior = action.onEnd
        action.onEnd = function(...)
            if prior then
                prior(...)
            end
            local n = applyHouseStyle("gmake2")
            print(string.format("Applied house build output to %d file(s)...", n))
        end
    end
end
