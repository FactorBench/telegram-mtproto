import isNil from 'ramda/src/isNil'
import propOr from 'ramda/src/propOr'

import blueDefer from '../../util/defer'
import Switch from '../../util/switch'
import { tsNow } from '../time-manager'

const cachedExportPromise = {}

const protect = (
    { code = NaN, type = '' },
    { rawError = null },
    dcID,
    baseDcID
  ) => ({
    base: baseDcID,
    errR: rawError,
    code,
    type,
    dcID
  })

const patterns = {
  noBaseAuth: ({ code, dcID, base, type })  =>  code == 401 && dcID == base && type != 'SESSION_PASSWORD_NEEDED',
  noDcAuth: ({ code, dcID, base, type })  =>  code === 401 && dcID !== base && type !== 'SESSION_PASSWORD_NEEDED',// && type === 'AUTH_KEY_UNREGISTERED',
  waitFail: ({ code, type, errR })  =>  !errR && (code === 500 || type === 'MSG_WAIT_FAILED'),
  //fileMigrate: ({ code, type }) => code === 303 && type.slice(0, -1) === 'FILE_MIGRATE_',
  _ : () => true
}


const matchProtect =
  matched => (
      error,
      options,
      dcID,
      emit,
      rejectPromise,
      requestThunk,
      apiSavedNet,
      apiRecall,
      deferResolve,
      mtpInvokeApi,
      storage
    ) =>
      matched({
        invoke   : mtpInvokeApi,
        throwNext: () => rejectPromise(error),
        reject   : rejectPromise,
        options,
        dcID,
        emit,
        requestThunk,
        apiRecall,
        deferResolve,
        apiSavedNet,
        storage
      })


const noBaseAuth = ({ emit, throwNext, storage }) => {
  console.log('[noBaseAuth]')
  storage.remove('dc', 'user_auth')
  emit('error.401.base')
  throwNext()
}

const noDcAuth = ({ dcID, reject, apiSavedNet, apiRecall, deferResolve, invoke }) => {
  console.log('[noDcAuth:0]', { dcID })
  const importAuth = ({ id, bytes }) => invoke(
    'auth.importAuthorization',
    { id, bytes },
    { dcID, noErrorBox: true })

  console.log('[noDcAuth:1] check stored:', cachedExportPromise[dcID], cachedExportPromise[dcID] === undefined)
  console.log('[noDcAuth:1] check stored:', cachedExportPromise[`${dcID}`], cachedExportPromise[`${dcID}`] === undefined)
  console.log('[noDcAuth:1.1]', cachedExportPromise)
  if (isNil(cachedExportPromise[dcID])) {
    console.log('[noDcAuth:2] start to transfer authorization')
    const exportDeferred = blueDefer()

    invoke('auth.exportAuthorization', { dc_id: dcID }, { noErrorBox: true })
      .then(function(exportedAuth) {
        console.log('[noDcAuth:3] for import:', exportedAuth)
        importAuth(exportedAuth).then(function() {
          console.log('[noDcAuth:3.1] imported')
          exportDeferred.resolve()
        }, function(e) {
          console.log('[noDcAuth:3.2] import failed:', e)
          exportDeferred.reject(e)
        })
      }, function(e) {
        console.log('[noDcAuth:4] export failed:', e)
        exportDeferred.reject(e)
      })
      //.then(importAuth)
      //.then(exportDeferred.resolve)
      //.catch(exportDeferred.reject)

    cachedExportPromise[dcID] = exportDeferred.promise
  }

  cachedExportPromise[dcID] //TODO not returning promise
    .then(apiSavedNet)
    .then(apiRecall)
    .then(deferResolve)
    .catch(reject)
}

const fileMigrate = () => {

}
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

const waitFail = ({ options, throwNext, requestThunk }) => {
  const now = tsNow()
  if (options.stopTime) {
    if (now >= options.stopTime)
      return throwNext()
  } else {
    options.stopTime = now + propOr(10, 'timeout', options) * 1000
  }
  options.waitTime = options.waitTime
    ? Math.min(60, options.waitTime * 1.5)
    : 1
  requestThunk(options.waitTime)
}

const def = ({ throwNext }) => throwNext()


export const switchErrors = Switch(patterns, protect)({
  noBaseAuth,
  noDcAuth,
  waitFail,
  _: def
}, matchProtect)