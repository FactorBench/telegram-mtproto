'use strict'

import { Buffer } from 'buffer'
import net from 'net'

import Logger from './util/log'
import crc32 from './crc32'

const log = Logger`tcp`

const PORT = 443
const HOST = '149.154.175.10'
const reURL = new RegExp(/([0-9.]+):(80|443)/)

class TCP {
    constructor(socket) {
        this.socket = socket || new net.Socket()
        this.seqNo = 0

        this.close
        this.socket.on('close', () => {
            log('close')('connection closed')
        })
        // this.socket._handle === null
    }

    connect({ host, port, url }) {
        if (url.indexOf(':') > 6) {
            [, host, port] = reURL.exec(url)
        }
        this.host = host || HOST
        this.port = port || PORT
        console.log({host: this.host, port: this.port})

        return new Promise((resolve, reject) => {
            const connectHandler = () => {
                // this.socket._handle !== null
                log('connect')(`connected to ${this.host}:${this.port}`)
                this.socket.removeListener('error', errorHandler)
                resolve()
            }
            const errorHandler = (err) => {
                log('connect')('failed: %O', err)
                this.socket.removeListener('connect', connectHandler)
                reject(err)
            }

            this.socket.on('error', errorHandler)
            this.socket.connect(this.port, this.host, connectHandler)
        })
    }

    post(message) {
        const buffer = this.encapsulate(message)

        return new Promise((resolve, reject) => {
            log(['post', `sent.${this.seqNo}`])(buffer)

            if (this.socket.write(buffer)) {
                log(['post'])(`passed to kernel. seqNo => ${this.seqNo}`)
                this.seqNo++
            } else {
                this.socket.once('drain', () => {
                    log(['post'])(`drained. seqNo => ${this.seqNo}`)
                    this.seqNo++
                })
            }

            this.socket.once('data', (data) => {
                const { length, seqNo, message } = this.decapsulate(data)
                log(['post', `rcvd.${seqNo}`])(message)

                resolve(message)
                if (message.toString().endsWith('exit')) {
                    this.socket.destroy()
                }
            })

            this.socket.once('error', (err) => {
                reject(err)
            })
        })
    }

    encapsulate(message) {
        if (typeof message === 'string') { // for test
            message = Uint8Array.from(message.split('').map(c => c.charCodeAt(0)))
        }

        const msgLength = (message.length + 12) / 4 | 0,
            arr = new Uint32Array(3),
            head = Buffer.from(arr.buffer, 0, 8),
            body = Buffer.from(message.buffer),
            tail = Buffer.from(arr.buffer, 8, 4),
            crc = crc32(message)

        arr[0] = msgLength
        arr[1] = this.seqNo
        arr[2] = crc

        log(['encapsulate'])(`crc = ${crc}`)

        return Buffer.concat([head, body, tail])
    }

    decapsulate(buffer) {
        const length = buffer.readUIntLE(0, 4) - 3, // in 4-bytes
            seqNo = buffer.readUIntLE(4, 4),
            message = buffer.slice(8, -4),//(8, length * 4),
            crc = buffer.readUIntLE(8 + length * 4, 4)

        if (crc !== crc32(Uint8Array.from(message))) throw new Error('BAD_RESPONSE_CRC')

        return { length, seqNo, message }
    }

    wait(timeout) {
        return new Promise((resolve) => {
            setTimeout(() => resolve(), timeout)
        })
    }

    destroy(exception) {
        this.socket.destroy(exception)
    }
}

export default TCP