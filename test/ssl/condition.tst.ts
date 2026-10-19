/*
    condition.tst - Route conditions on client certificate fields
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
