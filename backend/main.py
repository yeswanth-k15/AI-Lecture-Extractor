import os
os.environ["PATH"] += os.pathsep + r"C:\ffmpeg\ffmpeg-7.1.1-essentials_build\bin"
import cv2
import pytesseract
import yt_dlp
import tempfile
import json
import hashlib

import re
import shutil
import subprocess  
import logging
import glob
from pathlib import Path
from dotenv import load_dotenv

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel, Field
from fpdf import FPDF
from groq import Groq
from langdetect import detect
from scenedetect import VideoManager, SceneManager
from scenedetect.detectors import ContentDetector

# ===========================
# 🔑 ENV & LOGGING SETUP
# ===========================
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# ✅ Explicitly load the .env file from the backend directory dynamically
BASE_DIR = Path(__file__).resolve().parent
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(BASE_DIR, ".env")
load_dotenv(dotenv_path=env_path)

# ✅ Fetch API key securely
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise ValueError("❌ GROQ_API_KEY is missing. Please ensure it is set in the backend/.env file.")

# ✅ Log masked API key for debugging
masked_key = GROQ_API_KEY[:6] + "*****" + GROQ_API_KEY[-4:]
logging.info(f"✅ Loaded GROQ_API_KEY: {masked_key}")

# ✅ Initialize Groq client
client = Groq(api_key=GROQ_API_KEY)


pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

# Always use the directory of this file for consistent paths
BASE_DIR = Path(__file__).resolve().parent.parent  # Go up from backend/main.py to project root
CACHE_DIR = BASE_DIR / "video_cache"
CACHE_DIR.mkdir(exist_ok=True)

# Font directory (relative to this backend folder)
FONT_DIR = Path(__file__).resolve().parent / "fonts" / "dejavu-fonts-ttf-2.37" / "ttf"
font_files = glob.glob(str(FONT_DIR / "DejaVuSans*.ttf"))
print(f"🔎 FONT_DIR: {FONT_DIR}")
print(f"🔎 Found font files: {font_files}")


if font_files:
    FONT_PATH = font_files[0]  # automatically pick first available DejaVuSans font
    logging.info(f"✅ Using font: {FONT_PATH}")
else:
    FONT_PATH = None
    logging.warning("⚠️ No DejaVu fonts found. Using default system font.")

CACHE_INFO_FILE = CACHE_DIR / "cache_info.txt"


# ===========================
# ⚙ FASTAPI CONFIG
# ===========================
app = FastAPI(title="AI Lecture Extractor API", version="3.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
@app.get("/")
def health_check():
    return {"status": "Backend is running 🚀"}


# ===========================
# 📌 MODELS
# ===========================
class VideoRequest(BaseModel):
    url: str = Field(..., example="https://www.youtube.com/watch?v=example")

class QuizRequest(BaseModel):
    lecture_text: str = ""
    difficulty: str = Field(default="medium", pattern="^(easy|medium|hard)$")
    num_questions: int = Field(default=5, ge=1, le=20)

# ===========================
# 📌 UTILS
# ===========================
def clean_text(text: str) -> str:
    text = re.sub(r'http\S+|www\S+|@\w+|#\w+', '', text)
    text = re.sub(r'\bsubscribe\b|\blike\b|\bshare\b|\bcomment\b', '', text, flags=re.IGNORECASE)
    return re.sub(r'\s+', ' ', text).strip()

def clean_summary(summary: str) -> str:
    if not summary: return "❌ No summary available."
    lines = summary.splitlines()
    cleaned_lines = [line.strip() for line in lines if line.strip() and not re.search(r"(?i)here is a summary|if you would like me", line)]
    return "\n".join(cleaned_lines) if cleaned_lines else "❌ No summary available."

def download_video(url: str, output_path: str) -> bool:
    formats = [
        "bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4",
        "bv*+ba/b",
        "best[ext=mp4]/mp4",
        "best[height<=480]"
    ]
    for fmt in formats:
        logging.info(f"🎥 Trying format: {fmt}")
        ydl_opts = {
            "outtmpl": output_path,
            "format": "best",
            "cookiefile": str(BASE_DIR / "backend" / "cookies.txt"),
            "format": fmt,
            "merge_output_format": "mp4",
            "quiet": False,
            "noplaylist": True,
            "geo_bypass": True,
            "hls_prefer_ffmpeg": True,
            "socket_timeout": 60,
            "retries": 10,
            "extractor_args": {
                "youtube": {
                    "player_client": ["android"]
                }
            }
        }
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])
            if os.path.exists(output_path) and os.path.getsize(output_path) > 1024:
                logging.info("✅ Video downloaded successfully.")
                return True
        except Exception as e:
            logging.warning(f"⚠️ Failed with format {fmt}: {e}")
            continue
    return False

def get_video_hash(video_path: Path) -> str:
    sha = hashlib.sha256()
    with open(video_path, "rb") as f:
        while chunk := f.read(8192):
            sha.update(chunk)
    return sha.hexdigest()

def extract_audio(video_path: Path, audio_path: Path):
    subprocess.run(["ffmpeg", "-i", str(video_path), "-vn", "-acodec", "mp3", str(audio_path), "-y"],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def extract_slides(video_path: Path, output_dir: Path):
    logging.info("🎞 Extracting slides using PySceneDetect...")
    slides_dir = output_dir / "slides"
    slides_dir.mkdir(parents=True, exist_ok=True)

    video_manager = VideoManager([str(video_path)])
    scene_manager = SceneManager()
    scene_manager.add_detector(ContentDetector(threshold=30))
    video_manager.start()
    scene_manager.detect_scenes(frame_source=video_manager)
    scene_list = scene_manager.get_scene_list()

    cap = cv2.VideoCapture(str(video_path))
    slide_texts = []

    for idx, (start, _) in enumerate(scene_list):
        frame_num = start.get_frames()
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_num)
        ret, frame = cap.read()
        if ret:
            slide_path = slides_dir / f"slide_{idx+1}.jpg"
            cv2.imwrite(str(slide_path), frame)
            text = pytesseract.image_to_string(frame)
            slide_texts.append((slide_path, text.strip()))
    cap.release()

    logging.info(f"✅ Extracted {len(slide_texts)} slides.")
    return slide_texts

def generate_pdf_with_slides(summary: str, slides: list, pdf_path: Path):
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_font("DejaVu", "", str(FONT_PATH), uni=True)

    pdf.add_page()
    pdf.set_font("DejaVu", size=14)
    pdf.multi_cell(0, 10, f"Lecture Summary:\n\n{summary}")

    for slide_path, text in slides:
        pdf.add_page()
        pdf.image(str(slide_path), x=10, y=30, w=180)
        if text:
            pdf.set_xy(10, 150)
            pdf.set_font("DejaVu", size=10)
            pdf.multi_cell(0, 6, f"OCR Text:\n{text}")

    pdf.output(str(pdf_path))

def clear_cache():
    if CACHE_DIR.exists():
        shutil.rmtree(CACHE_DIR)
    CACHE_DIR.mkdir(exist_ok=True)

def enforce_cache_limit(max_caches=2):
    caches = sorted([CACHE_DIR / d for d in os.listdir(CACHE_DIR)], key=os.path.getctime)
    while len(caches) > max_caches:
        old = caches.pop(0)
        shutil.rmtree(old)
        logging.info(f"🗑 Removed old cache: {old}")

def get_cached_hash() -> str:
    return CACHE_INFO_FILE.read_text().strip() if CACHE_INFO_FILE.exists() else None

def save_cached_hash(video_hash: str):
    CACHE_INFO_FILE.write_text(video_hash)

# ===========================
# 1️⃣ PROCESS VIDEO (Lecture Summary)
# ===========================
@app.post("/process-video", tags=["Video Processing"])
async def process_video(video: VideoRequest):
    try:
        if not video.url.startswith(("http://", "https://")):
            raise HTTPException(status_code=400, detail="❌ Invalid video URL")

        logging.info(f"📥 Received video URL: {video.url}")
        temp_dir = Path(tempfile.mkdtemp())
        video_path = temp_dir / "lecture.mp4"

        # Download video
        if not download_video(video.url, str(video_path)):
            raise HTTPException(status_code=500, detail="❌ Video download failed. Try another URL.")

        # Cache handling
        video_hash = get_video_hash(video_path)
        cached_hash = get_cached_hash()

        if cached_hash and cached_hash != video_hash:
            logging.info("🗑 Clearing old cache for new video...")
            clear_cache()

        cached_dir = CACHE_DIR / video_hash
        cached_dir.mkdir(parents=True, exist_ok=True)
        pdf_path = cached_dir / "LectureNotes.pdf"

        if cached_hash == video_hash and pdf_path.exists():
            logging.info("♻ Using cached results")
            return {"summary": "♻ Using cached results", "pdf_path": "/download-pdf"}

        save_cached_hash(video_hash)

        # Extract audio
        audio_path = cached_dir / "audio.mp3"
        extract_audio(video_path, audio_path)

        # Transcription
        with open(audio_path, "rb") as f:
            transcript_response = client.audio.transcriptions.create(
                model="whisper-large-v3",
                file=f
            )
        full_transcript = transcript_response.text.strip()

        if not full_transcript:
            raise HTTPException(status_code=500, detail="❌ Failed to transcribe audio.")

        # Save transcript
        transcript_path = cached_dir / "transcript.txt"
        transcript_path.write_text(full_transcript, encoding="utf-8")

        # Language detection
        detected_language = detect(full_transcript) if full_transcript else "en"
        summary_prompt = f"Summarize this lecture in {detected_language if detected_language != 'en' else 'English'}:\n\n{full_transcript[:8000]}"

        # Summarization
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": summary_prompt}]
        )
        summary = clean_summary(response.choices[0].message.content.strip())

        # Extract slides & generate PDF
        slides = extract_slides(video_path, cached_dir)
        generate_pdf_with_slides(summary, slides, pdf_path)

        logging.info("✅ Video processed successfully!")
        return {"summary": summary, "pdf_path": "/download-pdf", "detected_language": detected_language}

    except Exception as e:
        logging.error(f"❌ ERROR in /process-video: {str(e)}")
        raise HTTPException(status_code=500, detail=f"❌ Video processing failed: {str(e)}")


# ===========================
# 2️⃣ TRANSLATE & REGENERATE SUMMARY
# ===========================
@app.post("/translate-summary")
def translate_summary(data: dict):
    summary_text = data.get("summary", "").strip()
    target_lang = data.get("target", "en")

    if not summary_text:
        return {"translated_summary": "❌ No summary available to translate.", "target_language": target_lang}

    translation_prompt = f"Translate this text into {target_lang}:\n\n{summary_text}"
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": translation_prompt}]
    )
    translated_summary = clean_summary(response.choices[0].message.content.strip())
    return {"translated_summary": translated_summary, "target_language": target_lang}

@app.post("/generate-summary", tags=["Summary"])
def generate_summary(data: dict):
    language = data.get("language", "original")
    transcript_files = [Path(root) / file for root, _, files in os.walk(CACHE_DIR) for file in files if file == "transcript.txt"]
    if not transcript_files:
        return {"error": "❌ Summary generation failed. No transcript found."}

    latest_transcript = max(transcript_files, key=os.path.getctime)
    transcript_text = latest_transcript.read_text(encoding="utf-8")
    prompt = f"Summarize the following transcript in {'English' if language == 'english' else 'its original language'}:\n\n{transcript_text[:8000]}"

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}]
    )
    summary_text = clean_summary(response.choices[0].message.content.strip())
    return {"summary": summary_text, "language": language}

# ===========================
# 3️⃣ TRANSCRIPT UPLOAD & SUMMARY (with Language Dropdown)
# ===========================
@app.post("/summarize-transcript", tags=["Transcript"])
async def summarize_transcript(file: UploadFile = File(...)):
    text = (await file.read()).decode("utf-8").strip()
    detected_lang = detect(text) if text else "en"

    summary_prompt = f"Summarize this transcript in bullet points in English:\n\n{text[:5000]}"
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": summary_prompt}]
    )
    summary_en = clean_summary(response.choices[0].message.content.strip())

    transcript_path = Path("uploaded_transcript.txt")
    transcript_path.write_text(text, encoding="utf-8")

    pdf = FPDF()
    pdf.add_page()
    pdf.add_font("DejaVu", "", str(FONT_PATH), uni=True)
    pdf.set_font("DejaVu", size=12)
    pdf.multi_cell(0, 10, f"Transcript Summary:\n\n{summary_en}")
    pdf.output("TranscriptSummary.pdf")

    return {
        "message": "Transcript summarized successfully",
        "summary": summary_en,
        "detected_language": detected_lang,
        "summary_pdf": "/download-transcript-summary"
    }

@app.post("/regenerate-transcript-summary", tags=["Transcript"])
async def regenerate_transcript_summary(data: dict):
    language = data.get("language", "english")
    transcript_text = Path("uploaded_transcript.txt").read_text(encoding="utf-8")
    prompt = f"Summarize this transcript in bullet points in {'English' if language=='english' else 'its original language'}:\n\n{transcript_text[:5000]}"
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}]
    )
    summary = clean_summary(response.choices[0].message.content.strip())
    return {"summary": summary, "language": language}

@app.post("/translate-transcript-summary", tags=["Transcript"])
async def translate_transcript_summary(data: dict):
    summary = data.get("summary", "")
    target_lang = data.get("target", "en")
    if not summary:
        return {"translated_summary": "❌ No summary to translate."}
    prompt = f"Translate this text into {target_lang}:\n\n{summary}"
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}]
    )
    translated = clean_summary(response.choices[0].message.content.strip())
    return {"translated_summary": translated, "target_language": target_lang}

@app.get("/download-transcript-summary", tags=["Transcript"])
def download_transcript_summary():
    if Path("TranscriptSummary.pdf").exists():
        return FileResponse("TranscriptSummary.pdf", media_type='application/pdf', filename="TranscriptSummary.pdf")
    return {"error": "Transcript summary not found."}

# ===========================
# 4️⃣ DOWNLOAD ENDPOINTS
# ===========================
@app.get("/download-pdf", tags=["Downloads"])
def download_pdf():
    for root, _, files in os.walk(CACHE_DIR):
        if "LectureNotes.pdf" in files:
            return FileResponse(Path(root) / "LectureNotes.pdf", media_type='application/pdf', filename="LectureNotes.pdf")
    return {"error": "PDF not found."}

@app.get("/download-transcript", tags=["Downloads"])
def download_transcript():
    for root, _, files in os.walk(CACHE_DIR):
        if "transcript.txt" in files:
            return FileResponse(Path(root) / "transcript.txt", media_type='text/plain', filename="Transcript.txt")
    return {"error": "Transcript not found."}

# ===========================
# 5️⃣ QUIZ GENERATION
# ===========================
@app.post("/generate-quiz", tags=["Quiz"])
def generate_quiz(data: QuizRequest):
    lecture_text = data.lecture_text.strip()
    if not lecture_text:
        transcript_files = [Path(root) / file for root, _, files in os.walk(CACHE_DIR) for file in files if file == "transcript.txt"]
        if transcript_files:
            latest_transcript = max(transcript_files, key=os.path.getctime)
            lecture_text = latest_transcript.read_text(encoding="utf-8")
        else:
            return {"error": "No transcript found for quiz generation."}

    topic_prompt = f"Extract the main topic (2-5 words) from:\n\n{lecture_text[:2000]}"
    topic_response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": topic_prompt}]
    )
    topic = topic_response.choices[0].message.content.strip()

    prompt = f"""
    Based on the topic **{topic}** and transcript:
    1. Generate a {data.difficulty}-level quiz with {data.num_questions} MCQs.
    2. Each MCQ must have 4 options and a correct answer.
    3. Provide 3 learning articles (Wikipedia, GeeksforGeeks, Docs).
    4. Provide 2 YouTube videos from verified educational channels.

    Transcript:
    {lecture_text[:8000]}

    Return valid JSON ONLY:
    {{
      "quiz": [{{"question":"...", "options":["..."], "answer":"..."}}],
      "suggestions": {{
        "articles":[{{"topic":"...","link":"..."}}],
        "videos":[{{"title":"...","url":"..."}}]
      }}
    }}
    """

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}]
    )

    raw_output = response.choices[0].message.content.strip()
    json_match = re.search(r"\{.*\}", raw_output, re.DOTALL)
    if json_match:
        raw_output = json_match.group(0)

    try:
        quiz_data = json.loads(raw_output)
    except json.JSONDecodeError:
        return {"error": "Failed to parse quiz JSON. Check model output."}

    return quiz_data