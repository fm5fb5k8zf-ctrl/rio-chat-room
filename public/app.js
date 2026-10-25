const $ = (id) => document.getElementById(id);
const messagesEl = $("messages");
const input = $("messageInput");
const sendBtn = $("sendBtn");
const chatForm = $("chatForm");
const loginCard = $("loginCard");
const loginForm = $("loginForm");
const loginError = $("loginError");
const statusText = $("statusText");
const memoryPanel = $("memoryPanel");
const memoryInput = $("memoryInput");
const STORAGE_MESSAGES = "rio_chat_messages_v1";
const STORAGE_MEMORY = "rio_chat_memory_v1";
let messages = [];
let busy = false;

function timeNow(){ return new Intl.DateTimeFormat("zh-CN",{hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date()); }
function saveMessages(){ try { localStorage.setItem(STORAGE_MESSAGES, JSON.stringify(messages.slice(-100))); } catch {} }
function renderMessage(msg, scroll=true){
  const row = document.createElement("div");
  row.className = `row ${msg.role}`;
  const avatar = document.createElement("div"); avatar.className = "mini-avatar"; avatar.textContent = msg.role === "user" ? "â¡" : "å";
  const wrap = document.createElement("div"); wrap.className = "bubble-wrap";
  const name = document.createElement("div"); name.className = "name"; name.textContent = msg.role === "user" ? "ä½ " : "æååå¤®";
  const bubble = document.createElement("div"); bubble.className = "bubble"; bubble.textContent = msg.content;
  const stamp = document.createElement("div"); stamp.className = "time"; stamp.textContent = msg.time || "";
  wrap.append(name,bubble,stamp); row.append(avatar,wrap); messagesEl.append(row);
  if(scroll) row.scrollIntoView({behavior:"smooth",block:"end"});
  return row;
}
function renderAll(){
  messagesEl.replaceChildren();
  if(!messages.length){
    const welcome = document.createElement("div"); welcome.className="welcome";
    welcome.innerHTML='<div class="ornament">â§ãâ¡ãâ§</div><h2>æ¬¢è¿åæ¥</h2><p>æååå¤®æ­£å¨ç­ä½ ã</p>';
    messagesEl.append(welcome); return;
  }
  messages.forEach(m=>renderMessage(m,false));
}
function addMessage(role,content){
  const msg={role,content,time:timeNow()};
  messages.push(msg); renderMessage(msg); saveMessages(); return msg;
}
function typingRow(){
  const row=document.createElement("div"); row.className="row assistant";
  row.innerHTML='<div class="mini-avatar">å</div><div class="bubble-wrap"><div class="name">æååå¤®</div><div class="bubble"><span class="typing"><i></i><i></i><i></i></span></div></div>';
  messagesEl.append(row); row.scrollIntoView({behavior:"smooth",block:"end"}); return row;
}
function setReady(ready){input.disabled=!ready;sendBtn.disabled=!ready||busy;statusText.textContent=ready?"å¨è¿éï¼å¬ä½ è¯´è¯":"è¯·åè§£éèå¤©å®¤";}
async function checkStatus(){
  try{
    const r=await fetch("/api/status"); const s=await r.json();
    if(s.authenticated){loginCard.classList.add("hidden");setReady(true);renderAll();}
    else{loginCard.classList.remove("hidden");setReady(false);}
    if(!s.configured) statusText.textContent="ç­å¾å®ææå¡å¨éç½®";
  }catch{loginCard.classList.remove("hidden");loginError.textContent="æ æ³è¿æ¥æå¡å¨ï¼è¯·ç¨åéè¯ã";}
}
loginForm.addEventListener("submit",async e=>{
  e.preventDefault();loginError.textContent="";
  try{
    const r=await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:$("passwordInput").value})});
    const data=await r.json();if(!r.ok)throw new Error(data.error||"ç»å½å¤±è´¥");
    $("passwordInput").value="";await checkStatus();
  }catch(err){loginError.textContent=err.message;}
});
chatForm.addEventListener("submit",async e=>{
  e.preventDefault();const text=input.value.trim();if(!text||busy)return;
  addMessage("user",text);input.value="";input.style.height="auto";busy=true;sendBtn.disabled=true;
  const typing=typingRow();
  try{
    const history=messages.slice(-30).map(({role,content})=>({role,content}));
    const r=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:history,memory:localStorage.getItem(STORAGE_MEMORY)||""})});
    const data=await r.json();if(!r.ok)throw new Error(data.error||"åå¤å¤±è´¥");
    typing.remove();addMessage("assistant",data.reply||"ï¼åå¤®è½»è½»ç¨äºç¨ç¼ãï¼");
  }catch(err){typing.remove();addMessage("assistant",`ï¼åå¤®ç¥æ¾æ­æå°ççä½ ãï¼\n${err.message}`);}
  finally{busy=false;sendBtn.disabled=input.disabled;}
});
input.addEventListener("input",()=>{input.style.height="auto";input.style.height=Math.min(input.scrollHeight,130)+"px";});
input.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();chatForm.requestSubmit();}});
$("newChat").addEventListener("click",()=>{
  if(confirm("å¼å¯æ°èå¤©ï¼å½åçæ¬åªä¿å­å½åè¿æ®µèå¤©ï¼å¼å¯åå½åè®°å½ä¼è¢«æ¿æ¢ãå»ºè®®åå¤å¶æ³ä¿ççåå®¹ã")){
    messages=[];saveMessages();renderAll();
    addMessage("assistant","å§å§ï¼æ¬¢è¿åæ¥ãæä»¬ä»å¤©ä»åªéèèµ·å¢ï¼");
  }
});
$("settingsBtn").addEventListener("click",()=>{memoryInput.value=localStorage.getItem(STORAGE_MEMORY)||"";memoryPanel.classList.remove("hidden");});
$("closeMemory").addEventListener("click",()=>memoryPanel.classList.add("hidden"));
$("saveMemory").addEventListener("click",()=>{localStorage.setItem(STORAGE_MEMORY,memoryInput.value.trim());memoryPanel.classList.add("hidden");});
$("clearMemory").addEventListener("click",()=>{memoryInput.value="";localStorage.removeItem(STORAGE_MEMORY);});
try{messages=JSON.parse(localStorage.getItem(STORAGE_MESSAGES)||"[]");if(!Array.isArray(messages))messages=[];}catch{messages=[];}
checkStatus();
