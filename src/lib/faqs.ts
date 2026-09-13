export type SiteFaq = {
  question: string;
  answer: string;
};

export const SITE_FAQS: SiteFaq[] = [
  {
    question: "What is BookAI?",
    answer:
      "BookAI is an AI book generator that turns a premise into a full manuscript. You can outline chapters, write long-form prose, generate a cover, narrate an audiobook, and export PDF or EPUB from one workspace.",
  },
  {
    question: "How does AI book generation work?",
    answer:
      "You describe the book you want. BookAI builds a chapter outline, then writes section by section so the story stays consistent. You can edit any chapter, regenerate cover art, and keep generating until the manuscript is finished.",
  },
  {
    question: "Can I write a novel or nonfiction book with AI?",
    answer:
      "Yes. BookAI supports fiction and nonfiction: novels, memoirs, business books, guides, and educational titles. You set genre, tone, audience, and custom instructions so the draft matches your voice.",
  },
  {
    question: "What file formats can I export?",
    answer:
      "Finished books export as publication-ready PDF and EPUB. You can also keep writing in the browser editor and share a public book page with a unique URL.",
  },
  {
    question: "Does BookAI create audiobooks?",
    answer:
      "Yes. After you have manuscript text, the audio studio can narrate chapters with AI voices. Tracks stay attached to the book so readers can listen on the public page.",
  },
  {
    question: "Is there a free plan?",
    answer:
      "Yes. BookAI has a free plan with a monthly page allowance so you can outline and generate a book before upgrading. Paid plans add more pages, audiobook minutes, and higher limits.",
  },
  {
    question: "Who owns the books I generate?",
    answer:
      "You keep the rights to the manuscripts you create and export, subject to the Terms of Service. Treat AI as a drafting assistant, then edit, fact-check, and publish under your own name.",
  },
  {
    question: "Are books on BookAI public?",
    answer:
      "New books are public by default so they can be read and indexed. Paid plans can make a book private. Public books appear in the library at /books with a stable canonical URL.",
  },
];
