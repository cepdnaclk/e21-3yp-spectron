import { body, validationResult } from 'express-validator'

export const contactValidator = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters.'),
  body('email')
    .trim()
    .isEmail()
    .withMessage('A valid email address is required.')
    .normalizeEmail(),
  body('company')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 150 })
    .withMessage('Company must be 150 characters or fewer.'),
  body('phone')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 40 })
    .withMessage('Phone must be 40 characters or fewer.'),
  body('industry')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 120 })
    .withMessage('Industry must be 120 characters or fewer.'),
  body('selectedPackage')
    .optional({ checkFalsy: true })
    .trim()
    .isIn(['Deployment', 'Platform'])
    .withMessage('Selected package must be Deployment or Platform.'),
  body('recommendedSensors')
    .optional()
    .isArray({ max: 10 })
    .withMessage('Recommended sensors must be an array.'),
  body('recommendedSensors.*')
    .optional()
    .isString()
    .withMessage('Each recommended sensor must be a string.'),
  body('useCaseSummary')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 500 })
    .withMessage('Use case summary must be 500 characters or fewer.'),
  body('deviceCount')
    .optional({ checkFalsy: true })
    .isInt({ min: 1, max: 100000 })
    .withMessage('Device count must be a positive number.'),
  body('devices')
    .optional({ checkFalsy: true })
    .isInt({ min: 1, max: 100000 })
    .withMessage('Device count must be a positive number.'),
  body('needsIntegration')
    .optional()
    .isBoolean()
    .withMessage('Needs integration must be true or false.'),
  body('message')
    .trim()
    .isLength({ min: 10, max: 2000 })
    .withMessage('Message must be between 10 and 2000 characters.'),
]

export function validateRequest(req, res, next) {
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
