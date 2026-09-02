@echo off
REM
REM   Auto-detect OpenSSL and export its location for the build.
REM   Also copies OpenSSL DLLs to build\bin for runtime.
REM
REM   Search priority:
REM     1. ME_COM_OPENSSL_PATH (explicit user override)
REM     2. vcpkg install (%USERPROFILE%\vcpkg\installed\x64-windows-static, then x64-windows)
REM     3. System install (C:\Program Files\OpenSSL or OpenSSL-Win64)
REM
REM   ME_COM_OPENSSL_PATH is what the msbuild projects consume: they name
REM   $(ME_COM_OPENSSL_PATH)\include and $(ME_COM_OPENSSL_PATH)\lib... in their include and library
REM   directories, so any install this script finds is used without regenerating them. INCLUDE and
REM   LIB are set as well, for the tools that read them directly -- TestMe compiles the .tst.c tests
REM   by invoking cl.exe itself. They do NOT reach a compile driven by msbuild, which overwrites
REM   both from the project's own IncludePath and LibraryPath; setting them was once the only
REM   mechanism here, and the build stopped at "Cannot open include file: 'openssl/opensslv.h'".
REM
REM   NOTE: No setlocal - all variables are exported to the caller.
REM

REM
REM   The solution is x64-only (projects/premake5.lua pins architecture "x86_64" for the windows
REM   platform), so the OpenSSL to find is x64 whatever the host is. Deriving this from
REM   PROCESSOR_ARCHITECTURE sent an ARM64 host looking for an arm64 OpenSSL to link into an x64
REM   library.
REM
set SSL_ARCH=x64

REM Search for OpenSSL (single-line ifs to avoid block expansion issues)
set "SSL_DIR="

if defined ME_COM_OPENSSL_PATH if exist "%ME_COM_OPENSSL_PATH%\include\openssl\ssl.h" set "SSL_DIR=%ME_COM_OPENSSL_PATH%"
if defined SSL_DIR goto :found

REM
REM   The projects compile /MTd and /MT, so OpenSSL must be built against the static CRT.
REM   x64-windows-static is the vcpkg triplet that matches; the default x64-windows triplet is
REM   dynamic-CRT and fails at link with a RuntimeLibrary mismatch that names neither vcpkg nor the
REM   triplet. Prefer the static one, and fall back to the other so its failure is at least the
REM   familiar one.
REM
if exist "%USERPROFILE%\vcpkg\installed\%SSL_ARCH%-windows-static\include\openssl\ssl.h" set "SSL_DIR=%USERPROFILE%\vcpkg\installed\%SSL_ARCH%-windows-static"
if defined SSL_DIR goto :found

if exist "%USERPROFILE%\vcpkg\installed\%SSL_ARCH%-windows\include\openssl\ssl.h" set "SSL_DIR=%USERPROFILE%\vcpkg\installed\%SSL_ARCH%-windows"
if defined SSL_DIR goto :found

if exist "C:\Program Files\OpenSSL\include\openssl\ssl.h" set "SSL_DIR=C:\Program Files\OpenSSL"
if defined SSL_DIR goto :found

if exist "C:\Program Files\OpenSSL-Win64\include\openssl\ssl.h" set "SSL_DIR=C:\Program Files\OpenSSL-Win64"
if defined SSL_DIR goto :found

echo WARNING: OpenSSL not found. Build may fail.
echo Searched:
if defined ME_COM_OPENSSL_PATH echo   - %ME_COM_OPENSSL_PATH% (ME_COM_OPENSSL_PATH)
echo   - %USERPROFILE%\vcpkg\installed\%SSL_ARCH%-windows-static
echo   - %USERPROFILE%\vcpkg\installed\%SSL_ARCH%-windows
echo   - C:\Program Files\OpenSSL
echo   - C:\Program Files\OpenSSL-Win64
echo Install with: vcpkg install openssl:%SSL_ARCH%-windows-static
goto :eof

:found

echo Found OpenSSL at: %SSL_DIR%

REM Set INCLUDE for the compiler
set "INCLUDE=%SSL_DIR%\include;%INCLUDE%"

REM Add all possible lib subdirectories to LIB
REM The Shining Light OpenSSL installer uses lib\VC\<arch>\<crt> layout
REM vcpkg uses lib\ directly
set "LIB=%SSL_DIR%\lib;%LIB%"
if exist "%SSL_DIR%\lib\VC\%SSL_ARCH%\MTd" set "LIB=%SSL_DIR%\lib\VC\%SSL_ARCH%\MTd;%LIB%"
if exist "%SSL_DIR%\lib\VC\%SSL_ARCH%\MT"  set "LIB=%SSL_DIR%\lib\VC\%SSL_ARCH%\MT;%LIB%"
if exist "%SSL_DIR%\lib\VC\%SSL_ARCH%\MDd" set "LIB=%SSL_DIR%\lib\VC\%SSL_ARCH%\MDd;%LIB%"
if exist "%SSL_DIR%\lib\VC\%SSL_ARCH%\MD"  set "LIB=%SSL_DIR%\lib\VC\%SSL_ARCH%\MD;%LIB%"

REM Set ME_COM_OPENSSL_PATH and ARCH for the projects and for downstream scripts (e.g. TestMe)
set "ME_COM_OPENSSL_PATH=%SSL_DIR%"
set "ARCH=%SSL_ARCH%"

REM Copy DLLs to build\bin for runtime. A static-CRT vcpkg install has none, and needs none.
if not exist "build\bin" mkdir "build\bin"

REM Copy from vcpkg bin directory
if exist "%USERPROFILE%\vcpkg\installed\%SSL_ARCH%-windows\bin\libcrypto-3-%SSL_ARCH%.dll" (
    echo Copying OpenSSL DLLs from vcpkg
    powershell -Command "Copy-Item '%USERPROFILE%\vcpkg\installed\%SSL_ARCH%-windows\bin\libcrypto-*.dll' 'build\bin\' -Force -ErrorAction SilentlyContinue"
    powershell -Command "Copy-Item '%USERPROFILE%\vcpkg\installed\%SSL_ARCH%-windows\bin\libssl-*.dll' 'build\bin\' -Force -ErrorAction SilentlyContinue"
)

REM Copy from SSL_DIR bin directory
if exist "%SSL_DIR%\bin\libcrypto-3-%SSL_ARCH%.dll" (
    echo Copying OpenSSL DLLs from %SSL_DIR%
    powershell -Command "Copy-Item '%SSL_DIR%\bin\libcrypto-*.dll' 'build\bin\' -Force -ErrorAction SilentlyContinue"
    powershell -Command "Copy-Item '%SSL_DIR%\bin\libssl-*.dll' 'build\bin\' -Force -ErrorAction SilentlyContinue"
)

echo OpenSSL configured: %SSL_DIR%
