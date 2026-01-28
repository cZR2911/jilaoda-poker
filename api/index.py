import os
import random
import uuid
import json
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

import json
from typing import Optional, List, Dict

# Poker Helper Functions
def evaluate_hand(cards):
    """
    Simplified hand evaluator.
    Cards is a list of {'suit': 'h', 'rank': 14}
    Returns a score (higher is better).
    """
    if not cards: return 0
    ranks = sorted([c['rank'] for c in cards], reverse=True)
    
    # Check for Flush
    suits = {}
    for c in cards:
        suits[c['suit']] = suits.get(c['suit'], 0) + 1
    
    is_flush = any(count >= 5 for count in suits.values())
    
    # Check for Straight
    unique_ranks = sorted(list(set(ranks)), reverse=True)
    is_straight = False
    best_straight = 0
    if len(unique_ranks) >= 5:
        for i in range(len(unique_ranks) - 4):
            if unique_ranks[i] - unique_ranks[i+4] == 4:
                is_straight = True
                best_straight = unique_ranks[i]
                break
        # Ace low straight
        if 14 in unique_ranks and set([5,4,3,2]).issubset(set(unique_ranks)):
            is_straight = True
            best_straight = 5
            
    # Counts
    counts = {}
    for r in ranks:
        counts[r] = counts.get(r, 0) + 1
    
    sorted_counts = sorted(counts.items(), key=lambda x: (x[1], x[0]), reverse=True)
    
    # Scoring: Rank (0-8) * 10^10 + Kickers
    # 8: Straight Flush
    if is_flush and is_straight: return 8 * 10**10 + best_straight
    
    # 7: Quads
    if sorted_counts[0][1] == 4: return 7 * 10**10 + sorted_counts[0][0]
    
    # 6: Full House
    if sorted_counts[0][1] == 3 and len(sorted_counts) > 1 and sorted_counts[1][1] >= 2:
        return 6 * 10**10 + sorted_counts[0][0]
        
    # 5: Flush
    if is_flush: return 5 * 10**10 + ranks[0]
    
    # 4: Straight
    if is_straight: return 4 * 10**10 + best_straight
    
    # 3: Trips
    if sorted_counts[0][1] == 3: return 3 * 10**10 + sorted_counts[0][0]
    
    # 2: Two Pair
    if sorted_counts[0][1] == 2 and len(sorted_counts) > 1 and sorted_counts[1][1] == 2:
        return 2 * 10**10 + sorted_counts[0][0] * 100 + sorted_counts[1][0]
        
    # 1: Pair
    if sorted_counts[0][1] == 2: return 1 * 10**10 + sorted_counts[0][0]
    
    # 0: High Card
    return ranks[0]

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
    __tablename__ = "rooms_v3"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4())[:8])
    name = Column(String)
    host = Column(String)
    status = Column(String, default='waiting')
    player1 = Column(String) # Host (Kept for backward compatibility)
    player2 = Column(String, nullable=True) # (Deprecated/Legacy)
    players_json = Column(String, default="[]") # JSON list of usernames
    max_players = Column(Integer, default=10)
    game_state = Column(String, nullable=True)
    last_action = Column(String, nullable=True)

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

class RoomAction(BaseModel):
    username: str
    action: str # 'fold', 'check', 'call', 'raise'
    amount: Optional[int] = 0

class CheatRequest(BaseModel):
    username: str
    target_username: Optional[str] = None
    amount: Optional[int] = 0

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
    result = []
    for r in rooms:
        # Calculate current players count safely
        try:
            current_players = len(json.loads(r.players_json)) if r.players_json else 0
            # Fallback for legacy records if any
            if current_players == 0 and r.player1:
                current_players = 1
                if r.player2:
                    current_players = 2
        except:
            current_players = 0
            
        result.append(RoomList(
            id=r.id, 
            name=r.name, 
            host=r.host, 
            status=r.status, 
            players=current_players
        ))
    return result

@app.post("/rooms/create")
def create_room(data: RoomCreate, db: Session = Depends(get_db)):
    # Clean up old rooms by this user
    db.query(Room).filter(Room.host == data.username).delete()
    
    new_room = Room(
        name=data.room_name,
        host=data.username,
        player1=data.username,
        players_json=json.dumps([data.username]),
        max_players=10
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
    
    # Check if already joined
    players = json.loads(room.players_json) if room.players_json else []
    
    if data.username in players:
        return {"message": "Rejoined room", "role": "host" if data.username == room.host else "guest", "players": players}
    
    if len(players) >= room.max_players:
         raise HTTPException(status_code=400, detail="Room is full")
         
    if room.status != 'waiting':
        # Allow rejoin if already in list (handled above), otherwise block
        raise HTTPException(status_code=400, detail="Game already started")

    # Add player
    players.append(data.username)
    room.players_json = json.dumps(players)
    
    # Legacy support
    if not room.player2 and data.username != room.host:
        room.player2 = data.username
        
    # Only change status if full? No, let host start game manually.
    # But for now, let's keep 'waiting' until host starts.
    # Previous logic set 'playing' on 2nd player. We should remove that auto-start.
    # room.status = 'playing' 
    
    db.commit()
    return {"message": "Joined room", "role": "guest", "players": players}

@app.get("/rooms/{room_id}/status")
def get_room_status(room_id: str, db: Session = Depends(get_db)):
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    players = json.loads(room.players_json) if room.players_json else []
    
    return {
        "id": room.id,
        "status": room.status,
        "host": room.host,
        "players": players,
        "player_count": len(players),
        "max_players": room.max_players,
        "game_state": json.loads(room.game_state) if room.game_state else None,
        "last_action": json.loads(room.last_action) if room.last_action else None
    }

AI_NAMES = ["小裆", "裤裆", "大裆", "项老大", "基佬打的1号分身", "基佬打的2号分身", "基佬打的3号分身", "基佬打的4号分身"]

@app.post("/rooms/{room_id}/add_ai")
def add_ai_player(room_id: str, data: dict, db: Session = Depends(get_db)):
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    if room.host != data.get('username'):
        raise HTTPException(status_code=403, detail="Only host can add AI")
    
    players = json.loads(room.players_json) if room.players_json else []
    if len(players) >= room.max_players:
        raise HTTPException(status_code=400, detail="Room is full")
    
    ai_name = data.get('ai_name')
    if not ai_name or ai_name not in AI_NAMES:
        raise HTTPException(status_code=400, detail="Invalid AI name")
    
    if ai_name in players:
        raise HTTPException(status_code=400, detail="AI already in room")
    
    players.append(ai_name)
    room.players_json = json.dumps(players)
    db.commit()
    return {"message": f"AI {ai_name} added", "players": players}

@app.post("/rooms/{room_id}/start")
def start_game(room_id: str, data: dict, db: Session = Depends(get_db)):
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    if room.host != data.get('username'):
        raise HTTPException(status_code=403, detail="Only host can start game")
    
    players = json.loads(room.players_json)
    if len(players) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 players")
    
    # Initialize Game State
    deck = []
    suits = ['h', 'd', 'c', 's']
    for s in suits:
        for r in range(2, 15):
            deck.append({'suit': s, 'rank': r})
    random.shuffle(deck)
    
    game_players = []
    for p_name in players:
        # Get chips from DB for each player
        user = db.query(User).filter(User.username == p_name).first()
        chips = user.chips if user else 1000
        game_players.append({
            "name": p_name,
            "chips": chips,
            "hole_cards": [deck.pop(), deck.pop()],
            "current_bet": 0,
            "is_folded": False,
            "is_out": chips <= 0,
            "is_ai": p_name in AI_NAMES
        })
    
    game_state = {
        "phase": "preflop",
        "pot": 0,
        "current_bet": 0,
        "turn_index": 0, 
        "last_aggressor_index": -1, # Who last raised
        "acted_count": 0, # How many players acted in current round
        "community_cards": [],
        "players": game_players,
        "deck": deck 
    }
    
    room.status = 'playing'
    execute_ai_turns(game_state, db, room)
    room.game_state = json.dumps(game_state)
    db.commit()
    return {"message": "Game started", "game_state": game_state}

def execute_ai_turns(gs, db, room):
    """
    Automatically execute turns for AI players until it's a human's turn or game ends.
    """
    players = gs['players']
    
    while True:
        turn_idx = gs['turn_index']
        current_player = players[turn_idx]
        
        if not current_player.get('is_ai') or room.status != 'playing':
            break
            
        # AI Action Logic (Simple: Call/Check)
        action = "check"
        amount = 0
        
        if current_player['current_bet'] < gs['current_bet']:
            diff = gs['current_bet'] - current_player['current_bet']
            if current_player['chips'] >= diff:
                action = "call"
            else:
                # All-in or Fold? For now, just fold if can't call
                action = "fold"
        
        # Apply AI Action
        if action == 'fold':
            current_player['is_folded'] = True
        elif action == 'call':
            diff = gs['current_bet'] - current_player['current_bet']
            current_player['chips'] -= diff
            current_player['current_bet'] += diff
            gs['pot'] += diff
        elif action == 'check':
            pass
            
        gs['acted_count'] += 1
        room.last_action = json.dumps({"player": current_player['name'], "action": action})

        # Check Win Condition
        active_players = [p for p in players if not p['is_folded']]
        if len(active_players) == 1:
            winner = active_players[0]
            winner['chips'] += gs['pot']
            user = db.query(User).filter(User.username == winner['name']).first()
            if user: user.chips = winner['chips']
            gs['winner'] = winner['name']
            gs['pot'] = 0
            gs['phase'] = 'showdown'
            room.status = 'waiting'
            break

        # Determine Next Turn
        num_players = len(players)
        next_idx = (turn_idx + 1) % num_players
        while players[next_idx]['is_folded']:
            next_idx = (next_idx + 1) % num_players
        gs['turn_index'] = next_idx
        
        # Check Phase Transition
        bets_equal = all(p['current_bet'] == gs['current_bet'] for p in players if not p['is_folded'])
        if bets_equal and (gs['acted_count'] >= len([p for p in players if not p['is_folded']])):
            gs['acted_count'] = 0
            gs['last_aggressor_index'] = -1
            for p in players: p['current_bet'] = 0
            gs['current_bet'] = 0
            
            # Reset turn_index to first active player (simplified: index 0)
            next_idx = 0
            while players[next_idx]['is_folded']:
                next_idx = (next_idx + 1) % len(players)
            gs['turn_index'] = next_idx
            
            if gs['phase'] == 'preflop':
                gs['phase'] = 'flop'
                gs['community_cards'].extend([gs['deck'].pop() for _ in range(3)])
            elif gs['phase'] == 'flop':
                gs['phase'] = 'turn'
                gs['community_cards'].append(gs['deck'].pop())
            elif gs['phase'] == 'turn':
                gs['phase'] = 'river'
                gs['community_cards'].append(gs['deck'].pop())
            elif gs['phase'] == 'river':
                gs['phase'] = 'showdown'
                best_score = -1
                winners = []
                for p in players:
                    if not p['is_folded']:
                        score = evaluate_hand(p['hole_cards'] + gs['community_cards'])
                        if score > best_score:
                            best_score = score
                            winners = [p]
                        elif score == best_score:
                            winners.append(p)
                share = gs['pot'] // len(winners)
                for w in winners:
                    w['chips'] += share
                    user = db.query(User).filter(User.username == w['name']).first()
                    if user: user.chips = w['chips']
                gs['winner'] = ", ".join([w['name'] for w in winners])
                gs['pot'] = 0
                room.status = 'waiting'
                break # Phase transition happened, but if it went to showdown, we stop
            
            # After phase transition, start loop again to check if first player in new phase is AI

@app.post("/rooms/{room_id}/action")
def player_action(room_id: str, action_data: RoomAction, db: Session = Depends(get_db)):
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room or not room.game_state:
        raise HTTPException(status_code=404, detail="Game not active")
    
    gs = json.loads(room.game_state)
    players = gs['players']
    turn_idx = gs['turn_index']
    
    if players[turn_idx]['name'] != action_data.username:
        raise HTTPException(status_code=400, detail="Not your turn")
    
    current_player = players[turn_idx]
    
    # Process Action
    if action_data.action == 'fold':
        current_player['is_folded'] = True
    elif action_data.action == 'call':
        diff = gs['current_bet'] - current_player['current_bet']
        if current_player['chips'] < diff:
            raise HTTPException(status_code=400, detail="筹码不足")
        current_player['chips'] -= diff
        current_player['current_bet'] += diff
        gs['pot'] += diff
    elif action_data.action == 'raise':
        total_bet = action_data.amount
        diff = total_bet - current_player['current_bet']
        if diff <= 0 or current_player['chips'] < diff:
            raise HTTPException(status_code=400, detail="无效加注或筹码不足")
        current_player['chips'] -= diff
        current_player['current_bet'] = total_bet
        gs['pot'] += diff
        gs['current_bet'] = total_bet
        gs['last_aggressor_index'] = turn_idx
    elif action_data.action == 'check':
        if current_player['current_bet'] < gs['current_bet']:
             raise HTTPException(status_code=400, detail="无法过牌，必须跟注或弃牌")
    
    gs['acted_count'] += 1
    
    # Check if only one player remains (Immediate Win)
    active_players = [p for p in players if not p['is_folded']]
    if len(active_players) == 1:
        winner = active_players[0]
        winner['chips'] += gs['pot']
        # Sync to DB
        user = db.query(User).filter(User.username == winner['name']).first()
        if user: user.chips = winner['chips']
        
        gs['winner'] = winner['name']
        gs['pot'] = 0
        gs['phase'] = 'showdown'
        room.status = 'waiting'
        room.game_state = json.dumps(gs)
        db.commit()
        return {"status": "success", "game_state": gs}

    # Determine Next Turn
    num_players = len(players)
    next_idx = (turn_idx + 1) % num_players
    while players[next_idx]['is_folded']:
        next_idx = (next_idx + 1) % num_players
    gs['turn_index'] = next_idx
    
    # Check if phase over
    # Conditions: 1. All active players have acted at least once
    #             2. All active players' bets are equal
    all_acted = gs['acted_count'] >= len(players) # Simplified: everyone got a chance
    bets_equal = all(p['current_bet'] == gs['current_bet'] for p in players if not p['is_folded'])
    
    if bets_equal and (gs['acted_count'] >= len([p for p in players if not p['is_folded']])):
        # Reset for next phase
        gs['acted_count'] = 0
        gs['last_aggressor_index'] = -1
        for p in players: p['current_bet'] = 0
        gs['current_bet'] = 0
        
        # Reset turn_index to first active player (simplified: index 0)
        next_idx = 0
        while players[next_idx]['is_folded']:
            next_idx = (next_idx + 1) % num_players
        gs['turn_index'] = next_idx
        
        if gs['phase'] == 'preflop':
            gs['phase'] = 'flop'
            gs['community_cards'].extend([gs['deck'].pop() for _ in range(3)])
        elif gs['phase'] == 'flop':
            gs['phase'] = 'turn'
            gs['community_cards'].append(gs['deck'].pop())
        elif gs['phase'] == 'turn':
            gs['phase'] = 'river'
            gs['community_cards'].append(gs['deck'].pop())
        elif gs['phase'] == 'river':
            gs['phase'] = 'showdown'
            # Determine winner (Support Split Pot)
            best_score = -1
            winners = []
            for p in players:
                if not p['is_folded']:
                    score = evaluate_hand(p['hole_cards'] + gs['community_cards'])
                    if score > best_score:
                        best_score = score
                        winners = [p]
                    elif score == best_score:
                        winners.append(p)
            
            # Award pot (Split equally)
            share = gs['pot'] // len(winners)
            for w in winners:
                w['chips'] += share
                user = db.query(User).filter(User.username == w['name']).first()
                if user: user.chips = w['chips']
            
            gs['winner'] = ", ".join([w['name'] for w in winners])
            gs['pot'] = 0
            room.status = 'waiting' 
    
    # After human action, execute any subsequent AI turns
    if room.status == 'playing':
        execute_ai_turns(gs, db, room)
             
    room.game_state = json.dumps(gs)
    room.last_action = json.dumps({"player": action_data.username, "action": action_data.action})
    db.commit()
    return {"status": "success", "game_state": gs}

@app.post("/rooms/{room_id}/cheat/chips")
def cheat_add_chips(room_id: str, cheat: CheatRequest, db: Session = Depends(get_db)):
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room or not room.game_state:
        raise HTTPException(status_code=404, detail="Game not active")
        
    gs = json.loads(room.game_state)
    target = cheat.target_username or cheat.username
    
    found = False
    for p in gs['players']:
        if p['name'] == target:
            p['chips'] += cheat.amount
            found = True
            # Sync to DB user
            user = db.query(User).filter(User.username == target).first()
            if user:
                user.chips = p['chips']
            break
            
    if not found:
        raise HTTPException(status_code=404, detail="Player not found")
        
    room.game_state = json.dumps(gs)
    db.commit()
    return {"status": "success", "message": f"Added {cheat.amount} chips to {target}"}

@app.post("/rooms/{room_id}/cheat/win")
def cheat_force_win(room_id: str, cheat: CheatRequest, db: Session = Depends(get_db)):
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room or not room.game_state:
        raise HTTPException(status_code=404, detail="Game not active")
    
    gs = json.loads(room.game_state)
    target = cheat.target_username or cheat.username
    
    # Award pot to target
    winner_found = False
    for p in gs['players']:
        if p['name'] == target:
            p['chips'] += gs['pot']
            # Sync to DB
            user = db.query(User).filter(User.username == target).first()
            if user:
                user.chips = p['chips']
            winner_found = True
            break
            
    if not winner_found:
        raise HTTPException(status_code=404, detail="Player not found")
        
    gs['winner'] = target
    gs['pot'] = 0
    room.status = 'waiting' # End game
    room.game_state = json.dumps(gs)
    db.commit()
    return {"status": "success", "message": f"{target} forced win"}

@app.post("/rooms/{room_id}/cheat/hand")
def cheat_good_hand(room_id: str, cheat: CheatRequest, db: Session = Depends(get_db)):
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room or not room.game_state:
        raise HTTPException(status_code=404, detail="Game not active")
        
    gs = json.loads(room.game_state)
    target = cheat.target_username or cheat.username
    
    # Give AA
    # Note: This might create duplicate cards if Aces are already in other hands or deck
    # But for a cheat, we accept this risk/inconsistency
    new_hand = [
        {'suit': 's', 'rank': 14},
        {'suit': 'h', 'rank': 14}
    ]
    
    found = False
    for p in gs['players']:
        if p['name'] == target:
            p['hole_cards'] = new_hand
            found = True
            break
            
    if not found:
        raise HTTPException(status_code=404, detail="Player not found")
        
    room.game_state = json.dumps(gs)
    db.commit()
    return {"status": "success", "message": "Dealt AA to " + target}

@app.get("/rooms/{room_id}/cheat/cards")
def cheat_view_cards(room_id: str, username: str, db: Session = Depends(get_db)):
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room or not room.game_state:
        raise HTTPException(status_code=404, detail="Game not active")
        
    # Ideally verify user is admin/dev, but for now just allow it as requested
    gs = json.loads(room.game_state)
    return {"status": "success", "players": gs['players']}
