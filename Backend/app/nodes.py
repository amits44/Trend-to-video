from typing import Literal
from app.state import ContentState
import os
import subprocess 
from groq import Groq
from gtts import gTTS
import requests
import time
import json
from dotenv import load_dotenv
from app.prompts import get_trend_researcher_prompt
from app.pipeline_state import pipeline_paused_jobs, pipeline_decisions
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
import json as json_lib
load_dotenv()
client = Groq()

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
audio_outputs = os.path.join(BASE_DIR, "output", "audio")
image_outputs = os.path.join(BASE_DIR, "output", "images")
video_outputs = os.path.join(BASE_DIR, "output", "videos")
os.makedirs(audio_outputs, exist_ok=True)
os.makedirs(image_outputs, exist_ok=True)
os.makedirs(video_outputs, exist_ok=True)


def trend_researcher_node(state:ContentState)-> ContentState:
    """find one trending topic for the niche"""
    print(f"\n[Trend Researcher] finding topic for the niche: {state['niche']}")

    feedback = ""
    if state.get("topic_rejection_reason"):
        feedback = f"Previously rejected topic '{state.get('topic')}' because: {state['topic_rejection_reason']}. Find something different."

    try:
        response = requests.get(
            "https://serpapi.com/search",
            params={
                "engine": "google_trends_trending_now",
                "geo": "IN",
                "api_key": os.getenv("SERP_API_KEY")
            },
            timeout=10
        )

        response.raise_for_status()
        data = response.json()

        trends = data.get("trending_searches", [])
        trend_titles = [t.get("query", "") for t in trends[:10]]
        print(f"[Trend Researcher] Got trends: {trend_titles}")

        formatted_prompt = get_trend_researcher_prompt(
            niche=state["niche"],
            filtered_titles= trend_titles,
            feedback= feedback
        )

        response = client.chat.completions.create(
            model = "llama-3.3-70b-versatile",
            messages=[{
                "role": "user",
                "content": formatted_prompt
            }],
            response_format={"type": "json_object"}
        )

        result = json.loads(response.choices[0].message.content)
        print(f"[Trend Researcher] Found: {result['topic']}")
        return{
            "topic": result["topic"],
            "trend_reason": result["reason"]
        }

    except requests.exceptions.Timeout:
        print("[Trend Researcher] SerpAPI timed out, using LLM fallback")
        return _llm_fallback_topic(state)

    except requests.exceptions.RequestException as e:
        print(f"[Trend Researcher] SerpAPI error: {e}, using LLM fallback")
        return _llm_fallback_topic(state)

def _llm_fallback_topic(state: ContentState) -> ContentState:
    """When SerpAPI fails, LLM picks a relevant trending topic from its knowledge"""

    feedback = ""
    if state.get("topic_rejection_reason"):
        feedback = f"Previously rejected topic '{state.get('topic')}' because: {state['topic_rejection_reason']}. Find something different."

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{
            "role": "user",
            "content": f"""Suggest ONE currently popular topic in {state['niche']} for short video content.
            {feedback}
            Respond in JSON only:
            {{"topic": "topic name", "reason": "why it's popular"}}"""
        }],
        response_format={"type": "json_object"}
    )
    result = json.loads(response.choices[0].message.content)
    return {
        "topic": result["topic"],
        "trend_reason": result["reason"] + " (LLM fallback)"
    }

def script_writer_node(state:ContentState)-> ContentState:
    """Write a video script for a  trending topic"""
    print(f"\n[Script Writer] writing script for topic: {state['topic']}")

    feedback = ""
    if state.get("rejection_reason"):
        feedback = f"Previous script was rejected because: {state['rejection_reason']}. Fix this."

    response = client.chat.completions.create(
        model = "llama-3.3-70b-versatile",
        messages=[{
            "role": "user",
            "content": f"""Write a 60-second short video script about: {state['topic']}
            Niche: {state['niche']}
            {feedback}
            Respond in JSON only:
            {{"hook": "opening line", "script": "full 60 second script"}}"""
        }],
        response_format={"type": "json_object"}
    )

    result = json.loads(response.choices[0].message.content)
    print(f"[Script Writer] Hook: {result['hook']}")
    return{
        "hook": result["hook"],
        "script": result["script"],
        "human_approved": False,
        "rejection_reason": ""
    }

def voiceover_node(state: ContentState) -> ContentState:
    print(f"\n[Voiceover] Generating audio for script...")
    try:
        tts= gTTS(text= state['script'], lang='en', slow=False) 
        file_name = f"audio_{state['topic'].replace(' ', '_')}.mp3"
        audio_path = os.path.join(audio_outputs, file_name)
        tts.save(audio_path)
        print(f"[Voiceover] Saved to {audio_path}")

        return {"audio_path": audio_path}
        
    except Exception as e:
        print(f"[Voiceover] Failed: {e}")
        return {"audio_path": ""}

def _fetch_topic_image(topic:str)-> str:
    """Fetch relevant image for unsplash API"""
    try:
        api_key = os.getenv("PEXELS_API_KEY")
        if not api_key:
            return ""
        response = requests.get(
            "https://api.pexels.com/v1/search",
            headers={"Authorization": api_key},
            params={"query": topic, "per_page": 1, "orientation": "landscape"},
            timeout=10
        )
        if response.status_code == 200:
            photos = response.json().get("photos", [])
            if photos:
                image_url = photos[0]["src"]["large2x"]
                img_response = requests.get(image_url, timeout=15)
                if img_response.status_code == 200:
                    image_path = os.path.join(image_outputs, f"{topic.replace(' ', '_')}.jpg")
                    with open(image_path, "wb") as f:
                        f.write(img_response.content)
                    return image_path
    except Exception as e:
        print(f"[Video Generator] Image fetch error: {e}")
    return ""

def _create_fallback_image(topic:str)-> str:
    """create black image with topic name"""
    image_path = os.path.join(image_outputs, f"fallback_{topic.replace(' ', '_')}.png")
    result = subprocess.run([
        "ffmpeg", "-y", "-nostdin",
        "-f", "lavfi",
        "-i", f"color=c=black:size=1280x720:rate=1",
        "-vframes", "1",
        "-update", "1",
        image_path
    ], capture_output=True)
    if result.returncode != 0:
        print(f"[Video Generator] ffmpeg fallback error: {result.stderr.decode()}")
        return ""
    return image_path

def _combine_to_video(image_path:str, audio_path:str, topic:str)-> str:
    """combine image+ audio into mp4 using ffmpeg"""
    if not image_path or not os.path.exists(image_path):
        print("[Video Generator] No valid image, skipping video creation")
        return ""

    video_path = os.path.join(video_outputs, f"{topic.replace(' ', '_')}.mp4")
    result = subprocess.run([
        "ffmpeg", "-y","-nostdin",
        "-loop", "1",           
        "-i", image_path,       
        "-i", audio_path,       
        "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1",
        "-c:v", "libx264",      
        "-tune", "stillimage",  
        "-c:a", "aac",          
        "-b:a", "192k",
        "-pix_fmt", "yuv420p",
        "-shortest",
        video_path
    ], capture_output=True, check=True)
    if result.returncode != 0:
        print(f"[Video Generator] combine error: {result.stderr.decode()[-300:]}")
        return ""
    return video_path

def video_generator_node(state: ContentState)-> dict:
    print(f"\n[Video Generator] Creating video for: {state['topic']}")

    try:
        image_path= _fetch_topic_image(state["topic"])
        if not image_path:
            print(f"[Video Generator] Image fetch failed, using fallback")
            image_path= _create_fallback_image(state["topic"])

        video_path = _combine_to_video(image_path, state["audio_path"], state["topic"])
        print(f"[Video Generator] video saved to {video_path}")
        return {"image_path": image_path, "video_path": video_path}
    except Exception as e:
        print(f"[Video Generator] Failed: {e}")
        return {"image_path": "", "video_path": ""}

def human_approval_node(state: ContentState) -> ContentState:
    """Pauses for human review"""
    print(f"\n[Human Approval] Reviewing script for topic: {state['topic']}")
    
    job_id = state.get("job_id","unknown")

    pipeline_paused_jobs[job_id]={
        "status": "waiting for approval",
        "topic": state["topic"],
        "hook": state["hook"],
        "script": state["script"],
        "audio_path": state["audio_path"],
        "video_path": state.get("video_path", "")
    }
    while job_id not in pipeline_decisions:
        time.sleep(1)
    decision = pipeline_decisions.pop(job_id)
    pipeline_paused_jobs.pop(job_id, None) 

    if decision["action"] == "approve":
        return{
            "human_approved": True,
            "iteration_count": state["iteration_count"] + 1
        }
    elif decision["action"] == "reject":
        return {
            "human_approved": False,
            "reject_topic": True,
            "topic_rejection_reason": decision["reason"]
        }
    else:
        return {
            "human_approved": False,
            "rejection_reason": decision["reason"],
            "iteration_count": state["iteration_count"] + 1
        }

def _get_youtube_client():
    """Load credentials from env var (Render) or local file (dev)"""
    token_json = os.getenv("YOUTUBE_TOKEN_JSON")
    if token_json:
        creds_data = json_lib.loads(token_json)
    else:
        with open("token.json", "r") as f:
            creds_data = json_lib.load(f)

    creds = Credentials.from_authorized_user_info(
        creds_data,
        scopes=["https://www.googleapis.com/auth/youtube.upload"]
    )
    return build("youtube", "v3", credentials=creds)

def _upload_to_youtube(video_path: str, topic: str, hook: str) -> dict:
    """Uploads video to YouTube as a Short, returns video_id and url"""
    try:
        youtube = _get_youtube_client()

        body = {
            "snippet": {
                "title": f"{topic} #Shorts"[:100],
                "description": f"{hook}\n\n{topic}",
                "tags": [topic],
                "categoryId": "22" 
            },
            "status": {
                "privacyStatus": "private",  
                "selfDeclaredMadeForKids": False
            }
        }

        media = MediaFileUpload(video_path, mimetype="video/mp4", resumable=True)

        request = youtube.videos().insert(
            part="snippet,status",
            body=body,
            media_body=media
        )

        response = request.execute()
        video_id = response["id"]

        return {
            "success": True,
            "video_id": video_id,
            "url": f"https://youtube.com/shorts/{video_id}"
        }

    except Exception as e:
        print(f"[Publisher] YouTube upload failed: {e}")
        return {"success": False, "error": str(e)}

def publisher_node(state: ContentState) -> dict:
    print(f"\n[Publisher] Publishing: {state['topic']}")
    
    if not state.get("video_path") or not os.path.exists(state["video_path"]):
        print("[Publisher] No valid video file, skipping upload")
        return {"published": False, "publish_error": "no video file"}

    result = _upload_to_youtube(state["video_path"], state["topic"], state["hook"])

    if result["success"]:
        print(f"[Publisher] Published: {result['url']}")
        return {"published": True, "video_url": result["url"]}
    else:
        print(f"[Publisher] Failed: {result['error']}")
        return {"published": False, "publish_error": result["error"]}