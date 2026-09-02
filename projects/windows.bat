@setlocal
@echo off
REM
REM   windows.bat -- Set the Visual Studio and OpenSSL environment, then run a command.
REM
REM   Usage: projects\windows.bat command [args ...]
REM
REM   Locates the most recent Visual Studio (2017 or later) unless the caller has already
REM   run vsvarsall.bat, then sources openssl-prep.bat to locate OpenSSL. Used by make.bat.
REM

REM
REM   The solution is x64-only -- projects/premake5.lua pins architecture "x86_64" for the windows
REM   platform -- so select the toolchain from what the solution targets, never from the host.
REM   Deriving the target from PROCESSOR_ARCHITECTURE put an arm64 cl.exe on PATH on an ARM64 host:
REM   the library still built x64 through the project files, but TestMe compiles the .tst.c tests
REM   with the cl.exe it finds on PATH and every one of them then failed to link against it.
REM
set CC_ARCH=x64

set ARCH=%PROCESSOR_ARCHITECTURE%
if "%ARCH%"=="" set ARCH=%PROCESSOR_ARCHITEW6432%
if "%ARCH%"=="" set ARCH=AMD64

if /I "%ARCH%"=="ARM64" (
    set HOST_ARCH=arm64
    set VCVARS_ARCH=arm64_amd64
) else if /I "%ARCH%"=="X86" (
    set HOST_ARCH=x86
    set VCVARS_ARCH=x86_amd64
) else (
    set HOST_ARCH=amd64
    set VCVARS_ARCH=amd64
)
echo Building for %CC_ARCH% on a %HOST_ARCH% host

if DEFINED VSINSTALLDIR GOTO :done

for %%e in (%VSEDITION%, Enterprise, Professional, Community) do (
    for /l %%v in (2028, -1, 2017) do (
        set VS=%%v
        IF EXIST "%PROGRAMFILES%\Microsoft Visual Studio\%%v\%%e\Common7\Tools\VsDevCmd.bat" call "%PROGRAMFILES%\Microsoft Visual Studio\%%v\%%e\Common7\Tools\VsDevCmd.bat" -arch=%CC_ARCH% -host_arch=%HOST_ARCH%
        IF EXIST "%PROGRAMFILES%\Microsoft Visual Studio\%%v\%%e\Common7\Tools\VsDevCmd.bat" goto :done
        IF EXIST "%PROGRAMFILES(x86)%\Microsoft Visual Studio\%%v\%%e\Common7\Tools\VsDevCmd.bat" call "%PROGRAMFILES(x86)%\Microsoft Visual Studio\%%v\%%e\Common7\Tools\VsDevCmd.bat" -arch=%CC_ARCH% -host_arch=%HOST_ARCH%
        IF EXIST "%PROGRAMFILES(x86)%\Microsoft Visual Studio\%%v\%%e\Common7\Tools\VsDevCmd.bat" goto :done
        IF EXIST "%PROGRAMFILES(arm)%\Microsoft Visual Studio\%%v\%%e\Common7\Tools\VsDevCmd.bat" call "%PROGRAMFILES(arm)%\Microsoft Visual Studio\%%v\%%e\Common7\Tools\VsDevCmd.bat" -arch=%CC_ARCH% -host_arch=%HOST_ARCH%
        IF EXIST "%PROGRAMFILES(arm)%\Microsoft Visual Studio\%%v\%%e\Common7\Tools\VsDevCmd.bat" goto :done
    )
)

for %%e in (%VSEDITION%, Enterprise, Professional, Community) do (
    for /l %%v in (2028, -1, 2017) do (
        set VS=%%v
        IF EXIST "%PROGRAMFILES%\Microsoft Visual Studio\%%v\%%e\VC\Auxiliary\Build\vcvarsall.bat" call "%PROGRAMFILES%\Microsoft Visual Studio\%%v\%%e\VC\Auxiliary\Build\vcvarsall.bat" %VCVARS_ARCH%
        IF EXIST "%PROGRAMFILES%\Microsoft Visual Studio\%%v\%%e\VC\Auxiliary\Build\vcvarsall.bat" goto :done
        IF EXIST "%PROGRAMFILES(x86)%\Microsoft Visual Studio\%%v\%%e\VC\Auxiliary\Build\vcvarsall.bat" call "%PROGRAMFILES(x86)%\Microsoft Visual Studio\%%v\%%e\VC\Auxiliary\Build\vcvarsall.bat" %VCVARS_ARCH%
        IF EXIST "%PROGRAMFILES(x86)%\Microsoft Visual Studio\%%v\%%e\VC\Auxiliary\Build\vcvarsall.bat" goto :done
    )
    for /l %%v in (20, -1, 9) do (
        set VS=%%v
        IF EXIST "%PROGRAMFILES%\Microsoft Visual Studio\%%v\%%e\VC\Auxiliary\Build\vcvarsall.bat" call "%PROGRAMFILES%\Microsoft Visual Studio\%%v\%%e\VC\Auxiliary\Build\vcvarsall.bat" %VCVARS_ARCH%
        IF EXIST "%PROGRAMFILES%\Microsoft Visual Studio\%%v\%%e\VC\Auxiliary\Build\vcvarsall.bat" goto :done
        IF EXIST "%PROGRAMFILES(x86)%\Microsoft Visual Studio\%%v\%%e\VC\Auxiliary\Build\vcvarsall.bat" call "%PROGRAMFILES(x86)%\Microsoft Visual Studio\%%v\%%e\VC\Auxiliary\Build\vcvarsall.bat" %VCVARS_ARCH%
        IF EXIST "%PROGRAMFILES(x86)%\Microsoft Visual Studio\%%v\%%e\VC\Auxiliary\Build\vcvarsall.bat" goto :done
    )
)

set e=
for /l %%v in (20, -1, 9) do (
    set VS=%%v
    IF EXIST "%PROGRAMFILES(x86)%\Microsoft Visual Studio %%v.0\VC\vcvarsall.bat" call "%PROGRAMFILES(x86)%\Microsoft Visual Studio %%v.0\VC\vcvarsall.bat" %VCVARS_ARCH%
    IF EXIST "%PROGRAMFILES(x86)%\Microsoft Visual Studio %%v.0\VC\vcvarsall.bat" goto :done
    IF EXIST "%PROGRAMFILES%\Microsoft Visual Studio %%v.0\VC\vcvarsall.bat" call "%PROGRAMFILES%\Microsoft Visual Studio %%v.0\VC\vcvarsall.bat" %VCVARS_ARCH%
    IF EXIST "%PROGRAMFILES%\Microsoft Visual Studio %%v.0\VC\vcvarsall.bat" goto :done
    IF EXIST "%PROGRAMFILES%\Microsoft Visual Studio %%v\VC\vcvarsall.bat" call "%PROGRAMFILES%\Microsoft Visual Studio %%v.0\VC\vcvarsall.bat" %VCVARS_ARCH%
    IF EXIST "%PROGRAMFILES%\Microsoft Visual Studio %%v\VC\vcvarsall.bat" goto :done
)

:done

if NOT DEFINED VSINSTALLDIR (
    @echo.
    @echo ERROR: Visual Studio not found.
    @echo Please install Visual Studio 2017 or later with C++ build tools.
    @echo Download from: https://visualstudio.microsoft.com/downloads/
    @echo.
    exit /b 1
)

@echo.
@echo Using Visual Studio %VS% (v%VisualStudioVersion%) from %VSINSTALLDIR% for %CC_ARCH%
@echo.

REM Locate OpenSSL and export INCLUDE, LIB and ME_COM_OPENSSL_PATH for the build
call "%~dp0openssl-prep.bat"

@echo %*
%*
