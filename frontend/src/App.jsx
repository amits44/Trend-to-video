import { useState, useEffect, useRef } from "react"
import { startPipeline, getStatus, submitApproval, getVideos, refreshStats, deleteVideo } from "./api"

const SCREENS = {
  START: "start",
  RUNNING: "running",
  REVIEW: "review",
  DONE: "done",
  DASHBOARD: "dashboard"
}

export default function App() {
  const [screen, setScreen] = useState(SCREENS.START)
  const [niche, setNiche] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [jobId, setJobId] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [videos, setVideos] = useState([])
  const [loadingStats, setLoadingStats] = useState({})
  const [deletingVideo, setDeletingVideo] = useState(null)
  const [pendingReview, setPendingReview] = useState(null)
  const [showRejectInput, setShowRejectInput] = useState(false)
  const [rejectType, setRejectType] = useState(null)
  const [rejectionReason, setRejectionReason] = useState("")
  const pollRef = useRef(null)

  async function handleStart() {
    if (!niche.trim() || isSubmitting) return
    setIsSubmitting(true)
    setError(null)
    setScreen(SCREENS.RUNNING)
    try {
      await fetch('/api/health').catch(() => {})
      const data = await startPipeline(niche)
      setJobId(data.job_id)
    } catch (e) {
      setError("Failed to start pipeline. Try again.")
      setScreen(SCREENS.START)
    } finally {
      setIsSubmitting(false)
    }
  }

  useEffect(() => {
    if (screen !== SCREENS.RUNNING || !jobId) return
    let failCount = 0
    pollRef.current = setInterval(async () => {
      try {
        const data = await getStatus(jobId)
        failCount = 0
        if (data.status === "awaiting_approval") {
          clearInterval(pollRef.current)
          setPendingReview(data.result)
          setScreen(SCREENS.REVIEW)
        } else if (data.status === "completed") {
          clearInterval(pollRef.current)
          setResult(data.result)
          setScreen(SCREENS.DONE)
        } else if (data.status === "failed") {
          clearInterval(pollRef.current)
          setError(`Pipeline failed: ${data.result?.error}`)
          setScreen(SCREENS.START)
        }
      } catch (e) {
        failCount++
        if (failCount >= 5) {
          clearInterval(pollRef.current)
          setError("Lost connection. The server may be waking up — try again.")
          setScreen(SCREENS.START)
        }
      }
    }, 5000)
    return () => clearInterval(pollRef.current)
  }, [screen, jobId])

  async function handleApprove() {
    await submitApproval(jobId, "approve")
    setScreen(SCREENS.RUNNING)
  }

  async function handleReject(type) {
    if (!rejectionReason.trim()) return
    await submitApproval(jobId, type, rejectionReason)
    setRejectionReason("")
    setShowRejectInput(false)
    setRejectType(null)
    setScreen(SCREENS.RUNNING)
  }

  async function loadDashboard() {
    try {
      const data = await getVideos()
      setVideos(data)
      setScreen(SCREENS.DASHBOARD)
    } catch (e) {
      setError("Failed to load dashboard. Try again.")
    }
  }

  async function handleRefreshStats(youtubeVideoId) {
    setLoadingStats(prev => ({ ...prev, [youtubeVideoId]: true }))
    try {
      const updated = await refreshStats(youtubeVideoId)
      setVideos(prev => prev.map(v =>
        v.youtube_video_id === youtubeVideoId ? { ...v, ...updated } : v
      ))
    } catch (e) {
      alert(e.message)
    } finally {
      setLoadingStats(prev => ({ ...prev, [youtubeVideoId]: false }))
    }
  }

  async function handleDelete(youtubeVideoId) {
    if (deletingVideo) return
    setDeletingVideo(youtubeVideoId)
    try {
      await deleteVideo(youtubeVideoId)
      setVideos(prev => prev.filter(v => v.youtube_video_id !== youtubeVideoId))
    } catch (e) {
      alert(e.message)
    } finally {
      setDeletingVideo(null)
    }
  }

  if (screen === SCREENS.START) return (
    <div style={s.page}>
      <div style={s.startWrap}>
        <div style={s.badge}>AI Content Pipeline</div>
        <h1 style={s.hero}>Trend to Video</h1>
        <p style={s.heroSub}>
          Enter a niche. Get a trending script, voiceover, and video — published to YouTube Shorts.
        </p>
        {error && <div style={s.errorBanner}>{error}</div>}
        <div style={s.inputRow}>
          <input
            style={s.bigInput}
            placeholder="fitness, finance, tech, sports..."
            value={niche}
            onChange={e => setNiche(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleStart()}
            autoFocus
          />
          <button style={s.generateBtn} onClick={handleStart} disabled={isSubmitting}>
            {isSubmitting ? "Starting…" : "Generate →"}
          </button>
        </div>
        <button style={s.ghostBtn} onClick={loadDashboard}>
          View published videos
        </button>
        <div style={s.steps}>
          {["Trend research", "Script writing", "Voiceover + video", "Your approval", "YouTube Shorts"].map((step, i) => (
            <div key={i} style={s.step}>
              <span style={s.stepNum}>{i + 1}</span>
              <span style={s.stepLabel}>{step}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  if (screen === SCREENS.RUNNING) return (
    <div style={s.page}>
      <div style={s.centerWrap}>
        <div style={s.pulseRing} />
        <h2 style={s.runningTitle}>Working on it</h2>
        <p style={s.runningNiche}>"{niche}"</p>
        <div style={s.progressSteps}>
          {["Fetching trends", "Writing script", "Generating audio", "Rendering video", "Awaiting your review"].map((label, i) => (
            <div key={i} style={s.progressStep}>
              <div style={s.progressDot} />
              <span style={s.progressLabel}>{label}</span>
            </div>
          ))}
        </div>
        <p style={s.timeNote}>Takes 1–3 minutes, longer after idle</p>
      </div>
    </div>
  )

  if (screen === SCREENS.REVIEW) return (
    <div style={s.page}>
      <div style={s.reviewWrap}>
        <div style={s.reviewHeader}>
          <span style={s.reviewBadge}>Ready for review</span>
          <h2 style={s.reviewTitle}>{pendingReview?.topic}</h2>
        </div>

        <div style={s.reviewGrid}>
          <div style={s.reviewCard}>
            <p style={s.cardEyebrow}>Hook</p>
            <p style={s.cardBody}>{pendingReview?.hook}</p>
          </div>
          <div style={{ ...s.reviewCard, gridColumn: "1 / -1" }}>
            <p style={s.cardEyebrow}>Script</p>
            <p style={{ ...s.cardBody, lineHeight: 1.8 }}>{pendingReview?.script}</p>
          </div>
        </div>

        {pendingReview?.audio_path && (
          <div style={s.mediaCard}>
            <p style={s.cardEyebrow}>Audio</p>
            <audio controls src={`/api/audio/${pendingReview.audio_path.split('/').pop()}`} style={{ width: "100%", marginTop: 8 }} />
          </div>
        )}

        {pendingReview?.video_path && (
          <div style={s.mediaCard}>
            <p style={s.cardEyebrow}>Video preview</p>
            <video controls src={`/api/video/${pendingReview.video_path.split('/').pop()}`} style={{ width: "100%", borderRadius: 8, marginTop: 8 }} />
          </div>
        )}

        {!showRejectInput ? (
          <div style={s.actionRow}>
            <button style={s.approveBtn} onClick={handleApprove}>Publish to YouTube →</button>
            <button style={s.rewriteBtn} onClick={() => { setRejectType("reject_script"); setShowRejectInput(true) }}>Rewrite script</button>
            <button style={s.topicBtn} onClick={() => { setRejectType("reject_topic"); setShowRejectInput(true) }}>Change topic</button>
          </div>
        ) : (
          <div style={s.rejectBox}>
            <p style={s.cardEyebrow}>{rejectType === "reject_topic" ? "What's wrong with the topic?" : "What needs fixing?"}</p>
            <input
              style={s.rejectInput}
              placeholder="Be specific — the model will use this feedback"
              value={rejectionReason}
              onChange={e => setRejectionReason(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleReject(rejectType)}
              autoFocus
            />
            <div style={s.actionRow}>
              <button style={s.approveBtn} onClick={() => handleReject(rejectType)}>Submit feedback →</button>
              <button style={s.rewriteBtn} onClick={() => setShowRejectInput(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  if (screen === SCREENS.DONE) return (
    <div style={s.page}>
      <div style={s.centerWrap}>
        <div style={s.doneIcon}>✓</div>
        <h2 style={s.runningTitle}>Published</h2>
        <div style={s.doneCard}>
          <p style={s.cardEyebrow}>Topic</p>
          <p style={s.doneCardBody}>{result?.topic}</p>
          <p style={{ ...s.cardEyebrow, marginTop: 16 }}>Hook</p>
          <p style={s.doneCardBody}>{result?.hook}</p>
          {result?.video_url && (
            <a href={result.video_url} target="_blank" rel="noreferrer" style={s.ytLink}>
              Watch on YouTube Shorts ↗
            </a>
          )}
        </div>
        <button style={s.generateBtn} onClick={() => {
          setScreen(SCREENS.START); setNiche(""); setJobId(null); setPendingReview(null); setResult(null)
        }}>Generate another →</button>
        <button style={s.ghostBtn} onClick={loadDashboard}>View all videos</button>
      </div>
    </div>
  )

  if (screen === SCREENS.DASHBOARD) return (
    <div style={s.page}>
      <div style={s.dashWrap}>
        <div style={s.dashHeader}>
          <div>
            <p style={s.badge}>Analytics</p>
            <h2 style={s.dashTitle}>Published Videos</h2>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button style={s.generateBtn} onClick={() => setScreen(SCREENS.START)}>New video →</button>
            <button style={s.ghostBtn} onClick={loadDashboard}>Refresh</button>
          </div>
        </div>

        {videos.length === 0 ? (
          <div style={s.emptyState}>
            <p style={s.emptyTitle}>No videos yet</p>
            <p style={s.emptyBody}>Generate and publish your first video to see it here.</p>
          </div>
        ) : (
          <div style={s.videoList}>
            {videos.map(v => (
              <div key={v.id} style={s.videoRow}>
                <div style={s.videoMeta}>
                  <p style={s.videoTopic}>{v.topic}</p>
                  <p style={s.videoHook}>{v.hook}</p>
                  <div style={s.videoLinks}>
                    <a href={v.youtube_url} target="_blank" rel="noreferrer" style={s.ytLink}>Watch ↗</a>
                    <span style={s.videoDate}>{new Date(v.published_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                  </div>
                </div>

                <div style={s.statsRow}>
                  {[["Views", v.view_count], ["Likes", v.like_count], ["Comments", v.comment_count]].map(([label, val]) => (
                    <div key={label} style={s.statBox}>
                      <p style={s.statNum}>{val ?? "—"}</p>
                      <p style={s.statLabel}>{label}</p>
                    </div>
                  ))}
                </div>

                <div style={s.videoActions}>
                  <button
                    style={s.actionBtn}
                    onClick={() => handleRefreshStats(v.youtube_video_id)}
                    disabled={loadingStats[v.youtube_video_id]}
                  >
                    {loadingStats[v.youtube_video_id] ? "…" : "Refresh stats"}
                  </button>
                  <button
                    style={s.deleteBtn}
                    onClick={() => handleDelete(v.youtube_video_id)}
                    disabled={deletingVideo === v.youtube_video_id}
                  >
                    {deletingVideo === v.youtube_video_id ? "…" : "Remove"}
                  </button>
                </div>

                {v.last_checked_at && (
                  <p style={s.lastChecked}>Updated {new Date(v.last_checked_at).toLocaleString("en-IN")}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const ACCENT = "#6366f1"
const ACCENT_DARK = "#4f46e5"
const BG = "#0a0a0f"
const SURFACE = "#111118"
const BORDER = "#1e1e2e"
const TEXT = "#e2e8f0"
const MUTED = "#64748b"
const SUCCESS = "#22c55e"
const DANGER = "#f87171"

const s = {
  page: {
    minHeight: "100vh",
    background: BG,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "2rem 1rem",
    fontFamily: "'Inter', -apple-system, sans-serif",
  },
  startWrap: {
    maxWidth: 600,
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "1.5rem",
    textAlign: "center",
  },
  badge: {
    fontSize: "0.7rem",
    fontWeight: 600,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: ACCENT,
    background: `${ACCENT}18`,
    border: `1px solid ${ACCENT}30`,
    borderRadius: 20,
    padding: "4px 12px",
    display: "inline-block",
  },
  hero: {
    fontSize: "clamp(2.5rem, 6vw, 4rem)",
    fontWeight: 800,
    margin: 0,
    color: TEXT,
    letterSpacing: "-0.03em",
    lineHeight: 1.1,
  },
  heroSub: {
    color: MUTED,
    fontSize: "1.05rem",
    margin: 0,
    lineHeight: 1.6,
    maxWidth: 440,
  },
  errorBanner: {
    background: "#450a0a",
    border: "1px solid #7f1d1d",
    color: DANGER,
    borderRadius: 8,
    padding: "0.75rem 1rem",
    fontSize: "0.9rem",
    width: "100%",
  },
  inputRow: {
    display: "flex",
    gap: 8,
    width: "100%",
  },
  bigInput: {
    flex: 1,
    padding: "0.85rem 1rem",
    fontSize: "1rem",
    background: SURFACE,
    border: `1.5px solid ${BORDER}`,
    borderRadius: 10,
    color: TEXT,
    outline: "none",
    transition: "border-color 0.2s",
  },
  generateBtn: {
    padding: "0.85rem 1.5rem",
    fontSize: "0.95rem",
    fontWeight: 600,
    background: ACCENT,
    color: "#fff",
    border: "none",
    borderRadius: 10,
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "background 0.2s",
  },
  ghostBtn: {
    background: "transparent",
    border: `1px solid ${BORDER}`,
    color: MUTED,
    borderRadius: 8,
    padding: "0.6rem 1.2rem",
    fontSize: "0.875rem",
    cursor: "pointer",
  },
  steps: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "center",
    marginTop: 8,
  },
  step: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    borderRadius: 20,
    padding: "4px 12px",
  },
  stepNum: {
    fontSize: "0.65rem",
    fontWeight: 700,
    color: ACCENT,
    background: `${ACCENT}20`,
    borderRadius: "50%",
    width: 16,
    height: 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  stepLabel: {
    fontSize: "0.75rem",
    color: MUTED,
  },

  // Running screen
  centerWrap: {
    maxWidth: 480,
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "1.25rem",
    textAlign: "center",
  },
  pulseRing: {
    width: 56,
    height: 56,
    borderRadius: "50%",
    border: `3px solid ${BORDER}`,
    borderTop: `3px solid ${ACCENT}`,
    animation: "spin 1s linear infinite",
  },
  runningTitle: {
    fontSize: "1.75rem",
    fontWeight: 700,
    color: TEXT,
    margin: 0,
    letterSpacing: "-0.02em",
  },
  runningNiche: {
    color: ACCENT,
    fontSize: "1rem",
    margin: 0,
    fontStyle: "italic",
  },
  progressSteps: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    width: "100%",
    textAlign: "left",
  },
  progressStep: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "0.5rem 0.75rem",
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
  },
  progressDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: ACCENT,
    flexShrink: 0,
  },
  progressLabel: {
    fontSize: "0.85rem",
    color: MUTED,
  },
  timeNote: {
    fontSize: "0.8rem",
    color: MUTED,
    margin: 0,
  },

  // Review screen
  reviewWrap: {
    maxWidth: 680,
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
  },
  reviewHeader: {
    marginBottom: 4,
  },
  reviewBadge: {
    fontSize: "0.7rem",
    fontWeight: 600,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: SUCCESS,
    background: `${SUCCESS}15`,
    border: `1px solid ${SUCCESS}30`,
    borderRadius: 20,
    padding: "4px 12px",
    display: "inline-block",
    marginBottom: 8,
  },
  reviewTitle: {
    fontSize: "1.75rem",
    fontWeight: 700,
    color: TEXT,
    margin: 0,
    letterSpacing: "-0.02em",
  },
  reviewGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "0.75rem",
  },
  reviewCard: {
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    borderRadius: 10,
    padding: "1rem",
  },
  mediaCard: {
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    borderRadius: 10,
    padding: "1rem",
  },
  cardEyebrow: {
    fontSize: "0.65rem",
    fontWeight: 700,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: MUTED,
    margin: "0 0 6px",
  },
  cardBody: {
    color: TEXT,
    fontSize: "0.95rem",
    margin: 0,
    lineHeight: 1.6,
  },
  actionRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  approveBtn: {
    flex: 1,
    padding: "0.85rem 1.25rem",
    fontSize: "0.95rem",
    fontWeight: 600,
    background: ACCENT,
    color: "#fff",
    border: "none",
    borderRadius: 10,
    cursor: "pointer",
  },
  rewriteBtn: {
    padding: "0.85rem 1.25rem",
    fontSize: "0.9rem",
    background: SURFACE,
    color: TEXT,
    border: `1px solid ${BORDER}`,
    borderRadius: 10,
    cursor: "pointer",
  },
  topicBtn: {
    padding: "0.85rem 1.25rem",
    fontSize: "0.9rem",
    background: "#1a0a0a",
    color: DANGER,
    border: `1px solid #3f1515`,
    borderRadius: 10,
    cursor: "pointer",
  },
  rejectBox: {
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    borderRadius: 10,
    padding: "1rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
  },
  rejectInput: {
    width: "100%",
    padding: "0.75rem 1rem",
    fontSize: "0.95rem",
    background: BG,
    border: `1.5px solid ${BORDER}`,
    borderRadius: 8,
    color: TEXT,
    outline: "none",
    boxSizing: "border-box",
  },

  // Done screen
  doneIcon: {
    width: 56,
    height: 56,
    borderRadius: "50%",
    background: `${SUCCESS}15`,
    border: `1px solid ${SUCCESS}30`,
    color: SUCCESS,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.5rem",
    fontWeight: 700,
  },
  doneCard: {
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    borderRadius: 12,
    padding: "1.25rem",
    width: "100%",
    textAlign: "left",
  },
  doneCardBody: {
    color: TEXT,
    fontSize: "1rem",
    margin: 0,
    lineHeight: 1.5,
  },
  ytLink: {
    color: ACCENT,
    fontSize: "0.875rem",
    textDecoration: "none",
    display: "inline-block",
    marginTop: 12,
  },

  // Dashboard
  dashWrap: {
    maxWidth: 760,
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: "1.5rem",
  },
  dashHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    flexWrap: "wrap",
    gap: 12,
  },
  dashTitle: {
    fontSize: "1.75rem",
    fontWeight: 700,
    color: TEXT,
    margin: "4px 0 0",
    letterSpacing: "-0.02em",
  },
  emptyState: {
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    borderRadius: 12,
    padding: "3rem 2rem",
    textAlign: "center",
  },
  emptyTitle: {
    color: TEXT,
    fontSize: "1.1rem",
    fontWeight: 600,
    margin: "0 0 8px",
  },
  emptyBody: {
    color: MUTED,
    fontSize: "0.9rem",
    margin: 0,
  },
  videoList: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
  },
  videoRow: {
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    borderRadius: 12,
    padding: "1.25rem",
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
  },
  videoMeta: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  videoTopic: {
    color: TEXT,
    fontSize: "1rem",
    fontWeight: 600,
    margin: 0,
  },
  videoHook: {
    color: MUTED,
    fontSize: "0.875rem",
    margin: 0,
    lineHeight: 1.5,
  },
  videoLinks: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginTop: 4,
  },
  videoDate: {
    color: MUTED,
    fontSize: "0.8rem",
  },
  statsRow: {
    display: "flex",
    gap: "1.5rem",
  },
  statBox: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  statNum: {
    fontSize: "1.5rem",
    fontWeight: 700,
    color: TEXT,
    margin: 0,
    letterSpacing: "-0.02em",
  },
  statLabel: {
    fontSize: "0.7rem",
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: MUTED,
    margin: 0,
  },
  videoActions: {
    display: "flex",
    gap: 8,
  },
  actionBtn: {
    padding: "0.5rem 1rem",
    fontSize: "0.8rem",
    background: "transparent",
    color: ACCENT,
    border: `1px solid ${ACCENT}40`,
    borderRadius: 6,
    cursor: "pointer",
  },
  deleteBtn: {
    padding: "0.5rem 1rem",
    fontSize: "0.8rem",
    background: "transparent",
    color: DANGER,
    border: `1px solid ${DANGER}30`,
    borderRadius: 6,
    cursor: "pointer",
  },
  lastChecked: {
    fontSize: "0.72rem",
    color: MUTED,
    margin: 0,
  },
}