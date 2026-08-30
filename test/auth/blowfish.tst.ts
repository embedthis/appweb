/*
    blowfish.tst - Blowfish cipher authentication tests

    Tests HTTP authentication using Blowfish-encrypted passwords stored in the password file.
    Verifies that the server can correctly authenticate users whose passwords are encrypted
    with the Blowfish cipher algorithm.
 */

import {ttrue, tget} from '@embedthis/testme'
import {Http} from '@embedthis/ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
const LONG = HTTP + "/auth/blowfish-long/"

let http: Http = new Http

// Test authentication with Blowfish-encrypted password
http.setCredentials("ralph", "pass5")
http.get(HTTP + "/auth/blowfish/ralph.html")
await http.finalize()
ttrue(http.status == 200)
ttrue(http.response.contains('Welcome to Blowfish Basic - Access for ralph'))

async function basicStatus(user: string, password: string): Promise<number> {
    let encoded = Buffer.from(`${user}:${password}`).toString('base64')
    let response = await fetch(LONG, {headers: {Authorization: `Basic ${encoded}`}})
    return response.status
}

/*
    Legacy BF1 hashes whose username+realm fills the Blowfish key window are not real
    credentials: the stored hash never depended on the password. They must fail closed, while BF2
    remains usable under the same long realm.
 */
ttrue(await basicStatus("administrator", "wrong") == 401)
ttrue(await basicStatus("administrator", "") == 401)
ttrue(await basicStatus("administrator", "s3cret") == 401)
ttrue(await basicStatus("bf2admin", "wrong") == 401)
ttrue(await basicStatus("bf2admin", "s3cret") == 200)

http.close()
