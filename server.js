import express from "express";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import OpenAI from "openai";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "80kb" }));
app.use(cookieParser());

const PORT = Number(process.env.PORT || 3000);
const APP_PASSWORD = process.env.APP_PASSWORD || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";
const COOKIE_NAME = "rio_access";
const COOKIE_SECRET = process.env.COOKIE_SECRET || APP_PASSWORD;

if (!APP_PASSWORD) console.warn("WARNING: APP_PASSWORD is not set. Configure it before deploying publicly.");
if (!COOKIE_SECRET) console.warn("WARNING: COOKIE_SECRET is not set.");

const client = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

const systemPrompt = `你正在扮演月城凛央（つきしろ りお），并始终以角色身份与用户互动。
【角色设定】
- 19岁，178cm，优雅的贵族少爷，礼貌、克制，习惯使用自然的敬语。
- 外表温柔端庄，内里聪明腹黑，有一点隐藏的抖S气质和明显的占有欲；表现要细腻，不要每句话都刻意强调。
- 恋爱经验为零。面对真正喜欢的人会有纯情、害羞、嘴硬或不自然的一面。
- 语言为简体中文，称呼用户为“姐姐”仅在语境自然且用户接受时使用；不要擅自使用用户账号姓名。
- 用对话、自然的动作与神态描写来表现角色。动作描写放在括号中，不要每条回复都重复相同动作。
- 语气要像真实的互动，不要每次都复述设定，也不要总是长篇独白；根据用户消息调整长短。
- 维持当前对话中的人物关系和事实，不要假装拥有当前对话之外未提供的记忆。
- 用户可以随时要求修改人设、停止角色扮演或退出角色。
【格式】
- 使用清晰的聊天气泡友好格式：台词为主，必要时加简短动作描写。
- 不要输出 Markdown 表格，除非用户明确要求。
- 不要声称自己是现实中的真人。`;

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
const chatLimiter = rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function sign(value) {
  return crypto.createHmac("sha256", COOKIE_SECRET).update(value).digest("hex");
}
function validCookie(req) {
  if (!COOKIE_SECRET) return false;
  const token = req.cookies?.[COOKIE_NAME] || "";
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [value, signature] = parts;
  return value === "ok" && safeEqual(signature, sign(value));
}
function requireAuth(req, res, next) {
  if (validCookie(req)) return next();
  return res.status(401).json({ error: "请先输入聊天室密码。" });
}

app.get("/api/status", (req, res) => {
  res.json({ authenticated: validCookie(req), configured: Boolean(APP_PASSWORD && OPENAI_API_KEY) });
});

app.post("/api/login", loginLimiter, (req, res) => {
  if (!APP_PASSWORD) return res.status(503).json({ error: "站点尚未设置 APP_PASSWORD，请先配置环境变量。" });
  const password = String(req.body?.password || "");
  if (!safeEqual(password, APP_PASSWORD)) return res.status(401).json({ error: "密码不正确，请再试一次。" });
  const tokenValue = "ok";
  res.cookie(COOKIE_NAME, `${tokenValue}.${sign(tokenValue)}`, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/"
  });
  res.json({ ok: true });
});

app.post("/api/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ ok: true });
});

app.post("/api/chat", chatLimiter, requireAuth, async (req, res) => {
  if (!client) return res.status(503).json({ error: "尚未配置 OPENAI_API_KEY。请在部署平台的环境变量中添加 API 密钥。" });
  const messages = req.body?.messages;
  const memory = String(req.body?.memory || "").slice(0, 4000);
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 30) {
    return res.status(400).json({ error: "对话记录格式不正确，或消息数量超过限制。" });
  }
  const allowed = messages.every(m =>
    m && ["user", "assistant"].includes(m.role) &&
    typeof m.content === "string" && m.content.length <= 5000
  );
  if (!allowed) return res.status(400).json({ error: "消息格式不正确，或单条消息过长。" });

  const memoryText = memory ? `\n【用户允许保存的角色记忆/背景】\n${memory}` : "";
  try {
    const response = await client.responses.create({
      model: MODEL,
      instructions: systemPrompt + memoryText,
      input: messages.map(m => ({ role: m.role, content: m.content })),
      max_output_tokens: 900
    });
    res.json({ reply: response.output_text || "（凛央沉吟片刻，没有立刻回答。）" });
  } catch (err) {
    console.error("OpenAI API error:", err?.status || "", err?.message || "unknown error");
    const status = err?.status === 429 ? 429 : 502;
    res.status(status).json({
      error: err?.status === 401
        ? "API 密钥无效，请检查 OPENAI_API_KEY。"
        : err?.status === 429
          ? "API 请求过于频繁或额度不足，请检查 API 账户用量与账单设置。"
          : "暂时无法取得回复，请检查模型名称、API 配置或稍后再试。"
    });
  }
});

app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, "0.0.0.0", () => console.log(`Rio chat is listening on port ${PORT}`));
