// 通用WebSocket連接管理
class GameWebSocket {
  constructor() {
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.userId = sessionStorage.getItem('gameUserId');
    this.messageHandlers = new Map();
    this.autoReconnect = false; // 暫時禁用自動重連

    // 為當前分頁生成唯一標識符
    if (!sessionStorage.getItem('tabId')) {
      sessionStorage.setItem('tabId', 'tab_' + Math.random().toString(36).substring(2, 15));
    }
    this.tabId = sessionStorage.getItem('tabId');
  }

  connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${location.host}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('WebSocket連接成功');
      this.reconnectAttempts = 0;

      // 如果有userId，嘗試重連
      if (this.userId) {
        this.send({
          type: 'reconnect',
          userId: this.userId
        });
      }

      if (this.onopen) {
        this.onopen();
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (error) {
        console.error('解析訊息失敗:', error);
      }
    };

    this.ws.onclose = () => {
      console.log('WebSocket連接關閉');

      if (this.onclose) {
        this.onclose();
      }

      // 自動重連（如果啟用）
      if (this.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
        setTimeout(() => {
          this.reconnectAttempts++;
          console.log(`嘗試重連 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          this.connect();
        }, this.reconnectDelay * this.reconnectAttempts);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket錯誤:', error);

      if (this.onerror) {
        this.onerror(error);
      }
    };
  }

  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  handleMessage(message) {
    console.log('收到WebSocket消息:', message.type, message);

    // 通用訊息處理
    switch (message.type) {
      case 'connected':
        this.userId = message.userId;
        sessionStorage.setItem('gameUserId', this.userId);
        break;

      case 'reconnected':
        console.log('重連成功');
        break;

      case 'error':
        console.error('伺服器錯誤:', message.message);
        // 錯誤處理交給具體頁面處理，這裡只記錄日誌
        break;
    }

    // 調用註冊的處理器
    const handler = this.messageHandlers.get(message.type);
    if (handler) {
      console.log('調用處理器:', message.type);
      handler(message);
    } else {
      console.warn('沒有找到處理器:', message.type);
    }
  }

  on(messageType, handler) {
    this.messageHandlers.set(messageType, handler);
  }

  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

// 通知系統
function showNotification(message, type = 'info') {
  // 移除現有通知
  const existing = document.querySelector('.notification');
  if (existing) {
    existing.remove();
  }

  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;

  // 添加CSS樣式
  Object.assign(notification.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    padding: '15px 20px',
    borderRadius: '10px',
    color: 'white',
    fontWeight: 'bold',
    zIndex: '9999',
    animation: 'slideIn 0.3s ease',
    background: type === 'error' ? '#dc3545' : type === 'success' ? '#28a745' : '#667eea'
  });

  document.body.appendChild(notification);

  // 3秒後自動移除
  setTimeout(() => {
    if (notification.parentNode) {
      notification.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.remove();
        }
      }, 300);
    }
  }, 3000);
}

// 添加動畫CSS
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(100%);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);

// 倒計時功能
function startCountdown(element, seconds, callback) {
  let remaining = seconds;
  element.textContent = remaining;

  const interval = setInterval(() => {
    remaining--;
    element.textContent = remaining;

    if (remaining <= 0) {
      clearInterval(interval);
      if (callback) {
        callback();
      }
    }
  }, 1000);

  return interval;
}

// 計時器功能
function startTimer(element, duration, callback) {
  let remaining = duration;

  const interval = setInterval(() => {
    const seconds = Math.ceil(remaining / 1000);
    element.textContent = seconds;

    remaining -= 100;

    if (remaining <= 0) {
      clearInterval(interval);
      element.textContent = '0';
      if (callback) {
        callback();
      }
    }
  }, 100);

  return interval;
}

// 格式化時間
function formatTime(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const ms = Math.floor((milliseconds % 1000) / 100);
  return `${seconds}.${ms}秒`;
}

// 清除所有計時器（避免跨分頁干擾）
function clearAllTimers() {
  // 使用分頁唯一的計時器數組
  if (!window.currentTabTimers) {
    window.currentTabTimers = [];
  }
  window.currentTabTimers.forEach(timer => clearInterval(timer));
  window.currentTabTimers = [];
}