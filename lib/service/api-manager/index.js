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

    this.networkSetter = (dc, options) => (authKey, serverSalt) => {
      console.log('[networkSetter] options:', JSON.stringify(options));
      var networker = this.networkFabric(dc, authKey, serverSalt, options),
          cache = options.fileUpload || options.fileDownload ? this.cache.uploader : this.cache.downloader;

      return cache[dc] = networker;
    };

    function* _ref3(dcID, options = {}) {
      if (!dcID) throw new Error('get Networker without dcID');

      var isUpload = options.fileUpload || options.fileDownload || false;
      var cache = isUpload ? _this.cache.uploader : _this.cache.downloader;
      //const cache = this.cache.downloader
      console.log('[MtpGetNetworker:0] dcID:', dcID, JSON.stringify(options), isUpload);
      console.log('[MtpGetNetworker:1] cache:', cache[dcID]);
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

        console.log('[MtpGetNetworker:2] call network fabric:', dcID, _authKey, _serverSalt, JSON.stringify(options));
        return cache[dcID] = _this.networkFabric(dcID, _authKey, _serverSalt, options);
        //return networkSetter(authKey, serverSalt)
      }

      if (!options.createNetworker) throw new _error.AuthKeyError();

      console.log('[MtpGetNetworker:3] auth...');
      var auth = void 0;
      try {
        var dcUrl = _this.chooseServer(dcID, options.fileDownload || options.fileUpload);
        console.log('[MtpGetNetworker:4] dcUrl:', dcUrl);
        auth = yield _this.auth(dcID, _this.cache.auth, dcUrl);
      } catch (error) {
        return netError(error);
      }
      console.log('[MtpGetNetworker:5] auth passed');

      var { authKey, serverSalt } = auth;

      yield _this.storage.set(akk, (0, _bin.bytesToHex)(authKey));
      yield _this.storage.set(ssk, (0, _bin.bytesToHex)(serverSalt));

      //return networkSetter(authKey, serverSalt)
      console.log('[MtpGetNetworker:6] call network fabric:', dcID, authKey, serverSalt, JSON.stringify(options));
      return cache[dcID] = _this.networkFabric(dcID, authKey, serverSalt, options);
    }

    this.mtpGetNetworker = (() => {
      var _ref = _asyncToGenerator(_ref3);

      return function (_x) {
        return _ref.apply(this, arguments);
      };
    })();

    function* _ref6(method, params, options = {}) {
      console.log('[mtpInvokeApi]', method, JSON.stringify(params), JSON.stringify(options));
      if (!options.dcID) options.dcID = _this.baseDcID;
      var deferred = (0, _defer2.default)();
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

      console.log('[mtpInvokeApi] initConnection...');
      yield _this.initConnection();
      console.log('[mtpInvokeApi] initConnection passed');

      var requestThunk = function (waitTime) {
        return (0, _smartTimeout.delayedCall)(req.performRequest, +waitTime * 1e3);
      };

      var dcID = options.dcID ? options.dcID || _this.baseDcID : (yield _this.storage.get('dc')) || 2;

      /*
       ! add dc to options??
       */
      console.log('[mtpInvokeApi] get networker with dcID', dcID, ' and options', JSON.stringify(options));
      var networker = yield _this.mtpGetNetworker(dcID, options);
      console.log('[mtpInvokeApi] got networker:', networker);

      var cfg = {
        networker,
        dc: dcID,
        storage: _this.storage,
        getNetworker: _this.mtpGetNetworker,
        netOpts: options,
        fixupDc: _this.fixupDc
      };
      var req = new _request2.default(cfg, method, params);

      function _ref4() {
        return networker;
      }

      function _ref5(networker) {
        req.config.networker = networker;
        return req.performRequest();
      }

      req.performRequest().then(deferred.resolve, function (error) {
        var deferResolve = deferred.resolve;
        var apiSavedNet = _ref4;
        var apiRecall = _ref5;
        console.error((0, _timeManager.dTime)(), 'Error', error.code, error.type, _this.baseDcID, dcID);

        return (0, _errorCases.switchErrors)(error, options, dcID, _this.baseDcID)(error, options, dcID, _this.emit, rejectPromise, requestThunk, apiSavedNet, apiRecall, deferResolve, _this.mtpInvokeApi, _this.storage);
      }).catch(rejectPromise);

      return deferred.promise;
    }

    this.mtpInvokeApi = (() => {
      var _ref2 = _asyncToGenerator(_ref6);

      return function (_x2, _x3) {
        return _ref2.apply(this, arguments);
      };
    })();

    this.setUserAuth = (dcID, userAuth) => {
      var fullUserAuth = Object.assign({ dcID }, userAuth);
      this.storage.set({
        dc: dcID,
        user_auth: fullUserAuth
      });
      this.emit('auth.dc', { dc: dcID, auth: userAuth });
    };

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
    this.baseDcID = 2;

    // this.updatesManager = UpdatesManager(apiManager)
    // apiManager.updates = this.updatesManager

    return apiManager;
  }

  initConnection() {
    var _this2 = this;

    return _asyncToGenerator(function* () {
      var existsNetworkers = isAnyNetworker(_this2);
      console.log('[initConnection] check exists any networker:', existsNetworkers);
      console.log('[initConnection] networkers:', Object.keys(_this2.cache.downloader));
      if (!existsNetworkers) {
        var storedBaseDc = yield _this2.storage.get('dc');
        console.log('[initConnection] got dc:', storedBaseDc, ', default:', _this2.baseDcID);
        var baseDc = storedBaseDc || _this2.baseDcID;
        var opts = {
          dcID: baseDc,
          createNetworker: true
        };
        var networker = yield _this2.mtpGetNetworker(baseDc, opts);
        var nearestDc = yield networker.wrapApiCall('help.getNearestDc', {}, opts);
        var { nearest_dc, this_dc } = nearestDc;
        console.log('[initConnection] help.getNearestDc:', nearest_dc, this_dc);
        yield _this2.storage.set('dc', nearest_dc);
        //this.baseDcID = nearest_dc
        debug(`nearest Dc`)('%O', nearestDc);
        console.log('[initConnection] is nearest is not this:', nearest_dc !== this_dc);
        if (nearest_dc !== this_dc) {
          console.log('[initConnection] if nearest_dc!=this_dc then create networker for dcID', nearest_dc);
          yield _this2.mtpGetNetworker(nearest_dc, { createNetworker: true });
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