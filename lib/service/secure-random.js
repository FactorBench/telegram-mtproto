'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _crypto = require('crypto');

var getRandom = arr => {
  var ln = arr.length;
  var buf = (0, _crypto.randomBytes)(ln);
  for (var i = 0; i < ln; i++) {
    arr[i] = buf[i];
  }return arr;
};
exports.default = getRandom;
//# sourceMappingURL=secure-random.js.map