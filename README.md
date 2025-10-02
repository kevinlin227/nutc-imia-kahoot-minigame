# 資管系小迎新2025 中科冷知識大挑戰遊戲

一個使用 **Node.js + WebSocket** 實作的多人即時問答遊戲，類似 [Kahoot](https://kahoot.com/)  
使用Claude Code輔助完成

## 🎮 遊戲流程介紹

整體遊戲流程分為三個階段：

1. **玩家加入**
   - 玩家在首頁輸入名稱後進入等待頁面  
   - 等待期間會顯示目前已加入的玩家清單  
  
   ![玩家加入流程圖](/docs/home.jpg)

2. **遊戲進行**
   - 管理員從後台啟動遊戲，開始倒數計時  
   - 題目顯示後，玩家需在限時內作答  
   - 管理員點擊公開答案結算分數該題  
   - 即時計算分數並更新排行榜  

   ![遊戲進行流程圖](/docs/game.jpg)

3. **遊戲結束**
   - 全部題目完成後，顯示最終排名  
   - 公布前三名與各玩家的總分  

   ![遊戲結束流程圖](/docs/end.jpg)

## ⚙️ 後臺頁面 
   - 用直觀的按鈕主持整個遊戲
   - 及時的題目回答狀況和分數排行榜

   ![後臺頁面圖](/docs/admin.jpg)

## ⚙️ 數據分析頁面 
   - 遊戲結束後可以具體的檢視數據分析
   - 整體和每個玩家或題目的個別分析，都可以點擊查看更多

   ![數據分析頁面圖](/docs/analytics.jpg)

## 專案結構 📂
```

kahoot/
├── server.js        # 伺服器主程式
├── home/            # 主頁 (輸入名稱)
├── game/            # 遊戲頁面
├── admin/           # 後台管理頁面
├── analytics/       # 數據分析頁面
├── game-records/    # 遊玩紀錄保存Json
├── public/          # 共用靜態資源
└── config.json      # 客製化設定

````

## 使用方法 🚀
### 本地運行
```bash
git clone https://github.com/kevinlin227/nutc-imia-kahoot-minigame

npm install

npm start
````

開啟瀏覽器：

* 玩家入口：[http://localhost:80](http://localhost:8080)
* 後台管理：[http://localhost:80/admin](http://localhost:8080/admin)
* 數據分析：[http://localhost:80/analytics](http://localhost:8080/analytics)