"use strict";
const $ = (id) => document.getElementById(id);
const loginCard = $("loginCard");
const loginForm = $("loginForm");
const passwordInput = $("passwordInput");
const loginError = $("loginError");
const messagesEl = $("messages");
const chatForm = $("chatForm");
const messageInput = $("messageInput");
const sendBtn = $("sendBtn");
const statusText = $("statusText");
const newChatBtn = $("newChat");
const settingsBtn = $("settingsBtn");
const memoryPanel = $("memoryPanel");
const memoryInput = $("memoryInput");
const closeMemoryBtn = $("closeMemory");
const saveMemoryBtn = $("saveMemory");
const clearMemoryBtn = $("clearMemory");
const STORAGE_MESSAGES = "rio_chat_messages_v1";
const STORAGE_MEMORY = "rio_chat_memory_v1";
let conversation = [];
let isAuthenticated = false;
let isSending = false;
function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}
function saveMessages() {
  try {
    localStorage.setItem(STORAGE_MESSAGES, JSON.stringify(conversation));
  } catch {
    // 如果浏览器禁止存储，聊天仍然可以继续。
  }
}
function getMemory() {
  try {
    return localStorage.getItem(STORAGE_MEMORY) || "";
  } catch {
    return "";
  }
}
function saveMemory() {
  try {
    localStorage.setItem(STORAGE_MEMORY, memoryInput.value);
    return true;
  } catch {
    return false;
  }
}
function setStatus(text) {
  if (statusText) statusText.textContent = text;
}
function showLoginError(text) {
  if (loginError) loginError.textContent = text || "";
}
function setChatEnabled(enabled) {
  if (messageInput) messageInput.disabled = !enabled;
  if (sendBtn) sendBtn.disabled = !enabled || isSending;
}
function renderMessage(role, content) {
  const row = document.createElement("div");
  row.className = `message ${role === "user" ? "user-message" : "assistant-message"}`;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = content;
  row.appendChild(bubble);
  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
function renderConversation() {
  if (!messagesEl) return;
  messagesEl.replaceChildren();
  if (conversation.length === 0) {
    const welcome = document.createElement("div");
    welcome.className = "welcome";
    const ornament = document.createElement("div");
    ornament.className = "ornament";
    ornament.textContent = "✧　♡　✧";
    const title = document.createElement("h2");
    title.textContent = "欢迎回来";
    const text = document.createElement("p");
    text.textContent = "月城凛央正在等你。";
    welcome.append(ornament, title, text);
    messagesEl.appendChild(welcome);
    return;
  }
  for (const item of conversation) {
    if (
      item &&
      (item.role === "user" || item.role === "assistant") &&
      typeof item.content === "string"
    ) {
      renderMessage(item.role, item.content);
    }
  }
}
async function requestJSON(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      credentials: "same-origin",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
  } catch {
    throw new Error("无法连接服务器，请检查网络后再试。");
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("服务器返回了无法识别的内容，请稍后再试。");
  }
  if (!response.ok) {
    throw new Error(data.error || `请求失败（${response.status}）。`);
  }
  return data;
}
async function checkStatus() {
  setStatus("正在连接……");
  try {
    const data = await requestJSON("/api/status", { method: "GET" });
    if (!data.configured) {
      isAuthenticated = false;
      loginCard.hidden = false;
      setChatEnabled(false);
      setStatus("尚未完成配置");
      showLoginError("服务器尚未配置聊天室密码或 API 密钥，请检查 Render 环境变量。");
      return;
    }
    if (data.authenticated) {
      enterChat();
    } else {
      isAuthenticated = false;
      loginCard.hidden = false;
      setChatEnabled(false);
      setStatus("正在等待你");
    }
  } catch (error) {
    setStatus("连接失败");
    showLoginError(error.message);
  }
}
function enterChat() {
  isAuthenticated = true;
  loginCard.hidden = true;
  showLoginError("");
  setChatEnabled(true);
  setStatus("凛央正在等你");
  renderConversation();
}
loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = passwordInput.value;
  if (!password) {
    showLoginError("请输入聊天室密码。");
    return;
  }
  const submitButton = loginForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  showLoginError("正在验证密码……");
  try {
    await requestJSON("/api/login", {
      method: "POST",
      body: JSON.stringify({ password })
    });
    passwordInput.value = "";
    enterChat();
  } catch (error) {
    showLoginError(error.message);
  } finally {
    submitButton.disabled = false;
  }
});
chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isAuthenticated || isSending) return;
  const content = messageInput.value.trim();
  if (!content) return;
  conversation.push({ role: "user", content });
  saveMessages();
  renderConversation();
  messageInput.value = "";
  isSending = true;
  setChatEnabled(false);
  setStatus("凛央正在思考……");
  const waiting = document.createElement("div");
  waiting.className = "message assistant-message";
  waiting.id = "rio-waiting";
  const waitingBubble = document.createElement("div");
  waitingBubble.className = "bubble";
  waitingBubble.textContent = "（凛央正在斟酌如何回答……）";
  waiting.appendChild(waitingBubble);
  messagesEl.appendChild(waiting);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  try {
    const data = await requestJSON("/api/chat", {
      method: "POST",
      body: JSON.stringify({
        messages: conversation.slice(-30),
        memory: getMemory()
      })
    });
    conversation.push({
      role: "assistant",
      content: data.reply || "（凛央暂时没有回答。）"
    });
    saveMessages();
  } catch (error) {
    conversation.push({
      role: "assistant",
      content: `（连接出现了一点问题：${error.message}）`
    });
    saveMessages();
  } finally {
    isSending = false;
    setChatEnabled(isAuthenticated);
    setStatus("凛央正在等你");
    renderConversation();
    messageInput.focus();
  }
});
messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    if (typeof chatForm.requestSubmit === "function") {
      chatForm.requestSubmit();
    } else {
      sendBtn.click();
    }
  }
});
newChatBtn.addEventListener("click", () => {
  if (!confirm("确定开始新聊天吗？当前对话记录将被清除。")) return;
  conversation = [];
  saveMessages();
  renderConversation();
  setStatus("凛央正在等你");
});
settingsBtn.addEventListener("click", () => {
  memoryInput.value = getMemory();
  memoryPanel.classList.remove("hidden");
});
closeMemoryBtn.addEventListener("click", () => {
  memoryPanel.classList.add("hidden");
});
saveMemoryBtn.addEventListener("click", () => {
  if (saveMemory()) {
    alert("角色记忆已保存。");
    memoryPanel.classList.add("hidden");
  } else {
    alert("保存失败，请检查浏览器存储设置。");
  }
});
clearMemoryBtn.addEventListener("click", () => {
  if (!confirm("确定清空保存的角色记忆吗？")) return;
  try {
    localStorage.removeItem(STORAGE_MEMORY);
    memoryInput.value = "";
    alert("角色记忆已清空。");
  } catch {
    alert("清空失败，请检查浏览器存储设置。");
  }
});
conversation = readStorage(STORAGE_MESSAGES, []);
if (!Array.isArray(conversation)) conversation = [];
memoryInput.value = getMemory();
checkStatus();
