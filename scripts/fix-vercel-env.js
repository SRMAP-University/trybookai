const { spawnSync } = require("child_process");
const fs = require("fs");

const envFile = ".env.production.pull";
const raw = fs.readFileSync(envFile, "utf8");

function getClean(name) {
  const line = raw.split(/\n/).find((l) => l.startsWith(name + "="));
  if (!line) return null;
  let val = line.slice(name.length + 1);
  if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
  return val.replace(/\\r\\n/g, "").replace(/\\n/g, "").replace(/[\r\n]+/g, "").trim();
}

const pairs = {
  AUTH_TRUST_HOST: "true",
  NEXTAUTH_URL: "https://www.trybookai.com",
  AUTH_URL: "https://www.trybookai.com",
  NEXT_PUBLIC_APP_URL: "https://www.trybookai.com",
  NEXTAUTH_SECRET: getClean("NEXTAUTH_SECRET"),
  DATABASE_URL: getClean("DATABASE_URL"),
  STRIPE_SECRET_KEY: getClean("STRIPE_SECRET_KEY"),
  STRIPE_PUBLISHABLE_KEY: getClean("STRIPE_PUBLISHABLE_KEY"),
  STRIPE_WEBHOOK_SECRET: getClean("STRIPE_WEBHOOK_SECRET"),
  STRIPE_PRO_PRICE_ID: getClean("STRIPE_PRO_PRICE_ID"),
  STRIPE_ENTERPRISE_PRICE_ID: getClean("STRIPE_ENTERPRISE_PRICE_ID"),
  STRIPE_PRO_YEARLY_PRICE_ID: getClean("STRIPE_PRO_YEARLY_PRICE_ID"),
  STRIPE_ENTERPRISE_YEARLY_PRICE_ID: getClean("STRIPE_ENTERPRISE_YEARLY_PRICE_ID"),
  STRIPE_PAGES_ADDON_PRICE_ID: getClean("STRIPE_PAGES_ADDON_PRICE_ID"),
  STRIPE_AUDIO_ADDON_PRICE_ID: getClean("STRIPE_AUDIO_ADDON_PRICE_ID"),
  CLOUDFLARE_ACCOUNT_ID: getClean("CLOUDFLARE_ACCOUNT_ID"),
  CLOUDFLARE_API_TOKEN: getClean("CLOUDFLARE_API_TOKEN"),
};

for (const [name, value] of Object.entries(pairs)) {
  if (!value) {
    console.log("SKIP", name);
    continue;
  }
  console.log("Updating", name, `(len=${value.length})`);
  spawnSync("vercel", ["env", "rm", name, "production", "--yes"], {
    stdio: "ignore",
    shell: true,
  });
  const r = spawnSync("vercel", ["env", "add", name, "production"], {
    input: value, // no trailing newline
    encoding: "utf8",
    shell: true,
  });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    process.exitCode = 1;
  } else {
    console.log("  ok");
  }
}
