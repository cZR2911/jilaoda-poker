
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
                start: document.getElementById('btn-start')
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
                buyinInput: document.getElementById('sidebar-buyin-amount')
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
        if (!localStorage.getItem('poker_player_name')) {
            this.ui.modal.welcome.style.display = 'flex';
        } else {
            this.ui.modal.welcome.style.display = 'none';
            this.ui.playerName.textContent = this.playerName;
        }
    }

    setPlayerName() {
        const name = this.ui.modal.nameInput.value.trim();
        if (name) {
            this.playerName = name;
            localStorage.setItem('poker_player_name', name);
            this.ui.modal.welcome.style.display = 'none';
            this.updateUI();
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

    startGame() {
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

    playerAction(action) {
        if (!this.isPlayerTurn) return;

        switch (action) {
            case 'fold':
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
        
        this.pot = 0;
        this.ui.buttons.start.disabled = false;
        this.updateUI();
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
        this.ui.playerName.textContent = this.playerName;
        
        // Update Game Title
        if (this.ui.gameTitle) {
            this.ui.gameTitle.textContent = `${this.playerName} vs 基佬大`;
        }

        this.ui.aiName.textContent = "基佬大"; // Update AI name dynamically
        this.ui.aiChips.textContent = (this.aiChips > 900000) ? "∞" : this.aiChips;
        this.ui.pot.textContent = this.pot;
        this.ui.aiRoundBet.textContent = this.aiBet;
        
        this.updateButtons();
        this.updatePLDisplay();

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
        } // Showdown rendering is handled in showdown() or if needed here, but showdown() calls renderCards directly.
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
