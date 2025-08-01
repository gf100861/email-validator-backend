// api/validate.js

const express = require("express");
const dns = require("dns");
const util = require("util");
const verifier = require("email-verify");
const cors = require("cors");

const resolveMx = util.promisify(dns.resolveMx);

const app = express();

// 🪵 LOG: 在所有中间件之前，先打印请求入口
app.use((req, res, next) => {
  console.log(`\n🪵 [Request Start] ${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// ⬇️【重要】更新你的 CORS 设置以适应生产环境
const allowedOrigins = [
  'https://localhost:3000', // 本地开发环境
  'https://outlook-addin-gilt.vercel.app' // 你的线上前端域名！【专业建议：URL末尾不要加'/'，因为浏览器发送的origin通常不带斜杠】
];

const corsOptions = {
  origin: function (origin, callback) {
    // 🪵 LOG: 打印出请求的来源，用于CORS调试
    console.log(`🪵 [CORS Check] Request origin: ${origin}`);
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.error(`❌ [CORS Blocked] Origin "${origin}" is not in allowed list.`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: "GET,POST,OPTIONS",
  allowedHeaders: "Content-Type,X-API-KEY",
  credentials: true,
};

app.use(cors(corsOptions));

app.use(express.json());

const apiKeyAuth = (req, res, next) => {
  const apiKey = req.header("X-API-KEY");
  // 🪵 LOG: 打印出收到的API Key，用于权限调试
  console.log(`🪵 [API Key Check] Received API Key: ${apiKey}`);
  if (apiKey && apiKey === "hj122400") {
    console.log("✅ [API Key Check] Key is valid.");
    next();
  } else {
    console.error("❌ [API Key Check] Unauthorized: Missing or invalid API key.");
    res.status(401).json({ error: "Unauthorized: Missing or invalid API key" });
  }
};

async function validateEmail(email) {
  console.log(`\n--- 🔍 [Core Validation Logic] Starting validation for: ${email} ---`);

  // 1. 格式验证
  console.log("  ➡️ Step 1: Checking email format...");
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email)) {
    console.log("  ❌ Step 1 FAILED: Invalid format.");
    return { valid: false, reason: "Invalid format" };
  }
  console.log("  ✅ Step 1 PASSED: Format is valid.");

  // 2. MX 记录检查
  console.log("  ➡️ Step 2: Checking MX records...");
  const domain = email.split("@")[1];
  try {
    const addresses = await resolveMx(domain);
    if (!addresses || addresses.length === 0) {
      console.log(`  ❌ Step 2 FAILED: No MX records found for domain "${domain}".`);
      return { valid: false, reason: "No MX records found for domain" };
    }
    console.log(`  ✅ Step 2 PASSED: Found MX records:`, addresses);
  } catch (err) {
    console.error(`  ❌ Step 2 FAILED: DNS lookup error for domain "${domain}".`, err);
    return { valid: false, reason: "Domain lookup failed or does not exist" };
  }

  // 3. SMTP 存在性检查
  console.log("  ➡️ Step 3: Performing SMTP check...");
  return new Promise((resolve) => {
    verifier.verify(email, {
      sender: "check@yourdomain.com",
      timeout: 5000
    }, function (err, info) {
      if (err) {
        console.error("  ⚠️ Step 3 SMTP ERROR:", err); // 打印完整的错误对象
        return resolve({ valid: true, reason: "SMTP check inconclusive, but MX is valid" });
      }
      
      console.log("  ℹ️ Step 3 SMTP INFO:", info); // 打印完整的info对象
      if (info.success) {
        console.log(`  ✅ Step 3 PASSED: SMTP check successful for ${email}.`);
        resolve({ valid: true, reason: "SMTP check passed: mailbox exists" });
      } else {
        console.log(`  ❌ Step 3 FAILED: SMTP check failed for ${email}.`);
        resolve({ valid: false, reason: "Mailbox does not exist (SMTP response)" });
      }
    });
  });
}

app.post("/", apiKeyAuth, async (req, res) => {
  // 🪵 LOG: 确认进入了正确的路由处理器，并打印请求体
  console.log("➡️ [Route Handler] Entered /validate POST handler.");
  console.log("   Request Body:", req.body);
  
  const { email } = req.body;
  if (!email) {
    console.error("❌ [Route Handler] Bad Request: Email is missing in the body.");
    return res.status(400).json({ error: "Email is required" });
  }

  const result = await validateEmail(email);
  
  // 🪵 LOG: 打印最终要返回给前端的结果
  console.log("⬅️ [Route Handler] Sending final response:", result);
  return res.json({
    email: email,
    is_valid: result.valid,
    reason: result.reason,
  });
});

app.use((req, res) => {
  // 🪵 LOG: 捕获所有未匹配的路由
  console.error(`❌ [404 Not Found] Route not matched: ${req.method} ${req.url}`);
  res.status(404).json({
    status: "error",
    message: "Route not found. Use the /validate endpoint with a POST request.",
  });
});

module.exports = app;