import "dotenv/config";
import Stripe from "stripe";
import fs from "fs";
import path from "path";

const key = process.env.STRIPE_SECRET_KEY?.replace(/^"|"$/g, "");
if (!key) {
  console.error("STRIPE_SECRET_KEY missing");
  process.exit(1);
}

const stripe = new Stripe(key);

const product = await stripe.products.create({
  name: "BookAI Unlimited",
  description:
    "Unlimited pages and audio for serious authors — subject to fair use and rate limits.",
  metadata: { bookai_plan: "UNLIMITED" },
});

const monthly = await stripe.prices.create({
  product: product.id,
  currency: "usd",
  unit_amount: 9900,
  recurring: { interval: "month" },
  lookup_key: "bookai_unlimited_month",
  metadata: { bookai_plan: "UNLIMITED", interval: "month" },
});

const yearly = await stripe.prices.create({
  product: product.id,
  currency: "usd",
  unit_amount: 99000,
  recurring: { interval: "year" },
  lookup_key: "bookai_unlimited_year",
  metadata: { bookai_plan: "UNLIMITED", interval: "year" },
});

console.log(
  JSON.stringify(
    {
      productId: product.id,
      STRIPE_UNLIMITED_PRICE_ID: monthly.id,
      STRIPE_UNLIMITED_YEARLY_PRICE_ID: yearly.id,
    },
    null,
    2
  )
);

const envPath = path.resolve(process.cwd(), ".env");
let env = fs.readFileSync(envPath, "utf8");
const upsert = (name, value) => {
  const line = `${name}="${value}"`;
  const re = new RegExp(`^${name}=.*$`, "m");
  if (re.test(env)) env = env.replace(re, line);
  else env = env.trimEnd() + `\n${line}\n`;
};
upsert("STRIPE_UNLIMITED_PRICE_ID", monthly.id);
upsert("STRIPE_UNLIMITED_YEARLY_PRICE_ID", yearly.id);
fs.writeFileSync(envPath, env);
console.log("Updated .env with Unlimited price IDs");
