import { REPERTOIRE_STATUSES } from '../../domain/music'
import type { RepertoireListItem } from '../persistence/types'

export type RepertoireSort = 'recently-practiced' | 'date-added' | 'title' | 'status'

function stableIdentity(left: RepertoireListItem, right: RepertoireListItem): number {
  return left.work.title.localeCompare(right.work.title) || left.arrangement.name.localeCompare(right.arrangement.name) || left.arrangement.id.localeCompare(right.arrangement.id)
}

export function sortRepertoireItems(items: readonly RepertoireListItem[], sort: RepertoireSort): readonly RepertoireListItem[] {
  return [...items].sort((left, right) => {
    if (sort === 'recently-practiced') {
      const leftDate = left.lastPracticedAt ?? left.repertoire.addedAt
      const rightDate = right.lastPracticedAt ?? right.repertoire.addedAt
      return rightDate.localeCompare(leftDate) || stableIdentity(left, right)
    }
    if (sort === 'date-added') return right.repertoire.addedAt.localeCompare(left.repertoire.addedAt) || stableIdentity(left, right)
    if (sort === 'status') return REPERTOIRE_STATUSES.indexOf(left.repertoire.status) - REPERTOIRE_STATUSES.indexOf(right.repertoire.status) || stableIdentity(left, right)
    return stableIdentity(left, right)
  })
}
