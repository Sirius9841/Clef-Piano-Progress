import { ArrowLeft, CalendarDays, ChevronRight, Clock3, Flag, History, Play, Target, TrendingUp } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Button, PageHeader, ProgressBar, ScoreRing, SectionHeading, Stat, StatusPill } from '../components/ui'
import { performanceHistory, repertoire, riverMetrics, riverSections } from '../data/mockData'

const metricLabels = { noteAccuracy: 'Note accuracy', rhythm: 'Rhythm', tempo: 'Tempo', dynamics: 'Dynamics', articulation: 'Articulation' }

export function PieceDetailPage() {
  const { arrangementId } = useParams()
  const item = repertoire.find((candidate) => candidate.arrangement.id === arrangementId) ?? repertoire[0]
  if (!item) return null
  const { work, arrangement, progress } = item

  return (
    <div className="page piece-page">
      <Link to="/repertoire" className="back-link"><ArrowLeft size={15} /> Repertoire</Link>
      <PageHeader eyebrow={`${arrangement.difficulty} · ${progress.status}`} title={work.title} description={`${work.composer} · ${arrangement.name}`} action={<Link to={`/practice/${arrangement.id}`}><Button icon={Play}>Start practice</Button></Link>} />
      <section className="piece-hero reveal delay-1">
        <div className="piece-cover artwork-1"><span>RF</span><i /><div className="cover-caption"><small>ARRANGEMENT</small><strong>Original Solo</strong></div></div>
        <div className="piece-score-panel panel">
          <ScoreRing value={progress.mastery} label="Mastery" />
          <div className="piece-score-copy"><span>Arrangement mastery</span><strong>{progress.mastery}%</strong><p>Up 6 points over the last 30 days. Mastery reflects consistency, coverage, tempo and recency—not only your best score.</p><ProgressBar value={progress.mastery} /></div>
        </div>
        <div className="piece-stat-grid panel">
          <Stat icon={Target} label="Personal best" value={progress.bestPerformanceScore.toFixed(1)} detail="Today · new record" />
          <Stat icon={History} label="Latest performance" value={progress.latestPerformanceScore.toFixed(1)} detail="Yesterday at 18:30" />
          <Stat icon={Clock3} label="Clean tempo" value={`${progress.cleanTempoBpm} BPM`} detail={`${arrangement.targetTempoBpm} BPM target`} />
          <Stat icon={CalendarDays} label="Time practiced" value="8h 42m" detail="Across 17 sessions" />
        </div>
      </section>

      <section className="piece-detail-grid reveal delay-2">
        <div className="panel metric-panel">
          <SectionHeading title="Latest performance" subtitle="Mock metric summary · grading arrives in a future phase" action={<StatusPill tone="positive"><TrendingUp size={12} /> +3.8</StatusPill>} />
          <div className="metric-overall"><strong>87.4</strong><span>Performance score</span></div>
          <div className="metric-rows">{Object.entries(riverMetrics).map(([key, value]) => <div className="metric-row" key={key}><span>{metricLabels[key as keyof typeof metricLabels]}</span><ProgressBar value={value} tone={value < 80 ? 'amber' : 'mint'} /><strong>{value}</strong></div>)}</div>
          <p className="data-disclaimer">Illustrative Phase 1 data. No score comparison or grading engine is active.</p>
        </div>
        <div className="panel history-panel">
          <SectionHeading title="Performance history" subtitle="Last five mock attempts" />
          <div className="history-chart">
            <div className="chart-grid"><span>100</span><span>80</span><span>60</span></div>
            <svg viewBox="0 0 500 180" preserveAspectRatio="none" role="img" aria-label="Scores improving from 76.8 to 91.2">
              <defs><linearGradient id="historyFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9ce3c1" stopOpacity=".28"/><stop offset="1" stopColor="#9ce3c1" stopOpacity="0"/></linearGradient></defs>
              <path d="M18 134 L132 117 L246 103 L360 75 L482 52 L482 180 L18 180 Z" fill="url(#historyFill)" />
              <path d="M18 134 L132 117 L246 103 L360 75 L482 52" fill="none" stroke="#9ce3c1" strokeWidth="3" vectorEffect="non-scaling-stroke" />
              {[['18','134'],['132','117'],['246','103'],['360','75'],['482','52']].map(([cx, cy]) => <circle key={cx} cx={cx} cy={cy} r="5" fill="#111518" stroke="#9ce3c1" strokeWidth="3" vectorEffect="non-scaling-stroke" />)}
            </svg>
            <div className="chart-labels">{performanceHistory.map((entry) => <span key={entry.date}>{entry.date}<small>{entry.score}</small></span>)}</div>
          </div>
        </div>
      </section>

      <section className="panel sections-panel reveal delay-3">
        <SectionHeading title="Section progress" subtitle="Focused view of mock measure-level outcomes" action={<button className="text-link">View full map <ChevronRight size={15} /></button>} />
        <div className="section-progress-grid">{riverSections.map((section) => {
          const weak = section.score === Math.min(...riverSections.map((candidate) => candidate.score))
          return <article className={weak ? 'weak' : ''} key={section.label}><div>{weak ? <Flag size={17} /> : <span className="section-dot" />}<span>{section.label}</span>{weak && <StatusPill tone="warning">Focus area</StatusPill>}</div><strong>{section.score}</strong><ProgressBar value={section.score} tone={weak ? 'amber' : 'mint'} />{weak && <Link to={`/practice/${arrangement.id}`}>Practice section <ChevronRight size={14} /></Link>}</article>
        })}</div>
      </section>
    </div>
  )
}
