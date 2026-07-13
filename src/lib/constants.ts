import { cleanEnv } from "@/lib/env";

export const PLANS = {
  FREE: {
    name: "Free",
    price: 0,
    yearlyPrice: 0,
    pagesLimit: 50,
    maxBookPages: 50,
    booksPerMonth: 1,
    audioMinutesLimit: 0,
    features: [
      "50 pages per month",
      "1 book at a time",
      "Basic genres",
      "PDF export",
      "Public books (SEO)",
      "No audiobook narration",
    ],
  },
  PRO: {
    name: "Pro",
    price: 20,
    /** Billed yearly with 2 months free (10 × monthly). */
    yearlyPrice: 200,
    priceId: process.env.STRIPE_PRO_PRICE_ID,
    yearlyPriceId: process.env.STRIPE_PRO_YEARLY_PRICE_ID,
    pagesLimit: 5000,
    maxBookPages: 500,
    booksPerMonth: 20,
    audioMinutesLimit: 60,
    features: [
      "5,000 pages per month",
      "1 hour of audiobook narration / mo",
      "Up to 500 pages per book",
      "All genres & tones",
      "PDF & EPUB export",
      "Priority generation",
      "Advanced style controls",
      "Private books",
      "Audiobook, podcast & theme music",
    ],
  },
  ENTERPRISE: {
    name: "Premium",
    price: 30,
    yearlyPrice: 300,
    priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID,
    yearlyPriceId: process.env.STRIPE_ENTERPRISE_YEARLY_PRICE_ID,
    pagesLimit: 10000,
    maxBookPages: 1000,
    booksPerMonth: -1,
    audioMinutesLimit: 180,
    features: [
      "10,000 pages per month",
      "3 hours of audiobook narration / mo",
      "Up to 1,000 pages per book",
      "2-day free trial (200 pages · 30 min audio)",
      "Unlimited books",
      "Private books",
      "All Pro features",
      "Qwen 32B model access",
      "Custom styles & voices",
      "Priority support",
    ],
  },
} as const;

/** Premium trial caps (2 days). */
export const PREMIUM_TRIAL = {
  days: 2,
  pagesLimit: 200,
  maxBookPages: 200,
  audioMinutesLimit: 30,
} as const;

export type BillingInterval = "month" | "year";

/** Yearly = 10× monthly (2 months free). */
export function planPrice(
  plan: keyof typeof PLANS,
  interval: BillingInterval = "month"
) {
  const config = PLANS[plan];
  if (interval === "year") return config.yearlyPrice;
  return config.price;
}

export function planPriceId(
  plan: "PRO" | "ENTERPRISE",
  interval: BillingInterval = "month"
) {
  // Read env at call time so updated Stripe price IDs apply after .env changes
  const clean = (v?: string) => cleanEnv(v) || undefined;

  if (plan === "ENTERPRISE") {
    if (interval === "year") {
      return (
        clean(process.env.STRIPE_ENTERPRISE_YEARLY_PRICE_ID) ||
        clean(process.env.STRIPE_ENTERPRISE_PRICE_ID)
      );
    }
    return clean(process.env.STRIPE_ENTERPRISE_PRICE_ID);
  }
  if (interval === "year") {
    return (
      clean(process.env.STRIPE_PRO_YEARLY_PRICE_ID) ||
      clean(process.env.STRIPE_PRO_PRICE_ID)
    );
  }
  return clean(process.env.STRIPE_PRO_PRICE_ID);
}

export const WORDS_PER_PAGE = 300;
export const SECTIONS_PER_CHAPTER = 4;
export const PAGES_PER_SECTION = 5;

export const BOOK_GENRES = [
  "Fiction",
  "Non-Fiction",
  "Self-Help",
  "Business",
  "Science Fiction",
  "Fantasy",
  "Romance",
  "Thriller",
  "Mystery",
  "Horror",
  "Biography",
  "Memoir",
  "History",
  "Technology",
  "Education",
  "Health & Wellness",
  "Philosophy",
  "Poetry",
  "Young Adult",
  "Children's",
] as const;

export const BOOK_TONES = [
  "Professional",
  "Conversational",
  "Academic",
  "Humorous",
  "Inspirational",
  "Dramatic",
  "Poetic",
  "Authoritative",
  "Warm",
  "Dark",
  "Satirical",
  "Neutral",
] as const;

export const BOOK_POVS = [
  { value: "first", label: "First person (I / we)" },
  { value: "second", label: "Second person (you)" },
  { value: "third", label: "Third person limited" },
  { value: "omniscient", label: "Third person omniscient" },
] as const;

export const BOOK_TENSES = [
  { value: "past", label: "Past tense" },
  { value: "present", label: "Present tense" },
] as const;

export const BOOK_LANGUAGES = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "pt", label: "Portuguese" },
  { value: "it", label: "Italian" },
  { value: "hi", label: "Hindi" },
  { value: "ja", label: "Japanese" },
  { value: "zh", label: "Chinese" },
  { value: "ar", label: "Arabic" },
] as const;

export { AI_MODELS, DEFAULT_AI_MODEL } from "@/lib/ai-models";

export const CREATIVITY_LEVELS = [
  { value: 0.3, label: "Precise", description: "Consistent, factual, low variation" },
  { value: 0.7, label: "Balanced", description: "Natural mix of structure and creativity" },
  { value: 1.0, label: "Creative", description: "More inventive language and ideas" },
  { value: 1.3, label: "Experimental", description: "Bold, unexpected, highly varied" },
] as const;

export const STYLE_PRESETS = [
  {
    id: "clean-prose",
    name: "Clean prose",
    style:
      "Clear, concise sentences. Prefer concrete language over abstraction. Avoid filler and clichés.",
  },
  {
    id: "literary",
    name: "Literary",
    style:
      "Rich imagery, layered themes, and carefully crafted rhythm. Allow longer sentences when they serve mood.",
  },
  {
    id: "business",
    name: "Business / practical",
    style:
      "Actionable, structured, and direct. Use frameworks, lists, and examples. Minimize fluff.",
  },
  {
    id: "storytelling",
    name: "Storytelling",
    style:
      "Scene-driven narrative with strong character voice, sensory detail, and natural dialogue.",
  },
  {
    id: "academic",
    name: "Academic",
    style:
      "Formal register, precise terminology, and logical argumentation. Cite concepts clearly without inventing sources.",
  },
  {
    id: "self-help",
    name: "Self-help coach",
    style:
      "Encouraging, practical, and motivational. Use short takeaways, exercises, and reflective prompts.",
  },
] as const;

export const BOOK_TEMPLATES = [
  {
    id: "novel",
    name: "Novel",
    genre: "Fiction",
    tone: "Dramatic",
    targetPages: 300,
    pov: "third",
    tense: "past",
    includeDialogue: true,
    includeExamples: false,
    description: "A full-length fiction novel with character arcs and chapter structure.",
  },
  {
    id: "business-guide",
    name: "Business guide",
    genre: "Business",
    tone: "Professional",
    targetPages: 180,
    pov: "second",
    tense: "present",
    includeDialogue: false,
    includeExamples: true,
    description: "Practical non-fiction with frameworks, case studies, and takeaways.",
  },
  {
    id: "self-help",
    name: "Self-help book",
    genre: "Self-Help",
    tone: "Inspirational",
    targetPages: 200,
    pov: "second",
    tense: "present",
    includeDialogue: false,
    includeExamples: true,
    description: "Transformational guide with exercises and reflective prompts.",
  },
  {
    id: "memoir",
    name: "Memoir",
    genre: "Memoir",
    tone: "Warm",
    targetPages: 250,
    pov: "first",
    tense: "past",
    includeDialogue: true,
    includeExamples: false,
    description: "Personal narrative with emotional honesty and scene-based chapters.",
  },
  {
    id: "tech-handbook",
    name: "Tech handbook",
    genre: "Technology",
    tone: "Authoritative",
    targetPages: 220,
    pov: "second",
    tense: "present",
    includeDialogue: false,
    includeExamples: true,
    description: "Technical non-fiction with explanations, examples, and best practices.",
  },
  {
    id: "thriller",
    name: "Thriller",
    genre: "Thriller",
    tone: "Dark",
    targetPages: 320,
    pov: "third",
    tense: "past",
    includeDialogue: true,
    includeExamples: false,
    description: "High-stakes suspense with short chapters and escalating tension.",
  },
] as const;
