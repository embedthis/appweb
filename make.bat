@echo off
REM
REM   make.bat -- Build Appweb from the pre-generated VS2022 projects.
REM
REM   Usage: make.bat [debug|release] [msbuild args ...]
REM
REM   The solution's configurations are "debug|windows" and "release|windows". msbuild resolves
REM   neither from a Configuration alone: it pairs the name with the host architecture and stops with
REM   "MSB4126: The specified solution configuration is invalid", naming a platform the solution has
REM   never had. Both properties are passed here.
REM
setlocal

set "CONFIG=debug"
if /I "%~1"=="debug" goto :shift
if /I "%~1"=="release" goto :release
goto :build

:release
set "CONFIG=release"

:shift
shift

:build
projects\windows.bat msbuild projects\vs2022\appweb.sln /p:Configuration=%CONFIG% /p:Platform=windows %1 %2 %3 %4 %5 %6 %7 %8 %9
