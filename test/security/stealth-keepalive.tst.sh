#!/usr/bin/env bash
# Stealth suppresses identifying hints while preserving persistent HTTP/1.1 connections.
set -eu
unset CDPATH
if [ -n "${WINDIR:-}" ] || ! command -v python3 >/dev/null; then
    echo "SKIP: this isolated listener test needs Unix and Python 3"
    exit 0
fi
python3 - "$(cd "$(dirname "$0")/../.." && pwd)" <<'PY'
import pathlib, socket, subprocess, sys, tempfile, time
root = pathlib.Path(sys.argv[1])
with tempfile.TemporaryDirectory(prefix='appweb-stealth-') as work:
    work = pathlib.Path(work)
    with socket.socket() as reserve:
        reserve.bind(('127.0.0.1', 0))
        port = reserve.getsockname()[1]
    conf = work / 'appweb.conf'
    conf.write_text(f'''Listen 127.0.0.1:{port}
Documents {root}/test/web
ErrorLog {work}/server.log level=2
Stealth on
AddHandler fileHandler html txt ""
<Route ^/verbose/(.*)$>
    Stealth off
    Prefix /verbose
    Documents {root}/test/web
    Target run $1
</Route>
''')
    server = subprocess.Popen([str(root / 'build/bin/appweb'), '--config', str(conf)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    try:
        for _ in range(100):
            try:
                client = socket.create_connection(('127.0.0.1', port), timeout=3)
                break
            except OSError:
                assert server.poll() is None, (work / 'server.log').read_text()
                time.sleep(.02)
        else:
            raise AssertionError('server did not start')
        with client:
            reader = client.makefile('rb')
            for verbose in (False, True):
                path = '/verbose/index.html' if verbose else '/index.html'
                client.sendall(f'GET {path} HTTP/1.1\r\nHost: localhost\r\n\r\n'.encode())
                status = reader.readline()
                assert b' 200 ' in status, status
                headers = {}
                while True:
                    line = reader.readline()
                    if line == b'\r\n':
                        break
                    assert line, 'premature EOF'
                    name, value = line.decode().split(':', 1)
                    headers[name.lower()] = value.strip()
                assert ('server' in headers) == verbose, headers
                assert ('keep-alive' in headers) == verbose, headers
                assert headers.get('connection', '').lower() == 'keep-alive', headers
                length = int(headers['content-length'])
                body = reader.read(length)
                assert len(body) == length and length > 0
            reader.close()
        print('PASS: Stealth on/off headers and two sequential responses on one connection')
    finally:
        server.kill()
        server.wait()
PY
