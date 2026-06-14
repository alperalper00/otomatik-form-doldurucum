document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get({
        hedefLink: '',
        varsayilanMetin: '',
        hedefSik: 'random',
        bandwidthCinsiyet: 'random',
        gecikmeMs: 500,
        hedefAdet: 10,
        sayacToplam: 0,
        sayacErkek: 0,
        sayacKadin: 0,
        botAktif: false,
        islemGecmisi: [] 
    }, (data) => {
        document.getElementById('hedefLinkInput').value = data.hedefLink;
        document.getElementById('varsayilanMetin').value = data.varsayilanMetin;
        document.getElementById('sikSecimi').value = data.hedefSik;
        document.getElementById('cinsiyetSecimi').value = data.bandwidthCinsiyet;
        document.getElementById('hedefAdetInput').value = data.hedefAdet;

        document.getElementById('statToplam').innerText = data.sayacToplam;
        document.getElementById('statErkek').innerText = data.sayacErkek;
        document.getElementById('statKadin').innerText = data.sayacKadin;

        const slider = document.getElementById('delaySlider');
        slider.value = data.gecikmeMs;
        updateSliderUI(data.gecikmeMs);
        
        gorselGuncelleBotButonu(data.botAktif);
        loglariCiz(data.islemGecmisi);
    });
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        if (changes.sayacToplam) {
            document.getElementById('statToplam').innerText = changes.sayacToplam.newValue;
        }
        if (changes.sayacErkek) {
            document.getElementById('statErkek').innerText = changes.sayacErkek.newValue;
        }
        if (changes.sayacKadin) {
            document.getElementById('statKadin').innerText = changes.sayacKadin.newValue;
        }
        if (changes.islemGecmisi) {
            loglariCiz(changes.islemGecmisi.newValue);
        }
        if (changes.botAktif !== undefined) {
            gorselGuncelleBotButonu(changes.botAktif.newValue);
        }
    }
});

function loglariCiz(logs) {
    const box = document.getElementById('logBox');
    box.innerHTML = '';
    
    if (!logs || logs.length === 0) {
        box.innerHTML = '<div class="log-item" style="justify-content:center; color: var(--muted);">Henüz işlem yok</div>';
        return;
    }
    
    logs.forEach(log => {
        const el = document.createElement('div');
        el.className = `log-item ${log.type}`;
        el.innerHTML = `<span class="log-msg">${log.msg}</span> <span class="log-time">${log.time}</span>`;
        box.appendChild(el);
    });
}

function uiLogEkle(msg, type) {
    chrome.storage.local.get({ islemGecmisi: [] }, (data) => {
        const now = new Date();
        const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0') + ':' + now.getSeconds().toString().padStart(2, '0');
        const yeniLog = { time: timeStr, msg: msg, type: type };
        
        let gecmis = [yeniLog, ...data.islemGecmisi].slice(0, 20); 
        chrome.storage.local.set({ islemGecmisi: gecmis });
    });
}

function updateSliderUI(val) {
    const slider = document.getElementById('delaySlider');
    const min = parseInt(slider.min);
    const max = parseInt(slider.max);
    const pct = ((val - min) / (max - min)) * 100;

    document.getElementById('delayBadge').textContent = val + ' ms';
    document.getElementById('sliderFill').style.width = pct + '%';
}

document.getElementById('delaySlider').addEventListener('input', (e) => {
    updateSliderUI(parseInt(e.target.value));
});

function setStatus(msg, type = '') {
    const el = document.getElementById('durumMetni');
    el.textContent = msg;
    el.className = 'status-bar ' + type;
    if (type === 'ok') {
        setTimeout(() => {
            el.textContent = 'Hazır';
            el.className = 'status-bar';
        }, 2000);
    }
}

function gorselGuncelleBotButonu(aktifMi) {
    const btn = document.getElementById('toggleBotBtn');
    if (aktifMi) {
        btn.textContent = '🛑 BOTU DURDUR';
        btn.style.background = 'var(--red)';
        btn.style.color = '#fff';
        btn.style.boxShadow = '0 0 10px rgba(255, 68, 68, 0.4)';
    } else {
        btn.textContent = '🟢 BOTU BAŞLAT';
        btn.style.background = 'var(--green)';
        btn.style.color = '#000';
        btn.style.boxShadow = '0 0 10px rgba(0, 230, 118, 0.4)';
    }
}

document.getElementById('toggleBotBtn').addEventListener('click', () => {
    chrome.storage.local.get({ botAktif: false, hedefLink: '' }, (data) => {
        const yeniDurum = !data.botAktif; 
        
        let kayitVerisi = { botAktif: yeniDurum };
        if (yeniDurum) {
            kayitVerisi.sayacToplam = 0;
            kayitVerisi.sayacErkek = 0;
            kayitVerisi.sayacKadin = 0;
        }

        chrome.storage.local.set(kayitVerisi, () => {
            if (yeniDurum) {
                setStatus('Bot Açıldı! Sayfa yenileniyor...', 'ok');
                uiLogEkle('Bot sistem başlatıldı.', 'info');
                
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    const aktifTab = tabs[0];
                    if (aktifTab && aktifTab.url.includes("docs.google.com/forms")) {
                        chrome.tabs.reload(aktifTab.id);
                    }
                });
            } else {
                setStatus('Bot Durduruldu.', 'err');
                uiLogEkle('Bot durduruldu.', 'err');
            }
        });
    });
});

document.getElementById('kaydetBtn').addEventListener('click', (e) => {
    const btn = e.target;
    const link = document.getElementById('hedefLinkInput').value.trim();
    const metin = document.getElementById('varsayilanMetin').value.trim();
    
    if (link === "" || !link.startsWith("https://docs.google.com/forms/d/")) {
        setStatus('Geçersiz Form Linki!', 'err');
        
        const eskiYazi = btn.textContent;
        btn.textContent = 'HATA: LİNK GEÇERSİZ!';
        btn.style.background = 'var(--red)';
        btn.style.color = '#fff';
        setTimeout(() => {
            btn.textContent = eskiYazi;
            btn.style.background = 'var(--accent)';
        }, 2000);
        return;
    }

    const rawSik = document.getElementById('sikSecimi').value;
    const sik = rawSik === 'random' ? 'random' : parseInt(rawSik);
    
    const cinsiyet = document.getElementById('cinsiyetSecimi').value;
    const ortalamaGecikme = parseInt(document.getElementById('delaySlider').value);
    let hedefAdeti = parseInt(document.getElementById('hedefAdetInput').value) || 10;

    if (hedefAdeti > 50) {
        setStatus('Maksimum 50 adet belirleyebilirsiniz!', 'err');
        document.getElementById('hedefAdetInput').value = 50; 
        
        const eskiYazi = btn.textContent;
        btn.textContent = 'HATA: MAX 50 OLMALI!';
        btn.style.background = 'var(--red)';
        btn.style.color = '#fff';
        setTimeout(() => {
            btn.textContent = eskiYazi;
            btn.style.background = 'var(--accent)';
        }, 2000);
        return; 
    }

    chrome.storage.local.set({
        hedefLink: link,
        varsayilanMetin: metin,
        hedefSik: sik,
        bandwidthCinsiyet: cinsiyet,
        gecikmeMs: ortalamaGecikme,
        hedefAdet: hedefAdeti
    }, () => {
        setStatus('Ayarlar kaydedildi ✓', 'ok');
        uiLogEkle('Ayarlar güncellendi.', 'info');
        
        const eskiYazi = btn.textContent;
        btn.textContent = 'KAYDEDİLDİ ✓';
        btn.style.background = 'var(--green)';
        btn.style.color = '#000';
        
        setTimeout(() => {
            btn.textContent = eskiYazi;
            btn.style.background = 'var(--accent)';
            btn.style.color = '#fff';
        }, 2000);
    });
});

document.getElementById('sifirlaBtn').addEventListener('click', () => {
    chrome.storage.local.set({ sayacToplam: 0, sayacErkek: 0, sayacKadin: 0, islemGecmisi: [] }, () => {
        document.getElementById('statToplam').innerText = '0';
        document.getElementById('statErkek').innerText = '0';
        document.getElementById('statKadin').innerText = '0';
        
        const box = document.getElementById('logBox');
        box.innerHTML = '<div class="log-item" style="justify-content:center; color: var(--muted);">Henüz işlem yok</div>';
        
        setStatus('Sıfırlandı ✓', 'ok');
    });
});
