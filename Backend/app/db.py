from sqlalchemy import create_engine, Column, String, Integer, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

engine = create_engine(DATABASE_URL)

Base = declarative_base()

SessionLocal = sessionmaker(bind=engine)


class PublishedVideo(Base):
    __tablename__ = "published_videos"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(String, unique=True, nullable=False)
    topic = Column(String, nullable=False)
    hook = Column(String)
    youtube_video_id = Column(String, unique=True)
    youtube_url = Column(String)
    published_at = Column(DateTime, default=datetime.utcnow)
    view_count = Column(Integer, default=0)
    like_count = Column(Integer, default=0)
    comment_count = Column(Integer, default=0)
    last_checked_at = Column(DateTime, nullable=True)


def init_db():
    Base.metadata.create_all(bind=engine)