# Kahoot類遊戲架構設計

## 專案概述
使用Node.js和WebSocket創建的多人即時問答遊戲，類似Kahoot。支援多用戶同時遊戲、實時計分排名、斷線重連等功能。

## 技術架構

### 後端技術
- **Node.js** - 主要運行環境
- **ws** - WebSocket庫，用於實時通訊
- **express** - HTTP伺服器，用於靜態文件服務
- **監聽端口**: 80

### 前端技術
- **原生JavaScript** - 客戶端邏輯
- **WebSocket API** - 與伺服器實時通訊
- **HTML5/CSS3** - 用戶界面

## 專案結構
```
kahoot/
├── server.js              # 主伺服器文件，包含所有後台邏輯
├── home/                  # 主頁面目錄
│   └── index.html         # 主頁面（輸入名字）
├── game/                  # 遊戲頁面目錄
│   └── index.html         # 遊戲頁面（等待+遊戲進行+結果）
├── admin/                 # 後台管理目錄
│   └── index.html         # 後台管理頁面
├── public/                # 共用靜態資源
│   ├── css/
│   │   └── style.css      # 通用樣式
│   └── js/
│       └── common.js      # 通用JavaScript函數
└── package.json           # 專案配置
```

## 遊戲流程設計

### 1. 用戶進入流程
1. **主頁面** (home/index.html)
   - 輸入用戶名稱
   - 點擊"開始遊戲"按鈕
   - 跳轉到遊戲頁面

2. **遊戲頁面** (game/index.html)
   - 建立WebSocket連接
   - 伺服器分配唯一用戶ID
   - 預載入題目選項（不含答案）
   - 顯示等待狀態（等待其他玩家和管理員開始）
   - 顯示當前參與者列表

3. **遊戲開始**
   - 後台管理員啟動遊戲
   - 鎖定新用戶加入
   - 頁面顯示3秒倒計時
   - 切換到題目顯示模式（同一頁面內狀態切換）

### 2. 遊戲進行流程
1. **題目顯示**
   - 顯示題目和4個選項
   - 開始10秒倒計時
   - 用戶點擊選項作答

2. **作答處理**
   - 記錄用戶答案和作答時間
   - 發送到伺服器
   - 等待其他用戶完成或超時

3. **答案公布**
   - 顯示正確答案（綠色）
   - 顯示用戶選擇（如錯誤則紅色）
   - 顯示當前分數和排名
   - 顯示與前一名的分數差距

4. **下一題準備**
   - 後台控制進入下一題
   - 3秒倒計時
   - 重複遊戲流程

### 3. 遊戲結束
- 顯示最終排名
- 顯示前三名
- 顯示個人分數統計

## 數據結構設計

### 用戶對象 (User)
```javascript
{
  id: "user_unique_id",
  name: "用戶名稱",
  score: 0,
  connected: true,
  answers: [
    {
      questionIndex: 0,
      answer: 2,
      timeSpent: 3500, // 毫秒
      correct: true
    }
  ],
  lastSeen: timestamp
}
```

### 題目對象 (Question)
```javascript
{
  index: 0,
  question: "題目內容",
  options: ["選項A", "選項B", "選項C", "選項D"],
  correctAnswer: 1, // 僅伺服器端保存
  timeLimit: 10000 // 毫秒
}
```

### 遊戲狀態 (GameState)
```javascript
{
  status: "waiting", // waiting, playing, finished
  currentQuestion: 0,
  questionStartTime: null,
  showingResults: false,
  users: Map(), // 用戶ID對應用戶對象
  questions: [],
  allowNewUsers: true
}
```

## WebSocket訊息協議

### 客戶端到伺服器
```javascript
// 用戶加入遊戲
{ type: "join", name: "用戶名稱" }

// 用戶作答
{ type: "answer", questionIndex: 0, answer: 2, timeSpent: 3500 }

// 重連請求
{ type: "reconnect", userId: "user_id" }

// 後台控制訊息
{ type: "admin_start_game" }
{ type: "admin_next_question" }
{ type: "admin_show_results" }
{ type: "admin_end_game" }
```

### 伺服器到客戶端
```javascript
// 連接成功
{ type: "connected", userId: "user_id", users: [] }

// 遊戲狀態更新
{ type: "game_status", status: "waiting", users: [] }

// 遊戲開始倒計時
{ type: "game_starting", countdown: 3 }

// 新題目開始
{
  type: "question_start",
  question: {},
  questionIndex: 0,
  timeLimit: 10000
}

// 顯示答案和排名
{
  type: "show_results",
  correctAnswer: 1,
  userAnswer: 2,
  score: 150,
  rank: 3,
  gap: 50,
  leaderboard: []
}

// 遊戲結束
{
  type: "game_end",
  finalScore: 500,
  finalRank: 5,
  topThree: []
}

// 錯誤訊息
{ type: "error", message: "錯誤描述" }
```

## 計分系統設計

### 計分規則
- **基礎分數**: 答對得100分，答錯得0分
- **時間獎勵**: 根據作答速度給予額外分數
  - 最快作答者額外得50分
  - 第二快得40分
  - 第三快得30分
  - 依此類推，最少額外得10分
- **連續答對獎勵**: 連續答對可獲得額外獎勵分數

### 排名計算
- 實時計算所有用戶的總分
- 按分數降序排列
- 相同分數按總作答時間升序排列

## 容錯處理設計

### 網絡延遲處理
- 在客戶端記錄題目開始時間
- 作答時計算本地經過時間
- 伺服器端驗證時間合理性

### 斷線重連機制
1. **斷線檢測**
   - WebSocket連接斷開事件
   - 定期心跳檢測

2. **重連流程**
   - 客戶端自動嘗試重連
   - 發送用戶ID進行身份驗證
   - 伺服器恢復用戶狀態

3. **遊戲狀態同步**
   - 重連後同步當前遊戲狀態
   - 如果錯過題目，標記為跳過
   - 跳過的題目不計分

### 跳題處理
- 如果用戶在題目期間斷線
- 重連後該題目標記為跳過
- 不影響後續題目參與
- 跳過題目在結果中顯示為"未作答"

## 安全考量

### 作弊防護
- 答案僅在伺服器端保存
- 驗證作答時間合理性
- 限制每題只能提交一次答案

### 資料驗證
- 驗證用戶輸入格式
- 檢查WebSocket訊息結構
- 防止SQL注入等攻擊

## 開發階段規劃

### 第一階段：基礎架構
- 設置Node.js專案
- 實現WebSocket伺服器
- 創建基本頁面結構

### 第二階段：核心功能
- 實現用戶管理系統
- 實現遊戲狀態管理
- 實現基本遊戲流程

### 第三階段：進階功能
- 實現計分排名系統
- 實現斷線重連機制
- 實現後台管理功能

### 第四階段：優化測試
- 性能優化
- 錯誤處理完善
- 完整遊戲流程測試

## 示範題目設置

```javascript
const demoQuestions = [
  {
    question: "JavaScript中哪個方法用於添加數組元素？",
    options: ["push()", "add()", "insert()", "append()"],
    correctAnswer: 0
  },
  {
    question: "HTML中哪個標籤用於創建超連結？",
    options: ["<link>", "<href>", "<a>", "<url>"],
    correctAnswer: 2
  },
  {
    question: "CSS中哪個屬性用於設置文字顏色？",
    options: ["text-color", "font-color", "color", "background-color"],
    correctAnswer: 2
  }
];
```

## 部署說明

### 本地開發
```bash
# 安裝依賴
npm install

# 啟動伺服器（監聽端口8080）
npm start
```

伺服器啟動後，訪問以下網址：
- 主頁：http://localhost:3000
- 遊戲頁面：http://localhost:3000/game
- 後台管理：http://localhost:3000/admin

### 生產環境
- 使用PM2或類似工具管理進程
- 配置反向代理（如Nginx）
- 設置HTTPS證書
- 配置防火牆規則
- 修改server.js中的PORT常數為80（如需要）

## 擴展性考量

### 未來可能的功能擴展
- 多房間支援
- 自定義題目集
- 音效和動畫效果
- 移動設備優化
- 社交分享功能
- 歷史遊戲記錄

這個架構設計確保了遊戲的穩定性、可擴展性和良好的用戶體驗，同時處理了網絡不穩定情況下的各種邊緣情況。

## 使用說明

### 啟動遊戲
1. 在命令行執行 `npm start` 啟動伺服器
2. 打開瀏覽器訪問 http://localhost:3000
3. 輸入玩家名稱，點擊"開始遊戲"進入等待頁面

### 管理遊戲
1. 打開 http://localhost:3000/admin 進入後台管理
2. 等待玩家加入後，點擊"開始遊戲"
3. 題目開始後，等待玩家作答（10秒限時）
4. 點擊"顯示結果"查看答案和分數
5. 點擊"下一題"進入下一個問題
6. 所有題目完成後，點擊"結束遊戲"顯示最終排名

### 遊戲特性
- ✅ 支援多人同時遊戲
- ✅ 實時計分和排名系統
- ✅ 斷線自動重連功能
- ✅ 響應式設計，支援手機和電腦
- ✅ 管理員可控制遊戲進度
- ✅ 延遲補償和網絡容錯

### 測試狀態
系統已完成基本測試：
- ✅ 伺服器成功啟動（端口8080）
- ✅ HTTP服務正常運行
- ✅ 靜態文件服務正常
- ✅ WebSocket服務已配置
- ✅ 所有頁面可正常訪問

準備就緒，可以開始遊戲！