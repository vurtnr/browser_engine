import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { search1688ByImage } from "./1688_engine"; // 引入刚才写的引擎模块

puppeteer.use(StealthPlugin());

// ==========================================
// 模拟你的 Ozon 业务数据队列 (这里放本地测试图)
// ==========================================
const TASK_QUEUE = [
  // 模拟任务 1: 盲搜 (不传关键词，纯靠大模型后处理)
  { sku: "3465848441", localImagePath: "./product.png", keyword: "" },

  // 模拟任务 2: 带强关键词过滤的精准搜
  // { sku: "3263257174", localImagePath: "./product2.png", keyword: "超暴邪王" }
];

const CHROME_EXEC_PATH =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// 随机数与休眠工具
const randomInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1) + min);
const randomSleep = (min: number, max: number) =>
  new Promise((resolve) => setTimeout(resolve, randomInt(min, max)));

async function main() {
  console.log("🚀 [批处理任务启动] 正在初始化浏览器集群...");

  // 整个批处理过程只开启一次 Browser，共享 Cookie
  const browser = await puppeteer.launch({
    headless: false, // 测试时保持可视化
    executablePath: CHROME_EXEC_PATH,
    defaultViewport: null,
    userDataDir: "./1688_profile",
    args: [
      "--start-maximized",
      "--disable-blink-features=AutomationControlled",
      "--disable-infobars",
    ],
  });

  // 顺序循环处理每个 Ozon SKU
  for (let i = 0; i < TASK_QUEUE.length; i++) {
    const task = TASK_QUEUE[i];
    console.log(`\n=================================================`);
    console.log(
      `🎯 正在处理第 ${i + 1}/${TASK_QUEUE.length} 个 SKU: [${task.sku}]`,
    );
    console.log(`=================================================`);

    try {
      const keywords = task.keyword ? [task.keyword] : [];

      // 调用封装好的模块化引擎
      const candidates = await search1688ByImage(
        browser,
        task.localImagePath,
        keywords,
      );

      console.log(
        `🎉 SKU [${task.sku}] 搜图完成，共抓取到 ${candidates.length} 个初筛商品！`,
      );

      if (candidates.length > 0) {
        // 在这里，你可以通过 HTTP 把 candidates 发给 Rust (brain_core) 和 Python (VLM)
        console.log(`📋 数据示例 (Top 1):`);
        console.log(JSON.stringify(candidates[0], null, 2));
      } else {
        console.log(
          `⚠️ SKU [${task.sku}] 未找到任何候选商品 (可能图片错误或被 0.3 门槛拦截)。`,
        );
      }
    } catch (e) {
      console.error(`💥 SKU [${task.sku}] 调度失败！错误:`, e);
    }

    // -----------------------------------------------------
    // 宏观风控防御：人类疲劳与间歇模拟
    // -----------------------------------------------------
    if (i < TASK_QUEUE.length - 1) {
      // 策略 1: 每次搜完必须随机休息
      const sleepTime = randomInt(8000, 16000);
      console.log(
        `🛌 战车休眠 ${(sleepTime / 1000).toFixed(1)} 秒，模拟人类整理 Excel 数据...`,
      );
      await new Promise((r) => setTimeout(r, sleepTime));

      // 策略 2: 阶段性长休息 (打断机器的线性规律，每跑 15 个休息几分钟)
      if ((i + 1) % randomInt(10, 15) === 0) {
        const longBreak = randomInt(60000, 180000); // 1~3 分钟
        console.log(
          `\n☕ [风控防线] 机器已连续高频工作，强制休息 ${(longBreak / 60000).toFixed(1)} 分钟，喝杯咖啡防封号...\n`,
        );
        await new Promise((r) => setTimeout(r, longBreak));
      }
    }
  }

  console.log("\n✅ 队列中所有 Ozon 任务已全部处理完毕！");
  await browser.close();
}

main();
