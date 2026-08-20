import { Activity, ArrowUpRight, CalendarRange, Clock3, Gauge, Music2, Target, TrendingUp } from 'lucide-react'
import { Change, PageHeader, ProgressBar, ScoreRing, SectionHeading, Stat, StatusPill } from '../components/ui'
import { repertoire, skillRatings, weeklyPractice } from '../data/mockData'

export function ProgressPage() {
  return (
    <div className="page">
      <PageHeader eyebrow="Long-term view" title="Progress" description="Patterns across your repertoire, practice habits and transferable skills." action={<button className="filter-select"><CalendarRange size={16} /> Last 30 days</button>} />
      <div className="progress-stat-grid reveal delay-1">
        <div className="panel progress-primary"><div><span>Practice time</span><strong>18h 24m</strong><Change value={12.6} suffix="%" /></div><div className="spark-bars">{weeklyPractice.concat(weeklyPractice.slice(0, 5)).map((entry, index) => <i key={index} style={{ height: `${entry.minutes}%` }} />)}</div></div>
        <Stat icon={Music2} label="Performances" value="42" detail="9 this week" />
        <Stat icon={TrendingUp} label="Average score" value="84.7" detail="+3.2 this month" />
        <Stat icon={Gauge} label="Tempo gains" value="+7 BPM" detail="Median clean tempo" />
      </div>
      <section className="progress-content-grid reveal delay-2">
        <div className="panel mastery-overview">
          <SectionHeading title="Repertoire mastery" subtitle="Arrangement-specific, not global to each work" />
          <div className="mastery-total"><ScoreRing value={72} label="Average" /><div><strong>3 arrangements improving</strong><p>Consistent gains across your most-practiced repertoire.</p><StatusPill tone="positive"><ArrowUpRight size={12} /> +5.4 this month</StatusPill></div></div>
          <div className="mastery-list">{repertoire.map(({ work, progress }) => <div key={work.id}><span>{work.title}<small>{progress.status}</small></span><ProgressBar value={progress.mastery} tone={progress.mastery < 60 ? 'amber' : 'mint'} /><strong>{progress.mastery}%</strong></div>)}</div>
        </div>
        <div className="panel consistency-panel">
          <SectionHeading title="Practice consistency" subtitle="Minutes per day · last 4 weeks" />
          <div className="heatmap" aria-label="Practice consistency heatmap">{Array.from({ length: 28 }, (_, index) => <i key={index} className={`level-${[0,2,3,1,4,2,0,3,2,4,3,1,0,2,4,4,2,3,1,0,3,4,2,3,4,1,0,2][index]}`} />)}</div>
          <div className="heatmap-legend"><span>Less</span><i className="level-1"/><i className="level-2"/><i className="level-3"/><i className="level-4"/><span>More</span></div>
          <div className="consistency-stats"><Stat icon={Activity} label="Active days" value="21 / 28" /><Stat icon={Clock3} label="Longest session" value="72 min" /><Stat icon={Target} label="Goal completion" value="86%" /></div>
        </div>
      </section>
      <section className="panel skill-trends reveal delay-3"><SectionHeading title="Skill ratings" subtitle="Mock profile foundation for future Technique Lab measurements" /><div className="skill-trend-grid">{skillRatings.slice(0, 6).map((skill) => <div key={skill.name}><span>{skill.name}</span><strong>{skill.rating}</strong><ProgressBar value={skill.rating} tone="violet"/><Change value={skill.recentChange}/></div>)}</div></section>
    </div>
  )
}
