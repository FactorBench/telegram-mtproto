'use strict'

import { Buffer } from 'buffer'
import net from 'net'

import Logger from './util/log'
import crc32 from './crc32'

const log = Logger`tcp`

const reURL = new RegExp(/([0-9.]+):(80|443)/)

const modes = ['full', 'abridged', 'intermediate']

class TCP {
    constructor({ host, port, url, socket, mode }) {
        if (url) [host, port] = this._parseUrl(url)

        this.host = host
        this.port = 80//port
        this.socket = socket || new net.Socket()
        //this.socket._destroy = this._destroy.bind(this)
        this.seqNo = 0
        this.intermediateModeInited = false
        this.isClosed = false

        if (mode) mode = mode.toLowerCase()
        this.mode = modes.includes(mode) ? mode : 'intermediate'

        this.socket.on('close', async (hadError) => {
            // TODO limit reconnection tries
            log('close')('connection closed')
            if (hadError) {
                log('close')('try to reconnect...')
                await this.connect()
            }
        })
    }

    connect() {
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
                log('connect')('failed:', err)
                this.socket.removeListener('connect', connectHandler)
                this.socket.removeListener('data', initHandler)
                
                reject(err)
            }
            const initHandler = (data) => {
                log('connect')(`rcvd on initialization packet:`, data)
                this.intermediateModeInited = true
                //resolve()
            }

            if (this.socket._handle !== null) {
                this.socket.removeListener('connect', connectHandler)
                this.socket.removeListener('data', initHandler)
                this.socket.removeListener('error', errorHandler)
                resolve(this.socket)
            } else {
            this.socket.on('error', errorHandler)
            this.socket.once('data', initHandler)
            this.socket.connect(this.port, this.host, connectHandler)
            }
        })
    }

    post(message) {
        const buffer = this.encapsulate(message)

        return new Promise(async (resolve, reject) => {
            if (this.socket._handle === null) await this.connect()

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
                log(['post', `rcvd.${seqNo}`])(`data ${data.length} bytes, message ${message.length} bytes`)
                
                if (message.toString().endsWith('exit')) {
                    this.socket.destroy()
                }
                resolve({ data: message })
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
        log('encapsulate')(data.toString())
        return Buffer.from(data.buffer)
    }

    decapsulate(buffer) {
        log('decapsulate')(`${buffer.byteLength} bytes`)
        const length = buffer.readInt32LE(0),
            message = buffer.slice(4),
            seqNo = 0

        if (length !== message.length) {
            log(['decapsulate', 'error'])({ length, bufferLength: buffer.length })
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

    _destroy(exception) {
        log('_destroy')('socket destroyed')
        this.isClosed = exception ? false : true
        if (exception) log('_destroy')(exception)
    }

    _parseUrl(url) {
        let host, port

        if (url && url.indexOf(':', 6) > 6) {
            [, host, port] = reURL.exec(url)
        }
        return [host, port]
    }
}

export default TCP