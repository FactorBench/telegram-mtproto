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
            log(['post', `sent.${this.seqNo}`])(`${buffer.byteLength} bytes`)

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
                log(['post', `rcvd.${seqNo}`])(`data ${data.length} bytes, message ${message.length} bytes (${length} dwords)`)
                
                resolve(message)
                //if (message.toString().endsWith('exit')) {
                //    this.socket.destroy()
                //}
            })

            this.socket.once('error', (err) => {
                reject(err)
            })
        })
    }

    encapsulate(message) {
        const tailless = new Int32Array(message.length + 2)

        tailless[0] = message.length + 3
        tailless[1] = this.seqNo
        tailless.set(message, 2)

        const crc = crc32(tailless),
            data = new Int32Array(message.length + 3)

        data.set(tailless)
        data[tailless.length] = crc

        log('encapsulate')(data)
        log('encapsulate')(`crc = ${crc}`)

        return Buffer.from(data.buffer)
    }

    decapsulate(buffer) {
        log('decapsulate')(`${buffer.byteLength} bytes`)
        const length = buffer.readInt32LE(0) - 3, // in 4-bytes
            seqNo = buffer.readInt32LE(4),
            message = buffer.slice(8, -4),
            tailless = Buffer.alloc(buffer.byteLength - 4),
            crc = buffer.readUInt32LE(8 + length * 4),
            copied = buffer.copy(tailless, 0, 0)

        log('decapsulate')({length, seqNo, crc, copied})
        if (crc !== crc32(new Int32Array(tailless.buffer))) throw new Error('BAD_RESPONSE_CRC')

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