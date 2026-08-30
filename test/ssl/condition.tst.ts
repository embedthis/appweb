/*
    condition.tst - Route conditions on client certificate fields

    The /ssl-match route on the client-certificate endpoint carries

        Condition match ${ssl:CLIENT_S_CN} "localhost|example.com"

    so reaching it requires both a client certificate and a subject common name the condition
    accepts. This exercises the alternation-of-literals path in the native pattern matcher as well
    as the TLS variable plumbing.

    Rewritten off the Ejscript client, which has no TLS compiled in and so never ran this -- the
    previous revision reported PASS having asserted nothing. See issue 10047.
 */

import {ttrue, tget} from '@embedthis/testme'
import {get, cert} from './tls'

const CLIENT = (tget('TM_CLIENTCERT') || 'https://localhost:6443').replace('127.0.0.1', 'localhost')

//  Without a client certificate the handshake is refused before routing is reached
ttrue((await get(CLIENT + '/ssl-match/index.html', {insecure: true})).startsWith('FAIL'))

//  With a certificate whose CN the condition accepts, the route is served
ttrue(await get(CLIENT + '/ssl-match/index.html',
    {insecure: true, clientCert: cert('test.crt'), key: cert('test.key')}) == '200')

//  The same certificate reaches an unconditioned path on the same endpoint
ttrue(await get(CLIENT + '/index.html',
    {insecure: true, clientCert: cert('test.crt'), key: cert('test.key')}) == '200')
