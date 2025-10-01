// 遊戲數據分析系統
let gameData = null;

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
    await loadGameData();
    if (gameData) {
        displayGameInfo();
        displayOverallStats();
        displayLeaderboard();
        displayQuestions();
        setupModalHandlers();
    }
});

// 獲取URL參數
function getGameIdFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('gameId');
}

// 載入遊戲數據
async function loadGameData() {
    try {
        const gameId = getGameIdFromURL();
        let url;

        if (gameId) {
            // 從URL參數獲取gameId
            url = `/game-records/${gameId}.json`;
        } else {
            // 使用預設的遊戲記錄
            url = '/game-records/game_2025-10-01_164937_ybddpc.json';
        }

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`無法載入遊戲數據: ${response.status}`);
        }
        gameData = await response.json();
    } catch (error) {
        console.error('無法載入遊戲數據:', error);
        alert('無法載入遊戲數據,請確認檔案路徑是否正確');
    }
}

// 顯示遊戲基本信息
function displayGameInfo() {
    const info = gameData.gameInfo;
    const startTime = new Date(info.startTime);
    const endTime = new Date(info.endTime);
    const duration = Math.floor(info.duration / 1000 / 60);

    document.getElementById('game-info').innerHTML = `
        <div class="game-info-grid">
            <div><strong>遊戲名稱:</strong> ${info.name}</div>
            <div><strong>開始時間:</strong> ${startTime.toLocaleString('zh-TW')}</div>
            <div><strong>結束時間:</strong> ${endTime.toLocaleString('zh-TW')}</div>
            <div><strong>遊戲時長:</strong> ${duration} 分鐘</div>
        </div>
    `;
}

// 計算整體統計
function displayOverallStats() {
    const participants = gameData.participants;
    const totalPlayers = participants.length;
    const totalQuestions = gameData.questions.length;

    const totalScore = participants.reduce((sum, p) => sum + p.finalScore, 0);
    const avgScore = Math.round(totalScore / totalPlayers);

    const totalCorrect = participants.reduce((sum, p) => sum + p.correctAnswers, 0);
    const totalAnswers = participants.reduce((sum, p) => sum + p.answers.length, 0);
    const avgAccuracy = ((totalCorrect / totalAnswers) * 100).toFixed(1);

    document.getElementById('total-players').textContent = totalPlayers;
    document.getElementById('total-questions').textContent = totalQuestions;
    document.getElementById('avg-score').textContent = avgScore;
    document.getElementById('avg-accuracy').textContent = avgAccuracy + '%';
}

// 顯示排行榜
function displayLeaderboard() {
    const tbody = document.getElementById('leaderboard-body');
    tbody.innerHTML = '';

    gameData.leaderboard.forEach((player, index) => {
        const participant = gameData.participants.find(p => p.playerId === player.playerId);
        const totalAnswers = participant.answers.length;
        const accuracy = totalAnswers > 0 ? ((participant.correctAnswers / totalAnswers) * 100).toFixed(1) : 0;
        const avgTime = totalAnswers > 0 ? Math.round(participant.totalAnswerTime / totalAnswers) : 0;

        const row = document.createElement('tr');
        row.className = 'player-row';
        row.dataset.playerId = player.playerId;

        // 前三名特殊樣式
        if (index < 3) {
            row.classList.add(`rank-${index + 1}`);
        }

        row.innerHTML = `
            <td>${getRankBadge(player.rank)}</td>
            <td><strong>${player.playerName}</strong></td>
            <td>${player.score.toLocaleString()}</td>
            <td>${participant.correctAnswers}/${totalAnswers}</td>
            <td>${accuracy}%</td>
            <td>${(avgTime / 1000).toFixed(2)}s</td>
        `;

        row.addEventListener('click', () => showPlayerDetail(participant));
        tbody.appendChild(row);
    });
}

// 獲取排名徽章
function getRankBadge(rank) {
    const badges = {
        1: '🥇',
        2: '🥈',
        3: '🥉'
    };
    return badges[rank] ? `${badges[rank]} ${rank}` : rank;
}

// 顯示題目列表
function displayQuestions() {
    const container = document.getElementById('questions-list');
    container.innerHTML = '';

    gameData.questions.forEach((question, index) => {
        const stats = calculateQuestionStats(index);

        const card = document.createElement('div');
        card.className = 'question-card';
        card.dataset.questionIndex = index;

        const difficultyClass = stats.accuracy >= 70 ? 'easy' : stats.accuracy >= 40 ? 'medium' : 'hard';

        card.innerHTML = `
            <div class="question-header">
                <span class="question-number">題目 ${index + 1}</span>
                <span class="difficulty-badge ${difficultyClass}">
                    ${stats.accuracy >= 70 ? '簡單' : stats.accuracy >= 40 ? '中等' : '困難'}
                </span>
            </div>
            <div class="question-text">${question.question}</div>
            <div class="question-stats">
                <div class="stat-item">
                    <span class="stat-icon">✅</span>
                    <span>正確率: <strong>${stats.accuracy.toFixed(1)}%</strong></span>
                </div>
                <div class="stat-item">
                    <span class="stat-icon">⏱️</span>
                    <span>平均時間: <strong>${(stats.avgTime / 1000).toFixed(2)}s</strong></span>
                </div>
                <div class="stat-item">
                    <span class="stat-icon">👥</span>
                    <span>作答人數: <strong>${stats.totalAnswers}</strong></span>
                </div>
            </div>
        `;

        card.addEventListener('click', () => showQuestionDetail(question, index));
        container.appendChild(card);
    });
}

// 計算題目統計
function calculateQuestionStats(questionIndex) {
    const answers = [];
    gameData.participants.forEach(p => {
        const answer = p.answers.find(a => a.q === questionIndex);
        if (answer) answers.push(answer);
    });

    const correctCount = answers.filter(a => a.correct).length;
    const totalAnswers = answers.length;
    const accuracy = totalAnswers > 0 ? (correctCount / totalAnswers) * 100 : 0;

    const totalTime = answers.reduce((sum, a) => sum + a.time, 0);
    const avgTime = totalAnswers > 0 ? totalTime / totalAnswers : 0;

    return { accuracy, avgTime, totalAnswers, correctCount };
}

// 顯示玩家詳情
function showPlayerDetail(player) {
    const modal = document.getElementById('player-modal');
    const title = document.getElementById('player-modal-title');
    const body = document.getElementById('player-modal-body');

    title.textContent = `${player.playerName} - 詳細答題記錄`;

    // 計算連續答對記錄
    const streaks = calculateStreaks(player.answers);
    const maxStreak = Math.max(...streaks, 0);

    let html = `
        <div class="player-summary">
            <div class="summary-item">
                <span>最終排名:</span>
                <strong>${getRankBadge(player.finalRank)}</strong>
            </div>
            <div class="summary-item">
                <span>總分:</span>
                <strong>${player.finalScore.toLocaleString()}</strong>
            </div>
            <div class="summary-item">
                <span>答對題數:</span>
                <strong>${player.correctAnswers}/${player.answers.length}</strong>
            </div>
            <div class="summary-item">
                <span>最長連續答對:</span>
                <strong>${maxStreak} 題</strong>
            </div>
        </div>

        <h3>答題詳情</h3>
        <div class="answers-timeline">
    `;

    player.answers.forEach((answer, index) => {
        const question = gameData.questions[answer.q];
        const statusClass = answer.correct ? 'correct' : 'incorrect';
        const statusIcon = answer.correct ? '✅' : '❌';

        html += `
            <div class="answer-item ${statusClass}">
                <div class="answer-header">
                    <span class="answer-status">${statusIcon}</span>
                    <span class="answer-question-num">題目 ${answer.q + 1}</span>
                    <span class="answer-time">${(answer.time / 1000).toFixed(2)}s</span>
                    <span class="answer-score">+${answer.score}</span>
                </div>
                <div class="answer-question">${question.question}</div>
                <div class="answer-options">
                    <div>你的答案: <strong>${question.options[answer.a]}</strong></div>
                    ${!answer.correct ? `<div>正確答案: <strong class="correct-answer">${question.options[question.correctAnswer]}</strong></div>` : ''}
                </div>
            </div>
        `;
    });

    html += '</div>';
    body.innerHTML = html;
    modal.style.display = 'block';
}

// 計算連續答對記錄
function calculateStreaks(answers) {
    const streaks = [];
    let currentStreak = 0;

    answers.forEach(answer => {
        if (answer.correct) {
            currentStreak++;
        } else {
            if (currentStreak > 0) streaks.push(currentStreak);
            currentStreak = 0;
        }
    });

    if (currentStreak > 0) streaks.push(currentStreak);
    return streaks;
}

// 顯示題目詳情
function showQuestionDetail(question, questionIndex) {
    const modal = document.getElementById('question-modal');
    const title = document.getElementById('question-modal-title');
    const body = document.getElementById('question-modal-body');

    title.textContent = `題目 ${questionIndex + 1} - 詳細分析`;

    const stats = calculateQuestionStats(questionIndex);
    const answerDistribution = calculateAnswerDistribution(questionIndex);

    let html = `
        <div class="question-detail-header">
            <div class="question-text-large">${question.question}</div>
            <div class="question-stats-summary">
                <div class="stat-box">
                    <div class="stat-label">正確率</div>
                    <div class="stat-value-large">${stats.accuracy.toFixed(1)}%</div>
                </div>
                <div class="stat-box">
                    <div class="stat-label">平均時間</div>
                    <div class="stat-value-large">${(stats.avgTime / 1000).toFixed(2)}s</div>
                </div>
                <div class="stat-box">
                    <div class="stat-label">作答人數</div>
                    <div class="stat-value-large">${stats.totalAnswers}</div>
                </div>
            </div>
        </div>

        <h3>選項分佈</h3>
        <div class="options-distribution">
    `;

    question.options.forEach((option, optIndex) => {
        const count = answerDistribution[optIndex] || 0;
        const percentage = stats.totalAnswers > 0 ? (count / stats.totalAnswers * 100).toFixed(1) : 0;
        const isCorrect = optIndex === question.correctAnswer;

        html += `
            <div class="option-bar ${isCorrect ? 'correct-option' : ''}">
                <div class="option-label">
                    ${isCorrect ? '✅' : ''} ${option}
                </div>
                <div class="option-stats">
                    <div class="bar-container">
                        <div class="bar-fill" style="width: ${percentage}%"></div>
                    </div>
                    <span class="option-count">${count} 人 (${percentage}%)</span>
                </div>
            </div>
        `;
    });

    html += `
        </div>
        <h3>各玩家表現</h3>
        <div class="players-performance">
            <table>
                <thead>
                    <tr>
                        <th>玩家</th>
                        <th>答案</th>
                        <th>結果</th>
                        <th>答題時間</th>
                        <th>得分</th>
                    </tr>
                </thead>
                <tbody>
    `;

    gameData.participants.forEach(participant => {
        const answer = participant.answers.find(a => a.q === questionIndex);
        if (answer) {
            html += `
                <tr class="${answer.correct ? 'correct-row' : 'incorrect-row'}">
                    <td>${participant.playerName}</td>
                    <td>${question.options[answer.a]}</td>
                    <td>${answer.correct ? '✅ 正確' : '❌ 錯誤'}</td>
                    <td>${(answer.time / 1000).toFixed(2)}s</td>
                    <td>${answer.score}</td>
                </tr>
            `;
        }
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    body.innerHTML = html;
    modal.style.display = 'block';
}

// 計算答案分佈
function calculateAnswerDistribution(questionIndex) {
    const distribution = {};

    gameData.participants.forEach(p => {
        const answer = p.answers.find(a => a.q === questionIndex);
        if (answer) {
            distribution[answer.a] = (distribution[answer.a] || 0) + 1;
        }
    });

    return distribution;
}

// 設置彈窗處理器
function setupModalHandlers() {
    const modals = document.querySelectorAll('.modal');
    const closes = document.querySelectorAll('.close');

    closes.forEach((close, index) => {
        close.addEventListener('click', () => {
            modals[index].style.display = 'none';
        });
    });

    window.addEventListener('click', (e) => {
        modals.forEach(modal => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    });
}
