(function () {
    function extractFormId(url) {
        if (!url) return null;
        const match = url.match(/\/d\/(?:e\/)?([a-zA-Z0-9_-]+)/);
        return match ? match[1] : null;
    }

    chrome.storage.local.get({ hedefLink: '', botAktif: false }, (baglantiVerisi) => {
        
        if (!baglantiVerisi.botAktif) {
            return;
        }

        const kaydedilenId = extractFormId(baglantiVerisi.hedefLink);
        const mevcutId = extractFormId(window.location.href);

        if (!kaydedilenId || kaydedilenId !== mevcutId) {
            return;
        }

        function captchaTespitEdildi() {
            chrome.storage.local.set({ botAktif: false }, () => {
                chrome.storage.local.get({ islemGecmisi: [] }, (data) => {
                    const now = new Date();
                    const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0') + ':' + now.getSeconds().toString().padStart(2, '0');
                    const yeniLog = { time: timeStr, msg: "🚨 CAPTCHA TESPİT EDİLDİ! DURDURULDU", type: "err" };
                    chrome.storage.local.set({ islemGecmisi: [yeniLog, ...data.islemGecmisi].slice(0, 20) });
                });
                console.error("Form Botu: Captcha yakalandı, bot durduruldu!");
            });
        }

        const sayfaIcerigi = document.body.innerText.toLowerCase();
        if (sayfaIcerigi.includes("robot") || sayfaIcerigi.includes("captcha") || document.querySelector('iframe[src*="recaptcha"]')) {
            captchaTespitEdildi();
            return; 
        }

        const timerlar = [];

        function temizle() {
            timerlar.forEach(id => clearTimeout(id));
            timerlar.length = 0;
        }

        function bekle(fn, ms) {
            const id = setTimeout(fn, ms);
            timerlar.push(id);
            return id;
        }

        function insansiGecikme(baseMs) {
            const jitter = baseMs * 0.3; 
            return Math.floor(baseMs - jitter + Math.random() * (jitter * 2));
        }

        const sayfaMetni = document.body.innerText;
        const formBitti = sayfaMetni.includes("Yanıtınız kaydedildi") ||
                          sayfaMetni.includes("Başka bir yanıt gönder") ||
                          sayfaMetni.includes("Yanıtınız alındı");

        if (formBitti) {
            chrome.storage.local.get({ sayacToplam: 0, sayacErkek: 0, sayacKadin: 0, sonSecilenCinsiyet: 'erkek', islemGecmisi: [], hedefAdet: 10 }, (data) => {
                const now = new Date();
                const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0') + ':' + now.getSeconds().toString().padStart(2, '0');
                
                const cinsiYazi = data.sonSecilenCinsiyet === 'erkek' ? 'Erkek' : 'Kadın';
                const yeniLog = {
                    time: timeStr,
                    msg: `Başarılı Form (${cinsiYazi})`,
                    type: 'ok'
                };

                let yeniGecmis = [yeniLog, ...data.islemGecmisi].slice(0, 20); 

                const guncelleme = {
                    sayacToplam: data.sayacToplam + 1,
                    sayacErkek: data.sayacErkek + (data.sonSecilenCinsiyet === 'erkek' ? 1 : 0),
                    sayacKadin: data.sayacKadin + (data.sonSecilenCinsiyet === 'kadin' ? 1 : 0),
                    islemGecmisi: yeniGecmis 
                };

                // BİLDİRİM VE DURDURMA KONTROLÜ
                if (guncelleme.sayacToplam >= data.hedefAdet) {
                    guncelleme.botAktif = false;
                    chrome.runtime.sendMessage({
                        action: "bildirimGonder",
                        msg: `İşlem tamamlandı! Hedeflenen ${data.hedefAdet} adet form başarıyla gönderildi.`
                    });
                    
                    const yeniLogBotDurdu = {
                        time: timeStr,
                        msg: `Hedefe ulaşıldı (${data.hedefAdet}), bot durduruldu.`,
                        type: 'info'
                    };
                    guncelleme.islemGecmisi = [yeniLogBotDurdu, ...guncelleme.islemGecmisi].slice(0, 20);
                }

                chrome.storage.local.set(guncelleme, () => {
                    // Bot hedefe ulaştığı için durdurulduysa sayfa yenilenmesini engelle
                    if (guncelleme.botAktif === false) {
                        return;
                    }

                    bekle(() => {
                        temizle();
                        document.body.innerHTML = '';
                        window.location.replace(window.location.origin + window.location.pathname + "?pli=1&t=" + Date.now());
                    }, insansiGecikme(2000)); 
                });
            });
            return;
        }

        chrome.storage.local.get({ hedefSik: 'random', hedefMenu: 'random', bandwidthCinsiyet: 'random', gecikmeMs: 500, varsayilanMetin: '' }, (ayarlar) => {
            let secilenCinsiyet = ayarlar.bandwidthCinsiyet || 'random';
            const tabanGecikme = ayarlar.gecikmeMs || 500;

            if (secilenCinsiyet === 'random') {
                secilenCinsiyet = Math.random() < 0.5 ? 'erkek' : 'kadin';
            }

            chrome.storage.local.set({ sonSecilenCinsiyet: secilenCinsiyet });

            bekle(() => {
                const soruBloklari = document.querySelectorAll('[role="listitem"], .geS54d, [data-item-id]');
                
                soruBloklari.forEach((soru) => {
                    const secenekler = Array.from(soru.querySelectorAll('[role="radio"], [role="checkbox"]'));
                    const metinKutulari = Array.from(soru.querySelectorAll('input[type="text"], input[type="email"], textarea'));

                    if (secenekler.length === 0 && metinKutulari.length === 0) return;

                    const soruMetniElement = soru.querySelector('[role="heading"], .M7eMe');
                    const soruMetni = soruMetniElement ? soruMetniElement.innerText.toLowerCase().trim() : "";

                    let ozelSoruHalledildi = false;
                    
                    // ==========================================
                    // AKILLI METİN VE İSİM DOLDURMA MOTORU
                    // ==========================================
                    if (metinKutulari.length > 0) {
                        // Sorunun ad/soyad sorusu olup olmadığını kelime bazlı kontrol et
                        const isimSorusuMu = soruMetni.match(/\b(ad|adı|adınız|isim|isminiz|soyad|soyadınız|name|first name|last name)\b/i);

                        metinKutulari.forEach(kutu => {
                            let yazilacakMetin = "";

                            if (isimSorusuMu) {
                                // Rastgele İsim Havuzları
                                const erkekIsimleri = ["Ahmet", "Mehmet", "Mustafa", "Ali", "Can", "Burak", "Emre", "Hasan", "Onur", "Oğuz", "Berk", "Kaan", "Cem"];
                                const kadinIsimleri = ["Ayşe", "Fatma", "Zeynep", "Elif", "Merve", "Gizem", "Ceren", "Eda", "Büşra", "Selin", "Melis", "Buse", "Derya"];
                                const soyisimler = ["Yılmaz", "Kaya", "Demir", "Çelik", "Şahin", "Yıldız", "Öztürk", "Aydın", "Özdemir", "Arslan", "Doğan", "Kılıç", "Çetin", "Kara"];

                                const kullanilacakIsimler = secilenCinsiyet === 'erkek' ? erkekIsimleri : kadinIsimleri;
                                
                                const rastgeleIsim = kullanilacakIsimler[Math.floor(Math.random() * kullanilacakIsimler.length)];
                                const rastgeleSoyisim = soyisimler[Math.floor(Math.random() * soyisimler.length)];

                                // Soruda sadece soyad geçiyorsa sadece soyisim yaz
                                if (soruMetni.includes("soyad") && !soruMetni.includes("ad")) {
                                    yazilacakMetin = rastgeleSoyisim;
                                } else {
                                    yazilacakMetin = rastgeleIsim + " " + rastgeleSoyisim;
                                }
                            } else {
                                // İsim sorusu değilse, kullanıcının belirlediği varsayılan metni kullan
                                yazilacakMetin = ayarlar.varsayilanMetin;
                            }

                            if (yazilacakMetin !== '') {
                                kutu.focus(); 
                                kutu.value = yazilacakMetin; 
                                kutu.dispatchEvent(new Event('input', { bubbles: true }));
                                kutu.dispatchEvent(new Event('change', { bubbles: true }));
                                kutu.blur(); 
                            }
                        });
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
                            const rastgeleSınıfIndex = Math.floor(Math.random() * secenekler.length);
                            if (secenekler[rastgeleSınıfIndex]) {
                                secenekler[rastgeleSınıfIndex].click();
                                ozelSoruHalledildi = true;
                            }
                        }

                        if (!ozelSoruHalledildi) {
                            let secilecekSik = null;

                            if (ayarlar.hedefSik === 'random') {
                                const rastgeleIndex = Math.floor(Math.random() * secenekler.length);
                                secilecekSik = secenekler[rastgeleIndex];
                            } else {
                                const hedefIndex = ayarlar.hedefSik - 1;
                                secilecekSik = secenekler[hedefIndex] || secenekler[secenekler.length - 1];
                            }

                            if (secilecekSik) {
                                secilecekSik.click();
                            }
                        }
                    }
                });

                

                const acilirMenuler = document.querySelectorAll('[jsname="LgbsSe"]');
                acilirMenuler.forEach(menu => {
                    const soruKapsayici = menu.closest('[role="listitem"], .geS54d, [data-item-id]');
                    const soruMetniElement = soruKapsayici ? soruKapsayici.querySelector('[role="heading"], .M7eMe') : null;
                    const soruMetni = soruMetniElement ? soruMetniElement.innerText.toLowerCase().trim() : "";
                    const sinifMenusuMu = soruMetni.includes("sınıf") || soruMetni.includes("sinif") || soruMetni.includes("class");

                    menu.click();
                    bekle(() => {
                        const secenekler = Array.from(document.querySelectorAll('[role="option"]')).filter(opt => opt.getAttribute('data-value') !== "");
                        if (secenekler.length === 0) return;

                        if (sinifMenusuMu || ayarlar.hedefMenu === 'random') {
                            const rastgeleMenuIndex = Math.floor(Math.random() * secenekler.length);
                            secenekler[rastgeleMenuIndex].click();
                        } else {
                            let sayac = 0;
                            for (const opt of secenekler) {
                                sayac++;
                                if (sayac === ayarlar.hedefMenu) {
                                    opt.click();
                                    break;
                                }
                            }
                        }
                    }, insansiGecikme(Math.max(100, Math.round(tabanGecikme * 0.2)))); 
                });

                bekle(() => {
                    const buttons = document.querySelectorAll('[role="button"]');
                    let hedef = null;

                    for (const btn of buttons) {
                        const yazi = btn.innerText ? btn.innerText.toLowerCase().trim() : "";
                        if (yazi.includes("sonraki") || yazi.includes("ileri") || yazi.includes("next")) {
                            hedef = btn;
                            break;
                        }
                    }

                    if (!hedef) {
                        for (const btn of buttons) {
                            const yazi = btn.innerText ? btn.innerText.toLowerCase().trim() : "";
                            if (yazi.includes("gönder") || yazi.includes("submit")) {
                                hedef = btn;
                                break;
                            }
                        }
                    }

                    if (hedef) {
                        hedef.click();
                    }
                    temizle();
                }, insansiGecikme(tabanGecikme)); 

            }, insansiGecikme(tabanGecikme));
        });
    });
})();