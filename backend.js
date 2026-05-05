// Exemplu de cod pentru backend Render (Node.js / Express)
// Adaugă această logică în ruta ta /create-checkout-session, fără să strici Stripe-ul existent.

async function sendWhatsAppOrderNotification(order) {
  const phone = process.env.CALLMEBOT_PHONE;      // ex: 40733914329
  const apikey = process.env.CALLMEBOT_APIKEY;   // cheia primită de la CallMeBot

  if (!phone || !apikey) {
    console.warn('CallMeBot nu este configurat. Lipsesc CALLMEBOT_PHONE sau CALLMEBOT_APIKEY.');
    return;
  }

  const message = `🔥 Comandă nouă nr.${order.orderNumber}

` +
    `👤 Nume: ${order.name}
` +
    `📧 Email: ${order.email}
` +
    `📞 Telefon: ${order.phone}
` +
    `🌍 Plan: ${order.planName}
` +
    `💰 Preț: ${order.price}
` +
    `🆔 ID: #${order.orderNumber}
` +
    `📅 Data: ${order.date}`;

  const url = new URL('https://api.callmebot.com/whatsapp.php');
  url.searchParams.set('phone', phone);
  url.searchParams.set('text', message);
  url.searchParams.set('apikey', apikey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error('CallMeBot error: ' + await res.text());
  }
}

// Exemplu în ruta ta:
// app.post('/create-checkout-session', async (req, res) => {
//   const { plan, planName, price, name, email, phone } = req.body;
//
//   // AICI tu creezi comanda reală și numeri comenzile salvate.
//   // Exemplu simplu: dacă ai deja 999 comenzi, următoarea devine 1000.
//   const orderNumber = await getNextRealOrderNumber();
//
//   const order = {
//     orderNumber,
//     name,
//     email,
//     phone,
//     plan,
//     planName,
//     price,
//     date: new Date().toLocaleDateString('ro-RO')
//   };
//
//   await saveOrder(order);
//   await sendWhatsAppOrderNotification(order);
//
//   // Continui codul tău existent pentru Stripe și returnezi data.url
// });
