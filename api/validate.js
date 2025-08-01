// api/validate.js

const express = require("express");
const dns = require("dns");
const util = require("util");
const verifier = require("email-verify");
const cors = require("cors");

const resolveMx = util.promisify(dns.resolveMx);

const app = express();


// ⬇️【重要】更新你的 CORS 设置以适应生产环境
const allowedOrigins = [
  'https://localhost:3000', // 本地开发环境
  'https://your-frontend-app.vercel.app' // 你的线上前端域名！
];

const corsOptions = {
  origin: function (origin, callback) {
    // 允许没有 origin 的请求 (比如来自 Postman 等工具的服务器端请求)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: "GET,POST,OPTIONS",
  allowedHeaders: "Content-Type,X-API-KEY",
  credentials: true,
};

app.use(cors(corsOptions)); // 使用新的CORS配置

app.use(express.json());

const apiKeyAuth = (req, res, next) => {
  // ... (这部分代码不变)
  const apiKey = req.header("X-API-KEY");
  if (apiKey && apiKey === "hj122400") {
    next();
  } else {
    res.status(401).json({ error: "Unauthorized: Missing or invalid API key" });
  }
};

async function validateEmail(email) {
  // ... (这个函数完全不变)
  // 1. 格式验证
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email)) {
    return { valid: false, reason: "Invalid format" };
  }

  // 2. MX 记录检查
  const domain = email.split("@")[1];
  try {
    const addresses = await resolveMx(domain);
    if (!addresses || addresses.length === 0) {
      return { valid: false, reason: "No MX records found for domain" };
    }
  } catch (err) {
    return { valid: false, reason: "Domain lookup failed or does not exist" };
  }


  // 3. SMTP 存在性检查
  return new Promise((resolve) => {
    verifier.verify(email, {
      sender: "check@yourdomain.com", // 建议换成你真实可用的域名邮箱
      timeout: 5000 // 增加超时时间以获得更可靠的结果
    }, function (err, info) {
      if (err) {
        console.log(`[SMTP ERROR] ${email}:`, err.message);
        // SMTP 错误不应直接判定为无效，可能只是临时问题。
        // 为了更好的用户体验，我们可以选择在这种情况下让它通过。
        // 或者返回一个特定状态，让前端知道是“无法验证”。
        // 这里我们暂时将其视为有效，因为我们已经验证了MX记录。
        return resolve({ valid: true, reason: "SMTP check inconclusive, but MX is valid" });
      }
      if (info.success) {
        console.log(`[SUCCESS] SMTP check passed for ${email}`);
        resolve({ valid: true, reason: "SMTP check passed: mailbox exists" });
      } else {
        console.log(`[FAIL] SMTP check failed for ${email}:`, info.info);
        resolve({ valid: false, reason: "Mailbox does not exist (SMTP response)" });
      }
    });
  });
}

// 你的路由定义完全不变
app.post("/validate", apiKeyAuth, async (req, res) => {
  // ... (这部分代码不变)
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  console.log(`Received validation request for: ${email}`);
  const result = await validateEmail(email);

  return res.json({
    email: email,
    is_valid: result.valid,
    reason: result.reason,
  });
});

app.use((req, res) => {
  // ... (这部分代码不变)
  res.status(404).json({
    status: "error",
    message: "Route not found. Use the /validate endpoint with a POST request.",
  });
});

// ❌ 删掉下面这整段 app.listen 代码
/*
app.listen(PORT, () => {
  console.log(`✅ Email validation backend server is running on http://localhost:${PORT}`);
  console.log("🔒 API Key for testing: hj122400");
});
*/

// ✅ 在文件末尾加上这一行，导出 app
module.exports = app;