import { ArrowRight, Clock3, Flame, Music, Play, Sparkles, Timer, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Change, PageHeader, ProgressBar, ScoreRing, SectionHeading, Stat, StatusPill } from '../components/ui'
import { repertoire, skillRatings, weeklyPractice } from '../data/mockData'

const featured = repertoire.slice(0, 3)

export function HomePage() {
  return (
    <div className="page home-page">
      <PageHeader eyebrow="Thursday, 20 August" title="Your playing is moving forward." description="Two personal bests this week. Keep the momentum focused." action={<div className="header-streak"><Flame size={17} /><strong>14</strong><span>week streak</span></div>} />

      <section className="hero-grid reveal delay-1">
        <div className="panel continue-panel">
          <SectionHeading title="Continue practicing" subtitle="Pick up exactly where you left off" action={<Link className="text-link" to="/repertoire">All repertoire <ArrowRight size={15} /></Link>} />
          <div className="continue-list">
            {featured.map(({ work, arrangement, progress }, index) => (
              <Link to={index === 0 ? `/repertoire/${arrangement.id}` : '/repertoire'} className="continue-item" key={arrangement.id}>
                <div className={`artwork artwork-${index + 1}`}><span>{work.title.split(' ').slice(0, 2).map((word) => word[0]).join('')}</span><i /></div>
                <div className="piece-copy"><strong>{work.title}</strong><span>{work.composer} · {arrangement.name}</span><div className="piece-progress"><ProgressBar value={progress.mastery} /><small>{progress.mastery}% mastery</small></div></div>
                <div className="tempo-copy"><span>Clean tempo</span><strong>{progress.cleanTempoBpm}<small> / {arrangement.targetTempoBpm} BPM</small></strong></div>
                <div className="recent-score"><span>Recent</span><strong>{progress.latestPerformanceScore}</strong></div>
                <span className="play-circle"><Play size={17} fill="currentColor" /></span>
              </Link>
            ))}
          </div>
        </div>

        <div className="panel weekly-panel">
          <SectionHeading title="Weekly progress" subtitle="Aug 17–23" />
          <div className="weekly-bars" aria-label="Daily practice minutes">
            {weeklyPractice.map((entry, index) => <div className="day-bar" key={`${entry.day}-${index}`}><span className="bar-value">{entry.minutes}</span><i style={{ height: `${Math.max(20, entry.minutes / 64 * 100)}%` }} /><small>{entry.day}</small></div>)}
          </div>
          <div className="weekly-stats">
            <Stat icon={Clock3} label="Practice" value="5h 09m" detail="+42m vs last week" />
            <Stat icon={Music} label="Notes played" value="18.4k" detail="+12.6%" />
            <Stat icon={TrendingUp} label="Avg. change" value="+2.8" detail="Across 9 attempts" />
          </div>
        </div>
      </section>

      <section className="dashboard-grid reveal delay-2">
        <div>
          <SectionHeading title="Recent improvements" subtitle="Your most meaningful gains" />
          <div className="improvement-grid">
            <article className="improvement-card record">
              <div className="improvement-top"><StatusPill tone="positive"><Sparkles size={12} /> New personal best</StatusPill><span>Today</span></div>
              <div><span>River Flows in You</span><strong>87.4 <ArrowRight /> 91.2</strong></div>
              <Change value={3.8} />
            </article>
            <article className="improvement-card">
              <div className="improvement-top"><StatusPill tone="violet"><Timer size={12} /> Clean tempo</StatusPill><span>Yesterday</span></div>
              <div><span>Canon Fantasy</span><strong>92 <ArrowRight /> 98 <small>BPM</small></strong></div>
              <Change value={6} suffix=" BPM" />
            </article>
            <article className="improvement-card">
              <div className="improvement-top"><StatusPill><TrendingUp size={12} /> Weak section</StatusPill><span>3 days ago</span></div>
              <div><span>Measures 38–46</span><strong>64 <ArrowRight /> 78</strong></div>
              <Change value={14} />
            </article>
          </div>
        </div>

        <div className="panel skills-snapshot">
          <SectionHeading title="Skill snapshot" subtitle="Transferable technique profile" action={<Link className="text-link" to="/technique">Open lab <ArrowRight size={15} /></Link>} />
          <div className="skill-feature">
            <ScoreRing value={81} label="Tempo control" size="small" />
            <div><strong>Strongest skill</strong><p>Your tempo control has improved in 4 consecutive sessions.</p></div>
          </div>
          <div className="skill-bars">
            {skillRatings.slice(0, 6).map((skill) => <div className="skill-bar-row" key={skill.name}><span>{skill.name}</span><ProgressBar value={skill.rating} tone={skill.rating > 75 ? 'mint' : 'violet'} /><strong>{skill.rating}</strong></div>)}
          </div>
        </div>
      </section>
    </div>
  )
}
