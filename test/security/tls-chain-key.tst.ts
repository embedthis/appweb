/*
    tls-chain-key.tst.ts - The OpenSSL backend sends a certificate's chain and loads EC keys
 */

import {teq, tskip} from '@embedthis/testme'
import {execSync} from 'node:child_process'
import {existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {BIN, TESTDIR, withServer} from './server'
import {get} from '../ssl/tls'

const PORT = 4575
const SECURE = 4576
const PKI = resolve(TESTDIR, 'tmp/tls-chain-pki')
const CERTS = resolve(TESTDIR, '../certs')

function openssl(args: string): void {
    execSync(`openssl ${args}`, {cwd: PKI, stdio: 'ignore'})
}

function makeChain(): void {
    rmSync(PKI, {recursive: true, force: true})
    mkdirSync(PKI, {recursive: true})
    writeFileSync(resolve(PKI, 'ca.ext'), 'basicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\n')
    writeFileSync(resolve(PKI, 'leaf.ext'), 'basicConstraints=CA:FALSE\nsubjectAltName=DNS:localhost,IP:127.0.0.1\n')
    openssl('req -x509 -newkey rsa:2048 -nodes -keyout root.key -out root.crt -days 2 -subj /CN=Chain-Root ' +
            '-addext basicConstraints=critical,CA:TRUE -addext keyUsage=critical,keyCertSign,cRLSign')
    openssl('req -newkey rsa:2048 -nodes -keyout int.key -out int.csr -subj /CN=Chain-Intermediate')
    openssl('x509 -req -in int.csr -CA root.crt -CAkey root.key -CAcreateserial -out int.crt -days 2 -extfile ca.ext')
    openssl('req -newkey rsa:2048 -nodes -keyout leaf.key -out leaf.csr -subj /CN=localhost')
    openssl('x509 -req -in leaf.csr -CA int.crt -CAkey int.key -CAcreateserial -out leaf.crt -days 2 ' +
            '-extfile leaf.ext')
    writeFileSync(resolve(PKI, 'chain.crt'),
        readFileSync(resolve(PKI, 'leaf.crt'), 'utf8') + readFileSync(resolve(PKI, 'int.crt'), 'utf8'))
}

function secure(cert: string, key: string): string[] {
    return [`ListenSecure 127.0.0.1:${SECURE}`, `SSLCertificateFile ${cert}`, `SSLCertificateKeyFile ${key}`]
}

if (!existsSync(BIN)) {
    tskip(`Skip test -- appweb is not built at ${BIN}`)
} else if (process.platform == 'win32') {
    tskip('Skip test -- builds its PKI with a POSIX openssl command line')
} else {
    makeChain()
    try {
        await withServer('tls-chain', PORT, secure(resolve(PKI, 'chain.crt'), resolve(PKI, 'leaf.key')), async () => {
            teq(await get(`https://127.0.0.1:${SECURE}/index.html`, {ca: resolve(PKI, 'root.crt')}), '200')
        })
        await withServer('tls-ec-key', PORT, secure(resolve(CERTS, 'ec.crt'), resolve(CERTS, 'ec.key')), async () => {
            teq(await get(`https://127.0.0.1:${SECURE}/index.html`, {insecure: true}), '200')
        })
    } finally {
        rmSync(PKI, {recursive: true, force: true})
    }
}
