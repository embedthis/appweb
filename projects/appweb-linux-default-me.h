/*
    me.h -- MakeMe Configure Header for linux-x64-default
 */

/* Settings */
#ifndef ME_AUTHOR
    #define ME_AUTHOR "Embedthis Software"
#endif
#ifndef ME_CERTS_GENDH
    #define ME_CERTS_GENDH 1
#endif
#ifndef ME_COMPANY
    #define ME_COMPANY "embedthis"
#endif
#ifndef ME_COMPAT
    #define ME_COMPAT 1
#endif
#ifndef ME_COMPATIBLE
    #define ME_COMPATIBLE "9.0"
#endif
#ifndef ME_COMPILER_FORTIFY
    #define ME_COMPILER_FORTIFY 1
#endif
#ifndef ME_COMPILER_HAS_ATOMIC
    #define ME_COMPILER_HAS_ATOMIC 1
#endif
#ifndef ME_COMPILER_HAS_ATOMIC64
    #define ME_COMPILER_HAS_ATOMIC64 1
#endif
#ifndef ME_COMPILER_HAS_DOUBLE_BRACES
    #define ME_COMPILER_HAS_DOUBLE_BRACES 1
#endif
#ifndef ME_COMPILER_HAS_DYN_LOAD
    #define ME_COMPILER_HAS_DYN_LOAD 1
#endif
#ifndef ME_COMPILER_HAS_LIB_EDIT
    #define ME_COMPILER_HAS_LIB_EDIT 0
#endif
#ifndef ME_COMPILER_HAS_LIB_RT
    #define ME_COMPILER_HAS_LIB_RT 1
#endif
#ifndef ME_COMPILER_HAS_MMU
    #define ME_COMPILER_HAS_MMU 1
#endif
#ifndef ME_COMPILER_HAS_MTUNE
    #define ME_COMPILER_HAS_MTUNE 1
#endif
#ifndef ME_COMPILER_HAS_PAM
    #define ME_COMPILER_HAS_PAM 0
#endif
#ifndef ME_COMPILER_HAS_STACK_PROTECTOR
    #define ME_COMPILER_HAS_STACK_PROTECTOR 1
#endif
#ifndef ME_COMPILER_HAS_SYNC
    #define ME_COMPILER_HAS_SYNC 1
#endif
#ifndef ME_COMPILER_HAS_SYNC64
    #define ME_COMPILER_HAS_SYNC64 1
#endif
#ifndef ME_COMPILER_HAS_SYNC_CAS
    #define ME_COMPILER_HAS_SYNC_CAS 1
#endif
#ifndef ME_COMPILER_HAS_UNNAMED_UNIONS
    #define ME_COMPILER_HAS_UNNAMED_UNIONS 1
#endif
#ifndef ME_COMPILER_NOEXECSTACK
    #define ME_COMPILER_NOEXECSTACK 1
#endif
#ifndef ME_COMPILER_WARN64TO32
    #define ME_COMPILER_WARN64TO32 0
#endif
#ifndef ME_COMPILER_WARN_UNUSED
    #define ME_COMPILER_WARN_UNUSED 1
#endif
#ifndef ME_CONFIG_FILE
    #define ME_CONFIG_FILE "appweb.conf"
#endif
#ifndef ME_DEBUG
    #define ME_DEBUG 1
#endif
#ifndef ME_DEPRECATED_WARNINGS
    #define ME_DEPRECATED_WARNINGS 0
#endif
#ifndef ME_DEPTH
    #define ME_DEPTH 1
#endif
#ifndef ME_DESCRIPTION
    #define ME_DESCRIPTION "Embedthis Appweb"
#endif
#ifndef ME_ESP_CMD
    #define ME_ESP_CMD 1
#endif
#ifndef ME_ESP_LEGACY
    #define ME_ESP_LEGACY 0
#endif
#ifndef ME_ESP_MODULE
    #define ME_ESP_MODULE 0
#endif
#ifndef ME_ESP_NAME
    #define ME_ESP_NAME "appweb-esp"
#endif
#ifndef ME_HTTP_BASIC
    #define ME_HTTP_BASIC 1
#endif
#ifndef ME_HTTP_CACHE
    #define ME_HTTP_CACHE 1
#endif
#ifndef ME_HTTP_CMD
    #define ME_HTTP_CMD 1
#endif
#ifndef ME_HTTP_DEFENSE
    #define ME_HTTP_DEFENSE 1
#endif
#ifndef ME_HTTP_DIGEST
    #define ME_HTTP_DIGEST 1
#endif
#ifndef ME_HTTP_DIR
    #define ME_HTTP_DIR 1
#endif
#ifndef ME_HTTP_HTTP2
    #define ME_HTTP_HTTP2 1
#endif
#ifndef ME_HTTP_PAM
    #define ME_HTTP_PAM 1
#endif
#ifndef ME_HTTP_SENDFILE
    #define ME_HTTP_SENDFILE 1
#endif
#ifndef ME_HTTP_UPLOAD
    #define ME_HTTP_UPLOAD 1
#endif
#ifndef ME_HTTP_WEB_SOCKETS
    #define ME_HTTP_WEB_SOCKETS 1
#endif
#ifndef ME_INTEGRATE
    #define ME_INTEGRATE 1
#endif
#ifndef ME_MANIFEST
    #define ME_MANIFEST "installs/manifest.me"
#endif
#ifndef ME_MBEDTLS_COMPACT
    #define ME_MBEDTLS_COMPACT 1
#endif
#ifndef ME_MPR_LOGGING
    #define ME_MPR_LOGGING 1
#endif
#ifndef ME_MPR_OSLOG
    #define ME_MPR_OSLOG 0
#endif
#ifndef ME_MPR_ROM_MOUNT
    #define ME_MPR_ROM_MOUNT "/rom"
#endif
#ifndef ME_MPR_SSL_CACHE
    #define ME_MPR_SSL_CACHE 512
#endif
#ifndef ME_MPR_SSL_HANDSHAKES
    #define ME_MPR_SSL_HANDSHAKES 3
#endif
#ifndef ME_MPR_SSL_LOG_LEVEL
    #define ME_MPR_SSL_LOG_LEVEL 6
#endif
#ifndef ME_MPR_SSL_TICKET
    #define ME_MPR_SSL_TICKET 1
#endif
#ifndef ME_MPR_SSL_TIMEOUT
    #define ME_MPR_SSL_TIMEOUT 86400
#endif
#ifndef ME_MPR_THREAD_LIMIT_BY_CORES
    #define ME_MPR_THREAD_LIMIT_BY_CORES 1
#endif
#ifndef ME_MPR_THREAD_STACK
    #define ME_MPR_THREAD_STACK 0
#endif
#ifndef ME_NAME
    #define ME_NAME "appweb"
#endif
#ifndef ME_OPENSSL_VERSION
    #define ME_OPENSSL_VERSION "1.0"
#endif
#ifndef ME_PARTS
    #define ME_PARTS "undefined"
#endif
#ifndef ME_PLATFORMS
    #define ME_PLATFORMS "local"
#endif
#ifndef ME_PREFIXES
    #define ME_PREFIXES "install-prefixes"
#endif
#ifndef ME_ROM
    #define ME_ROM 0
#endif
#ifndef ME_SERVER_ROOT
    #define ME_SERVER_ROOT "."
#endif
#ifndef ME_TITLE
    #define ME_TITLE "Embedthis Appweb"
#endif
#ifndef ME_TUNE
    #define ME_TUNE "size"
#endif
#ifndef ME_VERSION
    #define ME_VERSION "9.0.4"
#endif
#ifndef ME_WATCHDOG_NAME
    #define ME_WATCHDOG_NAME "appman"
#endif
#ifndef ME_WEB_GROUP
    #define ME_WEB_GROUP "nogroup"
#endif
#ifndef ME_WEB_USER
    #define ME_WEB_USER "nobody"
#endif

/* Prefixes */
#ifndef ME_ROOT_PREFIX
    #define ME_ROOT_PREFIX "/"
#endif
#ifndef ME_BASE_PREFIX
    #define ME_BASE_PREFIX "/usr/local"
#endif
#ifndef ME_DATA_PREFIX
    #define ME_DATA_PREFIX "/"
#endif
#ifndef ME_STATE_PREFIX
    #define ME_STATE_PREFIX "/var"
#endif
#ifndef ME_APP_PREFIX
    #define ME_APP_PREFIX "/usr/local/lib/appweb"
#endif
#ifndef ME_VAPP_PREFIX
    #define ME_VAPP_PREFIX "/usr/local/lib/appweb/9.0.4"
#endif
#ifndef ME_BIN_PREFIX
    #define ME_BIN_PREFIX "/usr/local/bin"
#endif
#ifndef ME_INC_PREFIX
    #define ME_INC_PREFIX "/usr/local/include"
#endif
#ifndef ME_LIB_PREFIX
    #define ME_LIB_PREFIX "/usr/local/lib"
#endif
#ifndef ME_MAN_PREFIX
    #define ME_MAN_PREFIX "/usr/local/share/man"
#endif
#ifndef ME_SBIN_PREFIX
    #define ME_SBIN_PREFIX "/usr/local/sbin"
#endif
#ifndef ME_ETC_PREFIX
    #define ME_ETC_PREFIX "/etc/appweb"
#endif
#ifndef ME_WEB_PREFIX
    #define ME_WEB_PREFIX "/var/www/appweb"
#endif
#ifndef ME_LOG_PREFIX
    #define ME_LOG_PREFIX "/var/log/appweb"
#endif
#ifndef ME_VLIB_PREFIX
    #define ME_VLIB_PREFIX "/var/lib/appweb"
#endif
#ifndef ME_SPOOL_PREFIX
    #define ME_SPOOL_PREFIX "/var/spool/appweb"
#endif
#ifndef ME_CACHE_PREFIX
    #define ME_CACHE_PREFIX "/var/spool/appweb/cache"
#endif
#ifndef ME_SRC_PREFIX
    #define ME_SRC_PREFIX "appweb-9.0.4"
#endif

/* Suffixes */
#ifndef ME_EXE
    #define ME_EXE ""
#endif
#ifndef ME_SHLIB
    #define ME_SHLIB ".so"
#endif
#ifndef ME_SHOBJ
    #define ME_SHOBJ ".so"
#endif
#ifndef ME_LIB
    #define ME_LIB ".a"
#endif
#ifndef ME_OBJ
    #define ME_OBJ ".o"
#endif

/* Profile */
#ifndef ME_CONFIG_CMD
    #define ME_CONFIG_CMD "me -d -q -platform linux-x64-default -configure . --with esp --with mdb --with cgi --with fast --with proxy -gen make"
#endif
#ifndef ME_APPWEB_PRODUCT
    #define ME_APPWEB_PRODUCT 1
#endif
#ifndef ME_PROFILE
    #define ME_PROFILE "default"
#endif
#ifndef ME_TUNE_SIZE
    #define ME_TUNE_SIZE 1
#endif

/* Miscellaneous */
#ifndef ME_MAJOR_VERSION
    #define ME_MAJOR_VERSION 9
#endif
#ifndef ME_MINOR_VERSION
    #define ME_MINOR_VERSION 0
#endif
#ifndef ME_PATCH_VERSION
    #define ME_PATCH_VERSION 4
#endif
#ifndef ME_VNUM
    #define ME_VNUM 900000004
#endif

/* Components */
#ifndef ME_COM_CGI
    #define ME_COM_CGI 1
#endif
#ifndef ME_COM_CC
    #define ME_COM_CC 1
#endif
#ifndef ME_COM_DIR
    #define ME_COM_DIR 0
#endif
#ifndef ME_COM_EJS
    #define ME_COM_EJS 0
#endif
#ifndef ME_COM_ESP
    #define ME_COM_ESP 1
#endif
#ifndef ME_COM_FAST
    #define ME_COM_FAST 1
#endif
#ifndef ME_COM_HTTP
    #define ME_COM_HTTP 1
#endif
#ifndef ME_COM_LIB
    #define ME_COM_LIB 1
#endif
#ifndef ME_COM_MBEDTLS
    #define ME_COM_MBEDTLS 0
#endif
#ifndef ME_COM_MDB
    #define ME_COM_MDB 1
#endif
#ifndef ME_COM_MPR
    #define ME_COM_MPR 1
#endif
#ifndef ME_COM_OPENSSL
    #define ME_COM_OPENSSL 1
#endif
#ifndef ME_COM_OSDEP
    #define ME_COM_OSDEP 1
#endif
#ifndef ME_COM_PCRE
    #define ME_COM_PCRE 1
#endif
#ifndef ME_COM_PHP
    #define ME_COM_PHP 0
#endif
#ifndef ME_COM_PROXY
    #define ME_COM_PROXY 1
#endif
#ifndef ME_COM_SQLITE
    #define ME_COM_SQLITE 0
#endif
#ifndef ME_COM_SSL
    #define ME_COM_SSL 1
#endif
#ifndef ME_COM_VXWORKS
    #define ME_COM_VXWORKS 0
#endif
#ifndef ME_COM_WATCHDOG
    #define ME_COM_WATCHDOG 1
#endif
