'use strict'

import { Buffer } from 'buffer'
import net from 'net'

import Logger from './util/log'
import crc32 from './crc32'

const log = Logger`tcp`

const reURL = new RegExp(/([0-9.]+):(80|443)/)

const modes = ['full', 'abridged', 'intermediate']

class TCP {
    constructor(socket, mode = 'intermediate') {
        this.socket = socket || new net.Socket()
        this.seqNo = 0
        this.intermediateModeInited = false

        mode = mode.toLowerCase()
        if (modes.includes(mode)) this.mode = mode

        this.socket.on('close', () => {
            log('close')('connection closed')
        })
    }

    connect({ host, port, url }) {
        if (url && url.indexOf(':') > 6) {
            [, host, port] = reURL.exec(url)
        }

        this.host = host || HOST
        this.port = port || PORT
        console.log({host: this.host, port: this.port})

        return new Promise((resolve, reject) => {
            const connectHandler = () => {
                log('connect')(`connected to ${this.host}:${this.port}`)
                this.socket.removeListener('error', errorHandler)

                if (this.mode === 'intermediate' && !this.intermediateModeInited) {
                    // init connection
                    const isInited = this.socket.write(Buffer.alloc(4, 0xee))
                    log(['connect', 'sent'])(`init packet sending ${isInited ? 'successful' : 'failure'}`)
                } else {
                    this.socket.removeListener('data', initHandler)
            }
                resolve(this.socket)
            }
            const errorHandler = (err) => {
                log('connect')('failed: %O', err)
                this.socket.removeListener('connect', connectHandler)
                this.socket.removeListener('data', initHandler)
                
                reject(err)
            }
            const initHandler = (data) => {
                log('connect')(`rcvd on initialization packet:`, data)
                this.intermediateModeInited = true
                //resolve()
            }

            this.socket.on('error', errorHandler)
            this.socket.once('data', initHandler)
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
                
                if (message.toString().endsWith('exit')) {
                    this.socket.destroy()
                }
                resolve({data: message})
            })

            this.socket.once('error', (err) => {
                reject(err)
            })
        })
    }

    encapsulate(message) {
        const data = new Int32Array(message.length + 1)

        data[0] = message.byteLength
        data.set(message, 1)
        log('encapsulate')(data)
        return Buffer.from(data.buffer)
    }

    decapsulate(buffer) {
        log('decapsulate')(`${buffer.byteLength} bytes`)
        const length = buffer.readInt32LE(0),
            message = buffer.slice(4),
            seqNo = 0

        if (length !== message.length) {
            log(['decapsulate', 'error'])({length, bufferLength: buffer.length})
            log(['decapsulate', 'error'])(buffer)
            throw new Error('BAD_RESPONSE_LENGTH')
        }

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