const { logger } = require('../logging');

module.exports = function errorHandler() {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, next) => {
    const status = err.status || 500;
    const code = err.code || (status === 400 ? 'BAD_REQUEST' : status === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR');
    if (logger && logger.error) {
      logger.error('Request failed', { requestId: req.requestId, status, code, message: err.message, stack: err.stack });
    } else {
      console.error('[errorHandler]', status, code, err.message);
    }
    res.status(status).json({ success: false, error: { code, message: err.message }, requestId: req.requestId });
  };
};
