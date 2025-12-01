const { ZodError } = require('zod');

// Generic zod validator for req.body
module.exports = function validate(schema) {
  return (req, res, next) => {
    try {
      req.validatedBody = schema.parse(req.body);
      next();
    } catch (e) {
      if (e instanceof ZodError) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos', details: e.errors }, requestId: req.requestId });
      }
      next(e);
    }
  };
};
