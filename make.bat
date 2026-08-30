@echo off
REM Build Appweb using pre-generated VS2022 projects
projects\windows.bat msbuild projects\vs2022\appweb.sln /p:Configuration=Debug %1 %2 %3 %4 %5 %6 %7 %8 %9
