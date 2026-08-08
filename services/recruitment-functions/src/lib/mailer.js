'use strict';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function text(value) {
  return String(value == null ? '' : value).trim();
}

function createMailer({ credential, mailbox, enabled = true, fetchImpl = globalThis.fetch } = {}) {
  if (!credential) throw new Error('mail credential unavailable');
  if (!mailbox) throw new Error('recruitment mailbox unavailable');
  if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable');

  async function send(to, subject, html) {
    if (!enabled) return { skipped: true };
    const token = await credential.getToken('https://graph.microsoft.com/.default');
    if (!token || !token.token) throw new Error('graph token unavailable');

    const endpoint = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/sendMail`;
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token.token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: 'HTML', content: html },
          toRecipients: [{ emailAddress: { address: to } }]
        },
        saveToSentItems: true
      })
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      const error = new Error(`graph sendMail failed: ${response.status}`);
      error.status = response.status;
      error.detail = detail.slice(0, 500);
      throw error;
    }
    return { sent: true };
  }

  async function sendDocumentsReady(application) {
    const role = text(application.roleTitle) || text(application.roleId) || 'ShoreVest role';
    const reference = text(application.applicationReference);
    const candidateName = text(application.candidateName) || 'Candidate';
    const candidateEmail = text(application.candidateEmail);
    if (!candidateEmail) throw new Error('candidate email unavailable');

    const hrSubject = `New application: ${role} — ${candidateName}`;
    const hrHtml = [
      '<p>A new application is ready for review.</p>',
      `<p><strong>Role:</strong> ${escapeHtml(role)}<br>`,
      `<strong>Candidate:</strong> ${escapeHtml(candidateName)}<br>`,
      `<strong>Email:</strong> ${escapeHtml(candidateEmail)}<br>`,
      application.candidateTelephone ? `<strong>Telephone:</strong> ${escapeHtml(application.candidateTelephone)}<br>` : '',
      application.candidateLocation ? `<strong>Location:</strong> ${escapeHtml(application.candidateLocation)}<br>` : '',
      `<strong>Application reference:</strong> ${escapeHtml(reference)}</p>`,
      application.coverNote ? `<p><strong>Application statement</strong><br>${escapeHtml(application.coverNote).replace(/\n/g, '<br>')}</p>` : '',
      '<p>The CV has passed the recruitment upload pipeline and is available through the internal recruitment record. It is not attached to this email.</p>'
    ].join('');

    const confirmationSubject = `ShoreVest application received — ${role}`;
    const confirmationHtml = [
      `<p>Dear ${escapeHtml(candidateName)},</p>`,
      `<p>Thank you for your interest in ShoreVest. We have received your application for <strong>${escapeHtml(role)}</strong>.</p>`,
      reference ? `<p>Your application reference is <strong>${escapeHtml(reference)}</strong>.</p>` : '',
      '<p>If your experience aligns with the role, a member of our team will contact you regarding next steps.</p>',
      '<p>ShoreVest Careers</p>'
    ].join('');

    await send(mailbox, hrSubject, hrHtml);
    await send(candidateEmail, confirmationSubject, confirmationHtml);
    return { sent: true };
  }

  async function sendOutbox(event, application) {
    if (!event || !application) throw new Error('notification context unavailable');
    if (event.type === 'DocumentsReady') return sendDocumentsReady(application);
    return { skipped: true };
  }

  return { send, sendOutbox };
}

module.exports = { createMailer };
