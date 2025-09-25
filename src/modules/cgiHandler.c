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
    char *location;                     /**< Redirection location */
    int seenHeader;                     /**< Parsed response header from CGI */
} Cgi;

/*********************************** Forwards *********************************/

static void browserToCgiService(HttpQueue *q);
static void buildArgs(HttpStream *stream, int *argcp, cchar ***argvp);
static void cgiCallback(MprCmd *cmd, int channel, void *data);
static void cgiToBrowserData(HttpQueue *q, HttpPacket *packet);
static void copyInner(HttpStream *stream, cchar **envv, int index, cchar *key, cchar *value, cchar *prefix);
static int copyParams(HttpStream *stream, cchar **envv, int index, MprJson *params, cchar *prefix);
static int copyVars(HttpStream *stream, cchar **envv, int index, MprHash *vars, cchar *prefix);
static char *getCgiToken(MprBuf *buf, cchar *delim);
static void manageCgi(Cgi *cgi, int flags);
static bool parseFirstCgiResponse(Cgi *cgi, HttpPacket *packet);
static bool parseCgiHeaders(Cgi *cgi, HttpPacket *packet);
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
        httpLog(stream->trace, "cgi.limit.error", "error",
                "msg=\"Too many concurrent processes\", activeProcesses=%d, maxProcesses=%d",
                nproc - 1, stream->limits->processMax);
        httpError(stream, HTTP_CODE_SERVICE_UNAVAILABLE, "Server overloaded");
        return MPR_ERR_CANT_OPEN;
    }
    if ((cgi = mprAllocObj(Cgi, manageCgi)) == 0) {
        /* Normal mem handler recovery */
        return MPR_ERR_MEMORY;
    }
    httpTrimExtraPath(stream);
    httpMapFile(stream);
    q->queueData = q->pair->queueData = cgi;
    cgi->stream = stream;
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
    buildArgs(stream, &argc, &argv);
    fileName = argv[0];
    baseName = mprGetPathBase(fileName);

    /*
        nph prefix means non-parsed-header. Don't parse the CGI output for a CGI header
     */
    if (strncmp(baseName, "nph-", 4) == 0 ||
        (strlen(baseName) > 4 && strcmp(&baseName[strlen(baseName) - 4], "-nph") == 0)) {
        /* Pretend we've seen the header for Non-parsed Header CGI programs */
        cgi->seenHeader = 1;
        tx->flags |= HTTP_TX_USE_OWN_HEADERS;
    }
    /*
        Build environment variables
     */
    httpCreateCGIParams(stream);
    varCount = mprGetHashLength(rx->headers) + mprGetHashLength(rx->svars) + mprGetJsonLength(rx->params);
    if ((envv = mprAlloc((varCount + 1) * sizeof(char*))) != 0) {
        //  OPTIONAL
        count = copyParams(stream, envv, 0, rx->params, route->envPrefix);
        count = copyVars(stream, envv, count, rx->svars, "");
        count = copyVars(stream, envv, count, rx->headers, "HTTP_");
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
    if (mprStartCmd(cmd, argc, argv, envv, MPR_CMD_IN | MPR_CMD_OUT | MPR_CMD_ERR) < 0) {
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
        if ((buf = packet->content) == 0) {
            /* End packet */
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
                httpLog(stream->trace, "cgi.error", "error", "msg=\"Cannot write to CGI gateway\", errno=%d",
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
        } else if (stream->rx->eof) {
            mprCloseCmdFd(cmd, MPR_CMD_STDIN);
        } else {
            mprDisableCmdEvents(cmd, MPR_CMD_STDIN);
        }
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
        httpRedirect(stream, HTTP_CODE_MOVED_TEMPORARILY, cgi->location);
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
        if ((packet = cgi->headers) != 0) {
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
                httpFinalizeOutput(stream);
            }
            break;

        } else {
            traceData(cmd, mprGetBufEnd(packet->content), nbytes);
            mprAdjustBufEnd(packet->content, nbytes);
        }
        if (channel == MPR_CMD_STDERR) {
            httpLog(stream->trace, "cgi.error", "error", "msg:CGI failed, uri:%s, details: %s",
                    stream->rx->uri, mprBufToString(packet->content));
            httpSetContentType(stream, "text/plain");
            httpSetStatus(stream, HTTP_CODE_SERVICE_UNAVAILABLE);
            cgi->seenHeader = 1;
        }
        if (!cgi->seenHeader) {
            if (!parseCgiHeaders(cgi, packet)) {
                cgi->headers = packet;
                return;
            }
            cgi->headers = 0;
            cgi->seenHeader = 1;
        }
        if (!tx->finalizedOutput && httpGetPacketLength(packet) > 0) {
            /* Put the data to the CGI readq, then cgiToBrowserService will take care of it */
            httpPutPacket(q, packet);
        }
    }
}


/*
    Parse the CGI output headers. Sample CGI program output:
        Content-type: text/html

        <html.....
 */
static bool parseCgiHeaders(Cgi *cgi, HttpPacket *packet)
{
    HttpStream *stream;
    MprBuf     *buf;
    char       *endHeaders, *headers, *key, *value;
    ssize      blen;
    int        len;

    stream = cgi->stream;
    value = 0;
    buf = packet->content;
    headers = mprGetBufStart(buf);
    blen = mprGetBufLength(buf);

    /*
        Split the headers from the body. Add null to ensure we can search for line terminators.
     */
    len = 0;
    if ((endHeaders = sncontains(headers, "\r\n\r\n", blen)) == NULL) {
        if ((endHeaders = sncontains(headers, "\n\n", blen)) == NULL) {
            if (mprGetCmdFd(cgi->cmd, MPR_CMD_STDOUT) >= 0 && strlen(headers) < ME_MAX_HEADERS) {
                /* Not EOF and less than max headers and have not yet seen an end of headers delimiter */
                return 0;
            }
        }
        len = 2;
    } else {
        len = 4;
    }
    if (endHeaders) {
        if (endHeaders > buf->end) {
            assert(endHeaders <= buf->end);
            return 0;
        }
    }
    if (endHeaders) {
        endHeaders[len - 1] = '\0';
        endHeaders += len;
    }
    /*
        Want to be tolerant of CGI programs that omit the status line.
     */
    if (strncmp((char*) buf->start, "HTTP/1.", 7) == 0) {
        if (!parseFirstCgiResponse(cgi, packet)) {
            /* httpError already called */
            return 0;
        }
    }
    if (endHeaders && strchr(mprGetBufStart(buf), ':')) {
        while (mprGetBufLength(buf) > 0 && buf->start[0] && (buf->start[0] != '\r' && buf->start[0] != '\n')) {
            if ((key = getCgiToken(buf, ":")) == 0) {
                key = "Bad Header";
            }
            value = getCgiToken(buf, "\n");
            while (isspace((uchar) * value)) {
                value++;
            }
            len = (int) strlen(value);
            while (len > 0 && (value[len - 1] == '\r' || value[len - 1] == '\n')) {
                value[len - 1] = '\0';
                len--;
            }
            if (scaselesscmp(key, "location") == 0) {
                cgi->location = value;

            } else if (scaselesscmp(key, "status") == 0) {
                httpSetStatus(stream, atoi(value));

            } else if (scaselesscmp(key, "content-type") == 0) {
                if (stream->tx->charSet && !scaselesscontains(value, "charset")) {
                    httpSetHeader(stream, "Content-Type", "%s; charset=%s", value, stream->tx->charSet);
                } else {
                    httpSetHeaderString(stream, "Content-Type", value);
                }

            } else if (scaselesscmp(key, "content-length") == 0) {
                httpSetContentLength(stream, (MprOff) stoi(value));
                httpSetChunkSize(stream, 0);

            } else {
                /*
                    Now pass all other headers back to the client
                 */
                key = ssplit(key, ":\r\n\t ", NULL);
                httpSetHeaderString(stream, key, value);
            }
        }
        buf->start = endHeaders;
    }
    return 1;
}


/*
    Parse the CGI output first line
 */
static bool parseFirstCgiResponse(Cgi *cgi, HttpPacket *packet)
{
    MprBuf *buf;
    char   *protocol, *status, *msg;

    buf = packet->content;
    protocol = getCgiToken(buf, " ");
    if (protocol == 0 || protocol[0] == '\0') {
        httpError(cgi->stream, HTTP_CODE_BAD_GATEWAY, "Bad CGI HTTP protocol response");
        return 0;
    }
    if (strncmp(protocol, "HTTP/1.", 7) != 0) {
        httpError(cgi->stream, HTTP_CODE_BAD_GATEWAY, "Unsupported CGI protocol");
        return 0;
    }
    status = getCgiToken(buf, " ");
    if (status == 0 || *status == '\0') {
        httpError(cgi->stream, HTTP_CODE_BAD_GATEWAY, "Bad CGI header response");
        return 0;
    }
    msg = getCgiToken(buf, "\n");
    mprNop(msg);
    mprDebug("http cgi", 4, "CGI response status: %s %s %s", protocol, status, msg);
    return 1;
}


/*
    Build the command arguments. NOTE: argv is untrusted input.
 */
static void buildArgs(HttpStream *stream, int *argcp, cchar ***argvp)
{
    HttpRx *rx;
    HttpTx *tx;
    cchar  *actionProgram, *cp, *fileName, *query;
    char   **argv, *tok;
    ssize  len;
    int    argc, argind, i;

    rx = stream->rx;
    tx = stream->tx;

    fileName = tx->filename;
    assert(fileName);

    actionProgram = 0;
    argind = 0;
    argc = *argcp;

    if (tx->ext) {
        actionProgram = mprGetMimeProgram(rx->route->mimeTypes, tx->ext);
        if (actionProgram != 0) {
            argc++;
        }
        /*
            This is an Apache compatible hack for PHP 5.3
         */
        mprAddKey(rx->headers, "REDIRECT_STATUS", itos(HTTP_CODE_MOVED_TEMPORARILY));
    }
    /*
        Count the args for ISINDEX queries. Only valid if there is not a "=" in the query.
        If this is so, then we must not have these args in the query env also?
     */
    query = (char*) rx->parsedUri->query;
    if (query && !schr(query, '=')) {
        argc++;
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
        cp = stok(sclone(query), "+", &tok);
        while (cp) {
            argv[argind++] = mprEscapeCmd(mprUriDecode(cp), 0);
            cp = stok(NULL, "+", &tok);
        }
    }
    assert(argind <= argc);
    argv[argind] = 0;
    *argcp = argc;
    *argvp = (cchar**) argv;

    mprDebug("http cgi", 5, "CGI: command:");
    for (i = 0; i < argind; i++) {
        mprDebug("http cgi", 5, "   argv[%d] = %s", i, argv[i]);
    }
}


/*
    Get the next input token. The content buffer is advanced to the next token. This routine always returns a
    non-zero token. The empty string means the delimiter was not found.
 */
static char *getCgiToken(MprBuf *buf, cchar *delim)
{
    char  *token, *nextToken;
    ssize len;

    len = mprGetBufLength(buf);
    if (len == 0) {
        return "";
    }
    token = mprGetBufStart(buf);
    nextToken = sncontains(mprGetBufStart(buf), delim, len);
    if (nextToken) {
        *nextToken = '\0';
        len = (int) strlen(delim);
        nextToken += len;
        buf->start = nextToken;

    } else {
        buf->start = mprGetBufEnd(buf);
    }
    return token;
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
        mprDebug("http cgi", 5, "CGI: process wrote (leading %zd bytes) => \n", min(sizeof(dest), size));
        for (index = 0; index < size; ) {
            for (i = 0; i < (sizeof(dest) - 1) && index < size; i++) {
                dest[i] = src[index];
                index++;
            }
            dest[i] = '\0';
            mprDebug("http cgi", 5, "%s", dest);
        }
    }
}
#endif


static void copyInner(HttpStream *stream, cchar **envv, int index, cchar *key, cchar *value, cchar *prefix)
{
    char *cp;

    if (prefix) {
        cp = sjoin(prefix, key, "=", value, NULL);
    } else {
        cp = sjoin(key, "=", value, NULL);
    }
    if (stream->rx->route->flags & HTTP_ROUTE_ENV_ESCAPE) {
        /*
            This will escape: "&;`'\"|*?~<>^()[]{}$\\\n" and also on windows \r%
         */
        cp = mprEscapeCmd(cp, 0);
    }
    envv[index] = cp;
    for (; *cp != '='; cp++) {
        if (*cp == '-') {
            *cp = '_';
        } else {
            *cp = toupper((uchar) * cp);
        }
    }
}


static int copyVars(HttpStream *stream, cchar **envv, int index, MprHash *vars, cchar *prefix)
{
    MprKey *kp;

    for (ITERATE_KEYS(vars, kp)) {
        if (kp->data) {
            copyInner(stream, envv, index++, kp->key, kp->data, prefix);
        }
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
            copyInner(stream, envv, index++, param->name, param->value, prefix);
        }
    }
    envv[index] = 0;
    return index;
}


static int cgiEscapeDirective(MaState *state, cchar *key, cchar *value)
{
    bool on;

    if (!maTokenize(state, value, "%B", &on)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    httpSetRouteEnvEscape(state->route, on);
    return 0;
}


static int cgiPrefixDirective(MaState *state, cchar *key, cchar *value)
{
    cchar *prefix;

    if (!maTokenize(state, value, "%S", &prefix)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    httpSetRouteEnvPrefix(state->route, prefix);
    return 0;
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

    /*
        Add configuration file directives
     */
    maAddDirective("CgiEscape", cgiEscapeDirective);
    maAddDirective("CgiPrefix", cgiPrefixDirective);
    return 0;
}

#endif /* ME_COM_CGI */

/*
    Copyright (c) Embedthis Software. All Rights Reserved.
    This software is distributed under a commercial license. Consult the LICENSE.md
    distributed with this software for full details and copyrights.
 */
