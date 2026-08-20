# Piano Progress repository guidance

## Product

This repository builds a serious piano progress and performance-analysis application. Keep the experience premium, music-oriented, and focused on measurable progress. Avoid children's gamification, fake rewards, and claims that unfinished analysis is working.

## Important terminology

- **Work**: musical identity, such as *River Flows in You*.
- **Arrangement**: one playable realization of a Work.
- **Derived Work**: a separate Work inspired by another Work.
- **ScoreVersion**: the exact machine-readable score used for analysis.
- **PerformanceAttempt**: one recorded performance tied to an Arrangement and exact ScoreVersion.
- **Performance Score**: metrics for one attempt.
- **Mastery**: current knowledge of an Arrangement across time, consistency, coverage, tempo, and recency.
- **Skill Rating**: a transferable ability measured across repertoire or Technique Lab exercises.

## Domain rules

- Mastery belongs primarily to an Arrangement, never implicitly to every arrangement of a Work.
- Derived works may remain separate Works and reference their source with `derivedFromWorkId`.
- ScoreVersions are historically immutable. A changed import creates a new version.
- Future performances reference the exact ScoreVersion and grading-engine version used.
- Preserve historical performance semantics so results remain reproducible.

## Engineering rules

- Keep TypeScript strict; avoid `any` and fix type or lint failures instead of suppressing them.
- Do not fake functionality. Label future and mock behavior honestly.
- Preserve existing conventions when they remain sensible.
- Keep domain and MIDI logic independent from React presentation.
- Work in small, independently verifiable milestones.
- Do not introduce a backend, database, or large dependency before it is requested.
- Keep dependencies lightweight and justified.

## Commands

- Install: `npm install`
- Development: `npm run dev`
- Test: `npm test`
- Type-check: `npm run type-check`
- Lint: `npm run lint`
- Production build: `npm run build`

## Git milestone rule

For a requested milestone: implement it, run tests, type-check, lint, and production build, inspect the complete diff and Git status, fix problems, then create the requested local commit. Never push unless explicitly instructed. Commit this file with relevant milestones.
