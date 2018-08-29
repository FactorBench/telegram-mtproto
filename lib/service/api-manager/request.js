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

var debug = (0, _log2.default)([`request`]);

_bluebird2.default.config({
  monitoring: true
});

class Request {
  constructor(config, method, params = {}) {
    this.initNetworker = () => {
      console.log('[InitNetworker] this.config.dc =', this.config.dc);
      if (!this.config.networker) {
        var { getNetworker: _getNetworker, netOpts: _netOpts, dc: _dc } = this.config;
        console.log('[InitNetworker] this.config.dc =', this.config.dc);
        return _getNetworker(_dc, _netOpts).then(this.saveNetworker);
      }
      return _bluebird2.default.resolve(this.config.networker);
    };

    this.saveNetworker = networker => this.config.networker = networker;

    this.performRequest = () => {
      console.log('[PerformRequest] this.config.dc = ', this.config.dc);
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

  error303(err) {
    console.log('[Error303]', err);
    console.log('[Error303]', err instanceof Error);
    console.log('[Error303] this.config.dc =', this.config.dc);
    var matched = err.type.match(/^(PHONE_MIGRATE_|NETWORK_MIGRATE_|USER_MIGRATE_)(\d+)/);
    if (!matched || matched.length < 2) return _bluebird2.default.reject(err);
    var [,, newDcID] = matched;
    if (+newDcID === this.config.dc) return _bluebird2.default.reject(err);
    this.config.dc = +newDcID;
    delete this.config.networker;
    /*if (this.config.dc)
      this.config.dc = newDcID
    else
      await this.config.storage.set('dc', newDcID)*/
    //TODO There is disabled ability to change default DC
    //NOTE Shouldn't we must reassign current networker/cachedNetworker?
    console.log('[Error303] this.config.dc =', this.config.dc);
    return this.performRequest();
  }

  error420(err) {
    console.log('[Error420]', err);
    console.log('[Error420]', err instanceof Error);
    var matched = err.type.match(/^FLOOD_WAIT_(\d+)/);
    if (!matched || matched.length < 2) return _bluebird2.default.reject(err);
    var [, waitTime] = matched;
    console.error(`Flood error! It means that mtproto server bans you on ${waitTime} seconds`);
    return +waitTime > 60 ? _bluebird2.default.reject(err) : (0, _smartTimeout.delayedCall)(this.performRequest, +waitTime * 1e3);
  }
}

exports.default = Request;
//# sourceMappingURL=request.js.map