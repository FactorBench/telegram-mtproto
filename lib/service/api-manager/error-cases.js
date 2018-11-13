'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.switchErrors = undefined;

var _isNil = require('ramda/src/isNil');

var _isNil2 = _interopRequireDefault(_isNil);

var _propOr = require('ramda/src/propOr');

var _propOr2 = _interopRequireDefault(_propOr);

var _defer = require('../../util/defer');

var _defer2 = _interopRequireDefault(_defer);

var _switch = require('../../util/switch');

var _switch2 = _interopRequireDefault(_switch);

var _timeManager = require('../time-manager');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var cachedExportPromise = {};

var protect = ({ code = NaN, type = '' }, { rawError = null }, dcID, baseDcID) => ({
  base: baseDcID,
  errR: rawError,
  code,
  type,
  dcID
});

var patterns = {
  noBaseAuth: ({ code, dcID, base, type }) => code == 401 && dcID == base && type != 'SESSION_PASSWORD_NEEDED',
  noDcAuth: ({ code, dcID, base, type }) => code === 401 && dcID !== base && type !== 'SESSION_PASSWORD_NEEDED', // && type === 'AUTH_KEY_UNREGISTERED',
  waitFail: ({ code, type, errR }) => !errR && (code === 500 || type === 'MSG_WAIT_FAILED'),
  //fileMigrate: ({ code, type }) => code === 303 && type.slice(0, -1) === 'FILE_MIGRATE_',
  _: () => true
};

var matchProtect = matched => (error, options, dcID, emit, rejectPromise, requestThunk, apiSavedNet, apiRecall, deferResolve, mtpInvokeApi, storage) => matched({
  invoke: mtpInvokeApi,
  throwNext: () => rejectPromise(error),
  reject: rejectPromise,
  options,
  dcID,
  emit,
  requestThunk,
  apiRecall,
  deferResolve,
  apiSavedNet,
  storage
});

var noBaseAuth = ({ emit, throwNext, storage }) => {
  console.log('[noBaseAuth]');
  storage.remove('dc', 'user_auth');
  emit('error.401.base');
  throwNext();
};

var noDcAuth = ({ dcID, reject, apiSavedNet, apiRecall, deferResolve, invoke }) => {
  console.log('[noDcAuth:0]', { dcID });
  var importAuth = ({ id, bytes }) => invoke('auth.importAuthorization', { id, bytes }, { dcID, noErrorBox: true });

  console.log('[noDcAuth:1] check stored:', cachedExportPromise[dcID], (0, _isNil2.default)(cachedExportPromise[dcID]));
  console.log('[noDcAuth:1.1]', cachedExportPromise);
  if ((0, _isNil2.default)(cachedExportPromise[dcID])) {
    console.log('[noDcAuth:2] start to transfer authorization');
    var exportDeferred = (0, _defer2.default)();

    /* mtpInvokeApi('auth.exportAuthorization', {dc_id: dcID}, {noErrorBox: true}).then(function (exportedAuth) {
      mtpInvokeApi('auth.importAuthorization', {
        id: exportedAuth.id,
        bytes: exportedAuth.bytes
      }, {dcID: dcID, noErrorBox: true}).then(function () {
        exportDeferred.resolve()
      }, function (e) {
        exportDeferred.reject(e)
      })
    }, function (e) {
      exportDeferred.reject(e)
    })
     cachedExportPromise[dcID] = exportDeferred.promise */

    function _ref() {
      console.log('[noDcAuth:3.1] imported');
      exportDeferred.resolve();
    }

    function _ref2(e) {
      console.log('[noDcAuth:3.2] import failed:', e);
      exportDeferred.reject(e);
    }

    invoke('auth.exportAuthorization', { dc_id: dcID }, { noErrorBox: true }).then(function ({ exportedAuth }) {
      console.log('[noDcAuth:3] for import:', { exportedAuth });
      importAuth({ id, bytes }).then(_ref, _ref2);
    }, function (e) {
      console.log('[noDcAuth:4] export failed:', e);
      exportDeferred.reject(e);
    });
    //.then(importAuth)
    //.then(exportDeferred.resolve)
    //.catch(exportDeferred.reject)

    cachedExportPromise[dcID] = exportDeferred.promise;
  }

  cachedExportPromise[dcID] //TODO not returning promise
  .then(apiSavedNet).then(apiRecall).then(deferResolve).catch(reject);
};

var fileMigrate = () => {};
/*
const migrate = ({ error, dcID, options, reject,
    apiRecall, deferResolve, getNet, storage
  }) => {
  const newDcID = error.type.match(/^(PHONE_MIGRATE_|NETWORK_MIGRATE_|USER_MIGRATE_)(\d+)/)[2]
  if (newDcID === dcID) return
  if (options.dcID)
    options.dcID = newDcID
  else
    storage.set('dc', newDcID)

  getNet(newDcID, options)
    .then(apiRecall)
    .then(deferResolve)
    .catch(reject)
}*/

/*const floodWait = ({ error, options, throwNext, requestThunk }) => {
  const waitTime = error.type.match(/^FLOOD_WAIT_(\d+)/)[1] || 10
  if (waitTime > (options.timeout || 60))
    return throwNext()
  requestThunk(waitTime)
}*/

var waitFail = ({ options, throwNext, requestThunk }) => {
  var now = (0, _timeManager.tsNow)();
  if (options.stopTime) {
    if (now >= options.stopTime) return throwNext();
  } else {
    options.stopTime = now + (0, _propOr2.default)(10, 'timeout', options) * 1000;
  }
  options.waitTime = options.waitTime ? Math.min(60, options.waitTime * 1.5) : 1;
  requestThunk(options.waitTime);
};

var def = ({ throwNext }) => throwNext();

var switchErrors = exports.switchErrors = (0, _switch2.default)(patterns, protect)({
  noBaseAuth,
  noDcAuth,
  waitFail,
  _: def
}, matchProtect);
//# sourceMappingURL=error-cases.js.map