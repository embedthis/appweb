/*
    forkfail-interpose.c - Test-only fork() interposer. Fails the fork() calls whose 1-based ordinal appears in the comma-separated FORKFAIL_AT environment variable with EAGAIN, and forwards the rest.
 */
#define _GNU_SOURCE
#include <errno.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

static int forkCount;

static int shouldFail(void)
{
    const char *p;

    forkCount++;
    for (p = getenv("FORKFAIL_AT"); p && *p; ) {
        if (atoi(p) == forkCount) {
            return 1;
        }
        if ((p = strchr(p, ',')) == 0) {
            break;
        }
        p++;
    }
    return 0;
}

#if __APPLE__
static pid_t failingFork(void)
{
    if (shouldFail()) {
        errno = EAGAIN;
        return -1;
    }
    return fork();
}

typedef struct { const void *replacement; const void *original; } Interpose;
__attribute__((used)) static const Interpose interposers[] __attribute__((section("__DATA,__interpose"))) = {
    { (const void*) failingFork, (const void*) fork },
};
#else
#include <dlfcn.h>

pid_t fork(void)
{
    static pid_t (*realFork)(void);

    if (!realFork) {
        realFork = (pid_t (*)(void)) dlsym(RTLD_NEXT, "fork");
    }
    if (shouldFail()) {
        errno = EAGAIN;
        return -1;
    }
    return realFork();
}
#endif
