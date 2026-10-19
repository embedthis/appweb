/*
    launch.c - Launch a backend program for the FastCGI and proxy handlers

    Copyright (c) All Rights Reserved. See copyright notice at the bottom of the file.
 */

/*********************************** Includes *********************************/

#include    "appweb.h"

#if ME_UNIX_LIKE && (ME_COM_FAST || ME_COM_PROXY)

#define LAUNCH_EXIT_NOEXEC 127

/************************************* Code ***********************************/
/*
    The close-on-exec pipe reports errno on failure and EOF on success. Between fork and exec, use only async-
    signal-safe calls. Reap failed children before returning.
 */
PUBLIC int maLaunchProgram(cchar *command, cchar **argv, cchar **envp, int stdinFd, bool keepStdio, int *execErrno)
{
    ssize nbytes;
    int   pid, status[2], statusFd, err;

    *execErrno = 0;
    if (pipe(status) < 0) {
        return MPR_ERR_CANT_CREATE;
    }
    fcntl(status[1], F_SETFD, FD_CLOEXEC);

    if ((pid = fork()) < 0) {
        close(status[0]);
        close(status[1]);
        return MPR_ERR_CANT_CREATE;

    } else if (pid == 0) {
        /*
            Move the status pipe above stdio before dup/close operations, then keep it at descriptor 3.
         */
        close(status[0]);
        statusFd = fcntl(status[1], F_DUPFD, 3);
        close(status[1]);
        if (stdinFd >= 0 && stdinFd != 0) {
            dup2(stdinFd, 0);
        }
        if (!keepStdio) {
            close(1);
            close(2);
        }
        if (statusFd != 3) {
            dup2(statusFd, 3);
            statusFd = 3;
        }
        fcntl(statusFd, F_SETFD, FD_CLOEXEC);
        mprCloseFilesFrom(4);
        execve(command, (char**) argv, (char**) envp);
        err = errno;
        if (write(statusFd, &err, sizeof(err)) < 0) {
        }
        _exit(LAUNCH_EXIT_NOEXEC);
    }
    close(status[1]);

    //  Blocks only until the child execs or exits, both of which close the write end
    err = 0;
    do {
        nbytes = read(status[0], &err, sizeof(err));
    } while (nbytes < 0 && errno == EINTR);
    close(status[0]);

    if (nbytes > 0) {
        *execErrno = err ? err : ENOEXEC;

        while (waitpid(pid, NULL, 0) < 0 && errno == EINTR) {
        }
        return MPR_ERR_CANT_ACCESS;
    }
    return pid;
}

#endif

/*
    Copyright (c) Embedthis Pty Ltd. All Rights Reserved.
    This software is distributed under a commercial license. Consult the LICENSE.md
    distributed with this software for full details and copyrights.
 */
