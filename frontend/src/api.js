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
  return res.json()
}

export async function refreshStats(youtubeVideoId) {
  const res = await fetch(`/api/videos/${youtubeVideoId}/refresh`, { method: 'POST' })
  return res.json()
}