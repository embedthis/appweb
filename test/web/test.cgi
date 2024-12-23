#!/usr/bin/env ejs

print("HTTP/1.0 200 OK
Content-Type: text/plain

Simple CGI Program
" + serialize(App.env, {pretty: true}) + "
")
