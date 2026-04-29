import { asyncHandler } from '../utils/asyncHandler.js'
import { getSensorCatalog, recommendSensors } from '../services/aiRecommendationService.js'

export const createSensorRecommendation = asyncHandler(async (req, res) => {
  const recommendation = await recommendSensors({
    purpose: req.body.purpose,
    industry: req.body.industry || null,
    environment: req.body.environment || null,
    devices: req.body.devices ? Number(req.body.devices) : null,
    needsIntegration: req.body.needsIntegration === true || req.body.needsIntegration === 'true',
  })

  res.json({
    success: true,
    data: {
      recommendation,
      sensorCatalog: getSensorCatalog(),
    },
  })
})
