import path from "path";
import { Browser, Page } from "puppeteer";

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
 * 1688 终极以图搜图核心引擎 (支持 Rust 下达的强制全图重绘指令)
 */
export async function search1688ByImage(
  browser: Browser,
  page: Page,
  imagePath: string,
  forceFullCrop: boolean = false, // 👈 接收 Rust 传来的强制重绘指令
  targetKeywords: string[] = [],
): Promise<SearchResult[]> {
  const CAMERA_ICON_SELECTOR = ".image-file-reader-wrapper";
  const absoluteImgPath = path.resolve(imagePath);
  let resultPage: Page | null = null;

  // ==========================================
  // 内部辅助函数：极速滚动提取当页数据
  // ==========================================
  const scrapeCurrentPage = async (): Promise<SearchResult[]> => {
    // 模拟人类滚动，触发页面下方的懒加载
    await resultPage!.evaluate(async () => {
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
    await new Promise((r) =>
      setTimeout(r, Math.floor(Math.random() * 1500) + 1000),
    );

    return await resultPage!.evaluate((keywords) => {
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
      return parsedItems.filter((item) => {
        if (!item.title || !item.itemUrl || item.isAd) return false;
        // 相似度放宽到 0.3
        if (isScoreValid && item.cosScore < 0.3) return false;
        if (keywords && keywords.length > 0) {
          const isMatchKeyword = keywords.some((kw) => item.title.includes(kw));
          if (!isMatchKeyword) return false;
        }
        return true;
      });
    }, targetKeywords);
  };

  try {
    // ---------------------------------------------------------
    // 阶段一：潜入主阵地与传图
    // ---------------------------------------------------------
    await page.bringToFront();
    await page.goto("https://www.1688.com/", {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    const currentUrl = page.url();
    const hasSlider =
      (await page.$(
        '.nc-container, #baxia-dialog-content, #nc_1_n1z, iframe[src*="punish"]',
      )) !== null;
    if (
      currentUrl.includes("login") ||
      currentUrl.includes("sec.") ||
      hasSlider
    ) {
      console.log(`\n🚨 [风控警报] 触发底层拦截！请立即在浏览器中手动滑块！`);
      await page.waitForFunction(
        (selector) => {
          const url = window.location.href;
          const isSafe =
            !url.includes("login") &&
            !url.includes("sec.") &&
            !url.includes("punish");
          const noSlider =
            !document.querySelector(".nc-container") &&
            !document.querySelector("#baxia-dialog-content");
          return (
            isSafe && noSlider && document.querySelector(selector) !== null
          );
        },
        { timeout: 0, polling: 1000 },
        CAMERA_ICON_SELECTOR,
      );
      console.log("✅ 验证通过！风控解除...");
      await new Promise((r) => setTimeout(r, 2000));
    }

    const cameraHandle = await page.waitForSelector(CAMERA_ICON_SELECTOR, {
      visible: true,
      timeout: 30000,
    });
    await new Promise((r) => setTimeout(r, 1500));

    const newTargetPromise = browser
      .waitForTarget(
        (t) =>
          t.type() === "page" &&
          t.url().includes("1688.com") &&
          t.url() !== page.url(),
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

    // ---------------------------------------------------------
    // 阶段二：侦测弹窗与接管结果页
    // ---------------------------------------------------------
    await page.evaluate(async () => {
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
      else resultPage = page;
    }

    if (!resultPage) throw new Error("未能成功进入搜索结果页");
    await resultPage.bringToFront();
    await resultPage.waitForNetworkIdle({ timeout: 15000 }).catch(() => {});
    await resultPage
      .waitForSelector('div[class*="searchOfferWrapper"]', { timeout: 15000 })
      .catch(() => {});

    // ==========================================
    // 🌟 阶段三：根据 Rust 指令执行单一策略
    // ==========================================
    if (!forceFullCrop) {
      console.log("👀 [第一重拦截] 采用 1688 默认 AI 框选极速提取...");
      return await scrapeCurrentPage();
    } else {
      console.log(
        "📐 [第二重爆破] 收到大模型发来的强制重绘指令，启动机械臂拉满全图...",
      );
      try {
        await resultPage.evaluate(() => {
          const cutBtn =
            document.querySelector(".cut-btn") ||
            document.querySelector('div[class*="cutBtn"]');
          if (cutBtn) {
            cutBtn.dispatchEvent(
              new MouseEvent("mouseover", { bubbles: true }),
            );
            cutBtn.dispatchEvent(
              new MouseEvent("mousedown", { bubbles: true }),
            );
            cutBtn.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
            cutBtn.click();
          }
        });

        const canvasHandle = await resultPage
          .waitForSelector('div[role="dialog"] canvas', {
            visible: true,
            timeout: 5000,
          })
          .catch(
            async () =>
              await resultPage!.waitForSelector("canvas", {
                visible: true,
                timeout: 5000,
              }),
          );
        await new Promise((r) => setTimeout(r, 1000));

        const canvasBox = await canvasHandle?.boundingBox();
        if (canvasBox && canvasBox.width > 50) {
          const startX = canvasBox.x + 5;
          const startY = canvasBox.y + 5;
          const endX = canvasBox.x + canvasBox.width - 5;
          const endY = canvasBox.y + canvasBox.height - 5;

          await resultPage.mouse.move(startX, startY);
          await resultPage.mouse.down();
          await resultPage.mouse.move(endX, endY, { steps: 20 });
          await new Promise((r) => setTimeout(r, 200));
          await resultPage.mouse.up();
          await new Promise((r) => setTimeout(r, 500));

          await resultPage.evaluate(() => {
            const confirmBtn = Array.from(
              document.querySelectorAll("button, div, span"),
            ).find((el) => el.innerText && el.innerText.trim() === "确认");
            if (confirmBtn) confirmBtn.click();
          });

          console.log("⏳ 全图搜索已提交，等待数据刷新...");
          await resultPage
            .waitForNetworkIdle({ timeout: 15000 })
            .catch(() => {});
          await resultPage
            .waitForSelector('div[class*="searchOfferWrapper"]', {
              timeout: 15000,
            })
            .catch(() => {});
        } else {
          console.log("⚠️ 未能获取到 Canvas 画布坐标，降级使用默认搜索结果。");
        }
      } catch (e) {
        console.log("⚠️ 强制重绘操作受阻，降级使用当前搜索结果:", e);
      }

      return await scrapeCurrentPage();
    }
  } catch (error) {
    console.error(`❌ 处理图片 ${imagePath} 发生异常:`, error);
    return [];
  } finally {
    // 阅后即焚：关掉结果页，保留首页给下一次任务
    if (resultPage && !resultPage.isClosed() && resultPage !== page) {
      await resultPage.close();
    }
  }
}
