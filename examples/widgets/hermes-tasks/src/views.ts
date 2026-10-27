export type View = 'today' | 'upcoming' | 'inbox' | 'all'

export const VIEWS: readonly { id: View; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'inbox', label: 'Inbox' },
  { id: 'all', label: 'All' },
]
