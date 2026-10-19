/*
    watchdog-pidfile.tst.c - The watchdog pid file round-trips any pid and never follows a planted link
 */

/********************************* Includes ***********************************/

#include "testme.h"
#include "appweb.h"

#if ME_UNIX_LIKE

#define main watchdogMain
#if defined(__GNUC__)
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wsign-conversion"
#endif
#include "../../src/watchdog/watchdog.c"
#if defined(__GNUC__)
#pragma GCC diagnostic pop
#endif
#undef main

#include <pwd.h>

/************************************ Code ************************************/

static void roundTrip(int pid)
{
    int     rc, got;

    rc = writePid(pid);
    teqi(rc, 0, "writePid succeeds");
    got = readPid();
    teqi(got, pid, "readPid returns the full pid written");
}

static void plantedLink(cchar *dir)
{
    struct stat info;
    char        *target;
    int         rc, pid;

    target = sjoin(dir, "/target", NULL);
    mprWritePathContents(target, "precious", 8, 0644);
    unlink(app->pidPath);
    rc = symlink(target, app->pidPath);
    teqi(rc, 0, "plant symlink");

    writePid(getpid());
    ttrue(smatch(mprReadPathContents(target, NULL), "precious"), "symlink target is unchanged");
    rc = lstat(app->pidPath, &info);
    ttrue(rc == 0 && !S_ISLNK(info.st_mode), "pid file is not the planted link");

    unlink(app->pidPath);
    rc = symlink(target, app->pidPath);
    teqi(rc, 0, "plant symlink");
    pid = readPid();
    teqi(pid, -1, "readPid rejects a symlink");
    unlink(app->pidPath);
    unlink(target);
}

static void unsafeFile(void)
{
    struct passwd *pw;
    int           rc, pid;

    rc = writePid(4242);
    teqi(rc, 0, "writePid succeeds");
    chmod(app->pidPath, 0666);
    pid = readPid();
    teqi(pid, -1, "readPid rejects a world writable pid file");

    if (geteuid() != 0 || (pw = getpwnam("nobody")) == 0) {
        tinfo("Skipping foreign owner check: not running as root");
        return;
    }
    rc = writePid(4242);
    teqi(rc, 0, "writePid succeeds");
    rc = chown(app->pidPath, pw->pw_uid, pw->pw_gid);
    teqi(rc, 0, "chown pid file to nobody");
    pid = readPid();
    teqi(pid, -1, "readPid rejects a pid file owned by another user");
}

static void ownership(void)
{
    struct stat info;
    int         rc;

    roundTrip(getpid());
    rc = stat(app->pidPath, &info);
    teqi(rc, 0, "stat pid file");
    teqi((int) (info.st_mode & 0777), 0644, "pid file mode is 0644");
    teqi((int) info.st_uid, (int) geteuid(), "pid file is owned by the caller");
}

int main(int argc, char **argv)
{
    char    *dir;
    int     rc;

    mprCreate(argc, argv, 0);
    umask(022);
    app = mprAllocObj(App, manageApp);
    mprAddRoot(app);

    dir = mprGetTempPath(NULL);
    unlink(dir);
    rc = mkdir(dir, 0700);
    teqi(rc, 0, "create scratch directory");
    app->pidPath = sjoin(dir, "/watchdog.pid", NULL);

    roundTrip(12345);
    roundTrip(98765);
    roundTrip(4194303);
    ownership();
    plantedLink(dir);
    unsafeFile();

    unlink(app->pidPath);
    rmdir(dir);
    mprDestroy();
    return 0;
}

#else

int main(void)
{
    tskip("POSIX only");
    return 0;
}

#endif
