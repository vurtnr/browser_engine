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

export async function search1688ByImage(
  browser: Browser,
  page: Page,
  imagePath: string,
  forceFullCrop: boolean = false, 
  targetKeywords: string[] = [],
): Promise<SearchResult[]> {
  const CAMERA_ICON_SELECTOR = ".image-file-reader-wrapper";
  const absoluteImgPath = path.resolve(imagePath);
  let resultPage: Page | null = null;

  const scrapeCurrentPage = async (): Promise<SearchResult[]> => {
    // 模拟人类滚动，触发页面下方的懒加载
    await resultPage!.evaluate(async () => {
      await new Promise<void>((resolve) => {
        let totalHeight = 0;
        const timer = setInterval(() => {
            const distance = Math.floor(Math.random() * 100) + 100;
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;
            if (totalHeight >= scrollHeight - window.innerHeight || totalHeight > 4000) {
              clearInterval(timer); resolve();
            }
          }, Math.floor(Math.random() * 200) + 100);
      });
    });
    await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 1500) + 1000));

    const rawData = await resultPage!.evaluate((keywords) => {
      const cards = Array.from(document.querySelectorAll('div[class*="searchOfferWrapper"]'));
      const parsedItems = cards.map((card) => {
        const titleEl = card.querySelector('div[class*="titleText"]');
        const title = titleEl ? titleEl.innerText.trim() : "";
        const priceEl = card.querySelector('div[class*="textMain"]');
        const price = priceEl ? priceEl.innerText.trim() : "";
        const shopEl = card.querySelector('div[class*="shopName"]');
        const shopName = shopEl ? shopEl.innerText.trim() : "";
        const imgEl = card.querySelector('img[class*="mainImg"]');
        const imageUrl = imgEl ? imgEl.src || imgEl.getAttribute("data-src") : "";
        const reportData = card.getAttribute("data-aplus-report") || card.getAttribute("data-tracker") || "";
        const isAd = reportData.includes("offerType:e_p4p") || reportData.includes("offerType:p4p");

        let cosScore = 0;
        const scoreMatch = reportData.match(/cosScore.*?([\d\.]+)/i);
        if (scoreMatch && scoreMatch[1]) cosScore = parseFloat(scoreMatch[1]);

        let itemUrl = "";
        const wwEl = card.querySelector(".J_WangWang");
        if (wwEl) {
          try {
            const extra = JSON.parse(wwEl.getAttribute("data-extra") || "{}");
            if (extra.offerId) itemUrl = `https://detail.1688.com/offer/${extra.offerId}.html`;
          } catch (e) {}
        }
        if (!itemUrl) {
          const match = reportData.match(/object_id@(\d+)/);
          if (match && match[1]) itemUrl = `https://detail.1688.com/offer/${match[1]}.html`;
        }
        return { title, price: price ? `¥${price}` : "暂无", sales: "", moq: "", shopName, itemUrl, imageUrl, isAd, cosScore };
      });

      const isScoreValid = parsedItems.filter((item) => item.cosScore > 0).length > 0;
      return parsedItems.filter((item) => {
        if (!item.title || !item.itemUrl || item.isAd) return false;
        if (isScoreValid && item.cosScore < 0.3) return false;
        if (keywords && keywords.length > 0) {
          const isMatchKeyword = keywords.some((kw) => item.title.includes(kw));
          if (!isMatchKeyword) return false;
        }
        return true;
      });
    }, targetKeywords);

    // 🌟 核心需求满足：强制根据 1688 算法给出的 cosScore 相似度进行降序排序
    rawData.sort((a, b) => b.cosScore - a.cosScore);
    return rawData;
  };

  try {
    // 阶段一：激活常驻主阵地，防止页面休眠
    await page.bringToFront();
    await page.goto("https://www.1688.com/", { waitUntil: "networkidle2", timeout: 60000 });

    const currentUrl = page.url();
    const hasSlider = (await page.$('.nc-container, #baxia-dialog-content, #nc_1_n1z, iframe[src*="punish"]')) !== null;
    if (currentUrl.includes("login") || currentUrl.includes("sec.") || hasSlider) {
      console.log(`\n🚨 [风控警报] 触发底层拦截！战车挂起，请立即在弹出的浏览器中手动滑块或扫码！`);
      await page.waitForFunction(
        (selector) => {
          const url = window.location.href;
          const isSafe = !url.includes("login") && !url.includes("sec.") && !url.includes("punish");
          const noSlider = !document.querySelector(".nc-container") && !document.querySelector("#baxia-dialog-content");
          return isSafe && noSlider && document.querySelector(selector) !== null;
        },
        { timeout: 0, polling: 1000 },
        CAMERA_ICON_SELECTOR,
      );
      console.log("✅ 验证通过！风控解除，战车恢复推进...");
      await new Promise((r) => setTimeout(r, 2000));
    }

    const cameraHandle = await page.waitForSelector(CAMERA_ICON_SELECTOR, { visible: true, timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1500));

    // 预埋标签页捕捉器
    const newTargetPromise = browser.waitForTarget((t) => t.type() === "page" && t.url().includes("1688.com") && t.url() !== page.url(), { timeout: 30000 }).catch(() => null);

    // 触发文件上传
    const [fileChooser] = await Promise.all([
      page.waitForFileChooser({ timeout: 15000 }),
      cameraHandle!.click().catch(async () => {
        await page.evaluate((sel) => document.querySelector(sel)?.click(), CAMERA_ICON_SELECTOR);
      }),
    ]);

    await fileChooser.accept([absoluteImgPath]);

    // 阶段二：侦测有些账号上传后需要二次确认的弹窗
    await page.evaluate(async () => {
      return new Promise((resolve) => {
        let attempts = 0;
        const timer = setInterval(() => {
          attempts++;
          const btn = Array.from(document.querySelectorAll("button, div, span")).find((el) => el.innerText && el.innerText.trim() === "搜索图片");
          if (btn) {
            clearInterval(timer);
            btn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
            btn.click();
            resolve(true);
          }
          if (attempts >= 15) { clearInterval(timer); resolve(false); }
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
    await resultPage.waitForSelector('div[class*="searchOfferWrapper"]', { timeout: 15000 }).catch(() => {});

    // ==========================================
    // 🌟 阶段三：双重召回战略指令分发
    // ==========================================
    if (!forceFullCrop) {
        console.log("👀 [第一重拦截] 采用 1688 默认 AI 框选极速提取...");
        return await scrapeCurrentPage(); 
    } else {
        console.log("📐 [第二重爆破] 启动机械臂拖动 Canvas 拉满全图...");
        try {
            // 🌟 1. 强制死等裁剪按钮出现，最长等 15 秒，避免页面未渲染完毕就开始点
            console.log("⏳ 等待裁剪面板出现...");
            await resultPage.waitForFunction(() => {
                const cut1 = document.querySelector(".cut-btn");
                const cut2 = document.querySelector('div[class*="cutBtn"]');
                return (cut1 !== null || cut2 !== null);
            }, { timeout: 15000 });

            await resultPage.evaluate(() => {
              const cutBtn = document.querySelector(".cut-btn") || document.querySelector('div[class*="cutBtn"]');
              if (cutBtn) {
                cutBtn.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
                cutBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
                cutBtn.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
                cutBtn.click();
              }
            });

            // 🌟 2. 强制死等 Canvas 画布渲染
            const canvasHandle = await resultPage.waitForSelector('div[role="dialog"] canvas', { visible: true, timeout: 10000 })
              .catch(async () => await resultPage!.waitForSelector("canvas", { visible: true, timeout: 10000 }));
            
            if (!canvasHandle) throw new Error("Canvas 画布未在规定时间内渲染！");
            await new Promise((r) => setTimeout(r, 1500));

            const canvasBox = await canvasHandle.boundingBox();
            if (canvasBox && canvasBox.width > 50) {
              // 绝对坐标系：直接对角线拉满
              const startX = canvasBox.x + 5; const startY = canvasBox.y + 5;
              const endX = canvasBox.x + canvasBox.width - 5; const endY = canvasBox.y + canvasBox.height - 5;

              // 仿生拖拽：增加 steps 让鼠标平滑移动，避开行为特征检测
              await resultPage.mouse.move(startX, startY); await resultPage.mouse.down();
              await resultPage.mouse.move(endX, endY, { steps: 30 }); 
              await new Promise((r) => setTimeout(r, 300)); await resultPage.mouse.up();
              await new Promise((r) => setTimeout(r, 500));

              await resultPage.evaluate(() => {
                const confirmBtn = Array.from(document.querySelectorAll("button, div, span")).find((el) => el.innerText && el.innerText.trim() === "确认");
                if (confirmBtn) confirmBtn.click();
              });
              
              console.log("✅ 全图覆盖重绘完成！已提交，等待最新数据刷新...");
              await resultPage.waitForNetworkIdle({ timeout: 15000 }).catch(() => {});
              await resultPage.waitForSelector('div[class*="searchOfferWrapper"]', { timeout: 15000 }).catch(() => {});
            }
        } catch(e) {
            // 如果真的遇到页面大改版等不可抗力，报错打印出来，但不要让整个程序直接崩死
            console.error("❌ 强制重绘操作受阻，1688 页面可能未响应:", e);
        }
        return await scrapeCurrentPage(); 
    }

  } catch (error) {
    console.error(`❌ 处理图片 ${imagePath} 发生异常:`, error);
    // 🌟 核心修改：绝对不吞没致命报错，将其透传回 server.ts 和 Rust！
    throw error; 
  } finally {
    // 阶段四：阅后即焚，关掉结果页，把干净的 1688 首页留给下一次搜索
    if (resultPage && !resultPage.isClosed() && resultPage !== page) {
      await resultPage.close(); 
    }
  }
}