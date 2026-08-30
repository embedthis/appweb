/*
    Test certificate revocation for mutually authenticated TLS

    A revocation list has no effect on OpenSSL unless revocation checking is explicitly enabled, so a
    server can load one and still admit every certificate on it. This test drives each revocation
    state against the same two client certificates and asserts the server's decision.

    The PKI and the endpoints serving it are built by test/utils/make-pki.sh:

        root                    Trust anchor, and the only authority the endpoints trust
        +-- int                 Intermediate authority
        |   +-- client-int      Client certificate issued by the intermediate
        +-- client-root         Client certificate issued directly by the root

    Each endpoint requires a client certificate and differs only in which revocation list it serves.
 */

import {tget, tskip, ttrue} from '@embedthis/testme'
import {Cmd, Config, Path} from '@embedthis/ejscript'

/*
    Tests run with the working directory of the test file, so locate the test directory from this
    file rather than from the working directory. The probe resolves its own certificate arguments
    against the test directory.
 */
let testDir = new Path(import.meta.dir).dirname

/*
    Attempt a request with a client certificate and return "ACCEPT", "REJECT[reason]" or "ABSENT"
 */
async function probe(port: string, client: string, chain: string = ''): Promise<string> {
    let cmd = testDir.join('utils/tls-probe.sh') + ' ' + port +
              ' pki/' + client + '.crt pki/' + client + '.key'
    if (chain) {
        cmd += ' pki/' + chain + '.crt'
    }
    return (await Cmd.sh(cmd)).trim()
}

/*
    A client issued by the intermediate must supply it -- the endpoints trust only the root
 */
function asRoot(port: string): Promise<string> {
    return probe(port, 'client-root')
}

function asInt(port: string): Promise<string> {
    return probe(port, 'client-int', 'int')
}

let none = tget('TM_CRLNONE') || '8443'

if (Config.OS == 'windows') {
    tskip('requires a POSIX shell')

} else if (!testDir.join('pki/.generated').exists) {
    tskip('revocation test PKI not generated -- see test/utils/make-pki.sh')

} else if (await asRoot(none) == 'ABSENT') {
    /*
        The endpoints come from a configuration guarded by <if SSL_MODULE>, so their absence means
        this build has no SSL. Probed rather than read from a build setting, because the setting is
        not visible to the test environment.
     */
    tskip('ssl not enabled')

} else {
    /*
        No revocation list. Both clients are valid and must be served, which fixes the baseline the
        remaining cases are measured against.
     */
    ttrue(await asRoot(none) == 'ACCEPT')
    ttrue(await asInt(none) == 'ACCEPT')

    /*
        A revocation list with nothing on it. Enabling the check must not reject valid certificates,
        and checking the whole chain must not reject a chain whose authorities are all in good standing.
     */
    let empty = tget('TM_CRLEMPTY') || '8444'
    ttrue(await asRoot(empty) == 'ACCEPT')
    ttrue(await asInt(empty) == 'ACCEPT')

    /*
        client-root revoked. This is the case that regressed: the list was loaded and ignored, so the
        revoked certificate was served. The other client is unaffected.
     */
    let leaf = tget('TM_CRLLEAF') || '8445'
    ttrue(await asRoot(leaf) == 'REJECT[certificate revoked]')
    ttrue(await asInt(leaf) == 'ACCEPT')

    /*
        The intermediate authority revoked. Neither client certificate is itself on the list, so only a
        check that walks the chain rejects the one issued under that authority.
     */
    let chain = tget('TM_CRLCHAIN') || '8446'
    ttrue(await asRoot(chain) == 'ACCEPT')
    ttrue(await asInt(chain) == 'REJECT[certificate revoked]')

    /*
        An expired revocation list. Revocation status is unknown, so both clients are refused rather
        than admitted unchecked.
     */
    let expired = tget('TM_CRLEXPIRED') || '8447'
    ttrue(await asRoot(expired) == 'REJECT[certificate expired]')
    ttrue(await asInt(expired) == 'REJECT[certificate expired]')

    /*
        The same list as the chain case, with SSLCARevocationCheck set to leaf. The client issued under
        the revoked authority is now admitted -- what the opt-out costs, pinned so it stays deliberate.
     */
    let leafOnly = tget('TM_CRLLEAFONLY') || '8448'
    ttrue(await asRoot(leafOnly) == 'ACCEPT')
    ttrue(await asInt(leafOnly) == 'ACCEPT')
}
