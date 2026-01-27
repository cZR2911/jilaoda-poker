import os
import random
from typing import Optional
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database Configuration
DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

if not DATABASE_URL:
    # Use SQLite for local development
    # Note: SQLite in Vercel is read-only or ephemeral. For persistence, use Postgres (Supabase/Neon)
    if os.environ.get("VERCEL"):
        DATABASE_URL = "sqlite:////tmp/poker.db"
    else:
        DATABASE_URL = "sqlite:///./poker.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Models
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    password = Column(String)
    chips = Column(Integer, default=1000)

# SAFELY Create Tables
# Wrapping this in try/except prevents the 500 Error during module import
try:
    Base.metadata.create_all(bind=engine)
except Exception as e:
    print(f"Warning: Database init failed (likely due to read-only FS or cold start): {e}")

# Dependency
def get_db():
    db = SessionLocal()
    # Ensure tables exist (for ephemeral SQLite in /tmp)
    try:
        Base.metadata.create_all(bind=engine)
    except:
        pass
    try:
        yield db
    finally:
        db.close()

# Pydantic Schemas
class UserLogin(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    username: str
    chips: int

class ScoreUpdate(BaseModel):
    username: str
    chips: int

class AdminReset(BaseModel):
    admin_key: str
    target_username: str
    new_password: str

# Config
# 简单的硬编码管理员密钥，实际生产环境应放在环境变量中
ADMIN_SECRET_KEY = os.getenv("ADMIN_SECRET_KEY", "888")

@app.get("/api/health")
def health_check():
    return {"status": "ok", "message": "Poker Server is running"}

@app.get("/health")
def health_check_root():
    return {"status": "ok", "message": "Poker Server is running"}

@app.post("/login", response_model=UserResponse)
def login(user: UserLogin, db: Session = Depends(get_db)):
    try:
        db_user = db.query(User).filter(User.username == user.username).first()
        if not db_user:
            new_user = User(username=user.username, password=user.password, chips=1000)
            db.add(new_user)
            db.commit()
            db.refresh(new_user)
            return UserResponse(username=new_user.username, chips=new_user.chips)
        
        if db_user.password != user.password:
            raise HTTPException(status_code=400, detail="密码错误")
        
        return UserResponse(username=db_user.username, chips=db_user.chips)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"服务器错误: {str(e)[:200]}")

@app.post("/update_score")
def update_score(update: ScoreUpdate, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.username == update.username).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    db_user.chips = update.chips
    db.commit()
    return {"status": "success", "chips": db_user.chips}

@app.post("/admin/reset_password")
def admin_reset_password(reset: AdminReset, db: Session = Depends(get_db)):
    if reset.admin_key != ADMIN_SECRET_KEY:
        raise HTTPException(status_code=403, detail="管理员密钥错误")
    
    db_user = db.query(User).filter(User.username == reset.target_username).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="目标用户不存在")
    
    db_user.password = reset.new_password
    db.commit()
    return {"status": "success", "message": f"用户 {reset.target_username} 密码已重置"}
