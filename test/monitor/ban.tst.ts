/*
    ban.tst - Monitor and ban defense tests

    Tests the server's defense monitoring and automatic client banning feature.
    Simulates a denial-of-service attempt by making many rapid requests to trigger
    the ban threshold, then validates that the client is temporarily banned and
    later unbanned after the timeout period. Only runs at test depth 5+.
 */

import {tdepth, tget, tskip, ttrue} from '@embedthis/testme'
import net from 'node:net'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
const target = HTTP.replace(/^https?:\/\//, '')
const [HOST, port] = target.split(':')
const PORT = parseInt(port || '80')

async function request(uri: string): Promise<string> {
    return await new Promise((resolvePromise) => {
        let socket = net.connect(PORT, HOST)
        let response = ''
        let timer = setTimeout(() => {
            socket.destroy()
            resolvePromise(response)
        }, 2000)

        socket.on('connect', () => {
            socket.write(`GET ${uri} HTTP/1.1\r\nHost: ${target}\r\nConnection: close\r\n\r\n`)
        })
        socket.on('data', chunk => {
            response += chunk.toString()
        })
        socket.on('close', () => {
            clearTimeout(timer)
            resolvePromise(response)
        })
        socket.on('error', () => {
            clearTimeout(timer)
            resolvePromise(response)
        })
    })
}

function isBanned(response: string): boolean {
    return response == '' || response.includes('406 Not Acceptable')
}

function validateBan(response: string) {
    ttrue(isBanned(response))
    if (response.includes('406 Not Acceptable')) {
        ttrue(response.includes("Client temporarily banned due to monitored limit exceeded"))
    }
}

if (tdepth() >= 5) {

    // Trigger the ban with > 190 requests to 404 pages in 5 sec period
    for (let i = 0; i < 200; i++) {
        let response = await request("/unknown.html")
        ttrue(response.includes('404 Not Found'))
    }

    // Wait for the monitor timer to apply the ban.
    let banned = false
    let response = ''
    for (let i = 0; i < 10; i++) {
        response = await request("/index.html")
        if (isBanned(response)) {
            validateBan(response)
            banned = true
            break
        }
        ttrue(response.includes('200 OK'))
        await Bun.sleep(1000)
    }
    ttrue(banned)

    // Verify client is banned
    validateBan(response)

    // Verify that even valid URIs are now rejected
    response = await request("/index.html")
    validateBan(response)

    // Wait for the ban to be lifted (should be 0-5 secs)
    let unbanned = false
    for (let i = 0; i < 10; i++) {
        response = await request("/index.html")
        if (isBanned(response)) {
            validateBan(response)
            await Bun.sleep(1000)
            continue
        }
        ttrue(response.includes('200 OK'))
        unbanned = true
        break
    }
    ttrue(unbanned)
    ttrue(response.includes('200 OK'))

    // Verify that valid URIs now work after ban is lifted
    response = await request("/index.html")
    ttrue(response.includes('200 OK'))

} else {
    tskip("runs at depth 5")
}
