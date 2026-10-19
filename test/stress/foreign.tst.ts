/*
    foreign.tst.ts - Complete requests from OS threads and release work after client disconnects
 */

import {tdepth, teq, tget, tinfo, ttrue} from '@embedthis/testme'
import net from 'node:net'

const HTTP = tget('TM_HTTP') || 'http://127.0.0.1:4100'
const url = new URL(HTTP)

async function pending(): Promise<number> {
    let text = await (await fetch(`${HTTP}/action/foreign-pending`)).text()
    let match = text.match(/PENDING (-?\d+)/)
    ttrue(match != null)
    return Number(match![1])
}


async function abandon(delay: number): Promise<void> {
    await new Promise<void>(resolve => {
        let socket = net.connect(Number(url.port), url.hostname)
        socket.on('connect', () => {
            socket.write(`GET /action/foreign?delay=${delay} HTTP/1.1\r\nHost: ${url.host}\r\n\r\n`)
            setTimeout(() => {
                socket.destroy()
                resolve()
            }, 50)
        })
        socket.on('error', () => resolve())
    })
}

let count = [10, 50, 100, 200, 400, 800, 1600, 3200, 6400, 12800][tdepth()] || 10

tinfo('Complete', count, 'requests from a foreign thread')
for (let i = 0; i < count; i++) {
    let response = await fetch(`${HTTP}/action/foreign`)
    teq(response.status, 200)
    ttrue((await response.text()).startsWith('FOREIGN '))
}

let concurrent = await Promise.all(Array.from({length: 20}, () => fetch(`${HTTP}/action/foreign`)))
for (let response of concurrent) {
    teq(response.status, 200)
    ttrue((await response.text()).startsWith('FOREIGN '))
}

let abandoned = Math.max(5, count / 10)
tinfo('Abandon', abandoned, 'requests before the foreign thread returns')
for (let i = 0; i < abandoned; i++) {
    await abandon(300)
}

let left = -1
for (let i = 0; i < 50; i++) {
    left = await pending()
    if (left == 0) {
        break
    }
    await Bun.sleep(100)
}
teq(left, 0)
