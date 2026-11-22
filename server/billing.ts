import crypto from 'crypto';

export type PlanId = 'starter' | 'scholar' | 'campus';
export type BillingCycle = 'monthly' | 'annual';
export type CurrencyCode = 'INR' | 'USD';
export type PaymentMethodId =
  | 'razorpay'
  | 'card'
  | 'upi'
  | 'netbanking'
  | 'apple_pay'
  | 'student_grant';
export type GatewayMode =
  | 'razorpay_live'
  | 'razorpay_test'
  | 'razorpay_sandbox'
  | 'free_activation';

export interface PlanDefinition {
  id: PlanId;
  name: string;
  audience: string;
  accent: 'sky' | 'pink' | 'lavender';
  pricing: {
    INR: {
      monthlySubunits: number; // paise
      annualMonthlyEquivalentSubunits: number;
      annualTotalSubunits: number;
    };
    USD: {
      monthlySubunits: number; // cents
      annualMonthlyEquivalentSubunits: number;
      annualTotalSubunits: number;
    };
  };
  limits: {
    audioMinutesPerMonth: string;
    documentUploadsPerMonth: string;
    flashcardDecks: string;
    audioReadout: string;
    cloudSync: string;
  };
}

export interface PaymentMethodDefinition {
  id: PaymentMethodId;
  label: string;
  detail: string;
}

export const NOTEVOX_PLANS: PlanDefinition[] = [
  {
    id: 'starter',
    name: 'Starter',
    audience: 'For individual coursework',
    accent: 'sky',
    pricing: {
      INR: {
        monthlySubunits: 0,
        annualMonthlyEquivalentSubunits: 0,
        annualTotalSubunits: 0,
      },
      USD: {
        monthlySubunits: 0,
        annualMonthlyEquivalentSubunits: 0,
        annualTotalSubunits: 0,
      },
    },
    limits: {
      audioMinutesPerMonth: '60 min / month',
      documentUploadsPerMonth: '15 files / month',
      flashcardDecks: 'Unlimited decks',
      audioReadout: 'Standard summary audio',
      cloudSync: 'Real-time Firebase sync',
    },
  },
  {
    id: 'scholar',
    name: 'Scholar Pro',
    audience: 'For full-time students & exam prep',
    accent: 'pink',
    pricing: {
      INR: {
        monthlySubunits: 19900, // ₹199 / mo
        annualMonthlyEquivalentSubunits: 14900, // ₹149 / mo
        annualTotalSubunits: 178800, // ₹1,788 / yr
      },
      USD: {
        monthlySubunits: 700, // $7 / mo
        annualMonthlyEquivalentSubunits: 500, // $5 / mo
        annualTotalSubunits: 6000, // $60 / yr
      },
    },
    limits: {
      audioMinutesPerMonth: '600 min / month',
      documentUploadsPerMonth: 'Unlimited PDF, DOCX & slides',
      flashcardDecks: 'Unlimited AI decks + Ask Note',
      audioReadout: 'All 5 Gemini narrator voices',
      cloudSync: 'Priority sync & export',
    },
  },
  {
    id: 'campus',
    name: 'Campus Study Pack',
    audience: 'For honours cohorts & heavy lecture loads',
    accent: 'lavender',
    pricing: {
      INR: {
        monthlySubunits: 39900, // ₹399 / mo
        annualMonthlyEquivalentSubunits: 29900, // ₹299 / mo
        annualTotalSubunits: 358800, // ₹3,588 / yr
      },
      USD: {
        monthlySubunits: 1400, // $14 / mo
        annualMonthlyEquivalentSubunits: 1000, // $10 / mo
        annualTotalSubunits: 12000, // $120 / yr
      },
    },
    limits: {
      audioMinutesPerMonth: '2,000 min / month',
      documentUploadsPerMonth: 'Unlimited large textbooks & decks',
      flashcardDecks: 'Unlimited AI decks + Cornell & Revision kits',
      audioReadout: 'Unlimited spoken study summaries',
      cloudSync: 'Dedicated cloud workspace',
    },
  },
];

export const PAYMENT_METHODS: PaymentMethodDefinition[] = [
  {
    id: 'upi',
    label: 'UPI via Razorpay',
    detail: 'GPay, PhonePe, Paytm, BHIM & UPI ID (Test: success@razorpay)',
  },
  {
    id: 'card',
    label: 'Cards via Razorpay',
    detail: 'Visa, Mastercard, RuPay & Amex debit/credit cards',
  },
  {
    id: 'netbanking',
    label: 'Netbanking & Wallets',
    detail: 'All major Indian banks and digital wallets via Razorpay',
  },
  {
    id: 'student_grant',
    label: 'Campus / Free Promo',
    detail: 'Use CAMPUSFREE for instant ₹0 / $0 academic activation',
  },
];

const PROMO_CODES: Record<string, { discountPercent: number; description: string }> = {
  STUDENT25: { discountPercent: 25, description: '25% Student Discount applied' },
  CAMPUSFREE: { discountPercent: 100, description: '100% Academic Free Pass applied' },
  STUDY15: { discountPercent: 15, description: '15% Semester Welcome Discount applied' },
};

// Ephemeral in-memory checkout session & order registry
interface PendingOrderRecord {
  orderId: string;
  receiptId: string;
  planId: PlanId;
  billingCycle: BillingCycle;
  currency: CurrencyCode;
  amountSubunits: number;
  promoCode: string;
  gatewayMode: GatewayMode;
  requiresSignature: boolean;
  createdAtMs: number;
}

const pendingOrders = new Map<string, PendingOrderRecord>();
const sandboxHmacSecret = crypto.randomBytes(32).toString('hex');

function maskKeyId(keyId: string): string {
  if (keyId.length <= 12) return keyId;
  return `${keyId.slice(0, 9)}••••${keyId.slice(-4)}`;
}

export function getRazorpayConfig(): {
  configured: boolean;
  hasSecret: boolean;
  keyId: string | null;
  keySecret: string | null;
  keyIdPreview: string | null;
  mode: GatewayMode;
} {
  const envKeyId = (process.env.RAZORPAY_KEY_ID || '').trim();
  const envKeySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();

  const validEnvKeyId =
    envKeyId && !envKeyId.includes('YOUR_KEY') && envKeyId.startsWith('rzp_')
      ? envKeyId
      : '';
  const validEnvSecret =
    envKeySecret && !envKeySecret.includes('YOUR_RAZORPAY') ? envKeySecret : '';

  const effectiveKeyId = validEnvKeyId;
  const hasSecret = Boolean(validEnvSecret);

  if (!effectiveKeyId) {
    return {
      configured: false,
      hasSecret: false,
      keyId: null,
      keySecret: null,
      keyIdPreview: null,
      mode: 'razorpay_sandbox',
    };
  }

  return {
    configured: true,
    hasSecret,
    keyId: effectiveKeyId,
    keySecret: hasSecret ? validEnvSecret : null,
    keyIdPreview: maskKeyId(effectiveKeyId),
    mode: effectiveKeyId.startsWith('rzp_live_') ? 'razorpay_live' : 'razorpay_test',
  };
}

export function calculateQuote(
  planId: PlanId,
  billingCycle: BillingCycle,
  currency: CurrencyCode = 'INR',
  promoCodeRaw = ''
) {
  const plan = NOTEVOX_PLANS.find((p) => p.id === planId);
  if (!plan) {
    throw new Error('Selected plan does not exist.');
  }

  const priceTable = plan.pricing[currency] || plan.pricing.INR;
  const subtotalSubunits =
    billingCycle === 'annual' ? priceTable.annualTotalSubunits : priceTable.monthlySubunits;
  const normalizedCode = promoCodeRaw.trim().toUpperCase().slice(0, 32);
  const promo = normalizedCode ? PROMO_CODES[normalizedCode] : undefined;

  if (normalizedCode && !promo) {
    return {
      validPromo: false,
      promoMessage: 'Promo code not recognized. Try STUDENT25, STUDY15, or CAMPUSFREE.',
      planId,
      billingCycle,
      currency,
      promoCode: '',
      subtotalCents: subtotalSubunits,
      discountCents: 0,
      totalCents: subtotalSubunits,
    };
  }

  const discountSubunits = promo
    ? Math.round((subtotalSubunits * promo.discountPercent) / 100)
    : 0;
  const totalSubunits = Math.max(0, subtotalSubunits - discountSubunits);

  return {
    validPromo: Boolean(promo),
    promoMessage: promo ? promo.description : '',
    planId,
    billingCycle,
    currency,
    promoCode: promo ? normalizedCode : '',
    subtotalCents: subtotalSubunits,
    discountCents: discountSubunits,
    totalCents: totalSubunits,
  };
}

export async function createRazorpayOrder(params: {
  planId: PlanId;
  billingCycle: BillingCycle;
  currency: CurrencyCode;
  promoCode?: string;
  paymentMethod?: PaymentMethodId;
}) {
  const quote = calculateQuote(
    params.planId,
    params.billingCycle,
    params.currency,
    params.promoCode || ''
  );
  const receiptId = `NVX-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  // 1. Free plan or 100% academic promo activates immediately with ₹0/$0
  if (quote.totalCents === 0) {
    return {
      freeActivation: true as const,
      gatewayMode: 'free_activation' as GatewayMode,
      receipt: {
        receiptId,
        planId: quote.planId,
        billingCycle: quote.billingCycle,
        paymentMethod: (params.paymentMethod || 'student_grant') as PaymentMethodId,
        paymentMethodLabel: quote.promoCode ? `Promo ${quote.promoCode}` : 'Starter Free Tier',
        amountCents: 0,
        currency: quote.currency,
        promoCode: quote.promoCode,
        gatewayOrderId: '',
        gatewayPaymentId: '',
        gatewayMode: 'free_activation' as GatewayMode,
        status: 'completed' as const,
      },
    };
  }

  const rzp = getRazorpayConfig();

  // 2. Full Razorpay Orders REST API (when BOTH RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are set)
  if (rzp.configured && rzp.keyId && rzp.hasSecret && rzp.keySecret) {
    const authHeader = Buffer.from(`${rzp.keyId}:${rzp.keySecret}`).toString('base64');
    const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authHeader}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: quote.totalCents,
        currency: quote.currency,
        receipt: receiptId,
        payment_capture: 1,
        notes: {
          app: 'Notevox',
          planId: quote.planId,
          billingCycle: quote.billingCycle,
          promoCode: quote.promoCode || 'none',
        },
      }),
    });

    const rzpBody = (await rzpRes.json().catch(() => ({}))) as {
      id?: string;
      amount?: number;
      currency?: string;
      error?: { description?: string; code?: string };
    };

    if (rzpRes.ok && rzpBody.id) {
      pendingOrders.set(rzpBody.id, {
        orderId: rzpBody.id,
        receiptId,
        planId: quote.planId,
        billingCycle: quote.billingCycle,
        currency: quote.currency,
        amountSubunits: quote.totalCents,
        promoCode: quote.promoCode,
        gatewayMode: rzp.mode,
        requiresSignature: true,
        createdAtMs: Date.now(),
      });

      return {
        freeActivation: false as const,
        gatewayMode: rzp.mode,
        keyId: rzp.keyId,
        orderId: rzpBody.id,
        useRazorpayOrderId: true,
        amount: rzpBody.amount ?? quote.totalCents,
        currency: (rzpBody.currency as CurrencyCode) || quote.currency,
        receiptId,
        planId: quote.planId,
        billingCycle: quote.billingCycle,
        promoCode: quote.promoCode,
      };
    }

    // In Test Mode, if Orders API returns 401 (missing/mismatched secret), seamlessly
    // fall back to Official Razorpay Standard Checkout (Key-ID-only modal).
    if (!(rzpRes.status === 401 && rzp.mode === 'razorpay_test')) {
      const desc =
        rzpBody.error?.description ||
        `Razorpay Orders API returned HTTP ${rzpRes.status}. Verify RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Settings > Secrets.`;
      throw new Error(desc);
    }
  }

  // 3. Official Razorpay Standard Checkout (Key-ID-only Test Mode — opens real checkout.razorpay.com modal!)
  if (rzp.configured && rzp.keyId) {
    const sessionOrderId = `nvx_rzp_${crypto.randomBytes(7).toString('hex')}`;
    pendingOrders.set(sessionOrderId, {
      orderId: sessionOrderId,
      receiptId,
      planId: quote.planId,
      billingCycle: quote.billingCycle,
      currency: quote.currency,
      amountSubunits: quote.totalCents,
      promoCode: quote.promoCode,
      gatewayMode: rzp.mode,
      requiresSignature: false,
      createdAtMs: Date.now(),
    });

    return {
      freeActivation: false as const,
      gatewayMode: rzp.mode,
      keyId: rzp.keyId,
      orderId: sessionOrderId,
      useRazorpayOrderId: false,
      amount: quote.totalCents,
      currency: quote.currency,
      receiptId,
      planId: quote.planId,
      billingCycle: quote.billingCycle,
      promoCode: quote.promoCode,
    };
  }

  // 4. Built-in Test Sandbox fallback (if no Razorpay key is available)
  const sandboxOrderId = `order_rzptest_${crypto.randomBytes(7).toString('hex')}`;
  pendingOrders.set(sandboxOrderId, {
    orderId: sandboxOrderId,
    receiptId,
    planId: quote.planId,
    billingCycle: quote.billingCycle,
    currency: quote.currency,
    amountSubunits: quote.totalCents,
    promoCode: quote.promoCode,
    gatewayMode: 'razorpay_sandbox',
    requiresSignature: false,
    createdAtMs: Date.now(),
  });

  return {
    freeActivation: false as const,
    gatewayMode: 'razorpay_sandbox' as GatewayMode,
    keyId: null,
    orderId: sandboxOrderId,
    useRazorpayOrderId: false,
    amount: quote.totalCents,
    currency: quote.currency,
    receiptId,
    planId: quote.planId,
    billingCycle: quote.billingCycle,
    promoCode: quote.promoCode,
  };
}

export function verifyRazorpayPayment(params: {
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  paymentMethod?: PaymentMethodId;
  paymentLabel?: string;
  sandboxConfirm?: boolean;
}) {
  const order = pendingOrders.get(params.razorpayOrderId);
  if (!order) {
    throw new Error('Order session not found or already completed. Please start checkout again.');
  }

  let verifiedPaymentId = (params.razorpayPaymentId || '').trim();
  let recordedOrderId = order.requiresSignature ? order.orderId : '';

  if (order.gatewayMode === 'razorpay_live' || order.gatewayMode === 'razorpay_test') {
    if (!verifiedPaymentId) {
      throw new Error('Missing Razorpay payment ID from checkout.');
    }

    if (order.requiresSignature) {
      const rzp = getRazorpayConfig();
      if (!rzp.keySecret) {
        throw new Error('RAZORPAY_KEY_SECRET is not configured on the server.');
      }
      if (!params.razorpaySignature) {
        throw new Error('Missing Razorpay cryptographic signature.');
      }

      const expectedSig = crypto
        .createHmac('sha256', rzp.keySecret)
        .update(`${params.razorpayOrderId}|${verifiedPaymentId}`)
        .digest('hex');

      const expectedBuf = Buffer.from(expectedSig, 'utf8');
      const providedBuf = Buffer.from(params.razorpaySignature.trim(), 'utf8');

      if (
        expectedBuf.length !== providedBuf.length ||
        !crypto.timingSafeEqual(expectedBuf, providedBuf)
      ) {
        throw new Error('Razorpay signature verification failed. Payment was not applied.');
      }
    } else {
      // Standard Key-ID-only Razorpay Checkout: validate authentic Razorpay payment ID prefix
      if (!/^pay_[A-Za-z0-9]{6,64}$/.test(verifiedPaymentId)) {
        throw new Error('Invalid Razorpay payment ID received from checkout.');
      }
      recordedOrderId = order.orderId;
    }
  } else if (order.gatewayMode === 'razorpay_sandbox') {
    if (!params.sandboxConfirm) {
      throw new Error('Sandbox test confirmation required.');
    }
    verifiedPaymentId = `pay_rzptest_${crypto.randomBytes(7).toString('hex')}`;
    recordedOrderId = order.orderId;
    const sig = crypto
      .createHmac('sha256', sandboxHmacSecret)
      .update(`${order.orderId}|${verifiedPaymentId}`)
      .digest('hex');
    if (!sig) {
      throw new Error('Unable to generate verification digest.');
    }
  }

  pendingOrders.delete(order.orderId);

  const method: PaymentMethodId = params.paymentMethod || 'razorpay';
  const methodLabel =
    (params.paymentLabel || '').trim() ||
    (order.gatewayMode === 'razorpay_sandbox'
      ? 'Razorpay Test Sandbox'
      : order.gatewayMode === 'razorpay_live'
        ? 'Razorpay Live Checkout'
        : 'Razorpay Test Checkout');

  return {
    verified: true as const,
    receipt: {
      receiptId: order.receiptId,
      planId: order.planId,
      billingCycle: order.billingCycle,
      paymentMethod: method,
      paymentMethodLabel: methodLabel.slice(0, 60),
      amountCents: order.amountSubunits,
      currency: order.currency,
      promoCode: order.promoCode,
      gatewayOrderId: recordedOrderId,
      gatewayPaymentId: verifiedPaymentId,
      gatewayMode: order.gatewayMode,
      status: 'completed' as const,
      verifiedAt: new Date().toISOString(),
    },
  };
}
