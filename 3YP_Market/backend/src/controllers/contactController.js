import { env } from '../config/env.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { createContactRequest, updateEmailStatus } from '../services/contactService.js'
import { sendAdminNotification, sendAutoReply } from '../services/emailService.js'

export const createContact = asyncHandler(async (req, res) => {
  const requestedDeviceCount = req.body.deviceCount || req.body.devices

  const payload = {
    name: req.body.name,
    email: req.body.email,
    company: req.body.company || null,
    phone: req.body.phone || null,
    industry: req.body.industry || null,
    deviceCount: requestedDeviceCount ? Number(requestedDeviceCount) : null,
    message: req.body.message,
    metadata: {
      ip: req.ip,
      userAgent: req.get('user-agent') || null,
      origin: req.get('origin') || null,
      selectedPackage: req.body.selectedPackage || null,
      recommendedSensors: req.body.recommendedSensors || [],
      useCaseSummary: req.body.useCaseSummary || null,
      needsIntegration: req.body.needsIntegration ?? null,
    },
  }

  const contact = await createContactRequest(payload)

  let adminEmailSent = false
  let autoReplySent = false
  let emailError = null

  try {
    await sendAdminNotification(contact)
    adminEmailSent = true

    if (env.sendAutoReply) {
      await sendAutoReply(contact)
      autoReplySent = true
    }
  } catch (error) {
    emailError = error.message
  }

  await updateEmailStatus(contact.id, {
    adminEmailSent,
    autoReplySent,
    emailError,
  })

  return res.status(adminEmailSent ? 201 : 202).json({
    success: true,
    message: adminEmailSent
      ? 'Demo request received successfully.'
      : 'Demo request saved, but email notification could not be sent.',
    data: {
      id: contact.id,
      adminEmailSent,
      autoReplySent,
    },
  })
})
