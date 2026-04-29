import nodemailer from 'nodemailer'
import { env } from '../config/env.js'

const transporter = nodemailer.createTransport({
  host: env.smtp.host,
  port: env.smtp.port,
  secure: env.smtp.secure,
  auth: {
    user: env.smtp.user,
    pass: env.smtp.pass,
  },
})

export async function sendAdminNotification(contact) {
  return transporter.sendMail({
    from: env.mailFrom,
    to: env.adminEmail,
    replyTo: contact.email,
    subject: `New SPECTRON demo request from ${contact.name}`,
    text: buildAdminText(contact),
    html: buildAdminHtml(contact),
  })
}

export async function sendAutoReply(contact) {
  return transporter.sendMail({
    from: env.mailFrom,
    to: contact.email,
    subject: 'We received your SPECTRON demo request',
    text: `Hi ${contact.name},\n\nThanks for contacting SPECTRON. We received your demo request and will get back to you soon.\n\nSPECTRON Team`,
    html: `
      <p>Hi ${escapeHtml(contact.name)},</p>
      <p>Thanks for contacting <strong>SPECTRON</strong>. We received your demo request and will get back to you soon.</p>
      <p>SPECTRON Team</p>
    `,
  })
}

function buildAdminText(contact) {
  return [
    'New SPECTRON contact/demo request',
    '',
    `Name: ${contact.name}`,
    `Email: ${contact.email}`,
    `Company: ${contact.company || '-'}`,
    `Phone: ${contact.phone || '-'}`,
    `Industry: ${contact.industry || '-'}`,
    `Device count: ${contact.device_count || '-'}`,
    '',
    'Message:',
    contact.message,
  ].join('\n')
}

function buildAdminHtml(contact) {
  return `
    <h2>New SPECTRON contact/demo request</h2>
    <table cellpadding="8" cellspacing="0" border="0">
      <tr><td><strong>Name</strong></td><td>${escapeHtml(contact.name)}</td></tr>
      <tr><td><strong>Email</strong></td><td>${escapeHtml(contact.email)}</td></tr>
      <tr><td><strong>Company</strong></td><td>${escapeHtml(contact.company || '-')}</td></tr>
      <tr><td><strong>Phone</strong></td><td>${escapeHtml(contact.phone || '-')}</td></tr>
      <tr><td><strong>Industry</strong></td><td>${escapeHtml(contact.industry || '-')}</td></tr>
      <tr><td><strong>Device count</strong></td><td>${escapeHtml(String(contact.device_count || '-'))}</td></tr>
    </table>
    <h3>Message</h3>
    <p>${escapeHtml(contact.message).replace(/\n/g, '<br>')}</p>
  `
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
