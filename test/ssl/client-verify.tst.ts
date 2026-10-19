/*
    client-verify.tst.ts - The shipped http client verifies the server certificate unless told not to
 */

import {ttrue} from '@embedthis/testme'
import {resolve} from 'node:path'

const ROOT = resolve(import.meta.dir, '../..')
const CLIENT = resolve(ROOT, 'build/bin', process.platform == 'win32' ? 'http.exe' : 'http')
const CA = resolve(ROOT, 'certs/ca.crt')

//  The suite's listeners: 4443 has a certificate for localhost signed by the test CA; 5443 is self-signed
const SIGNED = 'https://localhost:4443/index.html'
const SELF = 'https://127.0.0.1:5443/index.html'

function fetches(...args: string[]): boolean {
    let proc = Bun.spawnSync([CLIENT, '--zero', ...args], {stdout: 'pipe', stderr: 'pipe'})
    return proc.exitCode == 0
}

ttrue(!fetches(SELF), 'a self-signed server certificate was accepted with no flags')
ttrue(!fetches(SIGNED), 'a certificate from an unknown CA was accepted with no flags')
ttrue(!fetches('--verify', SELF), 'a self-signed server certificate was accepted with --verify')
ttrue(fetches('--ca', CA, SIGNED), 'a certificate signed by the CA named with --ca was refused')
ttrue(fetches('--noverify', SELF), '--noverify did not accept a self-signed certificate')
