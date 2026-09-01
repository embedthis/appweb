@echo off
REM
REM   hdrtest.bat -- Windows entry point for the hdrtest CGI fixture.
REM
REM   hdrtest.cgi beside this file is "#!/bin/sh". A native Windows process has no /bin/sh, so appweb
REM   reads the shebang, cannot find the interpreter, and every case answered 404 -- which asserts
REM   nothing about how the CGI handler frames a response. ".bat" is in the cgiHandler extension list,
REM   so this can be started instead.
REM
REM   It runs hdrtest.cgi rather than reimplementing it. The cases are byte-exact response headers,
REM   including malformed ones, and two of them send a lone CR that batch cannot emit at all -- a
REM   second copy of that table would be a second thing to keep right. sh comes from PATH: the suite
REM   runs under it, and appweb inherits the environment of the shell that started it.
REM
sh "%~dp0hdrtest.cgi"
exit /b %errorlevel%
