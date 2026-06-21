document.addEventListener('DOMContentLoaded', () => {
    // Önce şifre durumunu kontrol et
    chrome.storage.local.get({ panelSifresi: '', sifreIlkKurulum: true, tema: 'karanlik', lisansDurumu: false }, (sifreData) => {
        // Temayı her durumda uygula (kilit ekranı da doğru temada görünsün)
        document.documentElement.setAttribute('data-theme', sifreData.tema);

        if (sifreData.lisansDurumu && sifreData.panelSifresi) {
            // Şifre var ve premium → Kilit ekranını göster
            document.body.classList.add('auth-ekrani');
            document.getElementById('kilidEkrani').style.display = 'flex';
            document.getElementById('mainContent').style.display = 'none';
            document.getElementById('sifreKurulumEkrani').style.display = 'none';
            document.getElementById('kilidSifreInput').focus();
        } else if (sifreData.lisansDurumu && sifreData.sifreIlkKurulum) {
            // İlk kullanım ve premium → Şifre kurulum ekranını göster
            document.body.classList.add('auth-ekrani');
            document.getElementById('sifreKurulumEkrani').style.display = 'flex';
            document.getElementById('mainContent').style.display = 'none';
            document.getElementById('kilidEkrani').style.display = 'none';
            document.getElementById('yeniSifreInput').focus();
        } else {
            // Şifre yok, atlanmış veya ücretsiz sürüm → Direkt aç
            sifreDogrulandi();
        }
    });

});

const LIMIT_SURESI_MS = 6 * 60 * 60 * 1000; // 6 saat (6 * 60 * 60 * 1000)
console.log("[Form Bot Popup] Aktif Limit Süresi MS: " + LIMIT_SURESI_MS);
const API_URL = 'http://localhost/backend/verify.php';

function sifreDogrulandi() {
    // Şifre ekranlarını gizle
    document.getElementById('kilidEkrani').style.display = 'none';
    document.getElementById('sifreKurulumEkrani').style.display = 'none';

    // Önce client_id ve lisansAnahtari al/üret
    chrome.storage.local.get({ clientId: '', lisansAnahtari: '' }, (data) => {
        let clientId = data.clientId;
        if (!clientId) {
            clientId = 'cl_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            chrome.storage.local.set({ clientId: clientId });
        }

        if (!data.lisansAnahtari) {
            // Lisans yok → Aktivasyon ekranını göster
            document.body.classList.add('auth-ekrani');
            document.getElementById('mainContent').style.display = 'none';
            document.getElementById('lisansAktivasyonEkrani').style.display = 'flex';
            document.getElementById('lisansKeyInput').focus();
            
            // Aktivasyon butonu dinleyicisi
            setupLicenseActivationListener(clientId);
        } else {
            // Lisans var → Sunucuda sorgula
            verifyLicenseOnServer(data.lisansAnahtari, clientId);
        }
    });
}

function handleVersionCheckResponse(data) {
    if (data && data.status === 'update_required') {
        document.body.classList.add('auth-ekrani');
        document.getElementById('kilidEkrani').style.display = 'none';
        document.getElementById('sifreKurulumEkrani').style.display = 'none';
        document.getElementById('lisansAktivasyonEkrani').style.display = 'none';
        document.getElementById('mainContent').style.display = 'none';
        
        const guncellemeEkrani = document.getElementById('guncellemeEkrani');
        if (guncellemeEkrani) {
            guncellemeEkrani.style.display = 'flex';
        }
        
        const guncellemeMetni = document.getElementById('guncellemeMetni');
        if (guncellemeMetni && data.message) {
            guncellemeMetni.textContent = data.message;
        }
        
        const guncellemeIndirBtn = document.getElementById('guncellemeIndirBtn');
        if (guncellemeIndirBtn && data.update_url) {
            guncellemeIndirBtn.href = data.update_url;
        }
        return true;
    }
    return false;
}

function verifyLicenseOnServer(licenseKey, clientId) {
    const badge = document.getElementById('lisansSureBadge');
    if (badge) {
        badge.textContent = 'Doğrulanıyor...';
        badge.style.color = 'var(--muted)';
    }

    chrome.storage.local.get({ deviceName: '' }, (localData) => {
        fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                license_key: licenseKey,
                client_id: clientId,
                client_name: localData.deviceName || '',
                version: chrome.runtime.getManifest().version
            })
        })
        .then(res => res.json())
        .then(data => {
            if (handleVersionCheckResponse(data)) return;
            if (data.status === 'success') {
                // Lisans geçerli
                chrome.storage.local.set({ lisansDurumu: true, lisansSonKullanma: data.expires_at }, () => {
                    // Ana ekranı göster
                    document.body.classList.remove('auth-ekrani');
                    document.getElementById('lisansAktivasyonEkrani').style.display = 'none';
                    document.getElementById('mainContent').style.display = 'block';

                    // Rozeti güncelle
                    if (badge) {
                        const expDate = new Date(data.expires_at);
                        badge.textContent = `Aktif (${expDate.toLocaleDateString('tr-TR')})`;
                        badge.style.color = 'var(--green)';
                    }

                    // Normal popup yükleme kodunu çalıştır
                    mainPanelYukle();
                });
            } else {
                // Lisans geçersiz
                chrome.storage.local.set({ lisansDurumu: false, panelSifresi: '' }, () => {
                    document.body.classList.add('auth-ekrani');
                    document.getElementById('mainContent').style.display = 'none';
                    document.getElementById('lisansAktivasyonEkrani').style.display = 'flex';
                    
                    const hata = document.getElementById('lisansHataMesaji');
                    if (hata) {
                        hata.textContent = '❌ ' + data.message;
                    }
                    setupLicenseActivationListener(clientId);
                });
            }
        })
        .catch(err => {
            console.error('Lisans doğrulama hatası:', err);
            // Sunucuya ulaşılamazsa çevrimdışı kullanım kontrolü yap
            chrome.storage.local.get({ lisansDurumu: false, lisansSonKullanma: '' }, (localData2) => {
                const now = new Date();
                const expDate = localData2.lisansSonKullanma ? new Date(localData2.lisansSonKullanma) : null;
                
                if (localData2.lisansDurumu && expDate && expDate > now) {
                    // Sunucuya ulaşılamıyor ama lokaldeki son bilgiye göre hala süresi var → İzin ver
                    document.body.classList.remove('auth-ekrani');
                    document.getElementById('lisansAktivasyonEkrani').style.display = 'none';
                    document.getElementById('mainContent').style.display = 'block';
                    if (badge) {
                        badge.textContent = `Çevrimdışı (${expDate.toLocaleDateString('tr-TR')})`;
                        badge.style.color = 'var(--accent3)';
                    }
                    mainPanelYukle();
                } else {
                    // Lisans yok veya süresi geçmiş
                    document.body.classList.add('auth-ekrani');
                    document.getElementById('mainContent').style.display = 'none';
                    document.getElementById('lisansAktivasyonEkrani').style.display = 'flex';
                    
                    const hata = document.getElementById('lisansHataMesaji');
                    if (hata) {
                        hata.textContent = '❌ Sunucuya bağlanılamadı. Lütfen internetinizi kontrol edin.';
                    }
                    setupLicenseActivationListener(clientId);
                }
            });
        });
    });
}

let activationListenerAttached = false;
function setupLicenseActivationListener(clientId) {
    if (activationListenerAttached) return;
    activationListenerAttached = true;

    const btn = document.getElementById('lisansAktiveEtBtn');
    const input = document.getElementById('lisansKeyInput');
    const hata = document.getElementById('lisansHataMesaji');
    const atlaBtn = document.getElementById('lisansAtlaBtn');

    btn.addEventListener('click', () => {
        const key = input.value.trim().toUpperCase();
        if (!key) {
            hata.textContent = 'Lütfen lisans anahtarınızı girin!';
            input.style.borderColor = 'var(--red)';
            return;
        }

        hata.textContent = 'Doğrulanıyor...';
        hata.style.color = 'var(--text)';
        btn.disabled = true;

        chrome.storage.local.get({ deviceName: '' }, (localData) => {
            fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    license_key: key,
                    client_id: clientId,
                    client_name: localData.deviceName || '',
                    version: chrome.runtime.getManifest().version
                })
            })
            .then(res => res.json())
            .then(data => {
                btn.disabled = false;
                if (handleVersionCheckResponse(data)) return;
                if (data.status === 'success') {
                    chrome.storage.local.set({ 
                        lisansAnahtari: key, 
                        lisansDurumu: true, 
                        lisansSonKullanma: data.expires_at 
                    }, () => {
                        hata.textContent = '✓ Başarıyla aktive edildi!';
                        hata.style.color = 'var(--green)';
                        input.style.borderColor = 'var(--green)';
                        
                        setTimeout(() => {
                            // Lisans doğrulandı, ana panele geç
                            document.body.classList.remove('auth-ekrani');
                            document.getElementById('lisansAktivasyonEkrani').style.display = 'none';
                            document.getElementById('mainContent').style.display = 'block';
                            
                            const badge = document.getElementById('lisansSureBadge');
                            if (badge) {
                                const expDate = new Date(data.expires_at);
                                badge.textContent = `Aktif (${expDate.toLocaleDateString('tr-TR')})`;
                                badge.style.color = 'var(--green)';
                            }
                            
                            mainPanelYukle();
                        }, 1000);
                    });
                } else {
                    hata.textContent = '❌ ' + data.message;
                    hata.style.color = 'var(--red)';
                    input.style.borderColor = 'var(--red)';
                }
            })
            .catch(err => {
                btn.disabled = false;
                hata.textContent = '❌ Bağlantı hatası oluştu!';
                hata.style.color = 'var(--red)';
                input.style.borderColor = 'var(--red)';
            });
        });
    });

    if (atlaBtn) {
        atlaBtn.addEventListener('click', () => {
            chrome.storage.local.set({ 
                lisansDurumu: false,
                lisansAnahtari: '',
                panelSifresi: ''
            }, () => {
                document.body.classList.remove('auth-ekrani');
                document.getElementById('lisansAktivasyonEkrani').style.display = 'none';
                document.getElementById('mainContent').style.display = 'block';
                mainPanelYukle();
            });
        });
    }

    // Enter tuşu desteği
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            btn.click();
        }
    });
}

let limitTimerInterval = null;

function limitSifirlamaTimerBaslat(limitSifirlamaZamani, gunlukAdet) {
    if (limitTimerInterval) {
        clearInterval(limitTimerInterval);
        limitTimerInterval = null;
    }

    const badge = document.getElementById('lisansSureBadge');
    if (!badge) return;

    if (!limitSifirlamaZamani || limitSifirlamaZamani === 0 || gunlukAdet === 0) {
        badge.textContent = `Ücretsiz Sürüm (${20 - gunlukAdet}/20) - Kullanıma Hazır`;
        badge.style.color = 'var(--green)';
        return;
    }

    function guncelle() {
        const simdi = Date.now();
        const kalanMs = limitSifirlamaZamani - simdi;

        if (kalanMs <= 0) {
            badge.textContent = `Ücretsiz Sürüm (20/20) - Haklar Yenilendi`;
            badge.style.color = 'var(--green)';
            clearInterval(limitTimerInterval);
            limitTimerInterval = null;
            // Sıfırlamayı kaydet
            chrome.storage.local.set({
                gunlukGonderimAdet: 0,
                limitSifirlamaZamani: 0
            });
            return;
        }

        const saniye = Math.floor((kalanMs / 1000) % 60);
        const dakika = Math.floor((kalanMs / (1000 * 60)) % 60);
        const saat = Math.floor(kalanMs / (1000 * 60 * 60));

        const sureYazisi = `${saat}sa ${dakika}dk ${saniye}sn`;
        const kalanHak = Math.max(0, 20 - gunlukAdet);
        badge.textContent = `Ücretsiz Sürüm (${kalanHak}/20) - Haklar ${sureYazisi} sonra yenilenecek`;
        badge.style.color = 'var(--accent2)';
    }

    guncelle();
    limitTimerInterval = setInterval(guncelle, 1000);
}

function mainPanelYukle() {
    chrome.storage.local.get({
        hedefLink: '',
        gecikmeMs: 500,
        hedefAdet: 10,
        sayacToplam: 0,
        sayacErkek: 0,
        sayacKadin: 0,
        genelToplam: 0,
        genelErkek: 0,
        genelKadin: 0,
        botAktif: false,
        islemGecmisi: [],
        tarananSorular: [],
        ozelKurallar: {},
        tema: 'karanlik',
        sablonlar: [],
        aktifSablon: '',
        sesDurumu: 'acik',
        panelSifresi: '',
        insansiModAktif: false,
        insansiFare: true,
        insansiHata: true,
        insansiKaydir: true,
        lisansDurumu: false,
        lisansSonKullanma: '',
        gunlukGonderimAdet: 0,
        limitSifirlamaZamani: 0,
        clientId: '',
        deviceName: '',
        lastVipWelcomeTime: 0
    }, (data) => {
        // VIP Hoş Geldin Sürpriz Ekranı (15 saniye cooldown korumalı)
        const welcomeEkrani = document.getElementById('vipWelcomeEkrani');
        const welcomeName = document.getElementById('vipWelcomeName');
        const mainContent = document.getElementById('mainContent');
        const now = Date.now();
        const timeDiff = now - (data.lastVipWelcomeTime || 0);

        if (data.lisansDurumu && timeDiff > 15000 && welcomeEkrani && welcomeName && mainContent) {
            chrome.storage.local.set({ lastVipWelcomeTime: now });
            welcomeName.textContent = `⭐ VIP (${data.deviceName || 'Üye'})`;
            
            document.body.classList.add('auth-ekrani');
            mainContent.style.display = 'none';
            welcomeEkrani.style.display = 'flex';
            welcomeEkrani.style.opacity = '1';
            
            setTimeout(() => {
                welcomeEkrani.style.opacity = '0';
                document.body.classList.remove('auth-ekrani');
                mainContent.style.display = 'block';
                setTimeout(() => {
                    welcomeEkrani.style.display = 'none';
                }, 400);
            }, 1200);
        }

        // Sunucudan limit sıfırlama talebini kontrol et
        if (data.clientId) {
            fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    client_id: data.clientId,
                    client_name: data.deviceName || '',
                    check_reset: true,
                    version: chrome.runtime.getManifest().version
                })
            })
            .then(res => res.json())
            .then(resData => {
                if (handleVersionCheckResponse(resData)) return;
                if (resData.status === 'success' && resData.reset_limit === true) {
                    chrome.storage.local.set({
                        gunlukGonderimAdet: 0,
                        limitSifirlamaZamani: 0
                    }, () => {
                        setStatus('Limitler sıfırlandı ✓', 'ok');
                        uiLogEkle('Limitler yönetici tarafından sıfırlandı.', 'info');
                    });
                }
            })
            .catch(err => console.error('Limit sıfırlama sorgulama hatası:', err));
        }

        // Cihaz Adı (Etiket) ayarlanması ve kaydedilmesi
        const deviceNameInput = document.getElementById('deviceNameInput');
        if (deviceNameInput) {
            deviceNameInput.value = data.deviceName || '';
            deviceNameInput.onchange = () => {
                const newName = deviceNameInput.value.trim();
                chrome.storage.local.set({ deviceName: newName }, () => {
                    // Sunucuya ismi hemen gönder
                    if (data.clientId) {
                        fetch(API_URL, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                client_id: data.clientId,
                                client_name: newName,
                                check_reset: true,
                                version: chrome.runtime.getManifest().version
                            })
                        })
                        .then(res => res.json())
                        .then(resData => {
                            handleVersionCheckResponse(resData);
                        })
                        .catch(e => console.error('Cihaz adı eşitleme hatası:', e));
                    }
                });
            };
        }

        // Cihaz Kimliğini (Client ID) Arayüzde Göster ve Kopyalama Özelliği Ekle
        const clientIdLabel = document.getElementById('clientIdLabel');
        if (clientIdLabel) {
            if (data.clientId) {
                const kisaId = data.clientId.length > 15 ? data.clientId.substring(0, 15) + '...' : data.clientId;
                clientIdLabel.textContent = kisaId;
                clientIdLabel.title = `Kopyalamak için tıkla: ${data.clientId}`;
                clientIdLabel.onclick = () => {
                    navigator.clipboard.writeText(data.clientId).then(() => {
                        setStatus('Cihaz Kimliği Kopyalandı ✓', 'ok');
                    });
                };
            } else {
                clientIdLabel.textContent = 'Bilinmiyor';
            }
        }

        document.documentElement.setAttribute('data-theme', data.tema);
        const temaSecici = document.getElementById('temaSecici');
        if (temaSecici) temaSecici.value = data.tema;
        const sesSecici = document.getElementById('sesSecici');
        if (sesSecici) sesSecici.value = data.sesDurumu || 'acik';
        document.getElementById('hedefLinkInput').value = data.hedefLink;
        document.getElementById('hedefAdetInput').value = data.hedefAdet;

        // Tur İstatistikleri
        document.getElementById('statToplam').innerText = data.sayacToplam;
        document.getElementById('statErkek').innerText = data.sayacErkek;
        document.getElementById('statKadin').innerText = data.sayacKadin;

        // Genel İstatistikler
        document.getElementById('genelStatToplam').innerText = data.genelToplam;
        document.getElementById('genelStatErkek').innerText = data.genelErkek;
        document.getElementById('genelStatKadin').innerText = data.genelKadin;

        const textEl = document.getElementById('aktifSablonText');
        if (textEl) {
            textEl.textContent = data.aktifSablon ? `Aktif Şablon: ${data.aktifSablon}` : 'Aktif Şablon: Yok';
        }

        // Lisans Badge Güncelleme
        const badge = document.getElementById('lisansSureBadge');
        if (badge) {
            if (data.lisansDurumu) {
                const expDate = new Date(data.lisansSonKullanma);
                badge.textContent = `Aktif (${expDate.toLocaleDateString('tr-TR')})`;
                badge.style.color = 'var(--green)';
                if (limitTimerInterval) {
                    clearInterval(limitTimerInterval);
                    limitTimerInterval = null;
                }
            } else {
                let simdi = Date.now();
                let limitSifirlamaZamani = data.limitSifirlamaZamani || 0;
                let gunlukAdet = data.gunlukGonderimAdet || 0;

                if (limitSifirlamaZamani > simdi + LIMIT_SURESI_MS) {
                    gunlukAdet = 0;
                    limitSifirlamaZamani = 0;
                    chrome.storage.local.set({
                        gunlukGonderimAdet: 0,
                        limitSifirlamaZamani: 0
                    });
                } else if (limitSifirlamaZamani > 0 && simdi >= limitSifirlamaZamani) {
                    gunlukAdet = 0;
                    limitSifirlamaZamani = 0;
                    chrome.storage.local.set({
                        gunlukGonderimAdet: 0,
                        limitSifirlamaZamani: 0
                    });
                }
                limitSifirlamaTimerBaslat(limitSifirlamaZamani, gunlukAdet);
            }
        }

        hesaplaSeviyeVeUnvan(data.genelToplam);

        // VIP Badge and VIP Destek Title updates
        const vipBadge = document.getElementById('vipBadge');
        const destekTitle = document.getElementById('destekTitleLabel');
        if (data.lisansDurumu) {
            if (vipBadge) vipBadge.style.display = 'inline-block';
            if (destekTitle) destekTitle.innerHTML = '✉️ VIP Destek Hattı ⭐';
        } else {
            if (vipBadge) vipBadge.style.display = 'none';
            if (destekTitle) destekTitle.innerHTML = '✉️ Destek & Ticket';
        }

        const slider = document.getElementById('delaySlider');
        const delayNote = document.getElementById('delaySpeedNote');
        
        if (data.lisansDurumu) {
            slider.min = "200";
            if (delayNote) {
                delayNote.textContent = "⚡ Premium Turbo Modu Aktif (200ms - 3000ms)";
                delayNote.style.color = "var(--green)";
            }
        } else {
            slider.min = "1000";
            if (delayNote) {
                delayNote.textContent = "🔒 1000ms altı Turbo Mod lisans gerektirir.";
                delayNote.style.color = "var(--muted)";
            }
            if (data.gecikmeMs < 1000) {
                data.gecikmeMs = 1000;
                chrome.storage.local.set({ gecikmeMs: 1000 });
            }
        }
        
        slider.value = data.gecikmeMs;
        updateSliderUI(data.gecikmeMs);

        gorselGuncelleBotButonu(data.botAktif);
        loglariCiz(data.islemGecmisi);
        drawCustomRulesUI(data.tarananSorular, data.ozelKurallar);
        renderSablonlar(data.sablonlar);
        // Şifre durumunu güncelle
        sifreDurumGuncelle(data.panelSifresi);

        // İnsansı Mod Ayarlarını Yükle
        const insansiSecici = document.getElementById('insansiModSecici');
        const insansiAlt = document.getElementById('insansiAltAyarlar');
        const fareCb = document.getElementById('insansiFareCb');
        const hataCb = document.getElementById('insansiHataCb');
        const kaydirCb = document.getElementById('insansiKaydirCb');

        let insansiMod = data.insansiModAktif || false;

        if (!data.lisansDurumu) {
            insansiMod = false;
            if (insansiSecici) {
                insansiSecici.value = 'kapali';
                insansiSecici.disabled = true;
                insansiSecici.options[0].textContent = "❌ İnsansı Mod Kapalı";
                if (insansiSecici.options[1]) {
                    insansiSecici.options[1].textContent = "🔒 İnsansı Mod (Premium)";
                    insansiSecici.options[1].disabled = true;
                }
            }
            if (insansiAlt) insansiAlt.style.display = 'none';
            if (fareCb) { fareCb.checked = false; fareCb.disabled = true; }
            if (hataCb) { hataCb.checked = false; hataCb.disabled = true; }
            if (kaydirCb) { kaydirCb.checked = false; kaydirCb.disabled = true; }

            if (data.insansiModAktif) {
                chrome.storage.local.set({
                    insansiModAktif: false,
                    insansiFare: false,
                    insansiHata: false,
                    insansiKaydir: false
                });
            }
        } else {
            if (insansiSecici) {
                insansiSecici.value = insansiMod ? 'acik' : 'kapali';
                insansiSecici.disabled = false;
                insansiSecici.options[0].textContent = "❌ İnsansı Mod Kapalı";
                if (insansiSecici.options[1]) {
                    insansiSecici.options[1].textContent = "✅ İnsansı Mod Aktif";
                    insansiSecici.options[1].disabled = false;
                }
            }
            if (insansiAlt) {
                insansiAlt.style.display = insansiMod ? 'flex' : 'none';
            }
            if (fareCb) { fareCb.checked = data.insansiFare !== false; fareCb.disabled = false; }
            if (hataCb) { hataCb.checked = data.insansiHata !== false; hataCb.disabled = false; }
            if (kaydirCb) { kaydirCb.checked = data.insansiKaydir !== false; kaydirCb.disabled = false; }
        }

        // İnsansı Mod Seçici Değişim Dinleyicisi
        if (insansiSecici) {
            insansiSecici.addEventListener('change', (e) => {
                const aktif = e.target.value === 'acik';
                if (insansiAlt) {
                    insansiAlt.style.display = aktif ? 'flex' : 'none';
                }
            });
        }

        // Hız panelini başlat
        hizPaneliGuncelle(data.botAktif);
        hizTimerBaslat();
    });
}

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        if (changes.gunlukGonderimAdet || changes.lisansDurumu || changes.limitSifirlamaZamani) {
            chrome.storage.local.get({ lisansDurumu: false, gunlukGonderimAdet: 0, limitSifirlamaZamani: 0, lisansSonKullanma: '' }, (data) => {
                const badge = document.getElementById('lisansSureBadge');
                const vipBadge = document.getElementById('vipBadge');
                const destekTitle = document.getElementById('destekTitleLabel');

                if (data.lisansDurumu) {
                    if (vipBadge) vipBadge.style.display = 'inline-block';
                    if (destekTitle) destekTitle.innerHTML = '✉️ VIP Destek Hattı ⭐';
                } else {
                    if (vipBadge) vipBadge.style.display = 'none';
                    if (destekTitle) destekTitle.innerHTML = '✉️ Destek & Ticket';
                }

                if (badge) {
                    if (data.lisansDurumu) {
                        const expDate = new Date(data.lisansSonKullanma);
                        badge.textContent = `Aktif (${expDate.toLocaleDateString('tr-TR')})`;
                        badge.style.color = 'var(--green)';
                        if (limitTimerInterval) {
                            clearInterval(limitTimerInterval);
                            limitTimerInterval = null;
                        }
                    } else {
                        let simdi = Date.now();
                        let limitSifirlamaZamani = data.limitSifirlamaZamani || 0;
                        let gunlukAdet = data.gunlukGonderimAdet || 0;

                        if (limitSifirlamaZamani > simdi + LIMIT_SURESI_MS) {
                            gunlukAdet = 0;
                            limitSifirlamaZamani = 0;
                            chrome.storage.local.set({
                                gunlukGonderimAdet: 0,
                                limitSifirlamaZamani: 0
                            });
                        } else if (limitSifirlamaZamani > 0 && simdi >= limitSifirlamaZamani) {
                            gunlukAdet = 0;
                            limitSifirlamaZamani = 0;
                            chrome.storage.local.set({
                                gunlukGonderimAdet: 0,
                                limitSifirlamaZamani: 0
                            });
                        }
                        limitSifirlamaTimerBaslat(limitSifirlamaZamani, gunlukAdet);
                    }
                }
            });
        }
        // Tur sayaçları güncellenirse
        if (changes.sayacToplam) {
            document.getElementById('statToplam').innerText = changes.sayacToplam.newValue;
        }
        if (changes.sayacErkek) {
            document.getElementById('statErkek').innerText = changes.sayacErkek.newValue;
        }
        if (changes.sayacKadin) {
            document.getElementById('statKadin').innerText = changes.sayacKadin.newValue;
        }

        // Genel sayaçlar güncellenirse
        if (changes.genelToplam) {
            document.getElementById('genelStatToplam').innerText = changes.genelToplam.newValue;
            hesaplaSeviyeVeUnvan(changes.genelToplam.newValue);
        }
        if (changes.genelErkek) {
            document.getElementById('genelStatErkek').innerText = changes.genelErkek.newValue;
        }
        if (changes.genelKadin) {
            document.getElementById('genelStatKadin').innerText = changes.genelKadin.newValue;
        }

        if (changes.islemGecmisi) {
            loglariCiz(changes.islemGecmisi.newValue);
        }
        if (changes.botAktif !== undefined) {
            gorselGuncelleBotButonu(changes.botAktif.newValue);
            hizPaneliGuncelle(changes.botAktif.newValue);
        }
        if (changes.hedefLink) {
            document.getElementById('hedefLinkInput').value = changes.hedefLink.newValue;
            const webview = document.getElementById('automation-webview');
            const wvUrlInput = document.getElementById('wvUrlInput');
            if (webview && changes.hedefLink.newValue) {
                try {
                    webview.loadURL(changes.hedefLink.newValue);
                } catch (err) {
                    webview.setAttribute('src', changes.hedefLink.newValue);
                }
                if (wvUrlInput) {
                    wvUrlInput.value = changes.hedefLink.newValue;
                }
            }
        }
        if (changes.tarananSorular || changes.ozelKurallar) {
            chrome.storage.local.get(['tarananSorular', 'ozelKurallar'], (data) => {
                drawCustomRulesUI(data.tarananSorular || [], data.ozelKurallar || {});
            });
        }
        if (changes.tema) {
            document.documentElement.setAttribute('data-theme', changes.tema.newValue);
            const temaSecici = document.getElementById('temaSecici');
            if (temaSecici && temaSecici.value !== changes.tema.newValue) {
                temaSecici.value = changes.tema.newValue;
            }
        }
        if (changes.sablonlar) {
            renderSablonlar(changes.sablonlar.newValue);
        }
        if (changes.aktifSablon) {
            const val = changes.aktifSablon.newValue || '';
            const secici = document.getElementById('sablonSecici');
            if (secici) secici.value = val;
            const textEl = document.getElementById('aktifSablonText');
            if (textEl) {
                textEl.textContent = val ? `Aktif Şablon: ${val}` : 'Aktif Şablon: Yok';
            }
        }
        if (changes.sesDurumu) {
            const sesSecici = document.getElementById('sesSecici');
            if (sesSecici && sesSecici.value !== changes.sesDurumu.newValue) {
                sesSecici.value = changes.sesDurumu.newValue;
            }
        }

    }
});

function hesaplaSeviyeVeUnvan(genelToplam) {
    let level = 1;
    let title = 'Çaylak Botçu';
    let nextThreshold = 50;
    let currentThreshold = 0;

    if (genelToplam >= 2500) {
        level = 6;
        title = 'Form Tanrısı';
        nextThreshold = 2500;
        currentThreshold = 2500;
    } else if (genelToplam >= 1000) {
        level = 5;
        title = 'Sistem Hakimi';
        nextThreshold = 2500;
        currentThreshold = 1000;
    } else if (genelToplam >= 500) {
        level = 4;
        title = 'Veri Avcısı';
        nextThreshold = 1000;
        currentThreshold = 500;
    } else if (genelToplam >= 200) {
        level = 3;
        title = 'Hızlı Doldurucu';
        nextThreshold = 500;
        currentThreshold = 200;
    } else if (genelToplam >= 50) {
        level = 2;
        title = 'Form Çırağı';
        nextThreshold = 200;
        currentThreshold = 50;
    }

    document.getElementById('levelBadge').textContent = `Lvl ${level}`;
    document.getElementById('titleBadge').textContent = title;

    if (level === 6) {
        document.getElementById('xpText').textContent = `${genelToplam} (MAX)`;
        document.getElementById('xpBarFill').style.width = '100%';
    } else {
        const xpInCurrentLevel = genelToplam - currentThreshold;
        const xpNeeded = nextThreshold - currentThreshold;
        const pct = (xpInCurrentLevel / xpNeeded) * 100;
        document.getElementById('xpText').textContent = `${genelToplam} / ${nextThreshold}`;
        document.getElementById('xpBarFill').style.width = `${pct}%`;
    }

    // Kilitli Temaları Yönetme
    const optMatrix = document.getElementById('optMatrix');
    const optPrestige = document.getElementById('optPrestige');

    if (optMatrix) {
        if (level >= 3) {
            optMatrix.disabled = false;
            optMatrix.textContent = 'Matrix Hacker (Açık)';
        } else {
            optMatrix.disabled = true;
            optMatrix.textContent = 'Matrix Hacker 🔒 (Lvl 3)';
            if (document.getElementById('temaSecici').value === 'matrix') {
                document.getElementById('temaSecici').value = 'karanlik';
                chrome.storage.local.set({ tema: 'karanlik' });
            }
        }
    }

    if (optPrestige) {
        if (level >= 5) {
            optPrestige.disabled = false;
            optPrestige.textContent = 'Prestige Gold (Açık)';
        } else {
            optPrestige.disabled = true;
            optPrestige.textContent = 'Prestige Gold 🔒 (Lvl 5)';
            if (document.getElementById('temaSecici').value === 'prestige') {
                document.getElementById('temaSecici').value = 'karanlik';
                chrome.storage.local.set({ tema: 'karanlik' });
            }
        }
    }
}

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

        sesCal(yeniDurum ? 'start' : 'stop');

        let kayitVerisi = { botAktif: yeniDurum };
        if (yeniDurum) {
            kayitVerisi.sayacToplam = 0;
            kayitVerisi.sayacErkek = 0;
            kayitVerisi.sayacKadin = 0;
            kayitVerisi.botBaslangicZamani = Date.now();
            kayitVerisi.gonderimZamanlari = [];
        }

        const runStartLogic = (linkToUse, tabToReload) => {
            let updateData = { ...kayitVerisi };
            if (linkToUse) {
                updateData.hedefLink = linkToUse;
            }
            chrome.storage.local.set(updateData, () => {
                setStatus('Bot Açıldı! Sayfa yenileniyor...', 'ok');
                uiLogEkle('Bot sistem başlatıldı.', 'info');
                if (tabToReload) {
                    chrome.tabs.reload(tabToReload.id);
                }
            });
        };

        if (yeniDurum) {
            chrome.tabs.query({}, (tabs) => {
                let targetTab = null;

                if (data.hedefLink) {
                    const targetFormId = extractFormId(data.hedefLink);
                    if (targetFormId) {
                        targetTab = tabs.find(tab => tab.url && tab.url.includes("docs.google.com/forms") && extractFormId(tab.url) === targetFormId);
                    }
                }

                if (targetTab) {
                    runStartLogic(null, targetTab);
                } else {
                    chrome.tabs.query({ active: true, currentWindow: true }, (activeTabs) => {
                        const aktifTab = activeTabs[0];
                        if (aktifTab && aktifTab.url && aktifTab.url.includes("docs.google.com/forms")) {
                            runStartLogic(aktifTab.url, aktifTab);
                        } else {
                            let herhangiFormSekmesi = tabs.find(tab => tab.url && tab.url.includes("docs.google.com/forms") && (tab.url.includes("viewform") || tab.url.includes("formResponse")));
                            if (!herhangiFormSekmesi) {
                                herhangiFormSekmesi = tabs.find(tab => tab.url && tab.url.includes("docs.google.com/forms"));
                            }
                            if (herhangiFormSekmesi) {
                                runStartLogic(herhangiFormSekmesi.url, herhangiFormSekmesi);
                            } else {
                                setStatus('Form sekmesi açık değil! Lütfen formu açın.', 'err');
                            }
                        }
                    });
                }
            });
        } else {
            chrome.storage.local.set(kayitVerisi, () => {
                setStatus('Bot Durduruldu.', 'err');
                uiLogEkle('Bot durduruldu.', 'err');
            });
        }
    });
});

document.getElementById('kaydetBtn').addEventListener('click', (e) => {
    const btn = e.target;
    const link = document.getElementById('hedefLinkInput').value.trim();

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

    chrome.storage.local.get({ lisansDurumu: false }, (licData) => {
        let ortalamaGecikme = parseInt(document.getElementById('delaySlider').value);
        if (!licData.lisansDurumu && ortalamaGecikme < 1000) {
            ortalamaGecikme = 1000;
            document.getElementById('delaySlider').value = 1000;
            updateSliderUI(1000);
        }

        let insansiModAktif = document.getElementById('insansiModSecici').value === 'acik';
        let insansiFare = document.getElementById('insansiFareCb').checked;
        let insansiHata = document.getElementById('insansiHataCb').checked;
        let insansiKaydir = document.getElementById('insansiKaydirCb').checked;

        if (!licData.lisansDurumu) {
            insansiModAktif = false;
            insansiFare = false;
            insansiHata = false;
            insansiKaydir = false;
        }

        chrome.storage.local.set({
            hedefLink: link,
            gecikmeMs: ortalamaGecikme,
            hedefAdet: hedefAdeti,
            insansiModAktif: insansiModAktif,
            insansiFare: insansiFare,
            insansiHata: insansiHata,
            insansiKaydir: insansiKaydir
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
});

document.getElementById('sifirlaBtn').addEventListener('click', () => {
    chrome.storage.local.set({
        sayacToplam: 0, sayacErkek: 0, sayacKadin: 0,
        genelToplam: 0, genelErkek: 0, genelKadin: 0,
        islemGecmisi: [],
        tarananSorular: [],
        ozelKurallar: {},
        aktifSablon: '',
        botBaslangicZamani: 0,
        gonderimZamanlari: [],
        insansiModAktif: false,
        insansiFare: true,
        insansiHata: true,
        insansiKaydir: true
    }, () => {
        // Tur istatistiklerini sıfırla
        document.getElementById('statToplam').innerText = '0';
        document.getElementById('statErkek').innerText = '0';
        document.getElementById('statKadin').innerText = '0';

        // Genel istatistikleri sıfırla
        document.getElementById('genelStatToplam').innerText = '0';
        document.getElementById('genelStatErkek').innerText = '0';
        document.getElementById('genelStatKadin').innerText = '0';

        const box = document.getElementById('logBox');
        box.innerHTML = '<div class="log-item" style="justify-content:center; color: var(--muted);">Henüz işlem yok</div>';

        drawCustomRulesUI([], {});
        setStatus('Sıfırlandı ✓', 'ok');
    });
});

document.getElementById('temaSecici').addEventListener('change', (e) => {
    const secilenTema = e.target.value;
    document.documentElement.setAttribute('data-theme', secilenTema);
    chrome.storage.local.set({ tema: secilenTema });
});

// --- ŞABLON SİSTEMİ ---
function renderSablonlar(sablonlar) {
    const secici = document.getElementById('sablonSecici');
    if (!secici) return;

    secici.innerHTML = '<option value="">-- Şablon Seç --</option>';
    if (sablonlar && sablonlar.length > 0) {
        sablonlar.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.isim;
            opt.textContent = s.isim;
            secici.appendChild(opt);
        });
    }

    chrome.storage.local.get({ aktifSablon: '' }, (data) => {
        secici.value = data.aktifSablon || '';
        const textEl = document.getElementById('aktifSablonText');
        if (textEl) {
            textEl.textContent = data.aktifSablon ? `Aktif Şablon: ${data.aktifSablon}` : 'Aktif Şablon: Yok';
        }
    });
}

document.getElementById('sablonKaydetBtn').addEventListener('click', () => {
    const isimInput = document.getElementById('yeniSablonAdi');
    const isim = isimInput.value.trim();
    if (!isim) {
        setStatus('Lütfen şablon için bir isim girin!', 'err');
        return;
    }

    chrome.storage.local.get({
        hedefLink: '', gecikmeMs: 500, hedefAdet: 10,
        tarananSorular: [], ozelKurallar: {}, sablonlar: [],
        sayacToplam: 0, sayacErkek: 0, sayacKadin: 0,
        genelToplam: 0, genelErkek: 0, genelKadin: 0,
        lisansDurumu: false
    }, (data) => {
        let yeniSablonlar = [...data.sablonlar];
        const varOlanIndex = yeniSablonlar.findIndex(s => s.isim === isim);

        if (!data.lisansDurumu && varOlanIndex === -1 && yeniSablonlar.length >= 1) {
            setStatus('❌ Ücretsiz sürüm en fazla 1 şablon kaydedebilir!', 'err');
            return;
        }

        let sayacToplam = 0, sayacErkek = 0, sayacKadin = 0;
        let genelToplam = 0, genelErkek = 0, genelKadin = 0;

        if (varOlanIndex > -1) {
            const varOlan = yeniSablonlar[varOlanIndex];
            sayacToplam = varOlan.sayacToplam || 0;
            sayacErkek = varOlan.sayacErkek || 0;
            sayacKadin = varOlan.sayacKadin || 0;
            genelToplam = varOlan.genelToplam || 0;
            genelErkek = varOlan.genelErkek || 0;
            genelKadin = varOlan.genelKadin || 0;
        }

        const yeniSablon = {
            isim: isim,
            hedefLink: data.hedefLink || document.getElementById('hedefLinkInput').value,
            gecikmeMs: parseInt(document.getElementById('delaySlider').value) || data.gecikmeMs,
            hedefAdet: parseInt(document.getElementById('hedefAdetInput').value) || data.hedefAdet,
            tarananSorular: data.tarananSorular,
            ozelKurallar: data.ozelKurallar,
            sayacToplam: sayacToplam,
            sayacErkek: sayacErkek,
            sayacKadin: sayacKadin,
            genelToplam: genelToplam,
            genelErkek: genelErkek,
            genelKadin: genelKadin
        };

        if (varOlanIndex > -1) {
            yeniSablonlar[varOlanIndex] = yeniSablon; // Üzerine yaz
        } else {
            yeniSablonlar.push(yeniSablon);
        }

        chrome.storage.local.set({
            sablonlar: yeniSablonlar,
            aktifSablon: isim,
            sayacToplam: sayacToplam,
            sayacErkek: sayacErkek,
            sayacKadin: sayacKadin,
            genelToplam: genelToplam,
            genelErkek: genelErkek,
            genelKadin: genelKadin
        }, () => {
            setStatus('Şablon başarıyla kaydedildi ✓', 'ok');
            isimInput.value = '';
            uiLogEkle(`'${isim}' şablonu kaydedildi.`, 'info');
        });
    });
});

document.getElementById('sablonYukleBtn').addEventListener('click', () => {
    const secilenIsim = document.getElementById('sablonSecici').value;
    if (!secilenIsim) {
        setStatus('Lütfen yüklemek için bir şablon seçin!', 'err');
        return;
    }

    chrome.storage.local.get({ sablonlar: [] }, (data) => {
        const sablon = data.sablonlar.find(s => s.isim === secilenIsim);
        if (sablon) {
            chrome.storage.local.set({
                hedefLink: sablon.hedefLink,
                gecikmeMs: sablon.gecikmeMs,
                hedefAdet: sablon.hedefAdet,
                tarananSorular: sablon.tarananSorular,
                ozelKurallar: sablon.ozelKurallar,
                aktifSablon: secilenIsim,
                sayacToplam: sablon.sayacToplam || 0,
                sayacErkek: sablon.sayacErkek || 0,
                sayacKadin: sablon.sayacKadin || 0,
                genelToplam: sablon.genelToplam || 0,
                genelErkek: sablon.genelErkek || 0,
                genelKadin: sablon.genelKadin || 0
            }, () => {
                document.getElementById('hedefLinkInput').value = sablon.hedefLink;
                document.getElementById('hedefAdetInput').value = sablon.hedefAdet;
                const slider = document.getElementById('delaySlider');
                slider.value = sablon.gecikmeMs;
                updateSliderUI(sablon.gecikmeMs);

                setStatus('Şablon yüklendi ✓', 'ok');
                uiLogEkle(`'${sablon.isim}' şablonu yüklendi.`, 'info');
            });
        }
    });
});

document.getElementById('sablonSilBtn').addEventListener('click', () => {
    const secilenIsim = document.getElementById('sablonSecici').value;
    if (!secilenIsim) {
        setStatus('Lütfen silmek için bir şablon seçin!', 'err');
        return;
    }

    chrome.storage.local.get({ sablonlar: [], aktifSablon: '' }, (data) => {
        const yeniSablonlar = data.sablonlar.filter(s => s.isim !== secilenIsim);

        let guncelleme = { sablonlar: yeniSablonlar };
        if (data.aktifSablon === secilenIsim) {
            guncelleme.aktifSablon = '';
            guncelleme.sayacToplam = 0;
            guncelleme.sayacErkek = 0;
            guncelleme.sayacKadin = 0;
            guncelleme.genelToplam = 0;
            guncelleme.genelErkek = 0;
            guncelleme.genelKadin = 0;
        }

        chrome.storage.local.set(guncelleme, () => {
            setStatus('Şablon silindi.', 'ok');
            uiLogEkle(`'${secilenIsim}' şablonu silindi.`, 'err');
        });
    });
});


// --- ÖZEL KURALLAR FONKSİYONLARI ---

function drawCustomRulesUI(questions, rules) {
    const container = document.getElementById('soruKurallariContainer');
    const section = document.getElementById('ozelKurallarBolumu');

    container.innerHTML = '';

    if (!questions || questions.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';

    const safeRules = rules || {};

    questions.forEach((q, idx) => {
        const item = document.createElement('div');
        item.className = 'field';
        item.style.padding = '6px';
        item.style.background = 'var(--surface2)';
        item.style.border = '1px solid var(--border)';
        item.style.borderRadius = '5px';
        item.style.gap = '4px';
        item.style.marginBottom = '2px';

        // Soru Başlığı
        const title = document.createElement('div');
        title.style.fontWeight = '700';
        title.style.fontSize = '9px';
        title.style.color = 'var(--text)';
        title.style.wordBreak = 'break-all';
        title.textContent = `${idx + 1}. ${q.text}`;
        item.appendChild(title);

        // Kural Seçimi (Dropdown)
        const select = document.createElement('select');
        select.style.fontSize = '10px';
        select.style.padding = '5px 7px';
        select.style.borderRadius = '4px';
        select.style.cursor = 'pointer';
        select.id = `rule_select_${idx}`;
        select.dataset.questionText = q.text;
        select.dataset.questionType = q.type;

        const activeRuleObj = safeRules[q.text] || { rule: 'default', customValue: '' };

        const optDefault = document.createElement('option');
        optDefault.value = 'default';
        optDefault.textContent = '⚙️ Genel / Varsayılan Seçim';
        if (activeRuleObj.rule === 'default') optDefault.selected = true;
        select.appendChild(optDefault);

        if (q.type === 'choice' || q.type === 'dropdown') {
            const optRandom = document.createElement('option');
            optRandom.value = 'random';
            optRandom.textContent = '🎲 Rastgele Şık Seç';
            if (activeRuleObj.rule === 'random') optRandom.selected = true;
            select.appendChild(optRandom);

            if (q.options && q.options.length > 0) {
                q.options.forEach(optVal => {
                    const opt = document.createElement('option');
                    opt.value = optVal;
                    opt.textContent = optVal;
                    if (activeRuleObj.rule === optVal) opt.selected = true;
                    select.appendChild(opt);
                });
            } else {
                for (let i = 1; i <= 5; i++) {
                    const opt = document.createElement('option');
                    opt.value = i.toString();
                    opt.textContent = `${i}. Şık`;
                    if (activeRuleObj.rule === i.toString()) opt.selected = true;
                    select.appendChild(opt);
                }
            }
        } else if (q.type === 'text') {


            const optName = document.createElement('option');
            optName.value = 'isim_soyisim';
            optName.textContent = '👤 Rastgele İsim + Soyisim';
            if (activeRuleObj.rule === 'isim_soyisim') optName.selected = true;
            select.appendChild(optName);

            const optNameMale = document.createElement('option');
            optNameMale.value = 'isim_erkek';
            optNameMale.textContent = '👨 Rastgele İsim (Erkek)';
            if (activeRuleObj.rule === 'isim_erkek') optNameMale.selected = true;
            select.appendChild(optNameMale);

            const optNameFemale = document.createElement('option');
            optNameFemale.value = 'isim_kadin';
            optNameFemale.textContent = '👩 Rastgele İsim (Kadın)';
            if (activeRuleObj.rule === 'isim_kadin') optNameFemale.selected = true;
            select.appendChild(optNameFemale);

            const optSurname = document.createElement('option');
            optSurname.value = 'soyisim';
            optSurname.textContent = '🏷️ Rastgele Soyisim';
            if (activeRuleObj.rule === 'soyisim') optSurname.selected = true;
            select.appendChild(optSurname);

            const optYas = document.createElement('option');
            optYas.value = 'rastgele_yas';
            optYas.textContent = '🎂 Rastgele Yaş (18-30)';
            if (activeRuleObj.rule === 'rastgele_yas') optYas.selected = true;
            select.appendChild(optYas);



            const optCustom = document.createElement('option');
            optCustom.value = 'ozel';
            optCustom.textContent = '✍️ Özel Metin Yaz...';
            if (activeRuleObj.rule === 'ozel') optCustom.selected = true;
            select.appendChild(optCustom);
        }

        item.appendChild(select);

        // Özel metin yazılacak input kutusu
        const customInput = document.createElement('input');
        customInput.type = 'text';
        customInput.placeholder = 'Özel metin girin...';
        customInput.style.fontSize = '10px';
        customInput.style.padding = '5px 7px';
        customInput.style.borderRadius = '4px';
        customInput.style.marginTop = '4px';
        customInput.id = `rule_custom_input_${idx}`;
        customInput.value = activeRuleObj.customValue || '';
        customInput.style.display = activeRuleObj.rule === 'ozel' ? 'block' : 'none';
        item.appendChild(customInput);

        // Değişiklikleri anlık kaydet
        select.addEventListener('change', () => {
            if (select.value === 'ozel') {
                customInput.style.display = 'block';
            } else {
                customInput.style.display = 'none';
            }
            saveCustomRules();
        });

        customInput.addEventListener('input', () => {
            saveCustomRules();
        });

        container.appendChild(item);
    });
}

function saveCustomRules() {
    chrome.storage.local.get({ tarananSorular: [] }, (data) => {
        const rules = {};
        data.tarananSorular.forEach((q, idx) => {
            const select = document.getElementById(`rule_select_${idx}`);
            const customInput = document.getElementById(`rule_custom_input_${idx}`);
            if (select) {
                rules[q.text] = {
                    rule: select.value,
                    customValue: customInput ? customInput.value.trim() : ''
                };
            }
        });
        chrome.storage.local.set({ ozelKurallar: rules });
    });
}

function extractFormId(url) {
    if (!url) return null;
    const match = url.match(/\/d\/(?:e\/)?([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
}

function triggerScan(tab, btn, eskiYazi) {
    chrome.tabs.sendMessage(tab.id, { action: "tara" }, (response) => {
        btn.textContent = eskiYazi;
        btn.style.opacity = '1';

        if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError);
            setStatus('Bağlantı hatası! Sayfayı yenileyip deneyin.', 'err');
            return;
        }

        if (response && response.status === 'ok') {
            const newQuestions = response.questions;
            const activeFormId = extractFormId(tab.url);

            chrome.storage.local.get({ tarananSorular: [], ozelKurallar: {}, lastScannedFormId: '' }, (data) => {
                let questions = [];
                let rules = { ...data.ozelKurallar };

                if (data.lastScannedFormId === activeFormId && activeFormId) {

                    questions = [...data.tarananSorular];
                    newQuestions.forEach(newQ => {
                        const existingIdx = questions.findIndex(q => q.text === newQ.text);
                        if (existingIdx > -1) {

                            questions[existingIdx].options = newQ.options;
                            questions[existingIdx].type = newQ.type;
                        } else {

                            questions.push(newQ);
                            rules[newQ.text] = { rule: 'default', customValue: '' };
                        }
                    });
                } else {
                    // Farklı form veya ilk tarama: Üzerine yaz (Overwrite)
                    questions = newQuestions;
                    rules = {};
                    questions.forEach(q => {
                        rules[q.text] = { rule: 'default', customValue: '' };
                    });
                }

                chrome.storage.local.set({
                    hedefLink: tab.url,
                    tarananSorular: questions,
                    ozelKurallar: rules,
                    lastScannedFormId: activeFormId || ''
                }, () => {
                    drawCustomRulesUI(questions, rules);
                    setStatus('Sayfa tarandı ve sorular birleştirildi ✓', 'ok');
                    uiLogEkle(`Sayfa tarandı: Toplam ${questions.length} soru kayıtlı.`, 'info');

                    if (window.innerWidth < 400) {
                        chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") });
                    }
                });
            });
        } else {
            setStatus('Tarama başarısız oldu!', 'err');
        }
    });
}

document.getElementById('formTaraBtn').addEventListener('click', () => {
    const btn = document.getElementById('formTaraBtn');
    const eskiYazi = btn.textContent;
    btn.textContent = 'TARANIYOR...';
    btn.style.opacity = '0.7';

    const inputLink = document.getElementById('hedefLinkInput').value.trim();
    const targetFormId = extractFormId(inputLink);

    chrome.tabs.query({}, (tabs) => {
        let hedefTab = null;

        // 1. Hedef linkteki Form ID ile eşleşen sekmeyi bulmaya çalış
        if (targetFormId) {
            hedefTab = tabs.find(tab => tab.url && tab.url.includes("docs.google.com/forms") && extractFormId(tab.url) === targetFormId);
        }

        // 2. Bulamazsak veya Form ID boşsa, mevcut penceredeki aktif sekmeyi kontrol et
        if (hedefTab) {
            triggerScan(hedefTab, btn, eskiYazi);
        } else {
            chrome.tabs.query({ active: true, currentWindow: true }, (activeTabs) => {
                const aktifTab = activeTabs[0];
                if (aktifTab && aktifTab.url && aktifTab.url.includes("docs.google.com/forms")) {
                    triggerScan(aktifTab, btn, eskiYazi);
                } else {
                    // 3. Yine bulamazsak, açık olan HERHANGİ BİR Google Form sekmesini seç
                    let herhangiFormSekmesi = tabs.find(tab => tab.url && tab.url.includes("docs.google.com/forms") && (tab.url.includes("viewform") || tab.url.includes("formResponse")));
                    if (!herhangiFormSekmesi) {
                        herhangiFormSekmesi = tabs.find(tab => tab.url && tab.url.includes("docs.google.com/forms"));
                    }
                    if (herhangiFormSekmesi) {
                        triggerScan(herhangiFormSekmesi, btn, eskiYazi);
                    } else {
                        setStatus('Form sekmesi açık değil! Lütfen formu açın.', 'err');
                        btn.textContent = eskiYazi;
                        btn.style.opacity = '1';
                    }
                }
            });
        }
    });
});

// Özel Kuralları Temizle Butonu Event Listener
document.getElementById('kurallariTemizleBtn').addEventListener('click', () => {
    chrome.storage.local.set({ tarananSorular: [], ozelKurallar: {} }, () => {
        drawCustomRulesUI([], {});
        setStatus('Kurallar temizlendi ✓', 'ok');
        uiLogEkle('Özel kural listesi temizlendi.', 'info');
    });
});

// Sekmede Aç Butonu Event Listener
document.getElementById('sekmedeAcBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") });
});

document.getElementById('sesSecici').addEventListener('change', (e) => {
    chrome.storage.local.set({ sesDurumu: e.target.value });
});

let globalAudioCtx = null;

function getAudioContext() {
    try {
        if (!globalAudioCtx) {
            globalAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (globalAudioCtx.state === 'suspended') {
            globalAudioCtx.resume();
        }
        return globalAudioCtx;
    } catch (e) {
        console.error("AudioContext initialization error:", e);
        return null;
    }
}

document.body.addEventListener('click', () => {
    getAudioContext();
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "playChime") {
        sesCal(request.tip);
    }
});

function sesCal(tip) {
    const audioCtx = getAudioContext();
    if (!audioCtx) return;

    chrome.storage.local.get({ sesDurumu: 'acik' }, (data) => {
        if (data.sesDurumu !== 'acik') return;
        try {
            if (tip === 'start') {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain);
                gain.connect(audioCtx.destination);

                osc.type = 'sine';
                osc.frequency.setValueAtTime(440, audioCtx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15);

                gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);

                osc.start();
                osc.stop(audioCtx.currentTime + 0.15);
            } else if (tip === 'stop') {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain);
                gain.connect(audioCtx.destination);

                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, audioCtx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.15);

                gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);

                osc.start();
                osc.stop(audioCtx.currentTime + 0.15);
            } else if (tip === 'success') {
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
            console.error("Popup ses çalma hatası:", e);
        }
    });
}

// --- HIZ PANELİ ---
let hizTimerId = null;

function hizPaneliGuncelle(botAktif) {
    const panel = document.getElementById('hizPaneli');
    if (!panel) return;
    panel.style.display = botAktif ? 'block' : 'none';
}

function formatSure(ms) {
    if (ms <= 0 || !isFinite(ms)) return '--:--';
    const toplamSaniye = Math.floor(ms / 1000);
    const saat = Math.floor(toplamSaniye / 3600);
    const dakika = Math.floor((toplamSaniye % 3600) / 60);
    const saniye = toplamSaniye % 60;

    if (saat > 0) {
        return `${saat}:${dakika.toString().padStart(2, '0')}:${saniye.toString().padStart(2, '0')}`;
    }
    return `${dakika.toString().padStart(2, '0')}:${saniye.toString().padStart(2, '0')}`;
}

function hizHesapla() {
    chrome.storage.local.get({
        botAktif: false,
        botBaslangicZamani: 0,
        gonderimZamanlari: [],
        sayacToplam: 0,
        hedefAdet: 10
    }, (data) => {
        if (!data.botAktif) return;

        const simdi = Date.now();
        const baslangic = data.botBaslangicZamani || simdi;
        const gecenMs = simdi - baslangic;
        const zamanlari = data.gonderimZamanlari || [];
        const toplam = data.sayacToplam || 0;
        const hedef = data.hedefAdet || 10;
        const kalan = Math.max(0, hedef - toplam);

        // Geçen süre
        const gecenSureEl = document.getElementById('gecenSure');
        if (gecenSureEl) gecenSureEl.textContent = formatSure(gecenMs);

        // Hız hesaplama: Son 10 gönderim arasındaki ortalama süreye göre
        let formDakika = 0;
        let tahminiKalanMs = 0;

        if (zamanlari.length >= 2) {
            // Son N gönderim zaman aralığını kullan
            const sonN = zamanlari.slice(-10);
            const aralik = sonN[sonN.length - 1] - sonN[0];
            const gonderimSayisi = sonN.length - 1;

            if (aralik > 0 && gonderimSayisi > 0) {
                const ortalamaMs = aralik / gonderimSayisi; // Bir form başına ortalama ms
                formDakika = 60000 / ortalamaMs; // Form/dakika
                tahminiKalanMs = kalan * ortalamaMs;
            }
        } else if (zamanlari.length === 1 && gecenMs > 0) {
            // Henüz 1 gönderim var
            formDakika = toplam / (gecenMs / 60000);
            if (formDakika > 0) {
                tahminiKalanMs = (kalan / formDakika) * 60000;
            }
        }

        // Hız badge
        const hizBadge = document.getElementById('hizBadge');
        if (hizBadge) hizBadge.textContent = `${formDakika.toFixed(1)}/dk`;

        // Kalan süre
        const kalanSureEl = document.getElementById('kalanSure');
        if (kalanSureEl) {
            if (kalan === 0) {
                kalanSureEl.textContent = '✅ Bitti!';
                kalanSureEl.style.color = 'var(--green)';
            } else if (tahminiKalanMs > 0) {
                kalanSureEl.textContent = formatSure(tahminiKalanMs);
                kalanSureEl.style.color = 'var(--accent2)';
            } else {
                kalanSureEl.textContent = 'Hesaplanıyor...';
                kalanSureEl.style.color = 'var(--muted)';
            }
        }

        // İlerleme çubuğu
        const progressPct = hedef > 0 ? Math.min(100, (toplam / hedef) * 100) : 0;
        const progressFill = document.getElementById('etaProgressFill');
        if (progressFill) progressFill.style.width = `${progressPct}%`;

        const progressText = document.getElementById('etaProgressText');
        if (progressText) progressText.textContent = `${toplam} / ${hedef}`;

        const progressPctEl = document.getElementById('etaProgressPct');
        if (progressPctEl) progressPctEl.textContent = `%${Math.round(progressPct)}`;
    });
}

function hizTimerBaslat() {
    if (hizTimerId) clearInterval(hizTimerId);
    hizTimerId = setInterval(() => {
        chrome.storage.local.get({ botAktif: false }, (data) => {
            if (data.botAktif) {
                hizHesapla();
            }
        });
    }, 1000);
}

// --- ŞİFRE KORUMA SİSTEMİ ---

// Basit hash fonksiyonu (şifreyi düz metin olarak saklamak yerine)
function basitHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }

    let hash2 = 5381;
    for (let i = 0; i < str.length; i++) {
        hash2 = (hash2 * 33) ^ str.charCodeAt(i);
    }
    return `${hash.toString(36)}_${hash2.toString(36)}`;
}

function sifreDurumGuncelle(sifreHash) {
    const durumEl = document.getElementById('sifreDurumMetni');
    const degistirBtn = document.getElementById('sifreDegistirBtn');
    const kaldirBtn = document.getElementById('sifreKaldirBtn');

    if (!durumEl) return;

    chrome.storage.local.get({ lisansDurumu: false }, (data) => {
        if (!data.lisansDurumu) {
            durumEl.textContent = '🔒 Şifre Koruması (Premium)';
            durumEl.style.color = 'var(--muted)';
            if (degistirBtn) {
                degistirBtn.textContent = '🔒 Şifre Belirle';
                degistirBtn.disabled = true;
            }
            if (kaldirBtn) kaldirBtn.style.display = 'none';
            if (sifreHash) {
                chrome.storage.local.set({ panelSifresi: '' });
            }
        } else {
            if (degistirBtn) degistirBtn.disabled = false;
            if (sifreHash) {
                durumEl.textContent = 'Şifre: ✅ Aktif';
                durumEl.style.color = 'var(--green)';
                if (degistirBtn) degistirBtn.textContent = '🔑 Şifre Değiştir';
                if (kaldirBtn) kaldirBtn.style.display = 'block';
            } else {
                durumEl.textContent = 'Şifre: Aktif Değil';
                durumEl.style.color = 'var(--muted)';
                if (degistirBtn) degistirBtn.textContent = '🔑 Şifre Belirle';
                if (kaldirBtn) kaldirBtn.style.display = 'none';
            }
        }
    });
}

// Kilit Açma Butonu
document.getElementById('kilidAcBtn').addEventListener('click', () => {
    const input = document.getElementById('kilidSifreInput');
    const hata = document.getElementById('kilidHataMesaji');
    const girilen = input.value;

    if (!girilen) {
        hata.textContent = 'Lütfen şifrenizi girin!';
        input.style.borderColor = 'var(--red)';
        return;
    }

    chrome.storage.local.get({ panelSifresi: '' }, (data) => {
        if (basitHash(girilen) === data.panelSifresi) {
            // Doğru şifre
            input.style.borderColor = 'var(--green)';
            hata.textContent = '';
            sifreDogrulandi();
        } else {
            // Yanlış şifre
            hata.textContent = '❌ Yanlış şifre!';
            input.style.borderColor = 'var(--red)';
            input.value = '';
            input.focus();

            // Titreme animasyonu
            const ekran = document.getElementById('kilidEkrani');
            ekran.style.animation = 'none';
            ekran.offsetHeight; // reflow
            ekran.style.animation = 'shake 0.4s ease';
        }
    });
});

// Enter tuşuyla kilit açma
document.getElementById('kilidSifreInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('kilidAcBtn').click();
    }
});

// Şifre Kurulum - Kaydet
document.getElementById('sifreKaydetBtn').addEventListener('click', () => {
    const sifre = document.getElementById('yeniSifreInput').value;
    const tekrar = document.getElementById('yeniSifreTekrarInput').value;
    const hata = document.getElementById('kurulumHataMesaji');

    if (sifre.length < 5) {
        hata.textContent = 'Şifre en az 5 karakter olmalı!';
        return;
    }
    if (sifre !== tekrar) {
        hata.textContent = 'Şifreler eşleşmiyor!';
        return;
    }

    const hash = basitHash(sifre);
    chrome.storage.local.set({ panelSifresi: hash, sifreIlkKurulum: false }, () => {
        hata.textContent = '';
        sifreDogrulandi();
    });
});

// Enter tuşuyla şifre kurulumu
document.getElementById('yeniSifreTekrarInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('sifreKaydetBtn').click();
    }
});

// Şifresiz Devam Et
document.getElementById('sifreAtlaBtn').addEventListener('click', () => {
    chrome.storage.local.set({ sifreIlkKurulum: false }, () => {
        sifreDogrulandi();
    });
});

// Şifre Değiştir (Geniş Ekran panelinden)
document.getElementById('sifreDegistirBtn').addEventListener('click', () => {
    chrome.storage.local.get({ panelSifresi: '', lisansDurumu: false }, (data) => {
        if (!data.lisansDurumu) {
            alert('Şifre koruması premium bir özelliktir!');
            return;
        }
        if (data.panelSifresi) {
            // Mevcut şifreyi sor
            const mevcut = prompt('Mevcut şifrenizi girin:');
            if (!mevcut) return;
            if (basitHash(mevcut) !== data.panelSifresi) {
                setStatus('Mevcut şifre yanlış!', 'err');
                return;
            }
        }

        const yeni = prompt('Yeni şifre girin (min 5 karakter):');
        if (!yeni || yeni.length < 5) {
            setStatus('Şifre en az 5 karakter olmalı!', 'err');
            return;
        }

        const tekrar = prompt('Yeni şifreyi tekrar girin:');
        if (yeni !== tekrar) {
            setStatus('Şifreler eşleşmiyor!', 'err');
            return;
        }

        chrome.storage.local.set({ panelSifresi: basitHash(yeni), sifreIlkKurulum: false }, () => {
            setStatus('Şifre başarıyla güncellendi ✓', 'ok');
            sifreDurumGuncelle(basitHash(yeni));
        });
    });
});

// Şifreyi Kaldır
document.getElementById('sifreKaldirBtn').addEventListener('click', () => {
    chrome.storage.local.get({ panelSifresi: '', lisansDurumu: false }, (data) => {
        if (!data.lisansDurumu) return;
        if (!data.panelSifresi) return;

        const mevcut = prompt('Şifreyi kaldırmak için mevcut şifrenizi girin:');
        if (!mevcut) return;
        if (basitHash(mevcut) !== data.panelSifresi) {
            setStatus('Şifre yanlış!', 'err');
            return;
        }

        chrome.storage.local.set({ panelSifresi: '', sifreIlkKurulum: false }, () => {
            setStatus('Şifre kaldırıldı ✓', 'ok');
            sifreDurumGuncelle('');
        });
    });
});

// --- DESTEK & TICKET SİSTEMİ ---

let activeClientTicketId = null;
let clientChatInterval = null;
let clientLastMsgCount = 0;

// Tab Geçişleri
const ticketYeniTabBtn = document.getElementById('ticketYeniTabBtn');
const ticketListeTabBtn = document.getElementById('ticketListeTabBtn');
const ticketYeniBolumu = document.getElementById('ticketYeniBolumu');
const ticketListeBolumu = document.getElementById('ticketListeBolumu');
const ticketChatBolumu = document.getElementById('ticketChatBolumu');

if (ticketYeniTabBtn && ticketListeTabBtn) {
    ticketYeniTabBtn.addEventListener('click', () => {
        ticketYeniTabBtn.classList.add('active');
        ticketListeTabBtn.classList.remove('active');

        ticketYeniBolumu.style.display = 'flex';
        ticketListeBolumu.style.display = 'none';
        if (ticketChatBolumu) ticketChatBolumu.style.display = 'none';

        if (clientChatInterval) {
            clearInterval(clientChatInterval);
            clientChatInterval = null;
        }
        activeClientTicketId = null;
    });

    ticketListeTabBtn.addEventListener('click', () => {
        ticketListeTabBtn.classList.add('active');
        ticketYeniTabBtn.classList.remove('active');

        ticketYeniBolumu.style.display = 'none';
        ticketListeBolumu.style.display = 'flex';
        if (ticketChatBolumu) ticketChatBolumu.style.display = 'none';

        if (clientChatInterval) {
            clearInterval(clientChatInterval);
            clientChatInterval = null;
        }
        activeClientTicketId = null;

        ticketsYukle();
    });
}

function ticketsYukle() {
    const container = document.getElementById('ticketListeContainer');
    const badge = document.getElementById('ticketCountBadge');
    if (!container) return;

    chrome.storage.local.get({ clientId: '' }, (data) => {
        const clientId = data.clientId || 'unknown';
        const feedbackUrl = 'http://localhost/backend/feedback.php';

        fetch(feedbackUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'list',
                client_id: clientId
            })
        })
        .then(res => res.json())
        .then(resData => {
            if (resData.status === 'success' && resData.tickets) {
                const tickets = resData.tickets;
                if (badge) badge.textContent = `(${tickets.length})`;

                container.innerHTML = '';
                if (tickets.length === 0) {
                    container.innerHTML = '<div style="font-size: 8px; color: var(--muted); text-align: center; padding: 10px 0;">Henüz açılmış destek talebiniz yok.</div>';
                    return;
                }

                tickets.forEach(ticket => {
                    const item = document.createElement('div');
                    item.className = 'ticket-item';
                    item.style.padding = '8px 6px';
                    item.style.cursor = 'pointer';

                    const header = document.createElement('div');
                    header.className = 'ticket-header';

                    const idLabel = document.createElement('span');
                    idLabel.className = 'ticket-id';
                    idLabel.textContent = `Talep #${ticket.id}`;

                    const rightHeader = document.createElement('div');
                    rightHeader.style.display = 'flex';
                    rightHeader.style.gap = '6px';
                    rightHeader.style.alignItems = 'center';

                    // Formatted Date
                    const ticketDate = document.createElement('span');
                    ticketDate.className = 'ticket-date';
                    const dateObj = new Date(ticket.created_at);
                    ticketDate.textContent = dateObj.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

                    const statusIndicator = document.createElement('span');
                    statusIndicator.className = `ticket-status ${ticket.status}`;
                    
                    if (ticket.status === 'open') {
                        statusIndicator.textContent = '● Açık';
                    } else if (ticket.status === 'answered') {
                        statusIndicator.textContent = '● Yanıtlandı';
                    } else if (ticket.status === 'closed') {
                        statusIndicator.textContent = '● Kapatıldı';
                    }

                    rightHeader.appendChild(ticketDate);
                    rightHeader.appendChild(statusIndicator);
                    header.appendChild(idLabel);
                    header.appendChild(rightHeader);

                    const snippet = document.createElement('div');
                    snippet.className = 'ticket-body collapsed';
                    // Find the last user message or initial message
                    const lastMsg = (ticket.messages && ticket.messages.length > 0) ? ticket.messages[ticket.messages.length - 1].message : '';
                    snippet.textContent = lastMsg || 'Detayları görmek için tıklayın...';

                    item.appendChild(header);
                    item.appendChild(snippet);

                    // Click to open Chat View
                    item.addEventListener('click', (e) => {
                        if (window.getSelection().toString()) return;
                        openClientChat(ticket.id, ticket.status, ticket.email);
                    });

                    container.appendChild(item);
                });
            } else {
                container.innerHTML = '<div style="font-size: 8px; color: var(--red); text-align: center; padding: 10px 0;">Veri yüklenemedi!</div>';
            }
        })
        .catch(err => {
            console.error('Destek listeleme hatası:', err);
            container.innerHTML = '<div style="font-size: 8px; color: var(--red); text-align: center; padding: 10px 0;">Bağlantı hatası!</div>';
        });
    });
}

function openClientChat(ticketId, ticketStatus, email) {
    activeClientTicketId = ticketId;
    clientLastMsgCount = 0;

    const chatTitle = document.getElementById('ticketChatTitle');
    const chatStatus = document.getElementById('ticketChatStatus');
    const replyInput = document.getElementById('ticketChatReplyInput');
    const replyBtn = document.getElementById('ticketChatReplyBtn');
    const inputArea = document.getElementById('ticketChatInputArea');
    const closedMsg = document.getElementById('ticketChatClosedMsg');

    if (chatTitle) chatTitle.textContent = `Talep #${ticketId}`;

    if (chatStatus) {
        chatStatus.className = `ticket-status ${ticketStatus}`;
        if (ticketStatus === 'open') {
            chatStatus.textContent = '● Açık';
        } else if (ticketStatus === 'answered') {
            chatStatus.textContent = '● Yanıtlandı';
        } else if (ticketStatus === 'closed') {
            chatStatus.textContent = '● Kapatıldı';
        }
    }

    if (ticketStatus === 'closed') {
        if (inputArea) inputArea.style.display = 'none';
        if (closedMsg) closedMsg.style.display = 'block';
    } else {
        if (inputArea) inputArea.style.display = 'flex';
        if (closedMsg) closedMsg.style.display = 'none';
    }

    // Toggle view visibility
    if (ticketListeBolumu) ticketListeBolumu.style.display = 'none';
    if (ticketChatBolumu) ticketChatBolumu.style.display = 'flex';

    if (replyInput) replyInput.value = '';

    // Draw chat contents immediately
    fetchAndDrawChat(ticketId);

    // Poll every 3 seconds for admin responses
    if (clientChatInterval) clearInterval(clientChatInterval);
    clientChatInterval = setInterval(() => {
        if (activeClientTicketId === ticketId) {
            fetchAndDrawChat(ticketId, true);
        }
    }, 3000);
}

function fetchAndDrawChat(ticketId, silent = false) {
    chrome.storage.local.get({ clientId: '' }, (data) => {
        const clientId = data.clientId || 'unknown';
        const feedbackUrl = 'http://localhost/backend/feedback.php';

        fetch(feedbackUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'list',
                client_id: clientId
            })
        })
        .then(res => res.json())
        .then(resData => {
            if (resData.status === 'success' && resData.tickets) {
                const ticket = resData.tickets.find(t => t.id == ticketId);
                if (!ticket) return;

                // Sync status indicator in header
                const chatStatus = document.getElementById('ticketChatStatus');
                if (chatStatus) {
                    chatStatus.className = `ticket-status ${ticket.status}`;
                    if (ticket.status === 'open') chatStatus.textContent = '● Açık';
                    else if (ticket.status === 'answered') chatStatus.textContent = '● Yanıtlandı';
                    else if (ticket.status === 'closed') chatStatus.textContent = '● Kapatıldı';
                }

                const inputArea = document.getElementById('ticketChatInputArea');
                const closedMsg = document.getElementById('ticketChatClosedMsg');
                if (ticket.status === 'closed') {
                    if (inputArea) inputArea.style.display = 'none';
                    if (closedMsg) closedMsg.style.display = 'block';
                } else {
                    if (inputArea) inputArea.style.display = 'flex';
                    if (closedMsg) closedMsg.style.display = 'none';
                }

                const messages = ticket.messages || [];
                if (silent && messages.length === clientLastMsgCount) {
                    return;
                }

                clientLastMsgCount = messages.length;

                const container = document.getElementById('ticketChatMessages');
                if (!container) return;

                container.innerHTML = '';
                if (messages.length === 0) {
                    container.innerHTML = '<div style="font-size: 8px; color: var(--muted); text-align: center; padding: 10px 0;">Sohbet geçmişi boş.</div>';
                    return;
                }

                messages.forEach(msg => {
                    const wrap = document.createElement('div');
                    wrap.className = 'chat-bubble-wrapper';

                    const bubble = document.createElement('div');
                    bubble.className = `chat-bubble ${msg.sender}`;

                    const text = document.createElement('div');
                    text.textContent = msg.message;

                    const time = document.createElement('span');
                    time.className = 'chat-bubble-time';
                    const d = new Date(msg.created_at);
                    time.textContent = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

                    bubble.appendChild(text);
                    bubble.appendChild(time);
                    wrap.appendChild(bubble);
                    container.appendChild(wrap);
                });

                container.scrollTop = container.scrollHeight;
            }
        })
        .catch(err => console.error('Mesajlar çekilirken hata:', err));
    });
}

// Back Button Action
const ticketChatBackBtn = document.getElementById('ticketChatBackBtn');
if (ticketChatBackBtn) {
    ticketChatBackBtn.addEventListener('click', () => {
        if (clientChatInterval) {
            clearInterval(clientChatInterval);
            clientChatInterval = null;
        }
        activeClientTicketId = null;

        if (ticketChatBolumu) ticketChatBolumu.style.display = 'none';
        if (ticketListeBolumu) ticketListeBolumu.style.display = 'flex';

        ticketsYukle();
    });
}

// Send Reply Actions
const ticketChatReplyBtn = document.getElementById('ticketChatReplyBtn');
const ticketChatReplyInput = document.getElementById('ticketChatReplyInput');

if (ticketChatReplyBtn && ticketChatReplyInput) {
    ticketChatReplyBtn.addEventListener('click', () => {
        const text = ticketChatReplyInput.value.trim();
        if (!text || !activeClientTicketId) return;

        ticketChatReplyBtn.disabled = true;
        ticketChatReplyBtn.textContent = '...';

        chrome.storage.local.get({ clientId: '' }, (data) => {
            const clientId = data.clientId || 'unknown';
            const feedbackUrl = 'http://localhost/backend/feedback.php';

            fetch(feedbackUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'client_reply',
                    ticket_id: activeClientTicketId,
                    client_id: clientId,
                    reply_text: text
                })
            })
            .then(res => res.json())
            .then(resData => {
                ticketChatReplyBtn.disabled = false;
                ticketChatReplyBtn.textContent = 'GÖNDER';
                if (resData.status === 'success') {
                    ticketChatReplyInput.value = '';
                    fetchAndDrawChat(activeClientTicketId);
                } else {
                    alert('Hata: ' + resData.message);
                }
            })
            .catch(err => {
                ticketChatReplyBtn.disabled = false;
                ticketChatReplyBtn.textContent = 'GÖNDER';
                console.error('Yanıt hatası:', err);
                alert('Bağlantı hatası!');
            });
        });
    });

    ticketChatReplyInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            ticketChatReplyBtn.click();
        }
    });
}

// Yeni Talep Gönderme
document.getElementById('feedbackGonderBtn').addEventListener('click', () => {
    const emailInput = document.getElementById('feedbackEmailInput');
    const msgInput = document.getElementById('feedbackMsgInput');
    const hata = document.getElementById('feedbackHataMesaji');

    const email = emailInput.value.trim();
    const msg = msgInput.value.trim();

    if (!email) {
        hata.textContent = 'Lütfen e-posta adresinizi girin!';
        hata.style.color = 'var(--red)';
        emailInput.style.borderColor = 'var(--red)';
        return;
    }

    if (!email.includes('@') || !email.includes('.')) {
        hata.textContent = 'Geçersiz e-posta adresi!';
        hata.style.color = 'var(--red)';
        emailInput.style.borderColor = 'var(--red)';
        return;
    }

    const parts = email.split('@');
    const domain = parts[1] ? parts[1].toLowerCase().trim() : '';
    const allowedDomains = [
        'gmail.com',
        'outlook.com',
        'outlook.com.tr',
        'hotmail.com',
        'hotmail.com.tr',
        'yahoo.com',
        'yandex.com',
        'yandex.com.tr',
        'live.com',
        'windowslive.com',
        'icloud.com'
    ];

    if (!allowedDomains.includes(domain)) {
        hata.textContent = 'Yalnızca genel e-posta sağlayıcıları (gmail, hotmail, outlook, yandex vb.) kabul edilmektedir!';
        hata.style.color = 'var(--red)';
        emailInput.style.borderColor = 'var(--red)';
        return;
    }

    if (!msg) {
        hata.textContent = 'Lütfen detayları yazın!';
        hata.style.color = 'var(--red)';
        msgInput.style.borderColor = 'var(--red)';
        return;
    }

    hata.textContent = 'Gönderiliyor...';
    hata.style.color = 'var(--text)';
    document.getElementById('feedbackGonderBtn').disabled = true;

    chrome.storage.local.get({ clientId: '' }, (data) => {
        const feedbackUrl = 'http://localhost/backend/feedback.php';
        fetch(feedbackUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'create',
                client_id: data.clientId || 'unknown',
                email: email,
                message: msg
            })
        })
        .then(res => res.json())
        .then(resData => {
            document.getElementById('feedbackGonderBtn').disabled = false;
            if (resData.status === 'success') {
                hata.textContent = '✓ Destek talebi oluşturuldu!';
                hata.style.color = 'var(--green)';
                emailInput.value = '';
                msgInput.value = '';
                emailInput.style.borderColor = '';
                msgInput.style.borderColor = '';
                
                setTimeout(() => {
                    hata.textContent = '';
                    if (ticketListeTabBtn) ticketListeTabBtn.click();
                }, 1500);
            } else {
                hata.textContent = '❌ Hata: ' + resData.message;
                hata.style.color = 'var(--red)';
            }
        })
        .catch(err => {
            document.getElementById('feedbackGonderBtn').disabled = false;
            hata.textContent = '❌ Sunucu bağlantı hatası!';
            hata.style.color = 'var(--red)';
        });
    });
});

// Sayfa ilk yüklendiğinde talep sayısını çekmek için çağrıda bulun
chrome.storage.local.get({ clientId: '' }, (data) => {
    if (data.clientId) {
        const feedbackUrl = 'http://localhost/backend/feedback.php';
        fetch(feedbackUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'list', client_id: data.clientId })
        })
        .then(res => res.json())
        .then(resData => {
            if (resData.status === 'success' && resData.tickets) {
                const countBadge = document.getElementById('ticketCountBadge');
                if (countBadge) countBadge.textContent = `(${resData.tickets.length})`;
            }
        })
        .catch(e => console.error('İlk talep sayısı yükleme hatası:', e));
    }
});

const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        20% { transform: translateX(-8px); }
        40% { transform: translateX(8px); }
        60% { transform: translateX(-5px); }
        80% { transform: translateX(5px); }
    }
`;
document.head.appendChild(shakeStyle);
