'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _log = require('../../util/log');

var _log2 = _interopRequireDefault(_log);

var _error = require('../../error');

var _smartTimeout = require('../../util/smart-timeout');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new _bluebird2.default(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return _bluebird2.default.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

var debug = (0, _log2.default)([`request`]);

_bluebird2.default.config({
  monitoring: true
});

class Request {
  constructor(config, method, params = {}) {
    this.initNetworker = () => {
      console.log('[initNetworker:0]', this.config);
      if (!this.config.networker || this.config.networker.dcID != this.config.dc) {
        var { getNetworker: _getNetworker, netOpts: _netOpts, dc: _dc } = this.config;
        console.log('[initNetworker:1] this.config.dc =', this.config.dc);
        if (_netOpts.dcID) _netOpts.dcID = this.config.dc; // todo hack... rewrite

        return _getNetworker(_dc, _netOpts).then(this.saveNetworker);
      }

      return _bluebird2.default.resolve(this.config.networker);
    };

    this.saveNetworker = networker => this.config.networker = networker;

    this.performRequest = () => {
      console.log('[performRequest] this.config.dc = ', this.config.dc);
      return this.initNetworker().then(this.requestWith);
    };

    this.requestWith = networker => {
      console.log('[RequestWith] this.config.dc = ', this.config.dc);
      console.log('[RequestWith] this.config.netOpts = ', this.config.netOpts);
      this.config.netOpts.dcID = this.config.dc;
      return networker.wrapApiCall(this.method, this.params, this.config.netOpts).catch({ code: 303 }, this.error303).catch({ code: 420 }, this.error420);
    };

    this.config = config;
    this.method = method;
    this.params = params;

    this.performRequest = this.performRequest.bind(this);
    //$FlowIssue
    this.error303 = this.error303.bind(this);
    //$FlowIssue
    this.error420 = this.error420.bind(this);
    this.initNetworker = this.initNetworker.bind(this);
  }

  /*
  if (error.code == 303) {
              var newDcID = error.type.match(/^(PHONE_MIGRATE_|NETWORK_MIGRATE_|USER_MIGRATE_)(\d+)/)[2]
              if (newDcID != dcID) {
                if (options.dcID) {
                  options.dcID = newDcID
                } else {
                  Storage.set({dc: baseDcID = newDcID})
                }
                 mtpGetNetworker(newDcID, options).then(function (networker) {
                  networker.wrapApiCall(method, params, options).then(function (result) {
                    deferred.resolve(result)
                  }, rejectPromise)
                }, rejectPromise)
              }
            }
  */
  error303(err) {
    var _this = this;

    return _asyncToGenerator(function* () {
      console.log('[Error303]', err);
      console.log('[Error303] on enter this.config.dc =', _this.config.dc);
      var matched = err.type.match(/^(PHONE_MIGRATE_|NETWORK_MIGRATE_|USER_MIGRATE_)(\d+)/);
      if (!matched || matched.length < 2) return _bluebird2.default.reject(err);
      var newDcID = +matched[2];
      if (newDcID === _this.config.dc) return _bluebird2.default.reject(err);
      _this.config.dc = newDcID;
      //delete this.config.networker
      yield _this.config.storage.set('dc', _this.config.dc); // must be async call
      if (_this.config.fixupDc) _this.config.fixupDc(newDcID);
      console.log('[Error303] on exit this.config.dc =', _this.config.dc);
      return _this.performRequest();
    })();
  }

  error420(err) {
    var _this2 = this;

    return _asyncToGenerator(function* () {
      console.log('[Error420]', err);
      var matched = err.type.match(/^FLOOD_WAIT_(\d+)/);
      if (!matched || matched.length < 2) return _bluebird2.default.reject(err);
      var [, waitTime] = matched;
      console.error(`Flood error! It means that mtproto server bans you on ${waitTime} seconds`);
      return +waitTime > 60 ? _bluebird2.default.reject(err) : (0, _smartTimeout.delayedCall)(_this2.performRequest, +waitTime * 1e3);
    })();
  }
}

exports.default = Request;
//# sourceMappingURL=request.js.map