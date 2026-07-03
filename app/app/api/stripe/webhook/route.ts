import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

// Stripe a besoin du corps brut pour vérifier la signature.
export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET ?? ""
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "bad signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const sub = event.data.object as Stripe.Subscription;
    const agencyId = sub.metadata?.agency_id;
    if (agencyId) {
      const admin = createAdminClient();
      await admin
        .from("agency")
        .update({
          stripe_customer_id: String(sub.customer),
          stripe_subscription_id: sub.id,
          subscription_status: sub.status,
          plan: sub.metadata?.plan ?? null,
          current_period_end: new Date(
            sub.current_period_end * 1000
          ).toISOString(),
        })
        .eq("id", agencyId);
    }
  }

  return NextResponse.json({ received: true });
}
