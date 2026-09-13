import type { Metadata } from "next";
import { getAppUrl } from "@/lib/book-public";
import { SITE_FAQS } from "@/lib/faqs";

export const SITE_NAME = "BookAI";
export const SITE_TAGLINE = "AI Book Generator";

export const DEFAULT_DESCRIPTION =
  "BookAI is an AI book writer for full-length novels and nonfiction. Outline chapters, generate a manuscript, design a cover, narrate an audiobook, and export PDF or EPUB.";

export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

/** Default social share image served by `src/app/opengraph-image.tsx`. */
export function getDefaultOgImage(): string {
  return `${getAppUrl()}/opengraph-image`;
}

export const SITE_KEYWORDS = [
  "AI book generator",
  "AI book writer",
  "write a book with AI",
  "AI novel generator",
  "AI ebook writer",
  "generate a book with AI",
  "AI manuscript",
  "AI audiobook generator",
  "AI author tool",
  "BookAI",
];

type PageMetaInput = {
  title: string;
  description: string;
  path?: string;
  image?: string;
  imageWidth?: number;
  imageHeight?: number;
  type?: "website" | "article";
  noIndex?: boolean;
  /** Use when the title already includes the brand and must not use the layout template. */
  absolute?: boolean;
  keywords?: string[];
};

export function brandedTitle(title: string): string {
  return title.includes(SITE_NAME) ? title : `${title} — ${SITE_NAME}`;
}

export function buildPageMetadata({
  title,
  description,
  path = "",
  image,
  imageWidth,
  imageHeight,
  type = "website",
  noIndex = false,
  absolute,
  keywords,
}: PageMetaInput): Metadata {
  const base = getAppUrl();
  const url = path ? `${base}${path.startsWith("/") ? path : `/${path}`}` : base;
  const ogImage = image ?? getDefaultOgImage();
  const displayTitle = brandedTitle(title);
  const useAbsolute = absolute ?? title.includes(SITE_NAME);

  return {
    title: useAbsolute ? { absolute: displayTitle } : title,
    description,
    keywords: keywords ?? SITE_KEYWORDS,
    alternates: { canonical: url },
    openGraph: {
      title: displayTitle,
      description,
      url,
      siteName: SITE_NAME,
      type,
      locale: "en_US",
      images: [
        {
          url: ogImage,
          width: imageWidth ?? OG_IMAGE_WIDTH,
          height: imageHeight ?? OG_IMAGE_HEIGHT,
          alt: displayTitle,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: displayTitle,
      description,
      images: [ogImage],
    },
    robots: noIndex
      ? { index: false, follow: false }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            "max-image-preview": "large",
            "max-snippet": -1,
            "max-video-preview": -1,
          },
        },
  };
}

export function organizationJsonLd() {
  const base = getAppUrl();
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: base,
    logo: `${base}/icon-512.png`,
    description: DEFAULT_DESCRIPTION,
    sameAs: [base, `${base}/blog`, `${base}/books`],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      url: `${base}/about`,
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
    inLanguage: "en-US",
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: base,
    },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${base}/books?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
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
    applicationSubCategory: "AI writing software",
    operatingSystem: "Web, Android",
    url: base,
    image: `${base}/opengraph-image`,
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
      "Cover art generation",
      "PDF and EPUB export",
      "Audiobook narration",
      "Public book pages",
    ],
  };
}

export function faqPageJsonLd(faqs = SITE_FAQS) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}

export function breadcrumbJsonLd(
  items: Array<{ name: string; path: string }>
) {
  const base = getAppUrl();
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${base}${item.path.startsWith("/") ? item.path : `/${item.path}`}`,
    })),
  };
}

export function bookJsonLd(input: {
  title: string;
  description?: string | null;
  genre?: string | null;
  language?: string | null;
  url: string;
  slug: string;
  coverUrl?: string;
  pageCount?: number | null;
  author: string;
  authorUrl?: string | null;
  publisher?: string | null;
  datePublished: string;
  dateModified: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Book",
    name: input.title,
    description: input.description || undefined,
    genre: input.genre || undefined,
    inLanguage: input.language || "en",
    url: input.url,
    identifier: input.slug,
    image: input.coverUrl,
    numberOfPages: input.pageCount || undefined,
    author: {
      "@type": "Person",
      name: input.author,
      url: input.authorUrl || undefined,
    },
    publisher: {
      "@type": "Organization",
      name: input.publisher || SITE_NAME,
    },
    datePublished: input.datePublished,
    dateModified: input.dateModified,
  };
}

export function itemListJsonLd(input: {
  name: string;
  description: string;
  url: string;
  items: Array<{ name: string; url: string }>;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: input.name,
    description: input.description,
    url: input.url,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: input.items.length,
      itemListElement: input.items.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
        url: item.url,
      })),
    },
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
  image?: string;
}) {
  const base = getAppUrl();
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: input.title,
    description: input.description,
    url: input.url,
    mainEntityOfPage: input.url,
    image: input.image ?? `${base}/opengraph-image`,
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
        url: `${base}/icon-512.png`,
      },
    },
    keywords: input.tags?.join(", "),
  };
}
