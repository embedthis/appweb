/*
    CGI stdin closes on the end packet, after upload form fields, even if rx->eof is already set. Use a pipe to
    control service ordering.
 */

#include "testme.h"
#define ME_COM_CGI 1
/* Match the generated product build: these switches affect the Http structure layout. */
#define ME_HTTP_HTTP2 1
#define ME_HTTP_WEB_SOCKETS 1
#include "appweb.h"

#define httpCgiInit stdinEndTestCgiInit
#if defined(__GNUC__)
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wsign-conversion"
#endif
#include "../../src/modules/cgiHandler.c"
#if defined(__GNUC__)
#pragma GCC diagnostic pop
#endif

#if ME_UNIX_LIKE
#include <unistd.h>

static HttpPacket *dataPacket(cchar *data)
{
    HttpPacket *packet;

    packet = httpCreateDataPacket(slen(data));
    mprPutStringToBuf(packet->content, data);
    return packet;
}
#endif

int main(int argc, char **argv)
{
#if ME_UNIX_LIKE
    HttpNet    *net;
    HttpStream *stream;
    HttpQueue  *q, *pair;
    Cgi        *cgi;
    MprCmd     *cmd;
    char       buf[64];
    ssize      len;
    int        fds[2], rc;

    mprCreate(argc, argv, 0);
    httpCreate(HTTP_SERVER_SIDE | HTTP_CLIENT_SIDE);
    stdinEndTestCgiInit(HTTP, 0);
    net = httpCreateNet(0, 0, 1, 0);
    net->ip = sclone("127.0.0.1");
    stream = httpCreateStream(net, 0);
    httpCreateRx(stream);
    httpCreateTx(stream, 0);
    stream->tx->filename = sclone("stdin-end.cgi");
    q = httpCreateQueue(net, stream, HTTP->cgiHandler, HTTP_QUEUE_TX, 0);
    pair = httpCreateQueue(net, stream, HTTP->cgiHandler, HTTP_QUEUE_RX, 0);
    q->pair = pair;
    pair->pair = q;
    //  The collector does not scan the C stack, so objects held only in these locals must be rooted
    mprAddRoot(net);
    mprAddRoot(stream);
    mprAddRoot(q);
    mprAddRoot(pair);

    rc = openCgi(q);
    teqi(rc, 0, "CGI opens");
    cgi = q->queueData;
    cmd = mprCreateCmd(0);
    cgi->cmd = cmd;
    rc = pipe(fds);
    teqi(rc, 0, "pipe for the gateway's stdin");
    cmd->files[MPR_CMD_STDIN].fd = fds[1];

    //  The connection has read the whole body, but the upload filter has not yet emitted the form data
    stream->rx->eof = 1;
    browserToCgiService(cgi->writeq);
    ttrue(cmd->files[MPR_CMD_STDIN].fd >= 0, "stdin stays open until the end packet");

    httpPutForService(cgi->writeq, dataPacket("field=plain-value"), 0);
    httpPutForService(cgi->writeq, httpCreateEndPacket(), 0);
    browserToCgiService(cgi->writeq);
    teqi(cmd->files[MPR_CMD_STDIN].fd, -1, "stdin closes on the end packet");

    len = read(fds[0], buf, sizeof(buf) - 1);
    buf[len > 0 ? len : 0] = '\0';
    tmatch(buf, "field=plain-value", "the program reads the form data before EOF");
    len = read(fds[0], buf, sizeof(buf));
    teqi((int) len, 0, "then EOF");
    close(fds[0]);

    closeCgi(q);
    q->queueData = pair->queueData = 0;
    httpDestroyNet(net);
    mprRemoveRoot(pair);
    mprRemoveRoot(q);
    mprRemoveRoot(stream);
    mprRemoveRoot(net);
    mprDestroy();
#else
    tskip("drives the gateway's stdin through a POSIX pipe; the ordering logic is shared by all platforms");
#endif
    return 0;
}
