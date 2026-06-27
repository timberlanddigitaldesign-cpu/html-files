const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const PRICE_MAP = {
  // ── Website Packages (50% deposit at checkout) ──
  sapling: {
    type:           'deposit',
    depositPriceId: 'price_1TmQthLHhM9UWHAYH0Um4XRw',
    balancePriceId: 'price_1TmQufLHhM9UWHAYBtspJcZY',
    fullPrice:      799,
  },
  timber: {
    type:           'deposit',
    depositPriceId: 'price_1TmySGLHhM9UWHAYixU3zzcU',
    balancePriceId: 'price_1TmQwfLHhM9UWHAYZWyZDCd1',
    fullPrice:      1399,
  },
  oldgrowth: {
    type:           'deposit',
    depositPriceId: 'price_1TmyU7LHhM9UWHAYLfYzbZMe',
    balancePriceId: 'price_1TmR3CLHhM9UWHAY2scly7EC',
    fullPrice:      2699,
  },

  // ── Reskin (full price upfront) ──
  reskin: { type: 'one_time', priceId: 'price_1TmR4XLHhM9UWHAYfZFWVzOv', fullPrice: 349 },

  // ── Care Plans (recurring monthly) ──
  'care-sapling':      { type: 'subscription', priceId: 'price_1Tmy7rLHhM9UWHAYFTuEQvE2', monthly: 59  },
  'care-timber':       { type: 'subscription', priceId: 'price_1Tmy8KLHhM9UWHAYB0rtfyJ5', monthly: 99  },
  'care-oldgrowth':    { type: 'subscription', priceId: 'price_1Tmy8aLHhM9UWHAYEtXnumyK', monthly: 179 },
  'care-sapling-sa':   { type: 'subscription', priceId: 'price_1Tmy7rLHhM9UWHAYFTuEQvE2', monthly: 59  },
  'care-timber-sa':    { type: 'subscription', priceId: 'price_1Tmy8KLHhM9UWHAYB0rtfyJ5', monthly: 99  },
  'care-oldgrowth-sa': { type: 'subscription', priceId: 'price_1Tmy8aLHhM9UWHAYEtXnumyK', monthly: 179 },

  // ── Care Plans — 6-Month lump sum (5 months, 1 month free) ──
  // TODO: Create these one-time prices in Stripe dashboard, then paste the price IDs below
  'care-sapling-6mo':      { type: 'one_time', priceId: 'REPLACE_sapling_6mo',      fullPrice: 295  },
  'care-timber-6mo':       { type: 'one_time', priceId: 'REPLACE_timber_6mo',       fullPrice: 495  },
  'care-oldgrowth-6mo':    { type: 'one_time', priceId: 'REPLACE_oldgrowth_6mo',    fullPrice: 895  },

  // ── Care Plans — Annual lump sum (10 months, 2 months free) ──
  // TODO: Create these one-time prices in Stripe dashboard, then paste the price IDs below
  'care-sapling-annual':   { type: 'one_time', priceId: 'REPLACE_sapling_annual',   fullPrice: 590  },
  'care-timber-annual':    { type: 'one_time', priceId: 'REPLACE_timber_annual',     fullPrice: 990  },
  'care-oldgrowth-annual': { type: 'one_time', priceId: 'REPLACE_oldgrowth_annual', fullPrice: 1790 },

  // ── Add-Ons (full price upfront) ──
  copywriting: { type: 'one_time', priceId: 'price_1TmR81LHhM9UWHAYWw3k2eAb', fullPrice: 249 },
  photos:      { type: 'one_time', priceId: 'price_1TmR8jLHhM9UWHAYM6A2zhHz', fullPrice: 99  },
  gbp:         { type: 'one_time', priceId: 'price_1TmbpULHhM9UWHAYcQigZ6wl', fullPrice: 129 },
  booking:     { type: 'one_time', priceId: 'price_1TmR9mLHhM9UWHAYVpSXlIfa', fullPrice: 149 },
  email:       { type: 'one_time', priceId: 'price_1TmRAMLHhM9UWHAY3YHajIri', fullPrice: 129 },
  reviews:     { type: 'one_time', priceId: 'price_1TmbqyLHhM9UWHAYnAwkkyMX', fullPrice: 99  },
  revision:    { type: 'one_time', priceId: 'price_1TmbsDLHhM9UWHAY4GZNbpe4', fullPrice: 99  },
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
