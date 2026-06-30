const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// ── 4th of July Sale: 15% off, auto-applied at checkout through July 6, 2026 (PT) ──
// Coupon is scoped in Stripe (applies_to.products) to ONLY the 3 package deposit
// products (Sapling/Timber/Old Growth), so it can never discount add-ons, Care
// Plans, or the Reskin even if they're bundled into the same checkout.
const PROMO_COUPON_ID = 'FOURTH-OF-JULY-15-BUILD-ONLY';
const PROMO_PACKAGE_KEYS = ['sapling', 'timber', 'oldgrowth'];
const PROMO_END = new Date('2026-07-07T06:59:59Z'); // 11:59:59pm PDT on July 6

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
  'care-sapling':      { type: 'subscription', priceId: 'price_1TnnlPLHhM9UWHAYrgPsETrm', monthly: 59  },
  'care-timber':       { type: 'subscription', priceId: 'price_1TnnlPLHhM9UWHAYsoNRnrdv', monthly: 99  },
  'care-oldgrowth':    { type: 'subscription', priceId: 'price_1TnnlQLHhM9UWHAYHmcRSSgQ', monthly: 179 },
  'care-sapling-sa':   { type: 'subscription', priceId: 'price_1TnnlPLHhM9UWHAYrgPsETrm', monthly: 59  },
  'care-timber-sa':    { type: 'subscription', priceId: 'price_1TnnlPLHhM9UWHAYsoNRnrdv', monthly: 99  },
  'care-oldgrowth-sa': { type: 'subscription', priceId: 'price_1TnnlQLHhM9UWHAYHmcRSSgQ', monthly: 179 },

  // ── Care Plans — 6-Month lump sum (5 months, 1 month free) ──
  'care-sapling-6mo':      { type: 'one_time', priceId: 'price_1Tn3z2LHhM9UWHAYmDWr7jY9', fullPrice: 295  },
  'care-timber-6mo':       { type: 'one_time', priceId: 'price_1Tn424LHhM9UWHAYpUkB57N5', fullPrice: 495  },
  'care-oldgrowth-6mo':    { type: 'one_time', priceId: 'price_1Tn449LHhM9UWHAYiwkmOB4k', fullPrice: 895  },

  // ── Care Plans — Annual lump sum (10 months, 2 months free) ──
  'care-sapling-annual':   { type: 'one_time', priceId: 'price_1Tn40GLHhM9UWHAYmUJ4SXBP', fullPrice: 590  },
  'care-timber-annual':    { type: 'one_time', priceId: 'price_1Tn42aLHhM9UWHAYVmIpJW7b', fullPrice: 990  },
  'care-oldgrowth-annual': { type: 'one_time', priceId: 'price_1Tn44kLHhM9UWHAYHHE93Meq', fullPrice: 1790 },

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

  const promoActive = cartKeys.some(k => PROMO_PACKAGE_KEYS.includes(k)) && new Date() <= PROMO_END;

  const lineItems    = [];
  const unknownKeys  = [];
  const balanceItems = [];

  for (const key of cartKeys) {
    const item = PRICE_MAP[key];
    if (!item) { unknownKeys.push(key); continue; }

    if (item.type === 'deposit') {
      lineItems.push({ price: item.depositPriceId, quantity: 1 });
      // Balance due at launch is recorded here for manual invoicing later.
      // If the promo applied to this order, the balance gets the same 15%
      // off so the customer's total matches the advertised discounted price
      // (deposit is discounted automatically by the Stripe coupon below).
      const halfFull = item.fullPrice / 2;
      const balanceAmount = (promoActive && PROMO_PACKAGE_KEYS.includes(key))
        ? Math.round(halfFull * 0.85 * 100) / 100
        : halfFull;
      balanceItems.push({ key, balancePriceId: item.balancePriceId, amount: balanceAmount });
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

  const sessionParams = {
    mode,
    line_items: lineItems,
    customer_email: customerEmail || undefined,

    metadata: {
      business_name:         businessName || '',
      customer_name:         customerName || '',
      cart_keys:             cartKeys.join(','),
      skipped_keys:          unknownKeys.join(','),
      balance_due_at_launch: balanceItems.map(b => `${b.key}=$${b.amount}`).join(', '),
      promo_applied:         promoActive ? PROMO_COUPON_ID : '',
    },
    success_url: `${base}/success.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${base}/cart.html`,
    billing_address_collection: 'auto',
  };

  // Stripe doesn't allow combining `discounts` with `allow_promotion_codes`.
  // During the sale window, auto-apply the coupon — no code needed.
  // After it ends, fall back to manual promo code entry automatically.
  if (promoActive) {
    sessionParams.discounts = [{ coupon: PROMO_COUPON_ID }];
  } else {
    sessionParams.allow_promotion_codes = true;
  }

  try {
    const session = await stripe.checkout.sessions.create(sessionParams);

    return res.status(200).json({ url: session.url, skipped: unknownKeys });
  } catch (err) {
    console.error('Stripe error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
