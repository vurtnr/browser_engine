import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import path from "path";

// 启用隐身装甲，抹平指纹
puppeteer.use(StealthPlugin());

// ==========================================
// ⚙️ 核心战术配置区 (🌟 全新动态传参架构)
// ==========================================
// 提取命令行参数: bun run stealth_test.ts [图片路径] [关键字1] [关键字2]...
const args = process.argv.slice(2);

// 1. 动态图片路径 (如果不传，默认使用当前目录的 product.png)
let defaultImg = "./product.png";
const TARGET_IMAGE_PATH =
  args.length > 0 ? path.resolve(args[0]) : path.resolve(defaultImg);

// 2. 动态目标特征词 (将第二个及以后的参数作为关键字，如果不传则为空数组，即不进行文本过滤)
const TARGET_KEYWORDS = args.length > 1 ? args.slice(1) : [];

const CAMERA_ICON_SELECTOR = ".image-file-reader-wrapper";
const CHROME_EXEC_PATH =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
// ==========================================

console.log("🚀 [系统启动] 正在加载 1688 终极搜图战车...");
console.log(`📂 当前目标图片: ${TARGET_IMAGE_PATH}`);
console.log(
  `🔑 当前 NLP 过滤词: ${TARGET_KEYWORDS.length > 0 ? TARGET_KEYWORDS.join(" | ") : "未设置 (将返回所有视觉初筛商品)"}`,
);

const browser = await puppeteer.launch({
  headless: false,
  executablePath: CHROME_EXEC_PATH,
  defaultViewport: null,
  userDataDir: "./1688_profile",
  args: [
    "--start-maximized",
    "--disable-blink-features=AutomationControlled",
    "--disable-infobars",
    "--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  ],
});

const page = await browser.newPage();

try {
  // ---------------------------------------------------------
  // 阶段一：潜入主阵地与真实物理上传
  // ---------------------------------------------------------
  console.log("🎯 [阶段一] 正在前往 1688 首页...");
  await page.goto("https://www.1688.com/", {
    waitUntil: "networkidle2",
    timeout: 60000,
  });
  console.log("✅ 页面基础加载完成！");

  const currentUrl = page.url();
  const hasSlider =
    (await page.$(
      '.nc-container, #baxia-dialog-content, #nc_1_n1z, iframe[src*="punish"]',
    )) !== null;
  const isLogin = currentUrl.includes("login") || currentUrl.includes("pass");
  const isPunish = currentUrl.includes("sec.") || currentUrl.includes("punish");

  if (isLogin || isPunish || hasSlider) {
    console.log(
      "\n🚨 [风控警报] 遭遇底层防御网：触发【登录拦截】或【滑块验证】！",
    );
    console.log(
      "⏳ 战车已挂起，请立即前往浏览器窗口完成【扫码登录】或【拖动滑块】！",
    );

    await page.waitForFunction(
      (selector) => {
        const url = window.location.href;
        const isUrlSafe =
          !url.includes("login") &&
          !url.includes("pass") &&
          !url.includes("sec.") &&
          !url.includes("punish");
        const isSliderGone =
          !document.querySelector(".nc-container") &&
          !document.querySelector("#baxia-dialog-content");
        const isIconReady = document.querySelector(selector) !== null;
        return isUrlSafe && isSliderGone && isIconReady;
      },
      { timeout: 0, polling: 1000 },
      CAMERA_ICON_SELECTOR,
    );
    console.log("✅ 验证通过！风控解除，战车恢复推进...\n");
    await new Promise((r) => setTimeout(r, 3000));
  }

  console.log(`⏳ 等待上传组件渲染...`);
  const cameraHandle = await page.waitForSelector(CAMERA_ICON_SELECTOR, {
    visible: true,
    timeout: 30000,
  });

  console.log("⏳ 战车悬停 2 秒：等待 1688 干扰元素消散...");
  await new Promise((r) => setTimeout(r, 2000));

  console.log(`📤 发起真实的物理点击，唤醒文件选择器...`);

  const newTargetPromise = browser
    .waitForTarget(
      (target) =>
        target.type() === "page" &&
        target.url().includes("1688.com") &&
        target.url() !== page.url(),
      { timeout: 30000 },
    )
    .catch(() => null);

  const [fileChooser] = await Promise.all([
    page.waitForFileChooser({ timeout: 15000 }),
    cameraHandle.click().catch(async () => {
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (el) el.click();
      }, CAMERA_ICON_SELECTOR);
    }),
  ]);

  console.log(`📥 正在注入本地图片: ${TARGET_IMAGE_PATH}`);
  await fileChooser.accept([TARGET_IMAGE_PATH]);
  console.log("✅ 图片已被送入系统通道！等待 1688 处理与回传...");

  // ---------------------------------------------------------
  // 阶段二：处理二次确认弹窗与接管跳转
  // ---------------------------------------------------------
  console.log("⏳ [阶段二] 正在侦测二次确认弹窗...");

  const searchBtnClicked = await page.evaluate(async () => {
    return new Promise((resolve) => {
      let attempts = 0;
      const timer = setInterval(() => {
        attempts++;
        const btn = Array.from(
          document.querySelectorAll("button, div, span"),
        ).find((el) => el.innerText && el.innerText.trim() === "搜索图片");
        if (btn) {
          clearInterval(timer);
          btn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
          btn.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
          btn.click();
          resolve(true);
        }
        if (attempts >= 15) {
          clearInterval(timer);
          resolve(false);
        }
      }, 1000);
    });
  });

  if (searchBtnClicked)
    console.log("👆 成功点击【搜索图片】确认按钮！正在等待页面跳转...");
  else console.log("👌 未发现确认按钮，可能页面已自动跳转...");

  let resultPage = null;
  const newTarget = await newTargetPromise;

  if (newTarget) {
    console.log("🚀 检测到 1688 弹出了新的搜索结果标签页！");
    resultPage = await newTarget.page();
  } else {
    const allPages = await browser.pages();
    if (allPages.length > 1) {
      resultPage = allPages[allPages.length - 1];
    } else if (page.url().includes("image") || page.url().includes("youyuan")) {
      resultPage = page;
    }
  }

  if (!resultPage) throw new Error("未能成功进入搜索结果页，流程受阻！");

  await resultPage.bringToFront();
  console.log(`🎉 成功接管结果页！当前 URL: ${resultPage.url()}`);

  // ---------------------------------------------------------
  // 阶段三：修复 Canvas 弹窗拦截，强行全图修正
  // ---------------------------------------------------------
  console.log("👀 [阶段三] 正在检查是否触发了 AI 自动局部裁剪...");

  await resultPage.waitForNetworkIdle({ timeout: 15000 }).catch(() => {});

  const cropMath = await resultPage.evaluate(() => {
    const innerMask = document.querySelector('div[class*="imgMask"]');
    const cutBtn =
      document.querySelector(".cut-btn") ||
      document.querySelector('div[class*="cutBtn"]');
    if (!innerMask || !cutBtn) return null;

    const parentMask = innerMask.parentElement;
    if (!parentMask) return null;

    const parentW =
      parseFloat(parentMask.style.width) ||
      parentMask.getBoundingClientRect().width;
    const parentH =
      parseFloat(parentMask.style.height) ||
      parentMask.getBoundingClientRect().height;

    const top = parseFloat(innerMask.style.top) || 0;
    const left = parseFloat(innerMask.style.left) || 0;
    const w = parseFloat(innerMask.style.width) || 0;
    const h = parseFloat(innerMask.style.height) || 0;

    return {
      startX: left / parentW,
      startY: top / parentH,
      endX: (left + w) / parentW,
      endY: (top + h) / parentH,
    };
  });

  if (cropMath) {
    console.log("⚠️ 抓获 AI 裁剪！提取到底层比例坐标:", cropMath);

    // 👇 核心修复 1：注入真实事件流，强行剥开 React 对弹窗的拦截
    await resultPage.evaluate(() => {
      const cutBtn =
        document.querySelector(".cut-btn") ||
        document.querySelector('div[class*="cutBtn"]');
      if (cutBtn) {
        cutBtn.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        cutBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        cutBtn.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        cutBtn.click();
      }
    });

    console.log("⏳ 正在等待 Canvas 重绘弹窗加载...");
    const canvasHandle = await resultPage
      .waitForSelector('div[role="dialog"] canvas', {
        visible: true,
        timeout: 5000,
      })
      .catch(async () => {
        return await resultPage.waitForSelector("canvas", {
          visible: true,
          timeout: 10000,
        });
      });

    await new Promise((r) => setTimeout(r, 1500));

    const canvasBox = await canvasHandle?.boundingBox();

    if (canvasBox && canvasBox.width > 50) {
      const handleStartX = canvasBox.x + canvasBox.width * cropMath.startX + 5;
      const handleStartY = canvasBox.y + canvasBox.height * cropMath.startY + 5;
      const handleEndX = canvasBox.x + canvasBox.width * cropMath.endX - 5;
      const handleEndY = canvasBox.y + canvasBox.height * cropMath.endY - 5;

      const safeTargetLeft = canvasBox.x + 5;
      const safeTargetTop = canvasBox.y + 5;
      const safeTargetRight = canvasBox.x + canvasBox.width - 5;
      const safeTargetBottom = canvasBox.y + canvasBox.height - 5;

      console.log("📐 机械臂启动：捏住左上角拉伸...");
      await resultPage.mouse.move(handleStartX, handleStartY);
      await resultPage.mouse.down();
      await resultPage.mouse.move(safeTargetLeft, safeTargetTop, { steps: 20 });
      await new Promise((r) => setTimeout(r, 200));
      await resultPage.mouse.up();

      await new Promise((r) => setTimeout(r, 500));

      console.log("📐 机械臂启动：捏住右下角拉伸...");
      await resultPage.mouse.move(handleEndX, handleEndY);
      await resultPage.mouse.down();
      await resultPage.mouse.move(safeTargetRight, safeTargetBottom, {
        steps: 20,
      });
      await new Promise((r) => setTimeout(r, 200));
      await resultPage.mouse.up();

      console.log("✅ 选区强行撑满全图！");

      await resultPage.evaluate(() => {
        const confirmBtn = Array.from(
          document.querySelectorAll("button, div, span"),
        ).find((el) => el.innerText && el.innerText.trim() === "确认");
        if (confirmBtn) confirmBtn.click();
      });

      console.log("⏳ 重新提交全图搜索...");
      await resultPage.waitForNetworkIdle({ timeout: 15000 }).catch(() => {});
      console.log("🎉 修正彻底完成！呈现最纯净的全图结果！");
    } else {
      console.log("⚠️ 弹窗开启失败，Canvas 可能被隐藏。继续提取现有数据。");
    }
  } else {
    console.log("👌 未检测到 AI 局部裁剪，当前已是全图搜索状态。");
  }

  // ---------------------------------------------------------
  // 阶段四：数据大丰收 (第一级视觉过滤 + 第二级NLP过滤)
  // ---------------------------------------------------------
  console.log("\n=============================================");
  console.log("🛒 战车已稳稳停靠在商品列表页！准备执行高精度双重清洗...");
  console.log("=============================================\n");

  await resultPage
    .waitForSelector('div[class*="searchOfferWrapper"]', { timeout: 15000 })
    .catch(() => {});

  // 注意：将外部的关键字配置传递进 evaluate 内部
  const extractResult = await resultPage.evaluate((targetKeywords) => {
    const cards = Array.from(
      document.querySelectorAll('div[class*="searchOfferWrapper"]'),
    );

    const parsedItems = cards.map((card) => {
      const titleEl = card.querySelector('div[class*="titleText"]');
      const title = titleEl ? titleEl.innerText.trim() : "";

      const priceEl = card.querySelector('div[class*="textMain"]');
      const price = priceEl ? priceEl.innerText.trim() : "";

      const shopEl = card.querySelector('div[class*="shopName"]');
      const shopName = shopEl ? shopEl.innerText.trim() : "";

      const imgEl = card.querySelector('img[class*="mainImg"]');
      const imageUrl = imgEl ? imgEl.src || imgEl.getAttribute("data-src") : "";

      let sales = "";
      let moq = "";
      const afterDescEls = card.querySelectorAll(
        'div[class*="colDescAfter"] div[class*="descText"]',
      );
      if (afterDescEls.length >= 2) {
        sales = afterDescEls[0].innerText.trim();
        moq = afterDescEls[1].innerText.trim();
      } else if (afterDescEls.length === 1) {
        const text = afterDescEls[0].innerText.trim();
        if (text.includes("起批")) moq = text;
        else sales = text;
      }

      const reportData =
        card.getAttribute("data-aplus-report") ||
        card.getAttribute("data-tracker") ||
        "";
      const isAd =
        reportData.includes("offerType:e_p4p") ||
        reportData.includes("offerType:p4p");

      let cosScore = 0;
      const scoreMatch = reportData.match(/cosScore.*?([\d\.]+)/i);
      if (scoreMatch && scoreMatch[1]) cosScore = parseFloat(scoreMatch[1]);

      let itemUrl = "";
      const wwEl = card.querySelector(".J_WangWang");
      if (wwEl) {
        try {
          const extra = JSON.parse(wwEl.getAttribute("data-extra") || "{}");
          if (extra.offerId)
            itemUrl = `https://detail.1688.com/offer/${extra.offerId}.html`;
        } catch (e) {}
      }
      if (!itemUrl) {
        const match = reportData.match(/object_id@(\d+)/);
        if (match && match[1])
          itemUrl = `https://detail.1688.com/offer/${match[1]}.html`;
      }

      return {
        title,
        price: price ? `¥${price}` : "暂无",
        sales,
        moq,
        shopName,
        itemUrl,
        imageUrl,
        isAd,
        cosScore,
      };
    });

    const isScoreValid =
      parsedItems.filter((item) => item.cosScore > 0).length > 0;

    const filteredItems = parsedItems.filter((item) => {
      if (!item.title || !item.itemUrl) return false;

      // 坚决干掉直通车广告
      if (item.isAd) return false;

      // 👇 【核心修改】：相似度门槛暴降至 0.30！宁可错杀一千，绝不放过一个被误伤的真同款！
      if (isScoreValid && item.cosScore < 0.3) return false;

      // 👇 动态文本过滤：只有你在命令行传了关键字，才会执行过滤
      if (targetKeywords && targetKeywords.length > 0) {
        const isMatchKeyword = targetKeywords.some((kw) =>
          item.title.includes(kw),
        );
        if (!isMatchKeyword) return false;
      }

      return true;
    });

    return { totalParsed: parsedItems.length, filteredItems: filteredItems };
  }, TARGET_KEYWORDS); // 传入顶部的关键字数组

  console.log(
    `🎉 网页解析完成！页面共找到 ${extractResult.totalParsed} 个有效商品卡片。`,
  );
  console.log(`🛡️ AI 相似度过滤门槛已降至 0.30 (保留极大概率召回)。`);
  console.log(
    `🧹 过滤完毕！为您保留了 ${extractResult.filteredItems.length} 个候选商品数据：\n`,
  );

  console.log(JSON.stringify(extractResult.filteredItems, null, 2));

  console.log("\n⏳ 脚本挂起 60 秒供你观赏战果...");
  await new Promise((r) => setTimeout(r, 60000));
} catch (error) {
  console.log("\n❌ 发生致命错误！尝试保存现场截图...");
  try {
    if (!page.isClosed()) await page.screenshot({ path: "error_snap.png" });
  } catch (screenshotError) {}
  console.error("❌ 详细异常堆栈:\n", error);
} finally {
  console.log("🛑 任务生命周期结束。");
  // await browser.close();
}
