export const Switch = (patterns, protector = e => e) =>
  (matches, mProtector = e => e) => (...data) => {
    const keyList = Object.keys(patterns)
    const normalized = protector(...data)
    for (const key of keyList) {
      console.log('[Switch]', {key})
      if (patterns[key](normalized))
        console.log('[Switch]', {keyList, normalized})
        return mProtector(matches[key])
    }
  }

export default Switch