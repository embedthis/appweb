#!/usr/bin/env bash
#
#   skip.sh - Skip test if Proxy is not available
#

def=`grep '#define.*ME_COM_PROXY' build/*dev/inc/me.h | sed -e 's/.*PROXY //'`
    
if [ "${def}" != "1" ]; then
    echo "Proxy is not available"
    exit 1
fi
exit 0