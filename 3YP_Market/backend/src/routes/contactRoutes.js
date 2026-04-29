import { Router } from 'express'
import { createContact } from '../controllers/contactController.js'
import { contactValidator, validateRequest } from '../validators/contactValidator.js'

const router = Router()

router.post('/', contactValidator, validateRequest, createContact)

export default router
