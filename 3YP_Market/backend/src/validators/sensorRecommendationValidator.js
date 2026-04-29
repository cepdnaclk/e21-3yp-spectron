import { body, validationResult } from 'express-validator'

export const sensorRecommendationValidator = [
  body('purpose')
    .trim()
    .isLength({ min: 15, max: 1200 })
    .withMessage('Purpose must be between 15 and 1200 characters.'),
  body('industry')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 120 })
    .withMessage('Industry must be 120 characters or fewer.'),
  body('environment')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 80 })
    .withMessage('Environment must be 80 characters or fewer.'),
  body('devices')
    .optional({ checkFalsy: true })
    .isInt({ min: 1, max: 100000 })
    .withMessage('Devices must be a positive number.'),
  body('needsIntegration')
    .optional()
    .isBoolean()
    .withMessage('Needs integration must be true or false.'),
]

export function validateSensorRecommendation(req, res, next) {
  const errors = validationResult(req)

  if (errors.isEmpty()) {
    return next()
  }

  return res.status(422).json({
    success: false,
    message: 'Validation failed.',
    errors: errors.array().map((error) => ({
      field: error.path,
      message: error.msg,
    })),
  })
}
