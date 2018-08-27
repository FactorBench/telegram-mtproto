'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

function _ref2(e) {
  return e;
}

function _ref3(e) {
  return e;
}

var Switch = exports.Switch = (patterns, protector = _ref2) => (matches, mProtector = _ref3) => (...data) => {
  var keyList = Object.keys(patterns);
  var normalized = protector(...data);
  for (var _iterator = keyList, _isArray = Array.isArray(_iterator), _i = 0, _iterator = _isArray ? _iterator : _iterator[Symbol.iterator]();;) {
    var _ref;

    if (_isArray) {
      if (_i >= _iterator.length) break;
      _ref = _iterator[_i++];
    } else {
      _i = _iterator.next();
      if (_i.done) break;
      _ref = _i.value;
    }

    var key = _ref;

    console.log('[Switch]', { key });
    if (patterns[key](normalized)) console.log('[Switch]', { keyList, normalized });
    return mProtector(matches[key]);
  }
};

exports.default = Switch;
//# sourceMappingURL=switch.js.map