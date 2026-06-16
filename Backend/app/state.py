from typing import TypedDict

class ContentState(TypedDict):
    niche: str
    job_id : str
    topic: str
    trend_reason: str
    reject_topic: bool
    topic_rejection_reason: str
    script: str
    hook: str
    audio_path: str
    image_path: str
    video_path: str
    human_approved: bool
    published: bool
    video_url: str
    publish_error: str
    rejection_reason: str
    iteration_count: int

    
