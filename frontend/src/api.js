const BASE = '/api'

export async function startPipeline(niche) {
  const res = await fetch(`${BASE}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ niche })
  })
  return res.json()
}

export async function getStatus(jobId) {
  const res = await fetch(`${BASE}/status/${jobId}`)
  return res.json()
}

export async function submitApproval(jobId, action, reason = '') {
  const res = await fetch(`${BASE}/approve/${jobId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, reason })
  })
  return res.json()
}

export async function getVideos() {
  const res = await fetch('/api/videos')
  if (!res.ok) throw new Error(`Failed to fetch videos: ${res.status}`)
  return res.json()
}

export async function refreshStats(youtubeVideoId) {
  const res = await fetch(`/api/videos/${youtubeVideoId}/refresh`, { method: 'POST' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Unknown error" }))
    throw new Error(err.detail || "Failed to refresh stats")
  }
  return res.json()
}