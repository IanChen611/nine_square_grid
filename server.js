// =============================================================
//  九九宮格（Ultimate Tic-Tac-Toe 變體）連線對戰伺服器
//
//  - 零相依套件：只用 Node 內建模組，NAS 上不用 npm install
//  - 相容 Node 16（ASUSTOR AS1002T，armv7l）
//  - 即時同步：Server-Sent Events（/api/events），動作用 POST
//  - 房間（含聊天紀錄）只存在記憶體中，重啟伺服器就清空
// =============================================================
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8081;
const PUBLIC_DIR = path.join(__dirname, 'public');

// 玩家斷線超過這個時間，座位才會讓給新加入的人
const SEAT_RELEASE_MS = 60 * 1000;
// 房間沒人連線超過這個時間就刪除
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
// 聊天室：每間房保留最近幾則、每則最多幾個字、同一人發言最短間隔
const CHAT_HISTORY = 50;
const CHAT_MAX_LEN = 200;
const CHAT_MIN_INTERVAL_MS = 500;

// 小九宮格內的連線（格子編號 0~8，由左到右、由上到下）
const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

/** @type {Map<string, any>} */
const rooms = new Map();

function newRoom(id) {
  return {
    id,
    seats: { X: null, O: null }, // { token, name, conns, leftAt }
    first: 'X', // 本局先手
    lastActive: Date.now(),
    clients: new Set(), // { res, token }
    chat: [], // { id, name, seat, text, at }
    chatSeq: 0,
    chatLastAt: new Map(), // token -> 上次發言時間（防洗版）
    ...freshGame('X'),
  };
}

function freshGame(first) {
  return {
    board: new Array(81).fill(null), // index = big * 9 + small
    turn: first,
    forced: null, // 下一手必須下在哪個大格；null = 任意
    winner: null, // 'X' | 'O' | 'draw' | null
    winLine: null, // { big, cells: [a, b, c] }
    lastMove: null, // { big, small, mark }
    moveCount: 0,
  };
}

function getRoom(id) {
  let room = rooms.get(id);
  if (!room) {
    room = newRoom(id);
    rooms.set(id, room);
  }
  room.lastActive = Date.now();
  return room;
}

function seatOf(room, token) {
  if (room.seats.X && room.seats.X.token === token) return 'X';
  if (room.seats.O && room.seats.O.token === token) return 'O';
  return null;
}

function seatFree(seat) {
  if (!seat) return true;
  return seat.conns === 0 && seat.leftAt && Date.now() - seat.leftAt > SEAT_RELEASE_MS;
}

function smallBoardFull(board, big) {
  for (let i = 0; i < 9; i++) if (!board[big * 9 + i]) return false;
  return true;
}

function publicState(room) {
  const seat = (s) => (s ? { name: s.name, online: s.conns > 0 } : null);
  return {
    room: room.id,
    seats: { X: seat(room.seats.X), O: seat(room.seats.O) },
    board: room.board,
    turn: room.turn,
    forced: room.forced,
    winner: room.winner,
    winLine: room.winLine,
    lastMove: room.lastMove,
    moveCount: room.moveCount,
    spectators: [...room.clients].filter((c) => !seatOf(room, c.token)).length,
  };
}

function broadcast(room) {
  const state = publicState(room);
  for (const c of room.clients) {
    state.you = seatOf(room, c.token); // 每個連線各自知道自己是 X / O / 觀戰(null)
    c.res.write(`data: ${JSON.stringify(state)}\n\n`);
  }
}

function sendChat(client, payload) {
  client.res.write(`event: chat\ndata: ${JSON.stringify(payload)}\n\n`);
}

// ---------- 遊戲動作 ----------

function join(room, token, name) {
  const mine = seatOf(room, token);
  if (mine) {
    room.seats[mine].name = name || room.seats[mine].name;
    return mine;
  }
  for (const mark of ['X', 'O']) {
    if (seatFree(room.seats[mark])) {
      const conns = [...room.clients].filter((c) => c.token === token).length;
      room.seats[mark] = { token, name: name || `玩家 ${mark}`, conns, leftAt: conns ? null : Date.now() };
      return mark;
    }
  }
  return null; // 觀戰
}

function move(room, token, big, small) {
  const mark = seatOf(room, token);
  if (!mark) return '你不是這局的玩家';
  if (!room.seats.X || !room.seats.O) return '等待另一位玩家加入';
  if (room.winner) return '這局已經結束了';
  if (room.turn !== mark) return '還沒輪到你';
  if (!Number.isInteger(big) || !Number.isInteger(small) || big < 0 || big > 8 || small < 0 || small > 8)
    return '位置不正確';
  if (room.forced !== null && room.forced !== big) return '這一手只能下在指定的大格';
  const idx = big * 9 + small;
  if (room.board[idx]) return '這格已經有人下了';

  room.board[idx] = mark;
  room.moveCount++;
  room.lastMove = { big, small, mark };

  // 在這個小九宮格內連成一線就獲勝
  for (const line of LINES) {
    if (line.every((c) => room.board[big * 9 + c] === mark)) {
      room.winner = mark;
      room.winLine = { big, cells: line };
      room.forced = null;
      return null;
    }
  }

  if (room.moveCount === 81) {
    room.winner = 'draw';
    room.forced = null;
    return null;
  }

  // 下在小格的哪個位置，對手就要去下對應位置的大格；那個大格滿了就可以任意下
  room.forced = smallBoardFull(room.board, small) ? null : small;
  room.turn = mark === 'X' ? 'O' : 'X';
  return null;
}

function restart(room, token) {
  if (!seatOf(room, token)) return '只有玩家可以重新開始';
  room.first = room.first === 'X' ? 'O' : 'X'; // 輪流先手
  Object.assign(room, freshGame(room.first));
  return null;
}

function chat(room, token, name, text) {
  text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LEN);
  if (!text) return '訊息不能是空的';
  const now = Date.now();
  if (now - (room.chatLastAt.get(token) || 0) < CHAT_MIN_INTERVAL_MS) return '說太快了，休息一下';
  room.chatLastAt.set(token, now);

  const seat = seatOf(room, token);
  const msg = {
    id: ++room.chatSeq,
    name: (seat && room.seats[seat].name) || name || '觀戰者',
    seat,
    text,
    at: now,
  };
  room.chat.push(msg);
  if (room.chat.length > CHAT_HISTORY) room.chat.shift();
  for (const c of room.clients) sendChat(c, { messages: [msg] });
  return null;
}

function leave(room, token) {
  const mark = seatOf(room, token);
  if (mark) {
    room.seats[mark] = null;
    Object.assign(room, freshGame(room.first));
  }
  return null;
}

// ---------- HTTP ----------

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 4096) {
        reject(new Error('too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

const cleanRoomId = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
const cleanToken = (s) => String(s || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 64);
const cleanName = (s) => String(s || '').trim().slice(0, 16);

function handleEvents(req, res, url) {
  const roomId = cleanRoomId(url.searchParams.get('room'));
  const token = cleanToken(url.searchParams.get('token'));
  if (!roomId || !token) return sendJson(res, 400, { error: '缺少房間或身分' });

  const room = getRoom(roomId);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 2000\n\n');

  const client = { res, token };
  room.clients.add(client);
  sendChat(client, { reset: true, messages: room.chat }); // 連上（或重連）時補上聊天紀錄
  const mark = seatOf(room, token);
  if (mark) {
    room.seats[mark].conns++;
    room.seats[mark].leftAt = null;
  }
  broadcast(room);

  const ping = setInterval(() => res.write(': ping\n\n'), 20000);
  req.on('close', () => {
    clearInterval(ping);
    room.clients.delete(client);
    room.lastActive = Date.now();
    const m = seatOf(room, token);
    if (m) {
      room.seats[m].conns = Math.max(0, room.seats[m].conns - 1);
      if (room.seats[m].conns === 0) room.seats[m].leftAt = Date.now();
    }
    broadcast(room);
  });
}

async function handleAction(req, res, action) {
  let body;
  try {
    body = await readJson(req);
  } catch (e) {
    return sendJson(res, 400, { error: '資料格式錯誤' });
  }
  const roomId = cleanRoomId(body.room);
  const token = cleanToken(body.token);
  if (!roomId || !token) return sendJson(res, 400, { error: '缺少房間或身分' });
  const room = getRoom(roomId);

  let error = null;
  let extra = {};
  if (action === 'join') extra.seat = join(room, token, cleanName(body.name));
  else if (action === 'move') error = move(room, token, body.big, body.small);
  else if (action === 'restart') error = restart(room, token);
  else if (action === 'leave') error = leave(room, token);
  else if (action === 'chat') {
    error = chat(room, token, cleanName(body.name), body.text);
    if (!error) return sendJson(res, 200, { ok: true }); // 聊天已單獨推送，不用重送棋盤
  } else return sendJson(res, 404, { error: '未知的動作' });

  if (error) return sendJson(res, 409, { error });
  broadcast(room);
  sendJson(res, 200, { ok: true, ...extra });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: 'forbidden' });
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/api/events') return handleEvents(req, res, url);
  if (req.method === 'GET' && url.pathname === '/api/health') return sendJson(res, 200, { ok: true, rooms: rooms.size });
  const m = url.pathname.match(/^\/api\/(join|move|restart|leave|chat)$/);
  if (req.method === 'POST' && m) return handleAction(req, res, m[1]);
  if (req.method === 'GET') return serveStatic(req, res, url);
  sendJson(res, 405, { error: 'method not allowed' });
});

// 定期清掉沒人的舊房間
setInterval(() => {
  const now = Date.now();
  for (const [id, room] of rooms) {
    if (room.clients.size === 0 && now - room.lastActive > ROOM_TTL_MS) rooms.delete(id);
  }
}, 10 * 60 * 1000).unref();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🎮 九九宮格已啟動： http://localhost:${PORT}`);
});
