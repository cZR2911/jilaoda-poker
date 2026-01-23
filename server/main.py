from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import json
import os

app = FastAPI()

# Enable CORS to allow requests from the browser
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_FILE = "server/database.json"

class UserLogin(BaseModel):
    username: str
    password: str

class UserData(BaseModel):
    username: str
    chips: int

def load_db():
    if not os.path.exists(DB_FILE):
        return {}
    try:
        with open(DB_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except:
        return {}

def save_db(data):
    with open(DB_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=4)

@app.get("/")
def read_root():
    return {"message": "Poker Server is running"}

@app.post("/login")
def login(user: UserLogin):
    db = load_db()
    if user.username not in db:
        # Auto-register
        db[user.username] = {
            "password": user.password,
            "chips": 1000
        }
        save_db(db)
        return {"status": "registered", "username": user.username, "chips": 1000}
    
    if db[user.username]["password"] != user.password:
        raise HTTPException(status_code=400, detail="密码错误")
    
    return {"status": "success", "username": user.username, "chips": db[user.username]["chips"]}

@app.post("/update_score")
def update_score(data: UserData):
    db = load_db()
    if data.username in db:
        db[data.username]["chips"] = data.chips
        save_db(db)
        return {"status": "updated", "chips": data.chips}
    raise HTTPException(status_code=404, detail="User not found")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
