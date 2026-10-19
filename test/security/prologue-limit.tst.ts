/*
    prologue-limit.tst.ts - Empty lines before a request line are bounded
 */

import {ttrue} from '@embedthis/testme'
import net from 'node:net'
import {HTTP} from './raw'

const PORT = HTTP.port || 4100
const GET = 'GET /index.html HTTP/1.1\r\nHost: 127.0.0.1\r\n'

interface Outcome {
    statuses: string[]
    closed: boolean
}

async function converse(requests: string[]): Promise<Outcome> {
    return await new Promise<Outcome>(resolvePromise => {
        let socket = net.connect(PORT, '127.0.0.1')
        let outcome: Outcome = {statuses: [], closed: false}
        let text = ''
        let index = 0
        let done = false
        let finish = () => {
            if (!done) {
                done = true
                clearTimeout(timer)
                socket.destroy()
                resolvePromise(outcome)
            }
        }
        let timer = setTimeout(finish, 8000)
        let complete = () => {
            let end = text.indexOf('\r\n\r\n')
            if (end < 0) {
                return false
            }
            let length = /\r\nContent-Length: (\d+)/i.exec(text.slice(0, end))
            return text.length >= end + 4 + (length ? parseInt(length[1]) : 0)
        }
        let next = () => {
            if (index < requests.length) {
                text = ''
                socket.write(requests[index++])
            } else {
                // Wait briefly for rejection to close the connection.
                clearTimeout(timer)
                timer = setTimeout(finish, 1000)
            }
        }
        socket.on('connect', next)
        socket.on('data', chunk => {
            text += chunk.toString()
            if (complete()) {
                outcome.statuses.push(text.split('\r\n')[0])
                next()
            }
        })
        socket.on('close', () => {
            outcome.closed = true
            finish()
        })
        socket.on('error', () => {})
    })
}

function expect(name: string, outcome: Outcome, statuses: string[], closed: boolean): void {
    let same = outcome.statuses.length == statuses.length && outcome.statuses.every((s, i) => s.includes(statuses[i]))
    if (!same || outcome.closed != closed) {
        console.log(name + ': expected ' + JSON.stringify(statuses) + (closed ? ' then close' : '') +
            ' but got ' + JSON.stringify(outcome.statuses) + (outcome.closed ? ' then close' : ''))
    }
    ttrue(same)
    ttrue(outcome.closed == closed)
}

expect('short prologue', await converse([GET + '\r\n', '\r\n\r\n\r\n\r\n' + GET + '\r\n']), ['200 OK', '200 OK'], false)

expect('sixteen bytes', await converse([GET + '\r\n', '\n'.repeat(16) + GET + '\r\n']), ['200 OK', '200 OK'], false)

expect('seventeen bytes', await converse([GET + '\r\n', '\n'.repeat(17) + GET + '\r\n']),
    ['200 OK', '400 Bad Request'], true)

expect('large prologue', await converse([GET + '\r\n', '\n'.repeat(100000) + GET + '\r\n']),
    ['200 OK', '400 Bad Request'], true)

expect('fresh connection', await converse(['\n'.repeat(100000) + GET + '\r\n']), ['400 Bad Request'], true)
