#
#   appweb-vxworks-default.mk -- Makefile to build Embedthis Appweb for vxworks
#

NAME                  := appweb
VERSION               := 9.0.4
PROFILE               ?= default
ARCH                  ?= $(shell echo $(WIND_HOST_TYPE) | sed 's/-.*$(ME_ROOT_PREFIX)/')
CPU                   ?= $(subst X86,PENTIUM,$(shell echo $(ARCH) | tr a-z A-Z))
OS                    ?= vxworks
CC                    ?= cc$(subst x86,pentium,$(ARCH))
LD                    ?= ldundefined
AR                    ?= arundefined
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
ME_COM_LINK           ?= 1
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

ME_COM_OPENSSL_PATH   ?= "/path/to/openssl"

ifeq ($(ME_COM_LIB),1)
    ME_COM_COMPILER := 1
endif
ifeq ($(ME_COM_LINK),1)
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
ME_COMPILER_HAS_ATOMIC ?= 0
ME_COMPILER_HAS_ATOMIC64 ?= 0
ME_COMPILER_HAS_DOUBLE_BRACES ?= 0
ME_COMPILER_HAS_DYN_LOAD ?= 1
ME_COMPILER_HAS_LIB_EDIT ?= 0
ME_COMPILER_HAS_LIB_RT ?= 0
ME_COMPILER_HAS_MMU   ?= 1
ME_COMPILER_HAS_MTUNE ?= 0
ME_COMPILER_HAS_PAM   ?= 0
ME_COMPILER_HAS_STACK_PROTECTOR ?= 1
ME_COMPILER_HAS_SYNC  ?= 0
ME_COMPILER_HAS_SYNC64 ?= 0
ME_COMPILER_HAS_SYNC_CAS ?= 0
ME_COMPILER_HAS_UNNAMED_UNIONS ?= 1
ME_COMPILER_WARN64TO32 ?= 0
ME_COMPILER_WARN_UNUSED ?= 0
ME_CONFIG_FILE        ?= \"appweb.conf\"
ME_CONFIGURE          ?= \"me -d -q -platform vxworks-arm-default -configure . --with esp --with mdb --with cgi -gen make\"
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
ME_VERSION            ?= \"9.0.4\"
ME_WATCHDOG_NAME      ?= \"appman\"
ME_WEB_GROUP          ?= \"$(WEB_GROUP)\"
ME_WEB_USER           ?= \"$(WEB_USER)\"

export PATH           := $(WIND_GNU_PATH)/$(WIND_HOST_TYPE)/bin:$(PATH)
CFLAGS                += -fomit-frame-pointer -fno-builtin -fno-defer-pop -fvolatile  -w
DFLAGS                += -DVXWORKS -DRW_MULTI_THREAD -DCPU=ARMARCH7 -DTOOL_FAMILY=gnu -DTOOL=gnu -D_GNU_TOOL -D_WRS_KERNEL_ -D_VSB_CONFIG_FILE=\"/WindRiver/vxworks-7/samples/prebuilt_projects/vsb_vxsim_linux/h/config/vsbConfig.h" $(patsubst %,-D%,$(filter ME_%,$(MAKEFLAGS))) -DME_COM_CGI=$(ME_COM_CGI) -DME_COM_COMPILER=$(ME_COM_COMPILER) -DME_COM_DIR=$(ME_COM_DIR) -DME_COM_EJS=$(ME_COM_EJS) -DME_COM_ESP=$(ME_COM_ESP) -DME_COM_FAST=$(ME_COM_FAST) -DME_COM_HTTP=$(ME_COM_HTTP) -DME_COM_LIB=$(ME_COM_LIB) -DME_COM_LINK=$(ME_COM_LINK) -DME_COM_MBEDTLS=$(ME_COM_MBEDTLS) -DME_COM_MDB=$(ME_COM_MDB) -DME_COM_MPR=$(ME_COM_MPR) -DME_COM_OPENSSL=$(ME_COM_OPENSSL) -DME_COM_OSDEP=$(ME_COM_OSDEP) -DME_COM_PCRE=$(ME_COM_PCRE) -DME_COM_PHP=$(ME_COM_PHP) -DME_COM_PROXY=$(ME_COM_PROXY) -DME_COM_SQLITE=$(ME_COM_SQLITE) -DME_COM_SSL=$(ME_COM_SSL) -DME_COM_VXWORKS=$(ME_COM_VXWORKS) -DME_COM_WATCHDOG=$(ME_COM_WATCHDOG) -DME_CERTS_GENDH=$(ME_CERTS_GENDH) -DME_ESP_CMD=$(ME_ESP_CMD) -DME_ESP_LEGACY=$(ME_ESP_LEGACY) -DME_ESP_MODULE=$(ME_ESP_MODULE) -DME_ESP_NAME=$(ME_ESP_NAME) -DME_HTTP_BASIC=$(ME_HTTP_BASIC) -DME_HTTP_CACHE=$(ME_HTTP_CACHE) -DME_HTTP_CMD=$(ME_HTTP_CMD) -DME_HTTP_DEFENSE=$(ME_HTTP_DEFENSE) -DME_HTTP_DIGEST=$(ME_HTTP_DIGEST) -DME_HTTP_DIR=$(ME_HTTP_DIR) -DME_HTTP_HTTP2=$(ME_HTTP_HTTP2) -DME_HTTP_PAM=$(ME_HTTP_PAM) -DME_HTTP_SENDFILE=$(ME_HTTP_SENDFILE) -DME_HTTP_UPLOAD=$(ME_HTTP_UPLOAD) -DME_HTTP_WEBSOCKETS=$(ME_HTTP_WEBSOCKETS) -DME_MBEDTLS_COMPACT=$(ME_MBEDTLS_COMPACT) -DME_MPR_ALLOC=$(ME_MPR_ALLOC) -DME_MPR_LOGGING=$(ME_MPR_LOGGING) -DME_MPR_OSLOG=$(ME_MPR_OSLOG) -DME_MPR_ROMMOUNT=$(ME_MPR_ROMMOUNT) -DME_MPR_SSL=$(ME_MPR_SSL) -DME_MPR_THREADLIMITBYCORES=$(ME_MPR_THREADLIMITBYCORES) -DME_MPR_THREADSTACK=$(ME_MPR_THREADSTACK) -DME_OPENSSL_VERSION=$(ME_OPENSSL_VERSION) -DME_WATCHDOG_NAME=$(ME_WATCHDOG_NAME) 
IFLAGS                += "-I$(BUILD)/inc"
LDFLAGS               += -Wl,-r
LIBPATHS              += -L$(BUILD)/bin
LIBS                  += -lgcc

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

ME_ROOT_PREFIX        ?= deploy
ME_BASE_PREFIX        ?= $(ME_ROOT_PREFIX)
ME_DATA_PREFIX        ?= $(ME_VAPP_PREFIX)
ME_STATE_PREFIX       ?= $(ME_VAPP_PREFIX)
ME_BIN_PREFIX         ?= $(ME_VAPP_PREFIX)
ME_INC_PREFIX         ?= $(ME_VAPP_PREFIX)/inc
ME_LIB_PREFIX         ?= $(ME_VAPP_PREFIX)
ME_MAN_PREFIX         ?= $(ME_VAPP_PREFIX)
ME_SBIN_PREFIX        ?= $(ME_VAPP_PREFIX)
ME_ETC_PREFIX         ?= $(ME_VAPP_PREFIX)
ME_WEB_PREFIX         ?= $(ME_VAPP_PREFIX)/web
ME_LOG_PREFIX         ?= $(ME_VAPP_PREFIX)
ME_SPOOL_PREFIX       ?= $(ME_VAPP_PREFIX)
ME_CACHE_PREFIX       ?= $(ME_VAPP_PREFIX)
ME_APP_PREFIX         ?= $(ME_BASE_PREFIX)
ME_VAPP_PREFIX        ?= $(ME_APP_PREFIX)
ME_SRC_PREFIX         ?= $(ME_ROOT_PREFIX)/usr/src/$(NAME)-$(VERSION)

WEB_USER              ?= $(shell egrep 'www-data|_www|nobody' /etc/passwd | sed 's^:.*^^' |  tail -1)
WEB_GROUP             ?= $(shell egrep 'www-data|_www|nobody|nogroup' /etc/group | sed 's^:.*^^' |  tail -1)

TARGETS               += $(BUILD)/bin/appweb.out
TARGETS               += $(BUILD)/bin/authpass.out
ifeq ($(ME_COM_ESP),1)
    TARGETS           += $(BUILD)/bin/appweb-esp.out
endif
ifeq ($(ME_COM_ESP),1)
    TARGETS           += $(BUILD)/.extras-modified
endif
ifeq ($(ME_COM_HTTP),1)
    TARGETS           += $(BUILD)/bin/http.out
endif
TARGETS               += $(BUILD)/.install-roots-modified
ifeq ($(ME_COM_SQLITE),1)
    TARGETS           += $(BUILD)/bin/libsql.out
endif
TARGETS               += $(BUILD)/bin/makerom.out
TARGETS               += $(BUILD)/bin/server.out
TARGETS               += src/server/cache
TARGETS               += $(BUILD)/bin/appman.out


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
	@if [ "$(WIND_BASE)" = "" ] ; then echo WARNING: WIND_BASE not set. Run wrenv.sh. ; exit 255 ; fi
	@if [ "$(WIND_HOST_TYPE)" = "" ] ; then echo WARNING: WIND_HOST_TYPE not set. Run wrenv.sh. ; exit 255 ; fi
	@if [ "$(WIND_GNU_PATH)" = "" ] ; then echo WARNING: WIND_GNU_PATH not set. Run wrenv.sh. ; exit 255 ; fi
	@[ ! -x $(BUILD)/bin ] && mkdir -p $(BUILD)/bin; true
	@[ ! -x $(BUILD)/inc ] && mkdir -p $(BUILD)/inc; true
	@[ ! -x $(BUILD)/obj ] && mkdir -p $(BUILD)/obj; true
	@[ ! -f $(BUILD)/inc/me.h ] && cp projects/appweb-vxworks-$(PROFILE)-me.h $(BUILD)/inc/me.h ; true
	@if ! diff $(BUILD)/inc/me.h projects/appweb-vxworks-$(PROFILE)-me.h >/dev/null ; then\
		cp projects/appweb-vxworks-$(PROFILE)-me.h $(BUILD)/inc/me.h  ; \
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
	rm -f "$(BUILD)/obj/watchdog.o"
	rm -f "$(BUILD)/bin/appweb.out"
	rm -f "$(BUILD)/bin/authpass.out"
	rm -f "$(BUILD)/bin/appweb-esp.out"
	rm -f "$(BUILD)/.extras-modified"
	rm -f "$(BUILD)/bin/http.out"
	rm -f "$(BUILD)/.install-roots-modified"
	rm -f "$(BUILD)/bin/libappweb.out"
	rm -f "$(BUILD)/bin/libesp.out"
	rm -f "$(BUILD)/bin/libhttp.out"
	rm -f "$(BUILD)/bin/libmpr.out"
	rm -f "$(BUILD)/bin/libmpr-version.a"
	rm -f "$(BUILD)/bin/libpcre.out"
	rm -f "$(BUILD)/bin/libsql.out"
	rm -f "$(BUILD)/bin/makerom.out"
	rm -f "$(BUILD)/bin/server.out"
	rm -f "$(BUILD)/bin/appman.out"

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
	$(CC) -c -o $(BUILD)/obj/appweb.o $(CFLAGS) -DME_DEBUG=1 -DVXWORKS -DRW_MULTI_THREAD -DCPU=ARMARCH7 -DTOOL_FAMILY=gnu -DTOOL=gnu -D_GNU_TOOL -D_WRS_KERNEL_ -D_VSB_CONFIG_FILE=\"/WindRiver/vxworks-7/samples/prebuilt_projects/vsb_vxsim_linux/h/config/vsbConfig.h\" -DME_COM_OPENSSL_PATH=$(ME_COM_OPENSSL_PATH) $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" src/server/appweb.c

#
#   authpass.o
#
DEPS_35 += $(BUILD)/inc/appweb.h

$(BUILD)/obj/authpass.o: \
    src/utils/authpass.c $(DEPS_35)
	@echo '   [Compile] $(BUILD)/obj/authpass.o'
	$(CC) -c -o $(BUILD)/obj/authpass.o $(CFLAGS) -DME_DEBUG=1 -DVXWORKS -DRW_MULTI_THREAD -DCPU=ARMARCH7 -DTOOL_FAMILY=gnu -DTOOL=gnu -D_GNU_TOOL -D_WRS_KERNEL_ -D_VSB_CONFIG_FILE=\"/WindRiver/vxworks-7/samples/prebuilt_projects/vsb_vxsim_linux/h/config/vsbConfig.h\" -DME_COM_OPENSSL_PATH=$(ME_COM_OPENSSL_PATH) $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" src/utils/authpass.c

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
	$(CC) -c -o $(BUILD)/obj/cgiHandler.o $(CFLAGS) -DME_DEBUG=1 -DVXWORKS -DRW_MULTI_THREAD -DCPU=ARMARCH7 -DTOOL_FAMILY=gnu -DTOOL=gnu -D_GNU_TOOL -D_WRS_KERNEL_ -D_VSB_CONFIG_FILE=\"/WindRiver/vxworks-7/samples/prebuilt_projects/vsb_vxsim_linux/h/config/vsbConfig.h\" -DME_COM_OPENSSL_PATH=$(ME_COM_OPENSSL_PATH) $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" src/modules/cgiHandler.c

#
#   cgiProgram.o
#

$(BUILD)/obj/cgiProgram.o: \
    src/utils/cgiProgram.c $(DEPS_38)
	@echo '   [Compile] $(BUILD)/obj/cgiProgram.o'
	$(CC) -c -o $(BUILD)/obj/cgiProgram.o $(CFLAGS) -DME_DEBUG=1 -DVXWORKS -DRW_MULTI_THREAD -DCPU=ARMARCH7 -DTOOL_FAMILY=gnu -DTOOL=gnu -D_GNU_TOOL -D_WRS_KERNEL_ -D_VSB_CONFIG_FILE=\"/WindRiver/vxworks-7/samples/prebuilt_projects/vsb_vxsim_linux/h/config/vsbConfig.h\" $(IFLAGS) src/utils/cgiProgram.c

#
#   config.o
#
DEPS_39 += src/appweb.h
DEPS_39 += $(BUILD)/inc/pcre.h

$(BUILD)/obj/config.o: \
    src/config.c $(DEPS_39)
	@echo '   [Compile] $(BUILD)/obj/config.o'
	$(CC) -c -o $(BUILD)/obj/config.o $(CFLAGS) -DME_DEBUG=1 -DVXWORKS -DRW_MULTI_THREAD -DCPU=ARMARCH7 -DTOOL_FAMILY=gnu -DTOOL=gnu -D_GNU_TOOL -D_WRS_KERNEL_ -D_VSB_CONFIG_FILE=\"/WindRiver/vxworks-7/samples/prebuilt_projects/vsb_vxsim_linux/h/config/vsbConfig.h\" -DME_COM_OPENSSL_PATH=$(ME_COM_OPENSSL_PATH) $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" src/config.c

#
#   convenience.o
#
DEPS_40 += src/appweb.h

$(BUILD)/obj/convenience.o: \
    src/convenience.c $(DEPS_40)
	@echo '   [Compile] $(BUILD)/obj/convenience.o'
	$(CC) -c -o $(BUILD)/obj/convenience.o $(CFLAGS) -DME_DEBUG=1 -DVXWORKS -DRW_MULTI_THREAD -DCPU=ARMARCH7 -DTOOL_FAMILY=gnu -DTOOL=gnu -D_GNU_TOOL -D_WRS_KERNEL_ -D_VSB_CONFIG_FILE=\"/WindRiver/vxworks-7/samples/prebuilt_projects/vsb_vxsim_linux/h/config/vsbConfig.h\" -DME_COM_OPENSSL_PATH=$(ME_COM_OPENSSL_PATH) $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" src/convenience.c

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
	$(CC) -c -o $(BUILD)/obj/esp.o $(CFLAGS) -DME_DEBUG=1 -DVXWORKS -DRW_MULTI_THREAD -DCPU=ARMARCH7 -DTOOL_FAMILY=gnu -DTOOL=gnu -D_GNU_TOOL -D_WRS_KERNEL_ -D_VSB_CONFIG_FILE=\"/WindRiver/vxworks-7/samples/prebuilt_projects/vsb_vxsim_linux/h/config/vsbConfig.h\" -DME_COM_OPENSSL_PATH=$(ME_COM_OPENSSL_PATH) $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" src/esp/esp.c

#
#   espHandler.o
#
DEPS_43 += src/appweb.h
DEPS_43 += $(BUILD)/inc/esp.h

$(BUILD)/obj/espHandler.o: \
    src/modules/espHandler.c $(DEPS_43)
	@echo '   [Compile] $(BUILD)/obj/espHandler.o'
	$(CC) -c -o $(BUILD)/obj/espHandler.o $(CFLAGS) -DME_DEBUG=1 -DVXWORKS -DRW_MULTI_THREAD -DCPU=ARMARCH7 -DTOOL_FAMILY=gnu -DTOOL=gnu -D_GNU_TOOL -D_WRS_KERNEL_ -D_VSB_CONFIG_FILE=\"/WindRiver/vxworks-7/samples/prebuilt_projects/vsb_vxsim_linux/h/config/vsbConfig.h\" -DME_COM_OPENSSL_PATH=$(ME_COM_OPENSSL_PATH) $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" src/modules/espHandler.c

#
#   espLib.o
#
DEPS_44 += src/esp/esp.h
DEPS_44 += $(BUILD)/inc/pcre.h
DEPS_44 += $(BUILD)/inc/http.h

$(BUILD)/obj/espLib.o: \
    src/esp/espLib.c $(DEPS_44)
	@echo '   [Compile] $(BUILD)/obj/espLib.o'
	$(CC) -c -o $(BUILD)/obj/espLib.o $(CFLAGS) -DME_DEBUG=1 -DVXWORKS -DRW_MULTI_THREAD -DCPU=ARMARCH7 -DTOOL_FAMILY=gnu -DTOOL=gnu -D_GNU_TOOL -D_WRS_KERNEL_ -D_VSB_CONFIG_FILE=\"/WindRiver/vxworks-7/samples/prebuilt_projects/vsb_vxsim_linux/h/config/vsbConfig.h\" -DME_COM_OPENSSL_PATH=$(ME_COM_OPENSSL_PATH) $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" src/esp/espLib.c

#
#   fastHandler.o
#
DEPS_45 += src/appweb.h

$(BUILD)/obj/fastHandler.o: \
    src/modules/fastHandler.c $(DEPS_45)
	@echo '   [Compile] $(BUILD)/obj/fastHandler.o'
	$(CC) -c -o $(BUILD)/obj/fastHandler.o $(CFLAGS) -DME_DEBUG=1 -DVXWORKS -DRW_MULTI_THREAD -DCPU=ARMARCH7 -DTOOL_FAMILY=gnu -DTOOL=gnu -D_GNU_TOOL -D_WRS_KERNEL_ -D_VSB_CONFIG_FILE=\"/WindRiver/vxworks-7/samples/prebuilt_projects/vsb_vxsim_linux/h/config/vsbConfig.h\" -DME_COM_OPENSSL_PATH=$(ME_COM_OPENSSL_PATH) $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" src/modules/fastHandler.c

#
#   fcgiapp.h
#

../../../../usr/local/include/fcgiapp.h: $(DEPS_46)

#
#   fastProgram.o
#
DEPS_47 += ../../../../usr/local/include/fcgiapp.h

$(BUILD)/obj/fastProgram.o: \
    src/utils/fastProgram.c $(DEPS_47)
	@echo '   [Compile] $(BUILD)/obj/fastProgram.o'
	$(CC) -c -o $(BUILD)/obj/fastProgram.o $(CFLAGS) -DME_DEBUG=1 -DVXWORKS -DRW_MULTI_THREAD -DCPU=ARMARCH7 -DTOOL_FAMILY=gnu -DTOOL=gnu -D_GNU_TOOL -D_WRS_KERNEL_ -D_VSB_CONFIG_FILE=\"/WindRiver/vxworks-7/samples/prebuilt_projects/vsb_vxsim_linux/h/config/vsbConfig.h\" "-I/usr/local/include" src/utils/fastProgram.c

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
	$(CC) -c -o $(BUILD)/obj/http.o $(CFLAGS) -DME_DEBUG=1 -DVXWORKS -DRW_MULTI_THREAD -DCPU=ARMARCH7 -DTOOL_FAMILY=gnu -DTOOL=gnu -D_GNU_TOOL -D_WRS_KERNEL_ -D_VSB_CONFIG_FILE=\"/WindRiver/vxworks-7/samples/prebuilt_projects/vsb_vxsim_linux/h/config/vsbConfig.h\" -DME_COM_OPENSSL_PATH=$(ME_COM_OPENSSL_PATH) $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" src/http/http.c

#
#   httpLib.o
#
DEPS_50 += src/http/http.h
DEPS_50 += $(BUILD)/inc/pcre.h

$(BUILD)/obj/httpLib.o: \
    src/http/httpLib.c $(DEPS_50)
	@echo '   [Compile] $(BUILD)/obj/httpLib.o'
	$(CC) -c -o $(BUILD)/obj/httpLib.o $(CFLAGS) -DME_DEBUG=1 -DVXWORKS -DRW_MULTI_THREAD -DCPU=ARMARCH7 -DTOOL_FAMILY=gnu -DTOOL=gnu -D_GNU_TOOL -D_WRS_KERNEL_ -D_VSB_CONFIG_FILE=\"/WindRiver/vxworks-7/samples/prebuilt_projects/vsb_vxsim_linux/h/config/vsbConfig.h\" -DME_COM_OPENSSL_PATH=$(ME_COM_OPENSSL_PATH) $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" src/http/httpLib.c

#
#   makerom.o
#
DEPS_51 += $(BUILD)/inc/mpr.h

$(BUILD)/obj/makerom.o: \
    src/makerom/makerom.c $(DEPS_51)
	@echo '   [Compile] $(BUILD)/obj/makerom.o'
	$(CC) -c -o $(BUILD)/obj/makerom.o $(CFLAGS) -DME_DEBUG=1 -DVXWORKS -DRW_MULTI_THREAD -DCPU=ARMARCH7 -DTOOL_FAMILY=gnu -DTOOL=gnu -D_GNU_TOOL -D_WRS_KERNEL_ -D_VSB_CONFIG_FILE=\"/WindRiver/vxworks-7/samples/prebuilt_projects/vsb_vxsim_linux/h/config/vsbConfig.h\" -DME_COM_OPENSSL_PATH=$(ME_COM_OPENSSL_PATH) $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" src/makerom/makerom.c

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
	$(CC) -c -o $(BUILD)/obj/mpr-version.o $(CFLAGS) -DME_DEBUG=1 -DVXWORKS -DRW_MULTI_THREAD -DCPU=ARMARCH7 -DTOOL_FAMILY=gnu -DTOOL=gnu -D_GNU_TOOL -D_WRS_KERNEL_ -D_VSB_CONFIG_FILE=\"/WindRiver/vxworks-7/samples/prebuilt_projects/vsb_vxsim_linux/h/config/vsbConfig.h\" $(IFLAGS) src/mpr-version/mpr-version.c

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
	$(CC) -c -o $(BUILD)/obj/mprLib.o $(CFLAGS) -DME_DEBUG=1 -DVXWORKS -DRW_MULTI_THREAD -DCPU=ARMARCH7 -DTOOL_FAMILY=gnu -DTOOL=gnu -D_GNU_TOOL -D_WRS_KERNEL_ -D_VSB_CONFIG_FILE=\"/WindRiver/vxworks-7/samples/prebuilt_projects/vsb_vxsim_linux/h/config/vsbConfig.h\" -DME_COM_OPENSSL_PATH=$(ME_COM_OPENSSL_PATH) $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" src/mpr/mprLib.c

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
	$(CC) -c -o $(BUILD)/obj/pcre.o $(CFLAGS) -DME_DEBUG=1 -DVXWORKS -DRW_MULTI_THREAD -DCPU=ARMARCH7 -DTOOL_FAMILY=gnu -DTOOL=gnu -D_GNU_TOOL -D_WRS_KERNEL_ -D_VSB_CONFIG_FILE=\"/WindRiver/vxworks-7/samples/prebuilt_projects/vsb_vxsim_linux/h/config/vsbConfig.h\" $(IFLAGS) src/pcre/pcre.c

#
#   proxyHandler.o
#
DEPS_58 += src/appweb.h

$(BUILD)/obj/proxyHandler.o: \
    src/modules/proxyHandler.c $(DEPS_58)
	@echo '   [Compile] $(BUILD)/obj/proxyHandler.o'
	$(CC) -c -o $(BUILD)/obj/proxyHandler.o $(CFLAGS) -DME_DEBUG=1 -DVXWORKS -DRW_MULTI_THREAD -DCPU=ARMARCH7 -DTOOL_FAMILY=gnu -DTOOL=gnu -D_GNU_TOOL -D_WRS_KERNEL_ -D_VSB_CONFIG_FILE=\"/WindRiver/vxworks-7/samples/prebuilt_projects/vsb_vxsim_linux/h/config/vsbConfig.h\" -DME_COM_OPENSSL_PATH=$(ME_COM_OPENSSL_PATH) $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" src/modules/proxyHandler.c

#
#   rom.o
#
DEPS_59 += $(BUILD)/inc/mpr.h

$(BUILD)/obj/rom.o: \
    src/rom.c $(DEPS_59)
	@echo '   [Compile] $(BUILD)/obj/rom.o'
	$(CC) -c -o $(BUILD)/obj/rom.o $(CFLAGS) -DME_DEBUG=1 -DVXWORKS -DRW_MULTI_THREAD -DCPU=ARMARCH7 -DTOOL_FAMILY=gnu -DTOOL=gnu -D_GNU_TOOL -D_WRS_KERNEL_ -D_VSB_CONFIG_FILE=\"/WindRiver/vxworks-7/samples/prebuilt_projects/vsb_vxsim_linux/h/config/vsbConfig.h\" -DME_COM_OPENSSL_PATH=$(ME_COM_OPENSSL_PATH) $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" src/rom.c

#
#   server.o
#
DEPS_60 += src/http/http.h

$(BUILD)/obj/server.o: \
    src/http/server.c $(DEPS_60)
	@echo '   [Compile] $(BUILD)/obj/server.o'
	$(CC) -c -o $(BUILD)/obj/server.o $(CFLAGS) -DME_DEBUG=1 -DVXWORKS -DRW_MULTI_THREAD -DCPU=ARMARCH7 -DTOOL_FAMILY=gnu -DTOOL=gnu -D_GNU_TOOL -D_WRS_KERNEL_ -D_VSB_CONFIG_FILE=\"/WindRiver/vxworks-7/samples/prebuilt_projects/vsb_vxsim_linux/h/config/vsbConfig.h\" -DME_COM_OPENSSL_PATH=$(ME_COM_OPENSSL_PATH) $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" src/http/server.c

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
	$(CC) -c -o $(BUILD)/obj/sqlite.o $(CFLAGS) -DME_DEBUG=1 -DVXWORKS -DRW_MULTI_THREAD -DCPU=ARMARCH7 -DTOOL_FAMILY=gnu -DTOOL=gnu -D_GNU_TOOL -D_WRS_KERNEL_ -D_VSB_CONFIG_FILE=\"/WindRiver/vxworks-7/samples/prebuilt_projects/vsb_vxsim_linux/h/config/vsbConfig.h\" $(IFLAGS) src/sqlite/sqlite.c

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
	$(CC) -c -o $(BUILD)/obj/sqlite3.o $(CFLAGS) -DME_DEBUG=1 -DVXWORKS -DRW_MULTI_THREAD -DCPU=ARMARCH7 -DTOOL_FAMILY=gnu -DTOOL=gnu -D_GNU_TOOL -D_WRS_KERNEL_ -D_VSB_CONFIG_FILE=\"/WindRiver/vxworks-7/samples/prebuilt_projects/vsb_vxsim_linux/h/config/vsbConfig.h\" $(IFLAGS) src/sqlite/sqlite3.c

#
#   testHandler.o
#
DEPS_64 += src/appweb.h

$(BUILD)/obj/testHandler.o: \
    src/modules/testHandler.c $(DEPS_64)
	@echo '   [Compile] $(BUILD)/obj/testHandler.o'
	$(CC) -c -o $(BUILD)/obj/testHandler.o $(CFLAGS) -DME_DEBUG=1 -DVXWORKS -DRW_MULTI_THREAD -DCPU=ARMARCH7 -DTOOL_FAMILY=gnu -DTOOL=gnu -D_GNU_TOOL -D_WRS_KERNEL_ -D_VSB_CONFIG_FILE=\"/WindRiver/vxworks-7/samples/prebuilt_projects/vsb_vxsim_linux/h/config/vsbConfig.h\" -DME_COM_OPENSSL_PATH=$(ME_COM_OPENSSL_PATH) $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" src/modules/testHandler.c

#
#   watchdog.o
#
DEPS_65 += $(BUILD)/inc/mpr.h

$(BUILD)/obj/watchdog.o: \
    src/watchdog/watchdog.c $(DEPS_65)
	@echo '   [Compile] $(BUILD)/obj/watchdog.o'
	$(CC) -c -o $(BUILD)/obj/watchdog.o $(CFLAGS) -DME_DEBUG=1 -DVXWORKS -DRW_MULTI_THREAD -DCPU=ARMARCH7 -DTOOL_FAMILY=gnu -DTOOL=gnu -D_GNU_TOOL -D_WRS_KERNEL_ -D_VSB_CONFIG_FILE=\"/WindRiver/vxworks-7/samples/prebuilt_projects/vsb_vxsim_linux/h/config/vsbConfig.h\" -DME_COM_OPENSSL_PATH=$(ME_COM_OPENSSL_PATH) $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" src/watchdog/watchdog.c

#
#   libmpr
#
DEPS_66 += $(BUILD)/inc/osdep.h
DEPS_66 += $(BUILD)/inc/mpr.h
DEPS_66 += $(BUILD)/obj/mprLib.o

ifeq ($(ME_COM_OPENSSL),1)
ifeq ($(ME_COM_SSL),1)
    LIBS_66 += -lssl
    LIBPATHS_66 += -L"$(ME_COM_OPENSSL_PATH)/lib"
    LIBPATHS_66 += -L"$(ME_COM_OPENSSL_PATH)"
endif
endif
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_66 += -lcrypto
    LIBPATHS_66 += -L"$(ME_COM_OPENSSL_PATH)/lib"
    LIBPATHS_66 += -L"$(ME_COM_OPENSSL_PATH)"
endif

$(BUILD)/bin/libmpr.out: $(DEPS_66)
	@echo '      [Link] $(BUILD)/bin/libmpr.out'
	$(CC) -r -o $(BUILD)/bin/libmpr.out $(LDFLAGS) $(LIBPATHS)   "$(BUILD)/obj/mprLib.o" $(LIBPATHS_66) $(LIBS_66) $(LIBS_66) $(LIBS) 

ifeq ($(ME_COM_PCRE),1)
#
#   libpcre
#
DEPS_67 += $(BUILD)/inc/pcre.h
DEPS_67 += $(BUILD)/obj/pcre.o

$(BUILD)/bin/libpcre.out: $(DEPS_67)
	@echo '      [Link] $(BUILD)/bin/libpcre.out'
	$(CC) -r -o $(BUILD)/bin/libpcre.out $(LDFLAGS) $(LIBPATHS) "$(BUILD)/obj/pcre.o" $(LIBS) 
endif

ifeq ($(ME_COM_HTTP),1)
#
#   libhttp
#
DEPS_68 += $(BUILD)/bin/libmpr.out
ifeq ($(ME_COM_PCRE),1)
    DEPS_68 += $(BUILD)/bin/libpcre.out
endif
DEPS_68 += $(BUILD)/inc/http.h
DEPS_68 += $(BUILD)/obj/httpLib.o

ifeq ($(ME_COM_OPENSSL),1)
ifeq ($(ME_COM_SSL),1)
    LIBS_68 += -lssl
    LIBPATHS_68 += -L"$(ME_COM_OPENSSL_PATH)/lib"
    LIBPATHS_68 += -L"$(ME_COM_OPENSSL_PATH)"
endif
endif
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_68 += -lcrypto
    LIBPATHS_68 += -L"$(ME_COM_OPENSSL_PATH)/lib"
    LIBPATHS_68 += -L"$(ME_COM_OPENSSL_PATH)"
endif

$(BUILD)/bin/libhttp.out: $(DEPS_68)
	@echo '      [Link] $(BUILD)/bin/libhttp.out'
	$(CC) -r -o $(BUILD)/bin/libhttp.out $(LDFLAGS) $(LIBPATHS)   "$(BUILD)/obj/httpLib.o" $(LIBPATHS_68) $(LIBS_68) $(LIBS_68) $(LIBS) 
endif

#
#   libmpr-version
#
DEPS_69 += $(BUILD)/inc/mpr-version.h
DEPS_69 += $(BUILD)/obj/mpr-version.o

$(BUILD)/bin/libmpr-version.a: $(DEPS_69)
	@echo '      [Link] $(BUILD)/bin/libmpr-version.a'
	$(AR) -cr $(BUILD)/bin/libmpr-version.a "$(BUILD)/obj/mpr-version.o"

ifeq ($(ME_COM_ESP),1)
#
#   libesp
#
ifeq ($(ME_COM_HTTP),1)
    DEPS_70 += $(BUILD)/bin/libhttp.out
endif
DEPS_70 += $(BUILD)/bin/libmpr-version.a
ifeq ($(ME_COM_SQLITE),1)
    DEPS_70 += $(BUILD)/bin/libsql.out
endif
DEPS_70 += $(BUILD)/inc/esp.h
DEPS_70 += $(BUILD)/obj/espLib.o
ifeq ($(ME_COM_SQLITE),1)
    DEPS_70 += $(BUILD)/bin/libsql.out
endif

ifeq ($(ME_COM_OPENSSL),1)
ifeq ($(ME_COM_SSL),1)
    LIBS_70 += -lssl
    LIBPATHS_70 += -L"$(ME_COM_OPENSSL_PATH)/lib"
    LIBPATHS_70 += -L"$(ME_COM_OPENSSL_PATH)"
endif
endif
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_70 += -lcrypto
    LIBPATHS_70 += -L"$(ME_COM_OPENSSL_PATH)/lib"
    LIBPATHS_70 += -L"$(ME_COM_OPENSSL_PATH)"
endif

$(BUILD)/bin/libesp.out: $(DEPS_70)
	@echo '      [Link] $(BUILD)/bin/libesp.out'
	$(CC) -r -o $(BUILD)/bin/libesp.out $(LDFLAGS) $(LIBPATHS)   "$(BUILD)/obj/espLib.o" $(LIBPATHS_70) $(LIBS_70) $(LIBS_70) $(LIBS) -lmpr-version 
endif

#
#   libappweb
#
ifeq ($(ME_COM_ESP),1)
    DEPS_71 += $(BUILD)/bin/libesp.out
endif
ifeq ($(ME_COM_SQLITE),1)
    DEPS_71 += $(BUILD)/bin/libsql.out
endif
ifeq ($(ME_COM_HTTP),1)
    DEPS_71 += $(BUILD)/bin/libhttp.out
endif
DEPS_71 += $(BUILD)/bin/libmpr.out
DEPS_71 += $(BUILD)/bin/libmpr-version.a
DEPS_71 += $(BUILD)/inc/appweb.h
DEPS_71 += $(BUILD)/inc/customize.h
DEPS_71 += $(BUILD)/obj/config.o
DEPS_71 += $(BUILD)/obj/convenience.o
DEPS_71 += $(BUILD)/obj/cgiHandler.o
DEPS_71 += $(BUILD)/obj/espHandler.o
DEPS_71 += $(BUILD)/obj/fastHandler.o
DEPS_71 += $(BUILD)/obj/proxyHandler.o
DEPS_71 += $(BUILD)/obj/testHandler.o
DEPS_71 += $(BUILD)/obj/rom.o

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

$(BUILD)/bin/libappweb.out: $(DEPS_71)
	@echo '      [Link] $(BUILD)/bin/libappweb.out'
	$(CC) -r -o $(BUILD)/bin/libappweb.out $(LDFLAGS) $(LIBPATHS)   "$(BUILD)/obj/config.o" "$(BUILD)/obj/convenience.o" "$(BUILD)/obj/cgiHandler.o" "$(BUILD)/obj/espHandler.o" "$(BUILD)/obj/fastHandler.o" "$(BUILD)/obj/proxyHandler.o" "$(BUILD)/obj/testHandler.o" "$(BUILD)/obj/rom.o" $(LIBPATHS_71) $(LIBS_71) $(LIBS_71) $(LIBS) -lmpr-version 

#
#   appweb
#
DEPS_72 += $(BUILD)/bin/libappweb.out
DEPS_72 += $(BUILD)/obj/appweb.o

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

$(BUILD)/bin/appweb.out: $(DEPS_72)
	@echo '      [Link] $(BUILD)/bin/appweb.out'
	$(CC) -o $(BUILD)/bin/appweb.out $(LDFLAGS) $(LIBPATHS)   "$(BUILD)/obj/appweb.o" $(LIBPATHS_72) $(LIBS_72) $(LIBS_72) $(LIBS) -lmpr-version -Wl,-r 

#
#   authpass
#
DEPS_73 += $(BUILD)/bin/libappweb.out
DEPS_73 += $(BUILD)/obj/authpass.o

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

$(BUILD)/bin/authpass.out: $(DEPS_73)
	@echo '      [Link] $(BUILD)/bin/authpass.out'
	$(CC) -o $(BUILD)/bin/authpass.out $(LDFLAGS) $(LIBPATHS)   "$(BUILD)/obj/authpass.o" $(LIBPATHS_73) $(LIBS_73) $(LIBS_73) $(LIBS) -lmpr-version -Wl,-r 

ifeq ($(ME_COM_ESP),1)
#
#   espcmd
#
DEPS_74 += $(BUILD)/bin/libesp.out
ifeq ($(ME_COM_SQLITE),1)
    DEPS_74 += $(BUILD)/bin/libsql.out
endif
DEPS_74 += $(BUILD)/obj/esp.o

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

$(BUILD)/bin/appweb-esp.out: $(DEPS_74)
	@echo '      [Link] $(BUILD)/bin/appweb-esp.out'
	$(CC) -o $(BUILD)/bin/appweb-esp.out $(LDFLAGS) $(LIBPATHS)   "$(BUILD)/obj/esp.o" $(LIBPATHS_74) $(LIBS_74) $(LIBS_74) $(LIBS) -lmpr-version -Wl,-r 
endif

ifeq ($(ME_COM_ESP),1)
#
#   extras
#
DEPS_75 += src/esp/esp-compile.json
DEPS_75 += src/esp/vcvars.bat

$(BUILD)/.extras-modified: $(DEPS_75)
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
DEPS_76 += $(BUILD)/bin/libhttp.out
DEPS_76 += $(BUILD)/obj/http.o

ifeq ($(ME_COM_OPENSSL),1)
ifeq ($(ME_COM_SSL),1)
    LIBS_76 += -lssl
    LIBPATHS_76 += -L"$(ME_COM_OPENSSL_PATH)/lib"
    LIBPATHS_76 += -L"$(ME_COM_OPENSSL_PATH)"
endif
endif
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_76 += -lcrypto
    LIBPATHS_76 += -L"$(ME_COM_OPENSSL_PATH)/lib"
    LIBPATHS_76 += -L"$(ME_COM_OPENSSL_PATH)"
endif

$(BUILD)/bin/http.out: $(DEPS_76)
	@echo '      [Link] $(BUILD)/bin/http.out'
	$(CC) -o $(BUILD)/bin/http.out $(LDFLAGS) $(LIBPATHS)   "$(BUILD)/obj/http.o" $(LIBPATHS_76) $(LIBS_76) $(LIBS_76) $(LIBS) -Wl,-r 
endif

#
#   installPrep
#

installPrep: $(DEPS_77)
	if [ "`id -u`" != 0 ] ; \
	then echo "Must run as root. Rerun with sudo." ; \
	exit 255 ; \
	fi

#
#   install-roots
#
DEPS_78 += certs/roots.crt

$(BUILD)/.install-roots-modified: $(DEPS_78)
	@echo '      [Copy] $(BUILD)/bin'
	mkdir -p "$(BUILD)/bin"
	cp certs/roots.crt $(BUILD)/bin/roots.crt
	touch "$(BUILD)/.install-roots-modified" 2>/dev/null

ifeq ($(ME_COM_SQLITE),1)
#
#   libsql
#
DEPS_79 += $(BUILD)/inc/sqlite3.h
DEPS_79 += $(BUILD)/obj/sqlite3.o

$(BUILD)/bin/libsql.out: $(DEPS_79)
	@echo '      [Link] $(BUILD)/bin/libsql.out'
	$(CC) -r -o $(BUILD)/bin/libsql.out $(LDFLAGS) $(LIBPATHS) "$(BUILD)/obj/sqlite3.o" $(LIBS) 
endif

#
#   makerom
#
DEPS_80 += $(BUILD)/bin/libmpr.out
DEPS_80 += $(BUILD)/obj/makerom.o

ifeq ($(ME_COM_OPENSSL),1)
ifeq ($(ME_COM_SSL),1)
    LIBS_80 += -lssl
    LIBPATHS_80 += -L"$(ME_COM_OPENSSL_PATH)/lib"
    LIBPATHS_80 += -L"$(ME_COM_OPENSSL_PATH)"
endif
endif
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_80 += -lcrypto
    LIBPATHS_80 += -L"$(ME_COM_OPENSSL_PATH)/lib"
    LIBPATHS_80 += -L"$(ME_COM_OPENSSL_PATH)"
endif

$(BUILD)/bin/makerom.out: $(DEPS_80)
	@echo '      [Link] $(BUILD)/bin/makerom.out'
	$(CC) -o $(BUILD)/bin/makerom.out $(LDFLAGS) $(LIBPATHS)   "$(BUILD)/obj/makerom.o" $(LIBPATHS_80) $(LIBS_80) $(LIBS_80) $(LIBS) -Wl,-r 

#
#   server
#
ifeq ($(ME_COM_HTTP),1)
    DEPS_81 += $(BUILD)/bin/libhttp.out
endif
DEPS_81 += $(BUILD)/obj/server.o

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

$(BUILD)/bin/server.out: $(DEPS_81)
	@echo '      [Link] $(BUILD)/bin/server.out'
	$(CC) -o $(BUILD)/bin/server.out $(LDFLAGS) $(LIBPATHS)   "$(BUILD)/obj/server.o" $(LIBPATHS_81) $(LIBS_81) $(LIBS_81) $(LIBS) -Wl,-r 

#
#   server-cache
#

src/server/cache: $(DEPS_82)
	( \
	cd src/server; \
	mkdir -p "cache" ; \
	)

ifeq ($(ME_COM_WATCHDOG),1)
#
#   watchdog
#
DEPS_83 += $(BUILD)/bin/libmpr.out
DEPS_83 += $(BUILD)/obj/watchdog.o

ifeq ($(ME_COM_OPENSSL),1)
ifeq ($(ME_COM_SSL),1)
    LIBS_83 += -lssl
    LIBPATHS_83 += -L"$(ME_COM_OPENSSL_PATH)/lib"
    LIBPATHS_83 += -L"$(ME_COM_OPENSSL_PATH)"
endif
endif
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_83 += -lcrypto
    LIBPATHS_83 += -L"$(ME_COM_OPENSSL_PATH)/lib"
    LIBPATHS_83 += -L"$(ME_COM_OPENSSL_PATH)"
endif

$(BUILD)/bin/appman.out: $(DEPS_83)
	@echo '      [Link] $(BUILD)/bin/appman.out'
	$(CC) -o $(BUILD)/bin/appman.out $(LDFLAGS) $(LIBPATHS)   "$(BUILD)/obj/watchdog.o" $(LIBPATHS_83) $(LIBS_83) $(LIBS_83) $(LIBS) -Wl,-r 
endif

#
#   installBinary
#

installBinary: $(DEPS_84)

#
#   install
#
DEPS_85 += installPrep
DEPS_85 += compile
DEPS_85 += stop
DEPS_85 += installBinary
DEPS_85 += start

install: $(DEPS_85)

#
#   run
#
DEPS_86 += compile

run: $(DEPS_86)
	( \
	cd src/server; \
	../../$(BUILD)/bin/appweb --log stdout:2 ; \
	)

#
#   uninstall
#
DEPS_87 += stop

uninstall: $(DEPS_87)
	( \
	cd installs; \
	rm -f "$(ME_VAPP_PREFIX)/appweb.conf" ; \
	rm -f "$(ME_VAPP_PREFIX)/esp.conf" ; \
	rm -f "$(ME_VAPP_PREFIX)/mine.types" ; \
	rm -f "$(ME_VAPP_PREFIX)/install.conf" ; \
	rm -fr "$(ME_VAPP_PREFIX)/inc/appweb" ; \
	)

#
#   uninstallBinary
#

uninstallBinary: $(DEPS_88)

#
#   version
#

version: $(DEPS_89)
	echo $(VERSION)


EXTRA_MAKEFILE := $(strip $(wildcard ./projects/extra.mk))
ifneq ($(EXTRA_MAKEFILE),)
include $(EXTRA_MAKEFILE)
endif
