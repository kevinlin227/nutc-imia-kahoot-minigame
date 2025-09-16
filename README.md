# Kahoot類遊戲

一個使用Node.js和WebSocket實現的多人即時問答遊戲，類似Kahoot。

## 快速開始

```bash
# 安裝依賴
npm install

# 啟動伺服器
npm start
```

伺服器啟動後，訪問 http://localhost 開始遊戲。

## 頁面導航

- **主頁**: http://localhost - 輸入名字加入遊戲
- **遊戲頁**: http://localhost/game - 遊戲進行頁面
- **後台管理**: http://localhost/admin - 管理員控制台

## 遊戲流程

1. 玩家在主頁輸入名稱，進入遊戲等待頁面
2. 管理員在後台點擊"開始遊戲"
3. 3秒倒計時後開始第一題
4. 玩家在10秒內選擇答案
5. 管理員點擊"顯示結果"公布答案和分數
6. 管理員點擊"下一題"繼續遊戲
7. 所有題目完成後顯示最終排名

## 特色功能

- 🎮 多人實時遊戲
- 📊 即時計分排名
- 🔄 斷線自動重連
- 📱 響應式設計
- ⚡ 延遲補償
- 🎯 管理員控制

## 技術架構

- **後端**: Node.js + Express + WebSocket
- **前端**: 原生JavaScript + HTML5 + CSS3
- **通訊**: WebSocket實時雙向通訊
- **監聽端口**: 8080

## 詳細文檔

完整的架構設計和實現細節請參閱 [CLAUDE.md](CLAUDE.md)。

---

🎯 **現在就開始遊戲吧！** 在瀏覽器中打開 http://localhost