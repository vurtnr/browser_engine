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

// 🌟 升级版不死鸟：引入“深度探针”与“残页大扫除”
async function ensureBrowserAndPageAlive() {
    // 1. 检查浏览器大盘
    if (!globalBrowser || !globalBrowser.isConnected()) {
        console.log("♻️ [守护进程] 战车连接彻底断开，正在重新拉起 Chrome...");
        if (globalBrowser) await globalBrowser.close().catch(() => {});
        
        globalBrowser = await puppeteer.launch({
            headless: false,
            executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", // Mac 路径
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

    // 2. 🌟 深度探针检查页面假死 (专门克制 Session Closed)
    let needNewPage = false;
    if (!globalHomePage || globalHomePage.isClosed()) {
        needNewPage = true;
    } else {
        try {
            // 不仅仅问它关没关，强制对它进行物理操作！
            await globalHomePage.bringToFront();
            await globalHomePage.evaluate(() => document.title);
        } catch (e) {
            console.log("⚠️ [守护进程] 深度探针发现页面『假死』(Session 断开)！准备强行替换...");
            needNewPage = true;
        }
    }

    // 3. 强行涅槃重生
    if (needNewPage) {
        try {
            // 尝试物理关闭那个死掉的标签页
            if (globalHomePage && !globalHomePage.isClosed()) {
                await globalHomePage.close().catch(() => {});
            }
        } catch (e) {}
        
        console.log("🔄 正在生成全新的 1688 主阵地标签页...");
        globalHomePage = await globalBrowser.newPage();
        await globalHomePage.goto("https://www.1688.com/", { waitUntil: "networkidle2" });
        console.log("✅ [守护进程] 主阵地重建完毕，恢复战斗力！");
    }

    // 4. 🌟 内存大扫除：杀掉所有不知名原因遗留的搜索结果页，防止内存爆炸
    try {
        const pages = await globalBrowser.pages();
        for (const p of pages) {
            // 把除了主阵地之外的所有杂页全关了
            if (p !== globalHomePage) {
                await p.close().catch(() => {});
            }
        }
    } catch(e) {}

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
        // 每次出击前，必先体检！
        const activeHomePage = await ensureBrowserAndPageAlive();

        const candidates = await search1688ByImage(globalBrowser, activeHomePage, imagePath, forceFullCrop, []);
        
        console.log(`[Bun 引擎] 抓取完成，共返回 ${candidates.length} 个结果！`);
        res.json({ success: true, data: candidates });
    } catch (error) {
        console.error("❌ [Bun 引擎] 发生致命异常:", error);
        res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
});

const PORT = 8266;

app.listen(PORT, "127.0.0.1", async () => {
    console.log(`🚀 [Bun] 1688 搜图微服务已启动！专属监听: 127.0.0.1:${PORT}`);
    console.log(`⚙️  正在拉起隐身战车 (Browser)... 请稍候...`);
    
    // 初始化启动大盘
    await ensureBrowserAndPageAlive();
    
    console.log(`⏳ 首页预热成功！微服务已进入绝对待命状态，等待 Rust 发送指令...`);
});