import Stripe from 'stripe';
import { storage } from '../storage';
import { UserAccount, SubscriptionRecord, WebhookEventRecord } from '../../types';

export interface CheckoutSessionOptions {
  userId: string;
  planId: string;
  originUrl: string;
}

export class BillingService {
  private stripe: Stripe | null = null;
  private isConfigured: boolean = false;
  private isProduction: boolean = process.env.NODE_ENV === 'production';

  constructor() {
    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (apiKey) {
      this.stripe = new Stripe(apiKey, {
        apiVersion: '2025-02-24.acacia' as any,
        typescript: true,
      });
      this.isConfigured = true;
    } else {
      if (this.isProduction && process.env.PAYMENT_PROVIDER === 'stripe') {
        console.error('[BillingService] FATAL: STRIPE_SECRET_KEY is missing in production environment!');
      }
    }
  }

  /**
   * Identifies the current Stripe environment mode based on the secret key prefix
   */
  public getStripeMode(): 'live' | 'test' | 'unconfigured' {
    if (!this.stripe || !process.env.STRIPE_SECRET_KEY) return 'unconfigured';
    const key = process.env.STRIPE_SECRET_KEY;
    if (key.startsWith('sk_live_') || key.startsWith('rk_live_')) return 'live';
    if (key.startsWith('sk_test_') || key.startsWith('rk_test_')) return 'test';
    return 'test';
  }

  /**
   * Helper to resolve plan credit allocations
   */
  public getPlanCreditAllocation(planId: string): number {
    switch (planId) {
      case 'creator':
        return 30;
      case 'pro':
        return 75;
      case 'agency':
        return 600;
      case 'audit_once':
        return 60;
      default:
        return 0;
    }
  }

  /**
   * Resolves configured price ID from environment or uses default product configuration
   */
  private getPriceIdForPlan(planId: string): string | null {
    switch (planId) {
      case 'creator':
        return process.env.STRIPE_PRICE_CREATOR || null;
      case 'pro':
        return process.env.STRIPE_PRICE_PRO || null;
      case 'agency':
        return process.env.STRIPE_PRICE_AGENCY || null;
      case 'audit_once':
        return process.env.STRIPE_PRICE_AUDIT_ONCE || null;
      default:
        return null;
    }
  }

  /**
   * Creates a Stripe Checkout Session for a selected plan
   */
  public async createCheckoutSession(options: CheckoutSessionOptions): Promise<{ url: string; sessionId: string; mode: string }> {
    const { userId, planId, originUrl } = options;

    if (planId === 'free') {
      throw new Error('Free plan does not require a payment session.');
    }

    const user = await storage.users.getUser(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const paymentMode = process.env.PAYMENT_MODE;
    const requireLive = this.isProduction || paymentMode === 'production' || paymentMode === 'live';

    // Production guard: fail fast if production credentials are missing or if test key is used in production
    if (requireLive) {
      if (!this.stripe) {
        throw new Error('Payment gateway is not configured for production. Please verify STRIPE_SECRET_KEY.');
      }
      if (this.getStripeMode() !== 'live') {
        throw new Error('Production mode requires a Stripe LIVE key (sk_live_... or rk_live_...). Found test mode credentials.');
      }
    }

    // Real Stripe Session Creation if Stripe SDK is configured
    if (this.stripe) {
      const priceId = this.getPriceIdForPlan(planId);
      const isOneTime = (planId === 'audit_once');

      const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = priceId 
        ? [{ price: priceId, quantity: 1 }]
        : [{
            price_data: {
              currency: 'usd',
              product_data: {
                name: `VideoRisk ${planId.toUpperCase()} Plan`,
                description: isOneTime ? '60 video inspection minutes (one-time)' : 'Monthly video inspection credits',
              },
              unit_amount: planId === 'creator' ? 900 : planId === 'pro' ? 1900 : planId === 'agency' ? 9900 : 2900,
              recurring: isOneTime ? undefined : { interval: 'month' },
            },
            quantity: 1,
          }];

      const session = await this.stripe.checkout.sessions.create({
        mode: isOneTime ? 'payment' : 'subscription',
        line_items: lineItems,
        customer_email: user.email,
        client_reference_id: user.id,
        metadata: {
          userId: user.id,
          planId: planId,
        },
        success_url: `${originUrl}/?checkout_status=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${originUrl}/?checkout_status=canceled`,
      });

      if (!session.url) {
        throw new Error('Failed to generate checkout URL from Stripe.');
      }

      // Explicitly distinguish between live and test Stripe sessions
      const stripeMode = session.livemode ? 'live' : 'test';

      return {
        url: session.url,
        sessionId: session.id,
        mode: stripeMode,
      };
    }

    // Development Simulation Mode (ONLY permitted when requireLive is false)
    if (requireLive) {
      throw new Error('Simulation checkout is strictly forbidden in production mode.');
    }

    const simulatedSessionId = `sim_session_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    return {
      url: `${originUrl}/?checkout_status=success&session_id=${simulatedSessionId}&plan=${planId}&mode=simulation`,
      sessionId: simulatedSessionId,
      mode: 'simulation',
    };
  }

  /**
   * Processes Stripe Webhook with Official Cryptographic Signature Verification and Idempotency
   */
  public async handleWebhook(rawBody: Buffer, signature: string): Promise<{ received: boolean; eventType: string; eventId: string; alreadyProcessed?: boolean }> {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!this.stripe && !webhookSecret) {
      // If Stripe is not initialized and in development mode, reject or allow simulation event
      if (this.isProduction) {
        throw new Error('Stripe Webhook is unconfigured in production.');
      }
    }

    let event: Stripe.Event;

    if (this.stripe && webhookSecret) {
      try {
        event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
      } catch (err: any) {
        console.error('[BillingService] Webhook signature verification failed:', err.message);
        throw new Error(`Webhook Error: ${err.message}`);
      }
    } else {
      // In development test fixture mode without webhook secret, parse payload safely
      try {
        event = JSON.parse(rawBody.toString('utf-8'));
      } catch (err) {
        throw new Error('Invalid JSON payload');
      }
    }

    // Idempotency Gate (Blocker Requirement: Section 9 & 17)
    // Providers retry webhooks; duplicate events MUST NOT grant duplicate credits
    const isAlreadyProcessed = await storage.billing.isEventProcessed(event.id);
    if (isAlreadyProcessed) {
      console.log(`[BillingService] Idempotency hit: Event ${event.id} already processed. Acknowledging without mutation.`);
      return {
        received: true,
        eventType: event.type,
        eventId: event.id,
        alreadyProcessed: true,
      };
    }

    // Dispatch verified Stripe event
    await this.processVerifiedEvent(event);

    return {
      received: true,
      eventType: event.type,
      eventId: event.id,
      alreadyProcessed: false,
    };
  }

  /**
   * Dispatches business logic for verified events
   */
  private async processVerifiedEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id || session.metadata?.userId;
        if (!userId) {
          console.error('[BillingService] checkout.session.completed missing userId reference.');
          return;
        }
        const planId = session.metadata?.planId || 'creator';

        const creditAllocation = this.getPlanCreditAllocation(planId);

        // Update user entitlement and credits
        const user = await storage.users.getUser(userId);
        if (!user) {
          console.error(`[BillingService] checkout.session.completed: User ${userId} not found.`);
          return;
        }
        
        if (planId === 'audit_once') {
          // One-time audit: adds one-time credits without changing monthly recurring tier
          await storage.users.addCredits(user.id, creditAllocation);
        } else {
          // Recurring subscription tier update
          await storage.users.updatePlan(user.id, planId as any, creditAllocation);
        }

        // Save customer and subscription identifiers
        if (session.customer) {
          await storage.users.updateUser(user.id, {
            stripeCustomerId: typeof session.customer === 'string' ? session.customer : session.customer.id,
            subscriptionId: typeof session.subscription === 'string' ? session.subscription : session.subscription?.id,
            subscriptionStatus: 'active',
          });
        }

        // Record subscription state in repository
        if (session.subscription) {
          const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
          await storage.billing.saveSubscription({
            id: subId,
            userId: user.id,
            planId,
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }

        // Mark event processed for idempotency
        await storage.billing.markEventProcessed({
          eventId: event.id,
          provider: 'stripe',
          eventType: event.type,
          processedAt: new Date().toISOString(),
          userId: user.id,
          creditsGranted: creditAllocation,
          planGranted: planId,
        });

        console.log(`[BillingService] checkout.session.completed: Allocated ${creditAllocation} credits to ${userId} for plan ${planId}`);
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as any;
        // Verify this is a monthly subscription cycle renewal, not the initial checkout
        if (invoice.billing_reason === 'subscription_cycle') {
          const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;

          if (subscriptionId) {
            const sub = await storage.billing.getSubscription(subscriptionId);
            if (sub) {
              const creditAllocation = this.getPlanCreditAllocation(sub.planId);
              await storage.users.addCredits(sub.userId, creditAllocation);
              
              await storage.billing.markEventProcessed({
                eventId: event.id,
                provider: 'stripe',
                eventType: event.type,
                processedAt: new Date().toISOString(),
                userId: sub.userId,
                creditsGranted: creditAllocation,
                planGranted: sub.planId,
              });

              console.log(`[BillingService] invoice.paid (Cycle Renewal): Granted monthly ${creditAllocation} credits to user ${sub.userId}`);
              break;
            }
          }
        }

        // Mark event processed
        await storage.billing.markEventProcessed({
          eventId: event.id,
          provider: 'stripe',
          eventType: event.type,
          processedAt: new Date().toISOString(),
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const sub = await storage.billing.getSubscription(subscription.id);
        if (sub) {
          sub.status = 'canceled';
          sub.updatedAt = new Date().toISOString();
          await storage.billing.saveSubscription(sub);

          await storage.users.updateUser(sub.userId, {
            subscriptionStatus: 'canceled',
          });
          console.log(`[BillingService] Subscription ${subscription.id} canceled for user ${sub.userId}`);
        }

        await storage.billing.markEventProcessed({
          eventId: event.id,
          provider: 'stripe',
          eventType: event.type,
          processedAt: new Date().toISOString(),
        });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as any;
        const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
        if (subscriptionId) {
          const sub = await storage.billing.getSubscription(subscriptionId);
          if (sub) {
            sub.status = 'past_due';
            sub.updatedAt = new Date().toISOString();
            await storage.billing.saveSubscription(sub);
            await storage.users.updateUser(sub.userId, {
              subscriptionStatus: 'past_due',
            });
            console.warn(`[BillingService] Payment failed for subscription ${subscriptionId}, user ${sub.userId}`);
          }
        }

        await storage.billing.markEventProcessed({
          eventId: event.id,
          provider: 'stripe',
          eventType: event.type,
          processedAt: new Date().toISOString(),
        });
        break;
      }

      default: {
        // Unknown or non-critical provider event: acknowledge safely without mutating state
        await storage.billing.markEventProcessed({
          eventId: event.id,
          provider: 'stripe',
          eventType: event.type,
          processedAt: new Date().toISOString(),
        });
        break;
      }
    }
  }

  /**
   * Completes a simulated checkout session (for development testing only)
   */
  public async completeSimulatedCheckout(sessionId: string, planId: string, userId: string): Promise<UserAccount> {
    const paymentMode = process.env.PAYMENT_MODE;
    const requireLive = this.isProduction || paymentMode === 'production' || paymentMode === 'live';
    if (requireLive) {
      throw new Error('Simulation checkout completion is strictly forbidden in production mode.');
    }

    const syntheticEventId = `sim_evt_${sessionId}`;
    const alreadyProcessed = await storage.billing.isEventProcessed(syntheticEventId);
    if (alreadyProcessed) {
      const existingUser = await storage.users.getUser(userId);
      if (!existingUser) throw new Error(`User not found: ${userId}`);
      return existingUser;
    }

    const creditAllocation = this.getPlanCreditAllocation(planId);
    let user = await storage.users.getUser(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    if (planId === 'audit_once') {
      user = await storage.users.addCredits(user.id, creditAllocation);
    } else {
      user = await storage.users.updatePlan(user.id, planId as any, creditAllocation);
    }

    await storage.billing.markEventProcessed({
      eventId: syntheticEventId,
      provider: 'stripe',
      eventType: 'checkout.session.completed',
      processedAt: new Date().toISOString(),
      userId: user.id,
      creditsGranted: creditAllocation,
      planGranted: planId,
    });

    return user;
  }
}

export const billingService = new BillingService();
