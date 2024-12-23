/*
    fastProgram.c - Test FastCGI program

    Copyright (c) All Rights Reserved. See details at the end of the file.

    Usage:
        fastProgram [switches] [endpoint]
            -a                  Output the args (used for ISINDEX queries)
            -b bytes            Output content "bytes" long
            -d secs             Delay for given number of seconds
            -e                  Output the environment
            -h lines            Output header "lines" long
            -l location         Output "location" header
            -n                  Non-parsed-header ouput
            -p                  Ouput the post data
            -q                  Ouput the query data
            -s status           Output "status" header
            default             Output args, env and query

        Alternatively, pass the arguments as an environment variable HTTP_SWITCHES="-a -e -q"
 */

/********************************** Includes **********************************/

#include "fcgiapp.h"

#include <errno.h>
#include <ctype.h>
#include <fcntl.h>
#include <limits.h>
#include <stdarg.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <pthread.h>
#include <sys/types.h>
#include <unistd.h>

/*********************************** Locals ***********************************/

#define MAX_ARGV    64
#define MAX_THREADS 16

typedef struct State {
    char         *argvList[MAX_ARGV];
    int          delay;
    int          hasError;
    int          numPostKeys;
    int          numQueryKeys;
    int          outputArgs, outputEnv, outputPost, outputQuery;
    int          outputLines, outputHeaderLines, responseStatus;
    char         *outputLocation;
    char         *postBuf;
    size_t       postBufLen;
    char         **postKeys;
    char         *queryBuf;
    size_t       queryLen;
    char         **queryKeys;
    FCGX_Request *request;
    char         *errorMsg;
    int          timeout;
} State;

static pthread_mutex_t accept_mutex = PTHREAD_MUTEX_INITIALIZER;

static int       originalArgc;
static char      **originalArgv;

/***************************** Forward Declarations ***************************/

static void     error(State *state, char *fmt, ...);
static void     descape(char *src);
static int      getArgv(State *state, int *argc, char ***argv, int originalArgc, char **originalArgv);
static int      getVars(State *state, char ***cgiKeys, char *buf, size_t len);
static int      getPostData(State *state);
static int      getQueryString(State *state);
static char     hex2Char(char *s);
static int      parseArgs(State *state);
static void     printEnv(State *state);
static void     printQuery(State *state);
static void     printPost(State *state);
static char     *safeGetenv(State *state, char *key);
static void     *worker(State *state);

/******************************************************************************/
/*
    Test program entry point
 */
int main(int argc, char **argv, char **envp)
{
    pthread_t   ids[MAX_THREADS];
    State       states[MAX_THREADS];
    int         i;

    originalArgc = argc;
    originalArgv = argv;
    memset(&states, 0, sizeof(states));

    FCGX_Init();

    for (i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--help") == 0 || strcmp(argv[i], "-?") == 0) {
            fprintf(stderr, "usage: fastProgram -aenp [-b bytes] [-h lines] [-l location] [-s status] [-t timeout] [endpoint]\n");
            exit(2);
        } else if (argv[i][0] != '-') {
            close(0);
            FCGX_OpenSocket(argv[i], 5);
        }
    }
    for (i = 1; i < MAX_THREADS; i++) {
        pthread_create(&ids[i], NULL, (void*) worker, (void*) &states[i]);
    }
    worker(&states[0]);
    return 0;
}


static void *worker(State *state)
{
    FCGX_Request    request;
    char            *method;
    int             l, i, rc;

    FCGX_InitRequest(&request, 0, 0);

    while (1) {
        memset((void*) state, 0, sizeof(State));
        state->request = &request;

        pthread_mutex_lock(&accept_mutex);
        rc = FCGX_Accept_r(state->request);
        pthread_mutex_unlock(&accept_mutex);

        if (rc < 0) {
            if (errno == EAGAIN) {
                continue;
            }
            error(state, "Cannot accept a new connection errno :%d\n", errno);
            break;
        }

        if (parseArgs(state) < 0) {
            exit(4);
            break;
        }
        if ((method = FCGX_GetParam("REQUEST_METHOD", request.envp)) != 0 && strcmp(method, "POST") == 0) {
            if (getPostData(state) < 0) {
                error(state, "Cannot read FAST input");
            }
            if (strcmp(safeGetenv(state, "CONTENT_TYPE"), "application/x-www-form-urlencoded") == 0) {
                state->numPostKeys = getVars(state, &state->postKeys, state->postBuf, state->postBufLen);
            }
        }
        if (state->hasError) {
            FCGX_FPrintF(request.out, "HTTP/1.0 %d %s\r\n\r\n", state->responseStatus, state->errorMsg);
            FCGX_FPrintF(request.out, "<HTML><BODY><p>Error: %d -- %s</p></BODY></HTML>\r\n",
                state->responseStatus, state->errorMsg);
            error(state, "fastProgram: ERROR: %s\n", state->errorMsg);
            exit(2);
        }
        if (state->delay) {
            sleep(state->delay);
        }
#if KEEP
        if (nonParsedHeader) {
            if (state->responseStatus == 0) {
                FCGX_FPrintF(request.out, "HTTP/1.0 200 OK\r\n");
            } else {
                FCGX_FPrintF(request.out, "HTTP/1.0 %d %s\r\n", state->responseStatus, state->errorMsg ? state->errorMsg: "");
            }
            FCGX_FPrintF(request.out, "Connection: close\r\n");
            FCGX_FPrintF(request.out, "X-FAST-CustomHeader: Any value at all\r\n");
        }
#endif
        FCGX_FPrintF(request.out, "Content-Type: %s\r\n", "text/html");

        if (state->outputHeaderLines) {
            for (i = 0; i < state->outputHeaderLines; i++) {
                FCGX_FPrintF(request.out, "X-FAST-%d: A loooooooooooooooooooooooong string\r\n", i);
            }
        }
        if (state->outputLocation) {
            FCGX_FPrintF(request.out, "Location: %s\r\n", state->outputLocation);
        }
        if (state->responseStatus) {
            FCGX_FPrintF(request.out, "Status: %d\r\n", state->responseStatus);
        }
        FCGX_FPrintF(request.out, "\r\n");

        if ((state->outputLines + state->outputArgs + state->outputEnv + state->outputQuery +
                state->outputPost + state->outputLocation + state->responseStatus) == 0) {
            state->outputArgs++;
            state->outputEnv++;
            state->outputQuery++;
            state->outputPost++;
        }

        if (state->outputLines) {
            for (l = 0; l < state->outputLines; l++) {
                FCGX_FPrintF(request.out, "%09d\n", l);
            }

        } else {
            FCGX_FPrintF(request.out, "<HTML><TITLE>fastProgram: Output</TITLE><BODY>\r\n");
            if (state->outputArgs) {
                FCGX_FPrintF(request.out, "<H2>Args</H2>\r\n");
                for (i = 0; i < originalArgc; i++) {
                    FCGX_FPrintF(request.out, "<P>ARG[%d]=%s</P>\r\n", i, originalArgv[i]);
                }
            }
            printEnv(state);
            if (state->outputQuery) {
                printQuery(state);
            }
            if (state->outputPost) {
                printPost(state);
            }
            FCGX_FPrintF(request.out, "</BODY></HTML>\r\n");
        }
        FCGX_Finish_r(&request);
    }
    return NULL;
}


static int parseArgs(State *state)
{
    char    **argv;
    char    *cp;
    int     argc, i, err;

    err = 0;

    if (getArgv(state, &argc, &argv, originalArgc, originalArgv) < 0) {
        error(state, "Cannot read FAST input");
    }
    for (i = 1; i < argc; i++) {
        if (argv[i][0] != '-') {
            continue;
        }
        for (cp = &argv[i][1]; *cp; cp++) {
            switch (*cp) {
            case 'a':
                state->outputArgs++;
                break;

            case 'b':
                if (++i >= argc) {
                    err = __LINE__;
                } else {
                    state->outputLines = atoi(argv[i]);
                }
                break;

            case 'd':
                if (++i >= argc) {
                    err = __LINE__;
                } else {
                    state->delay = atoi(argv[i]);
                }
                break;
            case 'e':
                state->outputEnv++;
                break;

            case 'h':
                if (++i >= argc) {
                    err = __LINE__;
                } else {
                    state->outputHeaderLines = atoi(argv[i]);
                }
                break;

            case 'l':
                if (++i >= argc) {
                    err = __LINE__;
                } else {
                    state->outputLocation = argv[i];
                    if (state->responseStatus == 0) {
                        state->responseStatus = 302;
                    }
                }
                break;

            case 'p':
                state->outputPost++;
                break;

            case 'q':
                state->outputQuery++;
                break;

            case 's':
                if (++i >= argc) {
                    err = __LINE__;
                } else {
                    state->responseStatus = atoi(argv[i]);
                }
                break;

            case 't':
                if (++i >= argc) {
                    err = __LINE__;
                } else {
                    state->timeout = atoi(argv[i]);
                }
                break;

            default:
                err = __LINE__;
                break;
            }
        }
    }
    return err ? -1 : 0;
}



/*
    If there is a SWITCHES argument in the query string, examine that instead of the original argv
 */
static int getArgv(State *state, int *pargc, char ***pargv, int originalArgc, char **originalArgv)
{
    static char sbuf[1024];
    char        *switches, *next;
    int         i;

    *pargc = 0;
    if (getQueryString(state) < 0) {
        return -1;
    }
    state->numQueryKeys = getVars(state, &state->queryKeys, state->queryBuf, state->queryLen);

    switches = 0;
    for (i = 0; i < state->numQueryKeys; i += 2) {
        if (strcmp(state->queryKeys[i], "SWITCHES") == 0) {
            switches = state->queryKeys[i+1];
            break;
        }
    }
    if (switches == 0) {
        switches = FCGX_GetParam("HTTP_SWITCHES", state->request->envp);
    }
    if (switches) {
        strncpy(sbuf, switches, sizeof(sbuf) - 1);
        descape(sbuf);
        next = strtok(sbuf, " \t\n");
        i = 1;
        for (i = 1; next && i < (MAX_ARGV - 1); i++) {
            state->argvList[i] = strdup(next);
            next = strtok(0, " \t\n");
        }
        state->argvList[0] = originalArgv[0];
        *pargv = state->argvList;
        *pargc = i;

    } else {
        *pargc = originalArgc;
        *pargv = originalArgv;
    }
    return 0;
}


static void printEnv(State *state)
{
    FCGX_Stream     *out;
    char            **envp;

    out = state->request->out;

    FCGX_FPrintF(out, "<H2>Environment Variables</H2>\r\n");
    FCGX_FPrintF(out, "<P>AUTH_TYPE=%s</P>\r\n", safeGetenv(state, "AUTH_TYPE"));
    FCGX_FPrintF(out, "<P>CONTENT_LENGTH=%s</P>\r\n", safeGetenv(state, "CONTENT_LENGTH"));
    FCGX_FPrintF(out, "<P>CONTENT_TYPE=%s</P>\r\n", safeGetenv(state, "CONTENT_TYPE"));
    FCGX_FPrintF(out, "<P>DOCUMENT_ROOT=%s</P>\r\n", safeGetenv(state, "DOCUMENT_ROOT"));
    FCGX_FPrintF(out, "<P>GATEWAY_INTERFACE=%s</P>\r\n", safeGetenv(state, "GATEWAY_INTERFACE"));
    FCGX_FPrintF(out, "<P>HTTP_ACCEPT=%s</P>\r\n", safeGetenv(state, "HTTP_ACCEPT"));
    FCGX_FPrintF(out, "<P>HTTP_CONNECTION=%s</P>\r\n", safeGetenv(state, "HTTP_CONNECTION"));
    FCGX_FPrintF(out, "<P>HTTP_HOST=%s</P>\r\n", safeGetenv(state, "HTTP_HOST"));
    FCGX_FPrintF(out, "<P>HTTP_USER_AGENT=%s</P>\r\n", safeGetenv(state, "HTTP_USER_AGENT"));
    FCGX_FPrintF(out, "<P>PATH_INFO=%s</P>\r\n", safeGetenv(state, "PATH_INFO"));
    FCGX_FPrintF(out, "<P>PATH_TRANSLATED=%s</P>\r\n", safeGetenv(state, "PATH_TRANSLATED"));
    FCGX_FPrintF(out, "<P>QUERY_STRING=%s</P>\r\n", safeGetenv(state, "QUERY_STRING"));
    FCGX_FPrintF(out, "<P>REMOTE_ADDR=%s</P>\r\n", safeGetenv(state, "REMOTE_ADDR"));
    FCGX_FPrintF(out, "<P>REQUEST_METHOD=%s</P>\r\n", safeGetenv(state, "REQUEST_METHOD"));
    FCGX_FPrintF(out, "<P>REQUEST_URI=%s</P>\r\n", safeGetenv(state, "REQUEST_URI"));
    FCGX_FPrintF(out, "<P>REMOTE_USER=%s</P>\r\n", safeGetenv(state, "REMOTE_USER"));
    FCGX_FPrintF(out, "<P>SCRIPT_NAME=%s</P>\r\n", safeGetenv(state, "SCRIPT_NAME"));
    FCGX_FPrintF(out, "<P>SCRIPT_FILENAME=%s</P>\r\n", safeGetenv(state, "SCRIPT_FILENAME"));
    FCGX_FPrintF(out, "<P>SERVER_ADDR=%s</P>\r\n", safeGetenv(state, "SERVER_ADDR"));
    FCGX_FPrintF(out, "<P>SERVER_NAME=%s</P>\r\n", safeGetenv(state, "SERVER_NAME"));
    FCGX_FPrintF(out, "<P>SERVER_PORT=%s</P>\r\n", safeGetenv(state, "SERVER_PORT"));
    FCGX_FPrintF(out, "<P>SERVER_PROTOCOL=%s</P>\r\n", safeGetenv(state, "SERVER_PROTOCOL"));
    FCGX_FPrintF(out, "<P>SERVER_SOFTWARE=%s</P>\r\n", safeGetenv(state, "SERVER_SOFTWARE"));

    /*
        This is not supported on VxWorks as you cannot get "envp" in main()
     */
    FCGX_FPrintF(out, "\r\n<H2>All Defined Environment Variables</H2>\r\n");
    envp = state->request->envp;
    if (envp) {
        char    *p;
        int     i;
        for (i = 0, p = envp[0]; envp[i]; i++) {
            p = envp[i];
            FCGX_FPrintF(out, "<P>%s</P>\r\n", p);
        }
    }
    FCGX_FPrintF(out, "\r\n");
}


static void printQuery(State *state)
{
    FCGX_Stream     *out;
    int             i;

    out = state->request->out;

    if (state->numQueryKeys == 0) {
        FCGX_FPrintF(out, "<H2>No Query String Found</H2>\r\n");
    } else {
        FCGX_FPrintF(out, "<H2>Decoded Query String Variables</H2>\r\n");
        for (i = 0; i < (state->numQueryKeys * 2); i += 2) {
            if (state->queryKeys[i+1] == 0) {
                FCGX_FPrintF(out, "<p>QVAR %s=</p>\r\n", state->queryKeys[i]);
            } else {
                FCGX_FPrintF(out, "<p>QVAR %s=%s</p>\r\n", state->queryKeys[i], state->queryKeys[i+1]);
            }
        }
    }
    FCGX_FPrintF(out, "\r\n");
}


static void printPost(State *state)
{
    FCGX_Stream     *out;
    int             i;

    out = state->request->out;

    if (state->numPostKeys) {
        FCGX_FPrintF(out, "<H2>Decoded Post Variables</H2>\r\n");
        for (i = 0; i < (state->numPostKeys * 2); i += 2) {
            FCGX_FPrintF(out, "<p>PVAR %s=%s</p>\r\n", state->postKeys[i], state->postKeys[i+1]);
        }

    } else if (state->postBuf) {
        if (state->postBufLen < (50 * 1000)) {
            FCGX_FPrintF(out, "<H2>Post Data %d bytes found (data below)</H2>\r\n", (int) state->postBufLen);
            FCGX_PutStr(state->postBuf, (int) state->postBufLen, out);
        } else {
            FCGX_FPrintF(out, "<H2>Post Data %d bytes found</H2>\r\n", (int) state->postBufLen);
        }

    } else {
        FCGX_FPrintF(out, "<H2>No Post Data Found</H2>\r\n");
    }
    FCGX_FPrintF(out, "\r\n");
}


static int getQueryString(State *state)
{
    if (FCGX_GetParam("QUERY_STRING", state->request->envp) == 0) {
        state->queryBuf = "";
        state->queryLen = 0;
    } else {
        state->queryBuf = FCGX_GetParam("QUERY_STRING", state->request->envp);
        state->queryLen = (int) strlen(state->queryBuf);
    }
    return 0;
}


static int getPostData(State *state)
{
    FCGX_Stream     *in;
    char            *contentLength, *buf;
    ssize_t         bufsize, bytes, size, limit, len;

    in = state->request->in;
    if ((contentLength = FCGX_GetParam("CONTENT_LENGTH", state->request->envp)) != 0) {
        size = atoi(contentLength);
        if (size < 0 || size >= INT_MAX) {
            error(state, "Bad content length: %ld", size);
            return -1;
        }
        limit = size;
    } else {
        size = 4096;
        limit = INT_MAX;
    }
    bufsize = size + 1;
    if ((buf = malloc(bufsize)) == 0) {
        error(state, "Could not allocate memory to read post data: bufsize %ld", bufsize);
        return -1;
    }
    len = 0;

    while (len < limit) {
        if ((len + size + 1) > bufsize) {
            if ((buf = realloc(buf, len + size + 1)) == 0) {
                error(state, "Could not allocate memory to read post data");
                return -1;
            }
            bufsize = len + size + 1;
        }
        bytes = FCGX_GetStr(&buf[len], (int) size, in);
        if (bytes < 0) {
            error(state, "Could not read FAST input %d", in->FCGI_errno);
            return -1;
        } else if (bytes == 0) {
            /* EOF */
            if (in->FCGI_errno) {
                error(state, "Error reading stdin %d", in->FCGI_errno);
            }
            break;
        }
        len += bytes;
    }
    buf[len] = 0;
    state->postBufLen = len;
    state->postBuf = buf;
    return 0;
}


static int getVars(State *state, char ***cgiKeys, char *buf, size_t buflen)
{
    char    **keyList, *eq, *cp, *pp, *newbuf;
    int     i, keyCount;

    if (buflen > 0) {
        if ((newbuf = malloc(buflen + 1)) == 0) {
            error(state, "Cannot allocate memory");
            return 0;
        }
        strncpy(newbuf, buf, buflen);
        newbuf[buflen] = '\0';
        buf = newbuf;
    }

    /*
        Change all plus signs back to spaces
     */
    keyCount = (buflen > 0) ? 1 : 0;
    for (cp = buf; cp < &buf[buflen]; cp++) {
        if (*cp == '+') {
            *cp = ' ';
        } else if (*cp == '&') {
            keyCount++;
        }
    }
    if (keyCount == 0) {
        return 0;
    }

    /*
        Crack the input into name/value pairs
     */
    keyList = malloc((keyCount * 2) * sizeof(char**));

    i = 0;
    for (pp = strtok(buf, "&"); pp; pp = strtok(0, "&")) {
        if ((eq = strchr(pp, '=')) != 0) {
            *eq++ = '\0';
            descape(pp);
            descape(eq);
        } else {
            descape(pp);
        }
        if (i < (keyCount * 2)) {
            keyList[i++] = pp;
            keyList[i++] = eq;
        }
    }
    *cgiKeys = keyList;
    return keyCount;
}


static char hex2Char(char *s)
{
    char    c;

    if (*s >= 'A') {
        c = toupper(*s & 0xFF) - 'A' + 10;
    } else {
        c = *s - '0';
    }
    s++;

    if (*s >= 'A') {
        c = (c * 16) + (toupper(*s & 0xFF) - 'A') + 10;
    } else {
        c = (c * 16) + (toupper(*s & 0xFF) - '0');
    }
    return c;
}


static void descape(char *src)
{
    char    *dest;

    dest = src;
    while (*src) {
        if (*src == '%') {
            *dest++ = hex2Char(++src) ;
            src += 2;
        } else {
            *dest++ = *src++;
        }
    }
    *dest = '\0';
}


static char *safeGetenv(State *state, char *key)
{
    char    *cp;

    cp = FCGX_GetParam(key, state->request->envp);
    if (cp == 0) {
        return "";
    }
    return cp;
}


static void error(State *state, char *fmt, ...)
{
    va_list args;
    char    buf[4096];

    if (state->errorMsg == 0) {
        va_start(args, fmt);
        vsprintf(buf, fmt, args);
        if (state->request && state->request->err) {
            FCGX_FPrintF(state->request->err, "%s\n", buf);
        } else {
            fprintf(stderr, "%s\n", buf);
        }
        state->responseStatus = 400;
        state->errorMsg = strdup(buf);
        va_end(args);
        state->hasError++;
    }
}


#if KEEP
static int waitForData(int fd, int timeout)
{
    fd_set          read_fds;
    struct timeval  tval = { 0, timeout * 1000 };
    int             rc;

    FD_ZERO(&read_fds);
    FD_SET(0, &read_fds);
    return select(1, &read_fds, NULL, NULL, &tval);
}
#endif

/*
    Copyright (c) Embedthis Software. All Rights Reserved.
    This software is distributed under a commercial license. Consult the LICENSE.md
    distributed with this software for full details and copyrights.
 */
