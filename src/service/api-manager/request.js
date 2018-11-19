//@flow

import Promise from 'bluebird'

import Logger from '../../util/log'
const debug = Logger([`request`])

import { MTError } from '../../error'
import { delayedCall } from '../../util/smart-timeout'
import type { NetworkerType, AsyncStorage, LeftOptions } from './index.h.js'

type Options = {|
  networker?: NetworkerType,
  dc: number,
  storage: AsyncStorage,
  getNetworker: (dcID: number, options: LeftOptions) => Promise<NetworkerType>,
  netOpts: mixed
|}

Promise.config({
  monitoring: true
})

class Request {
  method: string
  params: { [arg: string]: mixed }
  config: Options
  constructor(config: Options, method: string, params?: Object = {}) {
    this.config = config
    this.method = method
    this.params = params

    this.performRequest = this.performRequest.bind(this)
    //$FlowIssue
    this.error303 = this.error303.bind(this)
    //$FlowIssue
    this.error420 = this.error420.bind(this)
    this.initNetworker = this.initNetworker.bind(this)
  }

  initNetworker = (): Promise<NetworkerType> => {
    console.log('[initNetworker:0]', this.config)
    if (!this.config.networker || this.config.networker.dcID != this.config.dc) {
      const { getNetworker, netOpts, dc } = this.config
      console.log('[initNetworker:1] this.config.dc =', this.config.dc)
      if (netOpts.dcID) netOpts.dcID = this.config.dc // todo hack... rewrite

      return getNetworker(dc, netOpts)
        .then(this.saveNetworker)
    }

    return Promise.resolve(this.config.networker)
  }

  saveNetworker = (networker: NetworkerType) => this.config.networker = networker
  
  performRequest = () => {
    console.log('[performRequest] this.config.dc = ', this.config.dc)
    return this.initNetworker().then(this.requestWith)
  }
  
  requestWith = (networker: NetworkerType) => {
    console.log('[RequestWith] this.config.dc = ', this.config.dc)
    console.log('[RequestWith] this.config.netOpts = ', this.config.netOpts)
    this.config.netOpts.dcID = this.config.dc
    return networker
      .wrapApiCall(this.method, this.params, this.config.netOpts)
      .catch({ code: 303 }, this.error303)
      .catch({ code: 420 }, this.error420)
  }

  async error303(err: MTError) {
    console.log('[Error303]', err)
    console.log('[Error303] on enter this.config.dc =', this.config.dc)
    const matched = err.type.match(/^(PHONE_MIGRATE_|NETWORK_MIGRATE_|USER_MIGRATE_)(\d+)/)
    if (!matched || matched.length < 2) return Promise.reject(err)
    const newDcID = +matched[2]
    if (newDcID === this.config.dc) return Promise.reject(err)
    this.config.dc = newDcID
    //delete this.config.networker
    await this.config.storage.set('dc', this.config.dc) // must be async call
    if (this.config.fixupDc) this.config.fixupDc(newDcID)
    console.log('[Error303] on exit this.config.dc =', this.config.dc)
    return this.performRequest()
  }

  async error420(err: MTError) {
    console.log('[Error420]', err)
    const matched = err.type.match(/^FLOOD_WAIT_(\d+)/)
    if (!matched || matched.length < 2) return Promise.reject(err)
    const [ , waitTime ] = matched
    console.error(`Flood error! It means that mtproto server bans you on ${waitTime} seconds`)
    return +waitTime > 60
      ? Promise.reject(err)
      : delayedCall(this.performRequest, +waitTime * 1e3)
  }
}

export default Request