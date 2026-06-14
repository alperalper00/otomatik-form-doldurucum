(async function () {
    // Viewport spoofing kısmı Google CSP engeline takıldığı için kaldırıldı.
    // Eklentinin asıl gizliliği (User-Agent rotasyonu) background.js üzerinden çalışmaya devam ediyor.

    function extractFormId(url) {
        if (!url) return null;
        const match = url.match(/\/d\/(?:e\/)?([a-zA-Z0-9_-]+)/);
        return match ? match[1] : null;
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
        await chrome.storage.local.set({ botAktif: false });
        await logEkle("🚨 CAPTCHA TESPİT EDİLDİ! DURDURULDU", "err");
        console.error("Form Botu: Captcha yakalandı, bot durduruldu!");
    }

    const baglantiVerisi = await chrome.storage.local.get({ hedefLink: '', botAktif: false });
    if (!baglantiVerisi.botAktif) return;

    const kaydedilenId = extractFormId(baglantiVerisi.hedefLink);
    const mevcutId = extractFormId(window.location.href);
    if (!kaydedilenId || kaydedilenId !== mevcutId) return;

    const watchdogTimer = setTimeout(async () => {
        const data = await chrome.storage.local.get({ botAktif: false });
        if (data.botAktif) {
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
        
        const data = await chrome.storage.local.get({ 
            sayacToplam: 0, sayacErkek: 0, sayacKadin: 0, 
            sonSecilenCinsiyet: 'erkek', hedefAdet: 10 
        });

        const cinsiYazi = data.sonSecilenCinsiyet === 'erkek' ? 'Erkek' : 'Kadın';
        await logEkle(`✅ Form Gönderildi (${cinsiYazi})`, 'ok');

        const guncelleme = {
            sayacToplam: data.sayacToplam + 1,
            sayacErkek: data.sayacErkek + (data.sonSecilenCinsiyet === 'erkek' ? 1 : 0),
            sayacKadin: data.sayacKadin + (data.sonSecilenCinsiyet === 'kadin' ? 1 : 0),
            botAktif: true
        };

        if (guncelleme.sayacToplam >= data.hedefAdet) {
            guncelleme.botAktif = false;
            chrome.runtime.sendMessage({
                action: "bildirimGonder",
                msg: `İşlem tamamlandı! Hedeflenen ${data.hedefAdet} adet form başarıyla gönderildi.`
            });
            await logEkle(`🎯 Hedefe ulaşıldı (${data.hedefAdet}), bot durduruldu.`, 'info');
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
        bandwidthCinsiyet: 'random', gecikmeMs: 500, varsayilanMetin: '' 
    });

    let secilenCinsiyet = ayarlar.bandwidthCinsiyet || 'random';
    const tabanGecikme = ayarlar.gecikmeMs || 500;

    if (secilenCinsiyet === 'random') {
        secilenCinsiyet = Math.random() < 0.5 ? 'erkek' : 'kadin';
    }
    await chrome.storage.local.set({ sonSecilenCinsiyet: secilenCinsiyet });

    await bekle(insansiGecikme(tabanGecikme));

    const soruBloklari = document.querySelectorAll('[role="listitem"], .geS54d, [data-item-id]');
    
    for (const soru of soruBloklari) {
        const secenekler = Array.from(soru.querySelectorAll('[role="radio"], [role="checkbox"]'));
        const metinKutulari = Array.from(soru.querySelectorAll('input[type="text"], input[type="email"], textarea'));

        if (secenekler.length === 0 && metinKutulari.length === 0) continue;

        const soruMetniElement = soru.querySelector('[role="heading"], .M7eMe');
        const soruMetni = soruMetniElement ? soruMetniElement.innerText.toLowerCase().trim() : "";

        let ozelSoruHalledildi = false;
        
        if (metinKutulari.length > 0) {
            const isimSorusuMu = soruMetni.match(/\b(ad|adı|adınız|isim|isminiz|soyad|soyadınız|name|first name|last name)\b/i);

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
                } else {
                    yazilacakMetin = ayarlar.varsayilanMetin;
                }

                if (yazilacakMetin !== '') {
                    await insansiYaz(kutu, yazilacakMetin);
                }
            }
            ozelSoruHalledildi = true;
        }

        if (!ozelSoruHalledildi && secenekler.length > 0) {
            for (const secenek of secenekler) {
                const alan = secenek.closest('label') || secenek.parentElement || secenek;
                const yazi = alan.innerText ? alan.innerText.toLowerCase().trim() : "";
                const erkekMi = yazi === 'erkek' || yazi === 'male';
                const kadinMi = yazi === 'kadın' || yazi === 'kadin' || yazi === 'female';

                if ((secilenCinsiyet === 'erkek' && erkekMi) || (secilenCinsiyet === 'kadin' && kadinMi)) {
                    secenek.click();
                    ozelSoruHalledildi = true;
                    break;
                }
            }

            if (!ozelSoruHalledildi && (soruMetni.includes("sınıf") || soruMetni.includes("sinif") || soruMetni.includes("class"))) {
                const rastgeleSinifIndex = Math.floor(Math.random() * secenekler.length);
                if (secenekler[rastgeleSinifIndex]) {
                    secenekler[rastgeleSinifIndex].click();
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
                if (secilecekSik) secilecekSik.click();
            }
        }
    }

    const acilirMenuler = document.querySelectorAll('[jsname="LgbsSe"]');
    for (const menu of acilirMenuler) {
        const soruKapsayici = menu.closest('[role="listitem"], .geS54d, [data-item-id]');
        const soruMetniElement = soruKapsayici ? soruKapsayici.querySelector('[role="heading"], .M7eMe') : null;
        const soruMetni = soruMetniElement ? soruMetniElement.innerText.toLowerCase().trim() : "";
        const sinifMenusuMu = soruMetni.includes("sınıf") || soruMetni.includes("sinif") || soruMetni.includes("class");

        menu.click();
        await bekle(insansiGecikme(Math.max(150, Math.round(tabanGecikme * 0.2))));

        const secenekler = Array.from(document.querySelectorAll('[role="option"]')).filter(opt => opt.getAttribute('data-value') !== "");
        if (secenekler.length === 0) continue;

        if (sinifMenusuMu || ayarlar.hedefMenu === 'random') {
            secenekler[Math.floor(Math.random() * secenekler.length)].click();
        } else {
            const hedefOpt = secenekler[ayarlar.hedefMenu - 1] || secenekler[secenekler.length - 1];
            if (hedefOpt) hedefOpt.click();
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
