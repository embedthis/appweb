#!/bin/sh

echo "$SERVER_PROTOCOL 200 OK\r"
echo "Content-type: text/html\r"
echo "Connection: close\r"
echo "Custom-Header: true\r"
echo "\r"
echo "<html><body><p>NPH-CGI program</p>\r"
echo "</body></html>\r"
