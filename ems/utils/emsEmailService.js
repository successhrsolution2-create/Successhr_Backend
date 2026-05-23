const sendEmsEmail = async ({ to, subject, html, text }) => {
  if (!process.env.EMS_SMTP_HOST || !process.env.EMS_SMTP_USER) {
    return {
      skipped: true,
      to,
      subject,
      reason: 'EMS SMTP is not configured'
    }
  }

  // SMTP delivery can be wired here without touching the rest of the app.
  return {
    queued: true,
    to,
    subject,
    html,
    text
  }
}

module.exports = { sendEmsEmail }
