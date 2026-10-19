@echo off
REM
REM   make.bat -- Build Appweb from the pre-generated VS2022 projects.
REM
REM   Usage: make.bat [debug|release|test] [msbuild args ...]
REM
REM   The default is release, as for make on Unix. test is the release build plus the test handler modules the
REM   suite drives.
REM
REM   The solution's configurations are "debug|windows", "release|windows" and "test|windows". msbuild resolves
REM   neither from a Configuration alone: it pairs the name with the host architecture and stops with
REM   "MSB4126: The specified solution configuration is invalid", naming a platform the solution has
REM   never had. Both properties are passed here.
REM
setlocal

set "CONFIG=release"
if /I "%~1"=="debug" goto :debug
if /I "%~1"=="release" goto :shift
if /I "%~1"=="test" goto :test
goto :build

:debug
set "CONFIG=debug"
goto :shift

:test
set "CONFIG=test"

:shift
shift

:build
projects\windows.bat msbuild projects\vs2022\appweb.sln /p:Configuration=%CONFIG% /p:Platform=windows %1 %2 %3 %4 %5 %6 %7 %8 %9
