#!/bin/bash
#
#   chroot-directive-root.tst.sh - A server in a chroot jail must not keep running as root
#
#   Root can leave a chroot, so however the jail is entered (--chroot or the Chroot directive) the server must
#   refuse to listen if it would still be uid 0. The Chroot directive used to record nothing, so a config with
#   Chroot and no UserAccount, or with "UserAccount _unchanged_", served from the jail as root.
#
#   Needs root (chroot(2) is privileged), so it runs in the "make test-linux" container and skips elsewhere.
#

set -u

TESTDIR="$(cd "$(dirname "$0")/.." && pwd)"
BIN="${TESTDIR}/../build/bin/appweb"
PORT=4518
WORK="${TESTDIR}/tmp/chroot-directive-root"

fail() { echo "FAIL: $*"; exit 1; }

[ -x "${BIN}" ] || { echo "SKIP: appweb is not built at ${BIN}"; exit 0; }
[ "$(id -u)" = "0" ] || { echo "SKIP: needs root for chroot(2)"; exit 0; }
id nobody >/dev/null 2>&1 || { echo "SKIP: no nobody account"; exit 0; }

server=""
cleanup() {
    trap '' INT TERM QUIT
    if [ -n "${server}" ]; then
        kill -KILL "${server}" 2>/dev/null
        wait "${server}" 2>/dev/null
    fi
    rm -rf "${WORK}"
    return 0
}
trap cleanup EXIT

rm -rf "${WORK}"
mkdir -p "${WORK}/jail/web"
chmod 755 "${WORK}" "${WORK}/jail" "${WORK}/jail/web"
echo ok > "${WORK}/jail/web/index.html"
chmod 644 "${WORK}/jail/web/index.html"

#   The privilege drop looks the account up again inside the jail, so the jail needs its account entries
mkdir -p "${WORK}/jail/etc"
grep '^nobody:' /etc/passwd > "${WORK}/jail/etc/passwd"
grep -E "^[^:]*:[^:]*:$(id -g nobody):" /etc/group > "${WORK}/jail/etc/group"
chmod 755 "${WORK}/jail/etc"
chmod 644 "${WORK}/jail/etc/passwd" "${WORK}/jail/etc/group"

#   Write a config. $1 is the account directive line, $2 is the Chroot line, $3 the file (default WORK/appweb.conf).
#   The account is named before Chroot: it is looked up when parsed, and the jail has no account database.
writeConfig() {
    cat > "${3:-${WORK}/appweb.conf}" <<CONF
ErrorLog stdout level=2
Listen 127.0.0.1:${PORT}
$1
$2
Documents /web
AddHandler fileHandler
CONF
}

#   Start the server in its own session (Appweb ends with kill(0, SIGQUIT)). Extra arguments go to appweb.
start() {
    perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV or die' "${BIN}" --home "${WORK}" --config "${WORK}/appweb.conf" \
        "$@" > "${WORK}/out.log" 2>&1 &
    server=$!
}

#   The server must exit with an error before listening, and say why
expectRefused() {
    local label="$1" exited=0
    for _ in $(seq 1 40); do
        if ! kill -0 "${server}" 2>/dev/null; then
            exited=1
            break
        fi
        sleep 0.25
    done
    if [ "${exited}" = 0 ]; then
        cat "${WORK}/out.log"
        fail "${label}: the server kept running as root in the jail"
    fi
    wait "${server}"
    status=$?
    server=""
    [ "${status}" != 0 ] || fail "${label}: the server exited with status 0"
    grep -q "Chroot requires a UserAccount other than root" "${WORK}/out.log" || {
        cat "${WORK}/out.log"
        fail "${label}: the refusal was not logged"
    }
}

writeConfig "" "Chroot ${WORK}/jail"
start
expectRefused "Chroot with no UserAccount"

writeConfig "UserAccount _unchanged_" "Chroot ${WORK}/jail"
start
expectRefused "Chroot with UserAccount _unchanged_"

writeConfig "" "Chroot ${WORK}/jail"
start --debugger
expectRefused "Chroot under --debugger"

#   --chroot enters the jail before the configuration is read, so the configuration lives in the jail
writeConfig "" "" "${WORK}/jail/appweb.conf"
perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV or die' "${BIN}" --home "${WORK}/jail" --config appweb.conf \
    --chroot "${WORK}/jail" > "${WORK}/out.log" 2>&1 &
server=$!
expectRefused "--chroot with no UserAccount"

#   Positive: with a real account the jailed server serves from the jail as that account
writeConfig "UserAccount nobody" "Chroot ${WORK}/jail"
start
for _ in $(seq 1 40); do
    curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/index.html" 2>/dev/null && break
    sleep 0.25
done
body=$(curl -fsS "http://127.0.0.1:${PORT}/index.html" 2>/dev/null)
[ "${body}" = "ok" ] || { cat "${WORK}/out.log"; fail "the jailed server with UserAccount nobody did not serve"; }
uid=$(ps -o uid= -p "${server}" | tr -d ' ')
[ -n "${uid}" ] && [ "${uid}" != 0 ] || fail "the jailed server runs as uid '${uid}'"

echo "PASS: a chroot jail is refused as root and served as a non-root account"
exit 0
