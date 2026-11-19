import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownToLine, ArrowUpFromLine, CalendarDays, Check, CheckCheck, ChevronDown,
  Clipboard, Clock3, FileText, LayoutGrid, ListFilter, Search, Trash2, Users, X,
} from 'lucide-react'
import { members, sections } from './seed'
import {
  deleteSharedMeeting, fetchSharedStore, replaceSharedMeeting, saveSharedMeeting,
  sharedStorageEnabled, type Attendance, type Meeting, type Store,
} from './sharedAttendance'
type View = 'register' | 'matrix'

const STORAGE_KEY = 'medenza-27-attendance-v1'
const today = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const dateLabel = (iso: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', options)
const readStore = (): Store => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { version: 1, meetings: [] }
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' && parsed !== null && 'meetings' in parsed &&
      Array.isArray(parsed.meetings) &&
      parsed.meetings.every((meeting) =>
        typeof meeting === 'object' && meeting !== null &&
        typeof meeting.date === 'string' && typeof meeting.title === 'string' &&
        typeof meeting.attendance === 'object' && meeting.attendance !== null,
      )
    ) return { version: 1, meetings: parsed.meetings as Meeting[] }
  } catch (error) {
    console.error('Unable to read saved attendance data.', error)
  }
  return { version: 1, meetings: [] }
}
const countFor = (meeting: Meeting | undefined) => {
  const values = Object.values(meeting?.attendance ?? {})
  const present = values.filter((value) => value === 'present').length
  const absent = values.filter((value) => value === 'absent').length
  return { present, absent, marked: present + absent, percent: Math.round((present / members.length) * 100) }
}

export default function App() {
  const [store, setStore] = useState<Store>(readStore)
  const [activeDate, setActiveDate] = useState(today)
  const [newDate, setNewDate] = useState(today)
  const [titleInput, setTitleInput] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All teams')
  const [view, setView] = useState<View>('register')
  const [notice, setNotice] = useState('')
  const [syncStatus, setSyncStatus] = useState<'local' | 'connecting' | 'connected' | 'error'>(
    sharedStorageEnabled ? 'connecting' : 'local',
  )
  const importRef = useRef<HTMLInputElement>(null)
  const pendingWrites = useRef(0)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
    } catch (error) {
      console.error('Unable to save attendance data.', error)
      setNotice('Could not save to this browser. Export a backup to protect your data.')
    }
  }, [store])

  useEffect(() => {
    if (!sharedStorageEnabled) return
    let cancelled = false
    const refresh = async (initial: boolean) => {
      try {
        const remote = await fetchSharedStore()
        if (cancelled) return
        if (initial && remote.meetings.length === 0 && store.meetings.length > 0) {
          await Promise.all(store.meetings.map(saveSharedMeeting))
        } else if (pendingWrites.current === 0) {
          setStore((current) =>
            JSON.stringify(current.meetings) === JSON.stringify(remote.meetings) ? current : remote,
          )
        }
        setSyncStatus('connected')
      } catch (error) {
        console.error('Unable to sync shared attendance.', error)
        if (!cancelled) setSyncStatus('error')
      }
    }
    void refresh(true)
    const timer = window.setInterval(() => void refresh(false), 5000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  const persistSharedMeeting = (item: Meeting) => {
    if (!sharedStorageEnabled) return
    pendingWrites.current += 1
    void saveSharedMeeting(item).then(() => {
      setSyncStatus('connected')
    }).catch((error: unknown) => {
      console.error('Unable to save shared attendance.', error)
      setSyncStatus('error')
      setNotice('Shared save failed. Check your connection and try again.')
    }).finally(() => {
      pendingWrites.current -= 1
    })
  }

  const meetings = useMemo(() => [...store.meetings].sort((a, b) => b.date.localeCompare(a.date)), [store.meetings])
  const meeting = store.meetings.find((item) => item.date === activeDate)
  const counts = countFor(meeting)
  const activeAttendance = meeting?.attendance ?? {}
  const filteredMembers = useMemo(() => members.filter((member) => {
    const query = search.trim().toLowerCase()
    const matchesText = !query || `${member.name} ${member.role} ${member.section}`.toLowerCase().includes(query)
    return matchesText && (filter === 'All teams' || member.section === filter)
  }), [filter, search])
  const absentees = members.filter((member) => activeAttendance[member.id] === 'absent')

  const updateMeeting = (date: string, update: (current: Meeting) => Meeting) => {
    const existing = store.meetings.find((item) => item.date === date)
    const base = existing ?? { date, title: '', attendance: {} }
    const changed = update(base)
    setStore((current) => {
      const hasDate = current.meetings.some((item) => item.date === date)
      const meetingsNext = hasDate
        ? current.meetings.map((item) => item.date === date ? changed : item)
        : [...current.meetings, changed]
      return { ...current, meetings: meetingsNext }
    })
    persistSharedMeeting(changed)
  }

  const openDate = (date: string) => {
    setActiveDate(date)
    setNewDate(date)
    setTitleInput(store.meetings.find((item) => item.date === date)?.title ?? '')
  }

  const createOrOpenDate = () => {
    const date = newDate
    updateMeeting(date, (current) => ({ ...current, title: titleInput.trim() }))
    setActiveDate(date)
  }

  const mark = (id: string, status: Attendance) =>
    updateMeeting(activeDate, (current) => ({
      ...current,
      title: titleInput.trim(),
      attendance: { ...current.attendance, [id]: status },
    }))

  const saveAttendance = () => {
    updateMeeting(activeDate, (current) => ({ ...current, title: titleInput.trim() }))
    setNotice(sharedStorageEnabled ? 'Attendance saved to the shared register.' : 'Attendance saved on this device.')
    window.setTimeout(() => setNotice(''), 2600)
  }

  const markAllPresent = () => {
    updateMeeting(activeDate, (current) => ({
      ...current,
      title: titleInput.trim(),
      attendance: Object.fromEntries(members.map((member) => [member.id, 'present'])),
    }))
  }

  const copyAbsentees = async () => {
    const text = `Absentees — ${dateLabel(activeDate)}${meeting?.title ? ` · ${meeting.title}` : ''}\n${
      absentees.length ? absentees.map((member) => `• ${member.name} — ${member.role}`).join('\n') : 'No absentees marked.'
    }`
    try {
      await navigator.clipboard.writeText(text)
      setNotice('Absentees list copied.')
    } catch (error) {
      console.error('Unable to copy absentees list.', error)
      setNotice('Copy failed. Please check clipboard permission.')
    }
    window.setTimeout(() => setNotice(''), 2600)
  }

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), meetings: store.meetings }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'medenza-27-attendance-backup.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  const importBackup = async (file?: File) => {
    if (!file) return
    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (
        typeof parsed !== 'object' || parsed === null || !('meetings' in parsed) ||
        !Array.isArray(parsed.meetings) ||
        !parsed.meetings.every((item) => typeof item === 'object' && item !== null &&
          typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date) &&
          typeof item.title === 'string' && typeof item.attendance === 'object' && item.attendance !== null &&
          Object.entries(item.attendance).every(([id, status]) =>
            members.some((member) => member.id === id) && (status === 'present' || status === 'absent'),
          ))
      ) throw new Error('The selected file is not a valid MEDENZA attendance backup.')
      const imported = parsed.meetings as Meeting[]
      const merged = new Map(store.meetings.map((item) => [item.date, item]))
      imported.forEach((item) => merged.set(item.date, item))
      setStore({ version: 1, meetings: [...merged.values()] })
      if (sharedStorageEnabled) {
        await Promise.all(imported.map(replaceSharedMeeting))
        if (imported.length) setSyncStatus('connected')
      }
      if (imported.length) openDate(imported[0].date)
      setNotice(`Imported ${imported.length} meeting${imported.length === 1 ? '' : 's'}.`)
    } catch (error) {
      console.error('Unable to import attendance backup.', error)
      setNotice(error instanceof Error ? error.message : 'Could not import this backup file.')
    }
    if (importRef.current) importRef.current.value = ''
    window.setTimeout(() => setNotice(''), 4000)
  }

  const deleteMeeting = (date: string) => {
    if (!window.confirm(`Delete the meeting on ${dateLabel(date)} and its attendance? This cannot be undone.`)) return
    setStore((current) => ({ ...current, meetings: current.meetings.filter((item) => item.date !== date) }))
    if (sharedStorageEnabled) {
      void deleteSharedMeeting(date).then(() => setSyncStatus('connected')).catch((error: unknown) => {
        console.error('Unable to delete shared meeting.', error)
        setSyncStatus('error')
        setNotice('Could not delete the meeting from shared storage.')
      })
    }
    if (activeDate === date) {
      setActiveDate(today())
      setNewDate(today())
      setTitleInput('')
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">M<span>27</span></div>
          <div>
            <div className="brand-name">MEDENZA <span>'27</span></div>
            <div className="brand-sub">SIMATS Engineering <i /> Department of Nanobiomaterials</div>
          </div>
        </div>
        <div className="top-actions">
          <button className="subtle-button" onClick={exportBackup}><ArrowDownToLine size={16} /> <span>Export backup</span></button>
          <button className="subtle-button" onClick={() => importRef.current?.click()}><ArrowUpFromLine size={16} /> <span>Import</span></button>
          <input ref={importRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => void importBackup(event.target.files?.[0])} />
        </div>
      </header>

      <section className="welcome">
        <div>
          <div className="eyebrow"><span className="live-dot" /> TEAM ATTENDANCE</div>
          <h1>Attendance <span>Register</span></h1>
          <p>One place to keep your team in sync.</p>
        </div>
        <div className="roster-chip"><Users size={16} /><strong>{members.length}</strong><span>team members</span></div>
      </section>

      <section className="card meeting-card">
        <div className="card-heading">
          <div className="section-title"><span className="icon-tile blue"><CalendarDays size={18} /></span><div><h2>Meeting date</h2><p>Create a session or open a saved one</p></div></div>
          <span className={`saved-count sync-${syncStatus}`}>{syncStatus === 'local' ? 'This device only' : syncStatus === 'connecting' ? 'Connecting…' : syncStatus === 'error' ? 'Sync issue' : 'Shared · live'}{syncStatus !== 'local' && <i />}</span>
        </div>
        <div className="meeting-controls">
          <label className="field date-field"><span>New / select meeting date</span><input type="date" value={newDate} onChange={(event) => setNewDate(event.target.value)} /></label>
          <label className="field title-field"><span>Meeting title <em>optional</em></span><input type="text" maxLength={70} placeholder="e.g. Core Sync" value={titleInput} onChange={(event) => setTitleInput(event.target.value)} onBlur={() => meeting && updateMeeting(activeDate, (item) => ({ ...item, title: titleInput.trim() }))} /></label>
          <button className="primary-button open-button" onClick={createOrOpenDate}>{meeting?.date === newDate ? 'Open meeting' : 'Create meeting'} <ChevronDown size={16} /></button>
        </div>
        {meetings.length > 0 && <div className="meeting-chips" aria-label="Saved meeting dates">{meetings.map((item) => (
          <button key={item.date} className={`meeting-chip ${item.date === activeDate ? 'selected' : ''}`} onClick={() => openDate(item.date)}>
            <span className="chip-date">{dateLabel(item.date, { day: 'numeric', month: 'short' })}</span>{item.title && <span className="chip-title">{item.title}</span>}
          </button>
        ))}</div>}
      </section>

      <section className="stats-grid" aria-label="Attendance summary">
        <Stat label="Total members" value={members.length} icon={<Users size={17} />} tone="blue" />
        <Stat label="Present" value={counts.present} icon={<Check size={17} />} tone="green" />
        <Stat label="Absent" value={counts.absent} icon={<X size={17} />} tone="red" />
        <Stat label="Attendance" value={`${counts.percent}%`} icon={<Clock3 size={17} />} tone="silver" />
      </section>

      <section className="card register-card">
        <div className="register-header">
          <div className="section-title"><span className="icon-tile blue"><Users size={18} /></span><div><h2>Team register</h2><p>{dateLabel(activeDate)}{meeting?.title ? ` · ${meeting.title}` : ''}</p></div></div>
          <div className="register-actions">
            <button className="outline-button" onClick={markAllPresent}><CheckCheck size={16} /> Mark all present</button>
            <button className="primary-button" onClick={saveAttendance}><Check size={16} /> Save attendance</button>
          </div>
        </div>
        <div className="toolbar">
          <label className="searchbox"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, role or event" /><span className="search-count">{filteredMembers.length}</span></label>
          <div className="filter-wrap"><ListFilter size={15} /><select aria-label="Filter by team section" value={filter} onChange={(event) => setFilter(event.target.value)}><option>All teams</option>{sections.map((section) => <option key={section}>{section}</option>)}</select></div>
        </div>
        <div className="team-list">
          {sections.map((section, index) => {
            const group = filteredMembers.filter((member) => member.section === section)
            if (!group.length) return null
            return <div className="team-section" key={section}>
              <div className="team-heading"><span className="section-number">0{index + 1}</span><h3>{section}</h3><span className="group-count">{group.length}</span><span className="team-line" /></div>
              {group.map((member) => {
                const status = activeAttendance[member.id]
                const historyCount = store.meetings.filter((item) => item.attendance[member.id] === 'present').length
                const markedCount = store.meetings.filter((item) => item.attendance[member.id]).length
                const percent = markedCount ? Math.round((historyCount / markedCount) * 100) : 0
                return <article className={`member-row ${status ? `is-${status}` : ''}`} key={member.id}>
                  <div className="member-avatar">{member.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').replace('.', '')}</div>
                  <div className="member-info"><strong>{member.name}</strong><span>{member.role}</span></div>
                  <div className="member-history"><strong>{historyCount}<span>/{markedCount}</span></strong><span>{markedCount ? `meetings · ${percent}%` : 'no history yet'}</span></div>
                  <div className="attendance-controls">
                    <button aria-pressed={status === 'present'} aria-label={`Mark ${member.name} present`} className={`attendance-button present ${status === 'present' ? 'active' : ''}`} onClick={() => mark(member.id, 'present')}><Check size={15} /> <span>Present</span></button>
                    <button aria-pressed={status === 'absent'} aria-label={`Mark ${member.name} absent`} className={`attendance-button absent ${status === 'absent' ? 'active' : ''}`} onClick={() => mark(member.id, 'absent')}><X size={15} /> <span>Absent</span></button>
                  </div>
                </article>
              })}
            </div>
          })}
          {filteredMembers.length === 0 && <div className="empty-search">No team members match that search.</div>}
        </div>
      </section>

      <section className="card absentees-card">
        <div className="absentees-top">
          <div className="section-title"><span className="icon-tile red"><FileText size={18} /></span><div><h2>Absentees <span className="muted-heading">on {dateLabel(activeDate)}</span></h2><p>{absentees.length ? `${absentees.length} ${absentees.length === 1 ? 'person' : 'people'} marked absent` : 'No one marked absent for this date'}</p></div></div>
          <button className="outline-button copy-button" onClick={() => void copyAbsentees()}><Clipboard size={15} /> Copy list</button>
        </div>
        {absentees.length > 0 && <div className="absentee-list">{absentees.map((member) => <div className="absentee-item" key={member.id}><span>{member.name}</span><span>{member.role}</span></div>)}</div>}
      </section>

      <section className="card history-card">
        <div className="history-top">
          <div className="section-title"><span className="icon-tile blue"><Clock3 size={18} /></span><div><h2>Meeting history</h2><p>Your saved sessions and full-team report</p></div></div>
          <div className="view-switch" role="tablist" aria-label="History view">
            <button role="tab" aria-selected={view === 'register'} className={view === 'register' ? 'active' : ''} onClick={() => setView('register')}><CalendarDays size={15} /> Dates</button>
            <button role="tab" aria-selected={view === 'matrix'} className={view === 'matrix' ? 'active' : ''} onClick={() => setView('matrix')}><LayoutGrid size={15} /> Matrix</button>
          </div>
        </div>
        {view === 'register' ? (
          meetings.length ? <div className="history-list">{meetings.map((item) => {
            const summary = countFor(item)
            return <div className="history-row" key={item.date}>
              <div className="history-date"><strong>{dateLabel(item.date)}</strong><span>{item.title || 'Team meeting'}</span></div>
              <div className="history-stat"><strong>{summary.present}</strong><span>present</span></div>
              <div className="history-stat"><strong>{summary.absent}</strong><span>absent</span></div>
              <div className="history-stat percent"><strong>{summary.percent}%</strong><span>attendance</span></div>
              <div className="history-buttons"><button className="text-button" onClick={() => { openDate(item.date); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Open / edit</button><button className="icon-button danger" title={`Delete ${dateLabel(item.date)}`} aria-label={`Delete ${dateLabel(item.date)}`} onClick={() => deleteMeeting(item.date)}><Trash2 size={16} /></button></div>
            </div>
          })}</div> : <div className="empty-state"><CalendarDays size={22} /><span>No saved meetings yet. Select a date above to get started.</span></div>
        ) : (
          <div className="matrix-wrap">
            {meetings.length ? <table className="matrix-table"><thead><tr><th className="sticky-name">Team member</th>{meetings.map((item) => <th key={item.date}>{dateLabel(item.date, { day: 'numeric', month: 'short' })}</th>)}<th>Total present</th><th>Overall</th></tr></thead><tbody>{members.map((member) => {
              const attended = meetings.filter((item) => item.attendance[member.id] === 'present').length
              const marked = meetings.filter((item) => item.attendance[member.id]).length
              return <tr key={member.id}><td className="sticky-name"><strong>{member.name}</strong><span>{member.section}</span></td>{meetings.map((item) => {
                const attendance = item.attendance[member.id]
                return <td key={item.date}>{attendance ? <span className={`matrix-mark ${attendance}`}>{attendance === 'present' ? 'P' : 'A'}</span> : <span className="unmarked">—</span>}</td>
              })}<td>{attended}/{marked}</td><td>{marked ? `${Math.round((attended / marked) * 100)}%` : '—'}</td></tr>
            })}</tbody></table> : <div className="empty-state"><LayoutGrid size={22} /><span>Save a meeting to start building your attendance matrix.</span></div>}
          </div>
        )}
      </section>

      <footer className="footer"><span>MEDENZA '27</span><i /> Department of Nanobiomaterials <i /> SIMATS Engineering</footer>
      {notice && <div role="status" className="toast"><Check size={16} />{notice}<button onClick={() => setNotice('')} aria-label="Dismiss notification"><X size={14} /></button></div>}
    </main>
  )
}

function Stat({ label, value, icon, tone }: { label: string; value: string | number; icon: React.ReactNode; tone: string }) {
  return <article className="card stat-card"><div className={`stat-icon ${tone}`}>{icon}</div><div className="stat-copy"><span>{label}</span><strong>{value}</strong></div></article>
}
