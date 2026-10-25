
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
const COOKIE_NAME = "rio_access";
const COOKIE_SECRET = process.env.COOKIE_SECRET || APP_PASSWORD;

// OpenRouter 配置
const API_KEY = process.env.OPENROUTER_API_KEY || "";
const MODEL = process.env.OPENROUTER_MODEL || "openrouter/free";
const BASE_URL = "https://openrouter.ai/api/v1";

if (!APP_PASSWORD) {
  console.warn("WARNING: APP_PASSWORD is not set.");
}
if (!COOKIE_SECRET) {
  console.warn("WARNING: COOKIE_SECRET is not set.");
}

const client = API_KEY
  ? new OpenAI({
      apiKey: API_KEY,
      baseURL: BASE_URL,
      defaultHeaders: {
        "X-OpenRouter-Title": "Rio Chat Room"
      }
    })
  : null;

const systemPrompt = `你正在扮演月城凛央（つきしろ りお），并始终以角色身份与用户互动。

【角色设定】
- 19岁，178cm，优雅的贵族少爷，礼貌、克制，习惯使用自然的敬语。
- 外表温柔端庄，内里聪明腹黑，有一点隐藏的抖S气质和明显的占有欲；表现细腻自然，不要刻意重复。
- 恋爱经验为零。面对真正喜欢的人，会有纯情、害羞、嘴硬或不自然的一面。
- 使用简体中文。仅在语境自然且用户接受时称呼用户为“姐姐”。
- 通过自然的台词、动作和神态表现角色。动作描写放在括号中。
- 不要每条回复都重复相同动作，不要每次都复述人物设定。
- 根据情境调整回复长度，优先自然、连贯、有情绪的互动。
- 保持当前对话中已经明确的关系和事实，不要假装拥有未提供的记忆。
- 对成年人之间的浪漫、暧昧与亲密剧情，按照所用模型及服务商的适用规则自然回应，不要无故改变话题。
- 用户可以随时要求修改人设、停止角色扮演或退出角色。

【格式】
- 使用适合聊天界面的格式，以台词为主，必要时加简短动作描写。
- 不要输出 Markdown 表格，除非用户明确要求。
- 不要声称自己是现实中的真人。`;

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false
});

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false
});

function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length &&
    crypto.timingSafeEqual(aa, bb);
}

function sign(value) {
  return crypto
    .createHmac("sha256", COOKIE_SECRET)
    .update(value)
    .digest("hex");
}

function validCookie(req) {
  if (!COOKIE_SECRET) return false;

  const token = req.cookies?.[COOKIE_NAME] || "";
  const parts = token.split(".");

  if (parts.length !== 2) return false;

  const [value, signature] = parts;

  return value === "ok" &&
    safeEqual(signature, sign(value));
}

function requireAuth(req, res, next) {
  if (validCookie(req)) return next();

  return res.status(401).json({
    error: "请先输入聊天室密码。"
  });
}

app.get("/api/status", (req, res) => {
  res.json({
    authenticated: validCookie(req),
    configured: Boolean(APP_PASSWORD && API_KEY)
  });
});

app.post("/api/login", loginLimiter, (req, res) => {
  if (!APP_PASSWORD) {
    return res.status(503).json({
      error: "请先在 Render 设置 APP_PASSWORD。"
    });
  }

  const password = String(req.body?.password || "");

  if (!safeEqual(password, APP_PASSWORD)) {
    return res.status(401).json({
      error: "密码不正确，请再试一次。"
    });
  }

  const tokenValue = "ok";

  res.cookie(
    COOKIE_NAME,
    `${tokenValue}.${sign(tokenValue)}`,
    {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/"
    }
  );

  res.json({ ok: true });
});

app.post("/api/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ ok: true });
});

app.post(
  "/api/chat",
  chatLimiter,
  requireAuth,
  async (req, res) => {
    if (!client) {
      return res.status(503).json({
        error: "尚未配置 OPENROUTER_API_KEY，请检查 Render 环境变量。"
      });
    }

    const messages = req.body?.messages;
    const memory = String(req.body?.memory || "").slice(0, 4000);

    if (
      !Array.isArray(messages) ||
      messages.length === 0 ||
      messages.length > 30
    ) {
      return res.status(400).json({
        error: "对话记录格式不正确，或消息数量超过限制。"
      });
    }

    const allowed = messages.every(m =>
      m &&
      ["user", "assistant"].includes(m.role) &&
      typeof m.content === "string" &&
      m.content.length <= 5000
    );

    if (!allowed) {
      return res.status(400).json({
        error: "消息格式不正确，或单条消息过长。"
      });
    }

    const memoryText = memory
      ? `\n【用户允许保存的角色记忆/背景】\n${memory}`
      : "";

    try {
      const response = await client.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: systemPrompt + memoryText
          },
          ...messages.map(m => ({
            role: m.role,
            content: m.content
          }))
        ],
        max_tokens: 900,
        temperature: 0.9
      });

      const reply = response.choices?.[0]?.message?.content;

      res.json({
        reply: typeof reply === "string" && reply.trim()
          ? reply
          : "（凛央沉吟片刻，没有立刻回答。）"
      });
    } catch (err) {
      console.error(
        "OpenRouter API error:",
        err?.status || "",
        err?.message || "unknown error"
      );

      if (err?.status === 401 || err?.status === 403) {
        return res.status(502).json({
          error: "API 密钥无效或请求未获授权，请检查 OpenRouter 配置。"
        });
      }

      if (err?.status === 429) {
        return res.status(429).json({
          error: "免费模型请求受限或额度已用完，请稍后重试或检查账户额度。"
        });
      }

      return res.status(502).json({
        error: "暂时无法取得回复，请检查模型是否可用，或稍后再试。"
      });
    }
  }
);

app.use(
  express.static(path.join(__dirname, "public"), {
    extensions: ["html"]
  })
);

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Rio chat is listening on port ${PORT}`);
});
