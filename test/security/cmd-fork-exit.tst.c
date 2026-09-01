/*
    cmd-fork-exit.tst.c - A failed chdir in the forked child must _exit(), never return

    The POSIX child branch of MPR's startProcess() handled a chdir() failure with "return" instead of
    "_exit()". The forked child unwound back through mprStartCmd() into the caller's code and on into
    the MPR event loop, as a complete second copy of the server -- holding a duplicate of every
    descriptor the parent had, because the failure fires before the fd handling and before the
    closeFiles fork callback. Two processes then accept on the same listening socket (10153).

    The response is unchanged whether or not the clone escapes, so a status-code assertion cannot see
    this. What is observable is that a second process exists, so that is what this test detects.

    The detector is a pipe opened before the call. If the clone escapes, it reaches the line after
    mprStartCmd() with a different pid, writes a byte and _exit()s -- both because that byte is the
    evidence, and so that a failing run does not leave a second copy of the test binary running the
    rest of the suite's assertions. The write cannot be lost: the chdir failure precedes every fd
    close in the child branch, which is precisely why the escaped clone is dangerous.

    The trigger is a directory that does not exist. It reaches the same chdir() < 0 branch as an
    unsearchable one and does so deterministically, with no dependence on the uid the suite runs as.
 */

/********************************* Includes ***********************************/

#include "testme.h"
#include "mpr.h"

/*
    POSIX only, and guarded rather than assumed. startProcess has two implementations; the branch this
    covers is the one that forks, which exists only where ME_UNIX_LIKE. Windows creates the child with
    CreateProcess and has no forked child to escape, so there is nothing here to assert -- but the test
    included unistd.h unconditionally, so instead of skipping it failed to compile and was reported as
    an error for the whole run.
 */
#if ME_UNIX_LIKE

#include <fcntl.h>
#include <unistd.h>

/************************************ Code ************************************/

/*
    Start a command whose working directory cannot be entered. Returns non-zero if a forked child
    escaped back into this process's control flow.
 */
static int cloneEscaped(cchar *dir)
{
    MprCmd  *cmd;
    cchar   *argv[3];
    char    byte;
    pid_t   parent;
    int     fds[2], escaped, i;

    if (pipe(fds) < 0) {
        return -1;
    }
    if (fcntl(fds[0], F_SETFL, O_NONBLOCK) < 0) {
        close(fds[0]);
        close(fds[1]);
        return -1;
    }
    argv[0] = "/bin/echo";
    argv[1] = "clone-probe";
    argv[2] = 0;

    parent = getpid();
    cmd = mprCreateCmd(NULL);
    mprSetCmdDir(cmd, dir);
    mprStartCmd(cmd, 2, argv, NULL, MPR_CMD_DETACH);

    if (getpid() != parent) {
        /*
            Only reachable when the defect is present. Report and die without touching the harness.
         */
        byte = 'x';
        if (write(fds[1], &byte, 1) < 0) {}
        _exit(99);
    }
    mprDestroyCmd(cmd);

    /*
        The clone runs concurrently, so give it room to arrive rather than sampling once.
     */
    escaped = 0;
    for (i = 0; i < 20 && !escaped; i++) {
        if (read(fds[0], &byte, 1) == 1) {
            escaped = 1;
        } else {
            mprSleep(50);
        }
    }
    close(fds[0]);
    close(fds[1]);
    return escaped;
}


#endif /* ME_UNIX_LIKE */


int main(int argc, char **argv)
{
#if ME_UNIX_LIKE
    cchar *missing;

    mprCreate(argc, argv, 0);
    mprStart();

    missing = mprJoinPath(mprGetTempPath(NULL), "appweb-cmd-fork-exit-absent");
    mprDeletePath(missing);
    ttrue(!mprPathExists(missing, X_OK), "probe directory must not exist");

    teq(cloneEscaped(missing), 0, "a failed chdir must _exit() the child, not return it into the parent");

    /*
        A working directory must still spawn normally -- the fix must not turn every command into a
        failure.
     */
    teq(cloneEscaped(mprGetTempPath(NULL)), 0, "a valid directory must spawn without escaping a clone");

    mprDestroy();
#else
    tskip("startProcess forks only where ME_UNIX_LIKE; Windows has no forked child to escape");
#endif
    return 0;
}
