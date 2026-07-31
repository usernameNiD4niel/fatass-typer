# Claude Build Prompt: Desktop Typing Chase Game

You are a senior Rust, WebAssembly, TypeScript, React, Bevy, and game-development engineer.

Build a production-quality, desktop-first typing game delivered primarily as a Progressive Web App. The application is intended for laptops and desktop computers using a physical keyboard. Mobile support is explicitly out of scope.

The game may later be packaged as a Windows desktop application. Structure the project so the browser version can be wrapped using Tauri without rewriting the game.

Do not generate a toy demo. Build the application incrementally using maintainable architecture, clear module boundaries, automated tests, and documented setup instructions.

---

## 1. Product concept

The game is an endless-runner-style typing game.

At the beginning of each level:

- A heavy-set main character, referred to as the MC, runs toward a finish line.
- Three dogs chase the MC from behind.
- Words and phrases appear during the run.
- Correctly typing the active word gives the MC a temporary speed boost.
- Obstacles appear ahead of the MC.
- Each obstacle displays a word or phrase.
- The player must finish typing the obstacle text before the MC reaches it.
- Successful typing makes the MC dodge, jump, slide, or otherwise avoid the obstacle.
- Failure causes the MC to hit the obstacle, lose momentum, and allow the dogs to get closer.
- The player wins by reaching the finish line before the dogs catch the MC.
- Completing a map unlocks the next map.

The first map must be approachable for a player who types approximately 20 words per minute. Difficulty should rise gradually across later maps.

The application must track and display the player's best meaningful typing speed, not a misleading one-second spike.

---

## 2. Primary technical architecture

Use this stack unless there is a concrete technical reason to change an individual library:

### Application shell

- React
- TypeScript
- Vite
- Vanilla CSS, CSS Modules, or another lightweight styling approach
- Avoid a heavy component library
- Use reusable design tokens and accessible custom components

### Game runtime

- Rust
- Bevy
- Compile the browser game to WebAssembly
- Render the game scene in a canvas
- Use Bevy ECS for entities, animation state, game progression, obstacles, dogs, player movement, collisions, and timing

### Rust and browser integration

- `wasm-bindgen`
- `web-sys`
- A small, explicit event-based bridge between React and Rust
- Do not tightly couple React components to Bevy internals

### Persistence

- IndexedDB for player progress, statistics, unlocked maps, settings, and run history
- Use a versioned storage schema
- A lightweight TypeScript wrapper such as Dexie is acceptable
- Do not require a backend for the first version

### PWA

- Web app manifest
- Service worker
- Offline application shell
- Cached game assets
- Update notification when a new version is available
- Installable on desktop browsers

### Optional Windows packaging

- Tauri
- Treat Tauri as a packaging layer around the browser build
- Do not make Tauri a requirement for local browser development
- Keep the core application functional without native APIs

### Testing

- Rust unit tests for game rules, difficulty calculations, scoring, typing validation, and progression
- Vitest for TypeScript modules and React components
- Playwright for end-to-end desktop keyboard flows
- Add tests while implementing each milestone

---

## 3. Project structure

Use a workspace or monorepo with clear separation between the web shell and Rust game.

A reasonable structure is:

```text
typing-chase/
├── apps/
│   └── web/
│       ├── src/
│       │   ├── components/
│       │   ├── screens/
│       │   ├── game-bridge/
│       │   ├── storage/
│       │   ├── styles/
│       │   └── main.tsx
│       ├── public/
│       ├── tests/
│       ├── vite.config.ts
│       └── package.json
├── crates/
│   ├── game-core/
│   │   ├── src/
│   │   └── Cargo.toml
│   ├── game-bevy/
│   │   ├── src/
│   │   └── Cargo.toml
│   └── game-wasm/
│       ├── src/
│       └── Cargo.toml
├── src-tauri/
├── assets/
├── Cargo.toml
├── package.json
├── README.md
└── docs/
```

`game-core` should contain deterministic, renderer-independent rules where practical.

Examples:

- typing comparison
- WPM calculation
- accuracy calculation
- obstacle timing
- score calculation
- difficulty progression
- level completion
- map unlocking
- dog catch-up logic
- player boost calculation

`game-bevy` should contain Bevy-specific ECS systems, rendering, animation state, scene setup, audio triggers, and entity lifecycle.

`game-wasm` should expose the browser-facing interface.

---

## 4. Required game states

Implement an explicit state machine.

Required application and game states:

```text
Boot
MainMenu
MapSelection
PreRunCountdown
Running
Paused
PlayerHit
LevelComplete
GameOver
Results
Settings
```

State transitions must be predictable and testable.

Examples:

- `MainMenu -> MapSelection`
- `MapSelection -> PreRunCountdown`
- `PreRunCountdown -> Running`
- `Running -> Paused`
- `Running -> PlayerHit`
- `PlayerHit -> Running`
- `Running -> LevelComplete`
- `Running -> GameOver`
- `LevelComplete -> Results`
- `GameOver -> Results`

Do not scatter state booleans throughout the codebase.

---

## 5. Core gameplay systems

Implement these systems as separate modules or Bevy plugins.

### Player system

The MC must support:

- idle
- running
- boosting
- jumping
- sliding
- stumbling
- hit
- victory
- caught

The player's world speed should be controlled by game rules rather than directly by animation speed.

### Dog chase system

There are three dogs.

The dogs should:

- maintain a chase distance behind the MC
- get closer after mistakes or obstacle collisions
- fall farther behind during successful typing streaks
- catch the MC when the chase-distance meter reaches zero
- visually communicate danger as they approach

Use one logical chase-distance model. Do not simulate complex physical AI unless it adds real gameplay value.

### Word prompt system

There are two prompt categories:

1. Boost prompts
2. Obstacle prompts

Boost prompts:

- appear during safe running intervals
- give temporary speed or distance advantage
- reward accurate and fast typing
- should not immediately cause failure when missed

Obstacle prompts:

- are attached to an upcoming obstacle
- have a deadline based on time-to-impact
- must be completed before collision
- trigger an avoidance animation on success
- trigger a hit or stumble sequence on failure

### Typing input system

The browser UI must use a real focused HTML input element.

Requirements:

- capture physical keyboard input reliably
- prevent browser shortcuts only when necessary
- support Backspace
- support punctuation and spaces for phrases
- ignore unsupported control keys
- compare input case-insensitively by default
- visually distinguish correct, current, and incorrect characters
- allow configurable mistake behavior
- immediately reset or advance after completing a prompt
- never rely solely on global `keydown` events for text construction

Use React to capture text input and send normalized input events to the Rust game.

### Obstacle system

Create multiple obstacle types with distinct avoidance actions.

Initial examples:

- crate: jump
- low barrier: jump
- hanging sign: slide
- puddle: jump
- trash bin: sidestep
- roadwork barrier: jump
- narrow passage: type a phrase to pass cleanly

Each obstacle definition should contain:

```ts
type ObstacleDefinition = {
  id: string;
  label: string;
  action: "jump" | "slide" | "sidestep";
  difficultyWeight: number;
  minimumMap: number;
  promptCategory: string;
  baseReactionTimeMs: number;
};
```

Equivalent Rust types are acceptable.

### Collision and outcome system

For each obstacle:

- calculate time to impact
- select a prompt based on the map's difficulty profile
- show the prompt early enough for the target typing speed
- resolve success when the full prompt is typed
- resolve failure when the impact deadline expires
- prevent double resolution
- play the correct player animation
- update score, combo, dog distance, and run statistics

---

## 6. Difficulty model

Do not define difficulty using WPM alone.

Difficulty should be based on a combination of:

- target WPM
- prompt length
- word familiarity
- punctuation
- phrase length
- obstacle frequency
- reaction buffer
- simultaneous visual pressure
- dog catch-up rate
- collision penalty
- boost strength
- recovery opportunity
- required accuracy

Initial map progression:

| Map | Target WPM | Theme | Unlock rule |
|---|---:|---|---|
| 1 | 20 | Neighborhood | Available by default |
| 2 | 25 | Downtown | Complete Map 1 with at least 85% accuracy |
| 3 | 30 | Market District | Complete Map 2 with at least 87% accuracy |
| 4 | 35 | Industrial Zone | Complete Map 3 with at least 89% accuracy |
| 5 | 40 | Night Highway | Complete Map 4 with at least 90% accuracy |
| 6 | 50 | Final Pursuit | Complete Map 5 with at least 92% accuracy |

Make these values data-driven rather than hardcoded into game systems.

### Prompt timing formula

Use a transparent formula similar to:

```text
expected_typing_seconds =
    effective_character_count
    / 5
    / target_wpm
    * 60

available_seconds =
    expected_typing_seconds
    * reaction_buffer
    + fixed_visual_lead_time
```

Consider spaces and punctuation in `effective_character_count`.

Suggested reaction buffers:

```text
Map 1: 1.70
Map 2: 1.55
Map 3: 1.40
Map 4: 1.28
Map 5: 1.18
Map 6: 1.08
```

Tune the values through playtesting.

### Adaptive assistance

Within a map, use limited adaptation:

- after repeated failures, increase reaction time slightly
- after a sustained high-accuracy streak, reduce the buffer slightly
- never change difficulty so aggressively that the player notices unfair speed manipulation
- clamp all adaptive values
- show the map's intended target WPM honestly

---

## 7. WPM, accuracy, and statistics

Use the standard definition:

```text
gross_wpm = typed_character_count / 5 / elapsed_minutes
```

Track:

- current rolling WPM
- run average WPM
- raw peak WPM
- sustainable peak WPM
- accuracy
- correct characters
- incorrect characters
- corrected errors
- missed prompts
- completed prompts
- obstacle success rate
- longest combo
- map completion time
- best score per map

### Sustainable peak WPM

The main profile statistic must be `sustainable_peak_wpm`.

Calculate it using a rolling window of approximately 10 to 15 seconds. Require:

- a minimum number of typed characters
- a minimum accuracy threshold
- no idle gap longer than a configured limit

Do not use a one-second burst as the displayed player record.

Display both:

- `Current WPM`
- `Peak WPM`

The prominent lifetime record should use sustainable peak WPM.

---

## 8. Scoring and progression

Create a data-driven scoring system.

Score should reward:

- correct characters
- prompt completion
- early obstacle completion
- high accuracy
- sustained combo
- finishing a level
- finishing with dogs far behind

Score should penalize:

- incorrect characters
- missed obstacles
- collisions
- dogs reaching a critical distance

Suggested model:

```text
base_prompt_score
+ speed_bonus
+ accuracy_bonus
+ remaining_time_bonus
+ combo_multiplier
- collision_penalty
```

Avoid negative lifetime scores.

Unlock progress must persist locally.

Add a development-only reset-progress command in the settings screen or developer panel.

---

## 9. User interface and visual direction

The application is UI/UX-heavy.

Use an iOS-inspired visual language adapted for desktop, without copying proprietary Apple screens or assets.

### Design principles

- clean hierarchy
- generous whitespace
- rounded cards
- soft translucent panels
- subtle shadows
- restrained color palette
- large readable typography
- smooth spring-like transitions
- consistent iconography
- strong keyboard focus states
- dark and light themes
- high contrast where gameplay requires it
- avoid excessive glassmorphism that harms readability

Use a system font stack similar to:

```css
font-family:
  Inter,
  ui-sans-serif,
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  sans-serif;
```

### Desktop layout

The game should be designed around:

- minimum supported width: 1024 px
- preferred layout: 1280 × 720 and above
- physical keyboard
- mouse or trackpad for menus
- landscape orientation only

Do not spend implementation time on mobile breakpoints.

At unsupported small widths, show a polished message asking the user to use a larger window.

### Screens

Build these screens:

1. Splash/loading screen
2. Main menu
3. Player profile summary
4. Map selection
5. Level briefing
6. Game screen
7. Pause overlay
8. Level-complete screen
9. Game-over screen
10. Detailed run results
11. Settings
12. Statistics
13. First-run tutorial

### Main menu

Display:

- game title
- Start button
- Continue button when progress exists
- Maps
- Statistics
- Settings
- current highest unlocked map
- sustainable peak WPM
- overall accuracy

### Map selection

Each map card should show:

- map name
- target WPM
- visual theme
- locked or unlocked state
- best score
- best accuracy
- completion status
- unlock requirement

### Game HUD

Display:

- active prompt
- typed progress
- current WPM
- accuracy
- combo
- progress to finish line
- dog threat distance
- pause control
- obstacle time pressure

The prompt must be the visual priority.

Do not overload the HUD.

### Results screen

Display:

- win or loss status
- score
- average WPM
- sustainable peak WPM
- accuracy
- obstacle success rate
- longest combo
- mistakes
- new records
- unlocked content
- Retry
- Next Map, when available
- Return to Maps

---

## 10. Character and art requirements

Do not use copyrighted characters, logos, sounds, or copied game assets.

Use original placeholder art initially.

The MC should be:

- heavy-set
- expressive
- visually readable at small scale
- comedic but not humiliating or demeaning
- animated with exaggerated running and recovery motion

The dogs should look energetic rather than graphic or frightening.

The game should use a side-scrolling 2D perspective.

For the first implementation:

- use simple vector shapes, sprite placeholders, or generated placeholder assets
- isolate asset paths and animation definitions
- make replacement with final art straightforward
- do not block core gameplay on final artwork

Create an asset manifest.

---

## 11. Audio

Add an audio system with:

- menu music
- running music
- danger layer as dogs approach
- correct-character feedback
- prompt-complete sound
- boost sound
- obstacle-warning sound
- collision sound
- victory sound
- game-over sound

Requirements:

- volume settings
- music toggle
- sound-effect toggle
- browser autoplay restrictions handled correctly
- audio begins only after user interaction
- no copyrighted audio

Use placeholders where necessary.

---

## 12. Accessibility and usability

Desktop-only does not remove accessibility requirements.

Implement:

- complete keyboard navigation for menus
- visible focus indicators
- reduced-motion setting
- high-contrast prompt text
- color-independent success and error indicators
- adjustable game volume
- text-size option for prompts
- pause with Escape
- restart shortcut
- no flashing effects
- descriptive accessible labels for UI controls

The canvas game itself may not be screen-reader playable, but all surrounding navigation and statistics should be accessible.

---

## 13. React-to-Rust bridge

Design a small interface.

Example commands sent from React to Rust:

```ts
type GameCommand =
  | { type: "initialize"; canvasId: string }
  | { type: "loadMap"; mapId: string }
  | { type: "startRun" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "restart" }
  | { type: "submitInput"; value: string; timestamp: number }
  | { type: "setSettings"; settings: GameSettings }
  | { type: "destroy" };
```

Example events emitted from Rust to React:

```ts
type GameEvent =
  | { type: "ready" }
  | { type: "stateChanged"; state: GameState }
  | { type: "promptChanged"; prompt: PromptViewModel }
  | { type: "statsUpdated"; stats: LiveRunStats }
  | { type: "dogDistanceChanged"; normalizedDistance: number }
  | { type: "obstacleWarning"; obstacle: ObstacleViewModel }
  | { type: "playerHit"; reason: string }
  | { type: "levelCompleted"; result: RunResult }
  | { type: "gameOver"; result: RunResult }
  | { type: "fatalError"; message: string };
```

Requirements:

- expose one stable bridge object
- validate messages at the boundary
- avoid frequent allocation-heavy JSON messages for per-frame data
- emit UI updates at a reasonable fixed frequency
- do not send every Bevy frame to React
- clean up listeners when the game canvas unmounts

---

## 14. Data models

Create serializable, versioned models.

At minimum:

```ts
type PlayerProfile = {
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
  sustainablePeakWpm: number;
  lifetimeCharacters: number;
  lifetimeCorrectCharacters: number;
  unlockedMapIds: string[];
  mapProgress: Record<string, MapProgress>;
  settings: GameSettings;
};
```

```ts
type MapProgress = {
  completed: boolean;
  bestScore: number;
  bestAverageWpm: number;
  bestPeakWpm: number;
  bestAccuracy: number;
  bestCompletionTimeMs: number | null;
  attempts: number;
};
```

```ts
type RunResult = {
  runId: string;
  mapId: string;
  startedAt: string;
  durationMs: number;
  completed: boolean;
  score: number;
  averageWpm: number;
  sustainablePeakWpm: number;
  accuracy: number;
  correctCharacters: number;
  incorrectCharacters: number;
  correctedErrors: number;
  completedPrompts: number;
  missedPrompts: number;
  obstacleSuccessRate: number;
  longestCombo: number;
};
```

Use equivalent Rust structures with Serde.

---

## 15. Content system

Word lists must be data-driven.

Create categories:

- common short words
- common medium words
- common long words
- punctuation
- numbers
- short phrases
- medium phrases
- map-themed vocabulary

Each prompt entry should support metadata:

```ts
type PromptEntry = {
  id: string;
  text: string;
  normalizedText: string;
  difficulty: number;
  category: string;
  minimumMap: number;
  tags: string[];
};
```

Requirements:

- avoid slurs and offensive text
- avoid obscure words in beginner maps
- avoid ambiguous whitespace
- ensure punctuation prompts are intentional
- prevent immediate repetition
- support seeded selection for deterministic tests

Include enough sample content to play every map, but keep content files easy to expand.

---

## 16. Performance requirements

Target smooth gameplay on an ordinary modern laptop.

Requirements:

- target 60 FPS
- avoid React re-rendering every animation frame
- reuse entities where practical
- use sprite atlases or optimized placeholder assets
- lazy-load nonessential screens and assets
- display loading progress
- handle WebAssembly initialization failures
- keep the first playable load reasonably small
- document asset compression recommendations
- release builds must enable appropriate Rust and WASM optimization

Configure production optimization, such as:

- Rust release profile suitable for WASM
- `wasm-opt` when available
- code splitting in Vite
- source maps configurable by environment

Do not prematurely micro-optimize deterministic game logic.

---

## 17. Error handling

Handle:

- WebAssembly load failure
- unsupported browser features
- IndexedDB unavailable
- corrupted local save
- incompatible save schema
- failed asset loading
- lost canvas context where applicable
- unexpected Rust panic
- service-worker update failure

Show useful recovery actions.

Never silently erase progress. If stored data is corrupt, attempt backup and recovery before resetting it.

---

## 18. Development workflow

Use current stable toolchains compatible with the chosen library versions.

Provide commands for:

```bash
npm install
npm run dev
npm run build
npm run test
npm run test:e2e
npm run lint
npm run format
npm run build:wasm
npm run tauri:dev
npm run tauri:build
```

Equivalent commands are acceptable, but the root project should expose a simple workflow.

Include:

- Rust formatting
- Clippy
- ESLint
- TypeScript strict mode
- Prettier or an equivalent formatter
- CI workflow for build, lint, and tests

---

## 19. Implementation milestones

Work in milestones. At the end of each milestone:

1. summarize what was implemented
2. list files added or changed
3. provide exact commands to run it
4. run relevant tests
5. report any incomplete parts honestly
6. do not begin a broad rewrite of previous milestones without justification

### Milestone 1: Architecture and playable prototype

Build:

- monorepo/workspace
- React shell
- Rust WASM initialization
- Bevy canvas
- basic side-scrolling scene
- placeholder MC and three dogs
- one active prompt
- HTML typing input
- correct prompt completion
- simple boost
- basic finish line
- basic game-over condition
- current WPM and accuracy
- minimal tests

Acceptance criteria:

- application starts locally
- player can type a word
- correct completion visibly boosts the MC
- dogs can catch the MC
- player can reach a finish line
- React and Rust communicate through the defined bridge

### Milestone 2: Obstacles and map rules

Build:

- obstacle spawning
- obstacle prompts
- collision deadlines
- jump and slide outcomes
- dog-distance consequences
- data-driven Map 1
- score and combo
- pause and restart
- tests for obstacle resolution and timing

### Milestone 3: Full UI shell

Build:

- iOS-inspired visual system
- main menu
- map selection
- level briefing
- game HUD
- pause overlay
- results screen
- settings
- desktop width guard
- light and dark themes

### Milestone 4: Progression and persistence

Build:

- IndexedDB persistence
- map unlocking
- run history
- sustainable peak WPM
- statistics screen
- save migrations
- corrupted-save recovery
- progress reset for development

### Milestone 5: Complete map set

Build:

- all six maps
- map-specific visual themes
- map-specific vocabulary
- increasing difficulty
- unlock rules
- best results per map
- adaptive assistance

### Milestone 6: PWA and offline support

Build:

- manifest
- icons or placeholder icons
- service worker
- offline caching
- update prompt
- installability
- offline tests
- production build validation

### Milestone 7: Polish and Windows packaging

Build:

- audio
- animation polish
- loading experience
- accessibility pass
- performance profiling
- Tauri wrapper
- Windows build documentation
- final end-to-end tests

---

## 20. Definition of done

The project is complete when:

- a new user can install or run the desktop PWA
- Map 1 is immediately playable
- typing correctly helps the MC escape
- obstacle words must be completed before impact
- mistakes cause meaningful but understandable consequences
- dogs visibly approach when the player performs poorly
- reaching the finish line unlocks progression when accuracy requirements are met
- all six maps work
- progress persists across restarts
- sustainable peak WPM is displayed
- menus are keyboard accessible
- the interface has a polished iOS-inspired desktop aesthetic
- the game works offline after initial installation
- automated tests cover critical rules
- production build instructions work
- the web build can be packaged with Tauri for Windows

---

## 21. Coding rules

Follow these rules throughout implementation:

- use TypeScript strict mode
- avoid `any`
- keep Rust code Clippy-clean
- prefer small focused modules
- document public interfaces
- do not overuse global state
- avoid magic numbers
- use configuration files for map tuning
- make game simulation deterministic where practical
- use seeded randomness in tests
- do not mix persistence code into rendering systems
- do not put game rules inside React components
- do not expose Bevy internals through the browser bridge
- do not use fake implementations when a working simple implementation is possible
- do not claim tests passed unless they were actually run
- never omit important files with comments such as “implementation goes here”
- provide complete file contents for newly created core files
- when modifying an existing file, show a clear patch or the complete replacement
- preserve working behavior between milestones

---

## 22. First response instructions

In your first response:

1. restate the architecture you will use
2. identify important technical risks
3. show the proposed repository structure
4. define the React-to-Rust bridge
5. define the minimum data models
6. provide the Milestone 1 implementation plan
7. then begin implementing Milestone 1

Do not spend the entire response discussing architecture without producing code.

Do not attempt to generate all seven milestones in one response. Complete Milestone 1 as a coherent, runnable vertical slice first.

When context becomes limited, stop at a clean checkpoint and provide a precise continuation prompt containing:

- current milestone
- completed work
- remaining work
- important architecture decisions
- commands to verify the project
- known issues

Begin now.
