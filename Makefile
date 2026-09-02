#
#   Makefile -- Appweb Top-level Makefile
#
#   Uses pre-generated project files from projects/gmake2/.
#   Auto-detects platform. No premake5 required for building.
#
#   Use "make help" for available targets and options.
#

NAME        := appweb
OPTIMIZE    ?= release
TOP         := $(shell realpath .)
BUILD       := build
BIN         := $(TOP)/$(BUILD)/bin
LOCAL       := $(strip $(wildcard ./.local.mk))

#
#   Detect make command (prefer gmake)
#
MAKE        := $(shell if which gmake >/dev/null 2>&1; then echo gmake ; else echo make ; fi) --no-print-directory

#
#   Auto-detect platform from host OS
#
UNAME       := $(shell uname -s)
ifeq ($(UNAME),Darwin)
    PLATFORM := macosx
else ifeq ($(UNAME),Linux)
    PLATFORM := linux
else ifeq ($(UNAME),FreeBSD)
    PLATFORM := freebsd
else
    $(error Unsupported platform: $(UNAME). Use premake5 to regenerate for your OS.)
endif

CONFIG      := $(OPTIMIZE)_$(PLATFORM)
PATH        := $(BIN):$(PATH)
CDPATH      :=

.EXPORT_ALL_VARIABLES:

.PHONY: all build check-dist check-sync clean coverage help import test test-linux verify-projects

ifndef SHOW
.SILENT:
endif

all: build

build:
	@if [ ! -f projects/gmake2/Makefile ] ; then \
		echo "      [Error] projects/gmake2/Makefile not found. Run: cd projects && premake5 gmake" ; exit 255 ; \
	fi
	$(MAKE) -C projects/gmake2 config=$(CONFIG) verbose=$(SHOW)
	@echo "      [Info] Appweb $(OPTIMIZE) [$(PLATFORM)]"

clean:
	@echo "       [Run] clean"
	rm -fr $(BUILD)

test: build
	tm test

#
#   Run the same build and the same suite under Linux, on this Mac, in a local VM driven by Apple's
#   container tool. Pass arguments through to tm with ARGS, e.g. make test-linux ARGS="auth".
#
test-linux:
	@bash bin/test-linux.sh $(ARGS)

#
#   Re-import the vendored in-house amalgamations
#
import:
	pak sync
	@bash test/utils/check-amalgamation.sh

#
#   Verify the amalgamations match their pak sources. Changes nothing; safe to run any time.
#
check-sync:
	@bash test/utils/check-amalgamation.sh

#
#   Verify dist/ matches src/. dist/ is generated from src/ but committed, because it is the
#   payload of the published appweb pak and it ships in the source archive.
#
check-dist:
	@if [ ! -f bin/buildLib.sh ] ; then \
		echo "      [Skip] check-dist: the amalgamation script is not part of this tree." ; \
		exit 0 ; \
	fi ; \
	rm -fr $(BUILD)/dist-check ; \
	DIST=$(TOP)/$(BUILD)/dist-check bash bin/buildLib.sh --dist-only >/dev/null ; \
	if ! diff -r -q dist $(BUILD)/dist-check >/dev/null 2>&1 ; then \
		echo "      [Error] dist/ is stale. Run 'make package' and commit the result." >&2 ; \
		diff -r -u dist $(BUILD)/dist-check | head -40 >&2 ; \
		rm -fr $(BUILD)/dist-check ; \
		exit 1 ; \
	fi ; \
	rm -fr $(BUILD)/dist-check ; \
	echo "      [Info] dist/ is in sync with src/"

#
#   Prove projects/gmake2 is what projects/premake5.lua generates. A hand edit to a generated
#   makefile survives until the next regeneration and is then silently reverted.
#
verify-projects:
	@bash bin/verify-projects.sh

#
#   Instrumented build plus the suite, reporting line and branch coverage per source file.
#   Additive: the instrumentation is passed through CFLAGS and LDFLAGS, which the generated
#   makefiles already honour, so no premake configuration is added and no generated file changes.
#   The default build is untouched. See bin/coverage.sh.
#
coverage:
	bin/coverage.sh

help:
	@echo '' >&2
	@echo 'usage: make [clean, build, test]' >&2
	@echo '' >&2
	@echo 'Targets:' >&2
	@echo '  build               Build libappweb and executables (default)' >&2
	@echo '  clean               Remove build artifacts' >&2
	@echo '  test                Run unit tests' >&2
	@echo '  test-linux          Run unit tests under Linux in a local container' >&2
	@echo '  coverage            Build instrumented, run the suite, report line and branch coverage' >&2
	@echo '  import              Re-import the module amalgamations from their paks, then verify' >&2
	@echo '  check-sync          Verify the amalgamations match their pak sources (read-only)' >&2
	@echo '  check-dist          Verify the committed dist/ amalgamation matches src/ (read-only)' >&2
	@echo '  verify-projects     Verify projects/gmake2 matches what premake5.lua generates' >&2
	@echo '' >&2
	@echo 'Make variables:' >&2
	@echo '  OPTIMIZE=debug|release    Optimization level (default: release)' >&2
	@echo '  SHOW=1                    Show build commands' >&2
	@echo '  ARGS="..."                Arguments passed to tm by test-linux' >&2
	@echo '' >&2

ifneq ($(LOCAL),)
include $(LOCAL)
endif
