const express = require('express');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
// UUID使用簡單的隨機字符串生成

const app = express();
const PORT = 80;

// 從JSON文件載入配置
let config = {};
try {
  const configData = fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8');
  config = JSON.parse(configData);
  console.log('成功載入遊戲配置');
} catch (error) {
  console.error('載入配置失敗，使用預設值:', error);
  config = {
    game: {
      name: "知識競賽遊戲",
      startCountdown: 3,
      nextQuestionCountdown: 3
    },
    ui: {
      endGameMessage: "感謝參與本次知識競賽！",
      endGameSubMessage: "希望你在遊戲中學到了新知識。",
      showLeaderboard: false,
      showTopThree: false,
      home: {
        welcomeMessage: "歡迎來到多人即時問答遊戲！",
        welcomeSubMessage: "輸入您的名字開始遊戲",
        nameInputPlaceholder: "請輸入您的名字",
        startButtonText: "🚀 開始遊戲",
        rulesTitle: "遊戲規則",
        rules: [
          "每題有4個選項，選擇正確答案獲得分數",
          "答題速度越快，獲得分數越高",
          "每題限時10秒作答"
        ],
        reconnect: {
          title: "🔄 發現未完成的遊戲",
          messageTemplate: "玩家: <strong>{{playerName}}</strong><br>您可以重新連接到正在進行的遊戲",
          reconnectButtonText: "🚀 重新連接",
          newGameHint: "如要開始新遊戲，請使用下方的輸入框重新輸入名字"
        }
      }
    },
    scoring: {
      baseScore: 100,
      maxTimeBonus: 50,
      minTimeBonus: 10
    }
  };
}

// 從JSON文件載入題目
let questions = [];
try {
  const questionsData = fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8');
  questions = JSON.parse(questionsData);
  console.log(`成功載入 ${questions.length} 道題目`);
} catch (error) {
  console.error('載入題目失敗:', error);
  process.exit(1);
}

// 遊戲狀態
const gameState = {
  status: 'waiting', // waiting, playing, finished
  currentQuestion: 0,
  questionStartTime: null,
  showingResults: false,
  users: new Map(),
  allowNewUsers: true,
  timeoutUsers: new Set() // 記錄超時的用戶
};

// 遊戲記錄相關
let currentGameRecord = null;
const RECORDS_DIR = path.join(__dirname, 'game-records');

// 確保遊戲記錄目錄存在
if (!fs.existsSync(RECORDS_DIR)) {
  fs.mkdirSync(RECORDS_DIR, { recursive: true });
  console.log('創建遊戲記錄目錄:', RECORDS_DIR);
}

// 生成遊戲ID
function generateGameId() {
  const now = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, '-').split('T')[0];
  const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '');
  const randomStr = Math.random().toString(36).substring(2, 8);
  return `game_${dateStr}_${timeStr}_${randomStr}`;
}

// 初始化遊戲記錄
function initializeGameRecord() {
  const gameId = generateGameId();
  currentGameRecord = {
    gameId: gameId,
    gameInfo: {
      name: config.game.name,
      startTime: new Date().toISOString(),
      endTime: null,
      duration: 0
    },
    participants: [],
    questions: [],
    leaderboard: []
  };

  console.log(`初始化遊戲記錄: ${gameId}`);
  return currentGameRecord;
}

// 更新參與者記錄
function updateParticipantRecord(user) {
  if (!currentGameRecord) return;

  let participant = currentGameRecord.participants.find(p => p.playerId === user.id);

  if (!participant) {
    participant = {
      playerId: user.id,
      playerName: user.name,
      joinTime: new Date().toISOString(),
      finalScore: 0,
      finalRank: 0,
      totalAnswerTime: 0,
      correctAnswers: 0,
      answers: []
    };
    currentGameRecord.participants.push(participant);
  }

  // 更新基本信息
  participant.finalScore = user.score;
  participant.totalAnswerTime = user.totalTime;
  participant.correctAnswers = user.answers.filter(a => a.correct).length;

  // 更新詳細答題記錄 - 簡潔格式
  participant.answers = user.answers.map(answer => ({
    q: answer.questionIndex,           // 問題索引
    a: answer.answer,                  // 選擇的答案
    correct: answer.correct,           // 是否正確
    time: answer.timeSpent,           // 用時(毫秒)
    score: answer.scoreGained || 0,   // 得分
    timestamp: answer.timestamp       // 時間戳
  }));
}

// 記錄問題基本信息（不含分析數據）
function recordQuestionStats(questionIndex) {
  if (!currentGameRecord) return;

  const question = questions[questionIndex];

  // 只記錄問題基本信息，分析數據後續計算
  const questionRecord = {
    index: questionIndex,
    question: question.question,
    options: question.options,
    correctAnswer: question.correctAnswer
  };

  // 更新或添加問題記錄
  const existingStatIndex = currentGameRecord.questions.findIndex(q => q.index === questionIndex);
  if (existingStatIndex >= 0) {
    currentGameRecord.questions[existingStatIndex] = questionRecord;
  } else {
    currentGameRecord.questions.push(questionRecord);
  }
}

// 完成並保存遊戲記錄
function finalizeAndSaveGameRecord() {
  if (!currentGameRecord) return null;

  // 設置結束時間和持續時間
  const endTime = new Date();
  const startTime = new Date(currentGameRecord.gameInfo.startTime);

  currentGameRecord.gameInfo.endTime = endTime.toISOString();
  currentGameRecord.gameInfo.duration = endTime.getTime() - startTime.getTime();

  // 更新最終排行榜
  const finalLeaderboard = getLeaderboard();
  currentGameRecord.leaderboard = finalLeaderboard.map(entry => ({
    rank: entry.rank,
    playerId: entry.id,
    playerName: entry.name,
    score: entry.score
  }));

  // 更新參與者的最終排名
  currentGameRecord.participants.forEach(participant => {
    const leaderboardEntry = finalLeaderboard.find(entry => entry.id === participant.playerId);
    if (leaderboardEntry) {
      participant.finalRank = leaderboardEntry.rank;
    }
  });

  // 保存記錄到文件
  const fileName = `${currentGameRecord.gameId}.json`;
  const filePath = path.join(RECORDS_DIR, fileName);

  try {
    fs.writeFileSync(filePath, JSON.stringify(currentGameRecord, null, 2), 'utf8');
    console.log(`遊戲記錄已保存: ${filePath}`);

    // 創建記錄摘要
    const summary = {
      gameId: currentGameRecord.gameId,
      startTime: currentGameRecord.gameInfo.startTime,
      endTime: currentGameRecord.gameInfo.endTime,
      duration: Math.round(currentGameRecord.gameInfo.duration / 1000) + '秒',
      totalParticipants: currentGameRecord.participants.length,
      totalQuestions: currentGameRecord.questions.length,
      fileName: fileName
    };

    console.log('遊戲記錄摘要:', summary);
    return { filePath, summary };

  } catch (error) {
    console.error('保存遊戲記錄失敗:', error);
    return null;
  }
}

// 生成用戶ID
function generateUserId() {
  return 'user_' + Math.random().toString(36).substring(2, 15);
}

// 計算分數
function calculateScore(isCorrect, timeSpent, rank, totalParticipants = 1) {
  if (!isCorrect) return 0;

  const baseScore = config.scoring.baseScore;

  // 名次加分系統 - 根據參與人數動態調整
  const rankConfig = config.scoring.rankBonus;
  let rankBonus = 0;

  if (rankConfig) {
    if (totalParticipants <= 1) {
      // 只有一個人參與，給予最大獎勵
      rankBonus = rankConfig.maxRankBonus;
    } else {
      // 多人參與時，按排名計算獎勵
      const maxRanksForBonus = Math.ceil((rankConfig.maxRankBonus - rankConfig.minRankBonus) / rankConfig.rankDecrement) + 1;

      if (rank <= maxRanksForBonus) {
        rankBonus = Math.max(
          rankConfig.maxRankBonus - (rank - 1) * rankConfig.rankDecrement,
          rankConfig.minRankBonus
        );
      } else {
        // 排名太後面的人只能獲得最低獎勵
        rankBonus = rankConfig.minRankBonus;
      }
    }
  }

  // 時間加權分數系統
  const timeConfig = config.scoring.timeBonus;
  let timeBonus = 0;

  if (timeConfig && timeSpent <= timeConfig.maxTime) {
    if (timeSpent <= timeConfig.perfectTimeThreshold) {
      // 在完美時間內，獲得滿分時間獎勵
      timeBonus = timeConfig.maxTimeBonus;
    } else {
      // 超過完美時間後，線性遞減到最低分
      const timeRange = timeConfig.maxTime - timeConfig.perfectTimeThreshold;
      const bonusRange = timeConfig.maxTimeBonus - timeConfig.minTimeBonus;
      const timeOverPerfect = timeSpent - timeConfig.perfectTimeThreshold;

      timeBonus = timeConfig.maxTimeBonus - (timeOverPerfect / timeRange) * bonusRange;
      timeBonus = Math.max(timeBonus, timeConfig.minTimeBonus);
    }
  } else {
    // 如果沒有時間獎勵配置，使用簡單的時間獎勵系統
    const maxTimeBonus = config.scoring.maxTimeBonus || 50;
    const minTimeBonus = config.scoring.minTimeBonus || 10;
    const maxTime = 10000; // 10秒

    if (timeSpent <= maxTime) {
      // 越快答越多分
      timeBonus = maxTimeBonus - ((timeSpent / maxTime) * (maxTimeBonus - minTimeBonus));
      timeBonus = Math.max(timeBonus, minTimeBonus);
    }
  }

  const totalScore = baseScore + rankBonus + Math.round(timeBonus);

  console.log(`計分詳情 - 基礎分:${baseScore}, 名次獎勵:${rankBonus} (排名:${rank}/${totalParticipants}), 時間獎勵:${Math.round(timeBonus)}, 總分:${totalScore}, 用時:${timeSpent}ms`);

  return totalScore;
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

// 廣播訊息給所有用戶（包括管理員）
function broadcast(message, excludeWs = null) {
  wss.clients.forEach(client => {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// 廣播訊息給所有管理員
function broadcastToAdmins(message) {
  wss.clients.forEach(client => {
    if (client.isAdmin && client.readyState === WebSocket.OPEN) {
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

// 提供配置信息API
app.get('/api/config', (req, res) => {
  res.json({
    gameName: config.game.name,
    ui: {
      endGameMessage: config.ui.endGameMessage,
      endGameSubMessage: config.ui.endGameSubMessage,
      showLeaderboard: config.ui.showLeaderboard,
      showTopThree: config.ui.showTopThree,
      home: config.ui.home
    }
  });
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

    case 'timeout':
      handleUserTimeout(ws, message);
      break;

    case 'admin_connect':
      handleAdminConnect(ws, message);
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

    case 'admin_reset_game':
      handleResetGame();
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
    totalQuestions: questions.length,
    questions: questions.map(q => ({
      question: q.question,
      options: q.options,
      timeLimit: q.timeLimit || 10000 // 預設10秒
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

  // 準備重連響應數據
  const reconnectData = {
    type: 'reconnected',
    userId: user.id,
    gameStatus: gameState.status,
    currentQuestion: gameState.currentQuestion,
    score: user.score,
    showingResults: gameState.showingResults,
    totalQuestions: questions.length,
    questions: questions.map(q => ({
      question: q.question,
      options: q.options,
      timeLimit: q.timeLimit || 10000 // 預設10秒
    })) // 不包含答案
  };

  // 如果正在顯示結果，包含結果數據
  if (gameState.showingResults && gameState.currentQuestion >= 0) {
    const currentQuestion = questions[gameState.currentQuestion];
    const userAnswer = user.answers.find(a => a.questionIndex === gameState.currentQuestion);

    // 計算排行榜
    const leaderboard = Array.from(gameState.users.values())
      .sort((a, b) => {
        if (a.score !== b.score) return b.score - a.score;
        return a.totalTime - b.totalTime;
      })
      .map((u, index) => ({
        rank: index + 1,
        id: u.id,
        name: u.name,
        score: u.score
      }));

    const userRank = leaderboard.findIndex(item => item.id === user.id) + 1;
    const gap = userRank > 1 ? leaderboard[userRank - 2].score - user.score : 0;

    reconnectData.resultData = {
      correctAnswer: currentQuestion.correctAnswer,
      userAnswer: userAnswer ? userAnswer.answer : null,
      leaderboard: leaderboard,
      rank: userRank,
      gap: gap
    };
  }

  // 發送重連成功訊息和當前遊戲狀態
  ws.send(JSON.stringify(reconnectData));

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

// 處理管理員連接
function handleAdminConnect(ws, message) {
  // 標記這個WebSocket為管理員連接
  ws.isAdmin = true;

  // 發送當前遊戲狀態
  ws.send(JSON.stringify({
    type: 'admin_connected',
    gameStatus: gameState.status,
    currentQuestion: gameState.currentQuestion,
    showingResults: gameState.showingResults,
    totalQuestions: questions.length,
    users: Array.from(gameState.users.values()).map(u => ({
      id: u.id,
      name: u.name,
      connected: u.connected,
      score: u.score
    }))
  }));

  console.log('管理員已連接');
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

  // 立即更新遊戲記錄中的參與者數據
  updateParticipantRecord(user);

  // 向管理員發送即時作答統計
  broadcastToAdmins({
    type: 'answer_stats',
    questionIndex: message.questionIndex,
    stats: getAnswerStats(message.questionIndex)
  });

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

  // 初始化遊戲記錄
  initializeGameRecord();

  // 記錄所有現有參與者
  gameState.users.forEach(user => {
    updateParticipantRecord(user);
  });

  // 發送遊戲開始倒計時
  broadcast({
    type: 'game_starting',
    countdown: config.game.startCountdown
  });

  // 向管理員發送遊戲開始倒計時
  broadcastToAdmins({
    type: 'admin_game_starting',
    countdown: config.game.startCountdown
  });

  // 配置秒數後開始第一題
  setTimeout(() => {
    startQuestion(0);
  }, config.game.startCountdown * 1000);

  console.log('遊戲開始');
}

// 開始新題目
function startQuestion(questionIndex) {
  gameState.currentQuestion = questionIndex;
  gameState.questionStartTime = Date.now();
  gameState.showingResults = false;

  // 清除上一題的超時記錄
  gameState.timeoutUsers.clear();

  const question = questions[questionIndex];

  const timeLimit = question.timeLimit || 10000; // 預設10秒

  broadcast({
    type: 'question_start',
    question: {
      question: question.question,
      options: question.options,
      timeLimit: timeLimit
    },
    questionIndex: questionIndex
  });

  // 向管理員發送題目開始通知
  broadcastToAdmins({
    type: 'admin_question_start',
    questionIndex: questionIndex,
    question: question,
    timeLimit: timeLimit
  });

  // 啟動管理員統計更新
  startStatsUpdater(questionIndex);

  // 初始統計
  setTimeout(() => {
    broadcastToAdmins({
      type: 'answer_stats',
      questionIndex: questionIndex,
      stats: getAnswerStats(questionIndex)
    });
  }, 500);

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
    countdown: config.game.nextQuestionCountdown
  });

  // 向管理員發送下一題倒計時
  broadcastToAdmins({
    type: 'admin_next_question_countdown',
    countdown: config.game.nextQuestionCountdown
  });

  // 配置秒數後開始下一題
  setTimeout(() => {
    startQuestion(nextIndex);
  }, config.game.nextQuestionCountdown * 1000);
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

  // 給答對的用戶計分 - 只計算答對用戶的排名
  const correctUsers = answeredUsers.filter(user => {
    const answer = user.answers.find(a => a.questionIndex === gameState.currentQuestion);
    return answer && answer.correct;
  });

  correctUsers.forEach((user, index) => {
    const answer = user.answers.find(a => a.questionIndex === gameState.currentQuestion);
    const rank = index + 1; // 在答對用戶中的排名
    const totalCorrectUsers = correctUsers.length; // 答對的總人數
    const score = calculateScore(true, answer.timeSpent, rank, totalCorrectUsers);
    user.score += score;

    // 將分數記錄到用戶的答案記錄中
    answer.scoreGained = score;

    // 更新遊戲記錄中該答案的得分
    if (currentGameRecord) {
      const participant = currentGameRecord.participants.find(p => p.playerId === user.id);
      if (participant) {
        const participantAnswer = participant.answers.find(a => a.questionIndex === gameState.currentQuestion);
        if (participantAnswer) {
          participantAnswer.scoreGained = score;
        }
      }
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
      scoreGained: userAnswer && userAnswer.scoreGained ? userAnswer.scoreGained : 0,
      rank: userRank ? userRank.rank : updatedLeaderboard.length + 1,
      gap: userRank && userRank.rank > 1 ?
        updatedLeaderboard[userRank.rank - 2].score - user.score : 0,
      leaderboard: updatedLeaderboard
    });
  });

  // 記錄問題統計數據
  recordQuestionStats(gameState.currentQuestion);

  // 更新所有參與者記錄（包含最新分數）
  gameState.users.forEach(user => {
    updateParticipantRecord(user);
  });

  // 廣播給管理員狀態更新
  broadcastToAdmins({
    type: 'show_results'
  });

  console.log(`顯示第 ${gameState.currentQuestion + 1} 題結果`);
}

// 處理遊戲結束
function handleEndGame() {
  gameState.status = 'finished';

  const finalLeaderboard = getLeaderboard();
  const topThree = config.ui.showTopThree ? finalLeaderboard.slice(0, 3) : [];

  // 準備完整的玩家排行榜
  const allPlayers = finalLeaderboard.map(item => ({
    id: item.id,
    name: item.name,
    score: item.score
  }));

  // 發送最終結果給每個用戶
  gameState.users.forEach(user => {
    const userRank = finalLeaderboard.find(item => item.id === user.id);

    sendToUser(user.id, {
      type: 'game_end',
      finalScore: user.score,
      finalRank: userRank ? userRank.rank : finalLeaderboard.length + 1,
      topThree: topThree,
      allPlayers: allPlayers,
      config: {
        showLeaderboard: config.ui.showLeaderboard,
        showTopThree: config.ui.showTopThree,
        endGameMessage: config.ui.endGameMessage,
        endGameSubMessage: config.ui.endGameSubMessage
      }
    });
  });

  // 廣播遊戲結束訊息給管理員和其他客戶端
  broadcast({
    type: 'game_end',
    status: 'finished',
    topThree: topThree,
    allPlayers: allPlayers
  });

  // 完成並保存遊戲記錄
  const saveResult = finalizeAndSaveGameRecord();
  if (saveResult) {
    console.log(`遊戲結束 - 記錄已保存至: ${saveResult.summary.fileName}`);
  }

  console.log('遊戲結束');
}

// 處理重置遊戲
function handleResetGame() {
  // 重置遊戲狀態
  gameState.status = 'waiting';
  gameState.currentQuestion = 0;
  gameState.questionStartTime = null;
  gameState.showingResults = false;
  gameState.allowNewUsers = true;
  gameState.timeoutUsers.clear();

  // 重置遊戲記錄
  currentGameRecord = null;

  // 斷開所有用戶連接並清空用戶列表
  gameState.users.forEach(user => {
    if (user.ws && user.ws.readyState === WebSocket.OPEN) {
      user.ws.send(JSON.stringify({
        type: 'game_reset',
        message: '遊戲已被管理員重置，請重新連接'
      }));
      user.ws.close();
    }
  });

  // 清空用戶列表
  gameState.users.clear();

  // 通知所有管理員遊戲已重置
  broadcastToAdmins({
    type: 'game_reset',
    gameStatus: gameState.status,
    users: []
  });

  console.log('遊戲已重置');
}

// 處理用戶超時
function handleUserTimeout(ws, message) {
  const userId = findUserIdByWebSocket(ws);
  const user = gameState.users.get(userId);

  if (!user || gameState.status !== 'playing') {
    return;
  }

  // 檢查是否已經回答過這題
  const existingAnswer = user.answers.find(a => a.questionIndex === message.questionIndex);
  if (existingAnswer) {
    return;
  }

  // 記錄超時用戶
  gameState.timeoutUsers.add(userId);

  // 向管理員發送作答統計更新
  broadcastToAdmins({
    type: 'answer_stats',
    questionIndex: message.questionIndex,
    stats: getAnswerStats(message.questionIndex)
  });

  console.log(`用戶 ${user.name} 第 ${message.questionIndex + 1} 題超時`);
}

// 定期更新管理員頁面統計（由於客戶端計時，每2秒更新一次）
function startStatsUpdater(questionIndex) {
  const statsInterval = setInterval(() => {
    if (gameState.currentQuestion !== questionIndex || gameState.showingResults) {
      clearInterval(statsInterval);
      return;
    }

    broadcastToAdmins({
      type: 'answer_stats',
      questionIndex: questionIndex,
      stats: getAnswerStats(questionIndex)
    });
  }, 2000);

  return statsInterval;
}

// 獲取作答統計
function getAnswerStats(questionIndex) {
  const totalUsers = gameState.users.size;
  const answeredUsers = Array.from(gameState.users.values())
    .filter(user => user.answers.find(a => a.questionIndex === questionIndex));

  const timeoutCount = gameState.timeoutUsers.size;
  const pendingCount = totalUsers - answeredUsers.length - timeoutCount;

  const answerCounts = [0, 0, 0, 0]; // 4個選項的計數

  answeredUsers.forEach(user => {
    const answer = user.answers.find(a => a.questionIndex === questionIndex);
    if (answer && answer.answer >= 0 && answer.answer < 4) {
      answerCounts[answer.answer]++;
    }
  });

  return {
    totalUsers,
    answeredCount: answeredUsers.length,
    timeoutCount,
    pendingCount,
    answerCounts,
    answerPercentages: answerCounts.map(count =>
      totalUsers > 0 ? Math.round((count / totalUsers) * 100) : 0
    ),
    timeoutPercentage: totalUsers > 0 ? Math.round((timeoutCount / totalUsers) * 100) : 0,
    pendingPercentage: totalUsers > 0 ? Math.round((pendingCount / totalUsers) * 100) : 0
  };
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