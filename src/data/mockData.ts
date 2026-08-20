import type {
  Arrangement,
  ArrangementProgress,
  PerformanceMetrics,
  RepertoireItem,
  SkillRating,
  Work,
} from '../domain/music'

export const works: Work[] = [
  { id: 'work-river', title: 'River Flows in You', composer: 'Yiruma', metadata: { year: 2001, genre: 'Contemporary' } },
  { id: 'work-gymnopedie', title: 'Gymnopédie No. 1', composer: 'Erik Satie', metadata: { year: 1888, genre: 'Classical' } },
  { id: 'work-canon', title: 'Canon in D', composer: 'Johann Pachelbel', metadata: { genre: 'Baroque' } },
  { id: 'work-canon-fantasy', title: 'Canon Fantasy', composer: 'Lee Galloway', derivedFromWorkId: 'work-canon', metadata: { genre: 'Contemporary' } },
  { id: 'work-clair', title: 'Clair de lune', composer: 'Claude Debussy', metadata: { year: 1905, genre: 'Impressionist' } },
  { id: 'work-arabesque', title: 'Arabesque No. 1', composer: 'Claude Debussy', metadata: { year: 1891, genre: 'Impressionist' } },
]

export const arrangements: Arrangement[] = [
  { id: 'arr-river-original', workId: 'work-river', name: 'Original solo arrangement', difficulty: 'Intermediate', source: 'curated', targetTempoBpm: 92 },
  { id: 'arr-gymnopedie-urtext', workId: 'work-gymnopedie', name: 'Urtext edition', difficulty: 'Intermediate', source: 'curated', targetTempoBpm: 76 },
  { id: 'arr-canon-fantasy', workId: 'work-canon-fantasy', name: 'Concert arrangement', difficulty: 'Advanced', source: 'user-imported', targetTempoBpm: 112 },
  { id: 'arr-clair-urtext', workId: 'work-clair', name: 'Urtext edition', difficulty: 'Advanced', source: 'curated', targetTempoBpm: 68 },
  { id: 'arr-arabesque-urtext', workId: 'work-arabesque', name: 'Urtext edition', difficulty: 'Advanced', source: 'curated', targetTempoBpm: 104 },
]

export const progress: ArrangementProgress[] = [
  { arrangementId: 'arr-river-original', status: 'Practicing', mastery: 83, cleanTempoBpm: 86, latestPerformanceScore: 87.4, bestPerformanceScore: 91.2, recentChange: 3.8, lastPracticedAt: '2026-08-19T18:30:00Z' },
  { arrangementId: 'arr-gymnopedie-urtext', status: 'Performance Ready', mastery: 91, cleanTempoBpm: 72, latestPerformanceScore: 93.1, bestPerformanceScore: 94.8, recentChange: 1.4, lastPracticedAt: '2026-08-18T17:10:00Z' },
  { arrangementId: 'arr-canon-fantasy', status: 'Learning', mastery: 62, cleanTempoBpm: 84, latestPerformanceScore: 74.6, bestPerformanceScore: 78.3, recentChange: 4.6, lastPracticedAt: '2026-08-17T20:15:00Z' },
  { arrangementId: 'arr-clair-urtext', status: 'Learning', mastery: 47, cleanTempoBpm: 48, latestPerformanceScore: 66.2, bestPerformanceScore: 68.9, recentChange: 2.1, lastPracticedAt: '2026-08-14T17:40:00Z' },
  { arrangementId: 'arr-arabesque-urtext', status: 'Practicing', mastery: 76, cleanTempoBpm: 88, latestPerformanceScore: 82.5, bestPerformanceScore: 85.1, recentChange: 1.8, lastPracticedAt: '2026-08-12T19:20:00Z' },
]

export const repertoire: RepertoireItem[] = arrangements.map((arrangement) => {
  const work = works.find((candidate) => candidate.id === arrangement.workId)
  const itemProgress = progress.find((candidate) => candidate.arrangementId === arrangement.id)
  if (!work || !itemProgress) throw new Error(`Incomplete mock repertoire item: ${arrangement.id}`)
  return { work, arrangement, progress: itemProgress }
})

export const skillRatings: SkillRating[] = [
  { name: 'Sight Reading', rating: 54, recentChange: 2, latestSessionAt: 'Yesterday' },
  { name: 'Rhythm', rating: 79, recentChange: 3, latestSessionAt: 'Today' },
  { name: 'Dynamics', rating: 68, recentChange: 1, latestSessionAt: '3 days ago' },
  { name: 'Chord Fluency', rating: 73, recentChange: 4, latestSessionAt: 'Yesterday' },
  { name: 'Scales', rating: 61, recentChange: 2, latestSessionAt: '2 days ago' },
  { name: 'Arpeggios', rating: 58, recentChange: 1, latestSessionAt: '5 days ago' },
  { name: 'Octaves', rating: 49, recentChange: 3, latestSessionAt: '1 week ago' },
  { name: 'Tempo Control', rating: 81, recentChange: 2, latestSessionAt: 'Today' },
  { name: 'Keyboard Jumps', rating: 64, recentChange: 5, latestSessionAt: '4 days ago' },
]

export const riverMetrics: PerformanceMetrics = {
  noteAccuracy: 94,
  rhythm: 86,
  tempo: 91,
  dynamics: 74,
  articulation: 83,
}

export const performanceHistory = [
  { date: 'Jul 22', score: 76.8 },
  { date: 'Jul 29', score: 80.2 },
  { date: 'Aug 05', score: 82.9 },
  { date: 'Aug 12', score: 87.4 },
  { date: 'Aug 19', score: 91.2 },
]

export const riverSections = [
  { label: 'Measures 1–8', score: 96 },
  { label: 'Measures 9–16', score: 92 },
  { label: 'Measures 17–24', score: 68 },
  { label: 'Measures 25–32', score: 87 },
  { label: 'Measures 33–40', score: 81 },
]

export const weeklyPractice = [
  { day: 'M', minutes: 34 },
  { day: 'T', minutes: 48 },
  { day: 'W', minutes: 26 },
  { day: 'T', minutes: 57 },
  { day: 'F', minutes: 42 },
  { day: 'S', minutes: 64 },
  { day: 'S', minutes: 38 },
]
