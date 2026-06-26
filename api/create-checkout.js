const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const PRICE_MAP = {
  // ── Website Packages (50% deposit at checkout) ──
  sapling: {
    type:           'deposit',
    depositPriceId: 'price_1TmQthLHhM9UWHAYH0Um4XRw',
    balancePriceId: 'price_1TmQufLHhM9UWHAYBtspJcZY',
    fullPrice:      497,
  },
  timber: {
    type:           'deposit',
    depositPriceId: 'price_1TmQvzLHhM9UWHAYG3Gw9ctP',
    balancePriceId: 'price_1TmQwfLHhM9UWHAYZWyZDCd1',
    fullPrice:      997,
  },
  oldgrowth: {
    type:           'deposit',
    depositPriceId: 'price_1TmQygLHhM9UWHAYlNf4eTTE',
    balancePriceId: 'price_1TmR3CLHhM9UWHAY2scly7EC',
    fullPrice:      1997,
  },

  // ── Reskin (full price upfront) ──
  reskin: { type: 'one_time', priceId: 'price_1TmR4XLHhM9UWHAYfZFWVzOv', fullPrice: 197 },

  // ── Care Plans (recurring monthly) ──
  'care-sapling-sa':   { type: 'subscription', priceId: 'price_1TmR5hLHhM9UWHAYpv9coAf3', monthly: 59  },
  'care-timber-sa':    { type: 'subscription', priceId: 'price_1TmR6PLHhM9UWHAYjgt1SJto', monthly: 99  },
  'care-oldgrowth-sa': { type: 'subscription', priceId: 'price_1TmR76LHhM9UWHAYJnrfGYED', monthly: 179 },

  // ── Add-Ons (full price upfront) ──
  copywriting: { type: 'one_time', priceId: 'price_1TmR81LHhM9UWHAYWw3k2eAb', fullPrice: 249 },
  photos:      { type: 'one_time', priceId: 'price_1TmR8jLHhM9UWHAYM6A2zhHz', fullPrice: 99  },
  gbp:         { type: 'one_time', priceId: 'price_1TmR9ILHhM9UWHAYqUY7Ziqu', fullPrice: 79  },
  booking:     { type: 'one_time', priceId: 'price_1TmR9mLHhM9UWHAYVpSXlIfa', fullPrice: 149 },
  email:       { type: 'one_time', priceId: 'price_1TmRAMLHhM9UWHAY3YHajIri', fullPrice: 129 },
  reviews:     { type: 'one_time', priceId: 'price_1TmRBkLHhM9UWHAYsXmLcrvH', fullPrice: 79  },
  revision:    { type: 'one_time', priceId: 'price_1TmRCCLHhM9UWHAY833eJW2E', fullPrice: 79  },
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { cartKeys, customerEmail, customerName, businessName, siteUrl } = req.body;

  if (!cartKeys || !Array.isArray(cartKeys) || cartKeys.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }

  const lineItems    = [];
  const unknownKeys  = [];
  const balanceItems = [];

  for (const key of cartKeys) {
    const item = PRICE_MAP[key];
    if (!item) { unknownKeys.push(key); continue; }

    if (item.type === 'deposit') {
      lineItems.push({ price: item.depositPriceId, quantity: 1 });
      balanceItems.push({ key, balancePriceId: item.balancePriceId, amount: item.fullPrice / 2 });
    } else {
      lineItems.push({ price: item.priceId, quantity: 1 });
    }
  }

  if (lineItems.length === 0) {
    return res.status(400).json({ error: 'No valid items found in cart.' });
  }

  const hasSubscription = cartKeys.some(k => PRICE_MAP[k]?.type === 'subscription');
  const mode = hasSubscription ? 'subscription' : 'payment';

  const base = siteUrl || (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://www.timberlanddigital.com');

  try {
    const session = await stripe.checkout.sessions.create({
      mode,
      line_items: lineItems,
      customer_email: customerEmail || undefined,
      metadata: {
        business_name:         businessName || '',
        customer_name:         customerName || '',
        cart_keys:             cartKeys.join(','),
        skipped_keys:          unknownKeys.join(','),
        balance_due_at_launch: balanceItems.map(b => `${b.key}=$${b.amount}`).join(', '),
      },
      success_url: `${base}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${base}/cart.html`,
      billing_address_collection: 'auto',
      allow_promotion_codes: true,
    });

    return res.status(200).json({ url: session.url, skipped: unknownKeys });
  } catch (err) {
    console.error('Stripe error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
