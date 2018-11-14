'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.chooseServer = undefined;

var _has = require('ramda/src/has');

var _has2 = _interopRequireDefault(_has);

var _propEq = require('ramda/src/propEq');

var _propEq2 = _interopRequireDefault(_propEq);

var _find = require('ramda/src/find');

var _find2 = _interopRequireDefault(_find);

var _pipe = require('ramda/src/pipe');

var _pipe2 = _interopRequireDefault(_pipe);

var _prop = require('ramda/src/prop');

var _prop2 = _interopRequireDefault(_prop);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var sslSubdomains = ['pluto', 'venus', 'aurora', 'vesta', 'flora'];

var devDC = [{ id: 1, host: '149.154.175.10', port: 443 }, { id: 2, host: '149.154.167.40', port: 443 }, { id: 3, host: '149.154.175.117', port: 443 }];

var prodDC = [{ id: 1, host: '149.154.175.50', port: 443 }, { id: 2, host: '149.154.167.51', port: 443 }, { id: 3, host: '149.154.175.100', port: 443 }, { id: 4, host: '149.154.167.91', port: 443 }, { id: 5, host: '149.154.171.5', port: 443 }];

var portString = ({ port = 80 }) => port === 80 ? '' : `:${port}`;

var findById = (0, _pipe2.default)((0, _propEq2.default)('id'), _find2.default);

var chooseServer = exports.chooseServer = (chosenServers, {
  dev = false,
  webogram = false,
  dcList = dev ? devDC : prodDC
} = {}) => (dcID, upload = false) => {
  console.log('[chooseServer:0] chosenServers:', chosenServers);
  var choosen = (0, _prop2.default)(dcID);
  if ((0, _has2.default)(dcID, chosenServers)) {
    console.log('[chooseServer:1] choosen:', choosen(chosenServers));
    return choosen(chosenServers);
  }

  var chosenServer = false;
  console.log('[chooseServer:2]', { dcID, upload, webogram });
  if (webogram) {
    var subdomain = sslSubdomains[dcID - 1] + (upload ? '-1' : ''),
        path = dev ? 'apiw_test1' : 'apiw1';

    chosenServer = `https://${subdomain}.web.telegram.org/${path}`;
    console.log('[chooseServer:3]', { chosenServer });
    return chosenServer; //TODO Possibly bug. Isn't it necessary? chosenServers[dcID] = chosenServer
  }

  var dcOption = findById(dcID)(dcList);
  if (dcOption) {
    chosenServer = `http://${dcOption.host}${portString(dcOption)}/apiw1`;
  }
  chosenServers[dcID] = chosenServer;

  console.log('[chooseServer:4] choosen:', choosen(chosenServers));
  return choosen(chosenServers);
};
//# sourceMappingURL=dc-configurator.js.map
