export type Attendance = 'present' | 'absent'
export type Meeting = { date: string; title: string; attendance: Record<string, Attendance> }
export type Store = { version: 1; meetings: Meeting[] }

const projectUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '')
const publicKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const sharedStorageEnabled = Boolean(projectUrl && publicKey)

async function request(path: string, init?: RequestInit) {
  if (!projectUrl || !publicKey) throw new Error('Shared storage is not configured.')
  const response = await fetch(`${projectUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: publicKey,
      Authorization: `Bearer ${publicKey}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Shared storage request failed (${response.status}): ${detail}`)
  }
  return response
}

export async function fetchSharedStore(): Promise<Store> {
  const [meetingResponse, attendanceResponse] = await Promise.all([
    request('meetings?select=date,title&order=date.asc'),
    request('attendance_records?select=meeting_date,member_id,status'),
  ])
  const meetings = await meetingResponse.json() as { date: string; title: string }[]
  const records = await attendanceResponse.json() as { meeting_date: string; member_id: string; status: Attendance }[]
  const byDate = new Map<string, Meeting>(
    meetings.map((meeting) => [meeting.date, { ...meeting, attendance: {} }]),
  )
  records.forEach((record) => {
    const meeting = byDate.get(record.meeting_date)
    if (meeting && (record.status === 'present' || record.status === 'absent')) {
      meeting.attendance[record.member_id] = record.status
    }
  })
  return { version: 1, meetings: [...byDate.values()] }
}

export async function saveSharedMeeting(meeting: Meeting) {
  await request('meetings?on_conflict=date', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ date: meeting.date, title: meeting.title }]),
  })
  const records = Object.entries(meeting.attendance).map(([member_id, status]) => ({
    meeting_date: meeting.date,
    member_id,
    status,
  }))
  if (records.length) {
    await request('attendance_records?on_conflict=meeting_date%2Cmember_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(records),
    })
  }
}

export async function replaceSharedMeeting(meeting: Meeting) {
  await request(`attendance_records?meeting_date=eq.${encodeURIComponent(meeting.date)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  })
  await saveSharedMeeting(meeting)
}

export async function deleteSharedMeeting(date: string) {
  await request(`meetings?date=eq.${encodeURIComponent(date)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  })
}
