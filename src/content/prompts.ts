import { normalizePromptText, type PromptEntry } from '../game-core/models';

/**
 * Starter vocabulary (spec §15).
 *
 * Enough to play the vertical slice, not the finished content set — step F1
 * expands this into proper category files. The rules it already follows are the
 * ones that are expensive to retrofit: common words only, no ambiguous
 * whitespace, nothing a beginner would have to puzzle over, and nothing
 * offensive.
 *
 * `normalizedText` is derived rather than typed by hand, so the two can never
 * disagree.
 */

interface PromptSeed {
  readonly id: string;
  readonly text: string;
  readonly category: PromptEntry['category'];
  readonly difficulty: number;
  readonly minimumMap?: number;
  readonly tags?: readonly string[];
}

function toPrompt(seed: PromptSeed): PromptEntry {
  return {
    id: seed.id,
    text: seed.text,
    normalizedText: normalizePromptText(seed.text),
    difficulty: seed.difficulty,
    category: seed.category,
    minimumMap: seed.minimumMap ?? 1,
    usage: 'both',
    tags: seed.tags ?? [],
  };
}

const SEEDS: readonly PromptSeed[] = [
  // Short words — the bulk of Map 1, where 20 WPM has to be achievable.
  { id: 'w-run', text: 'run', category: 'short-word', difficulty: 0.1, tags: ['chase'] },
  { id: 'w-fast', text: 'fast', category: 'short-word', difficulty: 0.15, tags: ['chase'] },
  { id: 'w-dog', text: 'dog', category: 'short-word', difficulty: 0.1, tags: ['chase'] },
  { id: 'w-park', text: 'park', category: 'short-word', difficulty: 0.15, tags: ['street'] },
  { id: 'w-gate', text: 'gate', category: 'short-word', difficulty: 0.2, tags: ['street'] },
  { id: 'w-tree', text: 'tree', category: 'short-word', difficulty: 0.2, tags: ['street'] },
  { id: 'w-step', text: 'step', category: 'short-word', difficulty: 0.2 },
  { id: 'w-jump', text: 'jump', category: 'short-word', difficulty: 0.2 },
  { id: 'w-turn', text: 'turn', category: 'short-word', difficulty: 0.25 },
  { id: 'w-road', text: 'road', category: 'short-word', difficulty: 0.15, tags: ['street'] },

  // Medium words.
  { id: 'w-street', text: 'street', category: 'medium-word', difficulty: 0.35, tags: ['street'] },
  { id: 'w-corner', text: 'corner', category: 'medium-word', difficulty: 0.35, tags: ['street'] },
  { id: 'w-garden', text: 'garden', category: 'medium-word', difficulty: 0.4, tags: ['street'] },
  { id: 'w-window', text: 'window', category: 'medium-word', difficulty: 0.4 },
  { id: 'w-hurry', text: 'hurry', category: 'medium-word', difficulty: 0.3, tags: ['chase'] },
  { id: 'w-escape', text: 'escape', category: 'medium-word', difficulty: 0.45, tags: ['chase'] },
  { id: 'w-runner', text: 'runner', category: 'medium-word', difficulty: 0.35, tags: ['chase'] },

  // Short phrases — spaces are part of the skill (spec §6).
  { id: 'p-keep-going', text: 'keep going', category: 'short-phrase', difficulty: 0.5 },
  { id: 'p-run-faster', text: 'run faster', category: 'short-phrase', difficulty: 0.5 },
  { id: 'p-almost-there', text: 'almost there', category: 'short-phrase', difficulty: 0.55 },
  { id: 'p-good-dog', text: 'good dog', category: 'short-phrase', difficulty: 0.45 },
  { id: 'p-down-the-road', text: 'down the road', category: 'short-phrase', difficulty: 0.6 },
];

export const STARTER_PROMPTS: readonly PromptEntry[] = SEEDS.map(toPrompt);
