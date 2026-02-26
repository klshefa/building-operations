import { NextResponse } from 'next/server'

const VC_API = 'https://api.veracross.com/shefa/v3'
const VC_TOKEN_URL = 'https://accounts.veracross.com/shefa/oauth/token'

async function getToken(scope: string): Promise<string> {
  const res = await fetch(VC_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.VERACROSS_CLIENT_ID!,
      client_secret: process.env.VERACROSS_CLIENT_SECRET!,
      scope,
    }),
  })
  if (!res.ok) throw new Error(`Token error: ${res.status}`)
  return (await res.json()).access_token
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const roomId = parseInt(searchParams.get('roomId') || '155')

  const results: any = { roomId, classSchedules: [], reservations: [] }

  // Search class schedules (ALL pages) for this room
  try {
    const token = await getToken('academics.class_schedules:list')
    let page = 1
    while (page <= 20) {
      const res = await fetch(`${VC_API}/academics/class_schedules`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'X-Page-Size': '1000',
          'X-Page-Number': String(page),
        },
      })
      if (!res.ok) { results.csError = `Page ${page}: ${res.status}`; break }
      const data = await res.json()
      const items = data.data || data || []
      for (const sched of items) {
        if (sched.room?.id === roomId) {
          results.classSchedules.push(sched)
        }
      }
      if (items.length < 1000) break
      page++
    }
    results.csPagesScanned = page
  } catch (err: any) {
    results.csError = err?.message
  }

  // Search reservations for this resource (no date filter - find ALL)
  try {
    const token = await getToken('resource_reservations.reservations:list')
    let page = 1
    while (page <= 10) {
      const res = await fetch(`${VC_API}/resource_reservations/reservations`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'X-Page-Size': '200',
          'X-Page-Number': String(page),
        },
      })
      if (!res.ok) { results.resError = `Page ${page}: ${res.status}`; break }
      const data = await res.json()
      const items = data.data || data || []
      for (const r of items) {
        const resId = r.resource_id ?? r.resource?.id
        if (resId === roomId) {
          results.reservations.push(r)
        }
      }
      if (items.length < 200) break
      page++
    }
    results.resPagesScanned = page
  } catch (err: any) {
    results.resError = err?.message
  }

  return NextResponse.json(results)
}
