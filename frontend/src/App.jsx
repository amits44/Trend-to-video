import {useState, useEffect, useRef} from "react"
import { startPipeline, getStatus, submitApproval, getVideos, refreshStats, deleteVideo } from "./api"

const SCREENS={
  START: "start",
  RUNNING: "running",
  REVIEW: "review",
  DONE: "done",
  DASHBOARD: "dashboard"
}
export default function App(){
  const[screen, setScreen]= useState(SCREENS.START)
  const[niche, setNiche]= useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const[jobId, setJobId]= useState(null)
  const[result, setResult]= useState(null)
  const[error, setError]= useState(null)
  const [videos, setVideos] = useState([])
  const [loadingStats, setLoadingStats] = useState({})
  const [pendingReview, setPendingReview] = useState(null)
  const [showRejectInput, setShowRejectInput] = useState(false)
  const [rejectType, setRejectType] = useState(null)
  const [rejectionReason, setRejectionReason] = useState("")
  const pollRef = useRef(null)

  async function handleStart(){
    if (!niche.trim() || isSubmitting) return
    setIsSubmitting(true)
    setError(null)
    setScreen(SCREENS.RUNNING)
    
    try {
      await fetch('/api/health').catch(() => {})
      const data = await startPipeline(niche)
      setJobId(data.job_id)
    } catch (e) {
      setError("Failed to start pipeline.")
      setScreen(SCREENS.START)
    } finally {
      setIsSubmitting(false)
    }
  }

  useEffect(()=>{
    if (screen != SCREENS.RUNNING || !jobId) return

    pollRef.current= setInterval(async()=>{
      try{
        const data = await getStatus(jobId)

        if(data.status=='awaiting_approval'){
          clearInterval(pollRef.current)
          setPendingReview(data.result)
          setScreen(SCREENS.REVIEW)
        }
        else if (data.status === "completed") {
          clearInterval(pollRef.current)
          setResult(data.result)
          setScreen(SCREENS.DONE)
        }
        else if (data.status === "failed") {
          clearInterval(pollRef.current)
          setError(`Pipeline failed: ${data.result?.error}`)
          setScreen(SCREENS.START)
        }
      }
      catch (e) {
        clearInterval(pollRef.current)
        setError("Lost connection to backend")
      }
    },5000)

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

  function showRejectForm(type) {
    setRejectType(type)
    setShowRejectInput(true)
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
    try{
      const updated = await refreshStats(youtubeVideoId)
      setVideos(prev => prev.map(v =>
        v.youtube_video_id === youtubeVideoId
          ? { ...v, ...updated }
          : v
      ))
    } catch (e) {
      alert(e.message)
    } finally{
      setLoadingStats(prev => ({ ...prev, [youtubeVideoId]: false }))
    }
  }

  if (screen === SCREENS.START) return (
    <div style={styles.container}>
      <h1 style={styles.title}>Trend to Video</h1>
      <p style={styles.subtitle}>Enter a niche to generate a short video script</p>
      {error && <p style={styles.error}>{error}</p>}
      <input
        style={styles.input}
        placeholder="e.g. fitness, finance, tech"
        value={niche}
        onChange={e => setNiche(e.target.value)}
        onKeyDown={e => e.key === "Enter" && handleStart()}
      />
      <button style={styles.primaryBtn} onClick={handleStart}>
        Generate
      </button>
      <button style={styles.secondaryBtn} onClick={loadDashboard}>
        View Published Videos
      </button>
    </div>
  )

  if (screen === SCREENS.RUNNING) return (
    <div style={styles.container}>
      <h2 style={styles.title}>Generating...</h2>
      <div style={styles.spinner} />
      <p style={styles.subtitle}>Researching trends, writing script, generating audio and video</p>
      <p style={styles.muted}>This takes about 30–60 seconds</p>
    </div>
  )

  if (screen === SCREENS.REVIEW) return (
    <div style={{ ...styles.container, maxWidth: 720 }}>
      <h2 style={styles.title}>Review Script</h2>

      <div style={styles.card}>
        <p style={styles.label}>Topic</p>
        <p style={styles.value}>{pendingReview?.topic}</p>
      </div>

      <div style={styles.card}>
        <p style={styles.label}>Hook</p>
        <p style={styles.value}>{pendingReview?.hook}</p>
      </div>

      <div style={styles.card}>
        <p style={styles.label}>Script</p>
        <p style={{ ...styles.value, lineHeight: 1.7 }}>{pendingReview?.script}</p>
      </div>

      {pendingReview?.audio_path && (
        <div style={styles.card}>
          <p style={styles.label}>Audio Preview</p>
          <audio
            controls
            src={`/api/audio/${pendingReview.audio_path.split('/').pop()}`}
            style={{ width: "100%" }}
          />
        </div>
      )}

      {pendingReview?.video_path && (
        <div style={styles.card}>
          <p style={styles.label}>Video Preview</p>
          <video
            controls
            src={`/api/video/${pendingReview.video_path.split('/').pop()}`}
            style={{ width: "100%", borderRadius: 8 }}
          />
        </div>
      )}

      {!showRejectInput ? (
        <div style={styles.btnRow}>
          <button style={styles.primaryBtn} onClick={handleApprove}>
            Approve & Publish
          </button>
          <button style={styles.secondaryBtn} onClick={() => showRejectForm("reject_script")}>
            Rewrite Script
          </button>
          <button style={styles.dangerBtn} onClick={() => showRejectForm("reject_topic")}>
            Change Topic
          </button>
        </div>
      ) : (
        <div style={styles.card}>
          <p style={styles.label}>
            {rejectType === "reject_topic" ? "What's wrong with the topic?" : "What should be fixed?"}
          </p>
          <input
            style={styles.input}
            placeholder="Be specific — the LLM will use this feedback"
            value={rejectionReason}
            onChange={e => setRejectionReason(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleReject(rejectType)}
            autoFocus
          />
          <div style={styles.btnRow}>
            <button style={styles.primaryBtn} onClick={() => handleReject(rejectType)}>
              Submit
            </button>
            <button style={styles.secondaryBtn} onClick={() => setShowRejectInput(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )

  if (screen === SCREENS.DONE) return (
    <div style={styles.container}>
      <h2 style={styles.title}>Published</h2>
      <div style={styles.card}>
        <p style={styles.label}>Topic</p>
        <p style={styles.value}>{result?.topic}</p>
      </div>
      <div style={styles.card}>
        <p style={styles.label}>Hook</p>
        <p style={styles.value}>{result?.hook}</p>
      </div>
      <button style={styles.primaryBtn} onClick={() => {
        setScreen(SCREENS.START)
        setNiche("")
        setJobId(null)
        setPendingReview(null)
        setResult(null)
      }}>
        Generate Another
      </button>
    </div>
  )

  if (screen === SCREENS.DASHBOARD) return (
  <div style={{ ...styles.container, maxWidth: 800 }}>
    <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
      <h2 style={styles.title}>Published Videos</h2>
      <button style={styles.secondaryBtn} onClick={() => setScreen(SCREENS.START)}>
        ← Back
      </button>
    </div>

    {videos.length === 0 && (
      <p style={styles.subtitle}>No videos published yet.</p>
    )}

    {videos.map(v => (
      <div key={v.id} style={{ ...styles.card, width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p style={{ ...styles.value, fontWeight: 600, marginBottom: 4 }}>{v.topic}</p>
            <p style={{ ...styles.muted, marginBottom: 8 }}>{v.hook}</p>
            <a href={v.youtube_url} target="_blank" rel="noreferrer"
              style={{ color: "#2563eb", fontSize: "0.875rem" }}>
              Watch on YouTube ↗
            </a>
          </div>
          <button
            style={styles.secondaryBtn}
            onClick={() => handleRefreshStats(v.youtube_video_id)}
            disabled={loadingStats[v.youtube_video_id]}
          >
            {loadingStats[v.youtube_video_id] ? "..." : "Refresh Stats"}
          </button>
          <button
            style={{ ...styles.dangerBtn, padding: "0.5rem 1rem", fontSize: "0.875rem" }}
            onClick={async () => {
              await deleteVideo(v.youtube_video_id)
              setVideos(prev => prev.filter(vid => vid.youtube_video_id !== v.youtube_video_id))
            }}
          >
            Remove
          </button>
        </div>

        <div style={{ display: "flex", gap: "2rem", marginTop: "1rem" }}>
          <div>
            <p style={styles.label}>Views</p>
            <p style={{ ...styles.value, fontSize: "1.5rem", fontWeight: 700 }}>{v.view_count ?? "—"}</p>
          </div>
          <div>
            <p style={styles.label}>Likes</p>
            <p style={{ ...styles.value, fontSize: "1.5rem", fontWeight: 700 }}>{v.like_count ?? "—"}</p>
          </div>
          <div>
            <p style={styles.label}>Comments</p>
            <p style={{ ...styles.value, fontSize: "1.5rem", fontWeight: 700 }}>{v.comment_count ?? "—"}</p>
          </div>
          <div>
            <p style={styles.label}>Published</p>
            <p style={styles.muted}>{new Date(v.published_at).toLocaleDateString()}</p>
          </div>
        </div>

        {v.last_checked_at && (
          <p style={{ ...styles.muted, marginTop: 8, fontSize: "0.75rem" }}>
            Stats last updated: {new Date(v.last_checked_at).toLocaleString()}
          </p>
        )}
      </div>
    ))}
  </div>
  )
}

const styles = {
  container: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "2rem",
    maxWidth: 560,
    margin: "0 auto",
    fontFamily: "'Inter', sans-serif",
    gap: "1rem"
  },
  title: { fontSize: "2rem", fontWeight: 700, margin: 0, color: "#0f172a" },
  subtitle: { color: "#475569", margin: 0, textAlign: "center" },
  muted: { color: "#94a3b8", fontSize: "0.875rem", margin: 0 },
  error: { color: "#ef4444", margin: 0 },
  input: {
    width: "100%", padding: "0.75rem 1rem", fontSize: "1rem",
    border: "1.5px solid #e2e8f0", borderRadius: 8,
    outline: "none", boxSizing: "border-box"
  },
  primaryBtn: {
    padding: "0.75rem 2rem", fontSize: "1rem", fontWeight: 600,
    background: "#2563eb", color: "#fff", border: "none",
    borderRadius: 8, cursor: "pointer"
  },
  secondaryBtn: {
    padding: "0.75rem 1.5rem", fontSize: "1rem",
    background: "#f1f5f9", color: "#0f172a", border: "none",
    borderRadius: 8, cursor: "pointer"
  },
  dangerBtn: {
    padding: "0.75rem 1.5rem", fontSize: "1rem",
    background: "#fee2e2", color: "#dc2626", border: "none",
    borderRadius: 8, cursor: "pointer"
  },
  btnRow: { display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" },
  card: {
    width: "100%", background: "#f8fafc", border: "1px solid #e2e8f0",
    borderRadius: 10, padding: "1rem 1.25rem"
  },
  label: { fontSize: "0.75rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", margin: "0 0 0.25rem" },
  value: { margin: 0, color: "#0f172a", fontSize: "0.95rem" },
  spinner: {
    width: 40, height: 40, border: "3px solid #e2e8f0",
    borderTop: "3px solid #2563eb", borderRadius: "50%",
    animation: "spin 1s linear infinite"
  }
}


