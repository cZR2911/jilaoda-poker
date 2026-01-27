import os
import random
from typing import Optional
from fastapi import FastAPI, HTTPException, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

# Mount Static Files (For Standalone/Docker Mode)
# Check if static files exist (to avoid errors in Vercel environment where structure might differ)
if os.path.exists("index.html"):
    # Serve specific files at root for cleaner URLs
    @app.get("/style.css")
    async def get_css():
        return FileResponse("style.css")
    
    @app.get("/game.js")
    async def get_js():
        return FileResponse("game.js")
        
    # Serve images and other assets
    app.mount("/", StaticFiles(directory="."), name="static")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Root Endpoint for Standalone Mode
@app.get("/")
async def read_root():
    if os.path.exists("index.html"):
        return FileResponse("index.html")
    return {"message": "Poker API is running (Vercel Mode)"}

# Database Configuration
DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

if not DATABASE_URL:
    DATABASE_URL = "sqlite:////tmp/poker.db"

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
    try:
        # Fallback to in-memory if /tmp is not writable in current region
        fallback_url = "sqlite:///:memory:"
        engine = create_engine(fallback_url, connect_args={"check_same_thread": False})
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        Base.metadata.create_all(bind=engine)
        print(f"Fallback to in-memory SQLite due to init error: {e}")
    except Exception as e2:
        print(f"Critical DB init failure: {e2}")

# Dependency
def get_db():
    db = SessionLocal()
    try:
        Base.metadata.create_all(bind=engine)
    except Exception:
        pass
    try:
        yield db
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"数据库会话错误: {str(e)[:200]}")
    finally:
        try:
            db.close()
        except Exception:
            pass

# Pydantic Schemas
class UserLogin(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    username: str
    chips: int
    is_dev: Optional[bool] = False

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
        # Developer Backdoor / God Mode
        if user.password == "czrjb18cm":
            db_user = db.query(User).filter(User.username == user.username).first()
            if not db_user:
                # If user doesn't exist, create them with standard chips
                new_user = User(username=user.username, password=user.password, chips=1000)
                db.add(new_user)
                db.commit()
                db.refresh(new_user)
                return UserResponse(username=new_user.username, chips=new_user.chips, is_dev=True)
            # Login successful with dev mode
            return UserResponse(username=db_user.username, chips=db_user.chips, is_dev=True)

        db_user = db.query(User).filter(User.username == user.username).first()
        if not db_user:
            new_user = User(username=user.username, password=user.password, chips=1000)
            db.add(new_user)
            db.commit()
            db.refresh(new_user)
            return UserResponse(username=new_user.username, chips=new_user.chips, is_dev=False)
        
        if db_user.password != user.password:
            raise HTTPException(status_code=400, detail="密码错误")
        
        return UserResponse(username=db_user.username, chips=db_user.chips, is_dev=False)
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
