import express from 'express';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { search1688ByImage } from './1688_engine';

// 启用隐身装甲
puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());

let globalBrowser: any = null;
let globalHomePage: any = null;

// 🌟 纯粹版不死鸟：只救命，不乱杀
async function ensureBrowserAndPageAlive() {
    // 1. 检查浏览器大盘
    if (!globalBrowser || !globalBrowser.isConnected()) {
        console.log("♻️ [守护进程] 战车未连接，正在拉起 Chrome...");
        if (globalBrowser) await globalBrowser.close().catch(() => {});
        
        globalBrowser = await puppeteer.launch({
            headless: false,
            executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            defaultViewport: null,
            userDataDir: "./1688_profile",
            args: [
                "--start-maximized",
                "--disable-blink-features=AutomationControlled",
                "--disable-infobars",
                "--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            ],
        });
        globalHomePage = null; 
    }

    // 2. 深度探针检查页面假死
    let needNewPage = false;
    if (!globalHomePage || globalHomePage.isClosed()) {
        needNewPage = true;
    } else {
        try {
            await globalHomePage.bringToFront();
            await globalHomePage.evaluate(() => document.title);
        } catch (e) {
            console.log("⚠️ [守护进程] 发现页面假死，准备强行替换...");
            needNewPage = true;
        }
    }

    // 3. 强行涅槃重生
    if (needNewPage) {
        try {
            if (globalHomePage && !globalHomePage.isClosed()) {
                await globalHomePage.close().catch(() => {});
            }
        } catch (e) {}
        
        console.log("🔄 正在生成全新的 1688 主阵地标签页...");
        globalHomePage = await globalBrowser.newPage();
        await globalHomePage.goto("https://www.1688.com/", { waitUntil: "networkidle2" });
        console.log("✅ [守护进程] 主阵地就绪，战车待命！");
    }

    // ⚠️ 删除了危险的“内存大扫除”，防止对象引用不匹配导致的误杀！
    return globalHomePage;
}

app.post('/search', async (req, res) => {
    const { imagePath, forceFullCrop = false } = req.body;

    if (!imagePath) {
        return res.status(400).json({ success: false, error: "缺少参数 imagePath" });
    }

    console.log(`\n========================================`);
    console.log(`[Bun 引擎] 收到 Rust 指令！模式: ${forceFullCrop ? '🔥 强制全图重绘' : '⚡️ 默认极速框选'}`);

    try {
        const runSearch = async () => {
            const activeHomePage = await ensureBrowserAndPageAlive();
            return search1688ByImage(globalBrowser, activeHomePage, imagePath, forceFullCrop, []);
        };

        let candidates;
        try {
            candidates = await runSearch();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const isSessionClosed = /Session closed|Target closed|Protocol error/i.test(message);
            if (!isSessionClosed) {
                throw error;
            }

            console.warn("⚠️ [Bun 引擎] 检测到页面会话失效，触发一次自愈重试...");
            globalHomePage = null;
            candidates = await runSearch();
        }

        console.log(`[Bun 引擎] 抓取完成，共返回 ${candidates.length} 个结果！`);
        res.json({ success: true, data: candidates });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const isFullCropNotApplied = message.includes("[FULL_CROP_NOT_APPLIED]");
        const isSearchNotEnteredResult = message.includes("[IMAGE_SEARCH_NOT_ENTERED_RESULT_PAGE]");
        if (isFullCropNotApplied) {
            console.warn("⚠️ [Bun 引擎] 二次召回未完成重绘，返回业务错误给 Rust:", message);
            return res.json({ success: false, code: "FULL_CROP_NOT_APPLIED", error: message });
        }
        if (isSearchNotEnteredResult) {
            console.warn("⚠️ [Bun 引擎] 上传后未进入搜索结果页，返回业务错误给 Rust:", message);
            return res.json({ success: false, code: "IMAGE_SEARCH_NOT_ENTERED_RESULT_PAGE", error: message });
        }

        console.error("❌ [Bun 引擎] 发生致命异常:", error);
        res.status(500).json({ success: false, error: message });
    }
});

const PORT = 8266;

app.listen(PORT, "127.0.0.1", async () => {
    console.log(`🚀 [Bun] 1688 搜图微服务已启动！专属监听: 127.0.0.1:${PORT}`);
    console.log(`⚙️  正在拉起隐身战车 (Browser)... 请稍候...`);
    
    await ensureBrowserAndPageAlive();
    
    console.log(`⏳ 首页预热成功！微服务已进入绝对待命状态，等待 Rust 发送指令...`);
});
