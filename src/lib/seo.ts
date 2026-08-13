import type { Metadata } from "next";
import { getAppUrl } from "@/lib/book-public";

export const SITE_NAME = "BookAI";
export const SITE_TAGLINE = "AI Book Generator";

export const DEFAULT_DESCRIPTION =
  "Generate full-length books up to 1,000 pages with AI. Outline, write, edit, and export publication-ready manuscripts, audiobooks, and branded content.";

/** Default social share image (absolute URL). */
export function getDefaultOgImage(): string {
  return `${getAppUrl()}/icon-192.png`;
}

export const SITE_KEYWORDS = [
  "AI book generator",
  "AI writing",
  "write a book with AI",
  "AI manuscript",
  "AI audiobook",
  "generate ebook",
  "AI author tool",
  "BookAI",
];

type PageMetaInput = {
  title: string;
  description: string;
  path?: string;
  image?: string;
  type?: "website" | "article";
  noIndex?: boolean;
};

export function buildPageMetadata({
  title,
  description,
  path = "",
  image,
  type = "website",
  noIndex = false,
}: PageMetaInput): Metadata {
  const base = getAppUrl();
  const url = path ? `${base}${path.startsWith("/") ? path : `/${path}`}` : base;
  const ogImage = image ?? getDefaultOgImage();

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      type,
      locale: "en_US",
      images: [{ url: ogImage, width: 192, height: 192, alt: SITE_NAME }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
    robots: noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true },
  };
}

export function organizationJsonLd() {
  const base = getAppUrl();
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: base,
    logo: `${base}/icon-192.png`,
    sameAs: [base],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      url: base,
    },
  };
}

export function websiteJsonLd() {
  const base = getAppUrl();
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: base,
    description: DEFAULT_DESCRIPTION,
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: base,
    },
  };
}

export function softwareApplicationJsonLd() {
  const base = getAppUrl();
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Web, Android",
    url: base,
    description: DEFAULT_DESCRIPTION,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      description: "Free plan available",
    },
    featureList: [
      "AI manuscript generation",
      "Chapter outlining",
      "PDF and EPUB export",
      "Audiobook narration",
      "Public book pages",
    ],
  };
}

export function blogPostingJsonLd(input: {
  title: string;
  description: string;
  url: string;
  author: string;
  publishedAt: string;
  updatedAt?: string;
  tags?: string[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: input.title,
    description: input.description,
    url: input.url,
    mainEntityOfPage: input.url,
    datePublished: input.publishedAt,
    dateModified: input.updatedAt ?? input.publishedAt,
    author: {
      "@type": "Person",
      name: input.author,
    },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      logo: {
        "@type": "ImageObject",
        url: `${getAppUrl()}/icon-192.png`,
      },
    },
    keywords: input.tags?.join(", "),
  };
}
