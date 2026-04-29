import { query } from '../config/db.js'

export async function createContactRequest(data) {
  const result = await query(
    `INSERT INTO contact_requests
      (name, email, company, phone, industry, device_count, message, metadata)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      data.name,
      data.email,
      data.company,
      data.phone,
      data.industry,
      data.deviceCount,
      data.message,
      data.metadata,
    ],
  )

  return result.rows[0]
}

export async function updateEmailStatus(id, { adminEmailSent, autoReplySent, emailError }) {
  const result = await query(
    `UPDATE contact_requests
     SET admin_email_sent = $2,
         auto_reply_sent = $3,
         email_error = $4
     WHERE id = $1
     RETURNING *`,
    [id, adminEmailSent, autoReplySent, emailError],
  )

  return result.rows[0]
}
