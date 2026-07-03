import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

const PRICES: Record<string, string | undefined> = {
  starter: process.env.STRIPE_PRICE_STARTER,
  growth: process.env.STRIPE_PRICE_GROWTH,
  pro: process.env.STRIPE_PRICE_PRO,
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { plan } = (await request.json()) as { plan?: string };
  if (!plan || !PRICES[plan]) {
    return NextResponse.json({ error: "plan invalide" }, { status: 400 });
  }
  const price = PRICES[plan]!;

  const { data: agency } = await supabase
    .from("agency")
    .select("id, stripe_customer_id")
    .limit(1)
    .maybeSingle<{ id: string; stripe_customer_id: string | null }>();

  if (!agency) {
    return NextResponse.json({ error: "aucune agence" }, { status: 400 });
  }

  const origin = new URL(request.url).origin;

  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    customer: agency.stripe_customer_id ?? undefined,
    customer_email: agency.stripe_customer_id ? undefined : user.email,
    client_reference_id: agency.id,
    subscription_data: { metadata: { agency_id: agency.id, plan } },
    allow_promotion_codes: true,
    success_url: `${origin}/dashboard?checkout=success`,
    cancel_url: `${origin}/dashboard?checkout=cancel`,
  });

  return NextResponse.json({ url: session.url });
}
