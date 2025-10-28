#!/bin/sh

# NPH (Non-Parsed Header) CGI script must output complete HTTP response
# Default to HTTP/1.0 if SERVER_PROTOCOL not set
PROTOCOL=${SERVER_PROTOCOL:-HTTP/1.0}

printf "%s 200 OK\r\n" "$PROTOCOL"
printf "Content-type: text/html\r\n"
printf "Connection: close\r\n"
printf "Custom-Header: true\r\n"
printf "\r\n"
printf "<html><body><p>NPH-CGI program</p>\r\n"
printf "</body></html>\r\n"
