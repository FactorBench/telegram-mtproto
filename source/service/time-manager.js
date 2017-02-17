import { TimeOffset } from '../store'
import { nextRandomInt, longFromInts } from '../bin'

export const tsNow = seconds => {
  const t = +new Date() + (window.tsOffset || 0)
  return seconds
    ? Math.floor(t / 1000)
    : t
}

const logTimer = (new Date()).getTime()

export const dTime = () => `[${(((new Date()).getTime() -logTimer) / 1000).toFixed(3)}]`

let lastMessageID = [0, 0]
let timerOffset = 0

const offset = TimeOffset.get()
if (offset) timerOffset = offset

const generateMessageID = () => {
  const timeTicks = tsNow(),
        timeSec = Math.floor(timeTicks / 1000) + timerOffset,
        timeMSec = timeTicks % 1000,
        random = nextRandomInt(0xFFFF)

  let messageID = [timeSec, (timeMSec << 21) | (random << 3) | 4]
  if (lastMessageID[0] > messageID[0] ||
    lastMessageID[0] == messageID[0] && lastMessageID[1] >= messageID[1]) {
    messageID = [lastMessageID[0], lastMessageID[1] + 4]
  }

  lastMessageID = messageID

  // console.log('generated msg id', messageID, timerOffset)

  return longFromInts(messageID[0], messageID[1])
}

export const applyServerTime = (serverTime, localTime) => {
  const newTimeOffset = serverTime - Math.floor((localTime || tsNow()) / 1000)
  const changed = Math.abs(timerOffset - newTimeOffset) > 10
  TimeOffset.set(newTimeOffset)

  lastMessageID = [0, 0]
  timerOffset = newTimeOffset
  console.log(dTime(), 'Apply server time', serverTime, localTime, newTimeOffset, changed)

  return changed
}

export { generateMessageID as generateID }
