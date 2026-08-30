#!/usr/bin/env bash
#
#   skip.sh - Skip test if Proxy is not available
#
#   The proxy handler is compiled into libappweb (ME_COM_PROXY), but PROXY_MODULE
#   is only enabled on Unix-like systems. See PROXY_MODULE in src/config.c.
#

if [ "${TESTME_OS}" = "windows" ]; then
    echo "Proxy is not available on Windows"
    exit 1
fi
exit 0
