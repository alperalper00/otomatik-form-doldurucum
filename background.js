chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "bildirimGonder") {
        // Hedef sayıya ulaşıldığında masaüstü bildirimi yollar
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon.png', 
            title: 'Form Botu Ultra',
            message: request.msg,
            priority: 2
        });
        sendResponse({ status: "ok" });
    }
});