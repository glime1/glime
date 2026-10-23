# GLIME Official Integration Guide

**For clients of [glime.online](https://glime.online)**

This guide explains how to connect **WhatsApp Business**, **Instagram** and **Razorpay** to GLIME, how **UPI** fits in, and how to verify payments safely. Everything here describes what GLIME actually supports today. If a feature is not listed, it is not available yet.

---

## 1. Quick overview

| What you want | Supported in GLIME? | Where to do it |
| --- | --- | --- |
| Connect WhatsApp Business | Yes | **WhatsApp Sales** page → **Connect** |
| Connect Instagram | Yes | **Instagram Sales** page → **Connect Instagram** |
| Connect your own Razorpay account | Yes | **Settings → Connector → Payments → Razorpay** |
| Pay GLIME (plans, wallet, AI credits) | Yes, through Razorpay Checkout | **Billing** page |
| A separate "UPI connector" | **No** (see Section 5) | — |

Two things to know before you start:

- Some modules (for example the WhatsApp and Instagram AI Sales Specialists) are paid modules. If a module looks locked, it has not been activated on your account yet. Contact GLIME support.
- You never need to type an API secret, password or access token into GLIME. All connections use the official sign-in screens of Meta and Razorpay.

---

## 2. Connect WhatsApp Business

GLIME uses Meta's official WhatsApp Business sign-up flow. Your access token stays on GLIME's servers and is never shown in the browser.

### Before you start

- A GLIME account that is signed in.
- A Facebook / Meta account that can manage your business's WhatsApp Business account.
- The WhatsApp phone number you want to use, and access to it for verification if Meta asks.

### Steps

1. Sign in to GLIME and open **WhatsApp Sales** from the left menu.
2. Click **Connect** (top right).
3. In the window that opens, click **Continue with Meta →**.
4. A Meta window opens. Follow Meta's screens to choose or create your business account and WhatsApp number. Read the permissions Meta shows and approve them.
5. When Meta finishes, GLIME says *"Verifying Meta connection…"* and then *"WhatsApp connected successfully."* The page reloads.
6. Check the badge at the top: it should say **● WhatsApp connected**.

### Permissions

The permissions are shown by Meta on its own screen during step 4. Approve only what Meta asks for this flow. You can change or remove GLIME's access later from your Meta Business settings.

### After connecting

- **AI sales mode** (per chat): **AUTO** (AI can send), **AI + APPROVAL** (you approve each reply), **MANUAL** (you send).
- **24-hour window:** WhatsApp only lets you send free-form messages within 24 hours of the customer's last message. When the window is closed, GLIME shows a **"24h window closed"** label.
- **Attachments:** images (JPEG/PNG up to 5 MB), video (MP4 up to 16 MB), audio (MP3/OGG up to 16 MB), stickers (WebP up to 500 KB) and documents (PDF, TXT, CSV, JSON, DOC/DOCX, XLS/XLSX, PPT/PPTX up to 25 MB).
- **Voice calls are not supported** in GLIME's WhatsApp integration.
- **Deleting in GLIME does not delete from the customer's phone.**

### Disconnect

Go to **Settings → Channels → WhatsApp → Disconnect WhatsApp**. This stops GLIME's connection. Saved customer and conversation data is not deleted.

Official documentation: [WhatsApp Business Platform](https://developers.facebook.com/docs/whatsapp/) · [Embedded Signup](https://developers.facebook.com/docs/whatsapp/embedded-signup)

---

## 3. Connect Instagram

### Before you start

- A GLIME account that is signed in.
- The Instagram account you want to connect, and its login. Meta's Instagram messaging features have account-type requirements (for example a professional account). Check Meta's documentation below for the current rules, because these are set by Meta, not GLIME.

### Steps

1. Open **Instagram Sales** from the left menu.
2. Click **Connect Instagram** (top right).
3. GLIME takes you to Instagram / Meta's official authorization page. Sign in if asked and approve the permissions shown.
4. You are returned to GLIME. The top badge should show **● Connected @yourusername**.

### If your connection expires

If the badge says **● Token expired**, click **Reconnect** (the button changes from "Connect Instagram") and repeat the steps above.

### After connecting

- Use the same three AI sales modes as WhatsApp (AUTO, AI + APPROVAL, MANUAL).
- Instagram replies are limited to 2000 characters.

### Disconnect

Go to **Settings → Channels → Instagram → Disconnect Instagram**. Saved conversations are not deleted.

Official documentation: [Instagram Platform](https://developers.facebook.com/docs/instagram-platform/)

---

## 4. Connect your own Razorpay account

There are **two different Razorpay uses** in GLIME. Do not mix them up:

| | A. Your Razorpay account (this section) | B. Paying GLIME (Billing page) |
| --- | --- | --- |
| Purpose | Let GLIME work with payments of **your** business | You pay GLIME for plans, wallet, AI credits |
| Where | Settings → Connector | Billing |
| Whose money | Your customers → your Razorpay account | You → GLIME |

### Before you start

- An active **Razorpay account** with Live mode access for your business.
- Permission to approve third-party apps on that Razorpay account.

### Steps

1. Open **Settings** → **Connector**.
2. Find **Razorpay** under **Payments** and click **Connect**.
3. GLIME sends you to Razorpay's official authorization page (`auth.razorpay.com`). Sign in to Razorpay and approve.
4. You return to **Settings → Connector** and see *"Razorpay connected successfully."* The card shows **Connected ✓**, your account and the mode (Live).

You do **not** enter your Razorpay Key ID or Key Secret anywhere in GLIME.

### Permissions you control

After connecting, the Razorpay card shows a **Permissions** list with ON/OFF switches:

| Permission | What it allows |
| --- | --- |
| Razorpay — Read payments | GLIME can read payments |
| Razorpay — Create payments | GLIME can create payments (marked "changes data") |
| Razorpay — Create refunds | GLIME can create refunds (marked "changes data") |

Recommended: keep **Create payments** and **Create refunds** OFF unless you specifically need them. Changes apply immediately and are enforced on the server. If a switch says **reconnect to enable**, disconnect and connect again to grant that access.

### Disconnect

On the Razorpay card, click **Disconnect Razorpay**. GLIME removes its saved Razorpay access and permissions. Your payments in Razorpay are not affected. As an extra precaution, you can also review and remove GLIME under the authorized apps in your Razorpay dashboard.

### Paying GLIME on the Billing page

On **Billing**, GLIME opens the official **Razorpay Checkout** window when you buy a plan, add wallet balance (minimum ₹100), buy AI credits or add storage. After you pay, GLIME confirms the payment securely with the provider and refreshes your status. If it still shows pending, wait a moment and click **Refresh**.

Official documentation: [Razorpay Docs](https://razorpay.com/docs/)

---

## 5. UPI: what is and is not supported

GLIME does **not** have a separate "UPI integration" that you connect with a UPI ID.

- **Paying GLIME:** payments go through Razorpay Checkout. Which payment methods appear inside that window is decided by Razorpay.
- **Your own customer payments:** collected through your Razorpay account (Section 4). GLIME does not take or store your personal UPI ID for this.
- **Partner Program only:** partners can save a UPI ID or bank account on the partner dashboard so commissions can be paid out. This is for payouts to partners, not for collecting customer payments.

**Never send your UPI PIN to anyone.** GLIME will never ask for it. Be careful when sharing your UPI ID with customers; confirm the payment before you ship (Section 6).

Official information: [NPCI – UPI](https://www.npci.org.in/what-we-do/upi/product-overview)

---

## 6. Payment verification (very important)

**A screenshot is not proof of payment.** Screenshots can be edited or faked. Never ship goods or mark an order as paid because a customer sent a screenshot, a "payment successful" photo, or a forwarded SMS.

### How GLIME handles payments

- In **Orders**, a payment is shown as **Paid** only when the payment provider confirms it. You cannot mark an order as paid by hand. The order form only offers **"No online payment needed"** or **"Payment pending"**.
- Open an order and look at **Payment**. Each recorded payment shows the status, amount, method, provider, **Transaction ID**, time, and **Verification**: **✓ Verified** (signature checked) and **✓ Reconciled**.
- If no payment is recorded, GLIME says so. Treat the order as **unpaid**.

### Your checklist before shipping

1. The order's payment status is **Paid** (not Pending or Processing).
2. The payment row shows **✓ Verified**.
3. The **Transaction ID** and amount match the payment in your **Razorpay Dashboard** (or your bank statement).
4. The amount equals the order total.
5. If any of these do not match, **do not ship**. Ask the customer to pay again through an official payment link, or check with Razorpay.

Payments sent directly to a personal UPI ID or bank account are **not** verified by GLIME. Confirm those yourself in your bank app or statement, never from a customer's screenshot.

---

## 7. Keeping your credentials safe

- **Never share** passwords, API keys, Key Secrets, webhook secrets, OTPs, UPI PINs or access tokens with anyone. This includes chats, DMs, email, and GLIME support. GLIME will never ask for them.
- **Never paste secrets** into the AI chat, Knowledge Base, service descriptions or notes.
- Connect only through the **official screens** of Meta, Instagram and Razorpay. Check the address bar before you sign in.
- Use a strong, unique password and keep your Facebook / Meta and Razorpay accounts secured with two-step verification.
- Keep **Create payments** and **Create refunds** OFF unless you need them.
- If you suspect a leak: disconnect the integration in GLIME, then revoke GLIME's access in Meta / Razorpay, change your passwords, and contact GLIME support.
- Remove access for team members who leave your business.

---

## 8. Troubleshooting

### General

| Problem | What to do |
| --- | --- |
| "Your session has expired. Please sign in again." | Sign in again and retry. |
| "Unable to reach GLIME right now." | Check your internet, refresh the page, try again. |
| Module looks locked | The module is not active on your account. Contact GLIME support. |

### WhatsApp

| Message / symptom | What to do |
| --- | --- |
| "Could not load the Meta SDK" | Check your connection. Disable ad blockers for this page and try again. |
| "Meta signup was cancelled." | You closed the Meta window. Click **Continue with Meta →** again. |
| "Meta configuration is missing on the server." | A GLIME setup issue. Contact GLIME support. |
| Badge: **● Not connected** | Click **Connect** and complete the Meta flow. |
| Badge: **● Status unavailable** | Click the refresh button. If it stays, contact GLIME support. |
| "WhatsApp is not connected" in the chat box | Connect WhatsApp first. You can read history but cannot send. |
| **24h window closed** | The customer must message you first before you can send free-form replies. |
| "WhatsApp did not confirm this send" | The message may still have been delivered. Check the chat before sending again. Do not retry blindly. |
| Attachment rejected | Check the file type and size limits in Section 2. |

### Instagram

| Message / symptom | What to do |
| --- | --- |
| "Unable to start Instagram connection." | Refresh, sign in again and retry. If it repeats, contact GLIME support. |
| **● Token expired** | Click **Reconnect** and approve again. |
| **● Check failed** | Click refresh. If it stays, reconnect or contact GLIME support. |

### Razorpay

| Message | Meaning and fix |
| --- | --- |
| "Razorpay authorization was cancelled." | You declined on Razorpay. Click **Connect** and approve. |
| "The authorization link expired." | Start again from **Connect**. |
| "The authorization could not be completed." | Start again from **Connect**. |
| "Razorpay did not complete the authorization." | Try again. If it repeats, contact GLIME support. |
| "This Razorpay account is already connected to another GLIME account." | One Razorpay account can be linked to one GLIME account. Disconnect it there first, or contact GLIME support. |
| "Your GLIME account is not active." | Contact GLIME support. |
| "Razorpay connection is not configured yet." | A GLIME setup issue. Contact GLIME support. |
| "Razorpay access needs attention. Reconnect to continue." | Disconnect and connect again. |
| "Razorpay connection could not be verified." | The sign-in did not complete. Try **Connect** again. |
| Payment on Billing stays pending | Wait a minute, click **Refresh**. If it is still pending and money left your account, contact GLIME support with the transaction ID. |

### Contact GLIME support

Use the [Contact page](https://glime.online/contact.html). Never include secrets or UPI PINs in your message.

---

## 9. Official documentation

- WhatsApp Business Platform: https://developers.facebook.com/docs/whatsapp/
- WhatsApp Embedded Signup: https://developers.facebook.com/docs/whatsapp/embedded-signup
- Instagram Platform: https://developers.facebook.com/docs/instagram-platform/
- Razorpay Docs: https://razorpay.com/docs/
- NPCI UPI: https://www.npci.org.in/what-we-do/upi/product-overview

Third-party rules, screens and account requirements can change. If Meta, Instagram or Razorpay differ from this guide, follow their official documentation.

---

*GLIME Official Integration Guide — covers only integrations currently supported by GLIME.*
