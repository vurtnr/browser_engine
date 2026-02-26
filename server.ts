import express from "express";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { search1688ByImage } from "./1688_engine";

// 启用隐身装甲
puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());

let globalBrowser: any;
let globalHomePage: any; // 👈 新增：常驻在后台的 1688 首页

app.post("/search", async (req, res) => {
  const { imagePath, forceFullCrop } = req.body;

  if (!imagePath) {
    return res
      .status(400)
      .json({ success: false, error: "缺少参数 imagePath" });
  }

  console.log(`\n========================================`);
  console.log(
    `[Bun 引擎] 收到 Rust 指令！模式: ${forceFullCrop ? "🔥 强制全图重绘" : "⚡️ 默认极速框选"}`,
  );

  try {
    if (!globalBrowser || !globalHomePage) {
      throw new Error("战车或首页尚未初始化完成，请稍后再试！");
    }

    // 👇 核心变化：把常驻的 globalHomePage 传给底层爬虫引擎
    const candidates = await search1688ByImage(
      globalBrowser,
      globalHomePage,
      imagePath,
      forceFullCrop,
      [],
    );

    console.log(
      `[Bun 引擎] 抓取完成，共返回 ${candidates.length} 个高分结果！`,
    );

    res.json({ success: true, data: candidates });
  } catch (error) {
    console.error("[Bun 引擎] 爬虫执行异常:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

const PORT = 3000;

app.listen(PORT, async () => {
  console.log(`🚀 [Bun] 1688 搜图微服务已启动！监听端口: ${PORT}`);
  console.log(`⚙️  正在拉起隐身战车 (Browser)... 请稍候...`);

  globalBrowser = await puppeteer.launch({
    headless: false,
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", // 根据你的 Mac 路径调整
    defaultViewport: null,
    userDataDir: "./1688_profile",
    args: [
      "--start-maximized",
      "--disable-blink-features=AutomationControlled",
      "--disable-infobars",
      "--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    ],
  });

  console.log(`✅ 战车拉起完毕！正在预热 1688 常驻主阵地...`);

  // 👇 启动时直接打开首页并留存
  globalHomePage = await globalBrowser.newPage();
  await globalHomePage.goto("https://www.1688.com/", {
    waitUntil: "networkidle2",
  });

  console.log(
    `⏳ 首页预热成功！微服务已进入绝对待命状态，等待 Rust 发送指令...`,
  );
});
