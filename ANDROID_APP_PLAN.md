# GLIME — Android App Plan (PWA + Play Store)

लक्ष्य: glime.online को ऐसा app बनाना कि client उसे होम स्क्रीन से WhatsApp / LinkedIn की तरह खोले, बिना browser और address bar के। Website जैसी है वैसी ही चलती रहेगी, और website में हुआ हर बदलाव app में अपने-आप दिखेगा।

**तरीका:** पहले PWA (Progressive Web App), फिर उसी PWA को Play Store के लिए Android app (TWA) में लपेटना। Software दोबारा नहीं बनेगा।

**Status चिह्न:** `[ ]` बाकी · `[x]` पूरा

**ताज़ा स्थिति (27 अक्टूबर):** Phase 1 और 2 का code main में push हो चुका है, पर असली Android फ़ोन पर जाँच (Phase 4) अभी नहीं हुई है। पूरी जानकारी `ANDROID_APP_WORK_NOTES.md` में है।

---

## शुरुआत की स्थिति (repo जाँच के आधार पर)

- `manifest.json` repo में **नहीं** था। इसके बिना browser app install का विकल्प नहीं देता।
- `sw.js` था और सिर्फ़ push notification संभालता था। उसमें `fetch` handler और offline page नहीं था।
- `sw.js` सिर्फ़ तब register होता था जब visitor cookie और notification की अनुमति दे (`cookie-consent.js`)।
- Hosting GitHub Pages जैसी लगती है (`CNAME` फ़ाइल है)। वहाँ `.well-known` folder तभी serve होता है जब `.nojekyll` फ़ाइल मौजूद हो। यह फ़ाइल अभी नहीं है।
- Logo `glime_logo_clean.svg` है। Play Store के लिए PNG icons बनाने होंगे।
- `privacy.html`, `data-deletion.html`, `terms.html`, `refund-cancellation.html` पहले से हैं। Play Store को ये चाहिए।

---

## Phase 0 — पहले तय करने वाली बातें

इनके लिए ये default माने गए। आप बदलना चाहें तो बता दीजिए।

| बात | Default | Status |
|---|---|---|
| App का नाम | `GLIME` | [x] manifest में लगा |
| App खुलने पर पहला पेज | `dashboard.html` (login न हो तो `login.html` पर चला जाएगा) | [x] manifest में लगा |
| Theme रंग | `#071016` (Connector पेज वाला dark रंग) | [x] manifest में लगा |
| Android package id | `online.glime.app` | [ ] Phase 5 में |
| Google Play account का प्रकार | Personal या Organization (नीचे Phase 5 देखें) | [ ] आप तय करेंगे |

---

## Phase 1 — PWA की नींव (मैं करूँगा) — code push हो गया

सब कुछ `glime1/glime` repo में, सीधे main पर।

- [x] `manifest.json` बनाया: name, short_name, `start_url`, `scope`, `display: standalone`, `theme_color`, `background_color`, icons, और shortcuts (Leads, Orders, GLIME AI)।
- [x] App icons बनाए, पर **SVG** में (`icons/icon.svg`, `icons/icon-maskable.svg`), PNG में नहीं। कारण: GitHub tool binary फ़ाइल नहीं लिख सकता। PNG का काम नीचे "खुले सवाल" में है।
- [x] Manifest और `theme-color` हर पेज के `<head>` में अलग से लिखने की जगह, `glime-pwa.js` उन्हें खुद जोड़ती है। इसलिए dashboard, billing, index जैसी बड़ी फ़ाइलें बदलनी नहीं पड़ीं।
- [x] `sw.js` में `fetch` handler और offline fallback जोड़ा। Push का पुराना code अछूता है। सिर्फ़ page-navigation पर काम करता है।
- [x] `offline.html` बनाया: "You're offline" पेज, Try again बटन, और इंटरनेट लौटते ही अपने-आप reload।
- [x] Service worker अब `glime-pwa.js` से register होता है, notification की अनुमति पर निर्भर नहीं। (Push की अनुमति अब भी cookie banner से माँगी जाती है।)
- [x] `glime-pwa.js` दो जगह से लोड होती है: `glime-global-nav.js` (public पेज) और `glime-app-shell.js` (client पेज)।

**पूरा होने की पहचान:** Android Chrome में menu में "Install app" दिखे। **[ ] फ़ोन पर जाँच बाकी**

---

## Phase 2 — Install का अनुभव (मैं करूँगा) — code push हो गया

- [x] Dashboard पर "Install the GLIME app" बैनर, Install बटन के साथ (`beforeinstallprompt`)।
- [x] iPhone के लिए छोटा निर्देश: "Share, फिर Add to Home Screen"।
- [x] App पहले से install हो तो बैनर नहीं दिखता; "Not now" दबाने पर 7 दिन तक नहीं दिखता।
- [x] बैनर आपके मौजूदा dark theme से मेल खाता है।

---

## Phase 3 — App जैसा एहसास (मैं करूँगा)

- [ ] Phone के notch और नीचे की bar के लिए `safe-area`: **जानबूझकर नहीं किया।** इसके लिए हर पेज में `viewport-fit=cover` चाहिए, और पेज `env(safe-area-inset-*)` इस्तेमाल नहीं करते, इसलिए notch वाले फ़ोन में ऊपर की bar दब सकती है। फ़ोन पर जाँच के बाद ही तय होगा।
- [ ] Standalone mode में browser वाली चीज़ें (जैसे "← Dashboard" जैसे links) ठीक चलें: `<html>` पर `glime-standalone` class लगती है ताकि ज़रूरत पड़ने पर CSS से बदला जा सके। फ़ोन पर देखना बाकी।
- [ ] Android के Back बटन से app बंद होने की जगह पिछले पेज पर जाए: सामान्यतः अपने-आप होता है, फ़ोन पर जाँचना बाकी।
- [ ] Push notification की अनुमति app install के बाद, सही मौक़े पर माँगना।
- [ ] Pull-to-refresh और double-tap zoom से होने वाली परेशानी जाँचना।

---

## Phase 4 — जाँच (मैं और आप दोनों)

- [ ] Lighthouse PWA जाँच: installable होना, manifest और service worker का सही होना। (मैं)
- [ ] असली Android phone पर install करके देखना। (आप)
- [ ] Login: email से और "Continue with Google" से। (आप)
- [ ] Razorpay payment: billing पेज से, खासकर UPI वाला हिस्सा। (आप)
- [ ] Offline पेज और push notification चलते हैं। (आप)
- [ ] Connector पेज और Settings के सभी बटन app के अंदर चलते हैं। (आप)

कोई गड़बड़ मिले तो आप बताइए, मैं ठीक कर दूँगा।

---

## Phase 5 — Play Store पर Android app (आधा मैं, आधा आप)

PWA को Android app में लपेटा जाएगा (TWA: Trusted Web Activity)। इसमें app उसी website को Chrome के भरोसेमंद रूप में खोलता है।

**मैं करूँगा:**
- [ ] `.nojekyll` फ़ाइल जोड़ना, ताकि `/.well-known/` serve हो।
- [ ] `/.well-known/assetlinks.json` बनाना। इसमें app का package id और signing key का fingerprint चाहिए, जो आप signing key बनने के बाद मुझे देंगे।
- [ ] Store listing का मसौदा: छोटा और लंबा description, category, keywords।
- [ ] Data safety form के जवाबों का मसौदा, ताकि आपको सिर्फ़ चुनना पड़े।
- [ ] अगर PWABuilder जावास्क्रिप्ट से जोड़ा गया manifest नहीं पढ़ पाया, तो `index.html` में `<link rel="manifest" href="/manifest.json">` सीधे जोड़ना।

**आप करेंगे:**
- [ ] Google Play Developer account बनाना, एक बार लगभग **$25**।
  - *Personal account:* नए personal account पर Google अक्सर production में जाने से पहले कुछ testers के साथ कुछ दिन का closed testing माँगता है। यह नियम Play Console में खुद जाँच लीजिए।
  - *Organization account:* इसके लिए D-U-N-S number चाहिए और आमतौर पर यह शर्त नहीं होती।
- [ ] PWABuilder (pwabuilder.com) में `https://glime.online` डालकर Android package बनवाना। यह मैं आपके खाते से नहीं कर सकता। Signing key आपके पास सुरक्षित रहनी चाहिए।
- [ ] मुझे signing key का **SHA-256 fingerprint** देना (key नहीं, सिर्फ़ fingerprint)।
- [ ] 512×512 PNG icon (मैं भेजूँगा), 1024×500 feature graphic और 4–5 phone screenshots देना।
- [ ] Play Console में app upload करके "Publish" दबाना।

**Play Store की ज़रूरतें:**
- [ ] Privacy policy URL: `https://glime.online/privacy.html`
- [ ] Account deletion URL: `https://glime.online/data-deletion.html`
- [ ] Content rating और Data safety फ़ॉर्म भरना। (आप)

---

## Phase 6 — Launch के बाद

- Website में हुआ हर बदलाव app में अपने-आप दिखेगा। इसके लिए Play Store पर नया version डालना ज़रूरी नहीं।
- नया version तभी डालना पड़ेगा जब app का नाम, icon, package या permissions बदलें।
- Play Console में crash और ratings देखते रहना। (आप)
- Client को app की जानकारी: dashboard पर "App डाउनलोड करें" बैनर। (मैं)

---

## Phase 7 — बाद में (अभी नहीं)

- **iPhone:** अभी PWA को "Add to Home Screen" से चलाया जा सकता है। App Store पर रखने के लिए Apple Developer account (लगभग $99 साल) और Mac चाहिए। सिर्फ़ website जैसी app को Apple अक्सर reject कर देता है, इसलिए यह तभी करें जब app में कुछ अलग हो।
- **Capacitor:** अगर बाद में कैमरा, फ़ाइल या बेहतर notifications जैसी असली native सुविधाएँ चाहिए, तो उसी website को Capacitor में लपेटा जा सकता है।
- **पूरा native app:** अभी ज़रूरत नहीं। इसमें software नए सिरे से बनाना पड़ता है।

---

## खुले सवाल (फ़ोन पर ही पता चलेंगे)

1. **सिर्फ़ SVG icons से Android Chrome "Install app" दिखाएगा या नहीं।** Chrome के दस्तावेज़ों के हिसाब से PNG, SVG और WebP चलते हैं, पर इसे मैं चलाकर जाँच नहीं सका। अगर फ़ोन पर सिर्फ़ "Add to Home screen" दिखे, तो 192 और 512 PNG icons `icons/` folder में upload करनी होंगी (मैं भेज दूँगा), और फिर manifest में जोड़ दी जाएँगी।
2. **PWABuilder जावास्क्रिप्ट से जुड़ा manifest पढ़ पाएगा या नहीं** (ऊपर Phase 5 में इसका उपाय लिखा है)।
3. **Service worker अब सब visitors के लिए चलता है** (पहले सिर्फ़ cookie "Accept" के बाद)। यह सिर्फ़ page-navigation पर इंटरनेट न होने पर offline पेज दिखाता है। फिर भी login, Google login और Razorpay payment असली फ़ोन पर ज़रूर देखें।
4. **iPhone पर icon:** iOS `apple-touch-icon` के लिए SVG नहीं मानता, इसलिए होम स्क्रीन icon तब तक पेज का स्क्रीनशॉट रहेगा जब तक PNG न मिले।

---

## ज़िम्मेदारी एक नज़र में

| Phase | मैं | आप |
|---|---|---|
| 0 | default सुझाना | अलग चाहिए तो बताना |
| 1–3 | पूरा code (1–2 हो गए) | कुछ नहीं |
| 4 | Lighthouse जाँच, सुधार | phone पर जाँच, गड़बड़ बताना |
| 5 | `.nojekyll`, `assetlinks.json`, listing मसौदा | Play account, PWABuilder, key, images, Publish |
| 6 | install बैनर | Console देखना |

## जोखिम और सावधानियाँ

- Signing key खो गई तो app update नहीं हो पाएगा। इसकी copy सुरक्षित रखिए, और इसे कभी repo में मत डालिए।
- `assetlinks.json` में fingerprint गलत हुआ तो app में ऊपर address bar दिखेगा।
- Razorpay और Google login को असली फ़ोन पर ज़रूर जाँचिए (Phase 4)।
- Phase 1 से 3 में सिर्फ़ website की फ़ाइलें जुड़ीं या सुधरीं; मौजूदा पेजों का काम वही रहना चाहिए। इसकी पुष्टि Phase 4 की जाँच से होगी।
