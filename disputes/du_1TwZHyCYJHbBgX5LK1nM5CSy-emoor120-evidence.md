# Stripe dispute evidence — Erin Strohfeldt (emoor120@eq.edu.au)

**Submit before:** 2 September 2026 (23:59 UTC)  
**Dispute ID:** `du_1TwZHyCYJHbBgX5LK1nM5CSy`  
**Amount:** USD $30.00  
**Reason claimed:** Fraudulent  
**Stripe Dashboard:** Payments → Disputes → `du_1TwZHyCYJHbBgX5LK1nM5CSy`

---

## Summary (paste into “Product description” / opening statement)

The cardholder, Erin Strohfeldt (Emoor120@eq.edu.au), voluntarily registered for BookAI, completed Stripe Checkout for a **BookAI Premium** subscription with a disclosed **2-day free trial**, used the product during the trial, and was charged **USD $30.00** on **19 July 2026** when the trial converted to a paid monthly subscription — exactly as disclosed at checkout. This is not unauthorized fraud; it is a legitimate subscription charge after a free trial.

---

## Customer & account

| Field | Value |
|-------|--------|
| Name | Erin Strohfeldt |
| Email | Emoor120@eq.edu.au |
| BookAI user ID | cmrohu82v000004lctffe6t61 |
| Account created | 16 Jul 2026, 23:39 UTC |
| Stripe customer | cus_Uts0PErQUbTXrR |
| Subscription | sub_1Tu4HbCYJHbBgX5Lb7Z2yOiO (Premium, $30/mo) |

---

## Payment timeline

1. **16 Jul 2026** — User creates BookAI account with email Emoor120@eq.edu.au  
2. **17 Jul 2026, 05:25 UTC** — User completes **Stripe Checkout** (session `cs_live_b1WJwz8RIQgv6m1l1xvwJjPUiOhChP1dDIURwJd0LWWGQWnkq6iKuTfmAU`) for Premium subscription with **2-day free trial** ($0 due at signup)  
3. **17–19 Jul 2026** — Free trial period (trial_end: 19 Jul 2026, 06:25 UTC)  
4. **19 Jul 2026, 06:25 UTC** — First paid invoice **CKOKDVIN-0002** charged **$30.00** for “1 × BookAI Premium (at $30.00 / month)” — billing_reason: `subscription_cycle` (post-trial renewal)  
5. **24 Jul 2026** — Cardholder filed dispute `du_1TwZHyCYJHbBgX5LK1nM5CSy` claiming “fraudulent”

---

## Proof of service delivery / product use

The customer **accessed and used** BookAI during the trial period:

- **Book created:** “My Plan when I feel sick or worried” (16 Jul 2026, 23:43 UTC)  
- **Generation started:** FULL_BOOK job initiated 16 Jul 2026, 23:43 UTC  
- **Plan active:** Premium (ENTERPRISE) — 10,000 pages/month, 180 min audio/month limits applied  
- **Public book URL:** https://www.trybookai.com/books/my-plan-when-i-feel-sick-or-worried-f37d170c  

Service was available and actively used (account activity, book creation, AI generation initiated).

---

## Authorization evidence (Stripe)

Attach in Stripe dispute form:

| Document | Link / ID |
|----------|-----------|
| Paid invoice ($30) | Invoice **CKOKDVIN-0002** — `in_1TuoADCYJHbBgX5Lh1XYBCEx` |
| Hosted invoice (customer receipt) | https://invoice.stripe.com/i/acct_1TrmDOCYJHbBgX5L/live_YWNjdF8xVHJtRE9DWUpIYkJnWDVMLF9VdWRSeU03WHZXTUZuVWtPeDQzVjdJMVNtUEhLRHF3LDE3NTQwNzUzOA0200FO2jvB12?s=ap |
| Trial invoice ($0) | Invoice **CKOKDVIN-0001** — `in_1Tu4HYCYJHbBgX5LcGEDoBph` |
| Checkout session | `cs_live_b1WJwz8RIQgv6m1l1xvwJjPUiOhChP1dDIURwJd0LWWGQWnkq6iKuTfmAU` (status: complete, mode: subscription) |
| Stripe receipt | https://pay.stripe.com/receipts/invoices/CAcQARoXChVhY2N0XzFUcm1ET0NZSkhiQmdYNUwo686L0wYyBlW7I5Wl-zosFtKQaBdy1fMdhDhyUiekcULMNklgi_cyHgaC-3C1AGb6yDUT6OQOpAjEdCM?s=ap |

The cardholder entered payment details in Stripe Checkout and agreed to recurring billing after the trial.

---

## Terms & cancellation policy (paste into “Cancellation policy” / “Refund policy”)

**Terms of Service:** https://www.trybookai.com/terms (last updated 14 Jul 2026)

Relevant excerpt — Section 5. Subscriptions and refunds:

> Paid plans are billed in advance. You may cancel at any time. Refunds are offered at our discretion unless required by law. Free trial limits are described on the pricing and billing pages.

**Pricing / trial disclosure:** Premium includes a 2-day free trial; after the trial, billing is USD $30/month. This is shown on the billing page and in Stripe Checkout before payment method collection.

Customer may cancel anytime via Stripe Customer Portal from Dashboard → Billing.

---

## Suggested “Customer communication” note

No direct support ticket on file. Customer signed up with their school email (eq.edu.au), completed checkout themselves, and used the product (book + generation). No refund request was received before the dispute.

---

## Dispute response type

**Recommended:** Challenge as **legitimate subscription charge** — customer authorized checkout, received disclosed trial, was billed $30 when trial ended, and used the service.

**Not recommended:** Accept dispute (you lose $30 + dispute fee).

---

## How to submit in Stripe

1. Go to **Stripe Dashboard → Payments → Disputes**  
2. Open dispute `du_1TwZHyCYJHbBgX5LK1nM5CSy`  
3. Click **Submit evidence**  
4. Paste **Summary** above into product description  
5. Upload: hosted invoice PDF, checkout/receipt links (screenshot if needed)  
6. Paste **Terms** excerpt for cancellation/refund policy  
7. Paste **Proof of service delivery** section  
8. Submit before **2 Sep 2026**
