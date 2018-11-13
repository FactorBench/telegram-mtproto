export const Switch = (patterns, protector = e => e) =>
  (matches, mProtector = e => e) => (...data) => {
    const keyList = Object.keys(patterns)
    const normalized = protector(...data)
    for (const key of keyList) {
      console.log('[Switch]', {key, keyList, normalized})
      if (patterns[key](normalized))
        return mProtector(matches[key])
    }
  }

export default Switch