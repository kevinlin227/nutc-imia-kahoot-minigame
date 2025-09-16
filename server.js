const express = require('express');
const WebSocket = require('ws');
const path = require('path');
// UUID使用簡單的隨機字符串生成

const app = express();
const PORT = 80;

// 示範題目
const questions = [
  {
    question: "JavaScript中哪個方法用於添加數組元素？",
    options: ["push()", "add()", "insert()", "append()"],
    correctAnswer: 0,
    timeLimit: 10000
  },
  {
    question: "HTML中哪個標籤用於創建超連結？",
    options: ["<link>", "<href>", "<a>", "<url>"],
    correctAnswer: 2,
    timeLimit: 10000
  },
  {
    question: "CSS中哪個屬性用於設置文字顏色？",
    options: ["text-color", "font-color", "color", "background-color"],
    correctAnswer: 2,
    timeLimit: 10000
  }
];

// 遊戲狀態
const gameState = {
  status: 'waiting', // waiting, playing, finished
  currentQuestion: 0,
  questionStartTime: null,
  showingResults: false,
  users: new Map(),
  allowNewUsers: true
};

// 生成用戶ID
function generateUserId() {
  return 'user_' + Math.random().toString(36).substring(2, 15);
}

// 計算分數
function calculateScore(isCorrect, timeSpent, rank) {
  if (!isCorrect) return 0;

  const baseScore = 100;
  const speedBonus = Math.max(50 - (rank - 1) * 10, 10);

  return baseScore + speedBonus;
}

// 獲取排行榜
function getLeaderboard() {
  const users = Array.from(gameState.users.values());
  return users.sort((a, b) => {
    if (b.score === a.score) {
      // 相同分數按總作答時間排序
      return a.totalTime - b.totalTime;
    }
    return b.score - a.score;
  }).map((user, index) => ({
    rank: index + 1,
    name: user.name,
    score: user.score,
    id: user.id
  }));
}

// 廣播訊息給所有用戶
function broadcast(message, excludeWs = null) {
  wss.clients.forEach(client => {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// 廣播訊息給指定用戶
function sendToUser(userId, message) {
  const user = gameState.users.get(userId);
  if (user && user.ws && user.ws.readyState === WebSocket.OPEN) {
    user.ws.send(JSON.stringify(message));
  }
}

// 靜態文件服務
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/home', express.static(path.join(__dirname, 'home')));
app.use('/game', express.static(path.join(__dirname, 'game')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// 根路由重定向到主頁
app.get('/', (req, res) => {
  res.redirect('/home');
});

// 創建HTTP伺服器
const server = app.listen(PORT, () => {
  console.log(`Kahoot遊戲伺服器運行在 http://localhost:${PORT}`);
});

// 創建WebSocket伺服器
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('新的WebSocket連接');

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      handleWebSocketMessage(ws, message);
    } catch (error) {
      console.error('解析WebSocket訊息錯誤:', error);
      ws.send(JSON.stringify({ type: 'error', message: '訊息格式錯誤' }));
    }
  });

  ws.on('close', () => {
    // 找到並標記用戶為離線
    for (const [userId, user] of gameState.users) {
      if (user.ws === ws) {
        user.connected = false;
        user.ws = null;
        console.log(`用戶 ${user.name} (${userId}) 已斷線`);

        // 廣播用戶列表更新
        broadcast({
          type: 'users_update',
          users: Array.from(gameState.users.values()).map(u => ({
            id: u.id,
            name: u.name,
            connected: u.connected,
            score: u.score
          }))
        });
        break;
      }
    }
  });
});

// 處理WebSocket訊息
function handleWebSocketMessage(ws, message) {
  switch (message.type) {
    case 'join':
      handleUserJoin(ws, message);
      break;

    case 'reconnect':
      handleUserReconnect(ws, message);
      break;

    case 'answer':
      handleUserAnswer(ws, message);
      break;

    case 'admin_start_game':
      handleStartGame();
      break;

    case 'admin_next_question':
      handleNextQuestion();
      break;

    case 'admin_show_results':
      handleShowResults();
      break;

    case 'admin_end_game':
      handleEndGame();
      break;

    default:
      ws.send(JSON.stringify({ type: 'error', message: '未知的訊息類型' }));
  }
}

// 處理用戶加入
function handleUserJoin(ws, message) {
  if (!gameState.allowNewUsers) {
    ws.send(JSON.stringify({ type: 'error', message: '遊戲已開始，無法加入' }));
    return;
  }

  const userId = generateUserId();
  const user = {
    id: userId,
    name: message.name,
    score: 0,
    connected: true,
    ws: ws,
    answers: [],
    totalTime: 0,
    lastSeen: Date.now()
  };

  gameState.users.set(userId, user);

  // 發送連接成功訊息
  ws.send(JSON.stringify({
    type: 'connected',
    userId: userId,
    gameStatus: gameState.status,
    questions: questions.map(q => ({
      question: q.question,
      options: q.options,
      timeLimit: q.timeLimit
    })) // 不包含答案
  }));

  // 廣播用戶列表更新
  broadcast({
    type: 'users_update',
    users: Array.from(gameState.users.values()).map(u => ({
      id: u.id,
      name: u.name,
      connected: u.connected,
      score: u.score
    }))
  });

  console.log(`用戶 ${message.name} (${userId}) 已加入遊戲`);
}

// 處理用戶重連
function handleUserReconnect(ws, message) {
  const user = gameState.users.get(message.userId);

  if (!user) {
    ws.send(JSON.stringify({ type: 'error', message: '用戶不存在' }));
    return;
  }

  // 更新用戶連接狀態
  user.connected = true;
  user.ws = ws;
  user.lastSeen = Date.now();

  // 發送重連成功訊息和當前遊戲狀態
  ws.send(JSON.stringify({
    type: 'reconnected',
    userId: user.id,
    gameStatus: gameState.status,
    currentQuestion: gameState.currentQuestion,
    score: user.score,
    showingResults: gameState.showingResults
  }));

  // 廣播用戶列表更新
  broadcast({
    type: 'users_update',
    users: Array.from(gameState.users.values()).map(u => ({
      id: u.id,
      name: u.name,
      connected: u.connected,
      score: u.score
    }))
  });

  console.log(`用戶 ${user.name} (${user.id}) 已重連`);
}

// 處理用戶答題
function handleUserAnswer(ws, message) {
  const userId = findUserIdByWebSocket(ws);
  const user = gameState.users.get(userId);

  if (!user || gameState.status !== 'playing') {
    ws.send(JSON.stringify({ type: 'error', message: '當前無法作答' }));
    return;
  }

  // 檢查是否已經回答過這題
  const existingAnswer = user.answers.find(a => a.questionIndex === message.questionIndex);
  if (existingAnswer) {
    ws.send(JSON.stringify({ type: 'error', message: '已經回答過這題' }));
    return;
  }

  const currentQuestion = questions[message.questionIndex];
  const isCorrect = message.answer === currentQuestion.correctAnswer;

  // 記錄答案
  const answerRecord = {
    questionIndex: message.questionIndex,
    answer: message.answer,
    timeSpent: message.timeSpent,
    correct: isCorrect,
    timestamp: Date.now()
  };

  user.answers.push(answerRecord);
  user.totalTime += message.timeSpent;

  console.log(`用戶 ${user.name} 回答第 ${message.questionIndex + 1} 題: ${message.answer} (${isCorrect ? '正確' : '錯誤'})`);
}

// 處理開始遊戲
function handleStartGame() {
  if (gameState.status !== 'waiting') {
    return;
  }

  gameState.status = 'playing';
  gameState.allowNewUsers = false;
  gameState.currentQuestion = 0;

  // 發送遊戲開始倒計時
  broadcast({
    type: 'game_starting',
    countdown: 3
  });

  // 3秒後開始第一題
  setTimeout(() => {
    startQuestion(0);
  }, 3000);

  console.log('遊戲開始');
}

// 開始新題目
function startQuestion(questionIndex) {
  gameState.currentQuestion = questionIndex;
  gameState.questionStartTime = Date.now();
  gameState.showingResults = false;

  const question = questions[questionIndex];

  broadcast({
    type: 'question_start',
    question: {
      question: question.question,
      options: question.options,
      timeLimit: question.timeLimit
    },
    questionIndex: questionIndex
  });

  console.log(`開始第 ${questionIndex + 1} 題`);
}

// 處理下一題
function handleNextQuestion() {
  const nextIndex = gameState.currentQuestion + 1;

  if (nextIndex >= questions.length) {
    handleEndGame();
    return;
  }

  // 發送下一題倒計時
  broadcast({
    type: 'next_question_countdown',
    countdown: 3
  });

  // 3秒後開始下一題
  setTimeout(() => {
    startQuestion(nextIndex);
  }, 3000);
}

// 處理顯示結果
function handleShowResults() {
  gameState.showingResults = true;

  const currentQuestion = questions[gameState.currentQuestion];
  const leaderboard = getLeaderboard();

  // 計算分數和排名
  const answeredUsers = Array.from(gameState.users.values())
    .filter(user => user.answers.find(a => a.questionIndex === gameState.currentQuestion))
    .sort((a, b) => {
      const aAnswer = a.answers.find(ans => ans.questionIndex === gameState.currentQuestion);
      const bAnswer = b.answers.find(ans => ans.questionIndex === gameState.currentQuestion);
      return aAnswer.timeSpent - bAnswer.timeSpent;
    });

  // 給答對的用戶計分
  answeredUsers.forEach((user, index) => {
    const answer = user.answers.find(a => a.questionIndex === gameState.currentQuestion);
    if (answer.correct) {
      const rank = index + 1;
      const score = calculateScore(true, answer.timeSpent, rank);
      user.score += score;
    }
  });

  // 發送結果給每個用戶
  gameState.users.forEach(user => {
    const userAnswer = user.answers.find(a => a.questionIndex === gameState.currentQuestion);
    const updatedLeaderboard = getLeaderboard();
    const userRank = updatedLeaderboard.find(item => item.id === user.id);

    sendToUser(user.id, {
      type: 'show_results',
      correctAnswer: currentQuestion.correctAnswer,
      userAnswer: userAnswer ? userAnswer.answer : null,
      score: user.score,
      rank: userRank ? userRank.rank : updatedLeaderboard.length + 1,
      gap: userRank && userRank.rank > 1 ?
        updatedLeaderboard[userRank.rank - 2].score - user.score : 0,
      leaderboard: updatedLeaderboard
    });
  });

  console.log(`顯示第 ${gameState.currentQuestion + 1} 題結果`);
}

// 處理遊戲結束
function handleEndGame() {
  gameState.status = 'finished';

  const finalLeaderboard = getLeaderboard();
  const topThree = finalLeaderboard.slice(0, 3);

  // 發送最終結果給每個用戶
  gameState.users.forEach(user => {
    const userRank = finalLeaderboard.find(item => item.id === user.id);

    sendToUser(user.id, {
      type: 'game_end',
      finalScore: user.score,
      finalRank: userRank ? userRank.rank : finalLeaderboard.length + 1,
      topThree: topThree
    });
  });

  console.log('遊戲結束');
}

// 根據WebSocket找用戶ID
function findUserIdByWebSocket(ws) {
  for (const [userId, user] of gameState.users) {
    if (user.ws === ws) {
      return userId;
    }
  }
  return null;
}

// 定期清理離線用戶（可選）
setInterval(() => {
  const now = Date.now();
  const timeout = 5 * 60 * 1000; // 5分鐘無活動則清理

  for (const [userId, user] of gameState.users) {
    if (!user.connected && now - user.lastSeen > timeout) {
      gameState.users.delete(userId);
      console.log(`清理離線用戶 ${user.name} (${userId})`);
    }
  }
}, 60000); // 每分鐘檢查一次