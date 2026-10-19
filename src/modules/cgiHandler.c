/*
    cgiHandler.c -- Common Gateway Interface Handler

    Support the CGI/1.1 standard for external gateway programs to respond to HTTP requests.
    This CGI handler uses async-pipes and non-blocking I/O for all communications.

    Copyright (c) All Rights Reserved. See copyright notice at the bottom of the file.
 */

/*********************************** Includes *********************************/

#include    "appweb.h"

#if ME_COM_CGI
/************************************ Locals ***********************************/

typedef struct Cgi {
    HttpStream *stream;                 /**< Client connection object */
    MprCmd *cmd;                        /**< CGI command object */
    HttpQueue *writeq;                  /**< Queue to write to the CGI */
    HttpQueue *readq;                   /**< Queue to read from the CGI */
    HttpPacket *headers;                /**< CGI response headers */
    cchar *location;                    /**< Redirection location */
    MprOff declaredLength;              /**< Content-Length declared by the CGI, or negative if none */
    MprOff bodyBytes;                   /**< Body bytes forwarded from the CGI to the client */
    int seenHeader;                     /**< Parsed response header from CGI */
    int deferStart;                     /**< Start the CGI once a body of undeclared length is received */
} Cgi;

/*********************************** Forwards *********************************/

static void browserToCgiService(HttpQueue *q);
static int buildArgs(HttpStream *stream, int *argcp, cchar ***argvp);
static void cgiCallback(MprCmd *cmd, int channel, void *data);
static void checkCgiLength(Cgi *cgi);
static void cgiToBrowserData(HttpQueue *q, HttpPacket *packet);
static int copyInherited(cchar **envv, int index);
static int copyInner(HttpStream *stream, cchar **envv, int index, cchar *key, cchar *value, cchar *prefix);
static int copyParams(HttpStream *stream, cchar **envv, int index, MprJson *params, cchar *prefix);
static int copyVars(HttpStream *stream, cchar **envv, int index, MprHash *vars, cchar *prefix);
static void manageCgi(Cgi *cgi, int flags);
static void readFromCgi(Cgi *cgi, int channel);

#if ME_DEBUG
static void traceCGIData(MprCmd *cmd, char *src, ssize size);
    #define traceData(cmd, src, size) traceCGIData(cmd, src, size)
#else
    #define traceData(cmd, src, size)
#endif

#if ME_WIN_LIKE || VXWORKS
static void findExecutable(HttpStream *stream, char **program, char **script, char **bangScript, cchar *fileName);
#endif
#if ME_WIN_LIKE
static void checkCompletion(HttpQueue *q, MprEvent *event);
static void waitForCgi(Cgi *cgi, MprEvent *event);
#endif

/*
    Allowlisted environment variables inherited by CGI programs.
 */
static cchar *inheritEnv[] = {
    "PATH", "TZ", "LANG", "LC_ALL",
#if ME_WIN_LIKE
    "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP",
#endif
    0
};

/************************************* Code ***********************************/
/*
    Open the handler for a new request
 */
static int openCgi(HttpQueue *q)
{
    HttpStream *stream;
    Cgi        *cgi;
    int        nproc;

    stream = q->stream;
    if ((nproc = (int) httpMonitorEvent(stream, HTTP_COUNTER_ACTIVE_PROCESSES, 1)) > stream->limits->processMax) {
        httpMonitorEvent(q->stream, HTTP_COUNTER_ACTIVE_PROCESSES, -1);
        httpLogStream(stream, "cgi.limit.error", "error",
                "msg=\"Too many concurrent processes\", activeProcesses=%d, maxProcesses=%d",
                nproc - 1, stream->limits->processMax);
        httpError(stream, HTTP_CODE_SERVICE_UNAVAILABLE, "Server overloaded");
        return MPR_ERR_CANT_OPEN;
    }
    if ((cgi = mprAllocObj(Cgi, manageCgi)) == 0) {
        /* Normal mem handler recovery */
        httpMonitorEvent(stream, HTTP_COUNTER_ACTIVE_PROCESSES, -1);
        return MPR_ERR_MEMORY;
    }
    httpTrimExtraPath(stream);
    httpMapFile(stream);
    if (stream->tx->filename == 0) {
        httpMonitorEvent(stream, HTTP_COUNTER_ACTIVE_PROCESSES, -1);
        return MPR_ERR_CANT_OPEN;
    }
    q->queueData = q->pair->queueData = cgi;
    cgi->stream = stream;
    cgi->declaredLength = -1;
    cgi->readq = httpCreateQueue(stream->net, stream, stream->http->cgiConnector, HTTP_QUEUE_RX, 0);
    cgi->writeq = httpCreateQueue(stream->net, stream, stream->http->cgiConnector, HTTP_QUEUE_TX, 0);
    cgi->readq->pair = cgi->writeq;
    cgi->writeq->pair = cgi->readq;
    cgi->writeq->queueData = cgi->readq->queueData = cgi;
    return 0;
}


static void manageCgi(Cgi *cgi, int flags)
{
    if (flags & MPR_MANAGE_MARK) {
        mprMark(cgi->stream);
        mprMark(cgi->writeq);
        mprMark(cgi->readq);
        mprMark(cgi->cmd);
        mprMark(cgi->headers);
        mprMark(cgi->location);
    }
}


static void closeCgi(HttpQueue *q)
{
    Cgi    *cgi;
    MprCmd *cmd;

    if ((cgi = q->queueData) != 0) {
        cmd = cgi->cmd;
        if (cmd) {
            mprSetCmdCallback(cmd, NULL, NULL);
            mprDestroyCmd(cmd);
            cgi->cmd = 0;
        }
        httpMonitorEvent(q->stream, HTTP_COUNTER_ACTIVE_PROCESSES, -1);
    }
}


/*
    Start the CGI command program. This commences the CGI gateway program. This will be called after content for
    form and upload requests (or if "RunHandler" before specified), otherwise it runs before receiving content data.
 */
static void startCgi(HttpQueue *q)
{
    HttpRx     *rx;
    HttpTx     *tx;
    HttpRoute  *route;
    HttpStream *stream;
    MprCmd     *cmd;
    Cgi        *cgi;
    cchar      *baseName, **argv, *fileName, **envv;
    ssize      varCount;
    int        argc, count;

    argv = 0;
    argc = 0;
    cgi = q->queueData;
    stream = q->stream;
    rx = stream->rx;
    route = rx->route;
    tx = stream->tx;

    /*
        Receive undeclared-length bodies fully before starting CGI so CONTENT_LENGTH has the decoded size.
     */
    if (rx->length < 0 && !rx->eof) {
        cgi->deferStart = 1;
        return;
    }
    /*
        The command uses the stream dispatcher. This serializes all I/O for both the stream and the CGI gateway.
     */
    if ((cmd = mprCreateCmd(stream->dispatcher)) == 0) {
        return;
    }
    cgi->cmd = cmd;

    if (stream->http->forkCallback) {
        cmd->forkCallback = stream->http->forkCallback;
        cmd->forkData = stream->http->forkData;
    }
    argc = 1;                                   /* argv[0] == programName */
    if (buildArgs(stream, &argc, &argv) < 0) {
        /* httpError already called */
        return;
    }
    fileName = argv[0];
    baseName = mprGetPathBase(fileName);

    /*
        Parse nph output as CGI under HTTP/2, which cannot forward raw HTTP/1 headers.
     */
    if ((strncmp(baseName, "nph-", 4) == 0 ||
        (strlen(baseName) > 4 && strcmp(&baseName[strlen(baseName) - 4], "-nph") == 0)) && stream->net->protocol < 2) {
        /* Pretend we've seen the header for Non-parsed Header CGI programs */
        cgi->seenHeader = 1;
        tx->flags |= HTTP_TX_USE_OWN_HEADERS;
    }
    /*
        Build environment variables
     */
    httpCreateCGIParams(stream);
    varCount = mprGetHashLength(rx->headers) + mprGetHashLength(rx->svars) + mprGetJsonLength(rx->params) +
        (int) (sizeof(inheritEnv) / sizeof(inheritEnv[0])) + 1;
    if ((envv = mprAlloc((varCount + 1) * sizeof(char*))) != 0) {
        //  OPTIONAL
        count = copyParams(stream, envv, 0, rx->params, route->envPrefix);
        count = copyVars(stream, envv, count, rx->svars, "");
        count = copyVars(stream, envv, count, rx->headers, "HTTP_");
        if (tx->ext) {
            // PHP CGI requires REDIRECT_STATUS.
            envv[count++] = sclone("REDIRECT_STATUS=200");
            envv[count] = 0;
        }
        count = copyInherited(envv, count);
        assert(count <= varCount);
    }
#if !VXWORKS
    /*
        This will be ignored on VxWorks because there is only one global current directory for all tasks
     */
    mprSetCmdDir(cmd, mprGetPathDir(fileName));
#endif
    mprSetCmdCallback(cmd, cgiCallback, cgi);

    if (route->callback && route->callback(stream, HTTP_ROUTE_HOOK_CGI, &argc, argv, envv) < 0) {
        httpError(stream, HTTP_CODE_NOT_FOUND, "Route check failed for CGI: %s, URI %s", fileName, rx->uri);
        return;
    }
    // A new process group lets shutdown stop the script and its children.
    if (mprStartCmd(cmd, argc, argv, envv,
                    MPR_CMD_IN | MPR_CMD_OUT | MPR_CMD_ERR | MPR_CMD_NEW_SESSION | MPR_CMD_EXACT_ENV) < 0) {
        httpError(stream, HTTP_CODE_NOT_FOUND, "Cannot run CGI process: %s, URI %s", fileName, rx->uri);
        return;
    }
#if ME_WIN_LIKE
    mprCreateLocalEvent(stream->dispatcher, "cgi-win", 10, waitForCgi, cgi, MPR_EVENT_CONTINUOUS);
#endif
}


#if ME_WIN_LIKE
static void waitForCgi(Cgi *cgi, MprEvent *event)
{
    HttpStream *stream;
    MprCmd     *cmd;

    stream = cgi->stream;
    cmd = cgi->cmd;
    if (cmd && !cmd->complete) {
        if (stream->error && cmd->pid) {
            mprStopCmd(cmd, -1);
            mprStopContinuousEvent(event);
        }
    } else {
        mprStopContinuousEvent(event);
    }
}
#endif


/*
    Handler incoming routine.
    Accept incoming body data from the client destined for the CGI gateway. This is typically POST or PUT data.
    Note: For POST "form" requests, this will be called before the command is actually started.
 */
static void browserToCgiData(HttpQueue *q, HttpPacket *packet)
{
    HttpStream *stream;
    Cgi        *cgi;

    assert(q);
    assert(packet);

    if ((cgi = q->queueData) == 0) {
        return;
    }
    stream = q->stream;
    assert(q == stream->readq);

    if (packet->flags & HTTP_PACKET_END) {
        if (stream->rx->remainingContent > 0 && stream->net->protocol < 2) {
            /* Short incoming body data. Just kill the CGI process */
            httpError(stream, HTTP_CODE_BAD_REQUEST, "Client supplied insufficient body data");
            if (cgi->cmd) {
                mprDestroyCmd(cgi->cmd);
                cgi->cmd = 0;
            }
        } else {
            httpFinalizeInput(stream);
        }
    }
    httpPutForService(cgi->writeq, packet, HTTP_SCHEDULE_QUEUE);

    if (cgi->deferStart && (packet->flags & HTTP_PACKET_END) && !stream->error) {
        cgi->deferStart = 0;
        startCgi(q);
        httpServiceQueue(cgi->writeq);
    }

    /*
        Body packets are passed to this routine directly, so stream->readq->count never rises and the generic
        room test upstream always finds space no matter how far behind the gateway is. Suspend the read queue
        while the gateway is behind; browserToCgiService resumes it as the gateway drains, once the gateway
        is running.
     */
    if (cgi->cmd && cgi->writeq->count >= cgi->writeq->max) {
        httpSuspendQueue(q);
    }
}


/*
    Connector outgoingService
 */
static void browserToCgiService(HttpQueue *q)
{
    HttpStream *stream;
    HttpPacket *packet;
    Cgi        *cgi;
    MprCmd     *cmd;
    MprBuf     *buf;
    ssize      rc, len;
    int        err;

    if ((cgi = q->queueData) == 0) {
        return;
    }
    assert(q == cgi->writeq);
    if ((cmd = cgi->cmd) == 0) {
        /* CGI not yet started */
        return;
    }
    stream = cgi->stream;

    for (packet = httpGetPacket(q); packet; packet = httpGetPacket(q)) {
        if (packet->flags & HTTP_PACKET_END) {
            /* The end packet follows upload form data; rx->eof can precede it. */
            mprCloseCmdFd(cmd, MPR_CMD_STDIN);
            continue;
        }
        if ((buf = packet->content) == 0) {
            continue;
        }
        if (cmd) {
            len = mprGetBufLength(buf);
            rc = mprWriteCmd(cmd, MPR_CMD_STDIN, mprGetBufStart(buf), len);
            if (rc < 0) {
                err = mprGetError();
                if (err == EINTR) {
                    continue;
                } else if (err == EAGAIN || err == EWOULDBLOCK) {
                    httpPutBackPacket(q, packet);
                    httpSuspendQueue(q);
                    break;
                }
                httpLogStream(stream, "cgi.error", "error", "msg=\"Cannot write to CGI gateway\", errno=%d",
                        mprGetOsError());
                mprCloseCmdFd(cmd, MPR_CMD_STDIN);
                httpDiscardQueueData(q, 1);
                httpError(stream, HTTP_CODE_BAD_GATEWAY, "Cannot write body data to CGI gateway");
                break;
            }
            mprAdjustBufStart(buf, rc);
            if (mprGetBufLength(buf) > 0) {
                httpPutBackPacket(q, packet);
                httpSuspendQueue(q);
                break;
            }
        }
    }
    if (cmd) {
        if (q->count > 0) {
            /* Wait for writable event so cgiCallback can recall this routine */
            mprEnableCmdEvents(cmd, MPR_CMD_STDIN);
        } else {
            mprDisableCmdEvents(cmd, MPR_CMD_STDIN);
        }
    }
    /*
        Resume reading the request body now the gateway has taken what browserToCgiData queued for it.
     */
    if (q->count < q->max && httpIsQueueSuspended(stream->readq)) {
        httpResumeQueue(stream->readq, 0);
    }
}


static void cgiToBrowserData(HttpQueue *q, HttpPacket *packet)
{
    httpPutForService(q->stream->writeq, packet, HTTP_SCHEDULE_QUEUE);
}


static void cgiToBrowserService(HttpQueue *q)
{
    HttpStream *stream;
    MprCmd     *cmd;
    Cgi        *cgi;

    if ((cgi = q->queueData) == 0) {
        return;
    }
    stream = q->stream;
    assert(q == stream->writeq);
    cmd = cgi->cmd;
    if (cmd == 0) {

        httpDefaultService(q);
        return;
    }
    /*
        This will copy outgoing packets downstream toward the network stream and on to the browser.
        This may disable the CGI queue if the downstream net stream queue overflows because the socket
        is full. In that case, httpEnableConnEvents will setup to listen for writable events. When the
        socket is writable again, the stream will drain its queue which will re-enable this queue
        and schedule it for service again.
     */
    httpDefaultService(q);
    if (q->count < q->low) {
        mprEnableCmdOutputEvents(cmd, 1);
    } else if (q->count > q->max && stream->net->writeBlocked) {
        httpSuspendQueue(stream->writeq);
    }
}


/*
    Read the output data from the CGI script and return it to the client. This is called by the MPR in response to
    I/O events from the CGI process for stdout/stderr data from the CGI script and for EOF from the CGI's stdin.
    IMPORTANT: This event runs on the stream's dispatcher. (ie. single threaded and safe)
 */
static void cgiCallback(MprCmd *cmd, int channel, void *data)
{
    HttpStream *stream;
    Cgi        *cgi;
    int        suspended;

    if ((cgi = data) == 0) {
        return;
    }
    if ((stream = cgi->stream) == 0) {
        return;
    }
    stream->lastActivity = stream->http->now;

    switch (channel) {
    case MPR_CMD_STDIN:
        /* Stdin can absorb more data */
        httpResumeQueue(cgi->writeq, 1);
        break;

    case MPR_CMD_STDOUT:
    case MPR_CMD_STDERR:
        readFromCgi(cgi, channel);
        break;

    default:
        /* Child death notification */
        if (cmd->status != 0) {
            httpError(cgi->stream, HTTP_CODE_BAD_GATEWAY, "Bad CGI process termination");
        }
        break;
    }
    if (cgi->location) {
        httpRedirectUri(stream, HTTP_CODE_MOVED_TEMPORARILY, cgi->location);
    }
    if (cmd->complete || cgi->location) {
        cgi->location = 0;
        httpFinalize(stream);
    } else {
        suspended = httpIsQueueSuspended(stream->writeq);
        assert(!suspended || stream->net->writeBlocked);
        mprEnableCmdOutputEvents(cmd, !suspended);
    }
    httpServiceNetQueues(stream->net, 0);

    mprCreateLocalEvent(stream->dispatcher, "cgi", 0, httpIOEvent, stream->net, 0);
}


static void readFromCgi(Cgi *cgi, int channel)
{
    HttpStream *stream;
    HttpPacket *packet;
    HttpTx     *tx;
    HttpQueue  *q, *writeq;
    MprCmd     *cmd;
    ssize      nbytes;
    int        err;

    cmd = cgi->cmd;
    stream = cgi->stream;
    tx = stream->tx;
    q = cgi->readq;
    writeq = stream->writeq;

    assert(stream->sock);
    assert(stream->state > HTTP_STATE_BEGIN);

    if (tx->finalized) {
        mprCloseCmdFd(cmd, channel);
    }
    while (mprGetCmdFd(cmd, channel) >= 0 && !tx->finalized && writeq->count < writeq->max) {
        // A partly read header block belongs to stdout; stderr always reads into a packet of its own
        if (channel == MPR_CMD_STDOUT && (packet = cgi->headers) != 0) {
            if (mprGetBufSpace(packet->content) < ME_BUFSIZE && mprGrowBuf(packet->content, ME_BUFSIZE) < 0) {
                break;
            }
        } else if ((packet = httpCreateDataPacket(ME_BUFSIZE)) == 0) {
            break;
        }
        nbytes = mprReadCmd(cmd, channel, mprGetBufEnd(packet->content), ME_BUFSIZE);
        if (nbytes < 0) {
            err = mprGetError();
            if (err == EINTR) {
                continue;
            } else if (err == EAGAIN || err == EWOULDBLOCK) {
                break;
            }
            mprCloseCmdFd(cmd, channel);
            break;

        } else if (nbytes == 0) {
            mprCloseCmdFd(cmd, channel);
            if (channel == MPR_CMD_STDOUT) {
                if (!cgi->seenHeader) {
                    /*
                        RFC 3875 requires a header field and blank line; incomplete output is a failed response.
                     */
                    httpError(stream, HTTP_CODE_BAD_GATEWAY, "CGI program ended without a response header");
                    break;
                }
                checkCgiLength(cgi);
                httpFinalizeOutput(stream);
            }
            break;

        } else {
            traceData(cmd, mprGetBufEnd(packet->content), nbytes);
            mprAdjustBufEnd(packet->content, nbytes);
        }
        if (channel == MPR_CMD_STDERR) {
            /*
                Log stderr without exposing diagnostics to clients.
             */
            httpLogStream(stream, "cgi.error", "error", "msg:CGI stderr, uri:%s, details: %s",
                    stream->rx->uri, mprBufToString(packet->content));
            continue;
        }
        if (!cgi->seenHeader) {
            if (!maParseCgiResponse(stream, packet->content, "CGI", mprGetCmdFd(cgi->cmd, MPR_CMD_STDOUT) < 0,
                    &cgi->location, &cgi->declaredLength)) {
                cgi->headers = packet;
                return;
            }
            cgi->headers = 0;
            cgi->seenHeader = 1;
        }
        if (!tx->finalizedOutput && httpGetPacketLength(packet) > 0) {
            cgi->bodyBytes += httpGetPacketLength(packet);
            if (cgi->declaredLength >= 0 && cgi->bodyBytes > cgi->declaredLength) {
                /* Overrun. Do not forward bytes the framing statement does not cover */
                checkCgiLength(cgi);
                break;
            }
            /* Put the data to the CGI readq, then cgiToBrowserService will take care of it */
            httpPutPacket(q, packet);
        }
    }
}


/*
    Reconcile the Content-Length the CGI declared against the body bytes it actually produced.
    A mismatch mis-frames the response and lets CGI output be read as the head of the next one
    (request smuggling), so close the connection rather than leave it poisonable.
    Nothing to reconcile if the server has replaced the CGI response with an error document or redirect.
 */
static void checkCgiLength(Cgi *cgi)
{
    HttpStream *stream;

    stream = cgi->stream;
    if (cgi->declaredLength < 0 || cgi->bodyBytes == cgi->declaredLength) {
        return;
    }
    if (stream->error || stream->tx->finalizedOutput || cgi->location) {
        return;
    }
    httpLogStream(stream, "cgi.error", "error", "msg:CGI Content-Length mismatch, declared:%lld, sent:%lld",
            cgi->declaredLength, cgi->bodyBytes);
    httpError(stream, HTTP_CLOSE | HTTP_CODE_BAD_GATEWAY, "CGI response length mismatch");
}


/*
    Build the command arguments. NOTE: argv is untrusted input.
 */
static int buildArgs(HttpStream *stream, int *argcp, cchar ***argvp)
{
    HttpRx *rx;
    HttpTx *tx;
    cchar  *actionProgram, *cp, *fileName, *mimeType, *query;
    char   **argv, *arg, *tok;
    ssize  len;
    int    argc, argind, i, terms;

    rx = stream->rx;
    tx = stream->tx;

    fileName = tx->filename;
    assert(fileName);

    actionProgram = 0;
    argind = 0;
    argc = *argcp;

    if (tx->ext) {
        /*
            Action is keyed by MIME type, so the extension must be resolved to one first.
            mprGetMimeProgram matches on the type and its first-character guard makes a mismatch
            silent: an extension passed here never matches any entry and no interpreter is selected.
         */
        mimeType = mprLookupMime(rx->route->mimeTypes, tx->ext);
        actionProgram = mprGetMimeProgram(rx->route->mimeTypes, mimeType);
        if (actionProgram != 0) {
            argc++;
        }
    }
    /*
        Count slots for the end-of-options marker and each + separated ISINDEX term.
     */
    query = (char*) rx->parsedUri->query;
    if (query && !schr(query, '=')) {
        argc += 2;
        for (cp = query; *cp; cp++) {
            if (*cp == '+') {
                argc++;
            }
        }
    } else {
        query = 0;
    }
    len = (argc + 1) * sizeof(char*);
    argv = mprAlloc(len);
    memset(argv, 0, len);

    if (actionProgram) {
        argv[argind++] = sclone(actionProgram);
    }
    argv[argind++] = sclone(fileName);
    /*
        ISINDEX queries. Only valid if there is not a "=" in the query. If this is so, then we must not
        have these args in the query env also?
        FUTURE - should query vars be set in the env?
     */
    if (query) {
        terms = 0;
        cp = stok(sclone(query), "+", &tok);
        while (cp) {
            arg = mprUriDecode(cp);
            /*
                Reject decoded = and leading - to prevent data or options from entering ISINDEX argv.
             */
            if (schr(arg, '=')) {
                httpError(stream, HTTP_CODE_BAD_REQUEST, "Bad ISINDEX query for CGI: %s", rx->uri);
                return MPR_ERR_BAD_ARGS;
            }
            if (*arg == '-') {
                httpError(stream, HTTP_CODE_BAD_REQUEST, "ISINDEX argument may not start with '-': %s",
                    rx->uri);
                return MPR_ERR_BAD_ARGS;
            }
            if (terms++ == 0) {
                /*
                    Add the POSIX end-of-options marker before the first search term.
                 */
                argv[argind++] = sclone("--");
            }
            argv[argind++] = mprEscapeCmd(arg, 0);
            cp = stok(NULL, "+", &tok);
        }
    }
    assert(argind <= argc);
    argv[argind] = 0;
    *argcp = argind;
    *argvp = (cchar**) argv;

    mprDebug("http cgi", 5, "CGI: command:");
    for (i = 0; i < argind; i++) {
        mprDebug("http cgi", 5, "   argv[%d] = %s", i, argv[i]);
    }
    return 0;
}


#if ME_DEBUG
/*
    Trace output first part of output received from the cgi process
 */
static void traceCGIData(MprCmd *cmd, char *src, ssize size)
{
    char dest[512];
    int  index, i;

    if (mprGetLogLevel() >= 5) {
        mprDebug("http cgi", 5, "CGI: process wrote (leading %zd bytes) => \n", min((ssize) sizeof(dest), size));
        for (index = 0; index < size; ) {
            for (i = 0; i < (int) sizeof(dest) - 1 && index < size; i++) {
                dest[i] = src[index];
                index++;
            }
            dest[i] = '\0';
            mprDebug("http cgi", 5, "%s", dest);
        }
    }
}
#endif


static int copyInherited(cchar **envv, int index)
{
    cchar **name, *value;

    for (name = inheritEnv; *name; name++) {
        if ((value = getenv(*name)) != 0) {
            envv[index++] = sfmt("%s=%s", *name, value);
        }
    }
    envv[index] = 0;
    return index;
}


/*
    Emit one environment variable. Returns the number of slots consumed: zero if the variable is
    unsafe to hand to the child and was dropped.
 */
static int copyInner(HttpStream *stream, cchar **envv, int index, cchar *key, cchar *value, cchar *prefix)
{
    char *cp, *name;

    name = prefix ? sjoin(prefix, key, NULL) : sclone(key);
    for (cp = name; *cp; cp++) {
        if (*cp == '-') {
            *cp = '_';
        } else {
            *cp = toupper((uchar) * cp);
        }
    }
    /*
        Test the name the child would actually receive, after prefixing and conversion. Without this
        a client-supplied request header sets the matching HTTP_ variable in the child, HTTP_PROXY
        being the httpoxy case.
     */
    if (httpIsCgiVarBlocked(name)) {
        httpLogStream(stream, "cgi.env.filter", "detail",
                "msg:Dropped unsafe CGI environment variable, var:%s", name);
        return 0;
    }
    cp = sjoin(name, "=", value, NULL);
    if (stream->rx->route->flags & HTTP_ROUTE_ENV_ESCAPE) {
        /*
            This will escape: "&;`'\"|*?~<>^()[]{}$\\\n" and also on windows \r%
         */
        cp = mprEscapeCmd(cp, 0);
    }
    envv[index] = cp;
    return 1;
}


static int copyVars(HttpStream *stream, cchar **envv, int index, MprHash *vars, cchar *prefix)
{
    MprKey *kp;

    for (ITERATE_KEYS(vars, kp)) {
        if (!kp->data) {
            continue;
        }
        /*
            Exclude hop-by-hop headers and underscore names that alias hyphenated environment variables.
         */
        if (vars == stream->rx->headers && (httpIsHopByHopHeader(kp->key) || httpIsCgiHeaderBlocked(kp->key))) {
            continue;
        }
        index += copyInner(stream, envv, index, kp->key, kp->data, prefix);
    }
    envv[index] = 0;
    return index;
}


static int copyParams(HttpStream *stream, cchar **envv, int index, MprJson *params, cchar *prefix)
{
    MprJson *param;
    int     i;

    for (ITERATE_JSON(params, param, i)) {
        //  Workaround for large form fields that are also copied as post data
        if (slen(param->value) <= ME_MAX_RX_FORM_FIELD) {
            index += copyInner(stream, envv, index, param->name, param->value, prefix);
        }
    }
    envv[index] = 0;
    return index;
}


/*
    Loadable module initialization
 */
PUBLIC int httpCgiInit(Http *http, MprModule *module)
{
    HttpStage *handler, *connector;

    if ((handler = httpCreateHandler("cgiHandler", module)) == 0) {
        return MPR_ERR_CANT_CREATE;
    }
    http->cgiHandler = handler;
    handler->close = closeCgi;
    handler->outgoingService = cgiToBrowserService;
    handler->incoming = browserToCgiData;
    handler->open = openCgi;
    handler->start = startCgi;

    if ((connector = httpCreateStage("cgiConnector", HTTP_STAGE_CONNECTOR, module)) == 0) {
        return MPR_ERR_CANT_CREATE;
    }
    http->cgiConnector = connector;
    connector->outgoingService = browserToCgiService;
    connector->incoming = cgiToBrowserData;
    return 0;
}

#endif /* ME_COM_CGI */

/*
    Copyright (c) Embedthis Pty Ltd. All Rights Reserved.
    This software is distributed under a commercial license. Consult the LICENSE.md
    distributed with this software for full details and copyrights.
 */
