from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session

load_dotenv()

app = FastAPI()

# Database Configuration
# Priority: Environment Variable (Cloud) > Local SQLite
DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

if not DATABASE_URL:
    # Use SQLite for local development (creates a file named poker.db)
    DATABASE_URL = "sqlite:///./poker.db"

# SQLAlchemy Setup
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Database Model
class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    password = Column(String)
    chips = Column(Integer, default=1000)

# Create tables automatically
Base.metadata.create_all(bind=engine)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class UserLogin(BaseModel):
    username: str
    password: str

class UserData(BaseModel):
    username: str
    chips: int

class AdminResetPassword(BaseModel):
    admin_key: str
    target_username: str
    new_password: str

# 简单的硬编码管理员密钥，实际生产环境应放在环境变量中
ADMIN_SECRET_KEY = os.getenv("ADMIN_SECRET_KEY", "czr大帅哥")

@app.get("/")
def health_check():
    return {"status": "ok", "message": "Poker Server is running"}

@app.post("/login")
def login(user_data: UserLogin, db: Session = Depends(get_db)):
    # Check if user exists
    user = db.query(User).filter(User.username == user_data.username).first()
    
    if not user:
        # Register new user
        new_user = User(username=user_data.username, password=user_data.password, chips=1000)
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        return {"status": "registered", "username": new_user.username, "chips": new_user.chips}
    
    # Verify password
    if user.password != user_data.password:
        raise HTTPException(status_code=400, detail="密码错误")
    
    return {"status": "success", "username": user.username, "chips": user.chips}

@app.post("/update_score")
def update_score(data: UserData, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == data.username).first()
    if user:
        user.chips = data.chips
        db.commit()
        return {"status": "updated", "chips": data.chips}
    raise HTTPException(status_code=404, detail="User not found")

@app.post("/admin/reset_password")
def admin_reset_password(data: AdminResetPassword, db: Session = Depends(get_db)):
    if data.admin_key != ADMIN_SECRET_KEY:
        raise HTTPException(status_code=403, detail="管理员密钥错误")
    
    user = db.query(User).filter(User.username == data.target_username).first()
    if not user:
        raise HTTPException(status_code=404, detail="目标用户不存在")
    
    user.password = data.new_password
    db.commit()
    return {"status": "success", "message": f"User {data.target_username} password reset successfully"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)