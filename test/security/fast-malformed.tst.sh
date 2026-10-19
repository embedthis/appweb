#!/usr/bin/env bash
# A malformed backend header must end the client request before its request timeout.
set -eu
unset CDPATH
if [ -n "${WINDIR:-}" ] || ! command -v python3 >/dev/null; then
    echo "SKIP: this FastCGI wire test needs Unix and Python 3"
    exit 0
fi
python3 - "$(cd "$(dirname "$0")/../.." && pwd)" <<'PY'
import pathlib, socket, subprocess, sys, tempfile, threading, time
root = pathlib.Path(sys.argv[1])
with tempfile.TemporaryDirectory(prefix='appweb-fast-malformed-') as work:
    work = pathlib.Path(work)
    backend = socket.socket()
    backend.bind(('127.0.0.1', 0))
    backend.listen()
    backend.settimeout(10)
    with socket.socket() as port_socket:
        port_socket.bind(('127.0.0.1', 0))
        port = port_socket.getsockname()[1]
    cases = [(0, 7), (2, 7), (1, 4), (1, 255)]
    errors = []
    def serve():
        try:
            for version, record in cases:
                conn, _ = backend.accept()
                with conn:
                    conn.settimeout(5)
                    request = conn.recv(65536)
                    assert len(request) >= 8
                    # Invalid types must fail even when their claimed body never arrives.
                    length = 1 if record == 4 else 0
                    conn.sendall(bytes([version, record, request[2], request[3], 0, length, 0, 0]))
                    # Keep the connection open until Appweb rejects it, so EOF cannot mask the bug.
                    try:
                        while conn.recv(65536):
                            pass
                    except ConnectionResetError:
                        pass
        except Exception as error:
            errors.append(error)
    thread = threading.Thread(target=serve, daemon=True)
    thread.start()
    conf = work / 'appweb.conf'
    conf.write_text(f'''Listen 127.0.0.1:{port}
Documents {root}/test/web
ErrorLog {work}/server.log level=2
RequestTimeout 10secs
AddHandler fileHandler html txt ""
<Route ^/bad/(.*)$>
    AddHandler fastHandler
    Prefix /bad
    Documents {root}/test/fast-bin
    FastConnect 127.0.0.1:{backend.getsockname()[1]} keep min=0 max=1 timeout=10secs multiplex=1
    Target run $1
</Route>
''')
    server = subprocess.Popen([str(root / 'build/bin/appweb'), '--config', str(conf)],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    try:
        for _ in range(100):
            try:
                with socket.create_connection(('127.0.0.1', port), timeout=.1):
                    break
            except OSError:
                assert server.poll() is None, (work / 'server.log').read_text()
                time.sleep(.02)
        for version, record in cases:
            start = time.monotonic()
            with socket.create_connection(('127.0.0.1', port), timeout=3) as client:
                client.settimeout(3)
                client.sendall(b'GET /bad/test HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n')
                response = b''
                while b'\r\n' not in response:
                    data = client.recv(4096)
                    assert data, 'connection closed without a status'
                    response += data
            assert b' 502 ' in response.split(b'\r\n')[0], response
            assert time.monotonic() - start < 3
            print(f'PASS: version={version}, type={record} returned 502 before timeout')
        thread.join(6)
        assert not errors, errors
        assert not thread.is_alive(), 'backend did not close'
    finally:
        server.kill()
        server.wait()
        backend.close()
PY
