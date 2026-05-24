const cors = require("cors");
const fs = require("fs");
const express = require("express");
const path = require("path");
const Stripe = require("stripe");

const app = express();
app.use(cors({ origin: "*" }));

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const SITE_URL = (process.env.SITE_URL || "https://esim-euro.com").replace(/\/$/, "");

if (!STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY lipseste din Environment Variables");
}

const stripe = Stripe(STRIPE_SECRET_KEY);

let orderNumber = 1;

const PLANS = {
  "plan": { name: "eSIM Europa PLAN", amount: 0, days: 0 },
  "3": { name: "eSIM Europa 3 zile", amount: 1099, days: 3 },
  "400GB": { name: "eSIM Europa 400 GB", amount: 5499, days: 30 },
  "30": { name: "eSIM Europa 30 zile", amount: 5999, days: 30 }
};

app.post("/stripe-webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const event = JSON.parse(req.body.toString());

    console.log("Event primit:", event.type);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const email = session.customer_email || session.metadata?.customer_email;
      const plan = session.metadata?.plan;
      const days = session.metadata?.days;
      const price = (session.amount_total / 100).toFixed(2);
      const name = session.metadata?.name;
      const phoneClient = session.metadata?.phone;

      const orderId = session.id.slice(-6); // ID scurt
      const date = new Date().toLocaleString("ro-RO");
      const currentOrderNumber = orderNumber++;
      
console.log("PLATA FINALIZATA:", email, plan, days);

      // 🔥 TRIMITERE WHATSAPP
      const phone = process.env.CALLMEBOT_PHONE;
      const apiKey = process.env.CALLMEBOT_API_KEY;

      const message = `🔥 Comandă nouă nr.${currentOrderNumber}

👤 Nume: ${name || "-"}
📧 Email: ${email}
📞 Telefon: ${phoneClient || "-"}
🌍 Plan: ${plan} (${days} zile)
💰 Preț: ${price || "-"} €
🆔 ID: #${orderId}
📅 Data: ${date}`;

      const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encodeURIComponent(message)}&apikey=${apiKey}`;

      const callmebotRes = await fetch(url);
const callmebotText = await callmebotRes.text();

console.log("CallMeBot status:", callmebotRes.status);
console.log("CallMeBot response:", callmebotText);
    }

    res.json({ received: true });

  } catch (err) {
    console.error("Webhook error:", err);
    res.status(400).send("Webhook error");
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => res.status(200).send("OK"));

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
      metadata: {
  name: String(req.body.name || "").trim(),
  phone: String(req.body.phone || "").trim(),
  plan: planKey,
  days: String(plan.days),
  customer_email: customerEmail
},
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
     
      success_url: `${SITE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/cancel.html`
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error("Stripe checkout error:", error && error.message ? error.message : error);
    res.status(500).json({ error: "Eroare la crearea plății Stripe." });
  }
});

app.get("/mega-plans", async (req, res) => {

  const response = await fetch("https://megaesim.us/api/v1/plans", {
    headers: {
      Authorization: "Bearer mega_live_63d1fa7f5cce49d505bc618f61b6f3bafc2cd1795fa8626b07211c1a094cbc78"
    }
  });

  const data = await response.json();

  res.json(data);

});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

const PORT = process.env.PORT || 3000;

// ==== GLOBAL REVIEWS API ====
const REVIEWS_FILE = path.join(__dirname, "reviews.json");

function readReviews() {
  try {
    if (!fs.existsSync(REVIEWS_FILE)) return [];
    const raw = fs.readFileSync(REVIEWS_FILE, "utf8");
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("Nu pot citi reviews.json:", err.message);
    return [];
  }
}

function writeReviews(reviews) {
  fs.writeFileSync(REVIEWS_FILE, JSON.stringify(reviews.slice(0, 200), null, 2), "utf8");
}

function safeText(value, max = 500) {
  return String(value || "")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, max);
}

app.get("/reviews", (req, res) => {
  const reviews = readReviews();
  res.json({ reviews });
});

app.post("/reviews", (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const stars = Number(req.body.stars || 5);
    const text = safeText(req.body.text, 600);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Email invalid." });
    }

    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      return res.status(400).json({ error: "Rating invalid." });
    }

    if (!text || text.length < 6) {
      return res.status(400).json({ error: "Recenzia este prea scurtă." });
    }

    const name = email
      .split("@")[0]
      .replace(/[._-]+/g, " ")
      .replace(/\b\w/g, c => c.toUpperCase())
      .slice(0, 40) || "Client";

    const reviews = readReviews();

    // limit simplu: un review per email
    if (reviews.some(r => r.email === email)) {
      return res.status(409).json({ error: "Ai trimis deja o recenzie cu acest email." });
    }

    const review = {
      id: Date.now().toString(36),
      name,
      email,
      stars,
      text,
      date: new Date().toISOString()
    };

    reviews.unshift(review);
    writeReviews(reviews);

    // Nu expunem emailul public
    const publicReviews = reviews.map(({ email, ...rest }) => rest);
    res.json({ ok: true, reviews: publicReviews });
  } catch (err) {
    console.error("Eroare POST /reviews:", err);
    res.status(500).json({ error: "Nu s-a putut salva recenzia." });
  }
});


app.listen(PORT, "0.0.0.0", () => console.log(`eSIM Euro server pornit pe portul ${PORT}`));
