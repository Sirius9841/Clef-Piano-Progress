# V1 UI system

Phase 15.0 freezes Clef's desktop-first V1 presentation language. The production React application uses the reference artifact for composition, typography, color, density, motion, and responsive posture only. Fixture objects, generated notation, mock metrics, timers, and enum maps are never production contracts.

## Visual language

- Warm charcoal and umber form the primary dark application shell; Light is a sibling application appearance.
- Brass communicates selection, intent, Mastery, PBs, and progress; sienna identifies captured/recording evidence; sage identifies factual connected, healthy, or established states. Text and shape always accompany color.
- Fraunces is reserved for musical and title moments, Instrument Sans is normal UI typography, and JetBrains Mono identifies technical provenance.
- The normal desktop sidebar is 232px and becomes a 64px rail at the compact desktop breakpoint. Practice Focus Mode uses the rail at every supported width, hides the inspector, preserves transport access, and does not recreate the route, session, score, or take.
- Motion is restrained: one-time entrance/progress/PB settling, hover lift, recording pulse, and focus transitions. Reduced-motion preferences disable decoration.

## Appearance

Application appearance has a requested value (`Dark`, `Light`, or retained `System`) and a resolved dark/light value. System follows live `prefers-color-scheme`. Score appearance is an independent `Paper` or `Night` choice. Both are stored in the versioned `clef-ui-preferences-v1` localStorage record, outside IndexedDB schema 4.

Paper/Night changes OSMD presentation only. OSMD remains a renderer, never the canonical score model; no appearance choice changes MusicXML, `NormalizedScore`, `ExpectedPerformancePlan`, analysis, or history.

## Evidence semantics

- There is no overall Performance Score or overall Skill score.
- Repertoire status is one of Learning, Practicing, Performance Ready, or Completed and is changed only by the user.
- Mastery belongs to one Arrangement and its current ScoreVersion. Demonstrated speed, target speed, confidence, and Mastery remain separate facts.
- Headline PBs and trends use canonical Notes/Rhythm/Tempo comparability only. Partial or unreliable attempts remain factual history but do not create headline claims.
- Dynamics, Articulation, Pedal, and Voicing remain independent. Authored Pedal availability and physical CC64 capture are separate; Voicing requires explicit intent.
- Technique configuration comes from current domain definitions, and results render `TechniqueAnalysisResult.facets` dynamically. No UI-owned module or facet map exists.
- Reference performances are selected local interpretive comparisons, never correctness ground truth.
- Historical attempt and Technique snapshots are immutable and shown with their preserved engine/version provenance.
- Phase 7 Practice Priority describes one take. Phase 14 planning is a current, explicit-`asOf`, exact-ScoreVersion derived read model with supporting provenance; recommendations are not persisted.
- Current Practice automatically prepares the bounded core result after a take stops, then uses Take Review as the normal destination. It shows independent evidence cards, only matched measures, at most five problem measures, and one inspector dimension at a time; unresolved localization hides headline metrics and offers explicit candidate confirmation. Detailed engine panels remain collapsed and lazily mounted forensic evidence.

## Frozen V1 presentation integrity

- A repertoire planning action launches the exact current persisted ScoreVersion through the canonical MusicXML parser and expected-performance builder. Its suggested speed and exact section identity are session-local presentation context; they never become a persisted recommendation or change the analyzer's grading scope.
- Technique recommendations continue to open their Technique Lab module. They never enter the repertoire Practice launcher.
- Home, Repertoire, and Piece current-result summaries filter by the exact current ScoreVersion. Older-version takes remain available in history but cannot supply a current-result number, current PB chip, Mastery value, Voicing preference, or reference status.
- Historical Results use one dominant score and a seven-lane inspector: Notes, Rhythm, Tempo, Dynamics, Articulation, Pedal, and Voicing. Each lane reads its frozen saved snapshot. Reference comparison remains optional neutral context, never an eighth scored dimension.
- Phase 7 per-take evidence and Phase 14 current planning are visibly separate. A lowest-dimension statement is limited to the available saved Notes/Rhythm/Tempo values and is not an overall Performance Score.
- Authored Pedal scoring and physically captured CC64 state are reported separately. Unconfigured historical Voicing is descriptive/unavailable, never zero and never reconstructed from current preferences.
- Rich Repertoire cards are a bounded current/recent subset. The ledger remains the complete set matching the active search and status filter.

## Truthful states and accessibility

Unavailable evidence is never displayed as zero. Empty repertoire, missing attempts, absent Technique evidence, unconfigured Voicing, unavailable authored Pedal targets, absent planner recommendations, malformed imports, and repository failures use explicit factual states. Recovery and backup success are not claimed without real infrastructure.

Controls use native link, button, radio, select, and dialog semantics. Icon-only controls have names, destructive clearing uses a focus-managed confirmation dialog, focus indicators are visible, disabled controls remain distinguishable, and information is never color-only. V1 is intentionally desktop-first and verified at 1440×900, 1280×800, and 1024×768 without horizontal overflow.

Practice transport distinguishes **Ready**, **Waiting for first note…**, **Recording**, and **Take ready**. The timer stays at zero while armed. Intended start can be Beginning, an exact planner-provided section, or Auto; the label states that it is a localization hint rather than grading truth. Detailed analysis is a lazy disclosure beneath the compact review.

## Local Data and release recovery

Settings is the V1 safety surface. It reports browser-local location and real counts, begins at **Not verified this session**, and exposes explicit verify, export, inspect/restore, conditionally available summary repair, and Clear All actions. Backup files are keyboard-selectable and described as unencrypted. Restore previews use semantic headings and state plainly that restore replaces the current local database before the focus-managed confirmation appears.

Remove from Repertoire uses the shared accessible dialog and distinguishes membership removal from deletion. Clear All may offer **Export backup first** when records exist but never forces or fabricates a backup. Unexpected route errors retain a recoverable application screen. Planner-provided non-preset speeds remain exact and visibly appear as `Current · 85%`; current-context Home cards use only exact-current-ScoreVersion results. Long histories reveal older rows incrementally without truncating storage.
