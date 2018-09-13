'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _buffer = require('buffer');

var _net = require('net');

var _net2 = _interopRequireDefault(_net);

var _log = require('./util/log');

var _log2 = _interopRequireDefault(_log);

var _crc = require('./crc32');

var _crc2 = _interopRequireDefault(_crc);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

//const log = Logger`tcp`
var log = msg1 => msg2 => console.log(`[${msg1}]`, msg2);

var reURL = new RegExp(/([0-9.]+):(80|443)/);

var modes = ['full', 'abridged', 'intermediate'];

class TCP {
    constructor({ host, port, url, socket, mode }) {
        var _this = this;

        if (url) [host, port] = this._parseUrl(url);

        this.host = host;
        this.port = 80; //port
        this.socket = socket || new _net2.default.Socket();
        //this.socket._destroy = this._destroy.bind(this)
        this.seqNo = 0;
        this.intermediateModeInited = false;
        this.isConnected = false;
        this.isClosed = false;

        if (mode) mode = mode.toLowerCase();
        this.mode = modes.includes(mode) ? mode : 'intermediate';

        function* _ref3(hadError) {
            _this.isConnected = false;
            // TODO limit reconnection tries
            log('close')('connection closed');
            if (hadError) {
                log('close')('try to reconnect...');
                yield _this.connect();
            }
        }

        this.socket.on('close', (() => {
            var _ref = _asyncToGenerator(_ref3);

            return function (_x) {
                return _ref.apply(this, arguments);
            };
        })());
    }

    connect() {
        return new Promise((resolve, reject) => {
            var connectHandler = () => {
                this.isConnected = true;
                log('connect')(`connected to ${this.host}:${this.port}`);
                this.socket.removeListener('error', errorHandler);

                if (this.mode === 'intermediate' && !this.intermediateModeInited) {
                    // init connection
                    var isInited = this.socket.write(_buffer.Buffer.alloc(4, 0xee));
                    log(['connect', 'sent'])(`init packet sending ${isInited ? 'successful' : 'failure'}`);
                } else {
                    this.socket.removeListener('data', initHandler);
                }
                resolve(this.socket);
            };
            var errorHandler = err => {
                log('connect')('failed:', err);
                this.socket.removeListener('connect', connectHandler);
                this.socket.removeListener('data', initHandler);

                reject(err);
            };
            var initHandler = data => {
                log('connect')(`rcvd on initialization packet:`, data);
                this.intermediateModeInited = true;
                //resolve()
            };

            if (this.isConnected) {
                this.socket.removeListener('connect', connectHandler);
                this.socket.removeListener('data', initHandler);
                this.socket.removeListener('error', errorHandler);
                resolve(this.socket);
            } else {
                this.socket.on('error', errorHandler);
                this.socket.once('data', initHandler);
                this.socket.connect(this.port, this.host, connectHandler);
            }
        });
    }

    post(message) {
        var _this2 = this;

        var buffer = this.encapsulate(message);

        function _ref4() {
            log(['post'])(`drained. seqNo => ${_this2.seqNo}`);
            _this2.seqNo++;
        }

        function* _ref5(resolve, reject) {
            if (!_this2.isConnected) yield _this2.connect();

            log(['post', `sent.${_this2.seqNo}`])(`${buffer.byteLength} bytes`);

            if (_this2.socket.write(buffer)) {
                log(['post'])(`passed to kernel. seqNo => ${_this2.seqNo}`);
                _this2.seqNo++;
            } else {
                _this2.socket.once('drain', _ref4);
            }

            _this2.socket.once('data', function (data) {
                var { length, seqNo, message } = _this2.decapsulate(data);
                log(['post', `rcvd.${seqNo}`])(`data ${data.length} bytes, message ${message.length} bytes`);

                if (message.toString().endsWith('exit')) {
                    _this2.socket.destroy();
                }
                resolve({ data: message });
            });

            _this2.socket.once('error', function (err) {
                reject(err);
            });
        }

        return new Promise((() => {
            var _ref2 = _asyncToGenerator(_ref5);

            return function (_x2, _x3) {
                return _ref2.apply(this, arguments);
            };
        })());
    }

    encapsulate(message) {
        var int32Message = new Int32Array(message.buffer);
        var data = new Int32Array(int32Message.length + 1);

        data[0] = int32Message.byteLength;
        data.set(int32Message, 1);
        log('encapsulate')(data.toString());
        return _buffer.Buffer.from(data.buffer);
    }

    decapsulate(buffer) {
        log('decapsulate')(`${buffer.byteLength} bytes`);
        var length = buffer.readInt32LE(0),
            message = buffer.slice(4),
            seqNo = 0;

        if (length !== message.length) {
            log(['decapsulate', 'error'])({ length, bufferLength: buffer.length });
            log(['decapsulate', 'error'])(buffer);
            throw new Error('BAD_RESPONSE_LENGTH');
        }

        return { length, seqNo, message };
    }

    wait(timeout) {
        return new Promise(resolve => {
            setTimeout(() => resolve(), timeout);
        });
    }

    _destroy(exception) {
        log('_destroy')('socket destroyed');
        this.isClosed = exception ? false : true;
        if (exception) log('_destroy')(exception);
    }

    _parseUrl(url) {
        var host = void 0,
            port = void 0;

        if (url && url.indexOf(':', 6) > 6) {
            [, host, port] = reURL.exec(url);
        }
        return [host, port];
    }
}

exports.default = TCP;
//# sourceMappingURL=tcp.js.map