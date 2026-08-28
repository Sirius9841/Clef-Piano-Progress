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

## Truthful states and accessibility

Unavailable evidence is never displayed as zero. Empty repertoire, missing attempts, absent Technique evidence, unconfigured Voicing, unavailable authored Pedal targets, absent planner recommendations, malformed imports, and repository failures use explicit factual states. Recovery and backup success are not claimed without real infrastructure.

Controls use native link, button, radio, select, and dialog semantics. Icon-only controls have names, destructive clearing uses a focus-managed confirmation dialog, focus indicators are visible, disabled controls remain distinguishable, and information is never color-only. V1 is intentionally desktop-first and verified at 1440×900, 1280×800, and 1024×768 without horizontal overflow.
