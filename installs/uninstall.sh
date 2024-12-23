#!/bin/bash
#
#	uninstall: Appweb uninstall script
#
#	Copyright (c) Embedthis Software. All Rights Reserved.
#
#	Usage: uninstall [configFile]
#
################################################################################

HOME=`pwd`
FMT=

PRODUCT="${settings.name}"
COMPANY="${settings.company}"
NAME="${settings.title}"
VERSION="${settings.version}"
OS="${platform.os}"

ROOT_PREFIX="${prefixes.root}"
BASE_PREFIX="${prefixes.base}"
STATE_PREFIX="${prefixes.state}"
APP_PREFIX="${prefixes.app}"
VAPP_PREFIX="${prefixes.vapp}"

BIN_PREFIX="${prefixes.bin}"
SBIN_PREFIX="${prefixes.sbin}"
ETC_PREFIX="${prefixes.etc}"
INC_PREFIX="${prefixes.inc}"
LIB_PREFIX="${prefixes.lib}"
MAN_PREFIX="${prefixes.man}"
WEB_PREFIX="${prefixes.web}"
LOG_PREFIX="${prefixes.log}"
SPL_PREFIX="${prefixes.spool}"
CACHE_PREFIX="${prefixes.cache}"

ABIN="${VAPP_PREFIX}/bin"
AINC="${VAPP_PREFIX}/inc"

removebin=Y
headless=${HEADLESS:-0}

PATH=$PATH:/sbin:/usr/sbin
export CYGWIN=nodosfilewarning
unset CDPATH

###############################################################################
# 
#	Get a yes/no answer from the user. Usage: ans=`yesno "prompt" "default"`
#	Echos 1 for Y or 0 for N
#
yesno() {
    if [ "$headless" = 1 ] ; then
        echo "Y"
        return
    fi
    echo -n "$1 [$2] : " 1>&2
    while [ 1 ] 
    do
        read ans
        if [ "$ans" = "" ] ; then
            echo $2 ; break
        elif [ "$ans" = "Y" -o "$ans" = "y" ] ; then
            echo "Y" ; break
        elif [ "$ans" = "N" -o "$ans" = "n" ] ; then
            echo "N" ; break
        fi
        echo -e "\nMust enter a 'y' or 'n'\n " 1>&1
    done
}


deconfigureService() {
    [ "$headless" != 1 ] && echo -e "Stopping $NAME service"
    if [ $OS = windows ] ; then
        "$ABIN/appwebMonitor" --stop >/dev/null 2>&1
    fi
    # Fedora will indiscriminately kill appman here too
    # Need this ( ; true) to suppress the Killed message
    (appman -v stop ; true) >/dev/null 2>&1
    [ "$headless" != 1 ] && echo -e "Removing $NAME service"
    appman disable 
    appman uninstall
    if [ -f "$ABIN/$PRODUCT" ] ; then
        if which pidof >/dev/null 2>&1 ; then
            pid=`pidof $ABIN/$PRODUCT`
        else
            pid=`ps -ef | grep $ABIN/$PRODUCT | grep -v 'grep' | awk '{print $2}'`
        fi
        [ "$pid" != "" ] && kill -9 $pid >/dev/null 2>&1
    fi
} 


removeFiles() {
    local pkg doins name

    [ "$headless" != 1 ] && echo
    for pkg in bin ; do
        doins=`eval echo \\$install${pkg}`
        if [ "$doins" = Y ] ; then
            suffix="-${pkg}"
            if [ "$pkg" = bin ] ; then
            	name="${PRODUCT}"
            else 
            	name="${PRODUCT}${suffix}"
            fi
            if [ "$FMT" = "rpm" ] ; then
            	[ "$headless" != 1 ] && echo -e "Running \"rpm -e $name\""
            	rpm -e $name
            elif [ "$FMT" = "deb" ] ; then
            	[ "$headless" != 1 ] && echo -e "Running \"dpkg -r $name\""
            	dpkg -r $name >/dev/null
            else
            	removeTarFiles $pkg
            fi
        elif [ "$doins" = "" ] ; then
            removeTarFiles $pkg
        fi
    done
}


removeTarFiles() {
    local pkg prefix
    local cdir=`pwd`

    pkg=$1
    [ $pkg = bin ] && prefix="$VAPP_PREFIX"
    if [ -f "$prefix/files.log" ] ; then
        if [ $OS = windows ] ; then
            cd ${prefix%%:*}:/
        else
            cd /
        fi
        removeFileList "$prefix/files.log"
        cd "$cdir"
        rm -f "$prefix/files.log"
    fi
}


preClean() {
    local f
    local cdir=`pwd`

    if [ $OS != windows ] ; then
        rm -f /var/lock/subsys/$PRODUCT /var/lock/$PRODUCT
        rm -fr "${LOG_PREFIX}"
        rm -rf "${SPOOL_PREFIX}"
        rm -rf /var/run/$PRODUCT
    fi
    if [ -x "$APP_PREFIX" ] ; then
        cd "$APP_PREFIX"
        removeIntermediateFiles *.dylib *.dll *.exp *.lib
    fi
    if [ -x "$ETC_PREFIX" ] ; then
        cd "$ETC_PREFIX"
        removeIntermediateFiles access.log* error.log* '*.log.old' .dummy $PRODUCT.conf make.log $PRODUCT.conf.bak
    fi
    if [ -x "$WEB_PREFIX" ] ; then
        cd "$WEB_PREFIX"
        removeIntermediateFiles *.mod 
    fi
    if [ -x "$SPL_PREFIX" ] ; then
        cd "$SPL_PREFIX"
        removeIntermediateFiles *.mod *.c *.dll *.exp *.lib *.obj *.o *.dylib *.so
    fi
    if [ -x "$CACHE_PREFIX" ] ; then
        cd "$CACHE_PREFIX"
        removeIntermediateFiles *.mod *.c *.dll *.exp *.lib *.obj *.o *.dylib *.so
    fi
    cd "$cdir"
}


postClean() {
    local cdir=`pwd`

    cleanDir "${ABIN}"
    cleanDir "${APP_PREFIX}"
    cleanDir "${ETC_PREFIX}"
    cleanDir "${WEB_PREFIX}"
    cleanDir "${SPL_PREFIX}"
    cleanDir "${CACHE_PREFIX}"

    if [ $OS != windows ] ; then
        for p in APP VAPP ETC WEB SPL CACHE; do
            eval rmdir "\$${p}_PREFIX" >/dev/null 2>&1
        done
    fi
    rm -f "${APP_PREFIX}/.port.log"
    cleanDir "${VAPP_PREFIX}"
    rm -f "${APP_PREFIX}/latest"
    cleanDir "${APP_PREFIX}"
    cleanDir "${INC_PREFIX}/${PRODUCT}"
    if [ $OS = macosx ] ; then
        pkgutil --forget com.${COMPANY}.${PRODUCT}.pkg >/dev/null 2>&1
    fi
}


removeFileList() {
    if [ -f "$1" ] ; then
        [ "$headless" != 1 ] && echo -e "Removing files in file list \"$1\" ..."
        cat "$1" | while read f
        do
            rm -f "$f"
        done
    fi
}


#
#	Cleanup empty directories. Usage: cleanDir directory
#
cleanDir() {
    local dir
    local cdir=`pwd`

    dir="$1"
    [ ! -d "$dir" ] && return

    cd "$dir"
    if [ "`pwd`" = "/" ] ; then
        echo "Configuration error: clean directory was '/'"
        cd "$cdir"
        return
    fi
    find . -type d -print | sort -r | grep -v '^\.$' | while read d
    do
        count=`ls "$d" 2>/dev/null | wc -l | sed -e 's/ *//'`
        [ "$count" = "0" ] && rmdir "$d" >/dev/null 2>&1
    done 

    if [ -d "$cdir" ] ; then
        cd "$cdir"
        count=`ls "$dir" 2>/dev/null | wc -l | sed -e 's/ *//'`
        [ "$count" = "0" ] && rmdir "$dir" >/dev/null 2>&1
        rmdir "$dir" 2>/dev/null
    fi
}


removeIntermediateFiles() {
    local cdir=`pwd`

    find "`pwd`" -type d -print | while read d ; do
        cd "${d}"
        eval rm -f "$*"
        cd "${cdir}"
    done
}


setup() {
    if [ `id -u` != "0" -a $OS != windows ] ; then
        echo "You must be root to remove this product."
        exit 255
    fi
    #
    #	Headless removal. Expect an argument that supplies a config file.
    #
    if [ $# -ge 1 ] ; then
        if [ ! -f $1 ] ; then
            echo "Could not find config file \"$1\""
            exit 255
        else
            . $1 
            removeFiles $FMT
        fi
        exit 0
    fi
    binDir=${binDir:-$APP_PREFIX}
    [ "$headless" != 1 ] && echo -e "\n$NAME ${VERSION} Removal\n"
}


askUser() {
    local finished

    [ "$headless" != 1 ] && echo "Enter requested information or press <ENTER> to accept the defaults. "

    #
    #	Confirm the configuration
    #
    finished=N
    while [ "$finished" = "N" ]
    do
        [ "$headless" != 1 ] && echo
        if [ -d "$binDir" ] ; then
            removebin=`yesno "Remove binary package" "$removebin"`
        else
            removebin=N
        fi
        if [ "$headless" != 1 ] ; then
            echo -e "\nProceed removing with these instructions:" 
            [ $removebin = Y ] && echo -e "  Remove binary package: $removebin"
        fi
        [ "$headless" != 1 ] && echo
        finished=`yesno "Accept these instructions" "Y"`
        if [ "$finished" != "Y" ] ; then
            exit 0
        fi
    done
    [ "$headless" != 1 ] && echo
}


#
#	Main program
#
cd /
setup $*
askUser

if [ "$removebin" = "Y" ] ; then
    deconfigureService
    preClean
    removeFiles $FMT
    postClean
    [ "$headless" != 1 ] && echo -e "$NAME uninstall successful"
fi
exit 0
