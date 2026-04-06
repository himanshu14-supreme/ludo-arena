const socket = io();

// --- GLOBAL STATE ---
let currentUser = {
    isLoggedIn: false,
    name: "Guest",
    coins: 600,
    xp: 0,
    inventory: ['avatar_default', 'ability_none'],
    selectedAvatar: 'avatar_default',
    selectedAbility: 'ability_none'
};

let currentRoomId = null;
let myPlayerId = null;

// --- 1. AUTHENTICATION ---
function playGuest() {
    const userInp = document.getElementById('auth-user').value.trim();
    currentUser.name = userInp || "Guest_" + Math.floor(Math.random() * 999);
    transitionToLobby();
}

function login() {
    const user = document.getElementById('auth-user').value.trim();
    const pass = document.getElementById('auth-pass').value.trim();
    if (!user || !pass) return alert("Enter credentials");
    socket.emit('auth_login', { user, pass });
}

function register() {
    const user = document.getElementById('auth-user').value.trim();
    const pass = document.getElementById('auth-pass').value.trim();
    if (!user || !pass) return alert("Enter credentials");
    socket.emit('auth_register', { user, pass });
}

socket.on('auth_success', (data) => {
    currentUser = data;
    currentUser.isLoggedIn = true;
    transitionToLobby();
});

socket.on('auth_error', (msg) => alert(msg));

function transitionToLobby() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('lobby').classList.remove('hidden');
    document.getElementById('display-name').innerText = currentUser.name;
    document.getElementById('display-coins').innerText = currentUser.coins;
}

// --- 2. ROOM MANAGEMENT ---
function createRoom() {
    const limit = document.getElementById('player-limit').value;
    const id = Math.random().toString(36).substring(2, 8).toUpperCase();
    socket.emit('joinRoom', { 
        roomId: id, 
        playerName: currentUser.name, 
        avatar: currentUser.selectedAvatar, 
        ability: currentUser.selectedAbility, 
        maxPlayers: limit 
    });
    enterWaitingRoom(id);
}

function joinRoom() {
    const id = document.getElementById('room-input').value.trim().toUpperCase();
    if (id) {
        socket.emit('joinRoom', { 
            roomId: id, 
            playerName: currentUser.name, 
            avatar: currentUser.selectedAvatar, 
            ability: currentUser.selectedAbility 
        });
        enterWaitingRoom(id);
    }
}

function enterWaitingRoom(id) {
    currentRoomId = id;
    document.getElementById('lobby').classList.add('hidden');
    document.getElementById('waiting-room').classList.remove('hidden');
    document.getElementById('wait-room-id').innerText = `ROOM: ${id}`;
}

function requestStart() {
    socket.emit('startGameSignal', currentRoomId);
}

socket.on('playerCountUpdate', (data) => {
    const me = data.players.find(p => p.id === socket.id);
    if (me) myPlayerId = me.id;
    
    document.getElementById('player-count-text').innerText = `Players: ${data.count}/${data.max}`;
    
    // Only show start button to the host
    const isHost = me && me.isHost;
    document.getElementById('start-game-btn').classList.toggle('hidden', !isHost);
    document.getElementById('host-wait-msg').classList.toggle('hidden', isHost);
    
    document.getElementById('player-list').innerHTML = data.players.map((p, i) => {
        const colors = ['🔴', '🔵', '🟢', '🟡'];
        return `<li>${colors[i] || '⚪'} ${p.name} ${p.id === socket.id ? '(You)' : ''}</li>`;
    }).join('');
});

// --- 3. LUDO GAMEPLAY LOGIC ---
socket.on('initGame', (data) => {
    document.getElementById('waiting-room').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    
    generateBoard();
    updateUI(data.players);
    updateTurnUI(data.currentTurnId);
});

function rollDice() {
    socket.emit('rollDice', currentRoomId);
}

socket.on('diceRolled', (data) => {
    const diceDisplay = document.getElementById('dice-display');
    diceDisplay.innerText = `🎲 ${data.roll}`;
    
    // Add a quick shake animation
    diceDisplay.classList.add('shake');
    setTimeout(() => diceDisplay.classList.remove('shake'), 400);

    updateUI(data.players);
    updateTurnUI(data.currentTurnId);
});

function generateBoard() {
    const board = document.getElementById('board');
    if (board.querySelectorAll('.cell').length > 0) return;
    
    // Create 54 cells (0 to 53)
    for (let i = 0; i <= 53; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.id = 'cell-' + i;
        if (i === 0) cell.innerText = "BASE";
        else if (i === 53) cell.innerText = "WIN";
        else cell.innerText = i;
        board.appendChild(cell);
    }
}

function updateUI(players) {
    players.forEach((p) => {
        const statue = document.getElementById(`player${p.playerIndex + 1}`);
        statue.classList.remove('hidden');
        
        // Use equipped avatar icon
        statue.innerHTML = p.avatar === 'avatar_knight' ? '🛡️' : '👤';
        
        const targetCell = document.getElementById('cell-' + p.stepsTaken);
        if (targetCell) {
            // Position statues with a slight offset so they don't overlap perfectly
            statue.style.left = (targetCell.offsetLeft + (p.playerIndex * 5)) + 'px';
            statue.style.top = (targetCell.offsetTop + (p.playerIndex * 5)) + 'px';
        }
    });
}

function updateTurnUI(turnId) {
    const rollBtn = document.getElementById('roll-btn');
    const statusMsg = document.getElementById('status');
    
    if (turnId === socket.id) {
        rollBtn.classList.remove('hidden');
        statusMsg.innerText = "YOUR TURN!";
        statusMsg.style.color = "var(--accent-green)";
    } else {
        rollBtn.classList.add('hidden');
        statusMsg.innerText = "Waiting for opponents...";
        statusMsg.style.color = "var(--text-dim)";
    }
}

socket.on('playerKilled', (data) => {
    showToast(`⚔️ ${data.killer} sent ${data.victim} back to base!`);
});

socket.on('abilityTriggered', (data) => {
    if (data.type === 'fire_sword') {
        showToast(`🔥 ${data.user}'s Fire Sword scorched the path!`);
    }
});

socket.on('gameOver', (winner) => {
    alert(`Game Over! ${winner.name} reached the end!`);
    location.reload();
});

// --- 4. SHOP & VAULT SYSTEM ---
function openModal(id) {
    document.getElementById(id).style.display = 'block';
    if (id === 'vault-modal') renderVault();
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

function buyItem(itemId, price) {
    if (currentUser.coins < price) return showToast("Not enough coins!");
    if (currentUser.inventory.includes(itemId)) return showToast("Already owned!");

    currentUser.coins -= price;
    currentUser.inventory.push(itemId);
    document.getElementById('display-coins').innerText = currentUser.coins;
    
    socket.emit('save_data', currentUser);
    showToast("Purchased successfully!");
}

function renderVault() {
    const list = document.getElementById('inventory-list');
    list.innerHTML = currentUser.inventory.map(item => {
        const isSelected = (currentUser.selectedAvatar === item || currentUser.selectedAbility === item);
        return `
            <div class="shop-item">
                <p>${item.replace('_', ' ').toUpperCase()}</p>
                <button class="menu-btn ${isSelected ? 'join-variant' : ''}" 
                        onclick="equipItem('${item}')">
                    ${isSelected ? 'Equipped' : 'Equip'}
                </button>
            </div>
        `;
    }).join('');
}

function equipItem(itemId) {
    if (itemId.startsWith('avatar')) currentUser.selectedAvatar = itemId;
    if (itemId.startsWith('ability')) currentUser.selectedAbility = itemId;
    
    socket.emit('save_data', currentUser);
    renderVault();
    showToast("Equipped!");
}

function showToast(msg) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = msg;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}
