export { seedBibleFromOutline } from "@/lib/book-context/seed";
export {
  assembleSectionContext,
  type AssembledSection,
} from "@/lib/book-context/assembler";
export {
  applySectionUpdate,
  extractSectionUpdate,
  refreshChapterCanon,
} from "@/lib/book-context/extract";
export { hasIncompleteSections } from "@/lib/book-context/incomplete";
