import has from 'ramda/src/has'
import propEq from 'ramda/src/propEq'
import find from 'ramda/src/find'
import pipe from 'ramda/src/pipe'
import prop from 'ramda/src/prop'

const sslSubdomains = ['pluto', 'venus', 'aurora', 'vesta', 'flora']

const devDC = [
  { id: 1, host: '149.154.175.10', port: 443 },
  { id: 2, host: '149.154.167.40', port: 443 },
  { id: 3, host: '149.154.175.117', port: 443 }
]

const prodDC = [
  { id: 1, host: '149.154.175.50', port: 443 },
  { id: 2, host: '149.154.167.51', port: 443 },
  { id: 3, host: '149.154.175.100', port: 443 },
  { id: 4, host: '149.154.167.91', port: 443 },
  { id: 5, host: '149.154.171.5', port: 443 }
]

const portString = ({ port = 80 }) => port === 80 ? '' : `:${port}`

const findById = pipe(propEq('id'), find)

export const chooseServer = (
  chosenServers,
  {
    dev = false,
    webogram = false,
    dcList = dev ? devDC : prodDC
  } = {}
) => (dcID, upload = false) => {
  console.log('[chooseServer:0] chosenServers:', chosenServers)
  const choosen = prop(dcID)
  if (has(dcID, chosenServers)) {
    console.log('[chooseServer:1] choosen:', choosen(chosenServers))
    return choosen(chosenServers)
  }
  
  let chosenServer = false
  console.log('[chooseServer:2]', { dcID, upload, webogram })
  if (webogram) {
    const subdomain = sslSubdomains[dcID - 1] + (upload ? '-1' : ''),
      path = dev ? 'apiw_test1' : 'apiw1'

    chosenServer = `https://${subdomain}.web.telegram.org/${path}`
    console.log('[chooseServer:3]', { chosenServer })
    return chosenServer //TODO Possibly bug. Isn't it necessary? chosenServers[dcID] = chosenServer
  }

  const dcOption = findById(dcID)(dcList)
  if (dcOption) {
    chosenServer = `http://${dcOption.host}${portString(dcOption)}/apiw1`
  }
  chosenServers[dcID] = chosenServer

  console.log('[chooseServer:4] choosen:', choosen(chosenServers))
  return choosen(chosenServers)
}
