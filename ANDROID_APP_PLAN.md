# GLIME — Android App Plan (PWA + Play Store)

लक्ष्य: glime.online को ऐसा app बनाना कि client उसे होम स्क्रीन से WhatsApp / LinkedIn की तरह खोले, बिना browser और address bar के। Website जैसी है वैसी ही चलती रहेगी, और website में हुआ हर बदलाव app में अपने-आप दिखेगा।

**तरीका:** पहले PWA (Progressive Web App), फिर उसी PWA को Play Store के लिए Android app (TWA) में लपेटना। Software दोबारा नहीं बनेगा।

**Status चिह्न:** `[ ]` बाकी · `[x]` पूरा

---

## आज की स्थिति (repo जाँच के आधार पर)

- `manifest.json` repo में **नहीं** है। इसके बिना browser app install करने का विकल्प नहीं देता।
- `sw.js` है और सिर्फ़ push notification संभालता है। उसमें `fetch` handler और offline page नहीं है।
- `sw.js` सिर्फ़ तब register होता है जब visitor cookie और notification की अनुमति दे (`cookie-consent.js`)। इसलिए install के लिए service worker को notification अनुमति से अलग करना होगा।
- Hosting GitHub Pages जैसी लगती है (`CNAME` फ़ाइल है)। वहाँ `.well-known` folder तभी serve होता है जब `.nojekyll` फ़ाइल मौजूद हो। यह फ़ाइल अभी नहीं है।
- Logo `glime_logo_clean.svg` है। Play Store के लिए PNG icons बनाने होंगे।
- `privacy.html`, `data-deletion.html`, `terms.html`, `refund-cancellation.html` पहले से हैं। Play Store को ये चाहिए।

---

## Phase 0 — पहले तय करने वाली बातें

इनके लिए मैं ये default मानकर चलूँगा। आप बदलना चाहें तो बता दीजिए।

| बात | Default | Status |
|---|---|---|
| App का नाम | `GLIME` | [ ] |
| App खुलने पर पहला पेज | `dashboard.html` (login न हो तो `login.html` पर चला जाएगा) | [ ] |
| Theme रंग | `#071016` (Connector पेज वाला dark रंग) | [ ] |
| Android package id | `online.glime.app` | [ ] |
| Google Play account का प्रकार | Personal या Organization (नीचे Phase 5 देखें) | [ ] आप तय करेंगे |

---

## Phase 1 — PWA की नींव (मैं करूँगा)

सब कुछ `glime1/glime` repo में, सीधे main पर।

- [ ] `manifest.json` बनाना: name, short_name, `start_url`, `scope`, `display: standalone`, `theme_color`, `background_color`, icons।
- [ ] `glime_logo_clean.svg` से PNG icons बनाना: `192×192`, `512×512`, और `maskable 512×512`, यानी icons folder।
- [ ] सभी client-वाले पेजों के `<head>` में जोड़ना: `<link rel="manifest">`, `<meta name="theme-color">`, `apple-touch-icon`। पेज: dashboard, login, signup, settings, billing, leads, orders, services, follow-up, ai-connections आदि।
- [ ] `sw.js` में `fetch` handler और offline fallback जोड़ना। पहले से बने push वाले हिस्से को बिल्कुल नहीं छुआ जाएगा।
- [ ] `offline.html` बनाना: "इंटरनेट नहीं है" वाला साफ़ पेज, GLIME के रंगों में।
- [ ] Service worker को cookie/notification अनुमति से अलग register करना, ताकि app install हो सके। Push की अनुमति अलग से, बाद में माँगी जाएगी।

**पूरा होने की पहचान:** Android Chrome में menu में "Install app" दिखे।

---

## Phase 2 — Install का अनुभव (मैं करूँगा)

- [ ] Dashboard पर "GLIME app install करें" बटन (`beforeinstallprompt`)।
- [ ] iPhone के लिए छोटा निर्देश: "Share, फिर Add to Home Screen"।
- [ ] App पहले से install हो तो बटन अपने-आप छिप जाए।
- [ ] बटन आपके मौजूदा dark theme से मेल खाए।

---

## Phase 3 — App जैसा एहसास (मैं करूँगा)

- [ ] Phone के notch और नीचे की bar के लिए `safe-area` की जगह छोड़ना।
- [ ] Standalone mode में browser वाली चीज़ें (जैसे "← Dashboard" जैसे links) ठीक चलें।
- [ ] Android के Back बटन से app बंद होने की जगह पिछले पेज पर जाए।
- [ ] Push notification की अनुमति app install के बाद, सही मौक़े पर माँगना (पहले से मौजूद `glime-push.js` से)।
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

**आप करेंगे:**
- [ ] Google Play Developer account बनाना, एक बार लगभग **$25**।
  - *Personal account:* नए personal account पर Google अक्सर production में जाने से पहले कुछ testers के साथ कुछ दिन का closed testing माँगता है। यह नियम Play Console में खुद जाँच लीजिए।
  - *Organization account:* इसके लिए D-U-N-S number चाहिए और आमतौर पर यह शर्त नहीं होती।
- [ ] PWABuilder (pwabuilder.com) में `https://glime.online` डालकर Android package बनवाना। यह मैं आपके खाते से नहीं कर सकता। Signing key आपके पास सुरक्षित रहनी चाहिए।
- [ ] मुझे signing key का **SHA-256 fingerprint** देना (key नहीं, सिर्फ़ fingerprint)।
- [ ] 512×512 icon, 1024×500 feature graphic और 4–5 phone screenshots देना।
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

## ज़िम्मेदारी एक नज़र में

| Phase | मैं | आप |
|---|---|---|
| 0 | default सुझाना | अलग चाहिए तो बताना |
| 1–3 | पूरा code | कुछ नहीं |
| 4 | Lighthouse जाँच, सुधार | phone पर जाँच, गड़बड़ बताना |
| 5 | `.nojekyll`, `assetlinks.json`, listing मसौदा | Play account, PWABuilder, key, images, Publish |
| 6 | install बैनर | Console देखना |

## जोखिम और सावधानियाँ

- Signing key खो गई तो app update नहीं हो पाएगा। इसकी copy सुरक्षित रखिए, और इसे कभी repo में मत डालिए।
- `assetlinks.json` में fingerprint गलत हुआ तो app में ऊपर address bar दिखेगा।
- Razorpay और Google login को असली phone पर ज़रूर जाँचिए (Phase 4)।
- Phase 1 से 3 में सिर्फ़ website की फ़ाइलें जुड़ेंगी या सुधरेंगी, मौजूदा पेजों का काम वही रहेगा।
