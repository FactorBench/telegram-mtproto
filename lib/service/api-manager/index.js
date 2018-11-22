'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ApiManager = undefined;

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _isNil = require('ramda/src/isNil');

var _isNil2 = _interopRequireDefault(_isNil);

var _is = require('ramda/src/is');

var _is2 = _interopRequireDefault(_is);

var _propEq = require('ramda/src/propEq');

var _propEq2 = _interopRequireDefault(_propEq);

var _has = require('ramda/src/has');

var _has2 = _interopRequireDefault(_has);

var _pathSatisfies = require('ramda/src/pathSatisfies');

var _pathSatisfies2 = _interopRequireDefault(_pathSatisfies);

var _complement = require('ramda/src/complement');

var _complement2 = _interopRequireDefault(_complement);

var _log = require('../../util/log');

var _log2 = _interopRequireDefault(_log);

var _authorizer = require('../authorizer');

var _authorizer2 = _interopRequireDefault(_authorizer);

var _defer = require('../../util/defer');

var _defer2 = _interopRequireDefault(_defer);

var _timeManager = require('../time-manager');

var _dcConfigurator = require('../dc-configurator');

var _rsaKeysManger = require('../rsa-keys-manger');

var _rsaKeysManger2 = _interopRequireDefault(_rsaKeysManger);

var _error = require('../../error');

var _bin = require('../../bin');

var _errorCases = require('./error-cases');

var _smartTimeout = require('../../util/smart-timeout');

var _request = require('./request');

var _request2 = _interopRequireDefault(_request);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new _bluebird2.default(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return _bluebird2.default.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }
// import UpdatesManager from '../updates'

var debug = _log2.default`api-manager`;

var hasPath = (0, _pathSatisfies2.default)((0, _complement2.default)(_isNil2.default));

var Ln = (length, obj) => obj && (0, _propEq2.default)('length', length, obj);

class ApiManager {
  constructor(config, tls, netFabric, { on, emit }) {
    var _this = this;

    this.cache = {
      uploader: {},
      downloader: {},
      auth: {},
      servers: {},
      keysParsed: {}
    };

    this.fixupDc = dcID => {
      console.log('[fixupDc] current:', this.baseDcID, 'candidate:', dcID);
      this.baseDcID = dcID;
    };

    function* _ref10(options) {
      console.log((0, _timeManager.dTime)(), `[${options.txn}][getNearestDc:0]`, JSON.stringify(options));
      var inProgress = false;

      if (_this.nearestDc) return _this.nearestDc;

      function* _ref9(resolve, reject) {
        function _ref7(nearestDc) {
          inProgress = false;
          console.log((0, _timeManager.dTime)(), `[${options.txn}][getNearestDc] got:`, nearestDc);
          resolve(nearestDc);
        }

        function _ref8(err) {
          inProgress = false;
          console.log((0, _timeManager.dTime)(), `[${options.txn}][getNearestDc] error:`, JSON.stringify(err));
          reject(false);
        }

        if (inProgress) {
          console.log((0, _timeManager.dTime)(), `[${options.txn}][getNearestDc] wait...`);
          _this.once('gotNearestDc', _ref7);

          _this.once('error', _ref8);
        } else {
          console.log((0, _timeManager.dTime)(), `[${options.txn}][getNearestDc] request nearest dc`);
          inProgress = true;

          var opts = {
            txn: options.txn,
            dcID: options.dcID || 2,
            createNetworker: true
          };

          var networker = yield _this.mtpGetNetworker(opts.dcID, opts);
          var nearestDc = yield networker.wrapApiCall('help.getNearestDc', {}, opts);
          var { nearest_dc } = nearestDc;
          console.log((0, _timeManager.dTime)(), `[${options.txn}][getNearestDc] got it: ${nearest_dc}`);
          _this.emit('gotNearestDc', nearest_dc);
        }
      }

      return new _bluebird2.default((() => {
        var _ref2 = _asyncToGenerator(_ref9);

        return function (_x2, _x3) {
          return _ref2.apply(this, arguments);
        };
      })());
    }

    this.getNearestDc = (() => {
      var _ref = _asyncToGenerator(_ref10);

      return function (_x) {
        return _ref.apply(this, arguments);
      };
    })();

    this.networkSetter = (dc, options) => (authKey, serverSalt) => {
      console.log('[networkSetter] options:', JSON.stringify(options));
      var networker = this.networkFabric(dc, authKey, serverSalt, options),
          cache = options.fileUpload || options.fileDownload ? this.cache.uploader : this.cache.downloader;

      return cache[dc] = networker;
    };

    function* _ref11(dcID, options = {}) {
      if (!dcID) throw new Error('get Networker without dcID');

      var isUpload = options.fileUpload || options.fileDownload || false;
      var cache = isUpload ? _this.cache.uploader : _this.cache.downloader;
      //const cache = this.cache.downloader
      console.log((0, _timeManager.dTime)(), `[${options.txn}][MtpGetNetworker:0] dcID:`, dcID, JSON.stringify(options), isUpload);
      console.log((0, _timeManager.dTime)(), `[${options.txn}][MtpGetNetworker:1] cache:`, cache[dcID]);
      if (cache[dcID] !== undefined) return cache[dcID];

      var networkSetter = _this.networkSetter(dcID, options);

      var akk = `dc${dcID}_auth_key`;
      var ssk = `dc${dcID}_server_salt`;

      var authKeyHex = yield _this.storage.get(akk);
      var serverSaltHex = yield _this.storage.get(ssk);

      if (cache[dcID]) return cache[dcID];

      if (authKeyHex && authKeyHex.length == 512) {
        if (!serverSaltHex || serverSaltHex.length != 16) {
          serverSaltHex = 'AAAAAAAAAAAAAAAA';
        }
        var _authKey = (0, _bin.bytesFromHex)(authKeyHex);
        var _serverSalt = (0, _bin.bytesFromHex)(serverSaltHex);

        console.log((0, _timeManager.dTime)(), `[${options.txn}][MtpGetNetworker:2] call network fabric:`, dcID, _authKey, _serverSalt, JSON.stringify(options));
        return cache[dcID] = _this.networkFabric(dcID, _authKey, _serverSalt, options);
        //return networkSetter(authKey, serverSalt)
      }

      if (!options.createNetworker) throw new _error.AuthKeyError();

      console.log((0, _timeManager.dTime)(), `[${options.txn}][MtpGetNetworker:3] auth...`);
      var auth = void 0;
      try {
        var dcUrl = _this.chooseServer(dcID, options.fileDownload || options.fileUpload);
        console.log((0, _timeManager.dTime)(), `[${options.txn}][MtpGetNetworker:4] dcUrl:`, dcUrl);
        auth = yield _this.auth(dcID, _this.cache.auth, dcUrl);
        console.log((0, _timeManager.dTime)(), `[${options.txn}][MtpGetNetworker:5] auth completed:`, auth);
        _this.baseDcID = dcID;
      } catch (error) {
        return netError(error);
      }
      console.log((0, _timeManager.dTime)(), `[${options.txn}][MtpGetNetworker:6] auth passed`);

      var { authKey, serverSalt } = auth;

      yield _this.storage.set(akk, (0, _bin.bytesToHex)(authKey));
      yield _this.storage.set(ssk, (0, _bin.bytesToHex)(serverSalt));

      //return networkSetter(authKey, serverSalt)
      console.log((0, _timeManager.dTime)(), `[${options.txn}][MtpGetNetworker:7] call network fabric:`, dcID, authKey, serverSalt, JSON.stringify(options));
      return cache[dcID] = _this.networkFabric(dcID, authKey, serverSalt, options);
    }

    this.mtpGetNetworker = (() => {
      var _ref3 = _asyncToGenerator(_ref11);

      return function (_x4) {
        return _ref3.apply(this, arguments);
      };
    })();

    function* _ref15(method, params, options = {}) {
      var deferred = (0, _defer2.default)();

      function* _ref12(data) {
        if (data._ == 'auth.authorization' && data.flags >= 0 && data.user && Object.keys(data).length == 3) {
          yield _this.setUserAuth(dcID, { id: data.user.id });
        }
        console.log((0, _timeManager.dTime)(), `[${options.txn}][mtpInvokeApi:5] returned by ${method}: ${JSON.stringify(data)}`);
        return deferred.resolve(data);
      }

      var processResult = (() => {
        var _ref5 = _asyncToGenerator(_ref12);

        return function processResult(_x7) {
          return _ref5.apply(this, arguments);
        };
      })();
      var rejectPromise = function (error) {
        var err = void 0;
        if (!error) err = { type: 'ERROR_EMPTY', input: '' };else if (!(0, _is2.default)(Object, error)) err = { message: error };else err = error;
        deferred.reject(err);

        if (!options.noErrorBox) {
          //TODO weird code. `error` changed after `.reject`?

          /*err.input = method
           err.stack =
            stack ||
            hasPath(['originalError', 'stack'], error) ||
            error.stack ||
            (new Error()).stack*/
          _this.emit('error.invoke', error);
        }
      };

      options.txn = _this.txn++;
      console.log((0, _timeManager.dTime)(), `[${options.txn}][mtpInvokeApi:0]`, method, JSON.stringify(params), JSON.stringify(options));
      if (!options.dcID) options.dcID = (yield _this.storage.get('dc')) || _this.baseDcID;
      console.log((0, _timeManager.dTime)(), `[${options.txn}][mtpInvokeApi:1] initConnection...`);
      yield _this.initConnection(options);
      console.log((0, _timeManager.dTime)(), `[${options.txn}][mtpInvokeApi:2] initConnection passed`);

      var requestThunk = function (waitTime) {
        return (0, _smartTimeout.delayedCall)(req.performRequest, +waitTime * 1e3);
      };

      var dcID = options.dcID ? options.dcID || _this.baseDcID : (yield _this.storage.get('dc')) || 2;

      console.log((0, _timeManager.dTime)(), `[${options.txn}][mtpInvokeApi:3] get networker with dcID ${dcID} and options ${JSON.stringify(options)}`);
      var networker = yield _this.mtpGetNetworker(dcID, options);
      console.log((0, _timeManager.dTime)(), `[${options.txn}][mtpInvokeApi:4] got networker:`, networker);

      var cfg = {
        networker,
        dc: dcID,
        storage: _this.storage,
        getNetworker: _this.mtpGetNetworker,
        netOpts: options,
        fixupDc: _this.fixupDc
      };
      var req = new _request2.default(cfg, method, params);

      function _ref13() {
        return networker;
      }

      function _ref14(networker) {
        req.config.networker = networker;
        return req.performRequest();
      }

      req.performRequest().then(processResult /* deferred.resolve */
      , function (error) {
        var deferResolve = processResult; /* deferred.resolve */
        var apiSavedNet = _ref13;
        var apiRecall = _ref14;
        console.error((0, _timeManager.dTime)(), `[${options.txn}] Error`, error.code, error.type, _this.baseDcID, dcID);

        return (0, _errorCases.switchErrors)(error, options, dcID, _this.baseDcID)(error, options, dcID, _this.emit, rejectPromise, requestThunk, apiSavedNet, apiRecall, deferResolve, _this.mtpInvokeApi, _this.storage);
      }).catch(rejectPromise);

      return deferred.promise;
    }

    this.mtpInvokeApi = (() => {
      var _ref4 = _asyncToGenerator(_ref15);

      return function (_x5, _x6) {
        return _ref4.apply(this, arguments);
      };
    })();

    function* _ref16(dcID, userAuth) {
      var fullUserAuth = Object.assign({ dcID }, userAuth);
      console.log((0, _timeManager.dTime)(), `[setUserAuth] store user auth:`, fullUserAuth);
      yield _this.storage.set('dc', dcID);
      yield _this.storage.set('user_auth', fullUserAuth);
      _this.emit('auth.dc', { dc: dcID, auth: userAuth });
      _this.baseDcID = dcID;
    }

    this.setUserAuth = (() => {
      var _ref6 = _asyncToGenerator(_ref16);

      return function (_x8, _x9) {
        return _ref6.apply(this, arguments);
      };
    })();

    var {
      server,
      api,
      app: {
        storage,
        publicKeys
      },
      schema,
      mtSchema
    } = config;
    this.apiConfig = api;
    this.publicKeys = publicKeys;
    this.storage = storage;
    this.serverConfig = server;
    this.schema = schema;
    this.mtSchema = mtSchema;
    this.chooseServer = (0, _dcConfigurator.chooseServer)(this.cache.servers, server);
    this.on = on;
    this.emit = emit;
    this.TL = tls;
    this.keyManager = (0, _rsaKeysManger2.default)(this.TL.Serialization, publicKeys, this.cache.keysParsed);
    this.auth = (0, _authorizer2.default)(this.TL, this.keyManager);
    this.networkFabric = netFabric(this.chooseServer);
    this.mtpInvokeApi = this.mtpInvokeApi.bind(this);
    this.mtpGetNetworker = this.mtpGetNetworker.bind(this);
    var apiManager = this.mtpInvokeApi;
    apiManager.setUserAuth = this.setUserAuth;
    apiManager.on = this.on;
    apiManager.emit = this.emit;
    apiManager.storage = storage;
    this.requestPulls = {};
    this.requestActives = {};
    this.baseDcID = false;
    this.nearestDc = false;
    this.txn = 1;

    // this.updatesManager = UpdatesManager(apiManager)
    // apiManager.updates = this.updatesManager

    return apiManager;
  }

  initConnection(options) {
    var _this2 = this;

    return _asyncToGenerator(function* () {
      var existsNetworkers = isAnyNetworker(_this2);
      console.log((0, _timeManager.dTime)(), `[${options.txn}][initConnection] check exists any networker:`, existsNetworkers, Object.keys(_this2.cache.downloader));
      if (!existsNetworkers) {
        var storedBaseDc = yield _this2.storage.get('dc');
        console.log((0, _timeManager.dTime)(), `[${options.txn}][initConnection] got dc: ${storedBaseDc}, default: ${_this2.baseDcID}`);
        var baseDc = storedBaseDc || _this2.baseDcID;
        var opts = {
          txn: options.txn,
          dcID: baseDc,
          createNetworker: true
        };
        var networker = yield _this2.mtpGetNetworker(1, opts);
        var nearestDc = yield networker.wrapApiCall('help.getNearestDc', {}, opts);
        var { nearest_dc, this_dc } = nearestDc;
        console.log((0, _timeManager.dTime)(), `[${options.txn}][initConnection] help.getNearestDc: ${nearest_dc}, ${this_dc}`);
        //await this.storage.set('dc', nearest_dc)
        //this.baseDcID = nearest_dc
        debug(`nearest Dc`)('%O', nearestDc);
        console.log((0, _timeManager.dTime)(), `[${options.txn}][initConnection] is nearest is not this: ${nearest_dc !== this_dc}`);
        if (nearest_dc !== this_dc) {
          console.log((0, _timeManager.dTime)(), `[${options.txn}][initConnection] if nearest_dc!=this_dc then create networker for dcID ${nearest_dc}`);
          yield _this2.mtpGetNetworker(nearest_dc, { txn: options.txn, createNetworker: true });
        }
      }
    })();
  }

  mtpClearStorage() {
    var _this3 = this;

    return _asyncToGenerator(function* () {
      var saveKeys = [];
      for (var _dcID = 1; _dcID <= 5; _dcID++) {
        saveKeys.push(`dc${_dcID}_auth_key`);
        saveKeys.push(`t_dc${_dcID}_auth_key`);
      }
      _this3.storage.noPrefix(); //TODO Remove noPrefix

      var values = yield _this3.storage.get(...saveKeys);

      yield _this3.storage.clear();

      var restoreObj = {};
      saveKeys.forEach(function (key, i) {
        var value = values[i];
        if (value !== false && value !== undefined) restoreObj[key] = value;
      });
      _this3.storage.noPrefix();

      return _this3.storage.set(restoreObj); //TODO definitely broken
    })();
  }
}

exports.ApiManager = ApiManager;
var isAnyNetworker = ctx => Object.keys(ctx.cache.downloader).length > 0;

var netError = error => {
  console.log('Get networker error', error, error.stack);
  return _bluebird2.default.reject(error);
};
//# sourceMappingURL=index.js.map