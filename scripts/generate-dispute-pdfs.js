const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const outDir = path.join(__dirname, "..", "disputes", "emoor120-upload");
fs.mkdirSync(outDir, { recursive: true });

function writePdf(filename, sections) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const out = path.join(outDir, filename);
    const stream = fs.createWriteStream(out);
    doc.pipe(stream);

    doc
      .fontSize(16)
      .font("Helvetica-Bold")
      .text(sections.title, { align: "center" });
    doc.moveDown(0.5);
    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor("#666")
      .text(`Generated: ${new Date().toISOString().slice(0, 10)} | Dispute du_1TwZHyCYJHbBgX5LK1nM5CSy`, {
        align: "center",
      });
    doc.moveDown(1.5);
    doc.fillColor("#000");

    for (const block of sections.blocks) {
      if (block.heading) {
        doc.fontSize(12).font("Helvetica-Bold").text(block.heading);
        doc.moveDown(0.4);
      }
      doc.fontSize(10).font("Helvetica");
      const text = block.body.replace(/\*\*/g, "");
      doc.text(text, { lineGap: 4, align: "left" });
      doc.moveDown(1);
    }

    doc.end();
    stream.on("finish", () => {
      console.log("Created", out);
      resolve(out);
    });
    stream.on("error", reject);
  });
}

const meta = {
  customer: "Erin Strohfeldt (Emoor120@eq.edu.au)",
  dispute: "du_1TwZHyCYJHbBgX5LK1nM5CSy",
  amount: "USD $30.00",
  chargeDate: "19 July 2026",
};

async function main() {
  await writePdf("01-customer-communication.pdf", {
    title: "Customer Communication — BookAI",
    blocks: [
      {
        heading: "Dispute reference",
        body: `Customer: ${meta.customer}\nDispute ID: ${meta.dispute}\nDisputed amount: ${meta.amount}\nCharge date: ${meta.chargeDate}`,
      },
      {
        heading: "Summary",
        body: `No email, chat, or support ticket was received from this customer requesting a refund or reporting unauthorized billing before the dispute was filed on 24 July 2026.`,
      },
      {
        heading: "Account activity (self-service)",
        body: `The customer independently registered and used BookAI without contacting support:

• 16 Jul 2026 — Account created with email Emoor120@eq.edu.au
• 16 Jul 2026 — Created book: "My Plan when I feel sick or worried"
• 16 Jul 2026 — Started AI book generation (FULL_BOOK job)
• 17 Jul 2026 — Completed Stripe Checkout for Premium subscription (2-day free trial)
• 19 Jul 2026 — $30.00 charged when free trial converted to paid subscription (Invoice CKOKDVIN-0002)

The customer had full access to cancel via Dashboard → Billing or the Stripe Customer Portal at any time. No cancellation or refund request was made prior to the dispute.`,
      },
      {
        heading: "Conclusion",
        body: `This charge reflects authorized recurring subscription billing after a disclosed free trial, not an unrecognized or fraudulent transaction. The customer actively signed up and used the service before being billed.`,
      },
    ],
  });

  await writePdf("02-customer-authorization-signature.pdf", {
    title: "Customer Authorization — Stripe Checkout",
    blocks: [
      {
        heading: "Dispute reference",
        body: `Customer: ${meta.customer}\nDispute ID: ${meta.dispute}\nDisputed amount: ${meta.amount}`,
      },
      {
        heading: "Authorization method",
        body: `Payment authorization was collected through Stripe Checkout (Stripe-hosted payment page). The cardholder entered their payment details and confirmed subscription enrollment themselves.`,
      },
      {
        heading: "Checkout details",
        body: `Checkout session ID: cs_live_b1WJwz8RIQgv6m1l1xvwJjPUiOhChP1dDIURwJd0LWWGQWnkq6iKuTfmAU
Status: complete
Mode: subscription
Date: 17 July 2026, 05:25 UTC
Customer email: Emoor120@eq.edu.au
Customer name: Erin Strohfeldt
Stripe customer ID: cus_Uts0PErQUbTXrR
Subscription ID: sub_1Tu4HbCYJHbBgX5Lb7Z2yOiO
Product: BookAI Premium — $30.00/month
Trial: 2-day free trial ($0 due at signup)`,
      },
      {
        heading: "Billing address on file",
        body: `19/48 Glen Rd Toowong
Toowong, QLD 4066
Australia`,
      },
      {
        heading: "Trial disclosure",
        body: `At checkout, the customer was shown that BookAI Premium includes a 2-day free trial with $0 due today, followed by recurring billing of USD $30.00 per month unless cancelled. Payment method was collected before trial start as required for subscription conversion.`,
      },
      {
        heading: "Paid charge",
        body: `First paid invoice after trial: CKOKDVIN-0002 (in_1TuoADCYJHbBgX5Lh1XYBCEx)
Amount paid: USD $30.00
Billing reason: subscription_cycle (post-trial renewal)
Paid: 19 July 2026`,
      },
    ],
  });

  await writePdf("03-product-service-description.pdf", {
    title: "Product & Service Description — BookAI",
    blocks: [
      {
        heading: "Service provided",
        body: `BookAI (https://www.trybookai.com) is a software-as-a-service platform for AI-assisted book writing, editing, and audio generation.`,
      },
      {
        heading: "Plan purchased",
        body: `BookAI Premium — monthly subscription
Price: USD $30.00/month
Includes: 10,000 AI-generated pages/month, 3 hours audiobook narration/month, unlimited books, up to 1,000 pages per book, private books, priority generation, PDF/EPUB export, audiobook/podcast/theme music tools.`,
      },
      {
        heading: "Service delivered to this customer",
        body: `Customer account was activated with Premium limits during the 2-day trial and after payment on 19 July 2026.

Delivered access:
• Premium subscription active (ENTERPRISE plan)
• Book created: "My Plan when I feel sick or worried"
• AI generation job initiated
• Public book page: https://www.trybookai.com/books/my-plan-when-i-feel-sick-or-worried-f37d170c

The disputed $30.00 charge is payment for the first paid billing period after the free trial ended.`,
      },
    ],
  });

  await writePdf("04-refund-cancellation-policy.pdf", {
    title: "Refund & Cancellation Policy — BookAI",
    blocks: [
      {
        heading: "Terms of Service",
        body: `Full terms: https://www.trybookai.com/terms
Last updated: 14 July 2026`,
      },
      {
        heading: "Section 5 — Subscriptions and refunds",
        body: `Paid plans are billed in advance. You may cancel at any time. Refunds are offered at our discretion unless required by law. Free trial limits are described on the pricing and billing pages.`,
      },
      {
        heading: "Free trial disclosure",
        body: `BookAI Premium includes a 2-day free trial. During checkout, customers are informed that billing of USD $30.00/month begins after the trial unless they cancel. Payment method is collected at signup to enable seamless conversion to paid subscription.`,
      },
      {
        heading: "How to cancel",
        body: `Customers may cancel at any time from the BookAI dashboard under Billing, which opens the Stripe Customer Portal to manage or cancel their subscription. Cancellation stops future charges; access continues through the current paid period.`,
      },
    ],
  });

  await writePdf("05-dispute-summary.pdf", {
    title: "Dispute Response Summary",
    blocks: [
      {
        heading: "Response to fraudulent claim",
        body: `The cardholder claims this USD $30.00 charge is fraudulent. Evidence demonstrates this is a legitimate subscription payment after an authorized free trial.`,
      },
      {
        heading: "Key facts",
        body: `1. Customer registered with emoor120@eq.edu.au on 16 July 2026
2. Customer completed Stripe Checkout on 17 July 2026 for Premium ($30/mo) with 2-day free trial
3. Customer used the service (book created, AI generation started)
4. Customer was charged $30.00 on 19 July 2026 when trial ended (Invoice CKOKDVIN-0002)
5. Billing address matches: Toowong, QLD 4066, AU
6. No refund request before dispute`,
      },
      {
        heading: "Attached evidence",
        body: `• Paid invoice CKOKDVIN-0002 (PDF)
• Payment receipt (PDF)
• Customer authorization document (Stripe Checkout)
• Product/service description
• Refund & cancellation policy
• Screenshots of checkout and account usage`,
      },
    ],
  });

  // Plain text for access activity log field (paste only)
  const logText = `BookAI Access Activity Log
Customer: Erin Strohfeldt (emoor120@eq.edu.au)
User ID: cmrohu82v000004lctffe6t61
Stripe Customer: cus_Uts0PErQUbTXrR

16 Jul 2026 23:39 UTC | ACCOUNT_CREATED | Email: Emoor120@eq.edu.au
16 Jul 2026 23:43 UTC | BOOK_CREATED | Title: "My Plan when I feel sick or worried"
16 Jul 2026 23:43 UTC | GENERATION_STARTED | Type: FULL_BOOK
17 Jul 2026 05:25 UTC | CHECKOUT_COMPLETE | Stripe session cs_live_b1WJwz8... | Premium trial started
17-19 Jul 2026 | TRIAL_ACTIVE | Premium limits: 10,000 pages, 180 min audio
19 Jul 2026 06:25 UTC | PAYMENT_SUCCESS | Invoice CKOKDVIN-0002 | USD $30.00
19 Jul 2026 06:25 UTC | SUBSCRIPTION_ACTIVE | sub_1Tu4HbCYJHbBgX5Lb7Z2yOiO

Book URL: https://www.trybookai.com/books/my-plan-when-i-feel-sick-or-worried-f37d170c
`;

  fs.writeFileSync(path.join(outDir, "ACCESS-ACTIVITY-LOG-paste-this.txt"), logText);
  console.log("Created access log paste file");
  console.log("\nAll files in:", outDir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
