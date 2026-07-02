# HubSpot newsletter signup setup

This repo now includes a HubSpot-ready signup flow for the ShoreVest homepage in English and Chinese.

## Files

- `assets/js/newsletter-signup.js`: submits the homepage signup form to the HubSpot Forms API.
- `assets/email/welcome-template.html`: suggested English welcome email.
- `assets/email/welcome-template-cn.html`: suggested Chinese welcome email.
- `index.html`: English signup form markup.
- `index_cn.html`: Chinese signup form markup.

## Required HubSpot setup

### 1. Create two HubSpot forms

Create one form for each language and collect these fields:

- Email
- First name
- Last name
- Company
- Job title
- Country
- Newsletter language (internal property)
- Newsletter source (internal property)

Recommended internal property names:

- `newsletter_language`
- `newsletter_source`

### 2. Update the form IDs in `assets/js/newsletter-signup.js`

Replace these placeholders:

- `YOUR_HUBSPOT_PORTAL_ID`
- `YOUR_ENGLISH_FORM_ID`
- `YOUR_CHINESE_FORM_ID`

If you want HubSpot subscription tracking enabled, also set:

- `legalConsentSubscriptionTypeId`

### 3. Create the welcome email in HubSpot

Use the HTML in:

- `assets/email/welcome-template.html`
- `assets/email/welcome-template-cn.html`

Quick visual references are also included at:

- `assets/email/previews/welcome-template-preview.svg`
- `assets/email/previews/welcome-template-cn-preview.svg`

### 4. Optional redirect

If you want a dedicated thank-you page, set `redirectUrl` in `assets/js/newsletter-signup.js`.

## Notes

- The site validates required fields in the browser before submitting.
- If the HubSpot IDs are not configured, the site shows a clear configuration warning instead of silently failing.
- The payload includes the current page URL, page title, HubSpot tracking cookie, language, and source.
