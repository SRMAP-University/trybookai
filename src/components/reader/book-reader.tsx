"use client";

import Link from "next/link";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight, List, Minus, Plus, Type, X } from "lucide-react";
import { readingSerif, serifDisplay } from "@/components/marketing/home/fonts";
import { holdTawkHidden } from "@/components/tawk-visibility";
import { chapterBlocks, chapterHeaderHtml, imagesIn, type ReaderChapter } from "@/lib/reader/blocks";
import { compareAnchors, paginateBook, type ReaderPage } from "@/lib/reader/paginate";
import { cn } from "@/lib/utils";

export type ReaderBook = {
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  coverImage: string | null;
  language: string | null;
  narrative: boolean;
  illustrated: boolean;
  chapters: ReaderChapter[];
};

type Slot =
  | { kind: "cover" }
  | { kind: "title" }
  | { kind: "page"; page: ReaderPage; index: number }
  | { kind: "end" }
  | { kind: "blank" }
  | { kind: "back" };

type Theme = "paper" | "sepia" | "night";
type Settings = { size: number; theme: Theme };
type Turn = { dir: 1 | -1; base: number; target: number };

const FONT_STEPS = [15, 16.5, 18, 19.5, 21];
const DEFAULT_SETTINGS: Settings = { size: 2, theme: "paper" };
const SETTINGS_KEY = "bookai-reader-settings";
const THEMES: { id: Theme; label: string; swatch: string; ink: string }[] = [
  { id: "paper", label: "Paper", swatch: "#fbf8f1", ink: "#23262d" },
  { id: "sepia", label: "Sepia", swatch: "#f3e6cf", ink: "#3b2f22" },
  { id: "night", label: "Night", swatch: "#1d1f24", ink: "#d8d4cc" },
];

function subscribeResize(cb: () => void) {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
}
function subscribeMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** Page size, margins and type size for the window: two pages side by side on wide screens. */
function layoutFor(w: number, h: number, size: number) {
  if (!w || !h) return null;
  const phone = w < 640;
  // Short screens (landscape phones, small windows): the bars float over the page instead of taking room.
  const compact = h < 600;
  const top = compact ? 0 : 52;
  const bottom = compact ? 0 : 60;
  const availH = h - top - bottom - (phone || compact ? 12 : 36);
  const availW = w - (phone ? 16 : 64);
  const spread = w >= 900 && availH >= 400;
  let pw: number;
  let ph: number;
  if (spread) {
    ph = Math.min(availH, 980);
    pw = Math.round(ph * 0.68);
    if (pw * 2 > availW) {
      pw = Math.floor(availW / 2);
      ph = Math.min(availH, Math.round(pw / 0.68));
    }
  } else {
    pw = Math.min(availW, 620);
    ph = phone ? availH : Math.min(availH, Math.round(pw / 0.66));
  }
  const scale = Math.min(1.15, Math.max(0.85, pw / 460));
  const fs = Math.round(FONT_STEPS[size] * scale * 10) / 10;
  const inner = spread ? Math.round(pw * 0.11) : Math.max(22, Math.round(pw * 0.08));
  const outer = spread ? Math.round(pw * 0.09) : inner;
  const pt = Math.max(40, Math.round(ph * 0.08));
  const pb = Math.max(46, Math.round(ph * 0.085));
  return {
    spread,
    top,
    bottom,
    pw,
    ph,
    /** Base unit for cover and title type, so short pages don't overflow */
    unit: Math.round(Math.min(pw, ph * 0.68)),
    fs,
    inner,
    outer,
    pt,
    pb,
    cw: pw - inner - outer,
    ch: ph - pt - pb,
    key: `${spread}|${pw}|${ph}|${fs}`,
  };
}

/** Page edges seen from the side: thicker on whichever side holds more of the book. */
function stackShadow(fraction: number, side: "l" | "r") {
  const layers = Math.max(1, Math.round(1 + fraction * 5));
  const dir = side === "l" ? -1 : 1;
  const parts: string[] = [];
  for (let i = 1; i <= layers; i += 1) {
    parts.push(`${dir * i}px ${i * 0.6}px 0 ${i % 2 ? "var(--bkr-edge)" : "var(--bkr-page)"}`);
  }
  parts.push("0 34px 60px -24px rgba(0,0,0,.85)");
  return parts.join(", ");
}

function positionKey(bookId: string) {
  return `bookai-reader-pos:${bookId}`;
}

export function BookReader({
  book,
  exitHref,
  fresh = false,
  visitor = false,
}: {
  book: ReaderBook;
  exitHref: string;
  /** Just finished writing: open on the closed book, ready to be opened */
  fresh?: boolean;
  /** A reader of someone else's public book: the last page invites them to write their own */
  visitor?: boolean;
}) {
  const size = useSyncExternalStore(
    subscribeResize,
    () => `${window.innerWidth}x${window.innerHeight}`,
    () => "0x0"
  );
  const reduced = useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false
  );
  const [vw, vh] = size.split("x").map(Number);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const layout = useMemo(() => layoutFor(vw, vh, settings.size), [vw, vh, settings.size]);

  const [pages, setPages] = useState<ReaderPage[] | null>(null);
  const [vi, setVi] = useState(0);
  const [turn, setTurn] = useState<Turn | null>(null);
  const [panel, setPanel] = useState<null | "toc" | "type">(null);
  const [chrome, setChrome] = useState(true);
  const [jumpKey, setJumpKey] = useState(0);
  const [entered, setEntered] = useState(false);

  const measureRef = useRef<HTMLDivElement>(null);
  const leafRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<[number, number, number] | null>(null);
  const restoredRef = useRef(false);
  const goRef = useRef<(dir: 1 | -1) => void>(() => undefined);

  const chapters = useMemo(
    () =>
      book.chapters.map((chapter) => ({
        header: chapterHeaderHtml(chapter),
        blocks: chapterBlocks(chapter, book.narrative),
      })),
    [book.chapters, book.narrative]
  );

  // Saved reading settings (a per-viewer convenience).
  useEffect(() => {
    let saved: Settings | null = null;
    try {
      const raw = window.localStorage.getItem(SETTINGS_KEY);
      if (raw) saved = { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
    } catch {
      /* storage unavailable */
    }
    if (saved) void Promise.resolve(saved).then(setSettings);
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* storage unavailable */
    }
  }, [settings]);

  useEffect(() => holdTawkHidden(), []);

  // Lay the book out into pages whenever the page size or type size changes.
  useEffect(() => {
    if (!layout) return;
    const job = { cancelled: false };
    const timer = setTimeout(async () => {
      await document.fonts?.ready;
      const box = measureRef.current;
      if (job.cancelled || !box) return;
      const laid = await paginateBook(chapters, box, layout.ch, job);
      if (job.cancelled || !laid) return;

      // Stay on the same text after a re-layout; first time, resume where the reader left off.
      let anchor = anchorRef.current;
      if (!anchor && !restoredRef.current && !fresh) {
        try {
          const raw = window.localStorage.getItem(positionKey(book.id));
          if (raw) anchor = JSON.parse(raw) as [number, number, number];
        } catch {
          /* storage unavailable */
        }
      }
      restoredRef.current = true;
      setPages(laid);
      if (anchor) {
        let index = 0;
        laid.forEach((page, i) => {
          if (compareAnchors(page.anchor, anchor!) <= 0) index = i;
        });
        const target = index + 2;
        setVi(layout.spread ? (target % 2 === 0 ? target - 1 : target) : target);
      }
    }, 120);
    return () => {
      job.cancelled = true;
      clearTimeout(timer);
    };
  }, [layout, chapters, book.id, fresh]);

  const slots = useMemo<Slot[]>(() => {
    const list: Slot[] = [{ kind: "cover" }, { kind: "title" }];
    if (!pages) return list;
    pages.forEach((page, index) => list.push({ kind: "page", page, index }));
    list.push({ kind: "end" });
    // The back cover lands alone on the left, as when a book is closed from the back.
    if (list.length % 2 === 0) list.push({ kind: "blank" });
    list.push({ kind: "back" });
    return list;
  }, [pages]);

  const spread = layout?.spread ?? false;
  const maxK = slots.length / 2;
  const k = Math.floor((vi + 1) / 2);
  const ready = pages != null;
  const canForward = ready && (spread ? k < maxK : vi < slots.length - 1);
  const canBack = spread ? k > 0 : vi > 0;

  function viForSpread(target: number) {
    return target <= 0 ? 0 : 2 * target - 1;
  }

  function go(dir: 1 | -1) {
    if (turn || !layout) return;
    if ((dir > 0 && !canForward) || (dir < 0 && !canBack)) return;
    const target = spread ? viForSpread(k + dir) : vi + dir;
    if (reduced) {
      setVi(target);
      return;
    }
    setTurn({ dir, base: vi, target });
  }

  function jumpTo(target: number) {
    if (turn) return;
    const clamped = Math.max(0, Math.min(slots.length - 1, target));
    setVi(spread ? (clamped === 0 ? 0 : clamped % 2 === 0 ? clamped - 1 : clamped) : clamped);
    setJumpKey((n) => n + 1);
    setPanel(null);
  }

  useEffect(() => {
    goRef.current = go;
  });

  // The turning page: rotate it over the spine, darkening as it lifts.
  useLayoutEffect(() => {
    if (!turn) return;
    const leaf = leafRef.current;
    if (!leaf) return;
    const ms = spread ? 900 : 650;
    const ease = "cubic-bezier(.42,.06,.24,1)";
    const [from, to] = turn.dir > 0 ? [0, -180] : [-180, 0];
    const anims: Animation[] = [
      leaf.animate([{ transform: `rotateY(${from}deg)` }, { transform: `rotateY(${to}deg)` }], {
        duration: ms,
        easing: ease,
        fill: "forwards",
      }),
    ];
    const front = leaf.querySelector<HTMLElement>(".bkr-face.front > .bkr-shade");
    const back = leaf.querySelector<HTMLElement>(".bkr-face.back > .bkr-shade");
    const lifting = turn.dir > 0 ? front : back;
    const landing = turn.dir > 0 ? back : front;
    if (lifting) {
      anims.push(lifting.animate([{ opacity: 0 }, { opacity: 0.6 }], { duration: ms / 2, easing: "ease-in", fill: "forwards" }));
    }
    if (landing) {
      anims.push(
        landing.animate(
          [
            { opacity: 0.6, offset: 0 },
            { opacity: 0.6, offset: 0.5 },
            { opacity: 0, offset: 1 },
          ],
          { duration: ms, easing: "ease-out", fill: "forwards" }
        )
      );
    }
    let alive = true;
    Promise.all(anims.map((a) => a.finished))
      .then(() => {
        if (!alive) return;
        setVi(turn.target);
        setTurn(null);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      anims.forEach((a) => a.cancel());
    };
  }, [turn, spread]);

  // Remember the page, and keep the place when the layout changes.
  const currentPage = useMemo(() => {
    const candidates = spread ? [2 * k - 1, 2 * k] : [vi];
    for (const i of candidates) {
      const slot = slots[i];
      if (slot?.kind === "page") return slot;
    }
    return null;
  }, [slots, spread, k, vi]);
  useEffect(() => {
    if (!currentPage) return;
    anchorRef.current = currentPage.page.anchor;
    try {
      window.localStorage.setItem(positionKey(book.id), JSON.stringify(currentPage.page.anchor));
    } catch {
      /* storage unavailable */
    }
  }, [currentPage, book.id]);

  // Load the next pages' pictures before they're turned to.
  useEffect(() => {
    for (let i = vi - 2; i <= vi + 5; i += 1) {
      const slot = slots[i];
      if (slot?.kind !== "page") continue;
      for (const src of imagesIn(slot.page.html)) {
        const img = new Image();
        img.decoding = "async";
        img.src = src;
      }
    }
  }, [vi, slots]);

  // Keyboard: arrows, page keys and space turn pages.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof Element && e.target.closest("input, textarea, select")) return;
      // Space on a focused button presses the button; don't also turn the page.
      if (e.key === " " && e.target instanceof Element && e.target.closest("button, a")) return;
      if (e.key === "Escape") setPanel(null);
      if (["ArrowRight", "PageDown", " "].includes(e.key)) {
        e.preventDefault();
        goRef.current(1);
      }
      if (["ArrowLeft", "PageUp"].includes(e.key)) {
        e.preventDefault();
        goRef.current(-1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Controls fade away while reading and come back on any movement.
  const reading = vi > 0 && panel == null;
  useEffect(() => {
    if (!reading) return;
    let timer = setTimeout(() => setChrome(false), 2800);
    const wake = () => {
      setChrome(true);
      clearTimeout(timer);
      timer = setTimeout(() => setChrome(false), 2800);
    };
    // Taps count too, so phones can bring the controls back.
    window.addEventListener("pointermove", wake);
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
    };
  }, [reading]);
  const showChrome = chrome || !reading;

  useEffect(() => {
    const timer = setTimeout(() => setEntered(true), 950);
    return () => clearTimeout(timer);
  }, []);

  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const chapterStarts = useChapterStarts(pages);

  function onStageClick(e: ReactMouseEvent) {
    if (e.target instanceof Element && e.target.closest("a, button, input")) return;
    if (panel) {
      setPanel(null);
      return;
    }
    const rect = bookRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (spread && k === 0) return go(1);
    if (spread && k === maxK) return go(-1);
    const x = (e.clientX - rect.left) / rect.width;
    if (spread) go(x >= 0.5 ? 1 : -1);
    else go(x > 0.3 ? 1 : -1);
  }

  if (!layout) {
    return <div className="bkr" />;
  }

  const style = {
    "--bkr-pw": `${layout.pw}px`,
    "--bkr-u": `${layout.unit}px`,
    "--bkr-ph": `${layout.ph}px`,
    "--bkr-fs": `${layout.fs}px`,
    "--bkr-cw": `${layout.cw}px`,
    "--bkr-ch": `${layout.ch}px`,
    "--bkr-pt": `${layout.pt}px`,
    "--bkr-pb": `${layout.pb}px`,
    "--bkr-in": `${layout.inner}px`,
    "--bkr-out": `${layout.outer}px`,
  } as CSSProperties;

  const contentPages = pages?.length ?? 0;
  const pageNumber = currentPage ? currentPage.index + 1 : 0;
  const chapterIndex = currentPage?.page.chapter ?? -1;
  const chapterTitle = chapterIndex >= 0 ? book.chapters[chapterIndex]?.title : null;

  function renderSlot(index: number, side: "l" | "r" | "solo"): ReactNode {
    const slot = slots[index];
    if (!slot) return null;
    switch (slot.kind) {
      case "cover":
        return (
          <div className={cn("bkr-cover front", !book.coverImage && "plain")}>
            {book.coverImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={book.coverImage} alt="" />
            ) : (
              <div className="frame" />
            )}
            {book.coverImage && <div className="veil" />}
            <div className="ct">
              <h1>{book.title}</h1>
              {book.author && <p>{book.author}</p>}
            </div>
            {!book.coverImage && (
              <p className="orn" aria-hidden>
                &#10022;
              </p>
            )}
          </div>
        );
      case "back":
        return (
          <div className="bkr-cover backside">
            {book.description && <p className="blurb">{clip(book.description, 520)}</p>}
            <div className="mark">
              <span>{book.title}</span>
              <span>BookAI</span>
            </div>
          </div>
        );
      case "title":
        return (
          <div className={cn("bkr-page", side)}>
            <div className="bkr-own">
              <h2 className="t">{book.title}</h2>
              {book.author && <p className="a">{book.author}</p>}
              <p className="o" aria-hidden>
                &#10022;
              </p>
              {book.illustrated && <p className="s">An illustrated edition</p>}
              <p className="imprint">BookAI</p>
            </div>
          </div>
        );
      case "blank":
        return <div className={cn("bkr-page", side)} />;
      case "end":
        return (
          <div className={cn("bkr-page", side)}>
            <div className="bkr-own">
              <p className="o" aria-hidden>
                &#10022; &#10022; &#10022;
              </p>
              <h2 className="t">The End</h2>
              <div className="mt-8 flex flex-wrap justify-center gap-2 font-sans">
                <button
                  type="button"
                  onClick={() => jumpTo(2)}
                  className="rounded-full border border-current/20 px-4 py-2 text-[13px] font-medium opacity-80 hover:opacity-100"
                >
                  Read again
                </button>
                <Link
                  href={exitHref}
                  className="rounded-full bg-[#635bff] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#5851e5]"
                >
                  Close the book
                </Link>
              </div>
              {visitor && (
                <Link
                  href="/register?callbackUrl=/dashboard/books/new"
                  className="mt-6 font-sans text-[13px] font-medium text-[var(--bkr-accent)] underline-offset-4 hover:underline"
                >
                  Write your own book with BookAI
                </Link>
              )}
            </div>
          </div>
        );
      case "page": {
        const page = slot.page;
        const chapter = book.chapters[page.chapter];
        const head = page.start ? null : side === "l" ? book.title : chapter?.title;
        return (
          <div className={cn("bkr-page", side)}>
            {head && <div className="bkr-head">{head}</div>}
            <div className="bkr-body" dangerouslySetInnerHTML={{ __html: page.html }} />
            <div className="bkr-folio">{slot.index + 1}</div>
          </div>
        );
      }
    }
  }

  // What's on the table: static pages, plus the leaf while a page turns.
  let leftIndex = -1;
  let rightIndex = -1;
  let leafFront = -1;
  let leafBack = -1;
  let offsetK = k;
  if (spread) {
    if (turn) {
      const bk = Math.floor((turn.base + 1) / 2);
      offsetK = bk + turn.dir;
      if (turn.dir > 0) {
        leftIndex = 2 * bk - 1;
        rightIndex = 2 * bk + 2;
        leafFront = 2 * bk;
        leafBack = 2 * bk + 1;
      } else {
        leftIndex = 2 * bk - 3;
        rightIndex = 2 * bk;
        leafFront = 2 * bk - 2;
        leafBack = 2 * bk - 1;
      }
    } else {
      leftIndex = 2 * k - 1;
      rightIndex = 2 * k;
    }
  } else if (turn) {
    rightIndex = turn.dir > 0 ? turn.base + 1 : turn.base;
    leafFront = turn.dir > 0 ? turn.base : turn.base - 1;
  } else {
    rightIndex = vi;
  }
  const hasLeft = spread && leftIndex >= 1 && leftIndex < slots.length;
  const hasRight = rightIndex >= 0 && rightIndex < slots.length;
  const progress = slots.length > 1 ? Math.min(1, (spread ? 2 * offsetK : vi) / (slots.length - 1)) : 0;
  const closedFront = spread && offsetK === 0;
  const closedBack = spread && offsetK === maxK;

  return (
    <div
      className={cn("bkr", readingSerif.className, serifDisplay.variable)}
      data-theme={settings.theme}
      style={style}
      lang={book.language ?? undefined}
    >
      {/* Hidden twin of a page body, used to measure text while laying out pages. */}
      <div className="bkr-measure" aria-hidden>
        <div ref={measureRef} className="bkr-body" style={{ width: layout.cw }} />
      </div>

      {/* Top bar */}
      <header
        className={cn(
          "absolute inset-x-0 top-0 z-20 flex h-[52px] items-center gap-2 px-3 font-sans transition-all duration-300 sm:px-4",
          showChrome ? "opacity-100" : "pointer-events-none -translate-y-2 opacity-0"
        )}
      >
        <Link
          href={exitHref}
          aria-label="Close the book"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white/80 hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft className="h-[18px] w-[18px]" />
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-[13px] font-semibold text-white/90">{book.title}</p>
          {chapterTitle && (
            <p className="truncate text-[11px] text-white/55">
              Chapter {book.chapters[chapterIndex]?.number}: {chapterTitle}
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label="Contents"
          onClick={() => setPanel(panel === "toc" ? null : "toc")}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white/80 hover:bg-white/10 hover:text-white"
        >
          <List className="h-[18px] w-[18px]" />
        </button>
        <button
          type="button"
          aria-label="Text and theme"
          onClick={() => setPanel(panel === "type" ? null : "type")}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white/80 hover:bg-white/10 hover:text-white"
        >
          <Type className="h-[18px] w-[18px]" />
        </button>
      </header>

      {/* The book */}
      <div
        className="bkr-stage"
        style={{ top: layout.top, bottom: layout.bottom }}
        onClick={onStageClick}
        onTouchStart={(e) => {
          touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }}
        onTouchEnd={(e) => {
          const start = touchRef.current;
          touchRef.current = null;
          if (!start) return;
          const dx = e.changedTouches[0].clientX - start.x;
          const dy = e.changedTouches[0].clientY - start.y;
          if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
            e.preventDefault();
            go(dx < 0 ? 1 : -1);
          }
        }}
      >
        <div
          key={jumpKey}
          ref={bookRef}
          className={cn(
            "bkr-book",
            !spread && "single",
            closedFront && "closed-front",
            closedBack && "closed-back",
            !entered && vi === 0 && !turn && "enter",
            jumpKey > 0 && "jump"
          )}
        >
          {spread && !closedFront && (
            <div className="bkr-base l" style={{ boxShadow: stackShadow(progress, "l") }} />
          )}
          {spread && !closedBack && (
            <div className="bkr-base r" style={{ boxShadow: stackShadow(1 - progress, "r") }} />
          )}
          {hasLeft && <div className="bkr-slot l">{renderSlot(leftIndex, "l")}</div>}
          {hasRight && (
            <div className="bkr-slot r">{renderSlot(rightIndex, spread ? "r" : "solo")}</div>
          )}
          {turn && leafFront >= 0 && (
            <div
              ref={leafRef}
              className="bkr-leaf"
              style={{ transform: turn.dir > 0 ? "rotateY(0deg)" : "rotateY(-180deg)" }}
            >
              <div className="bkr-face front">
                {renderSlot(leafFront, spread ? "r" : "solo")}
                <div className="bkr-shade" />
              </div>
              {spread && leafBack >= 0 && (
                <div className="bkr-face back">
                  {renderSlot(leafBack, "l")}
                  <div className="bkr-shade" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <footer
        className={cn(
          "absolute inset-x-0 bottom-0 z-20 flex h-[60px] items-center justify-center gap-3 px-4 font-sans transition-all duration-300",
          showChrome ? "opacity-100" : "pointer-events-none translate-y-2 opacity-0"
        )}
      >
        {vi === 0 ? (
          <button
            type="button"
            onClick={() => go(1)}
            disabled={!ready}
            className="bkr-pulse inline-flex h-10 items-center gap-2 rounded-full bg-[#635bff] px-5 text-[14px] font-medium text-white hover:bg-[#5851e5] disabled:animate-none disabled:opacity-70"
          >
            <BookOpen className="h-4 w-4" />
            {ready ? "Open the book" : "Setting the pages…"}
          </button>
        ) : (
          <>
            <button
              type="button"
              aria-label="Previous page"
              onClick={() => go(-1)}
              disabled={!canBack}
              className="hidden h-9 w-9 shrink-0 place-items-center rounded-full text-white/80 hover:bg-white/10 disabled:opacity-30 sm:grid"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="flex w-full max-w-[520px] items-center gap-3">
              <input
                type="range"
                aria-label="Page"
                min={1}
                max={Math.max(1, contentPages)}
                value={Math.max(1, pageNumber)}
                onChange={(e) => jumpTo(Number(e.target.value) + 1)}
                className="h-1 flex-1 cursor-pointer accent-[#8f88ff]"
              />
              <span className="shrink-0 text-[12px] tabular-nums text-white/60">
                {pageNumber > 0 ? `${pageNumber} of ${contentPages}` : vi >= slots.length - 2 ? "The end" : ""}
              </span>
            </div>
            <button
              type="button"
              aria-label="Next page"
              onClick={() => go(1)}
              disabled={!canForward}
              className="hidden h-9 w-9 shrink-0 place-items-center rounded-full text-white/80 hover:bg-white/10 disabled:opacity-30 sm:grid"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </footer>

      {/* Contents */}
      {panel === "toc" && (
        <aside className="absolute inset-y-0 right-0 z-30 flex w-[340px] max-w-[88vw] flex-col bg-[#11151d]/95 font-sans shadow-2xl backdrop-blur">
          <div className="flex h-[52px] items-center justify-between border-b border-white/10 px-4">
            <p className="text-[13px] font-semibold text-white/90">Contents</p>
            <button
              type="button"
              aria-label="Close contents"
              onClick={() => setPanel(null)}
              className="grid h-8 w-8 place-items-center rounded-full text-white/70 hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <ol className="flex-1 overflow-y-auto p-2">
            {book.chapters.map((chapter, i) => {
              const startPage = chapterStarts[i];
              return (
                <li key={chapter.number}>
                  <button
                    type="button"
                    disabled={startPage == null}
                    onClick={() => startPage != null && jumpTo(startPage + 2)}
                    className={cn(
                      "flex w-full items-baseline gap-3 rounded-lg px-3 py-2.5 text-left text-[13.5px] hover:bg-white/5 disabled:opacity-40",
                      i === chapterIndex ? "text-[#b7b2ff]" : "text-white/80"
                    )}
                  >
                    <span className="w-5 shrink-0 text-[11px] tabular-nums text-white/40">{chapter.number}</span>
                    <span className="min-w-0 flex-1">{chapter.title}</span>
                    {startPage != null && (
                      <span className="shrink-0 text-[11px] tabular-nums text-white/40">{startPage + 1}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>
      )}

      {/* Text size and theme */}
      {panel === "type" && (
        <div className="absolute right-3 top-[56px] z-30 w-[260px] rounded-2xl border border-white/10 bg-[#11151d]/95 p-4 font-sans shadow-2xl backdrop-blur">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">Text size</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <button
              type="button"
              aria-label="Smaller text"
              disabled={settings.size === 0}
              onClick={() => setSettings((s) => ({ ...s, size: Math.max(0, s.size - 1) }))}
              className="grid h-9 w-9 place-items-center rounded-full border border-white/15 text-white/80 hover:bg-white/10 disabled:opacity-30"
            >
              <Minus className="h-4 w-4" />
            </button>
            <div className="flex gap-1.5" aria-hidden>
              {FONT_STEPS.map((_, i) => (
                <span
                  key={i}
                  className={cn("h-1.5 w-5 rounded-full", i <= settings.size ? "bg-[#8f88ff]" : "bg-white/15")}
                />
              ))}
            </div>
            <button
              type="button"
              aria-label="Larger text"
              disabled={settings.size === FONT_STEPS.length - 1}
              onClick={() => setSettings((s) => ({ ...s, size: Math.min(FONT_STEPS.length - 1, s.size + 1) }))}
              className="grid h-9 w-9 place-items-center rounded-full border border-white/15 text-white/80 hover:bg-white/10 disabled:opacity-30"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">Page</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSettings((s) => ({ ...s, theme: t.id }))}
                className={cn(
                  "rounded-xl border p-2 text-center text-[12px] transition-colors",
                  settings.theme === t.id ? "border-[#8f88ff] text-white" : "border-white/10 text-white/70 hover:border-white/30"
                )}
              >
                <span
                  className="mx-auto mb-1.5 grid h-9 w-full place-items-center rounded-lg font-serif text-[15px]"
                  style={{ background: t.swatch, color: t.ink }}
                >
                  Aa
                </span>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function clip(text: string, max: number) {
  const value = text.replace(/\s+/g, " ").trim();
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

/** Content page index where each chapter starts. */
function useChapterStarts(pages: ReaderPage[] | null): (number | undefined)[] {
  return useMemo(() => {
    const starts: (number | undefined)[] = [];
    pages?.forEach((page, i) => {
      if (page.start && starts[page.chapter] == null) starts[page.chapter] = i;
    });
    return starts;
  }, [pages]);
}
