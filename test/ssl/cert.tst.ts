/*
    cert.tst - Server certificate verification, SNI selection and client certificates

    Verifies:
    - a CA-issued server certificate validates against its CA
    - verification actually rejects: the same endpoint fails against an unrelated CA, and the
      self-signed virtual host fails against the real CA
    - SNI selects between two virtual hosts sharing one port, each with a different certificate
    - a client certificate is required where the endpoint demands one

    The negative cases are the point. The previous revision of this file asserted only that four
    endpoints returned 200, which a server that skipped verification entirely would also satisfy --
    and it never ran at all, because it gated on the Ejscript client having TLS compiled in. See
    issue 10047.
 */

import {ttrue, tget} from '@embedthis/testme'
import {get, cert} from './tls'

const CA = cert('ca.crt')
const HTTPS = tget('TM_HTTPS') || 'https://localhost:4443'
const SELF = tget('TM_SELFCERT') || 'https://localhost:5443'

//  A CA-issued certificate validates against its own CA
ttrue(await get(HTTPS + '/index.html', {ca: CA}) == '200')

//  ... and the same endpoint is reachable without verification
ttrue(await get(HTTPS + '/index.html', {insecure: true}) == '200')

/*
    Verification rejects. certs/self.crt is a self-signed certificate and never issued the server's,
    so validating against it must fail -- curl reports 60 for a certificate that does not verify.
    Without this assertion the two above cannot tell a working verifier from an absent one.
 */
ttrue((await get(HTTPS + '/index.html', {ca: cert('self.crt')})).startsWith('FAIL'))

/*
    Two virtual hosts share port 5443: ServerName localhost carries the CA-issued certificate and
    ServerName 127.0.0.1 carries the self-signed one. curl sends SNI for a host name and none for an
    IP literal, so the name selects the CA-issued host and the literal falls to the self-signed one.
 */
ttrue(await get(SELF.replace('127.0.0.1', 'localhost') + '/index.html', {ca: CA}) == '200')

//  The self-signed host is served, but does not validate against the real CA
const selfHost = SELF.replace('localhost', '127.0.0.1')
ttrue(await get(selfHost + '/index.html', {insecure: true}) == '200')
ttrue((await get(selfHost + '/index.html', {ca: CA})).startsWith('FAIL'))

//  An endpoint requiring a client certificate refuses a request without one, and serves one with it
const CLIENT = tget('TM_CLIENTCERT') || 'https://localhost:6443'
ttrue((await get(CLIENT + '/index.html', {insecure: true})).startsWith('FAIL'))
ttrue(await get(CLIENT + '/index.html',
    {insecure: true, clientCert: cert('test.crt'), key: cert('test.key')}) == '200')
