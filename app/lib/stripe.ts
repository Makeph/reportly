import Stripe from "stripe";

let client: Stripe | null = null;

// Instanciation paresseuse : évite de crasher au build (page-data collection)
// quand STRIPE_SECRET_KEY n'est pas encore défini. apiVersion omise → défaut du compte.
export function getStripe(): Stripe {
  if (!client) {
    client = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
  }
  return client;
}
