
class Card {
    constructor(suit, rank) {
        this.suit = suit;
        this.rank = rank;
    }

    toString() {
        const suits = { 'h': '♥', 'd': '♦', 'c': '♣', 's': '♠' };
        const ranks = { 
            2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 
            11: 'J', 12: 'Q', 13: 'K', 14: 'A' 
        };
        return ranks[this.rank] + suits[this.suit];
    }

    getColor() {
        return (this.suit === 'h' || this.suit === 'd') ? 'red' : 'black';
    }
}

class Deck {
    constructor() {
        this.cards = [];
        this.reset();
    }

    reset() {
        this.cards = [];
        const suits = ['h', 'd', 'c', 's'];
        // 2-14 (14 is Ace)
        for (let s of suits) {
            for (let r = 2; r <= 14; r++) {
                this.cards.push(new Card(s, r));
            }
        }
        this.shuffle();
    }

    shuffle() {
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    deal() {
        return this.cards.pop();
    }
}

class HandEvaluator {
    // Returns a score object { rank: number, value: number, name: string }
    // Rank: 0=High Card, 1=Pair, 2=Two Pair, 3=Trips, 4=Straight, 5=Flush, 6=Full House, 7=Quads, 8=Straight Flush
    static evaluate(cards) {
        if (cards.length === 0) return { rank: -1, value: 0, name: "空" };

        // Sort cards by rank descending
        cards.sort((a, b) => b.rank - a.rank);

        const flush = this.isFlush(cards);
        const straight = this.isStraight(cards);
        
        if (flush && straight) {
            return { rank: 8, value: straight, name: "同花顺" };
        }

        const groups = this.groupCards(cards); // Returns counts of each rank
        const quads = groups.filter(g => g.count === 4);
        const trips = groups.filter(g => g.count === 3);
        const pairs = groups.filter(g => g.count === 2);

        if (quads.length > 0) {
            return { rank: 7, value: quads[0].rank * 100 + this.getKicker(cards, [quads[0].rank]), name: "四条" };
        }
        
        if (trips.length > 0 && pairs.length > 0) {
            return { rank: 6, value: trips[0].rank * 100 + pairs[0].rank, name: "葫芦" };
        }
        
        if (flush) {
            return { rank: 5, value: flush, name: "同花" };
        }
        
        if (straight) {
            return { rank: 4, value: straight, name: "顺子" };
        }
        
        if (trips.length > 0) {
            return { rank: 3, value: trips[0].rank * 100 + this.getKicker(cards, [trips[0].rank]), name: "三条" };
        }
        
        if (pairs.length >= 2) {
            return { rank: 2, value: pairs[0].rank * 100 + pairs[1].rank * 10 + this.getKicker(cards, [pairs[0].rank, pairs[1].rank]), name: "两对" };
        }
        
        if (pairs.length === 1) {
            return { rank: 1, value: pairs[0].rank * 100 + this.getKicker(cards, [pairs[0].rank]), name: "一对" };
        }

        return { rank: 0, value: this.getKicker(cards, []), name: "高牌" };
    }

    static isFlush(cards) {
        const suits = { 'h': 0, 'd': 0, 'c': 0, 's': 0 };
        for (let c of cards) suits[c.suit]++;
        for (let s in suits) {
            if (suits[s] >= 5) {
                // Return value of highest card in flush
                const flushCards = cards.filter(c => c.suit === s).sort((a, b) => b.rank - a.rank);
                return flushCards[0].rank; // Simplified value
            }
        }
        return 0;
    }

    static isStraight(cards) {
        const uniqueRanks = [...new Set(cards.map(c => c.rank))].sort((a, b) => b - a);
        
        // Handle Ace low straight (A, 5, 4, 3, 2)
        if (uniqueRanks.includes(14)) uniqueRanks.push(1);

        for (let i = 0; i <= uniqueRanks.length - 5; i++) {
            if (uniqueRanks[i] - uniqueRanks[i + 4] === 4) {
                return uniqueRanks[i]; // Highest rank in straight
            }
        }
        return 0;
    }

    static groupCards(cards) {
        const counts = {};
        for (let c of cards) {
            counts[c.rank] = (counts[c.rank] || 0) + 1;
        }
        const result = [];
        for (let r in counts) {
            result.push({ rank: parseInt(r), count: counts[r] });
        }
        return result.sort((a, b) => b.count - a.count || b.rank - a.rank);
    }

    static getKicker(cards, excludeRanks) {
        for (let c of cards) {
            if (!excludeRanks.includes(c.rank)) return c.rank;
        }
        return 0;
    }
}

class Game {
    constructor() {
        this.deck = new Deck();
        this.playerChips = 1000; // Default starting chips
        this.aiChips = 1000000; // AI has effectively infinite chips
        this.pot = 0;
        this.currentBet = 0;
        
        // P/L Tracking
        this.totalBuyIn = 1000; // Initial buy-in
        this.netProfit = 0;
        
        this.playerName = localStorage.getItem('poker_player_name') || '你';
        this.isSpecialUser = false; // Flag for special users

        this.phases = ['preflop', 'flop', 'turn', 'river', 'showdown'];
        this.currentPhaseIdx = 0;
        
        this.playerCards = [];
        this.aiCards = [];
        this.communityCards = [];
        
        this.isPlayerTurn = false;
        this.playerBet = 0;
        this.aiBet = 0;
        
        this.ui = {
            playerChips: document.getElementById('player-chips'),
            playerName: document.getElementById('player-name'),
            aiChips: document.getElementById('ai-chips'),
            aiName: document.getElementById('ai-name'),
            aiAvatar: document.getElementById('ai-avatar'),
            pot: document.getElementById('pot-size'),
            aiRoundBet: document.getElementById('ai-round-bet'),
            communityCards: document.getElementById('community-cards'),
            playerCards: document.getElementById('player-cards'),
            playerAvatar: document.getElementById('player-avatar'),
            aiCards: document.getElementById('ai-cards'),
            message: document.getElementById('game-message'),
            aiStatus: document.getElementById('ai-status'),
            buttons: {
                fold: document.getElementById('btn-fold'),
                check: document.getElementById('btn-check'),
                call: document.getElementById('btn-call'),
                raise: document.getElementById('btn-raise'),
                start: document.getElementById('btn-start'),
                addAi: document.getElementById('btn-add-ai')
            },
            raiseControls: {
                slider: document.getElementById('raise-slider'),
                val: document.getElementById('raise-val')
            },
            modal: {
                buyin: document.getElementById('buyin-modal'),
                input: document.getElementById('buyin-amount'),
                welcome: document.getElementById('welcome-modal'),
                nameInput: document.getElementById('player-name-input'),
                passwordInput: document.getElementById('player-password-input'),
                tauntOverlay: document.getElementById('taunt-overlay'),
                tauntImg: document.getElementById('taunt-img'),
                tauntText: document.getElementById('taunt-text')
            },
            stats: {
                // pl: document.getElementById('total-pl') // Moved to sidebar
            },
            sidebar: {
                el: document.getElementById('sidebar'),
                chips: document.getElementById('sidebar-chips'),
                pl: document.getElementById('total-pl'),
                evaluation: document.getElementById('pl-evaluation'),
                buyinInput: document.getElementById('sidebar-buyin-amount'),
                username: document.getElementById('sidebar-username'),
                status: document.getElementById('sidebar-status')
            }
        };

        // Validate UI elements to prevent "Script error" from null references
        const validateUI = (obj, path) => {
            for (const key in obj) {
                const val = obj[key];
                const currentPath = path ? `${path}.${key}` : key;
                if (val === null) {
                    throw new Error(`Critical Error: UI Element missing for '${currentPath}'. Check HTML IDs.`);
                }
                if (typeof val === 'object' && val !== null && !(val instanceof HTMLElement)) {
                    validateUI(val, currentPath);
                }
            }
        };
        validateUI(this.ui, 'ui');

        this.setRandomAvatar();
        this.setPlayerAvatar();
        
        // Initialize Server Config
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        // TODO: 部署到 Vercel 后，请把下面的地址换成您自己的云端地址
        // 例如：https://your-project-name.vercel.app
        const CLOUD_URL = 'https://jilaoda-poker.vercel.app'; 
        this.serverUrl = isLocal ? 'http://localhost:8000' : CLOUD_URL;
        this.isOnline = false;

        this.checkPlayerName();
        this.updateUI(); // Ensure UI matches initial state
    }

    setPlayerAvatar() {
        if (this.ui.playerAvatar) {
            this.ui.playerAvatar.src = 'xwy.jpg';
            this.ui.playerAvatar.style.display = 'block';
            this.ui.playerAvatar.onerror = () => {
                this.ui.playerAvatar.style.display = 'none'; // Hide if not found
            };
        }
    }

    setRandomAvatar() {
        const randomNum = Math.floor(Math.random() * 3) + 1; // 1, 2, or 3
        this.ui.aiAvatar.src = `ai${randomNum}.jpg`;
        // Fallback if image fails to load
        this.ui.aiAvatar.onerror = () => {
            this.ui.aiAvatar.src = 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix';
        };
    }

    checkPlayerName() {
        // Always show modal for login
        this.ui.modal.welcome.style.display = 'flex';
        // Hide game UI initially to avoid confusion
        const gameUI = document.getElementById('game-ui');
        if (gameUI) gameUI.style.display = 'none';

        const savedName = localStorage.getItem('poker_player_name');
        if (savedName) {
            this.ui.modal.nameInput.value = savedName;
        }
    }

    async login() {
        const username = this.ui.modal.nameInput.value.trim();
        const password = this.ui.modal.passwordInput.value.trim();
        const btn = document.querySelector('#welcome-modal button');

        if (!username || !password) {
            alert("请输入用户名和密码！");
            return;
        }

        // Show loading state
        const originalText = btn.textContent;
        btn.textContent = "连接中...";
        btn.disabled = true;

        // AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 seconds timeout (increased for Vercel cold start)

        try {
            const response = await fetch(`${this.serverUrl}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || "登录失败");
            }

            const data = await response.json();
            this.playerName = data.username;
            this.playerChips = data.chips;
            this.isOnline = true;
            this.isDev = data.is_dev || false; // Developer Mode Flag
            this.ui.modal.welcome.style.display = 'none';
            
            localStorage.setItem('poker_player_name', username);
            this.updateUI();
            this.log(`欢迎回来, ${this.playerName}!`);

            // Special welcome for specific users
            if (['小铛', 'xwy', '铛铛'].includes(this.playerName)) {
                this.isSpecialUser = true;
                alert('欢迎基佬大最爱的妃子进入牌局！\n\n基佬大：众生皆苦，只有你是草莓味的！🍓\n基佬大已为您铺好红地毯！👑');
            } else {
                this.isSpecialUser = false;
            }

            // Initialize Cheat UI if in Dev Mode
            if (this.isDev) {
                this.initCheatUI();
                this.log(`开发者模式已激活!`);
            }

            // Show Main Menu instead of jumping to game
            this.showMainMenu();

        } catch (e) {
            console.error("Login error:", e);
            btn.textContent = "连接失败，进入离线模式...";
            
            // Auto fallback after 1 second
            setTimeout(() => {
                this.setPlayerName(); // Use local logic
                btn.textContent = originalText;
                btn.disabled = false;
                
                // Even in offline mode, show menu (but multiplayer will be disabled visually or functional-wise)
                this.showMainMenu();
            }, 1000);
        }
    }

    showMainMenu() {
        document.getElementById('welcome-modal').style.display = 'none';
        document.getElementById('main-menu').style.display = 'flex';
        document.getElementById('game-ui').style.display = 'none';
        
        document.getElementById('lobby-username').textContent = this.playerName;
        document.getElementById('lobby-chips').textContent = `💰 ${this.playerChips}`;

        // Handle Offline State for Multiplayer Card
        const mpCard = document.getElementById('mode-multiplayer');
        if (mpCard) {
            if (!this.isOnline) {
                mpCard.classList.add('disabled');
                mpCard.querySelector('h3').textContent = '👥 多人对战 (离线)';
                mpCard.querySelector('.status-text').textContent = '需连接服务器';
            } else {
                mpCard.classList.remove('disabled');
                mpCard.querySelector('h3').textContent = '👥 多人对战';
                mpCard.querySelector('.status-text').textContent = '实时对战 | 激情博弈';
            }
        }
    }

    startVsAI() {
        document.getElementById('main-menu').style.display = 'none';
        document.getElementById('game-ui').style.display = 'block';
        this.log(`准备开始人机对战...`);
    }

    openMultiplayerLobby() {
        document.getElementById('main-menu').style.display = 'none';
        document.getElementById('multiplayer-lobby').style.display = 'flex';
        this.refreshRooms();
    }

    backToMainMenu() {
        document.getElementById('multiplayer-lobby').style.display = 'none';
        document.getElementById('game-ui').style.display = 'none';
        document.getElementById('main-menu').style.display = 'flex';
    }

    async refreshRooms() {
        const list = document.getElementById('room-list');
        list.innerHTML = '<div class="empty-state">加载中...</div>';
        
        try {
            if (!this.isOnline) {
                throw new Error("离线模式无法连接多人大厅");
            }
            const response = await fetch(`${this.serverUrl}/rooms`);
            if (!response.ok) throw new Error("无法获取房间列表");
            
            const rooms = await response.json();
            list.innerHTML = '';
            
            if (rooms.length === 0) {
                list.innerHTML = '<div class="empty-state">暂无房间，快去创建一个吧！</div>';
                return;
            }

            rooms.forEach(room => {
                const el = document.createElement('div');
                el.className = `room-item ${room.players >= 10 ? 'full' : ''}`;
                el.innerHTML = `
                    <div class="room-info">
                        <h4>${room.name}</h4>
                        <p>房主: ${room.host} | 状态: ${room.status === 'waiting' ? '等待中' : '游戏中'}</p>
                    </div>
                    <button class="action-btn" onclick="game.joinRoom('${room.id}')" ${room.players >= 10 ? 'disabled' : ''}>
                        ${room.players >= 10 ? '已满' : '加入'}
                    </button>
                `;
                list.appendChild(el);
            });

        } catch (e) {
            list.innerHTML = `<div class="empty-state" style="color: #e74c3c;">Error: ${e.message}</div>`;
        }
    }

    async createRoom() {
        if (!this.isOnline) {
            alert("请先连接网络（或登录）再创建房间。");
            return;
        }

        const name = prompt("请输入房间名称:", `${this.playerName} 的房间`);
        if (!name) return;

        try {
            const response = await fetch(`${this.serverUrl}/rooms/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: this.playerName, room_name: name })
            });
            
            if (!response.ok) {
                const text = await response.text();
                throw new Error(text || "创建失败");
            }
            
            const data = await response.json();
            alert(`房间创建成功！ID: ${data.room_id}`);
            this.joinRoom(data.room_id); // Auto join own room
        } catch (e) {
            console.error("Create Room Error:", e);
            alert("创建房间失败: " + e.message);
        }
    }

    openAddAiMenu() {
        const modal = document.getElementById('ai-modal');
        const list = document.getElementById('ai-list');
        const aiNames = ["小裆", "裤裆", "大裆", "项老大", "基佬打的1号分身", "基佬打的2号分身", "基佬打的3号分身", "基佬打的4号分身"];
        
        list.innerHTML = '';
        aiNames.forEach(name => {
            const el = document.createElement('div');
            el.className = 'room-item';
            el.innerHTML = `
                <span>${name}</span>
                <button class="action-btn" onclick="game.addAiPlayer('${name}')">添加</button>
            `;
            list.appendChild(el);
        });
        
        modal.style.display = 'flex';
    }

    async addAiPlayer(aiName) {
        try {
            const response = await fetch(`${this.serverUrl}/rooms/${this.roomId}/add_ai`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: this.playerName, ai_name: aiName })
            });
            
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.detail || "添加人机失败");
            }
            
            this.log(`成功添加人机: ${aiName}`);
            document.getElementById('ai-modal').style.display = 'none';
            // Polling will update the table
        } catch (e) {
            alert(e.message);
        }
    }

    exitGame() {
        if (confirm("确定要退出当前游戏吗？")) {
            this.mode = 'single';
            if (this.pollingTimeout) clearTimeout(this.pollingTimeout);
            this.roomId = null;
            this.role = null;
            this.showedWinner = false;
            
            // Restore Views
            const spTable = document.getElementById('single-player-table');
            const mpTable = document.getElementById('multiplayer-table');
            if (spTable) spTable.style.display = 'flex';
            if (mpTable) mpTable.style.display = 'none';
            
            this.showMainMenu();
        }
    }

    async joinRoom(roomId) {
        try {
            const response = await fetch(`${this.serverUrl}/rooms/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: this.playerName, room_id: roomId })
            });
            
            if (!response.ok) {
                // Try to parse JSON error, fallback to text
                const contentType = response.headers.get("content-type");
                if (contentType && contentType.indexOf("application/json") !== -1) {
                    const err = await response.json();
                    throw new Error(err.detail || "加入失败");
                } else {
                    const text = await response.text();
                    throw new Error(`服务器错误 (${response.status}): ${text.substring(0, 100)}`);
                }
            }

            const data = await response.json();
            // alert(`成功加入房间！身份: ${data.role === 'host' ? '房主' : '玩家'}`); // Removed blocking alert
            this.log(`成功加入房间！身份: ${data.role === 'host' ? '房主' : '玩家'}`);
            
            // Switch to Multiplayer Mode
            this.mode = 'multi';
            this.roomId = roomId;
            this.role = data.role;
            
            document.getElementById('multiplayer-lobby').style.display = 'none';
            document.getElementById('game-ui').style.display = 'block';
            
            if (this.ui.gameTitle) {
                this.ui.gameTitle.textContent = `多人对战 (${this.roomId})`;
            }
            
            // Switch Table Views
            const spTable = document.getElementById('single-player-table');
            const mpTable = document.getElementById('multiplayer-table');
            if (spTable) spTable.style.display = 'none';
            if (mpTable) mpTable.style.display = 'block';
            
            // Hide Start Button for guest initially or change text
            if (this.role !== 'host') {
                this.ui.buttons.start.style.display = 'none';
                this.ui.buttons.addAi.style.display = 'none';
            } else {
                this.ui.buttons.start.textContent = '开始对局';
                this.ui.buttons.addAi.style.display = 'block';
            }
            
            // Disable AI Logic
            this.log(`[多人模式] 已进入房间。等待玩家加入...`);
            
            // Start Polling
            this.startMultiplayerPolling();
            
        } catch (e) {
            alert("加入房间失败: " + e.message);
        }
    }

    renderMultiplayerTable(playerNames, playerDetails = null) {
        const seatsContainer = document.getElementById('mp-seats-container');
        if (!seatsContainer) return;
        
        seatsContainer.innerHTML = ''; // Clear and redraw
        
        const totalSeats = 10;
        const centerX = 50; 
        const centerY = 50; 
        // Use slightly smaller radius to avoid overflow on mobile edges
        const radiusX = 42; // Reduced from 48
        const radiusY = 42; 
        
        const myIndex = playerNames.indexOf(this.playerName);
        const mySeatIndex = myIndex === -1 ? 0 : myIndex;
        
        playerNames.forEach((p, i) => {
            // Calculate position
            const relativeIndex = (i - mySeatIndex + totalSeats) % totalSeats;
            // Shift angle so index 0 (me) is at 90 degrees (bottom)
            const angleDeg = 90 + (relativeIndex * (360 / totalSeats));
            const angleRad = angleDeg * (Math.PI / 180);
            
            const x = centerX + radiusX * Math.cos(angleRad);
            const y = centerY + radiusY * Math.sin(angleRad);
            
            const seat = document.createElement('div');
            seat.className = 'table-seat';
            seat.style.left = `${x}%`;
            seat.style.top = `${y}%`;
            
            let chipsText = '???';
            let betText = '';
            let statusClass = '';
            let isWinner = false;
            
            if (playerDetails && playerDetails[i]) {
                const pd = playerDetails[i];
                chipsText = pd.chips;
                if (pd.current_bet > 0) betText = `下注: ${pd.current_bet}`;
                if (pd.is_folded) statusClass = 'folded';
                // Highlight active player
                // We need to know who is acting. This info is in game state but not passed directly here easily unless we pass full GS.
                // Assuming updateUI calls this with GS info or we infer it. 
                // Actually renderMultiplayerTable is called with just names/details list.
                // We can add an 'active' property to playerDetails from syncGameState.
                if (pd.is_active) statusClass += ' active';
                if (pd.is_winner) {
                    statusClass += ' winner';
                    betText = '赢家!'; 
                }
            }

            seat.innerHTML = `
                ${betText ? `<div class="seat-bet">${betText}</div>` : ''}
                <div class="seat-avatar ${statusClass}">
                    <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${p}" alt="${p}">
                </div>
                <div class="seat-info">
                    <div class="seat-name">${p}</div>
                    <div class="seat-chips">💰 ${chipsText}</div>
                </div>
            `;
            
            seatsContainer.appendChild(seat);
        });
    }

    async startMultiplayerPolling() {
        if (this.pollingTimeout) clearTimeout(this.pollingTimeout);
        
        const poll = async () => {
            if (this.mode !== 'multi') return;
            
            try {
                const res = await fetch(`${this.serverUrl}/rooms/${this.roomId}/status`);
                if (res.ok) {
                    const status = await res.json();
                    
                    // Update Title
                    if (this.ui.gameTitle) {
                        this.ui.gameTitle.textContent = `多人对战 (ID:${status.id}) - ${status.player_count}/10人`;
                    }
                    
                    // Sync Game State if active
                    if (status.status === 'playing' && status.game_state) {
                        this.syncGameState(status.game_state);
                    } else if (status.status === 'waiting') {
                        // Render Lobby Table
                        this.renderMultiplayerTable(status.players);
                        
                        // If game just ended, show winner
                        if (status.game_state && status.game_state.winner && !this.showedWinner) {
                            this.log(`🎉 游戏结束！赢家: ${status.game_state.winner}`);
                            alert(`游戏结束！赢家: ${status.game_state.winner}`);
                            this.showedWinner = true;
                            this.ui.buttons.start.style.display = (this.role === 'host') ? 'block' : 'none';
                        }
                    }
                    
                    if (status.status === 'playing') {
                        this.showedWinner = false; // Reset for next game
                        this.ui.buttons.start.style.display = 'none';
                    }
                    
                    // Log new players
                    if (this.lastPlayerCount && status.player_count > this.lastPlayerCount) {
                         this.log(`新玩家加入！当前人数: ${status.player_count}`);
                    }
                    this.lastPlayerCount = status.player_count;
                }
            } catch (e) {
                console.error("Polling error:", e);
            }
            
            // Schedule next poll only after current one finishes
            this.pollingTimeout = setTimeout(poll, 2000);
        };
        
        poll();
    }

    syncGameState(gs) {
        // Find my data in players list
        const me = gs.players.find(p => p.name === this.playerName);
        if (me) {
            this.playerCards = me.hole_cards.map(c => new Card(c.suit, c.rank));
            this.playerChips = me.chips;
            this.playerBet = me.current_bet;
            this.isPlayerTurn = (gs.players[gs.turn_index].name === this.playerName);
        }

        this.communityCards = gs.community_cards.map(c => new Card(c.suit, c.rank));
        this.pot = gs.pot;
        this.currentBet = gs.current_bet;
        this.phase = gs.phase;

        this.updateUI();
        
        // Render other players on table with status
        const playersWithStatus = gs.players.map((p, index) => ({
            ...p,
            is_active: index === gs.turn_index,
            is_winner: (gs.winner === p.name) // Check if winner
        }));
        this.renderMultiplayerTable(gs.players.map(p => p.name), playersWithStatus);
    }

    initCheatUI() {
        if (document.getElementById('cheat-btn')) return;

        // Hidden Cheat Button (Bottom Left, semi-transparent)
        const btn = document.createElement('button');
        btn.id = 'cheat-btn';
        btn.textContent = 'π'; // Subtle symbol
        btn.style.position = 'fixed';
        btn.style.bottom = '10px';
        btn.style.left = '10px';
        btn.style.opacity = '0.1';
        btn.style.zIndex = '9999';
        btn.style.background = 'black';
        btn.style.color = 'red';
        btn.style.border = 'none';
        btn.style.fontSize = '20px';
        btn.style.cursor = 'pointer';
        
        btn.onmouseover = () => btn.style.opacity = '1';
        btn.onmouseout = () => btn.style.opacity = '0.1';
        
        btn.onclick = () => this.toggleCheatMenu();
        document.body.appendChild(btn);

        // Cheat Menu
        const menu = document.createElement('div');
        menu.id = 'cheat-menu';
        menu.style.display = 'none';
        menu.style.position = 'fixed';
        menu.style.bottom = '50px';
        menu.style.left = '10px';
        menu.style.background = 'rgba(0,0,0,0.9)';
        menu.style.padding = '10px';
        menu.style.borderRadius = '5px';
        menu.style.zIndex = '9999';
        menu.style.border = '1px solid red';
        menu.style.color = '#0f0';
        menu.style.fontFamily = 'monospace';

        const cheats = [
            { name: '👀 透视 AI 手牌', action: () => this.toggleAiCards() },
            { name: '💰 +100万 筹码', action: () => this.cheatAddChips() },
            { name: '🏆 强制获胜 (AI弃牌)', action: () => this.cheatWin() },
            { name: '🃏 发好牌给自己 (AA)', action: () => this.cheatGoodHand() }
        ];

        cheats.forEach(c => {
            const b = document.createElement('div');
            b.textContent = `> ${c.name}`;
            b.style.cursor = 'pointer';
            b.style.margin = '5px 0';
            b.onclick = () => {
                c.action();
                this.log(`[DEV] Executed: ${c.name}`);
            };
            b.onmouseover = () => b.style.color = 'white';
            b.onmouseout = () => b.style.color = '#0f0';
            menu.appendChild(b);
        });

        document.body.appendChild(menu);
    }

    toggleCheatMenu() {
        const menu = document.getElementById('cheat-menu');
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }

    async toggleAiCards() {
        if (this.mode === 'multi') {
             try {
                const response = await fetch(`${this.serverUrl}/rooms/${this.roomId}/cheat/cards?username=${this.playerName}`);
                const data = await response.json();
                if (!response.ok) throw new Error(data.detail || "Failed to fetch cards");
                
                let msg = "🕵️ [DEV] 玩家手牌:\n";
                data.players.forEach(p => {
                    const cards = p.hole_cards.map(c => {
                         const suits = { 'h': '♥', 'd': '♦', 'c': '♣', 's': '♠' };
                         const ranks = { 14:'A', 13:'K', 12:'Q', 11:'J' };
                         const r = ranks[c.rank] || c.rank;
                         return `${r}${suits[c.suit]}`;
                    }).join(" ");
                    msg += `${p.name}: ${cards}\n`;
                });
                alert(msg);
            } catch (e) {
                alert("作弊失败: " + e.message);
            }
            return;
        }

        const aiCards = document.querySelectorAll('#ai-cards .card');
        aiCards.forEach((el, idx) => {
            if (el.classList.contains('back')) {
                el.classList.remove('back');
                const card = this.aiCards[idx];
                el.className = `card ${card.getColor()}`;
                el.textContent = card.toString();
            } else {
                 // Re-hide logic is complex because updateUI overwrites it, 
                 // but for a toggle we can just force updateUI to re-render hidden
                 this.updateUI();
            }
        });
    }

    async cheatAddChips() {
        if (this.mode === 'multi') {
            try {
                const response = await fetch(`${this.serverUrl}/rooms/${this.roomId}/cheat/chips`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: this.playerName, amount: 1000000 })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.detail);
                this.log(`[DEV] 服务器: ${data.message}`);
            } catch (e) {
                alert("作弊失败: " + e.message);
            }
            return;
        }

        this.playerChips += 1000000;
        this.updateUI();
        this.updatePLDisplay();
    }

    async cheatWin() {
        if (this.mode === 'multi') {
            try {
                const response = await fetch(`${this.serverUrl}/rooms/${this.roomId}/cheat/win`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: this.playerName })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.detail);
                this.log(`[DEV] ${data.message}`);
                // Game status will update via polling
            } catch (e) {
                alert("作弊失败: " + e.message);
            }
            return;
        }

        this.endHand('player');
    }

    async cheatGoodHand() {
        if (this.mode === 'multi') {
            try {
                const response = await fetch(`${this.serverUrl}/rooms/${this.roomId}/cheat/hand`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: this.playerName })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.detail);
                this.log(`[DEV] ${data.message}`);
                // Cards will update via polling or next refresh
            } catch (e) {
                alert("作弊失败: " + e.message);
            }
            return;
        }

        // Only works before hand starts or just resets hand
        this.deck.reset();
        // Force AA
        this.playerCards = [new Card('s', 14), new Card('h', 14)]; 
        // Deal rest normally
        this.aiCards = [this.deck.deal(), this.deck.deal()];
        this.updateUI();
        this.log("[DEV] God Hand Dealt (AA)");
    }

    setPlayerName() {
        const name = this.ui.modal.nameInput.value.trim();
        if (name) {
            this.playerName = name;
            localStorage.setItem('poker_player_name', name);
            
            // Load offline chips if available
            const savedChips = localStorage.getItem('poker_player_chips');
            if (savedChips) {
                this.playerChips = parseInt(savedChips);
            } else {
                this.playerChips = 1000; // Default if no save
            }
            
            // Load total buy-in to keep PL consistent
            const savedBuyIn = localStorage.getItem('poker_player_buyin');
            if (savedBuyIn) {
                this.totalBuyIn = parseInt(savedBuyIn);
            }

            // Enable Cheats for specific names in Offline Mode
            if (['admin', 'dev', 'god', 'cheater'].includes(this.playerName.toLowerCase())) {
                this.isDev = true;
                this.initCheatUI();
                this.log(`离线开发者模式已激活!`);
            }

            this.ui.modal.welcome.style.display = 'none';
            this.updateUI();

            // Special welcome for specific users
            if (['小铛', 'xwy', '铛铛'].includes(this.playerName)) {
                this.isSpecialUser = true;
                alert('欢迎基佬大最爱的妃子进入牌局！\n\n基佬大：众生皆苦，只有你是草莓味的！🍓\n基佬大已为您铺好红地毯！👑');
            } else {
                this.isSpecialUser = false;
            }

        } else {
            alert("请输入名字！");
        }
    }

    resetPlayerName() {
        localStorage.removeItem('poker_player_name');
        location.reload(); // Reload to trigger welcome modal
    }

    toggleSidebar() {
        this.ui.sidebar.el.classList.toggle('open');
        this.updatePLDisplay(); // Ensure stats are fresh when opening
    }

    updatePLDisplay() {
        // Save chips locally for offline persistence
        localStorage.setItem('poker_player_chips', this.playerChips);
        localStorage.setItem('poker_player_buyin', this.totalBuyIn);

        // Net Profit = Current Chips - Total Buy-ins
        const currentPL = this.playerChips - this.totalBuyIn;
        
        // Update Sidebar stats
        this.ui.sidebar.chips.textContent = this.playerChips;
        this.ui.sidebar.pl.textContent = currentPL;
        
        this.ui.sidebar.pl.className = 'stat-value';
        if (currentPL > 0) this.ui.sidebar.pl.classList.add('positive');
        else if (currentPL < 0) this.ui.sidebar.pl.classList.add('negative');
        else this.ui.sidebar.pl.classList.add('neutral');

        // Update Evaluation
        this.ui.sidebar.evaluation.textContent = this.getEvaluation(currentPL);

        // Update Account Info
        if (this.ui.sidebar.username) {
             this.ui.sidebar.username.textContent = this.playerName;
        }
        
        if (this.ui.sidebar.status) {
            if (this.isOnline) {
                this.ui.sidebar.status.textContent = "在线";
                this.ui.sidebar.status.className = "status-badge online";
            } else {
                this.ui.sidebar.status.textContent = "离线";
                this.ui.sidebar.status.className = "status-badge offline";
            }
        }
    }

    openAdminModal() {
        document.getElementById('admin-modal').style.display = 'flex';
    }

    async adminResetPassword() {
        const key = document.getElementById('admin-key').value.trim();
        const username = document.getElementById('target-username').value.trim();
        const newPassword = document.getElementById('new-password').value.trim();

        if (!key || !username || !newPassword) {
            alert("请填写所有字段！");
            return;
        }

        try {
            const response = await fetch(`${this.serverUrl}/admin/reset_password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    admin_key: key,
                    target_username: username,
                    new_password: newPassword
                })
            });

            let data;
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                data = await response.json();
            } else {
                const text = await response.text();
                console.error("Non-JSON response:", text);
                throw new Error("服务器错误 (非JSON响应): " + text.substring(0, 100));
            }
            
            if (!response.ok) {
                throw new Error(data.detail || "操作失败");
            }

            alert("密码重置成功！");
            document.getElementById('admin-modal').style.display = 'none';
            // Clear inputs
            document.getElementById('admin-key').value = '';
            document.getElementById('target-username').value = '';
            document.getElementById('new-password').value = '';

        } catch (e) {
            console.error("Admin action failed:", e);
            alert("失败: " + e.message);
        }
    }

    getEvaluation(profit) {
        const name = this.playerName;
        if (profit >= 1000) return `尊贵的 ${name} 赌神！您简直是印钞机！🤑💰`;
        if (profit >= 500) return `哇！${name} 大佬，手气炸裂！今晚必须加鸡腿！🍗🚀`;
        if (profit >= 100) return `${name} 同学，小赚一笔，稳扎稳打，未来可期！📈✨`;
        if (profit > 0) return `${name}，开了个好头！苍蝇腿也是肉嘛！🦟🍖`;
        if (profit === 0) return `${name}，不输不赢，这就是禅的境界。🧘‍♂️🍃`;
        if (profit >= -200) return `${name}，小场面！稳住心态，马上翻盘！🛡️🔥`;
        if (profit >= -1000) return `${name}，胜败乃兵家常事，相信下一把全是A！💪🃏`;
        return `${name}... 咱们还是先去搬砖回回血吧... 🧱😭💸`;
    }

    openBuyInModal() {
        if (this.playerChips <= 0) {
            this.ui.modal.buyin.style.display = 'flex';
        } else {
            this.startGame();
        }
    }

    manualBuyIn() {
        let amount = parseInt(this.ui.sidebar.buyinInput.value);
        if (isNaN(amount) || amount < 1) amount = 1;
        if (amount > 2000) amount = 2000;

        this.playerChips += amount;
        this.totalBuyIn += amount;
        
        this.log(`成功带入 ${amount} 筹码。`);
        this.updateUI(); // Updates main UI chips
        this.updatePLDisplay(); // Updates sidebar stats
        
        // Optional: Close sidebar
        // this.toggleSidebar();
    }

    confirmBuyIn() {
        let amount = parseInt(this.ui.modal.input.value);
        if (isNaN(amount) || amount < 1) amount = 1;
        if (amount > 2000) amount = 2000;
        
        this.playerChips += amount;
        this.totalBuyIn += amount;
        this.ui.modal.buyin.style.display = 'none';
        
        this.updateUI();
        this.updatePLDisplay();
        this.startGame();
    }

    async startGame() {
        if (this.mode === 'multi') {
            if (this.role === 'host') {
                try {
                    const response = await fetch(`${this.serverUrl}/rooms/${this.roomId}/start`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username: this.playerName })
                    });
                    if (!response.ok) throw new Error("无法开始游戏");
                    this.log("游戏开始请求已发送！");
                } catch (e) {
                    alert(e.message);
                }
            } else {
                alert("请等待房主开始游戏");
            }
            return;
        }

        if (this.playerChips <= 0) {
            this.log("请先带入筹码。");
            this.openBuyInModal();
            return;
        }

        // Reset AI chips to "infinite" visual, but keep tracking logic
        this.aiChips = 1000000; 

        // Reset state
        this.startHand();
    }

    startHand() {
        this.handStartChips = this.playerChips; // Track starting chips for P/L calculation
        this.deck.reset();
        this.playerCards = [this.deck.deal(), this.deck.deal()];
        this.aiCards = [this.deck.deal(), this.deck.deal()];
        this.communityCards = [];
        this.pot = 0;
        this.phase = 'preflop';
        this.playerBet = 0;
        this.aiBet = 0;
        this.currentBet = 0;

        // Blinds
        this.postBlind('player', 10);
        this.postBlind('ai', 20);
        this.currentBet = 20;
        
        this.isPlayerTurn = true; // Small blind acts first preflop? Actually BB acts last, dealer/SB first. 1v1 dealer is SB.
        // Simplified: Human acts first.

        this.updateUI();
        this.ui.buttons.start.disabled = true;
        this.log("发牌完毕，轮到你了。");
        this.logSpecialAction('start'); // Special dialogue
        this.updateButtons();
    }

    postBlind(who, amount) {
        if (who === 'player') {
            const actual = Math.min(this.playerChips, amount);
            this.playerChips -= actual;
            this.playerBet += actual;
            this.pot += actual;
        } else {
            const actual = Math.min(this.aiChips, amount);
            this.aiChips -= actual;
            this.aiBet += actual;
            this.pot += actual;
        }
    }

    nextPhase() {
        this.playerBet = 0;
        this.aiBet = 0;
        this.currentBet = 0;
        
        if (this.phase === 'preflop') {
            this.phase = 'flop';
            this.communityCards.push(this.deck.deal(), this.deck.deal(), this.deck.deal());
        } else if (this.phase === 'flop') {
            this.phase = 'turn';
            this.communityCards.push(this.deck.deal());
        } else if (this.phase === 'turn') {
            this.phase = 'river';
            this.communityCards.push(this.deck.deal());
        } else if (this.phase === 'river') {
            this.phase = 'showdown';
            this.showdown();
            return;
        }
        
        this.isPlayerTurn = true;
        this.updateUI();
        this.log(`阶段：${this.getPhaseName(this.phase)}`);
        this.updateButtons();
    }

    getPhaseName(phase) {
        const names = {
            'preflop': '翻牌前',
            'flop': '翻牌圈',
            'turn': '转牌圈',
            'river': '河牌圈',
            'showdown': '摊牌'
        };
        return names[phase] || phase;
    }

    async playerAction(action) {
        if (!this.isPlayerTurn) return;

        if (this.mode === 'multi') {
            const amount = (action === 'raise') ? parseInt(this.ui.raiseControls.slider.value) : 0;
            try {
                const response = await fetch(`${this.serverUrl}/rooms/${this.roomId}/action`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        username: this.playerName, 
                        action: action,
                        amount: amount
                    })
                });
                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.detail || "操作失败");
                }
                this.isPlayerTurn = false;
                this.updateButtons();
                this.logSpecialAction(action); // Special dialogue
            } catch (e) {
                alert(e.message);
            }
            return;
        }

        switch (action) {
            case 'fold':
                this.logSpecialAction('fold'); // Special dialogue
                this.endHand('ai');
                return;
            case 'check':
                if (this.currentBet > this.playerBet) {
                    this.log("无法过牌，必须跟注或弃牌。");
                    return;
                }
                this.log("你过牌了。");
                break;
            case 'call':
                const callAmount = this.currentBet - this.playerBet;
                if (callAmount > this.playerChips) {
                     // All-in logic (simplified)
                     this.pot += this.playerChips;
                     this.playerBet += this.playerChips;
                     this.playerChips = 0;
                } else {
                    this.playerChips -= callAmount;
                    this.pot += callAmount;
                    this.playerBet += callAmount;
                }
                this.log("你跟注了。");
                break;
            case 'raise':
                // Raise to the value selected in slider
                const raiseTo = parseInt(this.ui.raiseControls.slider.value);
                const totalCost = raiseTo - this.playerBet;
                
                if (totalCost > this.playerChips) {
                    this.log("筹码不足，无法加注。");
                    return;
                }

                this.playerChips -= totalCost;
                this.pot += totalCost;
                this.playerBet = raiseTo;
                this.currentBet = this.playerBet;
                this.log(`你加注到 ${raiseTo}。`);
                break;
        }

        this.isPlayerTurn = false;
        this.updateUI();
        this.updateButtons();
        this.logSpecialAction(action); // Special dialogue
        
        // Check if round should end
        if (action === 'call' || (action === 'check' && this.aiBet === this.playerBet)) {
            // Round over if both matched (and not just start of round)
             if (this.playerBet === this.aiBet) {
                this.nextPhase();
            } else {
                setTimeout(() => this.aiTurn(), 1000);
            }
        } else {
            setTimeout(() => this.aiTurn(), 1000);
        }
    }

    aiTurn() {
        if (this.phase === 'showdown') return;

        this.ui.aiStatus.textContent = "思考中...";
        
        // Simple AI Logic
        // Randomly fold, call, or raise based on hand strength (random for now to keep it simple but functional)
        const rand = Math.random();
        let action = 'call';
        
        // Evaluate hand strength roughly
        const evalHand = HandEvaluator.evaluate([...this.aiCards, ...this.communityCards]);
        const strength = evalHand.rank; // 0 to 8

        if (this.currentBet > this.aiBet) {
            // Facing a bet
            if (strength >= 1 || rand > 0.3) {
                action = 'call';
            } else {
                action = 'fold';
            }
        } else {
            // Can check or bet
            if (strength >= 2 && rand > 0.5) {
                action = 'raise';
            } else {
                action = 'check';
            }
        }
        
        // Execute AI Action
        if (action === 'fold') {
            this.log("基佬大 弃牌。");
            this.endHand('player');
            return;
        } else if (action === 'check') {
            this.log("基佬大 过牌。");
        } else if (action === 'call') {
            const callAmount = this.currentBet - this.aiBet;
            this.aiChips -= callAmount;
            this.pot += callAmount;
            this.aiBet += callAmount;
            this.log("基佬大 跟注。");
        } else if (action === 'raise') {
             const raiseAmt = 20;
             const total = (this.currentBet - this.aiBet) + raiseAmt;
             this.aiChips -= total;
             this.pot += total;
             this.aiBet += total;
             this.currentBet = this.aiBet;
             this.log("基佬大 加注。");
        }

        this.isPlayerTurn = true;
        this.updateUI();
        this.updateButtons();

        // Check if round end
        if (this.playerBet === this.aiBet && action !== 'raise') {
            this.nextPhase();
        }
    }

    showdown() {
        this.log("摊牌！");
        // Reveal AI cards
        this.renderCards(this.aiCards, this.ui.aiCards);
        
        const playerBest = this.getBestHand(this.playerCards);
        const aiBest = this.getBestHand(this.aiCards);
        
        let winner = '';
        if (playerBest.rank > aiBest.rank) winner = 'player';
        else if (aiBest.rank > playerBest.rank) winner = 'ai';
        else {
            if (playerBest.value > aiBest.value) winner = 'player';
            else if (aiBest.value > playerBest.value) winner = 'ai';
            else winner = 'split';
        }

        if (winner === 'player') {
            this.playerChips += this.pot;
            this.log(`你赢了！牌型：${playerBest.name}`);
        } else if (winner === 'ai') {
            this.aiChips += this.pot;
            this.log(`基佬大 赢了！牌型：${aiBest.name}`);
            this.checkTaunt();
        } else {
            this.playerChips += this.pot / 2;
            this.aiChips += this.pot / 2;
            this.log("平分底池！");
        }
        
        this.logSpecialResult(winner); // Special result dialogue
        
        this.pot = 0;
        this.ui.buttons.start.disabled = false;
        this.syncScore();
        this.updateUI();
    }

    async syncScore() {
        if (!this.isOnline) return;
        try {
            await fetch(`${this.serverUrl}/update_score`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: this.playerName, chips: this.playerChips })
            });
        } catch (e) {
            console.error("Sync failed:", e);
        }
    }

    getBestHand(holeCards) {
        // Evaluate all 7 cards (2 hole + 5 community)
        // Since my evaluator takes any number of cards and finds the best, I can pass all 7.
        // But the evaluator logic above is simplified (takes all cards). 
        // A true evaluator picks the best 5. 
        // My simple evaluator logic actually looks at stats of ALL cards passed.
        // It should work reasonably well for "best hand" estimation if I pass all 7.
        // However, standard poker uses best 5.
        // For simplicity in this demo, I'll pass all 7 to the evaluator which prioritizes high ranks/counts.
        return HandEvaluator.evaluate([...holeCards, ...this.communityCards]);
    }

    checkTaunt() {
        const diff = this.playerChips - this.handStartChips;
        if (diff < -300) {
            const loss = Math.abs(diff);
            const taunts = [
                `一局输掉 ${loss}！做慈善也没你这么大方啊！💸`,
                `这也太惨了，${loss} 筹码瞬间蒸发！📉`,
                `醒醒！再这样输下去底裤都没了！输了 ${loss}！🩲`,
                `基佬大：感谢老板送来的 ${loss} 筹码！🤖❤️`,
                `心态崩了？一把输 ${loss}，要不歇会儿？☕`,
                `我就静静地看着你输了 ${loss}... 😶`,
                `土豪我们做朋友吧！这把输了 ${loss} 都不眨眼！🤝`,
                `菜逼，项婉影都比你厉害！👎`,
                `菜就多练！🏃‍♂️`
            ];
            const randomTaunt = taunts[Math.floor(Math.random() * taunts.length)];
            
            // Append to current message
            setTimeout(() => {
                this.ui.message.innerHTML += `<br><span style="color: #e74c3c; font-weight: bold;">${randomTaunt}</span>`;
                this.showTauntImage(randomTaunt);
            }, 500);
        }
    }

    checkPraise() {
        const diff = this.playerChips - this.handStartChips;
        if (diff > 0) {
            const profit = diff;
            const praises = [
                `赢了 ${profit}！今晚吃鸡！🍗`,
                `基佬大：这波操作666，佩服！👍`,
                `厉害啊！${profit} 筹码轻松入袋！💰`,
                `基佬大：被你吓跑了... 🏃‍♂️`,
                `手气不错！继续保持！🔥`,
                `大神求带！赢了 ${profit}！🤝`
            ];
            // Only show praise if profit is significant or random chance
            if (profit > 200 || Math.random() > 0.7) {
                const randomPraise = praises[Math.floor(Math.random() * praises.length)];
                setTimeout(() => {
                    this.ui.message.innerHTML += `<br><span style="color: #2ecc71; font-weight: bold;">${randomPraise}</span>`;
                }, 500);
            }
        }
    }

    showTauntImage(msg) {
        // Random image from cf1.jpg to cf4.jpg
        const randomImg = Math.floor(Math.random() * 4) + 1;
        this.ui.modal.tauntImg.src = `cf${randomImg}.jpg`;
        
        if (this.ui.modal.tauntText) {
            this.ui.modal.tauntText.textContent = msg || '';
        }

        this.ui.modal.tauntOverlay.style.display = 'flex';

        // Hide after 3 seconds
        setTimeout(() => {
            this.ui.modal.tauntOverlay.style.display = 'none';
        }, 3000);
    }

    endHand(winner) {
        if (winner === 'player') {
            this.playerChips += this.pot;
            this.log("你赢了！基佬大 弃牌。");
            this.checkPraise();
        } else {
            this.aiChips += this.pot;
            this.log("基佬大 赢了！你弃牌。");
            this.checkTaunt();
        }
        this.logSpecialResult(winner); // Special result dialogue
        this.pot = 0;
        this.ui.buttons.start.disabled = false;
        this.updateUI();
    }

    log(msg) {
        this.ui.message.textContent = msg;
        this.ui.aiStatus.textContent = msg; // Reuse status for simplicity
    }

    updateUI() {
        this.ui.playerChips.textContent = this.playerChips;
        
        if (this.isSpecialUser) {
            this.ui.playerName.textContent = this.playerName + " (基佬大的爱妃)";
            this.ui.playerName.style.color = "#e91e63"; // Pink color for special users
            this.ui.playerName.style.fontWeight = "bold";
        } else {
            this.ui.playerName.textContent = this.playerName;
            this.ui.playerName.style.color = ""; // Reset
            this.ui.playerName.style.fontWeight = "";
        }
        
        this.updateButtons();
        this.updatePLDisplay();

        if (this.mode === 'multi') {
            // Multiplayer UI Updates
            // Title is handled by polling or initial join, don't overwrite here
            
            const mpPot = document.getElementById('mp-pot-size');
            if (mpPot) mpPot.textContent = this.pot;
            
            const mpCommCards = document.getElementById('mp-community-cards');
            if (mpCommCards) this.renderCards(this.communityCards, mpCommCards);
            
            const mpHand = document.getElementById('mp-my-hand');
            if (mpHand) this.renderCards(this.playerCards, mpHand);

            const mpMsg = document.getElementById('mp-game-message');
            if (mpMsg) mpMsg.textContent = this.ui.message.textContent; // Sync message

        } else {
            // Single Player UI Updates
            
            // Update Game Title only in single player
            if (this.ui.gameTitle) {
                this.ui.gameTitle.textContent = `${this.playerName} vs 基佬大`;
            }

            this.ui.aiName.textContent = "基佬大"; 
            this.ui.aiChips.textContent = (this.aiChips > 900000) ? "∞" : this.aiChips;
            this.ui.pot.textContent = this.pot;
            this.ui.aiRoundBet.textContent = this.aiBet;
            
            // Render Player Cards
            this.renderCards(this.playerCards, this.ui.playerCards);

            // Render Community Cards
            this.renderCards(this.communityCards, this.ui.communityCards);

            // Render AI Cards (Hidden unless showdown)
            if (this.phase !== 'showdown') {
                this.ui.aiCards.innerHTML = `
                    <div class="card back"></div>
                    <div class="card back"></div>
                `;
            }
        }
    }

    renderCards(cards, container) {
        container.innerHTML = '';
        cards.forEach(card => {
            const el = document.createElement('div');
            el.className = `card ${card.getColor()}`;
            el.textContent = card.toString();
            container.appendChild(el);
        });
    }

    updateButtons() {
        try {
            const canCheck = (this.currentBet === this.playerBet);
            this.ui.buttons.fold.disabled = !this.isPlayerTurn;
            this.ui.buttons.check.disabled = !this.isPlayerTurn || !canCheck;
            this.ui.buttons.call.disabled = !this.isPlayerTurn || canCheck;
            
            // Raise Logic
            if (this.isPlayerTurn) {
                // Min raise: current bet + min raise increment (20 for now)
                // If current bet is 0 (check allowed), min raise is 20.
                const minRaise = (this.currentBet > 0) ? (this.currentBet + 20) : 20;
                const maxRaise = this.playerBet + this.playerChips;

                if (maxRaise >= minRaise) {
                    this.ui.raiseControls.slider.min = minRaise;
                    this.ui.raiseControls.slider.max = maxRaise;
                    // Reset value only if out of bounds or first time? 
                    // Better to reset to min for convenience
                    if (parseInt(this.ui.raiseControls.slider.value) < minRaise) {
                         this.ui.raiseControls.slider.value = minRaise;
                         this.ui.raiseControls.val.textContent = minRaise;
                    }
                    
                    this.ui.raiseControls.slider.disabled = false;
                    this.ui.buttons.raise.disabled = false;
                    
                    // Update label if needed
                    this.ui.raiseControls.val.textContent = this.ui.raiseControls.slider.value;
                } else {
                    // Not enough chips to raise minimum
                    this.ui.raiseControls.slider.disabled = true;
                    this.ui.buttons.raise.disabled = true;
                    this.ui.raiseControls.val.textContent = "-";
                }
            } else {
                this.ui.buttons.raise.disabled = true;
                this.ui.raiseControls.slider.disabled = true;
                this.ui.raiseControls.val.textContent = "-";
            }

        } catch (e) {
            console.error("Error updating buttons:", e);
            this.log("Error updating buttons: " + e.message);
        }
    }

    onRaiseChange(val) {
        this.ui.raiseControls.val.textContent = val;
    }

    // Special User Dialogues Helper
    getSpecialDialogue(type) {
        const dialogues = {
            'start': [
                 "基佬大：新的一局，爱妃加油！我的运气都借给你！❤️",
                 "基佬大：看着你的头像，我就知道这把稳了！😘",
                 "基佬大：专心打牌，剩下的交给我！🛡️",
                 "你是年少的欢喜，这把牌也是！🌸",
                 "基佬大：我的眼里只有你，牌局只是背景！💑"
            ],
            'fold': [
                "不跟他们一般见识~ 😤", 
                "让基佬大来收拾他们！⚔️", 
                "爱妃先歇歇，保存实力~ ☕", 
                "基佬大：战略性撤退，是为了更好的进攻！🛡️",
                "基佬大：这牌配不上你，丢了！🗑️"
            ],
            'check': [
                "观察一下局势... 👀", 
                "让基佬大看看有没有诈... 🕵️‍♂️", 
                "稳一手，看看风向。🍃", 
                "基佬大：爱妃请过目~ 👑",
                "基佬大：我在看着你，别怕。💑",
                "近朱者赤，近你者甜，过牌都这么甜！🍬"
            ],
            'call': [
                "夫唱妇随，跟了！👫", 
                "这点小钱，基佬大出！💸", 
                "陪你们玩玩~ 🎠", 
                "基佬大：你在哪我就在哪，跟！🛤️",
                "基佬大：天涯海角，我都跟定你了！🌏",
                "你是什么人？你是我的心上人，跟！💘"
            ],
            'raise': [
                "基佬大的私房钱拿来加注！💰", 
                "爱妃发威了！🐯", 
                "谁敢跟基佬大的女人比有钱？💎", 
                "加注！让基佬大看看我的魄力！🚀",
                "基佬大：为了博妃子一笑，All in又何妨！🎰",
                "不要让我看见你，不然见一次加注一次！😍"
            ],
            'win': [
                "基佬大：爱妃真棒！么么哒！💋", 
                "赢了钱给基佬大买烟抽！🚬", 
                "大杀四方，威震后宫！🏰", 
                "手气这么好，基佬大今晚有赏！🎁",
                "你是我的优乐美，赢了捧在手心！🥤", 
                "基佬大：你赢的不是筹码，是我的心！❤️", 
                "这把赢了，咱们回家嘿嘿嘿~ 😈"
            ],
            'lose': [
                "基佬大：记我账上！📝", 
                "没事，基佬大养你！💪", 
                "胜败乃兵家常事，基佬大不怪你。🛡️", 
                "输了算基佬大的，赢了算我的！⚖️",
                "输了牌局，赢了基佬大的心，值！💖", 
                "不要抱怨，抱我！🫂", 
                "基佬大：输了没事，我偷电瓶车养你！🛵"
            ]
        };
        const list = dialogues[type] || [];
        if (list.length === 0) return "";
        return list[Math.floor(Math.random() * list.length)];
    }

    logSpecialAction(action) {
        if (!this.isSpecialUser) return;
        const msg = this.getSpecialDialogue(action);
        if (msg) {
            setTimeout(() => {
                this.log(`👑 ${msg}`); 
            }, 800); 
        }
    }
    
    logSpecialResult(winner) {
        if (!this.isSpecialUser) return;
        const type = (winner === 'player') ? 'win' : 'lose';
        const msg = this.getSpecialDialogue(type);
        if (msg) {
            setTimeout(() => {
                this.log(`👑 ${msg}`);
            }, 800);
        }
    }
}

// Expose game to window to ensure HTML onclick handlers work
try {
    console.log("Initializing Game...");
    window.game = new Game();
    console.log("Game initialized successfully.");
} catch (e) {
    console.error("Failed to initialize game:", e);
    document.getElementById('game-message').textContent = "Init Error: " + e.message;
}

// Global error handler
window.onerror = function(msg, url, lineNo, columnNo, error) {
    console.error("Global error:", msg, url, lineNo, columnNo, error);
    const message = [
        'Message: ' + msg,
        'Line: ' + lineNo,
        'Column: ' + columnNo,
        'Stack: ' + (error ? error.stack : 'no stack')
    ].join('\n');
    
    const display = document.getElementById('game-message');
    if (display) {
        display.textContent = "Error: " + msg; // Keep simple for UI, check console for details
        display.title = message; // Tooltip with details
        display.style.color = "red";
    }
    return false;
};
