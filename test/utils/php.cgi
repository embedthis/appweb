#!/bin/bash
#
#   php.cgi - Invoke PHP as a CGI program, for the upload and flow-control PHP cases
#
#   Resolved from PATH rather than hardcoded. The Action directive this replaces named
#   /usr/local/bin/php-cgi, which is an Intel-Homebrew path: on Apple silicon, on Linux and in the
#   container it resolves to nothing, so the PHP cases could not have run anywhere the suite is
#   actually executed. Nothing noticed, because nothing tested PHP.
#
#   The tests probe for php-cgi themselves and skip with a reason when it is absent, so this script
#   failing to find one is reported by the test rather than by a mystery 500.
#
#   cgi.force_redirect defaults on and makes php-cgi refuse to run unless the server sets
#   REDIRECT_STATUS. Appweb does not, and the correct answer for a server that invokes the binary
#   directly (rather than exposing it as a document) is to turn the check off.
#
exec php-cgi -d cgi.force_redirect=0 "$@"
