import { ArrowLeft, Music2 } from 'lucide-react'
import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return <div className="not-found"><Music2/><span>404</span><h1>That page missed the beat.</h1><p>The route does not exist in this workspace.</p><Link to="/"><ArrowLeft size={16}/> Return home</Link></div>
}
