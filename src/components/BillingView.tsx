import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Building2,
  CheckCircle2,
  Code2,
  CreditCard,
  ExternalLink,
  GraduationCap,
  KeyRound,
  Loader2,
  Lock,
  Receipt,
  ShieldCheck,
  Smartphone,
  Sparkles,
  X,
} from 'lucide-react';
import { useNotevox } from '../context/NotevoxContext';
import {
  createRazorpayOrderApi,
  fetchBillingPlansApi,
  validatePromoApi,
  verifyRazorpayPaymentApi,
  type VerifiedReceiptPayload,
} from '../lib/api';
import { formatCurrencyCents, formatTimestampDate } from '../lib/palette';
import { loadRazorpayCheckoutScript } from '../lib/razorpay';
import type {
  BillingCycle,
  CurrencyCode,
  GatewayMode,
  PaymentMethodDefinition,
  PaymentMethodId,
  PlanDefinition,
  PlanId,
} from '../types';

interface SandboxPendingOrder {
  orderId: string;
  receiptId: string;
  planId: PlanId;
  planName: string;
  billingCycle: BillingCycle;
  amount: number;
  currency: CurrencyCode;
  promoCode: string;
}

export function BillingView() {
  const { profile, user, billingRecords, recordBillingCheckout } = useNotevox();

  const [plans, setPlans] = useState<PlanDefinition[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodDefinition[]>([]);
  const [razorpayStatus, setRazorpayStatus] = useState<{
    configured: boolean;
    hasSecret?: boolean;
    keyIdPreview?: string | null;
    mode: GatewayMode;
  }>({ configured: false, hasSecret: false, keyIdPreview: null, mode: 'razorpay_sandbox' });
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [currency, setCurrency] = useState<CurrencyCode>('INR');
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(
    profile?.billingCycle || 'annual'
  );
  const [selectedPlanId, setSelectedPlanId] = useState<PlanId>(
    profile?.planId === 'campus' ? 'campus' : 'scholar'
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId>('upi');
  const [promoInput, setPromoInput] = useState('');
  const [promoQuote, setPromoQuote] = useState<{
    validPromo: boolean;
    promoMessage: string;
    promoCode: string;
    currency: CurrencyCode;
    subtotalCents: number;
    discountCents: number;
    totalCents: number;
  } | null>(null);
  const [validatingPromo, setValidatingPromo] = useState(false);

  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [successReceipt, setSuccessReceipt] = useState<string | null>(null);
  const [showApiDocs, setShowApiDocs] = useState(false);
  const [showKeyGuide, setShowKeyGuide] = useState(false);

  // Built-in Razorpay Test Checkout Modal (when RAZORPAY_KEY_ID is not yet set in Secrets)
  const [sandboxOrder, setSandboxOrder] = useState<SandboxPendingOrder | null>(null);
  const [sandboxTab, setSandboxTab] = useState<'upi' | 'card' | 'netbanking'>('upi');
  const [sandboxUpi, setSandboxUpi] = useState('success@razorpay');
  const [sandboxBank, setSandboxBank] = useState('HDFC Bank (Test)');
  const [verifyingSandbox, setVerifyingSandbox] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function loadCatalog() {
      setLoadingCatalog(true);
      setCatalogError(null);
      try {
        const data = await fetchBillingPlansApi();
        if (!mounted) return;
        setPlans(data.plans);
        setPaymentMethods(data.paymentMethods);
        if (data.razorpay) {
          setRazorpayStatus(data.razorpay);
        }
      } catch (err) {
        if (!mounted) return;
        setCatalogError(err instanceof Error ? err.message : 'Unable to load plans.');
      } finally {
        if (mounted) setLoadingCatalog(false);
      }
    }
    void loadCatalog();
    return () => {
      mounted = false;
    };
  }, []);

  // Recompute quote cleanly whenever plan, currency, or billing cycle changes
  useEffect(() => {
    const plan = plans.find((p) => p.id === selectedPlanId);
    if (!plan) return;
    const priceTable = plan.pricing[currency] || plan.pricing.INR;
    const subtotal =
      billingCycle === 'annual' ? priceTable.annualTotalSubunits : priceTable.monthlySubunits;

    setPromoQuote((prev) => {
      if (prev && prev.validPromo && prev.promoCode) {
        void handleValidatePromo(prev.promoCode, selectedPlanId, billingCycle, currency);
        return prev;
      }
      return {
        validPromo: false,
        promoMessage: '',
        promoCode: '',
        currency,
        subtotalCents: subtotal,
        discountCents: 0,
        totalCents: subtotal,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlanId, billingCycle, currency, plans]);

  async function handleValidatePromo(
    codeOverride?: string,
    planOverride?: PlanId,
    cycleOverride?: BillingCycle,
    currencyOverride?: CurrencyCode
  ) {
    const code = (codeOverride ?? promoInput).trim();
    setValidatingPromo(true);
    setCheckoutError(null);
    try {
      const quote = await validatePromoApi({
        planId: planOverride ?? selectedPlanId,
        billingCycle: cycleOverride ?? billingCycle,
        currency: currencyOverride ?? currency,
        promoCode: code,
      });
      setPromoQuote(quote);
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Unable to validate promo code.');
    } finally {
      setValidatingPromo(false);
    }
  }

  async function persistVerifiedReceipt(receipt: VerifiedReceiptPayload) {
    await recordBillingCheckout({
      receiptId: receipt.receiptId,
      planId: receipt.planId,
      billingCycle: receipt.billingCycle,
      paymentMethod: receipt.paymentMethod,
      paymentMethodLabel: receipt.paymentMethodLabel,
      amountCents: receipt.amountCents,
      currency: receipt.currency,
      promoCode: receipt.promoCode,
      gatewayOrderId: receipt.gatewayOrderId,
      gatewayPaymentId: receipt.gatewayPaymentId,
      gatewayMode: receipt.gatewayMode,
      status: receipt.status,
    });

    const paySuffix = receipt.gatewayPaymentId ? ` · Payment ${receipt.gatewayPaymentId}` : '';
    setSuccessReceipt(
      `Plan active: ${receipt.planId.toUpperCase()} (${receipt.billingCycle}) · Receipt ${receipt.receiptId}${paySuffix}`
    );
  }

  async function handleStartCheckout(e: React.FormEvent) {
    e.preventDefault();
    setCheckingOut(true);
    setCheckoutError(null);
    setSuccessReceipt(null);

    const activePlanObj = plans.find((p) => p.id === selectedPlanId);
    const activePromo = promoQuote?.validPromo ? promoQuote.promoCode : promoInput.trim();

    try {
      const orderResp = await createRazorpayOrderApi({
        planId: selectedPlanId,
        billingCycle,
        currency,
        paymentMethod,
        promoCode: activePromo,
      });

      // 1. Free Starter tier or 100% academic promo (CAMPUSFREE) activates immediately
      if (orderResp.freeActivation) {
        await persistVerifiedReceipt(orderResp.receipt);
        setCheckingOut(false);
        return;
      }

      // 2. Real Razorpay Checkout popup when RAZORPAY_KEY_ID & RAZORPAY_KEY_SECRET are configured
      if (
        (orderResp.gatewayMode === 'razorpay_test' || orderResp.gatewayMode === 'razorpay_live') &&
        orderResp.keyId
      ) {
        const loaded = await loadRazorpayCheckoutScript();
        if (!loaded || !window.Razorpay) {
          throw new Error(
            'Could not load Razorpay Checkout script (checkout.razorpay.com). Check your internet connection or ad blocker.'
          );
        }

        const rzp = new window.Razorpay({
          key: orderResp.keyId,
          amount: orderResp.amount,
          currency: orderResp.currency,
          name: 'Notevox',
          description: `${activePlanObj?.name || orderResp.planId} (${orderResp.billingCycle})`,
          ...(orderResp.useRazorpayOrderId ? { order_id: orderResp.orderId } : {}),
          notes: {
            receiptId: orderResp.receiptId,
            planId: orderResp.planId,
            billingCycle: orderResp.billingCycle,
          },
          prefill: {
            name: profile?.displayName || user?.displayName || 'Notevox Student',
            email: user?.email || undefined,
          },
          theme: {
            color: '#1C1926',
          },
          modal: {
            ondismiss: () => {
              setCheckingOut(false);
            },
          },
          handler: async (rzpResponse) => {
            try {
              const verified = await verifyRazorpayPaymentApi({
                razorpayOrderId: rzpResponse.razorpay_order_id || orderResp.orderId,
                razorpayPaymentId: rzpResponse.razorpay_payment_id,
                razorpaySignature: rzpResponse.razorpay_signature,
                paymentMethod: paymentMethod === 'student_grant' ? 'razorpay' : paymentMethod,
                paymentLabel:
                  orderResp.gatewayMode === 'razorpay_live'
                    ? 'Razorpay Live Checkout'
                    : 'Razorpay Test Checkout',
              });
              await persistVerifiedReceipt(verified.receipt);
            } catch (verifyErr) {
              setCheckoutError(
                verifyErr instanceof Error
                  ? verifyErr.message
                  : 'Razorpay payment verification failed.'
              );
            } finally {
              setCheckingOut(false);
            }
          },
        });

        rzp.on('payment.failed', (failure) => {
          setCheckoutError(
            failure.error?.description || 'Razorpay payment was declined or cancelled.'
          );
          setCheckingOut(false);
        });

        rzp.open();
        return;
      }

      // 3. Built-in Razorpay Test Checkout Modal (before free rzp_test_ keys are added in Secrets)
      setSandboxTab(
        paymentMethod === 'card'
          ? 'card'
          : paymentMethod === 'netbanking'
            ? 'netbanking'
            : 'upi'
      );
      setSandboxOrder({
        orderId: orderResp.orderId,
        receiptId: orderResp.receiptId,
        planId: orderResp.planId,
        planName: activePlanObj?.name || orderResp.planId,
        billingCycle: orderResp.billingCycle,
        amount: orderResp.amount,
        currency: orderResp.currency,
        promoCode: orderResp.promoCode,
      });
      setCheckingOut(false);
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Checkout could not be started.');
      setCheckingOut(false);
    }
  }

  async function handleConfirmSandboxPayment() {
    if (!sandboxOrder) return;
    setVerifyingSandbox(true);
    setCheckoutError(null);
    try {
      const label =
        sandboxTab === 'upi'
          ? `Razorpay Test UPI (${sandboxUpi.trim() || 'success@razorpay'})`
          : sandboxTab === 'card'
            ? 'Razorpay Test Visa •••• 1111'
            : `Razorpay Test Netbanking (${sandboxBank})`;

      const verified = await verifyRazorpayPaymentApi({
        razorpayOrderId: sandboxOrder.orderId,
        paymentMethod: sandboxTab,
        paymentLabel: label,
        sandboxConfirm: true,
      });

      await persistVerifiedReceipt(verified.receipt);
      setSandboxOrder(null);
    } catch (err) {
      setCheckoutError(
        err instanceof Error ? err.message : 'Unable to complete Razorpay test payment.'
      );
      setSandboxOrder(null);
    } finally {
      setVerifyingSandbox(false);
    }
  }

  const activePlan = plans.find((p) => p.id === (profile?.planId || 'starter'));
  const selectedPlan = plans.find((p) => p.id === selectedPlanId);

  const methodIcon = (id: PaymentMethodId) => {
    if (id === 'upi') return Smartphone;
    if (id === 'netbanking') return Building2;
    if (id === 'student_grant') return GraduationCap;
    return CreditCard;
  };

  const gatewayBadgeLabel = (mode?: GatewayMode) => {
    if (mode === 'razorpay_live') return 'Razorpay Live';
    if (mode === 'razorpay_test') return 'Razorpay Test';
    if (mode === 'free_activation') return 'Free Activation';
    return 'Razorpay Test Sandbox';
  };

  if (loadingCatalog) {
    return (
      <div className="nv-studio-card rounded-2xl p-10 flex items-center justify-center gap-3 text-sm text-[#5C566C]">
        <Loader2 className="w-4 h-4 animate-spin text-[#62B8F5]" />
        Loading Notevox Razorpay plans...
      </div>
    );
  }

  const totalDue = promoQuote?.totalCents ?? 0;

  return (
    <div className="space-y-7">
      {/* Header + Currency & Cadence Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#1C1926] tracking-tight">
            Plans, Razorpay Checkout &amp; Billing API
          </h2>
          <p className="text-xs text-[#5C566C] mt-1">
            Active tier:{' '}
            <strong className="text-[#1C1926]">{activePlan?.name || 'Starter'}</strong>
            {profile?.paymentMethod ? ` · ${profile.paymentMethod}` : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Currency Toggle */}
          <div className="inline-flex items-center p-1 rounded-xl bg-[#F3EEE2] border border-[#E5DCCB]">
            {(['INR', 'USD'] as const).map((curr) => (
              <button
                key={curr}
                type="button"
                onClick={() => setCurrency(curr)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  currency === curr
                    ? 'bg-[#1C1926] text-[#FFFDF8]'
                    : 'text-[#5C566C] hover:text-[#1C1926]'
                }`}
              >
                {curr === 'INR' ? '₹ INR' : '$ USD'}
              </button>
            ))}
          </div>

          {/* Monthly / Annual Cadence Toggle */}
          <div className="inline-flex items-center p-1 rounded-xl bg-[#F3EEE2] border border-[#E5DCCB]">
            <button
              type="button"
              onClick={() => setBillingCycle('monthly')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                billingCycle === 'monthly'
                  ? 'bg-white text-[#1C1926] shadow-xs'
                  : 'text-[#5C566C] hover:text-[#1C1926]'
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle('annual')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                billingCycle === 'annual'
                  ? 'bg-white text-[#1C1926] shadow-xs'
                  : 'text-[#5C566C] hover:text-[#1C1926]'
              }`}
            >
              Annual (Save 25%)
            </button>
          </div>
        </div>
      </div>

      {/* Razorpay Connection Status & Free Test Key Setup Card */}
      <section className="nv-hardware-deck rounded-2xl overflow-hidden text-[#FFFDF8]">
        <div className="h-1 w-full nv-spectrum-bar" aria-hidden="true" />
        <div className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2.5">
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  razorpayStatus.configured ? 'bg-[#83D66F]' : 'bg-[#FFD45C]'
                }`}
                aria-hidden="true"
              />
              <h3 className="text-sm sm:text-base font-bold tracking-tight">
                {razorpayStatus.configured
                  ? `Razorpay ${
                      razorpayStatus.mode === 'razorpay_live' ? 'Live' : 'Test'
                    } Checkout Connected${
                      razorpayStatus.keyIdPreview ? ` (${razorpayStatus.keyIdPreview})` : ''
                    }`
                  : 'Razorpay Checkout Ready · Free Built-In Test Mode Active'}
              </h3>
            </div>
            <p className="text-xs text-[#C8C3D6] leading-relaxed">
              {razorpayStatus.configured && razorpayStatus.hasSecret
                ? 'Orders are created via Razorpay Orders API (api.razorpay.com/v1/orders), opened in the official Razorpay Checkout modal, and verified with HMAC-SHA256.'
                : razorpayStatus.configured
                  ? 'Connected to the official Razorpay Checkout popup in Test Mode (₹ INR recommended). Test UPI (success@razorpay), Test Cards, and Netbanking work right now and save real Razorpay Payment IDs to Firestore. Optional: add RAZORPAY_KEY_SECRET in Settings → Secrets to also enable server-signed Orders API.'
                  : 'You can test UPI, Cards, Netbanking, or CAMPUSFREE right now with zero setup. To launch the official Razorpay popup with your own free Razorpay Test Key, add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Settings → Secrets.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowKeyGuide((prev) => !prev)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-[#FFFDF8] transition-colors whitespace-nowrap cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5 text-[#FFD45C]" />
              <span>
                {showKeyGuide
                  ? 'Hide Razorpay Key Guide'
                  : razorpayStatus.configured && !razorpayStatus.hasSecret
                    ? 'Optional: Add Key Secret'
                    : 'Razorpay Key Setup'}
              </span>
            </button>
          </div>
        </div>

        <AnimatePresence>
          {showKeyGuide && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden border-t border-white/10 bg-black/20"
            >
              <div className="p-5 sm:p-6 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-1.5">
                  <div className="font-mono font-bold text-[#62B8F5]">01 · FREE TEST ACCOUNT</div>
                  <p className="text-[#E3DFF0] leading-relaxed">
                    Open{' '}
                    <a
                      href="https://dashboard.razorpay.com"
                      target="_blank"
                      rel="noreferrer"
                      className="underline text-[#FFD45C] inline-flex items-center gap-1"
                    >
                      dashboard.razorpay.com
                      <ExternalLink className="w-3 h-3" />
                    </a>{' '}
                    and flip the top toggle to <strong>Test Mode</strong> (100% free, no real money).
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-1.5">
                  <div className="font-mono font-bold text-[#F4A6C6]">02 · GENERATE FREE KEY</div>
                  <p className="text-[#E3DFF0] leading-relaxed">
                    Go to <strong>Account &amp; Settings → API Keys → Generate Test Key</strong>. Copy
                    your <code className="text-[#FFD45C]">rzp_test_...</code> Key ID and Key Secret.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-1.5">
                  <div className="font-mono font-bold text-[#83D66F]">03 · ADD IN SECRETS</div>
                  <p className="text-[#E3DFF0] leading-relaxed">
                    Open AI Studio <strong>Settings → Secrets</strong>, add{' '}
                    <code className="text-[#83D66F]">RAZORPAY_KEY_ID</code> and{' '}
                    <code className="text-[#83D66F]">RAZORPAY_KEY_SECRET</code>. Notevox auto-connects
                    on reload.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {catalogError && (
        <div className="p-4 rounded-xl bg-[#FDF2F7] border border-[#F2C6D8] text-sm text-[#8E2050]">
          {catalogError}
        </div>
      )}

      {/* 3 Neo-Pop Student Plan Cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {plans.map((plan) => {
          const isCurrent = (profile?.planId || 'starter') === plan.id;
          const isSelected = selectedPlanId === plan.id;
          const priceTable = plan.pricing[currency] || plan.pricing.INR;
          const displayPrice =
            billingCycle === 'annual'
              ? priceTable.annualMonthlyEquivalentSubunits
              : priceTable.monthlySubunits;

          const topAccent =
            plan.accent === 'pink'
              ? 'bg-[#F4A6C6]'
              : plan.accent === 'lavender'
                ? 'bg-[#C9B6F5]'
                : 'bg-[#62B8F5]';
          const softTint =
            plan.accent === 'pink'
              ? 'bg-[#FDF2F7]'
              : plan.accent === 'lavender'
                ? 'bg-[#F5F1FE]'
                : 'bg-[#EEF7FE]';

          return (
            <motion.div
              key={plan.id}
              whileHover={{ y: -3 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              className={`nv-studio-card rounded-2xl overflow-hidden flex flex-col justify-between ${
                isSelected ? 'border-[#1C1926] ring-2 ring-[#1C1926]' : ''
              }`}
            >
              <div>
                <div className={`h-2 w-full ${topAccent}`} aria-hidden="true" />
                <div className="p-6 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold text-[#1C1926] ${softTint}`}
                    >
                      {plan.id === 'scholar'
                        ? 'Most Popular'
                        : plan.id === 'campus'
                          ? 'Power Study'
                          : 'Free Forever'}
                    </span>
                    {isCurrent && (
                      <span className="text-xs font-bold text-[#226119]">Active Plan</span>
                    )}
                  </div>

                  <div>
                    <h3 className="text-xl font-bold text-[#1C1926]">{plan.name}</h3>
                    <p className="text-xs text-[#5C566C] mt-0.5">{plan.audience}</p>
                  </div>

                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-mono font-bold tabular-nums text-[#1C1926]">
                      {formatCurrencyCents(displayPrice, currency)}
                    </span>
                    <span className="text-xs text-[#5C566C]">
                      / mo{billingCycle === 'annual' && displayPrice > 0 ? ' billed yearly' : ''}
                    </span>
                  </div>

                  <dl className="space-y-2.5 pt-4 border-t border-[#F0E9DC] text-xs">
                    <div className="flex justify-between gap-2">
                      <dt className="text-[#5C566C]">Lecture Audio</dt>
                      <dd className="font-semibold text-[#1C1926] text-right">
                        {plan.limits.audioMinutesPerMonth}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-[#5C566C]">Document Uploads</dt>
                      <dd className="font-semibold text-[#1C1926] text-right">
                        {plan.limits.documentUploadsPerMonth}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-[#5C566C]">Flashcards</dt>
                      <dd className="font-semibold text-[#1C1926] text-right">
                        {plan.limits.flashcardDecks}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-[#5C566C]">Spoken Readout</dt>
                      <dd className="font-semibold text-[#1C1926] text-right">
                        {plan.limits.audioReadout}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>

              <div className="px-6 pb-6">
                <button
                  type="button"
                  onClick={() => setSelectedPlanId(plan.id)}
                  className={`w-full py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#1C1926] text-[#FFFDF8]'
                      : 'bg-[#F7F2E7] text-[#1C1926] hover:bg-[#EFE9DC]'
                  }`}
                >
                  {isSelected ? 'Selected for Checkout' : `Select ${plan.name}`}
                </button>
              </div>
            </motion.div>
          );
        })}
      </section>

      {/* Razorpay Checkout Panel + Real Firestore Receipts */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleStartCheckout}
          className="lg:col-span-7 nv-studio-card rounded-2xl p-6 space-y-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-[#1C1926]">Razorpay Checkout</h3>
              <p className="text-xs text-[#5C566C] mt-0.5">
                Pick a payment rail, optionally apply a student discount code, and launch Razorpay.
              </p>
            </div>
            <div className="w-9 h-9 rounded-xl bg-[#EEF7FE] text-[#145585] flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>

          {/* Payment Methods Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {paymentMethods.map((method) => {
              const Icon = methodIcon(method.id);
              const active = paymentMethod === method.id;
              return (
                <button
                  key={method.id}
                  type="button"
                  onClick={() => {
                    setPaymentMethod(method.id);
                    if (method.id === 'student_grant' && !promoInput.trim()) {
                      setPromoInput('CAMPUSFREE');
                      void handleValidatePromo('CAMPUSFREE');
                    }
                  }}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                    active
                      ? 'bg-[#FFF9E5] border-[#1C1926] ring-1 ring-[#1C1926]'
                      : 'bg-[#FFFDF8] border-[#E8E0D0] hover:border-[#C9C1B0]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        active ? 'bg-[#FFD45C] text-[#1C1926]' : 'bg-[#F3EEE2] text-[#5C566C]'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="text-xs font-bold text-[#1C1926]">{method.label}</span>
                  </div>
                  <p className="text-[11px] text-[#5C566C] mt-1.5 leading-snug">{method.detail}</p>
                </button>
              );
            })}
          </div>

          {/* Student Promo Code with 1-Click Quick-Apply */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-semibold text-[#1C1926]">Student Promo Code</label>
              <div className="flex items-center gap-1.5">
                {(['STUDENT25', 'STUDY15', 'CAMPUSFREE'] as const).map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => {
                      setPromoInput(code);
                      void handleValidatePromo(code);
                    }}
                    className="px-2 py-0.5 rounded-md bg-[#F7F2E7] hover:bg-[#FFD45C] border border-[#E5DCCB] text-[10px] font-mono font-bold text-[#1C1926] transition-colors cursor-pointer"
                  >
                    {code}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={promoInput}
                onChange={(e) => setPromoInput(e.target.value)}
                placeholder="Enter promo code (e.g., STUDENT25 or CAMPUSFREE)"
                maxLength={32}
                className="flex-1 h-10 px-3.5 rounded-xl bg-[#FFFDF8] border border-[#E5DCCB] text-sm font-mono uppercase focus:border-[#1C1926] focus:outline-none"
              />
              <button
                type="button"
                disabled={validatingPromo}
                onClick={() => void handleValidatePromo()}
                className="h-10 px-4 rounded-xl bg-[#F7F2E7] border border-[#E5DCCB] text-xs font-semibold text-[#1C1926] hover:bg-[#EFE9DC] whitespace-nowrap cursor-pointer"
              >
                {validatingPromo ? 'Checking...' : 'Apply'}
              </button>
            </div>
            {promoQuote?.promoMessage && (
              <p
                className={`text-xs font-medium ${
                  promoQuote.validPromo ? 'text-[#226119]' : 'text-[#8E2050]'
                }`}
              >
                {promoQuote.promoMessage}
              </p>
            )}
          </div>

          {/* Live Order Breakdown */}
          <div className="p-4 rounded-xl bg-[#F8F4EA] border border-[#EAE3D5] space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-[#5C566C]">
                {selectedPlan?.name || 'Plan'} ({billingCycle})
              </span>
              <span className="font-mono tabular-nums font-semibold text-[#1C1926]">
                {formatCurrencyCents(promoQuote?.subtotalCents ?? 0, currency)}
              </span>
            </div>
            {(promoQuote?.discountCents ?? 0) > 0 && (
              <div className="flex justify-between text-[#226119]">
                <span>Student Discount ({promoQuote?.promoCode})</span>
                <span className="font-mono tabular-nums font-semibold">
                  -{formatCurrencyCents(promoQuote?.discountCents ?? 0, currency)}
                </span>
              </div>
            )}
            <div className="pt-2 border-t border-[#E5DCCB] flex justify-between items-baseline text-sm font-bold text-[#1C1926]">
              <span>
                Total Due Today{' '}
                <span className="text-[11px] font-normal text-[#5C566C]">({currency})</span>
              </span>
              <span className="font-mono text-base tabular-nums">
                {formatCurrencyCents(totalDue, currency)}
              </span>
            </div>
          </div>

          {checkoutError && (
            <div className="p-3.5 rounded-xl bg-[#FDF2F7] border border-[#F2C6D8] text-xs text-[#8E2050]">
              {checkoutError}
            </div>
          )}

          {successReceipt && (
            <div className="p-3.5 rounded-xl bg-[#F0FAED] border border-[#83D66F] text-xs text-[#226119] flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successReceipt}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={checkingOut}
            className="w-full py-3.5 px-5 rounded-xl bg-[#1C1926] text-[#FFFDF8] text-sm font-bold hover:bg-[#312C42] disabled:opacity-60 inline-flex items-center justify-center gap-2.5 transition-colors cursor-pointer"
          >
            {checkingOut ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-[#62B8F5]" />
                <span>Connecting to Razorpay...</span>
              </>
            ) : totalDue === 0 ? (
              <>
                <Sparkles className="w-4 h-4 text-[#83D66F]" />
                <span>Activate {selectedPlan?.name || 'Plan'} Free (0 {currency})</span>
              </>
            ) : (
              <>
                <Lock className="w-4 h-4 text-[#62B8F5]" />
                <span>
                  Pay {formatCurrencyCents(totalDue, currency)} with Razorpay
                </span>
              </>
            )}
          </button>
        </form>

        {/* Right 5 cols: Firestore Billing History & Razorpay REST API Docs */}
        <div className="lg:col-span-5 space-y-5">
          <div className="nv-studio-card rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-[#1C1926]" />
                <h3 className="text-base font-bold text-[#1C1926]">Verified Receipts</h3>
              </div>
              <span className="text-xs font-mono tabular-nums text-[#5C566C]">
                {billingRecords.length} {billingRecords.length === 1 ? 'receipt' : 'receipts'}
              </span>
            </div>

            {billingRecords.length === 0 ? (
              <p className="text-xs text-[#5C566C] py-4 leading-relaxed">
                No payment receipts yet. Every completed Razorpay order or free academic activation is
                permanently logged to your Firestore account here.
              </p>
            ) : (
              <div className="divide-y divide-[#F0E9DC]">
                {billingRecords.map((rec) => (
                  <div key={rec.id} className="py-3 first:pt-1 last:pb-1 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-[#1C1926] capitalize">
                        {rec.planId} · {rec.billingCycle}
                      </span>
                      <span className="font-mono font-bold tabular-nums text-[#1C1926]">
                        {formatCurrencyCents(rec.amountCents, rec.currency || 'INR')}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-[#5C566C]">
                      <span className="font-mono">{rec.receiptId}</span>
                      <span>
                        {gatewayBadgeLabel(rec.gatewayMode)} · {formatTimestampDate(rec.createdAt)}
                      </span>
                    </div>
                    {rec.gatewayPaymentId && (
                      <div className="text-[10px] font-mono text-[#7B748C] truncate">
                        Payment ID: {rec.gatewayPaymentId}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="nv-studio-card rounded-2xl p-5 space-y-3 bg-[#F8F4EA]">
            <button
              type="button"
              onClick={() => setShowApiDocs((prev) => !prev)}
              className="w-full flex items-center justify-between text-left cursor-pointer"
            >
              <span className="inline-flex items-center gap-2 text-xs font-bold text-[#1C1926]">
                <Code2 className="w-4 h-4 text-[#4D3290]" />
                Notevox Razorpay &amp; Billing REST API
              </span>
              <span className="text-xs font-semibold text-[#5C566C]">
                {showApiDocs ? 'Hide' : 'View'}
              </span>
            </button>

            {showApiDocs && (
              <div className="space-y-3 pt-2 border-t border-[#E5DCCB] text-xs font-mono text-[#2A2638]">
                <div>
                  <div className="font-semibold text-[#145585]">GET /api/billing/plans</div>
                  <p className="font-sans text-[11px] text-[#5C566C]">
                    Returns INR &amp; USD plans, Razorpay gateway readiness, and enabled rails.
                  </p>
                </div>
                <div>
                  <div className="font-semibold text-[#226119]">POST /api/billing/validate-promo</div>
                  <p className="font-sans text-[11px] text-[#5C566C]">
                    Computes server-authoritative discount and total in INR paise or USD cents.
                  </p>
                </div>
                <div>
                  <div className="font-semibold text-[#8E2050]">
                    POST /api/billing/razorpay/create-order
                  </div>
                  <p className="font-sans text-[11px] text-[#5C566C]">
                    Creates an order via Razorpay Orders API (or built-in Test Sandbox before keys are
                    added in Secrets).
                  </p>
                </div>
                <div>
                  <div className="font-semibold text-[#4D3290]">
                    POST /api/billing/razorpay/verify
                  </div>
                  <p className="font-sans text-[11px] text-[#5C566C]">
                    Validates HMAC-SHA256 signature with timing-safe comparison and returns a verified
                    receipt.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Interactive Razorpay Test Checkout Modal (Seamless Built-In Fallback before Secrets keys) */}
      <AnimatePresence>
        {sandboxOrder && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[#1C1926]/65 backdrop-blur-xs flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rzp-sandbox-title"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: 0.18 }}
              className="w-full max-w-md rounded-2xl overflow-hidden bg-white border border-[#1C1926] shadow-2xl"
            >
              {/* Razorpay-style Obsidian Header */}
              <div className="nv-hardware-deck text-[#FFFDF8] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#62B8F5]" />
                      <span className="text-[11px] font-mono uppercase tracking-wider text-[#62B8F5] font-semibold">
                        Razorpay Test Checkout
                      </span>
                    </div>
                    <h3 id="rzp-sandbox-title" className="text-lg font-bold mt-1">
                      Notevox · {sandboxOrder.planName}
                    </h3>
                    <p className="text-[11px] font-mono text-[#B7B0C9] mt-0.5">
                      Order {sandboxOrder.orderId}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSandboxOrder(null)}
                    aria-label="Close Razorpay test checkout"
                    className="p-1.5 rounded-lg text-[#C8C3D6] hover:bg-white/10 hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="mt-4 pt-3 border-t border-white/10 flex items-baseline justify-between">
                  <span className="text-xs text-[#C8C3D6] capitalize">
                    {sandboxOrder.billingCycle} plan ({sandboxOrder.currency})
                  </span>
                  <span className="text-2xl font-mono font-bold tabular-nums text-[#FFFDF8]">
                    {formatCurrencyCents(sandboxOrder.amount, sandboxOrder.currency)}
                  </span>
                </div>
              </div>

              {/* Payment Rail Tabs */}
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-3 gap-2 p-1 rounded-xl bg-[#F3EEE2] border border-[#E5DCCB]">
                  {(
                    [
                      { id: 'upi', label: 'UPI / QR' },
                      { id: 'card', label: 'Test Card' },
                      { id: 'netbanking', label: 'Netbanking' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setSandboxTab(tab.id)}
                      className={`py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        sandboxTab === tab.id
                          ? 'bg-white text-[#1C1926] shadow-xs'
                          : 'text-[#5C566C] hover:text-[#1C1926]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {sandboxTab === 'upi' && (
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-[#1C1926]">
                      Razorpay Test UPI ID
                    </label>
                    <input
                      type="text"
                      value={sandboxUpi}
                      onChange={(e) => setSandboxUpi(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#FFFDF8] border border-[#E5DCCB] text-sm font-mono"
                    />
                    <p className="text-[11px] text-[#5C566C]">
                      Uses Razorpay&apos;s standard test VPA (<code className="font-mono">success@razorpay</code>) — no real debit.
                    </p>
                  </div>
                )}

                {sandboxTab === 'card' && (
                  <div className="p-4 rounded-xl bg-[#F8F4EA] border border-[#EAE3D5] space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[#1C1926]">Razorpay Test Visa</span>
                      <span className="font-mono text-[#5C566C]">EXP 12/29 · CVV 111</span>
                    </div>
                    <div className="font-mono text-base font-bold tracking-widest text-[#1C1926] tabular-nums">
                      4111 1111 1111 1111
                    </div>
                    <p className="text-[11px] text-[#5C566C]">
                      Pre-filled official Razorpay test card for instant test authorization.
                    </p>
                  </div>
                )}

                {sandboxTab === 'netbanking' && (
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-[#1C1926]">
                      Select Test Bank
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {['HDFC Bank (Test)', 'SBI (Test)', 'ICICI Bank (Test)', 'Axis Bank (Test)'].map(
                        (bank) => (
                          <button
                            key={bank}
                            type="button"
                            onClick={() => setSandboxBank(bank)}
                            className={`p-2.5 rounded-xl border text-xs font-semibold text-left cursor-pointer ${
                              sandboxBank === bank
                                ? 'bg-[#EEF7FE] border-[#1C1926] text-[#1C1926]'
                                : 'bg-[#FFFDF8] border-[#E8E0D0] text-[#5C566C]'
                            }`}
                          >
                            {bank}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                )}

                <div className="p-3 rounded-xl bg-[#FFF9E5] border border-[#F5DF98] text-[11px] text-[#7A5200] leading-relaxed">
                  <strong>Test Sandbox Mode:</strong> Add free <code className="font-mono">RAZORPAY_KEY_ID</code> &amp;{' '}
                  <code className="font-mono">RAZORPAY_KEY_SECRET</code> in Settings → Secrets anytime to swap this sheet for the live Razorpay gateway popup.
                </div>

                <div className="flex items-center gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setSandboxOrder(null)}
                    disabled={verifyingSandbox}
                    className="px-4 py-3 rounded-xl border border-[#E5DCCB] text-xs font-semibold text-[#5C566C] hover:bg-[#F7F2E7] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={verifyingSandbox}
                    onClick={() => void handleConfirmSandboxPayment()}
                    className="flex-1 py-3 px-4 rounded-xl bg-[#62B8F5] hover:bg-[#4CA8EC] text-[#1C1926] text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {verifyingSandbox ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Verifying Signature...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        Authorize Test Payment (
                        {formatCurrencyCents(sandboxOrder.amount, sandboxOrder.currency)})
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
