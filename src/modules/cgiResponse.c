/*
    cgiResponse.c - Parse CGI and FastCGI response headers

    Copyright (c) All Rights Reserved. See copyright notice at the bottom of the file.
 */

/*********************************** Includes *********************************/

#include    "appweb.h"

#if ME_COM_CGI || (ME_COM_FAST && ME_UNIX_LIKE)

/********************************** Forwards **********************************/

static char *getToken(MprBuf *buf, cchar *delim);
static bool parseStatusLine(HttpStream *stream, MprBuf *buf, cchar *label);
static bool startsWithHeader(cchar *start, cchar *end);

/************************************* Code ***********************************/

PUBLIC bool maParseCgiResponse(HttpStream *stream, MprBuf *buf, cchar *label, bool eof, cchar **location,
    MprOff *declaredLength)
{
    char    *endHeaders, *headers, *key, *value;
    int64   length;
    ssize   blen, len;
    int     status;
    bool    hasHeaders, hasStatusLine;

    //  The parser uses string functions, and the buffer may hold padding or the next record past its end
    mprAddNullToBuf(buf);
    headers = mprGetBufStart(buf);
    blen = mprGetBufLength(buf);

    if ((endHeaders = sncontains(headers, "\r\n\r\n", blen)) == NULL) {
        if ((endHeaders = sncontains(headers, "\n\n", blen)) == NULL) {
            if (!eof && blen < ME_MAX_HEADERS) {

                return 0;
            }
        }
        len = 2;
    } else {
        len = 4;
    }
    /*
        Detect body-only output before changing the buffer.
     */
    hasStatusLine = strncmp((char*) buf->start, "HTTP/1.", 7) == 0;
    hasHeaders = endHeaders && startsWithHeader(buf->start, endHeaders);
    if (!hasStatusLine && !hasHeaders) {
        return 1;
    }

    if (endHeaders) {
        endHeaders[len - 1] = '\0';
        endHeaders += len;
    }
    if (hasStatusLine && !parseStatusLine(stream, buf, label)) {
        return 0;
    }
    if (endHeaders) {
        while (mprGetBufLength(buf) > 0 && buf->start[0] && (buf->start[0] != '\r' && buf->start[0] != '\n')) {
            //  The name must be a token: whitespace before the colon is forbidden (RFC 9112 5.1)
            key = getToken(buf, ":");
            if (!httpIsToken(key)) {
                httpError(stream, HTTP_CODE_BAD_GATEWAY, "Bad %s response header name", label);
                return 0;
            }
            value = getToken(buf, "\n");
            while (isspace((uchar) * value)) {
                value++;
            }
            len = (int) strlen(value);
            while (len > 0 && (value[len - 1] == '\r' || value[len - 1] == '\n')) {
                value[len - 1] = '\0';
                len--;
            }
            /*
                Reject embedded CR/LF to prevent response splitting.
             */
            if (schr(value, '\r') || schr(value, '\n')) {
                httpError(stream, HTTP_CODE_BAD_GATEWAY, "%s response header contains a control character", label);
                return 0;
            }
            httpLogStream(stream, "rx.gateway", "detail", "msg:%s response header, key:%s, value:%s", label, key,
                httpIsRedactedHeader(key) ? "[redacted]" : value);

            if (scaselesscmp(key, "location") == 0) {
                if (location) {
                    *location = value;
                } else {
                    httpRedirectUri(stream, HTTP_CODE_MOVED_TEMPORARILY, value);
                }

            } else if (scaselesscmp(key, "status") == 0) {
                /*
                    Relay only final statuses because the program may write a body.
                 */
                if ((status = httpParseStatus(value)) < HTTP_CODE_OK) {
                    httpError(stream, HTTP_CODE_BAD_GATEWAY, "Bad %s status: %s", label, value);
                    return 0;
                }
                httpSetStatus(stream, status);

            } else if (scaselesscmp(key, "content-type") == 0) {
                if (stream->tx->charSet && !scaselesscontains(value, "charset")) {
                    httpSetHeader(stream, "Content-Type", "%s; charset=%s", value, stream->tx->charSet);
                } else {
                    httpSetHeaderString(stream, "Content-Type", value);
                }

            } else if (scaselesscmp(key, "transfer-encoding") == 0) {
                //  A message must not carry both Content-Length and Transfer-Encoding
                httpError(stream, HTTP_CODE_BAD_GATEWAY, "%s response declares an unsupported Transfer-Encoding",
                    label);
                return 0;

            } else if (scaselesscmp(key, "content-length") == 0) {
                if (httpParseDigits(value, &length) < 0) {
                    httpError(stream, HTTP_CODE_BAD_GATEWAY, "Bad %s Content-Length: %s", label, value);
                    return 0;
                }
                *declaredLength = (MprOff) length;
                httpSetContentLength(stream, *declaredLength);
                httpSetChunkSize(stream, 0);

            } else {
                httpSetHeaderString(stream, key, value);
            }
        }
        buf->start = endHeaders;
    }
    return 1;
}


/*
    Parse the status line: "HTTP/1.x CODE [REASON]"
 */
static bool parseStatusLine(HttpStream *stream, MprBuf *buf, cchar *label)
{
    char    *protocol, *status;
    int     code;

    protocol = getToken(buf, " ");
    if (protocol == 0 || protocol[0] == '\0') {
        httpError(stream, HTTP_CODE_BAD_GATEWAY, "Bad %s HTTP protocol response", label);
        return 0;
    }
    if (strncmp(protocol, "HTTP/1.", 7) != 0) {
        httpError(stream, HTTP_CODE_BAD_GATEWAY, "Unsupported %s protocol", label);
        return 0;
    }
    //  The rest of the line is the status code and optional reason phrase, as in a Status header
    status = strim(getToken(buf, "\n"), "\r", MPR_TRIM_END);
    if ((code = httpParseStatus(status)) < HTTP_CODE_OK) {
        httpError(stream, HTTP_CODE_BAD_GATEWAY, "Bad %s status: %s", label, status);
        return 0;
    }
    httpSetStatus(stream, code);
    return 1;
}


/*
    Test if output begins with a header field: a token name then a colon on the first line
 */
static bool startsWithHeader(cchar *start, cchar *end)
{
    cchar *colon;

    if ((colon = memchr(start, ':', end - start)) == 0 || memchr(start, '\n', colon - start)) {
        return 0;
    }
    return httpIsToken(snclone(start, colon - start));
}


/*
    Advance past the delimiter. Return an empty string if it is absent.
 */
static char *getToken(MprBuf *buf, cchar *delim)
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

#endif /* ME_COM_CGI || ME_COM_FAST */

/*
    Copyright (c) Embedthis Pty Ltd. All Rights Reserved.
    This software is distributed under a commercial license. Consult the LICENSE.md
    distributed with this software for full details and copyrights.
 */
