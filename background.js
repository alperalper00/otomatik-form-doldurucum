// Gerçekçi User-Agent ve Ekran Çözünürlüğü Havuzu
const cihazHavuzu = [
    { ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", width: 1920, height: 1080, type: "desktop" },
    { ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", width: 1440, height: 900, type: "desktop" },
    { ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0", width: 1366, height: 768, type: "desktop" },
    { ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0", width: 1536, height: 864, type: "desktop" },
    { ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1", width: 390, height: 844, type: "mobile" },
    { ua: "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36", width: 412, height: 915, type: "mobile" },
    { ua: "Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1", width: 810, height: 1080, type: "tablet" }
];

function rastgeleKimlikAyarla() {
    const secilenCihaz = cihazHavuzu[Math.floor(Math.random() * cihazHavuzu.length)];

    chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [1, 2], // 1: UA, 2: Cookie Kuralı
        addRules: [
            {
                // KURAL 1: User-Agent Değiştirici
                id: 1,
                priority: 1,
                action: {
                    type: "modifyHeaders",
                    requestHeaders: [{
                        header: "user-agent",
                        operation: "set",
                        value: secilenCihaz.ua
                    }]
                },
                condition: {
                    urlFilter: "docs.google.com",
                    resourceTypes: ["main_frame", "sub_frame", "xmlhttprequest", "script"]
                }
            },
            {
                // KURAL 2: Çerez (Cookie) Gizleyici - Tarayıcı geçmişini silmez, sadece formdan gizler!
                id: 2,
                priority: 2,
                action: {
                    type: "modifyHeaders",
                    requestHeaders: [{
                        header: "cookie",
                        operation: "remove"
                    }]
                },
                condition: {
                    urlFilter: "docs.google.com/forms",
                    resourceTypes: ["main_frame", "sub_frame", "xmlhttprequest"]
                }
            }
        ]
    });

    // Viewport Spoofing (Sahte Çözünürlük) için boyutları hafızaya kaydet
    chrome.storage.local.set({
        sahteViewport: { w: secilenCihaz.width, h: secilenCihaz.height, tip: secilenCihaz.type }
    });

    return secilenCihaz.ua;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "bildirimGonder") {
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon.png',
            title: 'Form Botu Ultra',
            message: request.msg,
            priority: 2
        });
        sendResponse({ status: "ok" });
    }

    if (request.action === "userAgentDegistir") {
        const yeniUA = rastgeleKimlikAyarla();
        sendResponse({ status: "ok", ua: yeniUA });
    }
});

chrome.alarms.create('botKeepAlive', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'botKeepAlive') {
        chrome.storage.local.get(['botAktif'], (data) => {
            console.log('Keep-Alive Etkin. Bot Durumu:', data.botAktif || false);
        });
    }
});
