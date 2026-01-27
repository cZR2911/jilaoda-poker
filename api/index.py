import os
import random
import uuid
from typing import Optional, List
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

class Room(Base):
    __tablename__ = "rooms"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4())[:8])
    name = Column(String)
    host = Column(String)
    status = Column(String, default='waiting')
    player1 = Column(String) # Host
    player2 = Column(String, nullable=True) # Challenger

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

class RoomCreate(BaseModel):
    username: str
    room_name: str

class RoomJoin(BaseModel):
    username: str
    room_id: str

class RoomList(BaseModel):
    id: str
    name: str
    host: str
    status: str # 'waiting', 'playing'
    players: int

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

# Room Endpoints
@app.get("/rooms", response_model=List[RoomList])
def get_rooms(db: Session = Depends(get_db)):
    rooms = db.query(Room).filter(Room.status == 'waiting').all()
    return [
        RoomList(
            id=r.id, 
            name=r.name, 
            host=r.host, 
            status=r.status, 
            players=1 if not r.player2 else 2
        ) 
        for r in rooms
    ]

@app.post("/rooms/create")
def create_room(data: RoomCreate, db: Session = Depends(get_db)):
    # Clean up old rooms by this user
    db.query(Room).filter(Room.host == data.username).delete()
    
    new_room = Room(
        name=data.room_name,
        host=data.username,
        player1=data.username
    )
    db.add(new_room)
    db.commit()
    db.refresh(new_room)
    return {"room_id": new_room.id, "message": "Room created"}

@app.post("/rooms/join")
def join_room(data: RoomJoin, db: Session = Depends(get_db)):
    room = db.query(Room).filter(Room.id == data.room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    if room.status != 'waiting':
        raise HTTPException(status_code=400, detail="Room is full or playing")
        
    if room.player1 == data.username:
        return {"message": "Rejoined own room", "role": "host"}
        
    room.player2 = data.username
    room.status = 'playing'
    db.commit()
    return {"message": "Joined room", "role": "guest"}
