import path from "path";
import { Browser, Page } from "puppeteer";

// 定义返回的数据结构
export interface SearchResult {
  title: string;
  price: string;
  sales: string;
  moq: string;
  shopName: string;
  itemUrl: string;
  imageUrl: string;
  isAd: boolean;
  cosScore: number;
}

/**
 * 1688 终极以图搜图核心引擎 (支持浏览器复用)
 * @param browser Puppeteer 浏览器实例
 * @param imagePath 本地图片绝对/相对路径
 * @param targetKeywords (可选) NLP 关键词过滤数组，例如 ["超暴邪王"]
 */
export async function search1688ByImage(
  browser: Browser,
  imagePath: string,
  targetKeywords: string[] = [],
): Promise<SearchResult[]> {
  const CAMERA_ICON_SELECTOR = ".image-file-reader-wrapper";
  const absoluteImgPath = path.resolve(imagePath);

  const page = await browser.newPage();
  let resultPage: Page | null = null;

  try {
    // ==========================================
    // 阶段一：潜入主阵地与传图
    // ==========================================
    await page.goto("https://www.1688.com/", {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    // 风控探针：检测是否被拦截
    const currentUrl = page.url();
    const hasSlider =
      (await page.$(
        '.nc-container, #baxia-dialog-content, #nc_1_n1z, iframe[src*="punish"]',
      )) !== null;
    const isLogin = currentUrl.includes("login") || currentUrl.includes("pass");
    const isPunish =
      currentUrl.includes("sec.") || currentUrl.includes("punish");

    if (isLogin || isPunish || hasSlider) {
      console.log(
        `\n🚨 [风控警报] 当前 SKU 触发底层拦截！战车已挂起，请立即在弹出的浏览器中手动滑块或扫码！`,
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
      console.log("✅ 验证通过！风控解除，战车恢复推进...");
      await new Promise((r) => setTimeout(r, 3000));
    }

    const cameraHandle = await page.waitForSelector(CAMERA_ICON_SELECTOR, {
      visible: true,
      timeout: 30000,
    });
    await new Promise((r) => setTimeout(r, 2000)); // 必要的物理停顿，等弹窗消散

    // 预埋新标签页捕捉器
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
      cameraHandle!.click().catch(async () => {
        await page.evaluate(
          (sel) => document.querySelector(sel)?.click(),
          CAMERA_ICON_SELECTOR,
        );
      }),
    ]);

    await fileChooser.accept([absoluteImgPath]);

    // ==========================================
    // 阶段二：侦测二次确认弹窗与接管
    // ==========================================
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

    const newTarget = await newTargetPromise;
    if (newTarget) {
      resultPage = await newTarget.page();
    } else {
      const allPages = await browser.pages();
      if (allPages.length > 1) resultPage = allPages[allPages.length - 1];
      else if (page.url().includes("image") || page.url().includes("youyuan"))
        resultPage = page;
    }

    if (!resultPage) throw new Error("未能成功进入搜索结果页");
    await resultPage.bringToFront();
    await resultPage.waitForNetworkIdle({ timeout: 15000 }).catch(() => {});

    // ==========================================
    // 阶段三：Canvas 强行全图修正 (破解 React 事件拦截)
    // ==========================================
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

      const canvasHandle = await resultPage
        .waitForSelector('div[role="dialog"] canvas', {
          visible: true,
          timeout: 5000,
        })
        .catch(async () => {
          return await resultPage!.waitForSelector("canvas", {
            visible: true,
            timeout: 10000,
          });
        });
      await new Promise((r) => setTimeout(r, 1500));

      const canvasBox = await canvasHandle?.boundingBox();
      if (canvasBox && canvasBox.width > 50) {
        const handleStartX =
          canvasBox.x + canvasBox.width * cropMath.startX + 5;
        const handleStartY =
          canvasBox.y + canvasBox.height * cropMath.startY + 5;
        const handleEndX = canvasBox.x + canvasBox.width * cropMath.endX - 5;
        const handleEndY = canvasBox.y + canvasBox.height * cropMath.endY - 5;

        // 防越界 Padding
        const safeTargetLeft = canvasBox.x + 5;
        const safeTargetTop = canvasBox.y + 5;
        const safeTargetRight = canvasBox.x + canvasBox.width - 5;
        const safeTargetBottom = canvasBox.y + canvasBox.height - 5;

        await resultPage.mouse.move(handleStartX, handleStartY);
        await resultPage.mouse.down();
        await resultPage.mouse.move(safeTargetLeft, safeTargetTop, {
          steps: 20,
        });
        await new Promise((r) => setTimeout(r, 200));
        await resultPage.mouse.up();

        await new Promise((r) => setTimeout(r, 500));

        await resultPage.mouse.move(handleEndX, handleEndY);
        await resultPage.mouse.down();
        await resultPage.mouse.move(safeTargetRight, safeTargetBottom, {
          steps: 20,
        });
        await new Promise((r) => setTimeout(r, 200));
        await resultPage.mouse.up();

        await resultPage.evaluate(() => {
          const confirmBtn = Array.from(
            document.querySelectorAll("button, div, span"),
          ).find((el) => el.innerText && el.innerText.trim() === "确认");
          if (confirmBtn) confirmBtn.click();
        });
        await resultPage.waitForNetworkIdle({ timeout: 15000 }).catch(() => {});
      }
    }

    // ==========================================
    // 阶段四：微观风控防御 - 人类滚动模拟
    // ==========================================
    await resultPage
      .waitForSelector('div[class*="searchOfferWrapper"]', { timeout: 15000 })
      .catch(() => {});

    console.log("👀 正在模拟人类浏览行为：缓慢向下滚动页面触发数据加载...");
    await resultPage.evaluate(async () => {
      await new Promise<void>((resolve) => {
        let totalHeight = 0;
        const timer = setInterval(
          () => {
            const distance = Math.floor(Math.random() * 100) + 100;
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;

            if (
              totalHeight >= scrollHeight - window.innerHeight ||
              totalHeight > 4000
            ) {
              clearInterval(timer);
              resolve();
            }
          },
          Math.floor(Math.random() * 200) + 100,
        );
      });
    });
    // 假装在端详某个商品
    await new Promise((r) =>
      setTimeout(r, Math.floor(Math.random() * 2000) + 1000),
    );

    // ==========================================
    // 阶段五：数据大丰收 (0.3 极高召回率提取)
    // ==========================================
    const extractResult = await resultPage.evaluate((keywords) => {
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
        const imageUrl = imgEl
          ? imgEl.src || imgEl.getAttribute("data-src")
          : "";

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
          sales: "",
          moq: "",
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
        // 👇 核心修改：相似度门槛暴降至 0.30！宁可错杀一千，绝不放过一个！
        if (isScoreValid && item.cosScore < 0.3) return false;
        // 👇 动态文本过滤 (如果传入了关键字，才执行)
        if (keywords && keywords.length > 0) {
          const isMatchKeyword = keywords.some((kw) => item.title.includes(kw));
          if (!isMatchKeyword) return false;
        }
        return true;
      });

      return filteredItems;
    }, targetKeywords);

    return extractResult;
  } catch (error) {
    console.error(`❌ 处理图片 ${imagePath} 发生异常:`, error);
    return []; // 出错时不崩溃，返回空数组
  } finally {
    // 【至关重要】阅后即焚，清理当前产生的页面
    if (resultPage && !resultPage.isClosed() && resultPage !== page) {
      await resultPage.close();
    }
    if (!page.isClosed()) {
      await page.close();
    }
  }
}
