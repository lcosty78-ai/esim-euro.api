const express = require("express");
const path = require("path");
const Stripe = require("stripe");
const nodemailer = require("nodemailer");
const cors = require("cors");

const app = express();

app.use(cors({
  origin: "*"
}));
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const SITE_URL = (process.env.SITE_URL || "https://esim-euro.com").replace(/\/$/, "");

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "esimeuro@gmail.com";
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";

if (!STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY lipsește din Environment Variables");
}

const stripe = Stripe(STRIPE_SECRET_KEY);

const PLANS = {
  "3": { name: "eSIM Europa 3 zile", amount: 1099, days: 3 },
  "10": { name: "eSIM Europa 10 zile", amount: 3499, days: 10 },
  "20": { name: "eSIM Europa 20 zile", amount: 4999, days: 20 },
  "30": { name: "eSIM Europa 30 zile", amount: 5999, days: 30 }
};

function formatEuro(cents, currency = "eur") {
  return `${(Number(cents || 0) / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

async function sendAdminEmail(order) {
  if (!SMTP_USER || !SMTP_PASS || !ADMIN_EMAIL) {
    console.warn("SMTP_USER / SMTP_PASS / ADMIN_EMAIL lipsesc. Emailul nu a fost trimis.");
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });

  const subject = `Comandă nouă eSIM - ${order.amount} - ${order.planName}`;

  const text = `
Ai primit o plată nouă pe site.

Email client: ${order.customerEmail}
Plan cumpărat: ${order.planName}
Suma plătită: ${order.amount}
Data: ${order.createdAt}
Stripe Session ID: ${order.sessionId}
Payment Intent: ${order.paymentIntent}

Următorul pas:
Trimite manual eSIM-ul / QR-ul către client.
`;

  await transporter.sendMail({
    from: `"eSIM Euro" <${SMTP_USER}>`,
    to: ADMIN_EMAIL,
    subject,
    text
  });
}

// IMPORTANT: webhook-ul trebuie să fie ÎNAINTE de express.json()
app.post("/stripe-webhook", express.raw({ type: "application/json" }), async (req, res) => {
  let event;

  try {
    if (STRIPE_WEBHOOK_SECRET) {
      const sig = req.headers["stripe-signature"];
      event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    } else {
      // Doar pentru test. În live recomandat este să folosești STRIPE_WEBHOOK_SECRET.
      event = JSON.parse(req.body.toString());
    }
  } catch (err) {
    console.error("Webhook error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const customerEmail =
        session.customer_details?.email ||
        session.customer_email ||
        session.metadata?.customer_email ||
        "necunoscut";

      const planKey = session.metadata?.plan || "";
      const planName =
        session.metadata?.plan_name ||
        PLANS[planKey]?.name ||
        "Plan eSIM";

      const amount = formatEuro(session.amount_total, session.currency || "eur");

      const createdAt = new Date((session.created || Math.floor(Date.now() / 1000)) * 1000)
        .toLocaleString("ro-RO", { timeZone: "Europe/Bucharest" });

      await sendAdminEmail({
        customerEmail,
        planName,
        amount,
        createdAt,
        sessionId: session.id || "-",
        paymentIntent: session.payment_intent || "-"
      });
    }

    res.json({ received: true });
  } catch (err) {
    console.error("Eroare la procesarea webhook:", err);
    res.status(500).send("Webhook processing failed");
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.get('/', (req, res) => {
  res.send('API eSIM merge 🚀');
});

app.get("/health", (req, res) => res.status(200).json({ ok: true }));

app.post("/create-checkout-session", async (req, res) => {
  try {
    const planKey = String(req.body.plan || "");
    const customerEmail = String(req.body.email || "").trim().toLowerCase();
    const plan = PLANS[planKey];

    if (!plan) return res.status(400).json({ error: "Plan invalid." });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customerEmail)) {
      return res.status(400).json({ error: "Email invalid." });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: customerEmail,
      customer_creation: "always",
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "eur",
          product_data: {
            name: plan.name,
            description: "Internet eSIM nelimitat conform politicii FUP."
          },
          unit_amount: plan.amount
        },
        quantity: 1
      }],
      payment_intent_data: {
        receipt_email: customerEmail
      },
      metadata: {
        plan: planKey,
        plan_name: plan.name,
        days: String(plan.days),
        customer_email: customerEmail
      },
      success_url: `${SITE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/cancel.html`
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error("Stripe checkout error:", error && error.message ? error.message : error);
    res.status(500).json({ error: "Eroare la crearea plății Stripe." });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`eSIM Euro server final pornit pe portul ${PORT}`);
});
