/*
    win-cmd-quoting.tst.c - prepWinCommand must not shift Windows argument boundaries

    MPR builds a single Windows command line from an argv[] and hands it to CreateProcess, which the
    child's C runtime parses back into an argv. The encoder and that parser must agree, or the token
    grid the caller built and the token grid the child sees diverge -- attacker data crossing an
    argument boundary it should not be able to cross (CWE-88).

    prepWinCommand inserts an escaping backslash only when it copies a literal quote out of the
    source string. It accounts for nothing before the closing quote it emits itself. So an argument
    that ends in an odd number of backslashes and also contains a space -- the condition that makes
    it quote at all -- is emitted as "foo bar\", where the trailing \" reads to any Win32-convention
    parser as an escaped, non-terminating quote. The string stays open and swallows whatever follows.

    The rule both sides are supposed to implement: a run of N backslashes before a literal quote
    becomes 2N+1, and a run of N before the closing quote becomes 2N.

    The assertion is a round trip. CommandLineToArgvW is the reference implementation of the parsing
    half, so decoding what prepWinCommand encoded must return exactly the argv that went in. The
    child's own argv is checked as well, so the finding does not rest on the reference parser alone.

    Windows only. The bug is in an ME_WIN_LIKE code path and has no POSIX counterpart -- fork/exec
    passes argv as a vector and never serializes it.
 */

/********************************* Includes ***********************************/

#include "testme.h"
#include "mpr.h"

#if ME_WIN_LIKE
#include <shellapi.h>

/*********************************** Locals ***********************************/

/*
    The helper is the CGI test program: it is built by the same solution, it sits on the PATH the
    suite sets, and with no switches it prints its own argv back as ARG[n]=value lines.
 */
#define HELPER "cgiProgram"

/************************************ Code ************************************/

/*
    Decode a Windows command line the way a child process's runtime does. Returns an allocated argv
    and sets *argc, or null if the command line cannot be parsed.
 */
static char **decodeCommandLine(cchar *command, int *argc)
{
    LPWSTR  *wargv;
    WCHAR   *wcommand;
    char    **argv;
    int     count, len, i, size;

    len = MultiByteToWideChar(CP_UTF8, 0, command, -1, NULL, 0);
    wcommand = mprAlloc(len * sizeof(WCHAR));
    MultiByteToWideChar(CP_UTF8, 0, command, -1, wcommand, len);

    if ((wargv = CommandLineToArgvW(wcommand, &count)) == NULL) {
        return 0;
    }
    argv = mprAlloc((count + 1) * sizeof(char*));
    for (i = 0; i < count; i++) {
        size = WideCharToMultiByte(CP_UTF8, 0, wargv[i], -1, NULL, 0, NULL, NULL);
        argv[i] = mprAlloc(size);
        WideCharToMultiByte(CP_UTF8, 0, wargv[i], -1, argv[i], size, NULL, NULL);
    }
    argv[count] = 0;
    LocalFree(wargv);
    *argc = count;
    return argv;
}


/*
    Run the helper with the given arguments and assert that the command line MPR built decodes back
    to the argv MPR encoded, and that the helper itself saw the same number of arguments.

    argv[0] is compared against cmd->argv[0] rather than the caller's, because mprStartCmd replaces
    it with the resolved program path before prepWinCommand runs.
 */
static void checkRoundTrip(cchar **argv, int argc, cchar *why)
{
    MprCmd  *cmd;
    char    **decoded, *out, *err;
    char    expect[64];
    int     count, i, status;

    cmd = mprCreateCmd(NULL);
    status = mprRunCmdV(cmd, argc, argv, NULL, NULL, &out, &err, 5000, MPR_CMD_OUT | MPR_CMD_ERR);
    if (status < 0) {
        tfail("%s: cannot run %s (status %d)", why, argv[0], status);
        return;
    }
    ttrue(cmd->command != 0, "%s: no command line was built", why);
    if (cmd->command == 0) {
        return;
    }
    tinfo("%s\n  argv:    %d elements, last is \"%s\"\n  encoded: %s", why, argc, argv[argc - 1], cmd->command);

    if ((decoded = decodeCommandLine(cmd->command, &count)) == 0) {
        tfail("%s: command line does not parse: %s", why, cmd->command);
        return;
    }
    teq(count, argc, "%s: the command line decodes to %d arguments, not the %d that were encoded -- "
        "an argument boundary moved", why, count, argc);

    for (i = 0; i < argc && i < count; i++) {
        tmatch(decoded[i], cmd->argv[i], "%s: argument %d decodes to \"%s\", encoded from \"%s\"",
               why, i, decoded[i], cmd->argv[i]);
    }

    /*
        The helper's own view. Its runtime parses the same bytes independently of the reference
        decoder above, so agreement here is what makes the finding a real one rather than a
        disagreement between MPR and one particular parser.
     */
    if (out) {
        fmt(expect, sizeof(expect), "ARG[%d]=", argc - 1);
        ttrue(scontains(out, expect) != 0,
              "%s: the child never saw argument %d -- it was absorbed into an earlier one", why, argc - 1);
    }
    mprDestroyCmd(cmd);
}
#endif /* ME_WIN_LIKE */


int main(int argc, char **argv)
{
#if ME_WIN_LIKE
    cchar   *args[4];
    char    *escaped;

    mprCreate(argc, argv, 0);
    mprStart();

    /*
        1. The defect. "a b\" ends in an odd backslash run and contains a space, so it is quoted, and
           the closing quote is emitted with no account of the backslash before it. TAIL is the next
           argument, and it is what gets swallowed.
     */
    args[0] = HELPER;
    args[1] = "a b\\";
    args[2] = "TAIL";
    args[3] = 0;
    checkRoundTrip(args, 3, "trailing backslash before the closing quote");

    /*
        2. An even run is not immune either -- it is only immune where the encoder happens to double
           it. Three backslashes is the same defect one step along.
     */
    args[0] = HELPER;
    args[1] = "a b\\\\\\";
    args[2] = "TAIL";
    args[3] = 0;
    checkRoundTrip(args, 3, "three trailing backslashes");

    /*
        3. A literal quote preceded by a backslash. The encoder's own guard -- do not escape a quote
           that already has a backslash before it -- is the inverse of the documented rule, which
           requires 2N+1 backslashes there, not N.
     */
    args[0] = HELPER;
    args[1] = "a\\\"b c";
    args[2] = "TAIL";
    args[3] = 0;
    checkRoundTrip(args, 3, "backslash before a literal quote");

    /*
        4. Control. An ordinary quoted argument with no backslash run must still round trip -- a fix
           must not change encoding for the arguments that were always correct.
     */
    args[0] = HELPER;
    args[1] = "a b";
    args[2] = "TAIL";
    args[3] = 0;
    checkRoundTrip(args, 3, "ordinary argument containing a space");

    /*
        5. A leading quote. The encoder used to read one as "the caller has already quoted this" and
           copy the argument in verbatim, unquoted and unescaped, so whatever produced the argument
           chose the token boundaries the child would see. This one argument arrives as two, and
           TAIL becomes a third -- an argument the caller never passed.

           It is not an exotic input: mprParseArgs turns a backslash-escaped quote into a leading
           one, so every argument the string-command API builds can start with a quote.
     */
    args[0] = HELPER;
    args[1] = "\"a\" \"b\"";
    args[2] = "TAIL";
    args[3] = 0;
    checkRoundTrip(args, 3, "leading quote with embedded spaces");

    /*
        6. The same defect at its smallest: an argument that is one quote.
     */
    args[0] = HELPER;
    args[1] = "\"";
    args[2] = "TAIL";
    args[3] = 0;
    checkRoundTrip(args, 3, "argument that is a single quote");

    /*
        7. mprEscapeCmd's character table was generated from mprEncodeGenerate's POSIX branch, so the
           two characters the ME_WIN_LIKE branch adds -- % and \r -- are unset on every platform,
           Windows builds included. % is cmd.exe's variable-expansion trigger, and this string is
           escaped precisely because it may reach cmd.exe.
     */
    escaped = mprEscapeCmd("%PATH%", 0);
    tinfo("mprEscapeCmd(\"%%PATH%%\") = %s", escaped);
    ttrue(scontains(escaped, "\\%") != 0,
          "mprEscapeCmd must escape %% on Windows -- cmd.exe expands it before the target ever runs");

    mprDestroy();
#else
    tskip("prepWinCommand and its command-line serialization are ME_WIN_LIKE only");
#endif
    return 0;
}
