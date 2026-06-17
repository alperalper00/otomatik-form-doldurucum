(async function () {
    function extractFormId(url) {
        if (!url) return null;
        const match = url.match(/\/d\/(?:e\/)?([a-zA-Z0-9_-]+)/);
        return match ? match[1] : null;
    }

    function temizleSoruMetni(text) {
        if (!text) return "";
        let t = text.replace(/\*/g, "").replace(/\n/g, " ").replace(/\s+/g, " ").trim();
        t = t.replace(/^[0-9]+\s*[.)]\s*/, "").trim();
        return t;
    }

    function findOptionTextInput(choiceEl) {
        let parent = choiceEl.parentElement;
        for (let i = 0; i < 4; i++) {
            if (!parent || parent.matches('.Qr7Oae, [role="listitem"], .geS54d, [data-item-id]')) {
                break;
            }
            const otherChoices = parent.querySelectorAll('[role="radio"], [role="checkbox"]');
            if (otherChoices.length > 1) {
                break;
            }
            const input = parent.querySelector('input[type="text"], input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"])');
            if (input) {
                return input;
            }
            parent = parent.parentElement;
        }
        return null;
    }

    async function sesCal(tip) {

        try {
            chrome.runtime.sendMessage({ action: "playChime", tip: tip }).catch(() => { });
        } catch (e) { }

        try {
            const data = await chrome.storage.local.get({ sesDurumu: 'acik' });
            if (data.sesDurumu !== 'acik') return;

            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') {
                audioCtx.close();
                return;
            }

            if (tip === 'success') {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain);
                gain.connect(audioCtx.destination);

                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, audioCtx.currentTime);
                gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);

                osc.start();
                osc.stop(audioCtx.currentTime + 0.3);
            } else if (tip === 'victory') {
                const notes = [523.25, 659.25, 783.99, 1046.50];
                notes.forEach((freq, index) => {
                    const osc = audioCtx.createOscillator();
                    const gain = audioCtx.createGain();
                    osc.connect(gain);
                    gain.connect(audioCtx.destination);

                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(freq, audioCtx.currentTime + index * 0.12);
                    gain.gain.setValueAtTime(0.0, audioCtx.currentTime);
                    gain.gain.linearRampToValueAtTime(0.1, audioCtx.currentTime + index * 0.12 + 0.02);
                    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + index * 0.12 + 0.35);

                    osc.start(audioCtx.currentTime + index * 0.12);
                    osc.stop(audioCtx.currentTime + index * 0.12 + 0.4);
                });
            } else if (tip === 'error') {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain);
                gain.connect(audioCtx.destination);

                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(150, audioCtx.currentTime);
                osc.frequency.linearRampToValueAtTime(100, audioCtx.currentTime + 0.4);

                gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);

                osc.start();
                osc.stop(audioCtx.currentTime + 0.4);
            }
        } catch (e) {
            console.error("Content script ses çalma hatası:", e);
        }
    }
    function generateLocalResponse(questionText) {
        const t = questionText.toLowerCase();

        if (t.includes("email") || t.includes("e-posta") || t.includes("eposta") || t.includes("mail")) {
            const domain = ["gmail.com", "outlook.com", "hotmail.com", "yandex.com", "yahoo.com"];
            const selectedDomain = domain[Math.floor(Math.random() * domain.length)];
            const erkekIsimleri = ["ahmet", "mehmet", "mustafa", "ali", "can", "burak", "emre", "hasan", "onur", "oguz", "berk", "kaan", "cem"];
            const soyisimler = ["yilmaz", "kaya", "demir", "celik", "sahin", "yildiz", "ozturk", "aydin", "ozdemir", "arslan", "dogan", "kilic", "cetin", "kara"];
            const randomName = erkekIsimleri[Math.floor(Math.random() * erkekIsimleri.length)];
            const randomSurname = soyisimler[Math.floor(Math.random() * soyisimler.length)];
            const randomNum = Math.floor(Math.random() * 900 + 100);
            return `${randomName}.${randomSurname}${randomNum}@${selectedDomain}`;
        }

        if (t.includes("telefon") || t.includes("phone") || t.includes("gsm") || t.includes("tel")) {
            const provider = ["532", "533", "535", "542", "543", "544", "505", "506", "507"];
            const selectedProvider = provider[Math.floor(Math.random() * provider.length)];
            const part1 = Math.floor(Math.random() * 900 + 100).toString();
            const part2 = Math.floor(Math.random() * 90 + 10).toString();
            const part3 = Math.floor(Math.random() * 90 + 10).toString();
            return `0${selectedProvider}${part1}${part2}${part3}`;
        }

        if (t.includes("yas") || t.includes("yaş") || t.includes("age")) {
            return Math.floor(Math.random() * (30 - 18 + 1) + 18).toString();
        }

        if (t.includes("doğum") || t.includes("dogum")) {
            const currentYear = new Date().getFullYear();
            const age = Math.floor(Math.random() * (30 - 18 + 1) + 18);
            return (currentYear - age).toString();
        }

        if (t.includes("tc kimlik") || t.includes("t.c.") || t.includes("kimlik no") || t.includes("tckn")) {
            const digits = [];
            digits[0] = Math.floor(Math.random() * 9) + 1; // 1-9
            for (let i = 1; i < 9; i++) {
                digits[i] = Math.floor(Math.random() * 10); // 0-9
            }
            const oddSum = digits[0] + digits[2] + digits[4] + digits[6] + digits[8];
            const evenSum = digits[1] + digits[3] + digits[5] + digits[7];
            const d10 = ((oddSum * 7) - evenSum) % 10;
            digits[9] = d10 < 0 ? (d10 + 10) : d10;
            let sum10 = 0;
            for (let i = 0; i < 10; i++) {
                sum10 += digits[i];
            }
            digits[10] = sum10 % 10;
            return digits.join('');
        }

        return "";
    }

    function extractColumnTitle(ariaLabel, rowTitle) {
        if (!ariaLabel) return "";

        let label = ariaLabel;

        if (rowTitle) {

            const escapedRow = rowTitle.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            const regex = new RegExp(escapedRow, 'gi');
            label = label.replace(regex, '');
        }

        const suffixes = [
            "ile ilgili yanıt",
            "ile ilgili yanit",
            "response for",
            "option for"
        ];

        suffixes.forEach(suffix => {
            const regex = new RegExp(suffix, 'gi');
            label = label.replace(regex, '');
        });

        // Başında ve sonundaki virgülleri, noktalama işaretlerini ve boşlukları temizle
        label = label.replace(/^[\s,;.-]+|[\s,;.-]+$/g, '').trim();

        // Tüm bunlardan sonra hala bir virgül varsa, dil kalıbına göre böl
        const commaIdx = label.indexOf(',');
        if (commaIdx > -1) {
            // Yerel dile özgü uzantıları kontrol etmek için orijinal ariaLabel'ı kullanıyoruz
            const lowerLabel = ariaLabel.toLowerCase();
            if (lowerLabel.includes("ile ilgili yanit") || lowerLabel.includes("ile ilgili yanıt")) {
                return label.substring(0, commaIdx).trim();
            } else {
                return label.substring(label.lastIndexOf(',') + 1).trim();
            }
        }

        // Tüm bunlardan sonra elimizde hiçbir şey kalmazsa, orijinal virgülle bölme yöntemine (fallback) geri dön
        if (!label) {
            const commaIdx = ariaLabel.indexOf(',');
            if (commaIdx > -1) {
                const lowerLabel = ariaLabel.toLowerCase();
                if (lowerLabel.includes("ile ilgili yanit") || lowerLabel.includes("ile ilgili yanıt")) {
                    return ariaLabel.substring(0, commaIdx).trim();
                } else {
                    return ariaLabel.substring(ariaLabel.lastIndexOf(',') + 1).trim();
                }
            }
            return ariaLabel.trim();
        }

        return label;
    }

    function insansiGecikme(baseMs) {
        const jitter = baseMs * 0.3;
        return Math.floor(baseMs - jitter + Math.random() * (jitter * 2));
    }

    const bekle = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    async function insansiYaz(element, metin) {
        element.focus();
        element.value = "";
        for (let harf of metin) {
            element.value += harf;
            element.dispatchEvent(new Event('input', { bubbles: true }));
            await bekle(Math.random() * 60 + 40);
        }
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.blur();
    }

    async function logEkle(mesaj, tip) {
        const data = await chrome.storage.local.get({ islemGecmisi: [] });
        const now = new Date();
        const timeStr = now.toTimeString().split(' ')[0];
        const yeniLog = { time: timeStr, msg: mesaj, type: tip };
        await chrome.storage.local.set({
            islemGecmisi: [yeniLog, ...data.islemGecmisi].slice(0, 20)
        });
    }

    async function captchaTespitEdildi() {
        await sesCal('error');
        await chrome.storage.local.set({ botAktif: false });
        await logEkle("🚨 CAPTCHA TESPİT EDİLDİ! DURDURULDU", "err");
        console.error("Form Botu: Captcha yakalandı, bot durduruldu!");
    }
    function getFBPublicLoadData() {
        const scripts = Array.from(document.querySelectorAll('script'));
        for (const script of scripts) {
            const text = script.innerText || script.textContent;
            if (text && text.includes("FB_PUBLIC_LOAD_DATA_")) {
                const match = text.match(/var\s+FB_PUBLIC_LOAD_DATA_\s*=\s*(.*);/);
                if (match) {
                    try {
                        return JSON.parse(match[1]);
                    } catch (e) {
                        try {
                            return (new Function(`return ${match[1]}`))();
                        } catch (err) {
                            console.error("Failed to parse FB_PUBLIC_LOAD_DATA_:", err);
                        }
                    }
                }
            }
        }
        return null;
    }

    function parseAllQuestionsFromData() {
        const questions = [];
        const data = getFBPublicLoadData();
        if (!data || !data[1] || !Array.isArray(data[1][1])) {
            return null;
        }

        const rawQuestions = data[1][1];
        rawQuestions.forEach((item) => {
            if (!item) return;
            const rawType = item[3];

            // 1. Sadece gerçek doldurulabilir soru tiplerini kabul et (Bölüm başlıkları veya açıklamaları es geç)
            const allowedTypes = [0, 1, 2, 3, 4, 5, 7, 8, 9, 10];
            if (!allowedTypes.includes(rawType)) {
                return;
            }

            // 2. Bir giriş kimliği (Entry ID) var mı kontrol et (Resim, video veya salt açıklama bloklarını filtrelemek için)
            let hasEntryId = false;
            if (item[4] && Array.isArray(item[4]) && item[4].length > 0) {
                for (const sub of item[4]) {
                    if (sub && Array.isArray(sub) && sub[0] !== undefined && sub[0] !== null) {
                        hasEntryId = true;
                        break;
                    }
                }
            }
            if (!hasEntryId) {
                return; // Giriş ID'si yoksa gerçek bir soru değildir (Resim, video veya salt açıklama metnidir)
            }

            const text = item[1] ? temizleSoruMetni(item[1]) : "";

            let type = '';
            let options = [];

            if (item[4] && item[4][0] && Array.isArray(item[4][0][1])) {
                item[4][0][1].forEach(opt => {
                    if (opt && typeof opt[0] === 'string' && opt[0].trim() !== '') {
                        options.push(opt[0].trim());
                    }
                });
            }

            if (rawType === 7 || rawType === 8) {
                if (item[4] && Array.isArray(item[4])) {
                    item[4].forEach(sub => {
                        if (!sub) return;
                        let rowTitle = "";
                        if (typeof sub[3] === 'string' && sub[3].trim() !== "") {
                            rowTitle = temizleSoruMetni(sub[3]);
                        } else if (Array.isArray(sub[3]) && sub[3].length > 0 && typeof sub[3][0] === 'string' && sub[3][0].trim() !== "") {
                            rowTitle = temizleSoruMetni(sub[3][0]);
                        } else if (typeof sub[1] === 'string' && sub[1].trim() !== "") {
                            rowTitle = temizleSoruMetni(sub[1]);
                        } else if (Array.isArray(sub[1]) && sub[1].length > 0 && typeof sub[1][0] === 'string' && sub[1][0].trim() !== "") {
                            rowTitle = temizleSoruMetni(sub[1][0]);
                        }

                        if (rowTitle) {
                            questions.push({
                                text: rowTitle,
                                type: 'choice',
                                options: options
                            });
                        }
                    });
                }
                return;
            }

            // Grid olmayan diğer sorular için soru metni zorunludur
            if (!text) return;

            // Google Forms tip kodlarını eşleştir
            if (rawType === 0 || rawType === 1 || rawType === 9 || rawType === 10) {
                type = 'text';
            } else if (rawType === 2 || rawType === 4 || rawType === 5) {
                type = 'choice';
            } else if (rawType === 3) {
                type = 'dropdown';
            } else {
                if (options.length > 0) {
                    type = 'choice';
                } else {
                    type = 'text';
                }
            }

            questions.push({
                text: text,
                type: type,
                options: options
            });
        });

        return questions;
    }

    async function scanFromDOM() {
        const questions = [];
        const rawBlocks = Array.from(document.querySelectorAll('.Qr7Oae, [role="listitem"], .geS54d, [data-item-id]'));
        const questionBlocks = [];

        rawBlocks.forEach(block => {
            const isContained = questionBlocks.some(b => b.contains(block));
            const containsExisting = questionBlocks.some(b => block.contains(b));
            if (!isContained) {
                if (containsExisting) {
                    const idx = questionBlocks.findIndex(b => block.contains(b));
                    questionBlocks[idx] = block;
                } else {
                    questionBlocks.push(block);
                }
            }
        });

        for (let index = 0; index < questionBlocks.length; index++) {
            const block = questionBlocks[index];

            // Önce grid satırlarını kontrol et (çünkü grid satırlarının kendi başlıkları vardır, ana başlık boş olabilir)
            let gridRows = Array.from(block.querySelectorAll('[role="row"]')).filter(r => r.querySelector('[role="rowheader"]'));
            if (gridRows.length === 0) {
                const rowContainers = Array.from(block.querySelectorAll('[role="radiogroup"], [role="group"]'));
                if (rowContainers.length > 1) {
                    gridRows = rowContainers;
                }
            }
            if (gridRows.length > 0) {
                for (const row of gridRows) {
                    let rowTitle = "";
                    const rowHeader = row.querySelector('[role="rowheader"]');
                    if (rowHeader) {
                        rowTitle = temizleSoruMetni(rowHeader.innerText);
                    } else {
                        const ariaLabel = row.getAttribute('aria-label');
                        if (ariaLabel) {
                            rowTitle = temizleSoruMetni(ariaLabel);
                        } else {
                            const labelledBy = row.getAttribute('aria-labelledby');
                            if (labelledBy) {
                                const labelEl = document.getElementById(labelledBy);
                                if (labelEl) {
                                    rowTitle = temizleSoruMetni(labelEl.innerText);
                                }
                            }
                        }
                    }
                    if (!rowTitle) continue;

                    const options = [];
                    const rowChoices = row.querySelectorAll('[role="radio"], [role="checkbox"]');
                    rowChoices.forEach(choice => {
                        let colTitle = choice.getAttribute('data-value') || "";
                        if (!colTitle) {
                            const ariaLabel = choice.getAttribute('aria-label');
                            if (ariaLabel) {
                                colTitle = extractColumnTitle(ariaLabel, rowTitle);
                            }
                        }
                        if (colTitle && !options.includes(colTitle)) {
                            options.push(colTitle);
                        }
                    });

                    questions.push({
                        text: rowTitle,
                        type: 'choice',
                        options: options
                    });
                }
                continue;
            }

            // Normal sorular için başlık kontrolü yap
            const textEl = block.querySelector('[role="heading"], .M7eMe');
            if (!textEl) continue;
            const text = temizleSoruMetni(textEl.innerText);
            if (!text) continue;

            const hasChoices = block.querySelectorAll('[role="radio"], [role="checkbox"]').length > 0;
            const hasInputs = block.querySelectorAll('input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"]), textarea').length > 0;
            const dropdownMenu = block.querySelector('[jsname="LgbsSe"]');

            let type = '';
            let options = [];

            if (hasChoices) {
                type = 'choice';
                const choiceEls = block.querySelectorAll('[role="radio"], [role="checkbox"]');
                choiceEls.forEach(choice => {
                    let optText = "";
                    const ariaLabel = choice.getAttribute('aria-label');
                    if (ariaLabel) {
                        optText = extractColumnTitle(ariaLabel, text);
                    }
                    if (!optText) {
                        optText = choice.getAttribute('data-value') || "";
                    }
                    if (!optText) {
                        const labelEl = choice.closest('label') || choice.parentElement || choice;
                        optText = labelEl.innerText ? labelEl.innerText.trim() : "";
                    }
                    if (optText && !options.includes(optText)) {
                        options.push(optText);
                    }
                });
            } else if (dropdownMenu) {
                type = 'dropdown';
                try {
                    dropdownMenu.click();
                    await bekle(200);
                    const optionEls = Array.from(document.querySelectorAll('[role="option"]')).filter(opt => opt.getAttribute('data-value') !== "");
                    optionEls.forEach(opt => {
                        const optText = opt.innerText ? opt.innerText.trim() : "";
                        if (optText && !options.includes(optText)) {
                            options.push(optText);
                        }
                    });
                    dropdownMenu.click();
                    await bekle(100);
                } catch (e) {
                    console.error("Dropdown scan error", e);
                }
            } else if (hasInputs) {
                type = 'text';
            } else {
                type = 'text';
            }

            if (type) {
                questions.push({
                    text: text,
                    type: type,
                    options: options
                });
            }
        }
        return questions;
    }

    async function scanFormunuDetayli() {
        let questions = [];
        try {
            // Birinci Seçenek: FB_PUBLIC_LOAD_DATA_ üzerinden tüm sayfaların sorularını çek
            const parsedQuestions = parseAllQuestionsFromData();
            if (parsedQuestions && parsedQuestions.length > 0) {
                questions = parsedQuestions;
            }
        } catch (e) {
        }

        // Her halükarda DOM Taraması ile birleştir (Özellikle o anda görünür olan soruların en güncel halini almak için)
        try {
            const domQuestions = await scanFromDOM();
            if (domQuestions && domQuestions.length > 0) {
                domQuestions.forEach(domQ => {
                    const existingIdx = questions.findIndex(q => q.text.toLowerCase().trim() === domQ.text.toLowerCase().trim());
                    if (existingIdx > -1) {
                        // Eğer FB_PUBLIC_LOAD_DATA_'dan gelen seçenek yoksa ve DOM'da varsa güncelle
                        if (domQ.options && domQ.options.length > 0 && (!questions[existingIdx].options || questions[existingIdx].options.length === 0)) {
                            questions[existingIdx].options = domQ.options;
                        }
                        questions[existingIdx].type = domQ.type || questions[existingIdx].type;
                    } else {
                        // DOM'da bulunup FB_PUBLIC_LOAD_DATA_'da bulunmayanları ekle
                        questions.push(domQ);
                    }
                });
            }
        } catch (e) {
        }

        return questions;
    }

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "tara") {
            logEkle("🔍 Form tarama işlemi başlatıldı...", "info").then(() => {
                return scanFormunuDetayli();
            }).then(questions => {
                logEkle(`✅ Tarama tamamlandı: ${questions.length} adet soru algılandı.`, "ok");
                sendResponse({ status: "ok", questions: questions });
            }).catch(err => {
                logEkle(`❌ Tarama başarısız oldu: ${err.message}`, "err");
                sendResponse({ status: "error", message: err.message });
            });
            return true;
        }
    });

    const baglantiVerisi = await chrome.storage.local.get({ hedefLink: '', botAktif: false });
    if (!baglantiVerisi.botAktif) return;

    const kaydedilenId = extractFormId(baglantiVerisi.hedefLink);
    const mevcutId = extractFormId(window.location.href);
    if (!kaydedilenId || kaydedilenId !== mevcutId) return;

    const watchdogTimer = setTimeout(async () => {
        const data = await chrome.storage.local.get({ botAktif: false });
        if (data.botAktif) {
            await sesCal('error');
            await logEkle("⚠️ Sayfa yanıt vermedi. Yeniden deneniyor...", "err");
            window.location.replace(window.location.origin + window.location.pathname + "?pli=1&t=" + Date.now());
        }
    }, 30000);

    const sayfaIcerigi = document.body.innerText.toLowerCase();
    if (sayfaIcerigi.includes("robot") || sayfaIcerigi.includes("captcha") || document.querySelector('iframe[src*="recaptcha"]')) {
        clearTimeout(watchdogTimer);
        await captchaTespitEdildi();
        return;
    }

    if (sayfaIcerigi.includes("ağ hatası") || sayfaIcerigi.includes("network error") || sayfaIcerigi.includes("yeniden dene")) {
        clearTimeout(watchdogTimer);
        await sesCal('error');
        await logEkle("🔌 Ağ hatası algılandı! 5 saniye sonra tekrar deneniyor.", "err");
        await bekle(5000);
        window.location.replace(window.location.origin + window.location.pathname + "?pli=1&t=" + Date.now());
        return;
    }

    const sayfaMetni = document.body.innerText;
    const formBitti = sayfaMetni.includes("Yanıtınız kaydedildi") ||
        sayfaMetni.includes("Başka bir yanıt gönder") ||
        sayfaMetni.includes("Yanıtınız alındı");

    if (formBitti) {
        clearTimeout(watchdogTimer);

        // --- GENEL TOPLAM EKLENEN KISIM BURASI ---
        const data = await chrome.storage.local.get({
            sayacToplam: 0, sayacErkek: 0, sayacKadin: 0,
            genelToplam: 0, genelErkek: 0, genelKadin: 0,
            sonSecilenCinsiyet: 'erkek', hedefAdet: 10,
            aktifSablon: '',
            sablonlar: [],
            gonderimZamanlari: [],
            botBaslangicZamani: 0
        });

        const cinsiYazi = data.sonSecilenCinsiyet === 'erkek' ? 'Erkek' : 'Kadın';
        await logEkle(`✅ Form Gönderildi (${cinsiYazi})`, 'ok');

        // Hız hesaplaması için zaman damgası kaydet
        const simdi = Date.now();
        const zamanlari = [...(data.gonderimZamanlari || []), simdi].slice(-50); // Son 50 gönderimi tut

        const guncelleme = {
            sayacToplam: data.sayacToplam + 1,
            sayacErkek: data.sayacErkek + (data.sonSecilenCinsiyet === 'erkek' ? 1 : 0),
            sayacKadin: data.sayacKadin + (data.sonSecilenCinsiyet === 'kadin' ? 1 : 0),
            genelToplam: (data.genelToplam || 0) + 1,
            genelErkek: (data.genelErkek || 0) + (data.sonSecilenCinsiyet === 'erkek' ? 1 : 0),
            genelKadin: (data.genelKadin || 0) + (data.sonSecilenCinsiyet === 'kadin' ? 1 : 0),
            botAktif: true,
            gonderimZamanlari: zamanlari
        };

        if (data.aktifSablon && data.sablonlar && data.sablonlar.length > 0) {
            const yeniSablonlar = [...data.sablonlar];
            const idx = yeniSablonlar.findIndex(s => s.isim === data.aktifSablon);
            if (idx > -1) {
                yeniSablonlar[idx].sayacToplam = guncelleme.sayacToplam;
                yeniSablonlar[idx].sayacErkek = guncelleme.sayacErkek;
                yeniSablonlar[idx].sayacKadin = guncelleme.sayacKadin;
                yeniSablonlar[idx].genelToplam = guncelleme.genelToplam;
                yeniSablonlar[idx].genelErkek = guncelleme.genelErkek;
                yeniSablonlar[idx].genelKadin = guncelleme.genelKadin;
                guncelleme.sablonlar = yeniSablonlar;
            }
        }

        if (guncelleme.sayacToplam >= data.hedefAdet) {
            guncelleme.botAktif = false;
            await sesCal('victory');
            chrome.runtime.sendMessage({
                action: "bildirimGonder",
                msg: `İşlem tamamlandı! Hedeflenen ${data.hedefAdet} adet form başarıyla gönderildi.`
            });
            await logEkle(`🎯 Hedefe ulaşıldı (${data.hedefAdet}), bot durduruldu.`, 'info');
        } else {
            await sesCal('success');
        }

        await chrome.storage.local.set(guncelleme);

        if (guncelleme.botAktif) {
            await bekle(insansiGecikme(2000));

            try {
                window.localStorage.clear();
                window.sessionStorage.clear();
                await logEkle("🧹 Oturum kalıntıları temizlendi.", "info");
            } catch (err) { console.log("Oturum temizleme hatası", err); }

            chrome.runtime.sendMessage({ action: "userAgentDegistir" }, async (response) => {
                let kisaUA = response.ua.length > 30 ? response.ua.substring(0, 30) + "..." : response.ua;
                await logEkle(`🎭 Kimlik Değişti: ${kisaUA}`, "info");

                document.body.innerHTML = '';
                window.location.replace(window.location.origin + window.location.pathname + "?pli=1&t=" + Date.now());
            });
        }
        return;
    }

    const ayarlar = await chrome.storage.local.get({
        hedefSik: 'random', hedefMenu: 'random',
        gecikmeMs: 500,
        ozelKurallar: {},
        botBaslangicZamani: 0
    });

    // Bot başlangıç zamanını kaydet (henüz kaydedilmemişse)
    if (!ayarlar.botBaslangicZamani) {
        await chrome.storage.local.set({ botBaslangicZamani: Date.now() });
    }

    let secilenCinsiyet = 'random';
    const tabanGecikme = ayarlar.gecikmeMs || 500;

    if (secilenCinsiyet === 'random') {
        const stats = await chrome.storage.local.get({ sayacToplam: 0 });
        secilenCinsiyet = (stats.sayacToplam % 2 === 0) ? 'erkek' : 'kadin';
    }
    await chrome.storage.local.set({ sonSecilenCinsiyet: secilenCinsiyet });

    await bekle(insansiGecikme(tabanGecikme));

    const rawBlocks = Array.from(document.querySelectorAll('.Qr7Oae, [role="listitem"], .geS54d, [data-item-id]'));
    const soruBloklari = [];


    rawBlocks.forEach(block => {
        const isContained = soruBloklari.some(b => b.contains(block));
        const containsExisting = soruBloklari.some(b => block.contains(b));
        if (!isContained) {
            if (containsExisting) {
                const idx = soruBloklari.findIndex(b => block.contains(b));
                soruBloklari[idx] = block;
            } else {
                soruBloklari.push(block);
            }
        }
    });

    for (const soru of soruBloklari) {
        let rows = Array.from(soru.querySelectorAll('[role="row"]')).filter(r => r.querySelector('[role="rowheader"]'));
        if (rows.length === 0) {
            const rowContainers = Array.from(soru.querySelectorAll('[role="radiogroup"], [role="group"]'));
            if (rowContainers.length > 1) {
                rows = rowContainers;
            }
        }
        if (rows.length > 0) {
            for (const row of rows) {
                let rowTitleOriginal = "";
                const rowHeader = row.querySelector('[role="rowheader"]');
                if (rowHeader) {
                    rowTitleOriginal = temizleSoruMetni(rowHeader.innerText);
                } else {
                    const ariaLabel = row.getAttribute('aria-label');
                    if (ariaLabel) {
                        rowTitleOriginal = temizleSoruMetni(ariaLabel);
                    } else {
                        const labelledBy = row.getAttribute('aria-labelledby');
                        if (labelledBy) {
                            const labelEl = document.getElementById(labelledBy);
                            if (labelEl) {
                                rowTitleOriginal = temizleSoruMetni(labelEl.innerText);
                            }
                        }
                    }
                }
                if (!rowTitleOriginal) continue;

                const secenekler = Array.from(row.querySelectorAll('[role="radio"], [role="checkbox"]'));
                if (secenekler.length === 0) continue;

                let rowHalledildi = false;
                const kural = ayarlar.ozelKurallar ? ayarlar.ozelKurallar[rowTitleOriginal] : null;

                if (kural && kural.rule !== "default") {
                    if (kural.rule === "random") {
                        const secilecekSik = secenekler[Math.floor(Math.random() * secenekler.length)];
                        if (secilecekSik) secilecekSik.click();
                        rowHalledildi = true;
                    } else {
                        const hedefOptionText = kural.rule;
                        let secenekBulundu = false;
                        for (const secenek of secenekler) {
                            let optText = secenek.getAttribute('data-value') || "";
                            if (!optText) {
                                const ariaLabel = secenek.getAttribute('aria-label');
                                if (ariaLabel) {
                                    optText = extractColumnTitle(ariaLabel, rowTitleOriginal);
                                }
                            }

                            if (optText.toLowerCase().trim() === hedefOptionText.toLowerCase().trim()) {
                                secenek.click();
                                secenekBulundu = true;
                                break;
                            }
                        }
                        if (secenekBulundu) {
                            rowHalledildi = true;
                        }
                    }
                }

                if (!rowHalledildi) {
                    let secilecekSik = null;
                    if (ayarlar.hedefSik === 'random') {
                        secilecekSik = secenekler[Math.floor(Math.random() * secenekler.length)];
                    } else {
                        const hedefIndex = ayarlar.hedefSik - 1;
                        secilecekSik = secenekler[hedefIndex] || secenekler[secenekler.length - 1];
                    }
                    if (secilecekSik) secilecekSik.click();
                }
            }
            continue;
        }

        const secenekler = Array.from(soru.querySelectorAll('[role="radio"], [role="checkbox"]'));
        const metinKutulari = Array.from(soru.querySelectorAll('input[type="text"], input[type="email"], textarea'));

        if (secenekler.length === 0 && metinKutulari.length === 0) continue;

        const soruMetniElement = soru.querySelector('[role="heading"], .M7eMe');
        const soruMetniOriginal = soruMetniElement ? temizleSoruMetni(soruMetniElement.innerText) : "";
        const soruMetni = soruMetniOriginal.toLowerCase();

        let ozelSoruHalledildi = false;

        const kural = ayarlar.ozelKurallar ? ayarlar.ozelKurallar[soruMetniOriginal] : null;
        if (kural && kural.rule !== "default") {
            if (secenekler.length > 0) {
                if (kural.rule === "random") {
                    const secilecekSik = secenekler[Math.floor(Math.random() * secenekler.length)];
                    if (secilecekSik) {
                        secilecekSik.click();
                        const optInput = findOptionTextInput(secilecekSik);
                        if (optInput) {
                            await insansiYaz(optInput, "Diğer");
                        }
                    }
                    ozelSoruHalledildi = true;
                } else {
                    const hedefOptionText = kural.rule;
                    let secenekBulundu = false;
                    for (const secenek of secenekler) {
                        let yazi = "";
                        const ariaLabel = secenek.getAttribute('aria-label');
                        if (ariaLabel) {
                            yazi = extractColumnTitle(ariaLabel, soruMetniOriginal);
                        }
                        if (!yazi) {
                            yazi = secenek.getAttribute('data-value') || "";
                        }
                        if (!yazi) {
                            const alan = secenek.closest('label') || secenek.parentElement || secenek;
                            yazi = alan.innerText ? alan.innerText.trim() : "";
                        }

                        if (yazi.toLowerCase().trim() === hedefOptionText.toLowerCase().trim()) {
                            secenek.click();
                            const optInput = findOptionTextInput(secenek);
                            if (optInput) {
                                await insansiYaz(optInput, "Diğer");
                            }
                            secenekBulundu = true;
                            break;
                        }
                    }
                    if (secenekBulundu) {
                        ozelSoruHalledildi = true;
                    }
                }
            } else if (metinKutulari.length > 0) {
                let yazilacakMetin = "";
                if (kural.rule === "isim_soyisim" || kural.rule === "isim_erkek" || kural.rule === "isim_kadin" || kural.rule === "soyisim") {
                    const erkekIsimleri = ["Ahmet", "Mehmet", "Mustafa", "Ali", "Can", "Burak", "Emre", "Hasan", "Onur", "Oğuz", "Berk", "Kaan", "Cem"];
                    const kadinIsimleri = ["Ayşe", "Fatma", "Zeynep", "Elif", "Merve", "Gizem", "Ceren", "Eda", "Büşra", "Selin", "Melis", "Buse", "Derya"];
                    const soyisimler = ["Yılmaz", "Kaya", "Demir", "Çelik", "Şahin", "Yıldız", "Öztürk", "Aydın", "Özdemir", "Arslan", "Doğan", "Kılıç", "Çetin", "Kara"];

                    let cins = secilenCinsiyet;
                    if (kural.rule === "isim_erkek") cins = "erkek";
                    if (kural.rule === "isim_kadin") cins = "kadin";

                    const kullanilacakIsimler = cins === 'erkek' ? erkekIsimleri : kadinIsimleri;
                    const rastgeleIsim = kullanilacakIsimler[Math.floor(Math.random() * kullanilacakIsimler.length)];
                    const rastgeleSoyisim = soyisimler[Math.floor(Math.random() * soyisimler.length)];

                    if (kural.rule === "soyisim") {
                        yazilacakMetin = rastgeleSoyisim;
                    } else {
                        yazilacakMetin = rastgeleIsim + " " + rastgeleSoyisim;
                    }
                } else if (kural.rule === "ozel") {
                    yazilacakMetin = kural.customValue || "";
                }

                for (const kutu of metinKutulari) {
                    await insansiYaz(kutu, yazilacakMetin);
                }
                ozelSoruHalledildi = true;
            }
        }

        if (!ozelSoruHalledildi && secenekler.length > 0) {
            for (const secenek of secenekler) {
                let yazi = "";
                const ariaLabel = secenek.getAttribute('aria-label');
                if (ariaLabel) {
                    yazi = extractColumnTitle(ariaLabel, soruMetniOriginal);
                }
                if (!yazi) {
                    yazi = secenek.getAttribute('data-value') || "";
                }
                if (!yazi) {
                    const alan = secenek.closest('label') || secenek.parentElement || secenek;
                    yazi = alan.innerText ? alan.innerText.trim() : "";
                }

                yazi = yazi.toLowerCase();
                const erkekMi = yazi === 'erkek' || yazi === 'male' || yazi === 'bay' || yazi === 'adam';
                const kadinMi = yazi === 'kadın' || yazi === 'kadin' || yazi === 'female' || yazi === 'bayan' || yazi === 'kız' || yazi === 'kiz';

                if ((secilenCinsiyet === 'erkek' && erkekMi) || (secilenCinsiyet === 'kadin' && kadinMi)) {
                    secenek.click();
                    const optInput = findOptionTextInput(secenek);
                    if (optInput) {
                        await insansiYaz(optInput, "Diğer");
                    }
                    ozelSoruHalledildi = true;
                    break;
                }
            }

            if (!ozelSoruHalledildi && (soruMetni.includes("sınıf") || soruMetni.includes("sinif") || soruMetni.includes("class"))) {
                const rastgeleSinifIndex = Math.floor(Math.random() * secenekler.length);
                const secilecekSik = secenekler[rastgeleSinifIndex];
                if (secilecekSik) {
                    secilecekSik.click();
                    const optInput = findOptionTextInput(secilecekSik);
                    if (optInput) {
                        await insansiYaz(optInput, "Diğer");
                    }
                    ozelSoruHalledildi = true;
                }
            }

            if (!ozelSoruHalledildi) {
                let secilecekSik = null;
                if (ayarlar.hedefSik === 'random') {
                    secilecekSik = secenekler[Math.floor(Math.random() * secenekler.length)];
                } else {
                    const hedefIndex = ayarlar.hedefSik - 1;
                    secilecekSik = secenekler[hedefIndex] || secenekler[secenekler.length - 1];
                }
                if (secilecekSik) {
                    secilecekSik.click();
                    const optInput = findOptionTextInput(secilecekSik);
                    if (optInput) {
                        await insansiYaz(optInput, "Diğer");
                    }
                }
                ozelSoruHalledildi = true;
            }
        }

        if (!ozelSoruHalledildi && metinKutulari.length > 0) {
            const isimSorusuMu = soruMetni.match(/\b(ad|adı|adınız|isim|isminiz|soyad|soyadınız|name|first name|last name)\b/i);
            const yasSorusuMu = soruMetni.match(/\b(yas|yaş|yaşınız|yasiniz|age)\b/i) || soruMetni.includes("yaş") || soruMetni.includes("yas");
            const emailSorusuMu = soruMetni.includes("email") || soruMetni.includes("e-posta") || soruMetni.includes("eposta") || soruMetni.includes("mail");
            const telSorusuMu = soruMetni.includes("telefon") || soruMetni.includes("phone") || soruMetni.includes("gsm") || soruMetni.includes("tel");
            const tcknSorusuMu = soruMetni.includes("tc kimlik") || soruMetni.includes("t.c.") || soruMetni.includes("kimlik no") || soruMetni.includes("tckn");
            const dogumSorusuMu = soruMetni.includes("doğum") || soruMetni.includes("dogum");

            for (const kutu of metinKutulari) {
                let yazilacakMetin = "";

                if (isimSorusuMu) {
                    const erkekIsimleri = ["Ahmet", "Mehmet", "Mustafa", "Ali", "Can", "Burak", "Emre", "Hasan", "Onur", "Oğuz", "Berk", "Kaan", "Cem"];
                    const kadinIsimleri = ["Ayşe", "Fatma", "Zeynep", "Elif", "Merve", "Gizem", "Ceren", "Eda", "Büşra", "Selin", "Melis", "Buse", "Derya"];
                    const soyisimler = ["Yılmaz", "Kaya", "Demir", "Çelik", "Şahin", "Yıldız", "Öztürk", "Aydın", "Özdemir", "Arslan", "Doğan", "Kılıç", "Çetin", "Kara"];

                    const kullanilacakIsimler = secilenCinsiyet === 'erkek' ? erkekIsimleri : kadinIsimleri;
                    const rastgeleIsim = kullanilacakIsimler[Math.floor(Math.random() * kullanilacakIsimler.length)];
                    const rastgeleSoyisim = soyisimler[Math.floor(Math.random() * soyisimler.length)];

                    if (soruMetni.includes("soyad") && !soruMetni.includes("ad")) {
                        yazilacakMetin = rastgeleSoyisim;
                    } else {
                        yazilacakMetin = rastgeleIsim + " " + rastgeleSoyisim;
                    }
                } else if (yasSorusuMu || emailSorusuMu || telSorusuMu || tcknSorusuMu || dogumSorusuMu) {
                    yazilacakMetin = generateLocalResponse(soruMetniOriginal);
                } else {
                    yazilacakMetin = "";
                }

                if (yazilacakMetin !== '') {
                    await insansiYaz(kutu, yazilacakMetin);
                }
            }
            ozelSoruHalledildi = true;
        }

    }

    const acilirMenuler = document.querySelectorAll('[jsname="LgbsSe"]');
    for (const menu of acilirMenuler) {
        const soruKapsayici = menu.closest('[role="listitem"], .geS54d, [data-item-id]');
        const soruMetniElement = soruKapsayici ? soruKapsayici.querySelector('[role="heading"], .M7eMe') : null;
        const soruMetniOriginal = soruMetniElement ? temizleSoruMetni(soruMetniElement.innerText) : "";
        const soruMetni = soruMetniOriginal.toLowerCase();
        const sinifMenusuMu = soruMetni.includes("sınıf") || soruMetni.includes("sinif") || soruMetni.includes("class");

        const kural = ayarlar.ozelKurallar ? ayarlar.ozelKurallar[soruMetniOriginal] : null;

        menu.click();
        await bekle(insansiGecikme(Math.max(150, Math.round(tabanGecikme * 0.2))));

        const secenekler = Array.from(document.querySelectorAll('[role="option"]')).filter(opt => opt.getAttribute('data-value') !== "");
        if (secenekler.length === 0) continue;

        let optionClicked = false;
        if (kural && kural.rule !== "default") {
            if (kural.rule === "random") {
                secenekler[Math.floor(Math.random() * secenekler.length)].click();
                optionClicked = true;
            } else {
                const hedefOptionText = kural.rule;
                for (const opt of secenekler) {
                    const yazi = opt.innerText ? opt.innerText.trim() : "";
                    if (yazi.toLowerCase().trim() === hedefOptionText.toLowerCase().trim()) {
                        opt.click();
                        optionClicked = true;
                        break;
                    }
                }
            }
        }

        if (!optionClicked) {
            if (sinifMenusuMu || ayarlar.hedefMenu === 'random') {
                secenekler[Math.floor(Math.random() * secenekler.length)].click();
            } else {
                const hedefOpt = secenekler[ayarlar.hedefMenu - 1] || secenekler[secenekler.length - 1];
                if (hedefOpt) hedefOpt.click();
            }
        }
    }

    await bekle(insansiGecikme(tabanGecikme));
    const buttons = document.querySelectorAll('[role="button"]');
    let hedefButon = null;

    for (const btn of buttons) {
        const yazi = btn.innerText ? btn.innerText.toLowerCase().trim() : "";
        if (yazi.includes("sonraki") || yazi.includes("ileri") || yazi.includes("next")) {
            hedefButon = btn;
            break;
        }
    }

    if (!hedefButon) {
        for (const btn of buttons) {
            const yazi = btn.innerText ? btn.innerText.toLowerCase().trim() : "";
            if (yazi.includes("gönder") || yazi.includes("submit")) {
                hedefButon = btn;
                break;
            }
        }
    }

    if (hedefButon) hedefButon.click();
})();
