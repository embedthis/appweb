#
#   appweb-macosx-default.mk -- Makefile to build Embedthis Appweb for macosx
#

NAME                  := appweb
VERSION               := 9.0.5
PROFILE               ?= default
ARCH                  ?= $(shell uname -m | sed 's/i.86/x86/;s/x86_64/x64/;s/mips.*/mips/')
CC_ARCH               ?= $(shell echo $(ARCH) | sed 's/x86/i686/;s/x64/x86_64/')
OS                    ?= macosx
CC                    ?= clang
AR                    ?= ar
BUILD                 ?= build/$(OS)-$(ARCH)-$(PROFILE)
CONFIG                ?= $(OS)-$(ARCH)-$(PROFILE)
LBIN                  ?= $(BUILD)/bin
PATH                  := $(LBIN):$(PATH)

#
# Components
#
ME_COM_CGI            ?= 1
ME_COM_COMPILER       ?= 1
ME_COM_DIR            ?= 0
ME_COM_EJS            ?= 0
ME_COM_ESP            ?= 1
ME_COM_FAST           ?= 0
ME_COM_HTTP           ?= 1
ME_COM_LIB            ?= 1
ME_COM_MBEDTLS        ?= 0
ME_COM_MDB            ?= 1
ME_COM_MPR            ?= 1
ME_COM_OPENSSL        ?= 1
ME_COM_OSDEP          ?= 1
ME_COM_PCRE           ?= 1
ME_COM_PHP            ?= 0
ME_COM_PROXY          ?= 0
ME_COM_SQLITE         ?= 0
ME_COM_SSL            ?= 1
ME_COM_VXWORKS        ?= 0
ME_COM_WATCHDOG       ?= 1

ME_COM_OPENSSL_PATH   ?= "/opt/homebrew"
ME_COM_MBEDTLS_PATH   ?= "/opt/homebrew"

ifeq ($(ME_COM_LIB),1)
    ME_COM_COMPILER := 1
endif
ifeq ($(ME_COM_MBEDTLS),1)
    ME_COM_SSL := 1
endif
ifeq ($(ME_COM_OPENSSL),1)
    ME_COM_SSL := 1
endif
ifeq ($(ME_COM_ESP),1)
    ME_COM_MDB := 1
endif

#
# Settings
#
ME_AUTHOR             ?= \"Embedthis Software\"
ME_CERTS_GENDH        ?= 1
ME_COMPANY            ?= \"embedthis\"
ME_COMPAT             ?= 1
ME_COMPATIBLE         ?= \"9.0\"
ME_COMPILER_FORTIFY   ?= 1
ME_COMPILER_HAS_ATOMIC ?= 1
ME_COMPILER_HAS_ATOMIC64 ?= 1
ME_COMPILER_HAS_DOUBLE_BRACES ?= 1
ME_COMPILER_HAS_DYN_LOAD ?= 1
ME_COMPILER_HAS_LIB_EDIT ?= 1
ME_COMPILER_HAS_LIB_RT ?= 0
ME_COMPILER_HAS_MMU   ?= 1
ME_COMPILER_HAS_MTUNE ?= 1
ME_COMPILER_HAS_PAM   ?= 1
ME_COMPILER_HAS_STACK_PROTECTOR ?= 1
ME_COMPILER_HAS_SYNC  ?= 1
ME_COMPILER_HAS_SYNC64 ?= 1
ME_COMPILER_HAS_SYNC_CAS ?= 1
ME_COMPILER_HAS_UNNAMED_UNIONS ?= 1
ME_COMPILER_NOEXECSTACK ?= 0
ME_COMPILER_WARN64TO32 ?= 1
ME_COMPILER_WARN_UNUSED ?= 1
ME_CONFIG_FILE        ?= \"appweb.conf\"
ME_CONFIGURE          ?= \"me -d -q -platform macosx-arm64-default -configure . --with esp --with mdb --with cgi -gen make\"
ME_CONFIGURED         ?= 1
ME_DEBUG              ?= 1
ME_DEPRECATED_WARNINGS ?= 0
ME_DEPTH              ?= 1
ME_DESCRIPTION        ?= \"Embedthis Appweb\"
ME_ESP_CMD            ?= 1
ME_ESP_LEGACY         ?= 0
ME_ESP_MODULE         ?= 0
ME_ESP_NAME           ?= \"appweb-esp\"
ME_HTTP_BASIC         ?= 1
ME_HTTP_CACHE         ?= 1
ME_HTTP_CMD           ?= 1
ME_HTTP_DEFENSE       ?= 1
ME_HTTP_DIGEST        ?= 1
ME_HTTP_DIR           ?= 1
ME_HTTP_HTTP2         ?= 1
ME_HTTP_PAM           ?= 1
ME_HTTP_SENDFILE      ?= 1
ME_HTTP_UPLOAD        ?= 1
ME_HTTP_WEB_SOCKETS   ?= 1
ME_INTEGRATE          ?= 1
ME_MANIFEST           ?= \"installs/manifest.me\"
ME_MBEDTLS_COMPACT    ?= 1
ME_MPR_LOGGING        ?= 1
ME_MPR_OSLOG          ?= 0
ME_MPR_ROM_MOUNT      ?= \"/rom\"
ME_MPR_SSL_CACHE      ?= 512
ME_MPR_SSL_HANDSHAKES ?= 3
ME_MPR_SSL_LOG_LEVEL  ?= 6
ME_MPR_SSL_TICKET     ?= 1
ME_MPR_SSL_TIMEOUT    ?= 86400
ME_MPR_THREAD_LIMIT_BY_CORES ?= 1
ME_MPR_THREAD_STACK   ?= 0
ME_NAME               ?= \"appweb\"
ME_OPENSSL_VERSION    ?= \"1.0\"
ME_PARTS              ?= \"undefined\"
ME_PLATFORMS          ?= \"local\"
ME_PREFIXES           ?= \"install-prefixes\"
ME_ROM                ?= 0
ME_SERVER_ROOT        ?= \".\"
ME_TITLE              ?= \"Embedthis Appweb\"
ME_TUNE               ?= \"size\"
ME_VERSION            ?= \"9.0.5\"
ME_WATCHDOG_NAME      ?= \"appman\"
ME_WEB_GROUP          ?= \"$(WEB_GROUP)\"
ME_WEB_USER           ?= \"$(WEB_USER)\"

CFLAGS                += -Wno-unknown-warning-option  -fPIC -fstack-protector --param=ssp-buffer-size=4 -Wformat -Wformat-security  -w
DFLAGS                += -D_REENTRANT -DPIC $(patsubst %,-D%,$(filter ME_%,$(MAKEFLAGS))) -DME_COM_CGI=$(ME_COM_CGI) -DME_COM_COMPILER=$(ME_COM_COMPILER) -DME_COM_DIR=$(ME_COM_DIR) -DME_COM_EJS=$(ME_COM_EJS) -DME_COM_ESP=$(ME_COM_ESP) -DME_COM_FAST=$(ME_COM_FAST) -DME_COM_HTTP=$(ME_COM_HTTP) -DME_COM_LIB=$(ME_COM_LIB) -DME_COM_MBEDTLS=$(ME_COM_MBEDTLS) -DME_COM_MDB=$(ME_COM_MDB) -DME_COM_MPR=$(ME_COM_MPR) -DME_COM_OPENSSL=$(ME_COM_OPENSSL) -DME_COM_OSDEP=$(ME_COM_OSDEP) -DME_COM_PCRE=$(ME_COM_PCRE) -DME_COM_PHP=$(ME_COM_PHP) -DME_COM_PROXY=$(ME_COM_PROXY) -DME_COM_SQLITE=$(ME_COM_SQLITE) -DME_COM_SSL=$(ME_COM_SSL) -DME_COM_VXWORKS=$(ME_COM_VXWORKS) -DME_COM_WATCHDOG=$(ME_COM_WATCHDOG) -DME_CERTS_GENDH=$(ME_CERTS_GENDH) -DME_ESP_CMD=$(ME_ESP_CMD) -DME_ESP_LEGACY=$(ME_ESP_LEGACY) -DME_ESP_MODULE=$(ME_ESP_MODULE) -DME_ESP_NAME=$(ME_ESP_NAME) -DME_HTTP_BASIC=$(ME_HTTP_BASIC) -DME_HTTP_CACHE=$(ME_HTTP_CACHE) -DME_HTTP_CMD=$(ME_HTTP_CMD) -DME_HTTP_DEFENSE=$(ME_HTTP_DEFENSE) -DME_HTTP_DIGEST=$(ME_HTTP_DIGEST) -DME_HTTP_DIR=$(ME_HTTP_DIR) -DME_HTTP_HTTP2=$(ME_HTTP_HTTP2) -DME_HTTP_PAM=$(ME_HTTP_PAM) -DME_HTTP_SENDFILE=$(ME_HTTP_SENDFILE) -DME_HTTP_UPLOAD=$(ME_HTTP_UPLOAD) -DME_HTTP_WEBSOCKETS=$(ME_HTTP_WEBSOCKETS) -DME_MBEDTLS_COMPACT=$(ME_MBEDTLS_COMPACT) -DME_MPR_ALLOC=$(ME_MPR_ALLOC) -DME_MPR_LOGGING=$(ME_MPR_LOGGING) -DME_MPR_OSLOG=$(ME_MPR_OSLOG) -DME_MPR_ROMMOUNT=$(ME_MPR_ROMMOUNT) -DME_MPR_SSL=$(ME_MPR_SSL) -DME_MPR_THREADLIMITBYCORES=$(ME_MPR_THREADLIMITBYCORES) -DME_MPR_THREADSTACK=$(ME_MPR_THREADSTACK) -DME_OPENSSL_VERSION=$(ME_OPENSSL_VERSION) -DME_WATCHDOG_NAME=$(ME_WATCHDOG_NAME) 
IFLAGS                += "-I$(BUILD)/inc"
LDFLAGS               += -g -Wl,-no_warn_duplicate_libraries -Wl,-rpath,@executable_path/ -Wl,-rpath,@loader_path/
LIBPATHS              += -L$(BUILD)/bin
LIBS                  += -ldl -lpthread -lm

OPTIMIZE              ?= debug
CFLAGS-debug          ?= -g
DFLAGS-debug          ?= -DME_DEBUG=1
LDFLAGS-debug         ?= -g
DFLAGS-release        ?= 
CFLAGS-release        ?= -O2
LDFLAGS-release       ?= 
CFLAGS                += $(CFLAGS-$(OPTIMIZE))
DFLAGS                += $(DFLAGS-$(OPTIMIZE))
LDFLAGS               += $(LDFLAGS-$(OPTIMIZE))

ME_ROOT_PREFIX        ?= 
ME_BASE_PREFIX        ?= $(ME_ROOT_PREFIX)/usr/local
ME_DATA_PREFIX        ?= $(ME_ROOT_PREFIX)/
ME_STATE_PREFIX       ?= $(ME_ROOT_PREFIX)/var
ME_APP_PREFIX         ?= $(ME_BASE_PREFIX)/lib/$(NAME)
ME_VAPP_PREFIX        ?= $(ME_APP_PREFIX)/$(VERSION)
ME_BIN_PREFIX         ?= $(ME_ROOT_PREFIX)/usr/local/bin
ME_INC_PREFIX         ?= $(ME_ROOT_PREFIX)/usr/local/include
ME_LIB_PREFIX         ?= $(ME_ROOT_PREFIX)/usr/local/lib
ME_MAN_PREFIX         ?= $(ME_ROOT_PREFIX)/usr/local/share/man
ME_SBIN_PREFIX        ?= $(ME_ROOT_PREFIX)/usr/local/sbin
ME_ETC_PREFIX         ?= $(ME_ROOT_PREFIX)/etc/$(NAME)
ME_WEB_PREFIX         ?= $(ME_ROOT_PREFIX)/var/www/$(NAME)
ME_LOG_PREFIX         ?= $(ME_ROOT_PREFIX)/var/log/$(NAME)
ME_VLIB_PREFIX        ?= $(ME_ROOT_PREFIX)/var/lib/$(NAME)
ME_SPOOL_PREFIX       ?= $(ME_ROOT_PREFIX)/var/spool/$(NAME)
ME_CACHE_PREFIX       ?= $(ME_ROOT_PREFIX)/var/spool/$(NAME)/cache
ME_SRC_PREFIX         ?= $(ME_ROOT_PREFIX)$(NAME)-$(VERSION)

WEB_USER              ?= $(shell egrep 'www-data|_www|nobody' /etc/passwd | sed 's^:.*^^' |  tail -1)
WEB_GROUP             ?= $(shell egrep 'www-data|_www|nobody|nogroup' /etc/group | sed 's^:.*^^' |  tail -1)

TARGETS               += $(BUILD)/bin/appweb
TARGETS               += $(BUILD)/bin/authpass
ifeq ($(ME_COM_ESP),1)
    TARGETS           += $(BUILD)/bin/appweb-esp
endif
ifeq ($(ME_COM_ESP),1)
    TARGETS           += $(BUILD)/.extras-modified
endif
ifeq ($(ME_COM_HTTP),1)
    TARGETS           += $(BUILD)/bin/http
endif
TARGETS               += $(BUILD)/.install-roots-modified
ifeq ($(ME_COM_SQLITE),1)
    TARGETS           += $(BUILD)/bin/libsql.dylib
endif
TARGETS               += $(BUILD)/bin/makerom
TARGETS               += $(BUILD)/bin/server
TARGETS               += src/server/cache
TARGETS               += $(BUILD)/bin/appman


DEPEND := $(strip $(wildcard ./projects/depend.mk))
ifneq ($(DEPEND),)
include $(DEPEND)
endif

unexport CDPATH

ifndef SHOW
.SILENT:
endif

all build compile: prep $(TARGETS)

.PHONY: prep

prep:
	@if [ "$(BUILD)" = "" ] ; then echo WARNING: BUILD not set ; exit 255 ; fi
	@if [ "$(ME_APP_PREFIX)" = "" ] ; then echo WARNING: ME_APP_PREFIX not set ; exit 255 ; fi
	@[ ! -x $(BUILD)/bin ] && mkdir -p $(BUILD)/bin; true
	@[ ! -x $(BUILD)/inc ] && mkdir -p $(BUILD)/inc; true
	@[ ! -x $(BUILD)/obj ] && mkdir -p $(BUILD)/obj; true
	@[ ! -f $(BUILD)/inc/me.h ] && cp projects/appweb-macosx-$(PROFILE)-me.h $(BUILD)/inc/me.h ; true
	@if ! diff $(BUILD)/inc/me.h projects/appweb-macosx-$(PROFILE)-me.h >/dev/null ; then\
		cp projects/appweb-macosx-$(PROFILE)-me.h $(BUILD)/inc/me.h  ; \
	fi; true
	@if [ -f "$(BUILD)/.makeflags" ] ; then \
		if [ "$(MAKEFLAGS)" != "`cat $(BUILD)/.makeflags`" ] ; then \
			echo "   [Warning] Make flags have changed since the last build" ; \
			echo "   [Warning] Previous build command: "`cat $(BUILD)/.makeflags`"" ; \
		fi ; \
	fi
	@echo "$(MAKEFLAGS)" >$(BUILD)/.makeflags

clean:
	rm -f "$(BUILD)/obj/appweb.o"
	rm -f "$(BUILD)/obj/authpass.o"
	rm -f "$(BUILD)/obj/cgiHandler.o"
	rm -f "$(BUILD)/obj/cgiProgram.o"
	rm -f "$(BUILD)/obj/config.o"
	rm -f "$(BUILD)/obj/convenience.o"
	rm -f "$(BUILD)/obj/esp.o"
	rm -f "$(BUILD)/obj/espHandler.o"
	rm -f "$(BUILD)/obj/espLib.o"
	rm -f "$(BUILD)/obj/fastHandler.o"
	rm -f "$(BUILD)/obj/fastProgram.o"
	rm -f "$(BUILD)/obj/http.o"
	rm -f "$(BUILD)/obj/httpLib.o"
	rm -f "$(BUILD)/obj/makerom.o"
	rm -f "$(BUILD)/obj/mpr-version.o"
	rm -f "$(BUILD)/obj/mprLib.o"
	rm -f "$(BUILD)/obj/pcre.o"
	rm -f "$(BUILD)/obj/proxyHandler.o"
	rm -f "$(BUILD)/obj/rom.o"
	rm -f "$(BUILD)/obj/server.o"
	rm -f "$(BUILD)/obj/sqlite.o"
	rm -f "$(BUILD)/obj/sqlite3.o"
	rm -f "$(BUILD)/obj/testHandler.o"
	rm -f "$(BUILD)/obj/testWebSocketsHandler.o"
	rm -f "$(BUILD)/obj/watchdog.o"
	rm -f "$(BUILD)/bin/appweb"
	rm -f "$(BUILD)/bin/authpass"
	rm -f "$(BUILD)/bin/appweb-esp"
	rm -f "$(BUILD)/.extras-modified"
	rm -f "$(BUILD)/bin/http"
	rm -f "$(BUILD)/.install-roots-modified"
	rm -f "$(BUILD)/bin/libappweb.dylib"
	rm -f "$(BUILD)/bin/libesp.dylib"
	rm -f "$(BUILD)/bin/libhttp.dylib"
	rm -f "$(BUILD)/bin/libmpr.dylib"
	rm -f "$(BUILD)/bin/libmpr-version.a"
	rm -f "$(BUILD)/bin/libpcre.dylib"
	rm -f "$(BUILD)/bin/libsql.dylib"
	rm -f "$(BUILD)/bin/makerom"
	rm -f "$(BUILD)/bin/server"
	rm -f "$(BUILD)/bin/appman"

clobber: clean
	rm -fr ./$(BUILD)

#
#   me.h
#

$(BUILD)/inc/me.h: $(DEPS_1)

#
#   FreeRTOS.h
#

$(BUILD)/inc/freertos/FreeRTOS.h: $(DEPS_2)

#
#   event_groups.h
#

$(BUILD)/inc/freertos/event_groups.h: $(DEPS_3)

#
#   task.h
#

$(BUILD)/inc/freertos/task.h: $(DEPS_4)

#
#   time.h
#

$(BUILD)/inc/time.h: $(DEPS_5)

#
#   esp_system.h
#

$(BUILD)/inc/esp_system.h: $(DEPS_6)

#
#   esp_log.h
#

$(BUILD)/inc/esp_log.h: $(DEPS_7)

#
#   esp_heap_caps.h
#

$(BUILD)/inc/esp_heap_caps.h: $(DEPS_8)

#
#   esp_err.h
#

$(BUILD)/inc/esp_err.h: $(DEPS_9)

#
#   esp_event.h
#

$(BUILD)/inc/esp_event.h: $(DEPS_10)

#
#   esp_psram.h
#

$(BUILD)/inc/esp_psram.h: $(DEPS_11)

#
#   esp_pthread.h
#

$(BUILD)/inc/esp_pthread.h: $(DEPS_12)

#
#   esp_littlefs.h
#

$(BUILD)/inc/esp_littlefs.h: $(DEPS_13)

#
#   esp_crt_bundle.h
#

$(BUILD)/inc/esp_crt_bundle.h: $(DEPS_14)

#
#   esp_wifi.h
#

$(BUILD)/inc/esp_wifi.h: $(DEPS_15)

#
#   esp_netif.h
#

$(BUILD)/inc/esp_netif.h: $(DEPS_16)

#
#   nvs_flash.h
#

$(BUILD)/inc/nvs_flash.h: $(DEPS_17)

#
#   err.h
#

$(BUILD)/inc/lwip/err.h: $(DEPS_18)

#
#   sockets.h
#

$(BUILD)/inc/lwip/sockets.h: $(DEPS_19)

#
#   sys.h
#

$(BUILD)/inc/lwip/sys.h: $(DEPS_20)

#
#   netdb.h
#

$(BUILD)/inc/lwip/netdb.h: $(DEPS_21)

#
#   osdep.h
#
DEPS_22 += src/osdep/osdep.h
DEPS_22 += $(BUILD)/inc/me.h
DEPS_22 += $(BUILD)/inc/freertos/FreeRTOS.h
DEPS_22 += $(BUILD)/inc/freertos/event_groups.h
DEPS_22 += $(BUILD)/inc/freertos/task.h
DEPS_22 += $(BUILD)/inc/time.h
DEPS_22 += $(BUILD)/inc/esp_system.h
DEPS_22 += $(BUILD)/inc/esp_log.h
DEPS_22 += $(BUILD)/inc/esp_heap_caps.h
DEPS_22 += $(BUILD)/inc/esp_err.h
DEPS_22 += $(BUILD)/inc/esp_event.h
DEPS_22 += $(BUILD)/inc/esp_psram.h
DEPS_22 += $(BUILD)/inc/esp_pthread.h
DEPS_22 += $(BUILD)/inc/esp_littlefs.h
DEPS_22 += $(BUILD)/inc/esp_crt_bundle.h
DEPS_22 += $(BUILD)/inc/esp_wifi.h
DEPS_22 += $(BUILD)/inc/esp_netif.h
DEPS_22 += $(BUILD)/inc/nvs_flash.h
DEPS_22 += $(BUILD)/inc/lwip/err.h
DEPS_22 += $(BUILD)/inc/lwip/sockets.h
DEPS_22 += $(BUILD)/inc/lwip/sys.h
DEPS_22 += $(BUILD)/inc/lwip/netdb.h

$(BUILD)/inc/osdep.h: $(DEPS_22)
	@echo '      [Copy] $(BUILD)/inc/osdep.h'
	mkdir -p "$(BUILD)/inc"
	cp src/osdep/osdep.h $(BUILD)/inc/osdep.h

#
#   mpr.h
#
DEPS_23 += src/mpr/mpr.h
DEPS_23 += $(BUILD)/inc/me.h
DEPS_23 += $(BUILD)/inc/osdep.h

$(BUILD)/inc/mpr.h: $(DEPS_23)
	@echo '      [Copy] $(BUILD)/inc/mpr.h'
	mkdir -p "$(BUILD)/inc"
	cp src/mpr/mpr.h $(BUILD)/inc/mpr.h

#
#   http.h
#
DEPS_24 += src/http/http.h
DEPS_24 += $(BUILD)/inc/mpr.h

$(BUILD)/inc/http.h: $(DEPS_24)
	@echo '      [Copy] $(BUILD)/inc/http.h'
	mkdir -p "$(BUILD)/inc"
	cp src/http/http.h $(BUILD)/inc/http.h

#
#   appweb.h
#
DEPS_25 += src/appweb.h
DEPS_25 += $(BUILD)/inc/osdep.h
DEPS_25 += $(BUILD)/inc/mpr.h
DEPS_25 += $(BUILD)/inc/http.h

$(BUILD)/inc/appweb.h: $(DEPS_25)
	@echo '      [Copy] $(BUILD)/inc/appweb.h'
	mkdir -p "$(BUILD)/inc"
	cp src/appweb.h $(BUILD)/inc/appweb.h

#
#   config.h
#

$(BUILD)/inc/config.h: $(DEPS_26)

#
#   customize.h
#
DEPS_27 += src/customize.h

$(BUILD)/inc/customize.h: $(DEPS_27)
	@echo '      [Copy] $(BUILD)/inc/customize.h'
	mkdir -p "$(BUILD)/inc"
	cp src/customize.h $(BUILD)/inc/customize.h

#
#   esp.h
#
DEPS_28 += src/esp/esp.h
DEPS_28 += $(BUILD)/inc/me.h
DEPS_28 += $(BUILD)/inc/osdep.h
DEPS_28 += $(BUILD)/inc/http.h

$(BUILD)/inc/esp.h: $(DEPS_28)
	@echo '      [Copy] $(BUILD)/inc/esp.h'
	mkdir -p "$(BUILD)/inc"
	cp src/esp/esp.h $(BUILD)/inc/esp.h

#
#   mpr-version.h
#
DEPS_29 += src/mpr-version/mpr-version.h
DEPS_29 += $(BUILD)/inc/mpr.h

$(BUILD)/inc/mpr-version.h: $(DEPS_29)
	@echo '      [Copy] $(BUILD)/inc/mpr-version.h'
	mkdir -p "$(BUILD)/inc"
	cp src/mpr-version/mpr-version.h $(BUILD)/inc/mpr-version.h

#
#   pcre.h
#
DEPS_30 += src/pcre/pcre.h

$(BUILD)/inc/pcre.h: $(DEPS_30)
	@echo '      [Copy] $(BUILD)/inc/pcre.h'
	mkdir -p "$(BUILD)/inc"
	cp src/pcre/pcre.h $(BUILD)/inc/pcre.h

#
#   sqlite3.h
#
DEPS_31 += src/sqlite/sqlite3.h

$(BUILD)/inc/sqlite3.h: $(DEPS_31)
	@echo '      [Copy] $(BUILD)/inc/sqlite3.h'
	mkdir -p "$(BUILD)/inc"
	cp src/sqlite/sqlite3.h $(BUILD)/inc/sqlite3.h

#
#   sqlite3rtree.h
#

$(BUILD)/inc/sqlite3rtree.h: $(DEPS_32)

#
#   windows.h
#

$(BUILD)/inc/windows.h: $(DEPS_33)

#
#   appweb.o
#
DEPS_34 += $(BUILD)/inc/appweb.h

$(BUILD)/obj/appweb.o: \
    src/server/appweb.c $(DEPS_34)
	@echo '   [Compile] $(BUILD)/obj/appweb.o'
	$(CC) -c -o $(BUILD)/obj/appweb.o -arch $(CC_ARCH) -Wno-unknown-warning-option -fPIC -fstack-protector --param=ssp-buffer-size=4 -Wformat -Wformat-security $(DFLAGS) -DME_COM_OPENSSL_PATH=$(ME_COM_OPENSSL_PATH) -DME_COM_MBEDTLS_PATH=$(ME_COM_MBEDTLS_PATH) $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" "-I$(ME_COM_MBEDTLS_PATH)/include" src/server/appweb.c

#
#   authpass.o
#
DEPS_35 += $(BUILD)/inc/appweb.h

$(BUILD)/obj/authpass.o: \
    src/utils/authpass.c $(DEPS_35)
	@echo '   [Compile] $(BUILD)/obj/authpass.o'
	$(CC) -c -o $(BUILD)/obj/authpass.o -arch $(CC_ARCH) -Wno-unknown-warning-option -fPIC -fstack-protector --param=ssp-buffer-size=4 -Wformat -Wformat-security $(DFLAGS) -DME_COM_OPENSSL_PATH=$(ME_COM_OPENSSL_PATH) -DME_COM_MBEDTLS_PATH=$(ME_COM_MBEDTLS_PATH) $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" "-I$(ME_COM_MBEDTLS_PATH)/include" src/utils/authpass.c

#
#   appweb.h
#

src/appweb.h: $(DEPS_36)

#
#   cgiHandler.o
#
DEPS_37 += src/appweb.h

$(BUILD)/obj/cgiHandler.o: \
    src/modules/cgiHandler.c $(DEPS_37)
	@echo '   [Compile] $(BUILD)/obj/cgiHandler.o'
	$(CC) -c -o $(BUILD)/obj/cgiHandler.o -arch $(CC_ARCH) -Wno-unknown-warning-option -fPIC -fstack-protector --param=ssp-buffer-size=4 -Wformat -Wformat-security $(DFLAGS) -DME_COM_OPENSSL_PATH=$(ME_COM_OPENSSL_PATH) -DME_COM_MBEDTLS_PATH=$(ME_COM_MBEDTLS_PATH) $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" "-I$(ME_COM_MBEDTLS_PATH)/include" src/modules/cgiHandler.c

#
#   cgiProgram.o
#

$(BUILD)/obj/cgiProgram.o: \
    src/utils/cgiProgram.c $(DEPS_38)
	@echo '   [Compile] $(BUILD)/obj/cgiProgram.o'
	$(CC) -c -o $(BUILD)/obj/cgiProgram.o -arch $(CC_ARCH) -Wno-unknown-warning-option -fPIC -fstack-protector --param=ssp-buffer-size=4 -Wformat -Wformat-security $(DFLAGS) $(IFLAGS) src/utils/cgiProgram.c

#
#   config.o
#
DEPS_39 += src/appweb.h
DEPS_39 += $(BUILD)/inc/pcre.h

$(BUILD)/obj/config.o: \
    src/config.c $(DEPS_39)
	@echo '   [Compile] $(BUILD)/obj/config.o'
	$(CC) -c -o $(BUILD)/obj/config.o -arch $(CC_ARCH) -Wno-unknown-warning-option -fPIC -fstack-protector --param=ssp-buffer-size=4 -Wformat -Wformat-security $(DFLAGS) -DME_COM_OPENSSL_PATH=$(ME_COM_OPENSSL_PATH) -DME_COM_MBEDTLS_PATH=$(ME_COM_MBEDTLS_PATH) $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" "-I$(ME_COM_MBEDTLS_PATH)/include" src/config.c

#
#   convenience.o
#
DEPS_40 += src/appweb.h

$(BUILD)/obj/convenience.o: \
    src/convenience.c $(DEPS_40)
	@echo '   [Compile] $(BUILD)/obj/convenience.o'
	$(CC) -c -o $(BUILD)/obj/convenience.o -arch $(CC_ARCH) -Wno-unknown-warning-option -fPIC -fstack-protector --param=ssp-buffer-size=4 -Wformat -Wformat-security $(DFLAGS) -DME_COM_OPENSSL_PATH=$(ME_COM_OPENSSL_PATH) -DME_COM_MBEDTLS_PATH=$(ME_COM_MBEDTLS_PATH) $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" "-I$(ME_COM_MBEDTLS_PATH)/include" src/convenience.c

#
#   esp.h
#

src/esp/esp.h: $(DEPS_41)

#
#   esp.o
#
DEPS_42 += src/esp/esp.h
DEPS_42 += $(BUILD)/inc/mpr-version.h

$(BUILD)/obj/esp.o: \
    src/esp/esp.c $(DEPS_42)
	@echo '   [Compile] $(BUILD)/obj/esp.o'
	$(CC) -c -o $(BUILD)/obj/esp.o -arch $(CC_ARCH) -Wno-unknown-warning-option -fPIC -fstack-protector --param=ssp-buffer-size=4 -Wformat -Wformat-security $(DFLAGS) -DME_COM_OPENSSL_PATH=$(ME_COM_OPENSSL_PATH) -DME_COM_MBEDTLS_PATH=$(ME_COM_MBEDTLS_PATH) $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" "-I$(ME_COM_MBEDTLS_PATH)/include" src/esp/esp.c

#
#   espHandler.o
#
DEPS_43 += src/appweb.h
DEPS_43 += $(BUILD)/inc/esp.h

$(BUILD)/obj/espHandler.o: \
    src/modules/espHandler.c $(DEPS_43)
	@echo '   [Compile] $(BUILD)/obj/espHandler.o'
	$(CC) -c -o $(BUILD)/obj/espHandler.o -arch $(CC_ARCH) -Wno-unknown-warning-option -fPIC -fstack-protector --param=ssp-buffer-size=4 -Wformat -Wformat-security $(DFLAGS) -DME_COM_OPENSSL_PATH=$(ME_COM_OPENSSL_PATH) -DME_COM_MBEDTLS_PATH=$(ME_COM_MBEDTLS_PATH) $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" "-I$(ME_COM_MBEDTLS_PATH)/include" src/modules/espHandler.c

#
#   espLib.o
#
DEPS_44 += src/esp/esp.h
DEPS_44 += $(BUILD)/inc/pcre.h
DEPS_44 += $(BUILD)/inc/http.h

$(BUILD)/obj/espLib.o: \
    src/esp/espLib.c $(DEPS_44)
	@echo '   [Compile] $(BUILD)/obj/espLib.o'
	$(CC) -c -o $(BUILD)/obj/espLib.o -arch $(CC_ARCH) -Wno-unknown-warning-option -fPIC -fstack-protector --param=ssp-buffer-size=4 -Wformat -Wformat-security $(DFLAGS) -DME_COM_OPENSSL_PATH=$(ME_COM_OPENSSL_PATH) -DME_COM_MBEDTLS_PATH=$(ME_COM_MBEDTLS_PATH) $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" "-I$(ME_COM_MBEDTLS_PATH)/include" src/esp/espLib.c

#
#   fastHandler.o
#
DEPS_45 += src/appweb.h

$(BUILD)/obj/fastHandler.o: \
    src/modules/fastHandler.c $(DEPS_45)
	@echo '   [Compile] $(BUILD)/obj/fastHandler.o'
	$(CC) -c -o $(BUILD)/obj/fastHandler.o -arch $(CC_ARCH) -Wno-unknown-warning-option -fPIC -fstack-protector --param=ssp-buffer-size=4 -Wformat -Wformat-security $(DFLAGS) -DME_COM_OPENSSL_PATH=$(ME_COM_OPENSSL_PATH) -DME_COM_MBEDTLS_PATH=$(ME_COM_MBEDTLS_PATH) $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" "-I$(ME_COM_MBEDTLS_PATH)/include" src/modules/fastHandler.c

#
#   fcgiapp.h
#

../../../..$(ME_INC_PREFIX)/fcgiapp.h: $(DEPS_46)

#
#   fastProgram.o
#
DEPS_47 += ../../../..$(ME_INC_PREFIX)/fcgiapp.h

$(BUILD)/obj/fastProgram.o: \
    src/utils/fastProgram.c $(DEPS_47)
	@echo '   [Compile] $(BUILD)/obj/fastProgram.o'
	$(CC) -c -o $(BUILD)/obj/fastProgram.o -arch $(CC_ARCH) -Wno-unknown-warning-option -fPIC -fstack-protector --param=ssp-buffer-size=4 -Wformat -Wformat-security $(DFLAGS) "-I$(ME_INC_PREFIX)" src/utils/fastProgram.c

#
#   http.h
#

src/http/http.h: $(DEPS_48)

#
#   http.o
#
DEPS_49 += src/http/http.h

$(BUILD)/obj/http.o: \
    src/http/http.c $(DEPS_49)
	@echo '   [Compile] $(BUILD)/obj/http.o'
	$(CC) -c -o $(BUILD)/obj/http.o -arch $(CC_ARCH) -Wno-unknown-warning-option -fPIC -fstack-protector --param=ssp-buffer-size=4 -Wformat -Wformat-security $(DFLAGS) -DME_COM_OPENSSL_PATH=$(ME_COM_OPENSSL_PATH) -DME_COM_MBEDTLS_PATH=$(ME_COM_MBEDTLS_PATH) $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" "-I$(ME_COM_MBEDTLS_PATH)/include" src/http/http.c

#
#   httpLib.o
#
DEPS_50 += src/http/http.h
DEPS_50 += $(BUILD)/inc/pcre.h

$(BUILD)/obj/httpLib.o: \
    src/http/httpLib.c $(DEPS_50)
	@echo '   [Compile] $(BUILD)/obj/httpLib.o'
	$(CC) -c -o $(BUILD)/obj/httpLib.o -arch $(CC_ARCH) -Wno-unknown-warning-option -fPIC -fstack-protector --param=ssp-buffer-size=4 -Wformat -Wformat-security $(DFLAGS) -DME_COM_OPENSSL_PATH=$(ME_COM_OPENSSL_PATH) -DME_COM_MBEDTLS_PATH=$(ME_COM_MBEDTLS_PATH) $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" "-I$(ME_COM_MBEDTLS_PATH)/include" src/http/httpLib.c

#
#   makerom.o
#
DEPS_51 += $(BUILD)/inc/mpr.h

$(BUILD)/obj/makerom.o: \
    src/makerom/makerom.c $(DEPS_51)
	@echo '   [Compile] $(BUILD)/obj/makerom.o'
	$(CC) -c -o $(BUILD)/obj/makerom.o -arch $(CC_ARCH) -Wno-unknown-warning-option -fPIC -fstack-protector --param=ssp-buffer-size=4 -Wformat -Wformat-security $(DFLAGS) -DME_COM_OPENSSL_PATH=$(ME_COM_OPENSSL_PATH) -DME_COM_MBEDTLS_PATH=$(ME_COM_MBEDTLS_PATH) $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" "-I$(ME_COM_MBEDTLS_PATH)/include" src/makerom/makerom.c

#
#   mpr-version.h
#

src/mpr-version/mpr-version.h: $(DEPS_52)

#
#   mpr-version.o
#
DEPS_53 += src/mpr-version/mpr-version.h
DEPS_53 += $(BUILD)/inc/pcre.h

$(BUILD)/obj/mpr-version.o: \
    src/mpr-version/mpr-version.c $(DEPS_53)
	@echo '   [Compile] $(BUILD)/obj/mpr-version.o'
	$(CC) -c -o $(BUILD)/obj/mpr-version.o -arch $(CC_ARCH) -Wno-unknown-warning-option -fPIC -fstack-protector --param=ssp-buffer-size=4 -Wformat -Wformat-security $(DFLAGS) $(IFLAGS) src/mpr-version/mpr-version.c

#
#   mpr.h
#

src/mpr/mpr.h: $(DEPS_54)

#
#   mprLib.o
#
DEPS_55 += src/mpr/mpr.h

$(BUILD)/obj/mprLib.o: \
    src/mpr/mprLib.c $(DEPS_55)
	@echo '   [Compile] $(BUILD)/obj/mprLib.o'
	$(CC) -c -o $(BUILD)/obj/mprLib.o -arch $(CC_ARCH) -Wno-unknown-warning-option -fPIC -fstack-protector --param=ssp-buffer-size=4 -Wformat -Wformat-security $(DFLAGS) -DME_COM_OPENSSL_PATH=$(ME_COM_OPENSSL_PATH) -DME_COM_MBEDTLS_PATH=$(ME_COM_MBEDTLS_PATH) $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" "-I$(ME_COM_MBEDTLS_PATH)/include" src/mpr/mprLib.c

#
#   pcre.h
#

src/pcre/pcre.h: $(DEPS_56)

#
#   pcre.o
#
DEPS_57 += $(BUILD)/inc/me.h
DEPS_57 += src/pcre/pcre.h

$(BUILD)/obj/pcre.o: \
    src/pcre/pcre.c $(DEPS_57)
	@echo '   [Compile] $(BUILD)/obj/pcre.o'
	$(CC) -c -o $(BUILD)/obj/pcre.o -arch $(CC_ARCH) -Wno-unknown-warning-option -fPIC -fstack-protector --param=ssp-buffer-size=4 -Wformat -Wformat-security $(DFLAGS) $(IFLAGS) src/pcre/pcre.c

#
#   proxyHandler.o
#
DEPS_58 += src/appweb.h

$(BUILD)/obj/proxyHandler.o: \
    src/modules/proxyHandler.c $(DEPS_58)
	@echo '   [Compile] $(BUILD)/obj/proxyHandler.o'
	$(CC) -c -o $(BUILD)/obj/proxyHandler.o -arch $(CC_ARCH) -Wno-unknown-warning-option -fPIC -fstack-protector --param=ssp-buffer-size=4 -Wformat -Wformat-security $(DFLAGS) -DME_COM_OPENSSL_PATH=$(ME_COM_OPENSSL_PATH) -DME_COM_MBEDTLS_PATH=$(ME_COM_MBEDTLS_PATH) $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" "-I$(ME_COM_MBEDTLS_PATH)/include" src/modules/proxyHandler.c

#
#   rom.o
#
DEPS_59 += $(BUILD)/inc/mpr.h

$(BUILD)/obj/rom.o: \
    src/rom.c $(DEPS_59)
	@echo '   [Compile] $(BUILD)/obj/rom.o'
	$(CC) -c -o $(BUILD)/obj/rom.o -arch $(CC_ARCH) -Wno-unknown-warning-option -fPIC -fstack-protector --param=ssp-buffer-size=4 -Wformat -Wformat-security $(DFLAGS) -DME_COM_OPENSSL_PATH=$(ME_COM_OPENSSL_PATH) -DME_COM_MBEDTLS_PATH=$(ME_COM_MBEDTLS_PATH) $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" "-I$(ME_COM_MBEDTLS_PATH)/include" src/rom.c

#
#   server.o
#
DEPS_60 += src/http/http.h

$(BUILD)/obj/server.o: \
    src/http/server.c $(DEPS_60)
	@echo '   [Compile] $(BUILD)/obj/server.o'
	$(CC) -c -o $(BUILD)/obj/server.o -arch $(CC_ARCH) -Wno-unknown-warning-option -fPIC -fstack-protector --param=ssp-buffer-size=4 -Wformat -Wformat-security $(DFLAGS) -DME_COM_OPENSSL_PATH=$(ME_COM_OPENSSL_PATH) -DME_COM_MBEDTLS_PATH=$(ME_COM_MBEDTLS_PATH) $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" "-I$(ME_COM_MBEDTLS_PATH)/include" src/http/server.c

#
#   sqlite3.h
#

src/sqlite/sqlite3.h: $(DEPS_61)

#
#   sqlite.o
#
DEPS_62 += $(BUILD)/inc/me.h
DEPS_62 += src/sqlite/sqlite3.h
DEPS_62 += $(BUILD)/inc/windows.h

$(BUILD)/obj/sqlite.o: \
    src/sqlite/sqlite.c $(DEPS_62)
	@echo '   [Compile] $(BUILD)/obj/sqlite.o'
	$(CC) -c -o $(BUILD)/obj/sqlite.o -arch $(CC_ARCH) -Wno-unknown-warning-option -fPIC -fstack-protector --param=ssp-buffer-size=4 -Wformat -Wformat-security $(DFLAGS) $(IFLAGS) src/sqlite/sqlite.c

#
#   sqlite3.o
#
DEPS_63 += $(BUILD)/inc/me.h
DEPS_63 += src/sqlite/sqlite3.h
DEPS_63 += $(BUILD)/inc/config.h
DEPS_63 += $(BUILD)/inc/windows.h
DEPS_63 += $(BUILD)/inc/sqlite3rtree.h

$(BUILD)/obj/sqlite3.o: \
    src/sqlite/sqlite3.c $(DEPS_63)
	@echo '   [Compile] $(BUILD)/obj/sqlite3.o'
	$(CC) -c -o $(BUILD)/obj/sqlite3.o -arch $(CC_ARCH) -Wno-unknown-warning-option -fPIC -fstack-protector --param=ssp-buffer-size=4 -Wformat -Wformat-security $(DFLAGS) $(IFLAGS) src/sqlite/sqlite3.c

#
#   testHandler.o
#
DEPS_64 += src/appweb.h

$(BUILD)/obj/testHandler.o: \
    src/modules/testHandler.c $(DEPS_64)
	@echo '   [Compile] $(BUILD)/obj/testHandler.o'
	$(CC) -c -o $(BUILD)/obj/testHandler.o -arch $(CC_ARCH) -Wno-unknown-warning-option -fPIC -fstack-protector --param=ssp-buffer-size=4 -Wformat -Wformat-security $(DFLAGS) -DME_COM_OPENSSL_PATH=$(ME_COM_OPENSSL_PATH) -DME_COM_MBEDTLS_PATH=$(ME_COM_MBEDTLS_PATH) $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" "-I$(ME_COM_MBEDTLS_PATH)/include" src/modules/testHandler.c

#
#   testWebSocketsHandler.o
#
DEPS_65 += src/appweb.h

$(BUILD)/obj/testWebSocketsHandler.o: \
    src/modules/testWebSocketsHandler.c $(DEPS_65)
	@echo '   [Compile] $(BUILD)/obj/testWebSocketsHandler.o'
	$(CC) -c -o $(BUILD)/obj/testWebSocketsHandler.o -arch $(CC_ARCH) -Wno-unknown-warning-option -fPIC -fstack-protector --param=ssp-buffer-size=4 -Wformat -Wformat-security $(DFLAGS) -DME_COM_OPENSSL_PATH=$(ME_COM_OPENSSL_PATH) -DME_COM_MBEDTLS_PATH=$(ME_COM_MBEDTLS_PATH) $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" "-I$(ME_COM_MBEDTLS_PATH)/include" src/modules/testWebSocketsHandler.c

#
#   watchdog.o
#
DEPS_66 += $(BUILD)/inc/mpr.h

$(BUILD)/obj/watchdog.o: \
    src/watchdog/watchdog.c $(DEPS_66)
	@echo '   [Compile] $(BUILD)/obj/watchdog.o'
	$(CC) -c -o $(BUILD)/obj/watchdog.o -arch $(CC_ARCH) -Wno-unknown-warning-option -fPIC -fstack-protector --param=ssp-buffer-size=4 -Wformat -Wformat-security $(DFLAGS) -DME_COM_OPENSSL_PATH=$(ME_COM_OPENSSL_PATH) -DME_COM_MBEDTLS_PATH=$(ME_COM_MBEDTLS_PATH) $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" "-I$(ME_COM_MBEDTLS_PATH)/include" src/watchdog/watchdog.c

#
#   libmpr
#
DEPS_67 += $(BUILD)/inc/osdep.h
DEPS_67 += $(BUILD)/inc/mpr.h
DEPS_67 += $(BUILD)/obj/mprLib.o

ifeq ($(ME_COM_MBEDTLS),1)
ifeq ($(ME_COM_MBEDTLS),1)
    LIBS_67 += -lmbedtls
    LIBPATHS_67 += -L"$(ME_COM_MBEDTLS_PATH)/lib"
    LIBPATHS_67 += -L"$(ME_COM_MBEDTLS_PATH)/library"
endif
endif
ifeq ($(ME_COM_MBEDTLS),1)
    LIBS_67 += -lmbedcrypto
    LIBPATHS_67 += -L"$(ME_COM_MBEDTLS_PATH)/lib"
    LIBPATHS_67 += -L"$(ME_COM_MBEDTLS_PATH)/library"
endif
ifeq ($(ME_COM_MBEDTLS),1)
    LIBS_67 += -lmbedx509
    LIBPATHS_67 += -L"$(ME_COM_MBEDTLS_PATH)/lib"
    LIBPATHS_67 += -L"$(ME_COM_MBEDTLS_PATH)/library"
endif
ifeq ($(ME_COM_OPENSSL),1)
ifeq ($(ME_COM_SSL),1)
    LIBS_67 += -lssl
    LIBPATHS_67 += -L"$(ME_COM_OPENSSL_PATH)/lib"
    LIBPATHS_67 += -L"$(ME_COM_OPENSSL_PATH)"
endif
endif
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_67 += -lcrypto
    LIBPATHS_67 += -L"$(ME_COM_OPENSSL_PATH)/lib"
    LIBPATHS_67 += -L"$(ME_COM_OPENSSL_PATH)"
endif

$(BUILD)/bin/libmpr.dylib: $(DEPS_67)
	@echo '      [Link] $(BUILD)/bin/libmpr.dylib'
	$(CC) -dynamiclib -o $(BUILD)/bin/libmpr.dylib -arch $(CC_ARCH) $(LDFLAGS) $(LIBPATHS)     -install_name @rpath/libmpr.dylib -compatibility_version 9.0 -current_version 9.0 "$(BUILD)/obj/mprLib.o" $(LIBPATHS_67) $(LIBS_67) $(LIBS_67) $(LIBS) 

ifeq ($(ME_COM_PCRE),1)
#
#   libpcre
#
DEPS_68 += $(BUILD)/inc/pcre.h
DEPS_68 += $(BUILD)/obj/pcre.o

$(BUILD)/bin/libpcre.dylib: $(DEPS_68)
	@echo '      [Link] $(BUILD)/bin/libpcre.dylib'
	$(CC) -dynamiclib -o $(BUILD)/bin/libpcre.dylib -arch $(CC_ARCH) $(LDFLAGS) -compatibility_version 9.0 -current_version 9.0 $(LIBPATHS) -install_name @rpath/libpcre.dylib -compatibility_version 9.0 -current_version 9.0 "$(BUILD)/obj/pcre.o" $(LIBS) 
endif

ifeq ($(ME_COM_HTTP),1)
#
#   libhttp
#
DEPS_69 += $(BUILD)/bin/libmpr.dylib
ifeq ($(ME_COM_PCRE),1)
    DEPS_69 += $(BUILD)/bin/libpcre.dylib
endif
DEPS_69 += $(BUILD)/inc/http.h
DEPS_69 += $(BUILD)/obj/httpLib.o

LIBS_69 += -lmpr
ifeq ($(ME_COM_MBEDTLS),1)
ifeq ($(ME_COM_MBEDTLS),1)
    LIBS_69 += -lmbedtls
    LIBPATHS_69 += -L"$(ME_COM_MBEDTLS_PATH)/lib"
    LIBPATHS_69 += -L"$(ME_COM_MBEDTLS_PATH)/library"
endif
endif
ifeq ($(ME_COM_MBEDTLS),1)
    LIBS_69 += -lmbedcrypto
    LIBPATHS_69 += -L"$(ME_COM_MBEDTLS_PATH)/lib"
    LIBPATHS_69 += -L"$(ME_COM_MBEDTLS_PATH)/library"
endif
ifeq ($(ME_COM_MBEDTLS),1)
    LIBS_69 += -lmbedx509
    LIBPATHS_69 += -L"$(ME_COM_MBEDTLS_PATH)/lib"
    LIBPATHS_69 += -L"$(ME_COM_MBEDTLS_PATH)/library"
endif
ifeq ($(ME_COM_OPENSSL),1)
ifeq ($(ME_COM_SSL),1)
    LIBS_69 += -lssl
    LIBPATHS_69 += -L"$(ME_COM_OPENSSL_PATH)/lib"
    LIBPATHS_69 += -L"$(ME_COM_OPENSSL_PATH)"
endif
endif
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_69 += -lcrypto
    LIBPATHS_69 += -L"$(ME_COM_OPENSSL_PATH)/lib"
    LIBPATHS_69 += -L"$(ME_COM_OPENSSL_PATH)"
endif
ifeq ($(ME_COM_PCRE),1)
    LIBS_69 += -lpcre
endif

$(BUILD)/bin/libhttp.dylib: $(DEPS_69)
	@echo '      [Link] $(BUILD)/bin/libhttp.dylib'
	$(CC) -dynamiclib -o $(BUILD)/bin/libhttp.dylib -arch $(CC_ARCH) $(LDFLAGS) $(LIBPATHS)     -install_name @rpath/libhttp.dylib -compatibility_version 9.0 -current_version 9.0 "$(BUILD)/obj/httpLib.o" $(LIBPATHS_69) $(LIBS_69) $(LIBS_69) $(LIBS) -lpam 
endif

#
#   libmpr-version
#
DEPS_70 += $(BUILD)/inc/mpr-version.h
DEPS_70 += $(BUILD)/obj/mpr-version.o

$(BUILD)/bin/libmpr-version.a: $(DEPS_70)
	@echo '      [Link] $(BUILD)/bin/libmpr-version.a'
	$(AR) -cr $(BUILD)/bin/libmpr-version.a "$(BUILD)/obj/mpr-version.o"

ifeq ($(ME_COM_ESP),1)
#
#   libesp
#
ifeq ($(ME_COM_HTTP),1)
    DEPS_71 += $(BUILD)/bin/libhttp.dylib
endif
DEPS_71 += $(BUILD)/bin/libmpr-version.a
ifeq ($(ME_COM_SQLITE),1)
    DEPS_71 += $(BUILD)/bin/libsql.dylib
endif
DEPS_71 += $(BUILD)/inc/esp.h
DEPS_71 += $(BUILD)/obj/espLib.o
ifeq ($(ME_COM_SQLITE),1)
    DEPS_71 += $(BUILD)/bin/libsql.dylib
endif

LIBS_71 += -lmpr
ifeq ($(ME_COM_MBEDTLS),1)
ifeq ($(ME_COM_MBEDTLS),1)
    LIBS_71 += -lmbedtls
    LIBPATHS_71 += -L"$(ME_COM_MBEDTLS_PATH)/lib"
    LIBPATHS_71 += -L"$(ME_COM_MBEDTLS_PATH)/library"
endif
endif
ifeq ($(ME_COM_MBEDTLS),1)
    LIBS_71 += -lmbedcrypto
    LIBPATHS_71 += -L"$(ME_COM_MBEDTLS_PATH)/lib"
    LIBPATHS_71 += -L"$(ME_COM_MBEDTLS_PATH)/library"
endif
ifeq ($(ME_COM_MBEDTLS),1)
    LIBS_71 += -lmbedx509
    LIBPATHS_71 += -L"$(ME_COM_MBEDTLS_PATH)/lib"
    LIBPATHS_71 += -L"$(ME_COM_MBEDTLS_PATH)/library"
endif
ifeq ($(ME_COM_OPENSSL),1)
ifeq ($(ME_COM_SSL),1)
    LIBS_71 += -lssl
    LIBPATHS_71 += -L"$(ME_COM_OPENSSL_PATH)/lib"
    LIBPATHS_71 += -L"$(ME_COM_OPENSSL_PATH)"
endif
endif
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_71 += -lcrypto
    LIBPATHS_71 += -L"$(ME_COM_OPENSSL_PATH)/lib"
    LIBPATHS_71 += -L"$(ME_COM_OPENSSL_PATH)"
endif
ifeq ($(ME_COM_PCRE),1)
    LIBS_71 += -lpcre
endif
ifeq ($(ME_COM_HTTP),1)
    LIBS_71 += -lhttp
endif
LIBS_71 += -lmpr-version
ifeq ($(ME_COM_SQLITE),1)
    LIBS_71 += -lsql
endif

$(BUILD)/bin/libesp.dylib: $(DEPS_71)
	@echo '      [Link] $(BUILD)/bin/libesp.dylib'
	$(CC) -dynamiclib -o $(BUILD)/bin/libesp.dylib -arch $(CC_ARCH) $(LDFLAGS) $(LIBPATHS)     -install_name @rpath/libesp.dylib -compatibility_version 9.0 -current_version 9.0 "$(BUILD)/obj/espLib.o" $(LIBPATHS_71) $(LIBS_71) $(LIBS_71) $(LIBS) -lpam 
endif

#
#   libappweb
#
ifeq ($(ME_COM_ESP),1)
    DEPS_72 += $(BUILD)/bin/libesp.dylib
endif
ifeq ($(ME_COM_SQLITE),1)
    DEPS_72 += $(BUILD)/bin/libsql.dylib
endif
ifeq ($(ME_COM_HTTP),1)
    DEPS_72 += $(BUILD)/bin/libhttp.dylib
endif
DEPS_72 += $(BUILD)/bin/libmpr.dylib
DEPS_72 += $(BUILD)/bin/libmpr-version.a
DEPS_72 += $(BUILD)/inc/appweb.h
DEPS_72 += $(BUILD)/inc/customize.h
DEPS_72 += $(BUILD)/obj/config.o
DEPS_72 += $(BUILD)/obj/convenience.o
DEPS_72 += $(BUILD)/obj/cgiHandler.o
DEPS_72 += $(BUILD)/obj/espHandler.o
DEPS_72 += $(BUILD)/obj/fastHandler.o
DEPS_72 += $(BUILD)/obj/proxyHandler.o
DEPS_72 += $(BUILD)/obj/testHandler.o
DEPS_72 += $(BUILD)/obj/testWebSocketsHandler.o
DEPS_72 += $(BUILD)/obj/rom.o

LIBS_72 += -lmpr
ifeq ($(ME_COM_MBEDTLS),1)
ifeq ($(ME_COM_MBEDTLS),1)
    LIBS_72 += -lmbedtls
    LIBPATHS_72 += -L"$(ME_COM_MBEDTLS_PATH)/lib"
    LIBPATHS_72 += -L"$(ME_COM_MBEDTLS_PATH)/library"
endif
endif
ifeq ($(ME_COM_MBEDTLS),1)
    LIBS_72 += -lmbedcrypto
    LIBPATHS_72 += -L"$(ME_COM_MBEDTLS_PATH)/lib"
    LIBPATHS_72 += -L"$(ME_COM_MBEDTLS_PATH)/library"
endif
ifeq ($(ME_COM_MBEDTLS),1)
    LIBS_72 += -lmbedx509
    LIBPATHS_72 += -L"$(ME_COM_MBEDTLS_PATH)/lib"
    LIBPATHS_72 += -L"$(ME_COM_MBEDTLS_PATH)/library"
endif
ifeq ($(ME_COM_OPENSSL),1)
ifeq ($(ME_COM_SSL),1)
    LIBS_72 += -lssl
    LIBPATHS_72 += -L"$(ME_COM_OPENSSL_PATH)/lib"
    LIBPATHS_72 += -L"$(ME_COM_OPENSSL_PATH)"
endif
endif
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_72 += -lcrypto
    LIBPATHS_72 += -L"$(ME_COM_OPENSSL_PATH)/lib"
    LIBPATHS_72 += -L"$(ME_COM_OPENSSL_PATH)"
endif
ifeq ($(ME_COM_PCRE),1)
    LIBS_72 += -lpcre
endif
ifeq ($(ME_COM_HTTP),1)
    LIBS_72 += -lhttp
endif
LIBS_72 += -lmpr-version
ifeq ($(ME_COM_ESP),1)
    LIBS_72 += -lesp
endif
ifeq ($(ME_COM_SQLITE),1)
    LIBS_72 += -lsql
endif

$(BUILD)/bin/libappweb.dylib: $(DEPS_72)
	@echo '      [Link] $(BUILD)/bin/libappweb.dylib'
	$(CC) -dynamiclib -o $(BUILD)/bin/libappweb.dylib -arch $(CC_ARCH) $(LDFLAGS) $(LIBPATHS)     -install_name @rpath/libappweb.dylib -compatibility_version 9.0 -current_version 9.0 "$(BUILD)/obj/config.o" "$(BUILD)/obj/convenience.o" "$(BUILD)/obj/cgiHandler.o" "$(BUILD)/obj/espHandler.o" "$(BUILD)/obj/fastHandler.o" "$(BUILD)/obj/proxyHandler.o" "$(BUILD)/obj/testHandler.o" "$(BUILD)/obj/testWebSocketsHandler.o" "$(BUILD)/obj/rom.o" $(LIBPATHS_72) $(LIBS_72) $(LIBS_72) $(LIBS) -lpam 

#
#   appweb
#
DEPS_73 += $(BUILD)/bin/libappweb.dylib
DEPS_73 += $(BUILD)/obj/appweb.o

LIBS_73 += -lmpr
ifeq ($(ME_COM_MBEDTLS),1)
ifeq ($(ME_COM_MBEDTLS),1)
    LIBS_73 += -lmbedtls
    LIBPATHS_73 += -L"$(ME_COM_MBEDTLS_PATH)/lib"
    LIBPATHS_73 += -L"$(ME_COM_MBEDTLS_PATH)/library"
endif
endif
ifeq ($(ME_COM_MBEDTLS),1)
    LIBS_73 += -lmbedcrypto
    LIBPATHS_73 += -L"$(ME_COM_MBEDTLS_PATH)/lib"
    LIBPATHS_73 += -L"$(ME_COM_MBEDTLS_PATH)/library"
endif
ifeq ($(ME_COM_MBEDTLS),1)
    LIBS_73 += -lmbedx509
    LIBPATHS_73 += -L"$(ME_COM_MBEDTLS_PATH)/lib"
    LIBPATHS_73 += -L"$(ME_COM_MBEDTLS_PATH)/library"
endif
ifeq ($(ME_COM_OPENSSL),1)
ifeq ($(ME_COM_SSL),1)
    LIBS_73 += -lssl
    LIBPATHS_73 += -L"$(ME_COM_OPENSSL_PATH)/lib"
    LIBPATHS_73 += -L"$(ME_COM_OPENSSL_PATH)"
endif
endif
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_73 += -lcrypto
    LIBPATHS_73 += -L"$(ME_COM_OPENSSL_PATH)/lib"
    LIBPATHS_73 += -L"$(ME_COM_OPENSSL_PATH)"
endif
ifeq ($(ME_COM_PCRE),1)
    LIBS_73 += -lpcre
endif
ifeq ($(ME_COM_HTTP),1)
    LIBS_73 += -lhttp
endif
LIBS_73 += -lmpr-version
ifeq ($(ME_COM_ESP),1)
    LIBS_73 += -lesp
endif
ifeq ($(ME_COM_SQLITE),1)
    LIBS_73 += -lsql
endif
LIBS_73 += -lappweb

$(BUILD)/bin/appweb: $(DEPS_73)
	@echo '      [Link] $(BUILD)/bin/appweb'
	$(CC) -o $(BUILD)/bin/appweb -arch $(CC_ARCH) $(LDFLAGS) $(LIBPATHS)     "$(BUILD)/obj/appweb.o" $(LIBPATHS_73) $(LIBS_73) $(LIBS_73) $(LIBS) -lpam 

#
#   authpass
#
DEPS_74 += $(BUILD)/bin/libappweb.dylib
DEPS_74 += $(BUILD)/obj/authpass.o

LIBS_74 += -lmpr
ifeq ($(ME_COM_MBEDTLS),1)
ifeq ($(ME_COM_MBEDTLS),1)
    LIBS_74 += -lmbedtls
    LIBPATHS_74 += -L"$(ME_COM_MBEDTLS_PATH)/lib"
    LIBPATHS_74 += -L"$(ME_COM_MBEDTLS_PATH)/library"
endif
endif
ifeq ($(ME_COM_MBEDTLS),1)
    LIBS_74 += -lmbedcrypto
    LIBPATHS_74 += -L"$(ME_COM_MBEDTLS_PATH)/lib"
    LIBPATHS_74 += -L"$(ME_COM_MBEDTLS_PATH)/library"
endif
ifeq ($(ME_COM_MBEDTLS),1)
    LIBS_74 += -lmbedx509
    LIBPATHS_74 += -L"$(ME_COM_MBEDTLS_PATH)/lib"
    LIBPATHS_74 += -L"$(ME_COM_MBEDTLS_PATH)/library"
endif
ifeq ($(ME_COM_OPENSSL),1)
ifeq ($(ME_COM_SSL),1)
    LIBS_74 += -lssl
    LIBPATHS_74 += -L"$(ME_COM_OPENSSL_PATH)/lib"
    LIBPATHS_74 += -L"$(ME_COM_OPENSSL_PATH)"
endif
endif
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_74 += -lcrypto
    LIBPATHS_74 += -L"$(ME_COM_OPENSSL_PATH)/lib"
    LIBPATHS_74 += -L"$(ME_COM_OPENSSL_PATH)"
endif
ifeq ($(ME_COM_PCRE),1)
    LIBS_74 += -lpcre
endif
ifeq ($(ME_COM_HTTP),1)
    LIBS_74 += -lhttp
endif
LIBS_74 += -lmpr-version
ifeq ($(ME_COM_ESP),1)
    LIBS_74 += -lesp
endif
ifeq ($(ME_COM_SQLITE),1)
    LIBS_74 += -lsql
endif
LIBS_74 += -lappweb

$(BUILD)/bin/authpass: $(DEPS_74)
	@echo '      [Link] $(BUILD)/bin/authpass'
	$(CC) -o $(BUILD)/bin/authpass -arch $(CC_ARCH) $(LDFLAGS) $(LIBPATHS)     "$(BUILD)/obj/authpass.o" $(LIBPATHS_74) $(LIBS_74) $(LIBS_74) $(LIBS) -lpam 

ifeq ($(ME_COM_ESP),1)
#
#   espcmd
#
DEPS_75 += $(BUILD)/bin/libesp.dylib
ifeq ($(ME_COM_SQLITE),1)
    DEPS_75 += $(BUILD)/bin/libsql.dylib
endif
DEPS_75 += $(BUILD)/obj/esp.o

LIBS_75 += -lmpr
ifeq ($(ME_COM_MBEDTLS),1)
ifeq ($(ME_COM_MBEDTLS),1)
    LIBS_75 += -lmbedtls
    LIBPATHS_75 += -L"$(ME_COM_MBEDTLS_PATH)/lib"
    LIBPATHS_75 += -L"$(ME_COM_MBEDTLS_PATH)/library"
endif
endif
ifeq ($(ME_COM_MBEDTLS),1)
    LIBS_75 += -lmbedcrypto
    LIBPATHS_75 += -L"$(ME_COM_MBEDTLS_PATH)/lib"
    LIBPATHS_75 += -L"$(ME_COM_MBEDTLS_PATH)/library"
endif
ifeq ($(ME_COM_MBEDTLS),1)
    LIBS_75 += -lmbedx509
    LIBPATHS_75 += -L"$(ME_COM_MBEDTLS_PATH)/lib"
    LIBPATHS_75 += -L"$(ME_COM_MBEDTLS_PATH)/library"
endif
ifeq ($(ME_COM_OPENSSL),1)
ifeq ($(ME_COM_SSL),1)
    LIBS_75 += -lssl
    LIBPATHS_75 += -L"$(ME_COM_OPENSSL_PATH)/lib"
    LIBPATHS_75 += -L"$(ME_COM_OPENSSL_PATH)"
endif
endif
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_75 += -lcrypto
    LIBPATHS_75 += -L"$(ME_COM_OPENSSL_PATH)/lib"
    LIBPATHS_75 += -L"$(ME_COM_OPENSSL_PATH)"
endif
ifeq ($(ME_COM_PCRE),1)
    LIBS_75 += -lpcre
endif
ifeq ($(ME_COM_HTTP),1)
    LIBS_75 += -lhttp
endif
LIBS_75 += -lmpr-version
LIBS_75 += -lesp
ifeq ($(ME_COM_SQLITE),1)
    LIBS_75 += -lsql
endif

$(BUILD)/bin/appweb-esp: $(DEPS_75)
	@echo '      [Link] $(BUILD)/bin/appweb-esp'
	$(CC) -o $(BUILD)/bin/appweb-esp -arch $(CC_ARCH) $(LDFLAGS) $(LIBPATHS)     "$(BUILD)/obj/esp.o" $(LIBPATHS_75) $(LIBS_75) $(LIBS_75) $(LIBS) -lpam 
endif

ifeq ($(ME_COM_ESP),1)
#
#   extras
#
DEPS_76 += src/esp/esp-compile.json
DEPS_76 += src/esp/vcvars.bat

$(BUILD)/.extras-modified: $(DEPS_76)
	@echo '      [Copy] $(BUILD)/bin'
	mkdir -p "$(BUILD)/bin"
	cp src/esp/esp-compile.json $(BUILD)/bin/esp-compile.json
	cp src/esp/vcvars.bat $(BUILD)/bin/vcvars.bat
	touch "$(BUILD)/.extras-modified" 2>/dev/null
endif

ifeq ($(ME_COM_HTTP),1)
#
#   httpcmd
#
DEPS_77 += $(BUILD)/bin/libhttp.dylib
DEPS_77 += $(BUILD)/obj/http.o

LIBS_77 += -lmpr
ifeq ($(ME_COM_MBEDTLS),1)
ifeq ($(ME_COM_MBEDTLS),1)
    LIBS_77 += -lmbedtls
    LIBPATHS_77 += -L"$(ME_COM_MBEDTLS_PATH)/lib"
    LIBPATHS_77 += -L"$(ME_COM_MBEDTLS_PATH)/library"
endif
endif
ifeq ($(ME_COM_MBEDTLS),1)
    LIBS_77 += -lmbedcrypto
    LIBPATHS_77 += -L"$(ME_COM_MBEDTLS_PATH)/lib"
    LIBPATHS_77 += -L"$(ME_COM_MBEDTLS_PATH)/library"
endif
ifeq ($(ME_COM_MBEDTLS),1)
    LIBS_77 += -lmbedx509
    LIBPATHS_77 += -L"$(ME_COM_MBEDTLS_PATH)/lib"
    LIBPATHS_77 += -L"$(ME_COM_MBEDTLS_PATH)/library"
endif
ifeq ($(ME_COM_OPENSSL),1)
ifeq ($(ME_COM_SSL),1)
    LIBS_77 += -lssl
    LIBPATHS_77 += -L"$(ME_COM_OPENSSL_PATH)/lib"
    LIBPATHS_77 += -L"$(ME_COM_OPENSSL_PATH)"
endif
endif
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_77 += -lcrypto
    LIBPATHS_77 += -L"$(ME_COM_OPENSSL_PATH)/lib"
    LIBPATHS_77 += -L"$(ME_COM_OPENSSL_PATH)"
endif
ifeq ($(ME_COM_PCRE),1)
    LIBS_77 += -lpcre
endif
LIBS_77 += -lhttp

$(BUILD)/bin/http: $(DEPS_77)
	@echo '      [Link] $(BUILD)/bin/http'
	$(CC) -o $(BUILD)/bin/http -arch $(CC_ARCH) $(LDFLAGS) $(LIBPATHS)     "$(BUILD)/obj/http.o" $(LIBPATHS_77) $(LIBS_77) $(LIBS_77) $(LIBS) -lpam 
endif

#
#   installPrep
#

installPrep: $(DEPS_78)
	if [ "`id -u`" != 0 ] ; \
	then echo "Must run as root. Rerun with sudo." ; \
	exit 255 ; \
	fi

#
#   install-roots
#
DEPS_79 += certs/roots.crt

$(BUILD)/.install-roots-modified: $(DEPS_79)
	@echo '      [Copy] $(BUILD)/bin'
	mkdir -p "$(BUILD)/bin"
	cp certs/roots.crt $(BUILD)/bin/roots.crt
	touch "$(BUILD)/.install-roots-modified" 2>/dev/null

ifeq ($(ME_COM_SQLITE),1)
#
#   libsql
#
DEPS_80 += $(BUILD)/inc/sqlite3.h
DEPS_80 += $(BUILD)/obj/sqlite3.o

$(BUILD)/bin/libsql.dylib: $(DEPS_80)
	@echo '      [Link] $(BUILD)/bin/libsql.dylib'
	$(CC) -dynamiclib -o $(BUILD)/bin/libsql.dylib -arch $(CC_ARCH) $(LDFLAGS) $(LIBPATHS) -install_name @rpath/libsql.dylib -compatibility_version 9.0 -current_version 9.0 "$(BUILD)/obj/sqlite3.o" $(LIBS) 
endif

#
#   makerom
#
DEPS_81 += $(BUILD)/bin/libmpr.dylib
DEPS_81 += $(BUILD)/obj/makerom.o

LIBS_81 += -lmpr
ifeq ($(ME_COM_MBEDTLS),1)
ifeq ($(ME_COM_MBEDTLS),1)
    LIBS_81 += -lmbedtls
    LIBPATHS_81 += -L"$(ME_COM_MBEDTLS_PATH)/lib"
    LIBPATHS_81 += -L"$(ME_COM_MBEDTLS_PATH)/library"
endif
endif
ifeq ($(ME_COM_MBEDTLS),1)
    LIBS_81 += -lmbedcrypto
    LIBPATHS_81 += -L"$(ME_COM_MBEDTLS_PATH)/lib"
    LIBPATHS_81 += -L"$(ME_COM_MBEDTLS_PATH)/library"
endif
ifeq ($(ME_COM_MBEDTLS),1)
    LIBS_81 += -lmbedx509
    LIBPATHS_81 += -L"$(ME_COM_MBEDTLS_PATH)/lib"
    LIBPATHS_81 += -L"$(ME_COM_MBEDTLS_PATH)/library"
endif
ifeq ($(ME_COM_OPENSSL),1)
ifeq ($(ME_COM_SSL),1)
    LIBS_81 += -lssl
    LIBPATHS_81 += -L"$(ME_COM_OPENSSL_PATH)/lib"
    LIBPATHS_81 += -L"$(ME_COM_OPENSSL_PATH)"
endif
endif
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_81 += -lcrypto
    LIBPATHS_81 += -L"$(ME_COM_OPENSSL_PATH)/lib"
    LIBPATHS_81 += -L"$(ME_COM_OPENSSL_PATH)"
endif

$(BUILD)/bin/makerom: $(DEPS_81)
	@echo '      [Link] $(BUILD)/bin/makerom'
	$(CC) -o $(BUILD)/bin/makerom -arch $(CC_ARCH) $(LDFLAGS) $(LIBPATHS)     "$(BUILD)/obj/makerom.o" $(LIBPATHS_81) $(LIBS_81) $(LIBS_81) $(LIBS) 

#
#   server
#
ifeq ($(ME_COM_HTTP),1)
    DEPS_82 += $(BUILD)/bin/libhttp.dylib
endif
DEPS_82 += $(BUILD)/obj/server.o

LIBS_82 += -lmpr
ifeq ($(ME_COM_MBEDTLS),1)
ifeq ($(ME_COM_MBEDTLS),1)
    LIBS_82 += -lmbedtls
    LIBPATHS_82 += -L"$(ME_COM_MBEDTLS_PATH)/lib"
    LIBPATHS_82 += -L"$(ME_COM_MBEDTLS_PATH)/library"
endif
endif
ifeq ($(ME_COM_MBEDTLS),1)
    LIBS_82 += -lmbedcrypto
    LIBPATHS_82 += -L"$(ME_COM_MBEDTLS_PATH)/lib"
    LIBPATHS_82 += -L"$(ME_COM_MBEDTLS_PATH)/library"
endif
ifeq ($(ME_COM_MBEDTLS),1)
    LIBS_82 += -lmbedx509
    LIBPATHS_82 += -L"$(ME_COM_MBEDTLS_PATH)/lib"
    LIBPATHS_82 += -L"$(ME_COM_MBEDTLS_PATH)/library"
endif
ifeq ($(ME_COM_OPENSSL),1)
ifeq ($(ME_COM_SSL),1)
    LIBS_82 += -lssl
    LIBPATHS_82 += -L"$(ME_COM_OPENSSL_PATH)/lib"
    LIBPATHS_82 += -L"$(ME_COM_OPENSSL_PATH)"
endif
endif
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_82 += -lcrypto
    LIBPATHS_82 += -L"$(ME_COM_OPENSSL_PATH)/lib"
    LIBPATHS_82 += -L"$(ME_COM_OPENSSL_PATH)"
endif
ifeq ($(ME_COM_PCRE),1)
    LIBS_82 += -lpcre
endif
ifeq ($(ME_COM_HTTP),1)
    LIBS_82 += -lhttp
endif

$(BUILD)/bin/server: $(DEPS_82)
	@echo '      [Link] $(BUILD)/bin/server'
	$(CC) -o $(BUILD)/bin/server -arch $(CC_ARCH) $(LDFLAGS) $(LIBPATHS)     "$(BUILD)/obj/server.o" $(LIBPATHS_82) $(LIBS_82) $(LIBS_82) $(LIBS) -lpam 

#
#   server-cache
#

src/server/cache: $(DEPS_83)
	( \
	cd src/server; \
	mkdir -p "cache" ; \
	)

ifeq ($(ME_COM_WATCHDOG),1)
#
#   watchdog
#
DEPS_84 += $(BUILD)/bin/libmpr.dylib
DEPS_84 += $(BUILD)/obj/watchdog.o

LIBS_84 += -lmpr
ifeq ($(ME_COM_MBEDTLS),1)
ifeq ($(ME_COM_MBEDTLS),1)
    LIBS_84 += -lmbedtls
    LIBPATHS_84 += -L"$(ME_COM_MBEDTLS_PATH)/lib"
    LIBPATHS_84 += -L"$(ME_COM_MBEDTLS_PATH)/library"
endif
endif
ifeq ($(ME_COM_MBEDTLS),1)
    LIBS_84 += -lmbedcrypto
    LIBPATHS_84 += -L"$(ME_COM_MBEDTLS_PATH)/lib"
    LIBPATHS_84 += -L"$(ME_COM_MBEDTLS_PATH)/library"
endif
ifeq ($(ME_COM_MBEDTLS),1)
    LIBS_84 += -lmbedx509
    LIBPATHS_84 += -L"$(ME_COM_MBEDTLS_PATH)/lib"
    LIBPATHS_84 += -L"$(ME_COM_MBEDTLS_PATH)/library"
endif
ifeq ($(ME_COM_OPENSSL),1)
ifeq ($(ME_COM_SSL),1)
    LIBS_84 += -lssl
    LIBPATHS_84 += -L"$(ME_COM_OPENSSL_PATH)/lib"
    LIBPATHS_84 += -L"$(ME_COM_OPENSSL_PATH)"
endif
endif
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_84 += -lcrypto
    LIBPATHS_84 += -L"$(ME_COM_OPENSSL_PATH)/lib"
    LIBPATHS_84 += -L"$(ME_COM_OPENSSL_PATH)"
endif

$(BUILD)/bin/appman: $(DEPS_84)
	@echo '      [Link] $(BUILD)/bin/appman'
	$(CC) -o $(BUILD)/bin/appman -arch $(CC_ARCH) $(LDFLAGS) $(LIBPATHS)     "$(BUILD)/obj/watchdog.o" $(LIBPATHS_84) $(LIBS_84) $(LIBS_84) $(LIBS) 
endif

#
#   stop
#
DEPS_85 += compile

stop: $(DEPS_85)
	@./$(BUILD)/bin/appman stop disable uninstall >/dev/null 2>&1 ; true

#
#   installBinary
#

installBinary: $(DEPS_86)
	mkdir -p "$(ME_APP_PREFIX)" ; \
	rm -f "$(ME_APP_PREFIX)/latest" ; \
	ln -s "$(VERSION)" "$(ME_APP_PREFIX)/latest" ; \
	mkdir -p "$(ME_MAN_PREFIX)/man1" ; \
	chmod 755 "$(ME_MAN_PREFIX)/man1" ; \
	mkdir -p "$(ME_LOG_PREFIX)" ; \
	chmod 755 "$(ME_LOG_PREFIX)" ; \
	[ `id -u` = 0 ] && chown $(WEB_USER):$(WEB_GROUP) "$(ME_LOG_PREFIX)"; true ; \
	mkdir -p "$(ME_CACHE_PREFIX)" ; \
	chmod 755 "$(ME_CACHE_PREFIX)" ; \
	[ `id -u` = 0 ] && chown $(WEB_USER):$(WEB_GROUP) "$(ME_CACHE_PREFIX)"; true ; \
	mkdir -p "$(ME_VAPP_PREFIX)/bin" ; \
	mkdir -p "$(ME_BIN_PREFIX)" ; \
	rm -f "$(ME_BIN_PREFIX)/appweb" ; \
	ln -s "$(ME_VAPP_PREFIX)/bin/appweb" "$(ME_BIN_PREFIX)/appweb" ; \
	if [ "$(ME_COM_SSL)" = 1 ]; then true ; \
	mkdir -p "$(ME_VAPP_PREFIX)/bin" ; \
	cp certs/roots.crt $(ME_VAPP_PREFIX)/bin/roots.crt ; \
	fi ; \
	mkdir -p "$(ME_ETC_PREFIX)" ; \
	cp src/server/mime.types $(ME_ETC_PREFIX)/mime.types ; \
	mkdir -p "$(ME_ETC_PREFIX)" ; \
	cp src/server/appweb.conf $(ME_ETC_PREFIX)/appweb.conf ; \
	mkdir -p "$(ME_ETC_PREFIX)" ; \
	cp src/server/esp.json $(ME_ETC_PREFIX)/esp.json ; \
	mkdir -p "$(ME_ETC_PREFIX)" ; \
	cp src/server/sample.conf $(ME_ETC_PREFIX)/sample.conf ; \
	echo 'set LOG_DIR "$(ME_LOG_PREFIX)"\nset CACHE_DIR "$(ME_CACHE_PREFIX)"\nDocuments "$(ME_WEB_PREFIX)"\nListen 80\n<if SSL_MODULE>\nListenSecure 443\n</if>\n' >$(ME_ETC_PREFIX)/install.conf ; \
	mkdir -p "$(ME_VAPP_PREFIX)/bin" ; \
	mkdir -p "$(ME_WEB_PREFIX)" ; \
	mkdir -p "$(ME_WEB_PREFIX)/bench" ; \
	cp src/server/web/bench/1b.html $(ME_WEB_PREFIX)/bench/1b.html ; \
	cp src/server/web/bench/4k.html $(ME_WEB_PREFIX)/bench/4k.html ; \
	cp src/server/web/bench/64k.html $(ME_WEB_PREFIX)/bench/64k.html ; \
	cp src/server/web/favicon.ico $(ME_WEB_PREFIX)/favicon.ico ; \
	mkdir -p "$(ME_WEB_PREFIX)/icons" ; \
	cp src/server/web/icons/back.gif $(ME_WEB_PREFIX)/icons/back.gif ; \
	cp src/server/web/icons/blank.gif $(ME_WEB_PREFIX)/icons/blank.gif ; \
	cp src/server/web/icons/compressed.gif $(ME_WEB_PREFIX)/icons/compressed.gif ; \
	cp src/server/web/icons/folder.gif $(ME_WEB_PREFIX)/icons/folder.gif ; \
	cp src/server/web/icons/parent.gif $(ME_WEB_PREFIX)/icons/parent.gif ; \
	cp src/server/web/icons/space.gif $(ME_WEB_PREFIX)/icons/space.gif ; \
	cp src/server/web/icons/text.gif $(ME_WEB_PREFIX)/icons/text.gif ; \
	cp src/server/web/iehacks.css $(ME_WEB_PREFIX)/iehacks.css ; \
	mkdir -p "$(ME_WEB_PREFIX)/images" ; \
	cp src/server/web/images/banner.jpg $(ME_WEB_PREFIX)/images/banner.jpg ; \
	cp src/server/web/images/bottomShadow.jpg $(ME_WEB_PREFIX)/images/bottomShadow.jpg ; \
	cp src/server/web/images/shadow.jpg $(ME_WEB_PREFIX)/images/shadow.jpg ; \
	cp src/server/web/index.html $(ME_WEB_PREFIX)/index.html ; \
	cp src/server/web/min-index.html $(ME_WEB_PREFIX)/min-index.html ; \
	cp src/server/web/print.css $(ME_WEB_PREFIX)/print.css ; \
	cp src/server/web/screen.css $(ME_WEB_PREFIX)/screen.css ; \
	mkdir -p "$(ME_WEB_PREFIX)/test" ; \
	cp src/server/web/test/bench.html $(ME_WEB_PREFIX)/test/bench.html ; \
	cp src/server/web/test/index.html $(ME_WEB_PREFIX)/test/index.html ; \
	cp src/server/web/test/test.cgi $(ME_WEB_PREFIX)/test/test.cgi ; \
	cp src/server/web/test/test.esp $(ME_WEB_PREFIX)/test/test.esp ; \
	cp src/server/web/test/test.html $(ME_WEB_PREFIX)/test/test.html ; \
	cp src/server/web/test/test.pl $(ME_WEB_PREFIX)/test/test.pl ; \
	cp src/server/web/test/test.py $(ME_WEB_PREFIX)/test/test.py ; \
	mkdir -p "$(ME_WEB_PREFIX)/test" ; \
	cp src/server/web/test/test.cgi $(ME_WEB_PREFIX)/test/test.cgi ; \
	chmod 755 "$(ME_WEB_PREFIX)/test/test.cgi" ; \
	cp src/server/web/test/test.pl $(ME_WEB_PREFIX)/test/test.pl ; \
	chmod 755 "$(ME_WEB_PREFIX)/test/test.pl" ; \
	cp src/server/web/test/test.py $(ME_WEB_PREFIX)/test/test.py ; \
	chmod 755 "$(ME_WEB_PREFIX)/test/test.py" ; \
	mkdir -p "$(ME_VAPP_PREFIX)/bin" ; \
	mkdir -p "$(ME_BIN_PREFIX)" ; \
	rm -f "$(ME_BIN_PREFIX)/appman" ; \
	ln -s "$(ME_VAPP_PREFIX)/bin/appman" "$(ME_BIN_PREFIX)/appman" ; \
	mkdir -p "$(ME_ROOT_PREFIX)/Library/LaunchDaemons" ; \
	cp installs/macosx/com.embedthis.appweb.plist $(ME_ROOT_PREFIX)/Library/LaunchDaemons/com.embedthis.appweb.plist ; \
	chmod 644 "$(ME_ROOT_PREFIX)/Library/LaunchDaemons/com.embedthis.appweb.plist" ; \
	if [ "$(ME_COM_ESP)" = 1 ]; then true ; \
	mkdir -p "$(ME_VAPP_PREFIX)/bin" ; \
	mkdir -p "$(ME_BIN_PREFIX)" ; \
	rm -f "$(ME_BIN_PREFIX)/appesp" ; \
	ln -s "$(ME_VAPP_PREFIX)/bin/appesp" "$(ME_BIN_PREFIX)/appesp" ; \
	fi ; \
	if [ "$(ME_COM_ESP)" = 1 ]; then true ; \
	mkdir -p "$(ME_VAPP_PREFIX)/bin" ; \
	mkdir -p "$(ME_BIN_PREFIX)" ; \
	rm -f "$(ME_BIN_PREFIX)/appweb-esp" ; \
	ln -s "$(ME_VAPP_PREFIX)/bin/appweb-esp" "$(ME_BIN_PREFIX)/appweb-esp" ; \
	fi ; \
	if [ "$(ME_COM_ESP)" = 1 ]; then true ; \
	fi ; \
	if [ "$(ME_COM_ESP)" = 1 ]; then true ; \
	mkdir -p "$(ME_VAPP_PREFIX)/bin" ; \
	fi ; \
	mkdir -p "$(ME_VAPP_PREFIX)/bin" ; \
	mkdir -p "$(ME_BIN_PREFIX)" ; \
	rm -f "$(ME_BIN_PREFIX)/http" ; \
	ln -s "$(ME_VAPP_PREFIX)/bin/http" "$(ME_BIN_PREFIX)/http" ; \
	mkdir -p "$(ME_VAPP_PREFIX)/inc" ; \
	cp $(BUILD)/inc/me.h $(ME_VAPP_PREFIX)/inc/me.h ; \
	mkdir -p "$(ME_INC_PREFIX)/appweb" ; \
	rm -f "$(ME_INC_PREFIX)/appweb/me.h" ; \
	ln -s "$(ME_VAPP_PREFIX)/inc/me.h" "$(ME_INC_PREFIX)/appweb/me.h" ; \
	cp src/osdep/osdep.h $(ME_VAPP_PREFIX)/inc/osdep.h ; \
	mkdir -p "$(ME_INC_PREFIX)/appweb" ; \
	rm -f "$(ME_INC_PREFIX)/appweb/osdep.h" ; \
	ln -s "$(ME_VAPP_PREFIX)/inc/osdep.h" "$(ME_INC_PREFIX)/appweb/osdep.h" ; \
	cp src/appweb.h $(ME_VAPP_PREFIX)/inc/appweb.h ; \
	mkdir -p "$(ME_INC_PREFIX)/appweb" ; \
	rm -f "$(ME_INC_PREFIX)/appweb/appweb.h" ; \
	ln -s "$(ME_VAPP_PREFIX)/inc/appweb.h" "$(ME_INC_PREFIX)/appweb/appweb.h" ; \
	cp src/customize.h $(ME_VAPP_PREFIX)/inc/customize.h ; \
	mkdir -p "$(ME_INC_PREFIX)/appweb" ; \
	rm -f "$(ME_INC_PREFIX)/appweb/customize.h" ; \
	ln -s "$(ME_VAPP_PREFIX)/inc/customize.h" "$(ME_INC_PREFIX)/appweb/customize.h" ; \
	cp src/http/http.h $(ME_VAPP_PREFIX)/inc/http.h ; \
	mkdir -p "$(ME_INC_PREFIX)/appweb" ; \
	rm -f "$(ME_INC_PREFIX)/appweb/http.h" ; \
	ln -s "$(ME_VAPP_PREFIX)/inc/http.h" "$(ME_INC_PREFIX)/appweb/http.h" ; \
	cp src/mpr/mpr.h $(ME_VAPP_PREFIX)/inc/mpr.h ; \
	mkdir -p "$(ME_INC_PREFIX)/appweb" ; \
	rm -f "$(ME_INC_PREFIX)/appweb/mpr.h" ; \
	ln -s "$(ME_VAPP_PREFIX)/inc/mpr.h" "$(ME_INC_PREFIX)/appweb/mpr.h" ; \
	cp src/pcre/pcre.h $(ME_VAPP_PREFIX)/inc/pcre.h ; \
	mkdir -p "$(ME_INC_PREFIX)/appweb" ; \
	rm -f "$(ME_INC_PREFIX)/appweb/pcre.h" ; \
	ln -s "$(ME_VAPP_PREFIX)/inc/pcre.h" "$(ME_INC_PREFIX)/appweb/pcre.h" ; \
	if [ "$(ME_COM_ESP)" = 1 ]; then true ; \
	mkdir -p "$(ME_VAPP_PREFIX)/inc" ; \
	cp src/esp/esp.h $(ME_VAPP_PREFIX)/inc/esp.h ; \
	mkdir -p "$(ME_INC_PREFIX)/appweb" ; \
	rm -f "$(ME_INC_PREFIX)/appweb/esp.h" ; \
	ln -s "$(ME_VAPP_PREFIX)/inc/esp.h" "$(ME_INC_PREFIX)/appweb/esp.h" ; \
	fi ; \
	mkdir -p "$(ME_VAPP_PREFIX)/doc/man1" ; \
	cp doc/man/appman.1 $(ME_VAPP_PREFIX)/doc/man1/appman.1 ; \
	mkdir -p "$(ME_MAN_PREFIX)/man1" ; \
	rm -f "$(ME_MAN_PREFIX)/man1/appman.1" ; \
	ln -s "$(ME_VAPP_PREFIX)/doc/man1/appman.1" "$(ME_MAN_PREFIX)/man1/appman.1" ; \
	cp doc/man/appweb.1 $(ME_VAPP_PREFIX)/doc/man1/appweb.1 ; \
	mkdir -p "$(ME_MAN_PREFIX)/man1" ; \
	rm -f "$(ME_MAN_PREFIX)/man1/appweb.1" ; \
	ln -s "$(ME_VAPP_PREFIX)/doc/man1/appweb.1" "$(ME_MAN_PREFIX)/man1/appweb.1" ; \
	cp doc/man/appwebMonitor.1 $(ME_VAPP_PREFIX)/doc/man1/appwebMonitor.1 ; \
	mkdir -p "$(ME_MAN_PREFIX)/man1" ; \
	rm -f "$(ME_MAN_PREFIX)/man1/appwebMonitor.1" ; \
	ln -s "$(ME_VAPP_PREFIX)/doc/man1/appwebMonitor.1" "$(ME_MAN_PREFIX)/man1/appwebMonitor.1" ; \
	cp doc/man/authpass.1 $(ME_VAPP_PREFIX)/doc/man1/authpass.1 ; \
	mkdir -p "$(ME_MAN_PREFIX)/man1" ; \
	rm -f "$(ME_MAN_PREFIX)/man1/authpass.1" ; \
	ln -s "$(ME_VAPP_PREFIX)/doc/man1/authpass.1" "$(ME_MAN_PREFIX)/man1/authpass.1" ; \
	cp doc/man/esp.1 $(ME_VAPP_PREFIX)/doc/man1/esp.1 ; \
	mkdir -p "$(ME_MAN_PREFIX)/man1" ; \
	rm -f "$(ME_MAN_PREFIX)/man1/esp.1" ; \
	ln -s "$(ME_VAPP_PREFIX)/doc/man1/esp.1" "$(ME_MAN_PREFIX)/man1/esp.1" ; \
	cp doc/man/http.1 $(ME_VAPP_PREFIX)/doc/man1/http.1 ; \
	mkdir -p "$(ME_MAN_PREFIX)/man1" ; \
	rm -f "$(ME_MAN_PREFIX)/man1/http.1" ; \
	ln -s "$(ME_VAPP_PREFIX)/doc/man1/http.1" "$(ME_MAN_PREFIX)/man1/http.1" ; \
	cp doc/man/makerom.1 $(ME_VAPP_PREFIX)/doc/man1/makerom.1 ; \
	mkdir -p "$(ME_MAN_PREFIX)/man1" ; \
	rm -f "$(ME_MAN_PREFIX)/man1/makerom.1" ; \
	ln -s "$(ME_VAPP_PREFIX)/doc/man1/makerom.1" "$(ME_MAN_PREFIX)/man1/makerom.1"

#
#   start
#
DEPS_87 += compile
DEPS_87 += stop

start: $(DEPS_87)
	./$(BUILD)/bin/appman install enable start

#
#   install
#
DEPS_88 += installPrep
DEPS_88 += compile
DEPS_88 += stop
DEPS_88 += installBinary
DEPS_88 += start

install: $(DEPS_88)

#
#   run
#
DEPS_89 += compile

run: $(DEPS_89)
	( \
	cd src/server; \
	../../$(BUILD)/bin/appweb --log stdout:2 ; \
	)

#
#   uninstall
#
DEPS_90 += stop

uninstall: $(DEPS_90)
	( \
	cd installs; \
	rm -f "$(ME_ETC_PREFIX)/appweb.conf" ; \
	rm -f "$(ME_ETC_PREFIX)/esp.conf" ; \
	rm -f "$(ME_ETC_PREFIX)/mine.types" ; \
	rm -f "$(ME_ETC_PREFIX)/install.conf" ; \
	rm -fr "$(ME_INC_PREFIX)/appweb" ; \
	)

#
#   uninstallBinary
#

uninstallBinary: $(DEPS_91)
	rm -fr "$(ME_WEB_PREFIX)" ; \
	rm -fr "$(ME_SPOOL_PREFIX)" ; \
	rm -fr "$(ME_CACHE_PREFIX)" ; \
	rm -fr "$(ME_LOG_PREFIX)" ; \
	rm -fr "$(ME_VAPP_PREFIX)" ; \
	rmdir -p "$(ME_ETC_PREFIX)" 2>/dev/null ; true ; \
	rmdir -p "$(ME_WEB_PREFIX)" 2>/dev/null ; true ; \
	rmdir -p "$(ME_LOG_PREFIX)" 2>/dev/null ; true ; \
	rmdir -p "$(ME_SPOOL_PREFIX)" 2>/dev/null ; true ; \
	rmdir -p "$(ME_CACHE_PREFIX)" 2>/dev/null ; true ; \
	rm -f "$(ME_APP_PREFIX)/latest" ; \
	rmdir -p "$(ME_APP_PREFIX)" 2>/dev/null ; true

#
#   version
#

version: $(DEPS_92)
	echo $(VERSION)


EXTRA_MAKEFILE := $(strip $(wildcard ./projects/extra.mk))
ifneq ($(EXTRA_MAKEFILE),)
include $(EXTRA_MAKEFILE)
endif
