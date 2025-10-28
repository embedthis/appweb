#
#   Makefile - Embedthis Appweb Makefile wrapper for per-platform makefiles
#
#	This Makefile is for Unix/Linux and Cygwin. On windows, it can be invoked via make.bat.
#
#   You can use this Makefile and build via "make" with a pre-selected configuration. 
#
#	See projects/$(OS)-$(ARCH)-default-me.h for configuration default settings. Can override
#	via make environment variables. For example: make ME_COM_SQLITE=0. These are converted to
#	DFLAGS and will then override the me.h default values. Use "make help" for a list of available
#	make variable options.
#
NAME    := appweb
OS      := $(shell uname | sed 's/CYGWIN.*/windows/;s/Darwin/macosx/' | tr '[A-Z]' '[a-z]')
PROFILE ?= dev

ifeq ($(ARCH),)
	ifeq ($(OS),windows)
		ifeq ($(PROCESSOR_ARCHITECTURE),AMD64)
			ARCH?=x64
		else
			ARCH?=x86
		endif
	else
		ARCH:= $(shell uname -m | sed 's/i.86/x86/;s/x86_64/x64/;;s/mips.*/mips/;s/aarch/arm/')
	endif
endif

ifeq ($(OS),windows)
    MAKE	:= MAKEFLAGS= projects/windows.bat $(ARCH) nmake -nologo
    EXT 	:= nmake
else
	MAKE    := $(shell if which gmake >/dev/null 2>&1; then echo gmake ; else echo make ; fi) --no-print-directory
	EXT     := mk
endif

BIN 		:= $(OS)-$(ARCH)-$(PROFILE)/bin
PATH		:= $(PWD)/build/$(BIN):$(PATH)
PROJECT 	:= projects/$(NAME)-$(OS)-default.mk

.EXPORT_ALL_VARIABLES:
.PHONY: build doc test

all build compile:
	@if [ ! -f $(PROJECT) ] ; then \
		echo "The build configuration $(PROJECT) is not supported" ; exit 255 ; \
	fi
	@echo '       [Run] $(MAKE) -f $(PROJECT) $@'
	@$(MAKE) -f $(PROJECT) $@
	@echo '      [Info] Run via: "make run". Run manually with "build/$(OS)-$(ARCH)-$(PROFILE)/bin" in your path.'
	@echo ""

clean clobber install installBinary uninstall run:
	@echo '       [Run] $(MAKE) -f $(PROJECT) $@'
	@$(MAKE) -f $(PROJECT) $@
	@echo '      [Info] $@ complete'

test:
	@test/utils/prep-test.sh
	@tm test

deploy:
	@echo '       [Deploy] $(MAKE) ME_ROOT_PREFIX=$(OS)-$(ARCH)-$(PROFILE)/deploy -f $(PROJECT) installBinary'
	@$(MAKE) ME_ROOT_PREFIX=$(OS)-$(ARCH)-$(PROFILE)/deploy -f $(PROJECT) installBinary

version:
	@$(MAKE) -f $(PROJECT) $@

help:
	@echo '' >&2
	@echo 'usage: make [clean, compile, deploy, install, run, uninstall]' >&2
	@echo '' >&2
	@echo 'The default configuration can be modified by setting make variables' >&2
	@echo 'Set to 0 to disable and 1 to enable:' >&2
	@echo '' >&2
	@echo '  ME_MPR_LOGGING    # Enable application logging' >&2
	@echo '  ME_MPR_TRACING    # Enable debug tracing' >&2
	@echo '  ME_COM_CGI        # Enable the CGI handler' >&2
	@echo '  ME_COM_ESP        # Enable the ESP web framework' >&2
	@echo '  ME_COM_MBEDTLS    # Enable the mbed TLS stack' >&2
	@echo '  ME_COM_OPENSSL    # Enable the OpenSSL SSL stack, must set ME_COM_OPENSS_PATH' >&2
	@echo '  ME_COM_SQLITE     # Enable the SQLite database' >&2
	@echo '  ME_ROM            # Build for ROM without a file system' >&2
	@echo '  ME_STACK_SIZE     # Define the VxWorks stack size' >&2
	@echo '' >&2
	@echo 'For example, to disable CGI:' >&2
	@echo '' >&2
	@echo '  ME_COM_CGI=0 make' >&2
	@echo '' >&2
	@echo 'Other make environment variables:' >&2
	@echo '  ARCH               # CPU architecture (x86, x64, ppc, ...)' >&2
	@echo '  OS                 # Operating system (linux, macosx, windows, vxworks, ...)' >&2
	@echo '  CC                 # Compiler to use ' >&2
	@echo '  LD                 # Linker to use' >&2
	@echo '  CONFIG             # Output directory for built items. Defaults to OS-ARCH-PROFILE' >&2
	@echo '  CFLAGS             # Add compiler options. For example: -Wall' >&2
	@echo '  DEBUG              # Set to "debug" for symbols, "release" for optimized builds' >&2
	@echo '  DFLAGS             # Add compiler defines. For example: -DCOLOR=blue' >&2
	@echo '  IFLAGS             # Add compiler include directories. For example: -I/extra/includes' >&2
	@echo '  LDFLAGS            # Add linker options' >&2
	@echo '  LIBPATHS           # Add linker library search directories. For example: -L/libraries' >&2
	@echo '  LIBS               # Add linker libraries. For example: -lpthreads' >&2
	@echo '  PROFILE            # Set to "static" for static linking or "default" for dynamic' >&2
	@echo '' >&2
	@echo 'Use "SHOW=1 make" to show executed commands.' >&2
	@echo 'Use "DEBUG=release make" to build for release.' >&2
	@echo '' >&2

LOCAL_MAKEFILE := $(strip $(wildcard ./.local.mk))

ifneq ($(LOCAL_MAKEFILE),)
include	$(LOCAL_MAKEFILE)
endif
