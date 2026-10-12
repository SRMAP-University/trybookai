import {
  MUSIC_LEVEL_GAIN,
  moodAt,
  type MusicScore,
  type ScoreMood,
} from "@/lib/audio-generator/score-types";

/** Crossfade between scene moods, in seconds. */
const CROSSFADE_S = 2.5;
/** Fade when narration pauses or stops. */
const STOP_FADE_S = 0.6;
/** Switch slightly ahead of a scene so the new mood swells in as it starts. */
const LEAD_MS = 800;

type CueVoice = { el: HTMLAudioElement; gain: GainNode; stopTimer?: ReturnType<typeof setTimeout> };

/**
 * Plays a book's background-music score under the narration <audio> element,
 * following its position. Volume runs through Web Audio gain nodes (iOS
 * ignores HTMLMediaElement.volume); cues are fetched same-origin through
 * /api/audio/music so Web Audio can process them.
 */
export class BackgroundScorePlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private cues = new Map<ScoreMood, CueVoice>();
  private current: ScoreMood | null = null;
  private enabled = true;
  private volume = 1;

  constructor(private score: MusicScore) {}

  /** New cues or tracks arrive while generation is still running. */
  setScore(score: MusicScore) {
    this.score = score;
    this.applyVolume();
  }

  /**
   * Call from a user gesture (the Play click). Browsers, iOS especially, only
   * let audio start inside a gesture, so every cue is primed here once.
   */
  unlock() {
    const ctx = this.context();
    if (!ctx) return;
    void ctx.resume();
    for (const mood of Object.keys(this.score.cues) as ScoreMood[]) {
      const cue = this.cue(mood);
      if (cue && cue.el.paused && mood !== this.current) {
        void cue.el
          .play()
          .then(() => {
            if (this.current !== mood) cue.el.pause();
          })
          .catch(() => undefined);
      }
    }
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.fadeTo(null, STOP_FADE_S);
  }

  setVolume(volume: number) {
    this.volume = Math.min(1, Math.max(0, volume));
    this.applyVolume();
  }

  /** Follow the narration: which track, where in it (seconds), and whether it plays. */
  sync(trackNumber: number, timeSeconds: number, playing: boolean) {
    if (!this.enabled || !playing) {
      this.fadeTo(null, STOP_FADE_S);
      return;
    }
    const spans = this.score.tracks[String(trackNumber)];
    const ms = timeSeconds * 1000;
    const mood = moodAt(spans, ms + LEAD_MS) ?? moodAt(spans, ms);
    this.fadeTo(mood && this.score.cues[mood] ? mood : null, CROSSFADE_S);
  }

  dispose() {
    for (const cue of this.cues.values()) {
      clearTimeout(cue.stopTimer);
      cue.el.pause();
      cue.el.removeAttribute("src");
    }
    this.cues.clear();
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.master = null;
    this.current = null;
  }

  private context(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof window === "undefined") return null;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.applyVolume();
    return this.ctx;
  }

  private applyVolume() {
    if (!this.ctx || !this.master) return;
    const target = MUSIC_LEVEL_GAIN[this.score.level] * this.volume;
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.15);
  }

  private cue(mood: ScoreMood): CueVoice | null {
    const existing = this.cues.get(mood);
    if (existing) return existing;
    const url = this.score.cues[mood];
    const ctx = this.context();
    if (!url || !ctx || !this.master) return null;

    const el = new Audio(`/api/audio/music?src=${encodeURIComponent(url)}`);
    el.loop = true;
    el.preload = "auto";
    const gain = ctx.createGain();
    gain.gain.value = 0;
    ctx.createMediaElementSource(el).connect(gain);
    gain.connect(this.master);
    const cue = { el, gain };
    this.cues.set(mood, cue);
    return cue;
  }

  private ramp(cue: CueVoice, to: number, seconds: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    cue.gain.gain.cancelScheduledValues(now);
    cue.gain.gain.setValueAtTime(cue.gain.gain.value, now);
    cue.gain.gain.linearRampToValueAtTime(to, now + seconds);
  }

  private fadeTo(mood: ScoreMood | null, seconds: number) {
    if (mood === this.current) {
      const cue = mood ? this.cues.get(mood) : null;
      if (cue?.el.paused) void cue.el.play().catch(() => undefined);
      return;
    }

    const previous = this.current ? this.cues.get(this.current) : null;
    if (previous) {
      this.ramp(previous, 0, seconds);
      clearTimeout(previous.stopTimer);
      const leaving = this.current;
      previous.stopTimer = setTimeout(() => {
        if (this.current !== leaving) previous.el.pause();
      }, seconds * 1000 + 150);
    }

    this.current = mood;
    const next = mood ? this.cue(mood) : null;
    if (next) {
      clearTimeout(next.stopTimer);
      void this.ctx?.resume();
      void next.el.play().catch(() => undefined);
      this.ramp(next, 1, seconds);
    }
  }
}
