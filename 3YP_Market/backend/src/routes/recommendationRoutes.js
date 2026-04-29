import { Router } from 'express'
import { createSensorRecommendation } from '../controllers/recommendationController.js'
import {
  sensorRecommendationValidator,
  validateSensorRecommendation,
} from '../validators/sensorRecommendationValidator.js'

const router = Router()

router.post('/', sensorRecommendationValidator, validateSensorRecommendation, createSensorRecommendation)

export default router
