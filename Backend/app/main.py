from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel
import uuid
import json
import os
from app.graph import run_pipeline
from app.nodes import audio_outputs, video_outputs
from app.pipeline_state import pipeline_paused_jobs, pipeline_decisions
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles


app = FastAPI(title="Content Factory API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:4173",
        "https://content-factory-p77l.onrender.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

jobs = {}

class PipelineRequest(BaseModel):
    niche:str

class ApprovalRequest(BaseModel):
    action: str
    reason: str= ""

class JobStatus(BaseModel):
    job_id: str
    status: str
    result: dict |None=None

output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "output")
app.mount("/audio", StaticFiles(directory=audio_outputs), name="audio")
app.mount("/audio", StaticFiles(directory=audio_outputs), name="audio")
app.mount("/video", StaticFiles(directory=video_outputs), name="video")

@app.post("/generate", response_model=JobStatus)
async def generate_content(request: PipelineRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    jobs[job_id]= {"status": "pending", "result": None}

    background_tasks.add_task(run_job, job_id, request.niche)
    return JobStatus(job_id = job_id, status="pending")

def run_job(job_id: str, niche: str):
    try:
        jobs[job_id]["status"]= "running"
        result = run_pipeline(niche=niche, thread_id = job_id)
        jobs[job_id]["status"]= "completed"
        jobs[job_id]["result"]= result
    except Exception as e:
        jobs[job_id]["status"]= "failed"
        jobs[job_id]["result"]= {"error": str(e)}

@app.get("/status/{job_id}", response_model=JobStatus)
async def get_status(job_id:str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if job_id in pipeline_paused_jobs:
        pending = pipeline_paused_jobs[job_id]
        return JobStatus(
            job_id=job_id,
            status="awaiting_approval",
            result=pending
        )

    job = jobs[job_id]
    return JobStatus(job_id=job_id, status=job["status"], result=job["result"])

@app.post("/approve/{job_id}")
async def approve_content(job_id:str, request:ApprovalRequest):
    if job_id not in pipeline_paused_jobs:
        raise HTTPException(status_code=400, detail="job is not waiting for approval")
    pipeline_decisions[job_id]={
        "action": request.action,
        "reason": request.reason
    }
    return {"job_id": job_id, "message": f"Decision '{request.action}' received, pipeline resuming"}

@app.get("/health")
async def health_check():
    return {"status": "ok"}