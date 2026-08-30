/*
    ssl.tst - Mutual TLS authentication

    The endpoint verifies the server certificate against the CA and requires a client certificate.
    Both directions are asserted, including the refusal when the client presents none -- see the
    note in cert.tst.ts about why the negative case carries the weight.
 */

import {ttrue, tget} from '@embedthis/testme'
import {get, cert} from './tls'

const CA = cert('ca.crt')
const ENDPOINT = (tget('TM_TESTCERT') || 'https://localhost:7443').replace('127.0.0.1', 'localhost')

//  Server verified against the CA, client certificate presented
ttrue(await get(ENDPOINT + '/index.html',
    {ca: CA, clientCert: cert('test.crt'), key: cert('test.key')}) == '200')

//  The same request without a client certificate is refused
ttrue((await get(ENDPOINT + '/index.html', {ca: CA})).startsWith('FAIL'))
