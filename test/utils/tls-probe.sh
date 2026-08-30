#!/bin/bash
#
#   tls-probe.sh - Attempt one mutually authenticated TLS request and report whether it was served
#
#   usage: tls-probe.sh port clientCert clientKey [chainCert]
#
#   Prints one word on stdout and always exits 0, so the caller distinguishes a served request from a
#   refused certificate rather than from a failed command:
#
#       ACCEPT              The server completed the handshake and served the request
#       REJECT[reason]      It did not. The reason is the TLS alert, when the server sent one
#       ABSENT              Nothing is listening. The endpoint only exists in a build with SSL, so
#                           the caller uses this to tell "not configured" from "refused"
#
#   No SNI name is sent. The test configuration has virtual hosts that match on server name, and a
#   name would select one of those instead of the endpoint being probed.
#

cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1

port="$1"
cert="$2"
key="$3"
chain="$4"

if [ -z "$port" ] || [ -z "$cert" ] || [ -z "$key" ]; then
    echo "REJECT[usage]"
    exit 0
fi

args=(-quiet -verify_quiet -connect "127.0.0.1:$port" -CAfile pki/root.crt -cert "$cert" -key "$key")
if [ -n "$chain" ]; then
    args+=(-cert_chain "$chain")
fi

#
#   HTTP/1.0 so the server closes the connection when the response is complete. s_client -quiet
#   implies -ign_eof, so it waits for that close rather than for the end of its own input, and a
#   kept-alive connection would stall the probe until a timeout.
#
out=$(printf 'GET /index.html HTTP/1.0\r\nHost: localhost\r\n\r\n' |
      openssl s_client "${args[@]}" 2>&1)

if echo "$out" | grep -q 'HTTP/1.0 200'; then
    echo "ACCEPT"
elif echo "$out" | grep -qiE 'connection refused|connect:errno'; then
    echo "ABSENT"
else
    echo "REJECT[$(echo "$out" | grep -oE 'alert [a-z ]+' | head -1 | sed 's/alert //' | tr -d '\n')]"
fi
exit 0
