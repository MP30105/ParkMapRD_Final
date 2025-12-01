const { v4: uuidv4 } = require('uuid');

module.exports = function requestId() {
  return (req, res, next) => {
    req.requestId = uuidv4();
    res.setHeader('X-Request-Id', req.requestId);
    next();
  };
};
