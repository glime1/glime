# GLIME Android App — काम के नोट्स (अब तक की जानकारी)

यह फ़ाइल `ANDROID_APP_PLAN.md` की साथी है। Plan बताता है कि **क्या बनना है**; यह नोट बताता है कि **repo में क्या मिला, क्या तय हुआ, क्या अभी बाकी है**, ताकि काम बीच से बिना दोबारा खोज किए आगे बढ़ सके।

**अभी की स्थिति:** PWA का कोई भी code repo में push **नहीं** हुआ है। अब तक सिर्फ़ जाँच, डिज़ाइन और icon तैयार हुए हैं। नीचे "बाकी काम" में पूरी सूची है।

---

## 1. Repo में क्या मिला (जाँच के नतीजे)

### 1.1 जो चीज़ें नहीं हैं
- `manifest.json`: नहीं है। इसके बिना Chrome "Install app" नहीं दिखाता।
- `.nojekyll`: नहीं है। `CNAME` फ़ाइल है, यानी hosting GitHub Pages जैसी लगती है। वहाँ `/.well-known/` तभी serve होता है जब `.nojekyll` हो (Phase 5 में चाहिए)।
- Offline पेज: नहीं है।
- PNG icons: नहीं हैं। सिर्फ़ `glime_logo_clean.svg` है।

### 1.2 `sw.js` (मौजूदा)
- सिर्फ़ push notification संभालता है: `install` में `skipWaiting`, `activate` में `clients.claim`, `push`, `notificationclick`।
- `fetch` handler नहीं है और cache नहीं है।
- यह **सिर्फ़ तब** register होता है जब visitor cookie banner में "Accept" दबाए और notification की अनुमति दे (`cookie-consent.js` के `setupPush`, `register('/sw.js', {scope:'/'})`)।
- नतीजा: ज़्यादातर visitors के लिए service worker चलता ही नहीं, इसलिए app install नहीं हो सकता।

### 1.3 कौन-सी script किस पेज में जुड़ी है

| Script | कौन लोड करता है | किन पेजों पर |
|---|---|---|
| `glime-global-nav.js` | पेज के अपने `<script>` टैग से | 14 public पेज: index, about, demo, partner, partner-docs, packages, case-studies, why-glime, contact, portfolio, documentation, how-it-works, ai-problem-solver, glime-ai |
| `cookie-consent.js` | `glime-global-nav.js` (उसके शुरू में) | ऊपर वाले public पेज |
| `glime-app-shell.js` (+ `glime-app-shell.css`) | पेज के अपने `<script>` टैग से | dashboard, glime-intelligence-center, data-download |
| `glime-avatar.js`, `glime-push.js`, `client-data-export-addon.js` | `glime-app-shell.js` (`loadPhotoSystem`, `loadPushSystem`, `loadExportSystem`) | app-shell वाले पेज |
| `dashboard-notify.js` | dashboard.html | सिर्फ़ dashboard |
| `website-analytics.js` | पेज के अपने टैग से | index, login, demo, partner, partner-docs, packages, why-glime |

- `login.html` login के बाद `dashboard.html` पर भेजता है।
- `glime-app-shell.js` का `init()` आख़िर में तीन loader चलाता है; PWA script भी यहीं से जोड़ी जा सकती है, उसी तरीके से।

### 1.4 पेजों की बनावट जो install बैनर पर असर डालती है
- Dashboard मोबाइल पर **ऊपर वाली bar + बाएँ से खुलने वाला drawer** इस्तेमाल करता है। नीचे कोई bottom navigation नहीं है, इसलिए install बैनर नीचे रखा जा सकता है।
- `glime-global-nav.js` का "GLIME AI" floating बटन public पेजों पर `bottom: 88px`, `z-index: 901` पर है। Cookie banner `z-index: 2147482000` पर है। Install बैनर इनसे नीचे का z-index रखेगा और सिर्फ़ dashboard पर दिखेगा, इसलिए टकराव नहीं होगा।
- App-shell का मोबाइल drawer `z-index: 1001`, topbar `z-index: 30`।

### 1.5 Logo
- `glime_logo_clean.svg` animated है (G की तीन रेखाएँ, तीन चौकोर nodes, नीचे GLIME wordmark)। रंग: teal `#0b8f8c`, पन्ना `#7dffc4`।
- App icon के लिए सिर्फ़ G का निशान और तीन nodes लिए गए हैं, wordmark और animation हटाकर। Background `#071016` (Connector पेज वाला dark रंग)।
- Logo की geometry: तीन रेखाओं पर scale `1.3043 × 1.3394` का transform लगता है; हर node की जगह उसकी रेखा के शुरुआती बिंदु से मेल खाती है।

---

## 2. जिन औज़ारों की सीमाएँ मिलीं (इस session में)

- **GitHub tool सिर्फ़ text फ़ाइलें लिखता है।** PNG जैसी binary फ़ाइल इससे repo में नहीं जा सकती, इसलिए app icon **SVG** में बनाया गया है।
- `gh` CLI का token अमान्य है और `add_repo` ने "GitHub account link करें" कहा, यानी repo को session में clone करके `git push` नहीं हो सकता। सारी writing GitHub MCP tool से ही होगी।
- Proxy `raw.githubusercontent.com` को रोकता है (403)। फ़ाइल पढ़ने के लिए `get_file_contents` ही चलता है।
- सैंडबॉक्स के ImageMagick में SVG पढ़ने वाला `rsvg-convert` नहीं है, इसलिए SVG से PNG बनाकर जाँच नहीं हो सकी। PNG icons `-draw` से अलग बनाए गए थे।
- इसलिए जो चीज़ें पूरी तरह जाँची **नहीं** जा सकीं, वे नीचे "खुले सवाल" में हैं।

---

## 3. जो फ़ैसले हुए

1. **हर HTML पेज नहीं बदला जाएगा।** `glime-pwa.js` नाम की एक नई script बनेगी जो खुद `<link rel="manifest">` और `theme-color` जोड़ेगी। यह script सिर्फ़ दो जगह से लोड होगी: `glime-global-nav.js` (public पेज) और `glime-app-shell.js` (client पेज)। वजह: `dashboard.html`, `billing.html`, `index.html` जैसी बड़ी फ़ाइलें बार-बार दोबारा लिखनी पड़तीं।
2. **Service worker अब सबके लिए register होगा**, सिर्फ़ cookie/notification की अनुमति पर नहीं। इसमें push वाला पुराना code ज्यों का त्यों रहेगा, और सिर्फ़ `fetch` का offline fallback जुड़ेगा।
3. **सिर्फ़ page-navigation पर offline fallback।** Images, API calls या Supabase के requests को नहीं छुआ जाएगा, ताकि Razorpay और login जैसी चीज़ें बिगड़ें नहीं।
4. **Install बैनर सिर्फ़ `dashboard.html` पर**, Android Chrome पर असली "Install" बटन के साथ और iPhone Safari पर "Share → Add to Home Screen" निर्देश के साथ। 7 दिन के लिए dismiss हो सकेगा।
5. **`viewport-fit=cover` नहीं जोड़ा जाएगा।** पेजों में `env(safe-area-inset-*)` का इस्तेमाल नहीं है; इसे जोड़ने पर notch वाले फ़ोन में ऊपर की bar status bar के नीचे दब सकती है। इसलिए Phase 3 का "safe-area" वाला कदम अभी नहीं होगा।
6. **एक ही commit में सब कुछ** (`push_files` से), ताकि आधा-अधूरा PWA कभी live न हो।
7. **`start_url`: `/dashboard.html`**, `scope: /`, `display: standalone`, रंग `#071016`।

---

## 4. बाकी काम: बनने वाली फ़ाइलें और उनकी बनावट

### 4.1 नई फ़ाइलें

| फ़ाइल | क्या होगा |
|---|---|
| `manifest.json` | `id: "/"`, `name`/`short_name: GLIME`, `start_url`, `scope`, `display: standalone`, `background_color` और `theme_color: #071016`, `lang: en`, `categories: [business, productivity]`, icons (नीचे), और shortcuts: Leads, Orders, GLIME AI |
| `icons/icon.svg` | `purpose: any`, पूरे बैकग्राउंड के साथ G का निशान (नीचे कोड) |
| `icons/icon-maskable.svg` | `purpose: maskable`, निशान छोटा (सुरक्षित क्षेत्र में) (नीचे कोड) |
| `offline.html` | GLIME के dark रंगों में "You're offline" पेज, Retry बटन, और इंटरनेट लौटते ही अपने-आप reload |
| `glime-pwa.js` | manifest और meta जोड़ना, service worker register करना, standalone की पहचान (`<html>` पर `glime-standalone` class), dashboard पर install बैनर |

### 4.2 बदली जाने वाली फ़ाइलें

| फ़ाइल | बदलाव |
|---|---|
| `sw.js` | `CACHE = 'glime-shell-v1'` में `/offline.html` और `/icons/icon.svg` precache; `activate` में पुराने cache हटाना; `fetch` में सिर्फ़ `request.mode === 'navigate'` पर `fetch(request).catch(→ offline.html)`। Push और notification वाला code अछूता। ऊपर का comment ("सिर्फ़ cookie के बाद register") ठीक करना |
| `glime-app-shell.js` | एक छोटा `loadPwaSystem()` function (बाकी तीन loaders जैसा) और `init()` के आख़िर में उसका call |
| `glime-global-nav.js` | शुरू में, cookie-consent वाले हिस्से जैसा, `glime-pwa.js` लोड करने का छोटा हिस्सा |
| `ANDROID_APP_PLAN.md` | पूरे हुए कदमों पर `[x]` और icons के बारे में सुधार (SVG, PNG बाद में) |

### 4.3 `glime-pwa.js` में क्या-क्या

- `<link rel="manifest" href="/manifest.json">`, `theme-color`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-title` जोड़ना (अगर पहले से न हों)।
- `serviceWorker.register('/sw.js', {scope:'/'})`। अगर पेज पहले ही `load` हो चुका हो (script देर से जुड़ने पर), तो तुरंत register।
- `beforeinstallprompt` को पकड़कर रखना; dashboard पर बैनर में "Install" बटन से `prompt()` चलाना; `appinstalled` पर बैनर हटाना।
- iPhone/iPad (Safari, standalone नहीं) पर निर्देश वाला बैनर।
- Dismiss की याद `localStorage` में, `try/catch` के साथ। App पहले से installed (standalone) हो तो बैनर बिल्कुल नहीं।
- सार्वजनिक API: `window.GLIME_PWA = { install(), isStandalone() }`।
- बैनर का रंग रूप cookie banner जैसा (`#101b29`, ग्रेडिएंट बटन `#50f5a8 → #52e8ff`), और वह cookie banner से नीचे के z-index पर।

### 4.4 आइकन का कोड (तैयार, scratchpad में बना हुआ)

`icons/icon.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="GLIME">
<rect width="512" height="512" fill="#071016"/>
<g fill="none" stroke="#0b8f8c" stroke-width="37.7" stroke-linecap="square" stroke-linejoin="miter">
<polyline points="193.3,116.1 298.4,116.1 378.1,198.0 269.4,198.0 193.3,276.1 269.4,354.2 378.1,354.2 378.1,268.7"/>
<polyline points="198.4,124.3 118.7,206.1 118.7,314.0 198.4,395.9 303.4,395.9 375.9,321.5"/>
<polyline points="200.6,276.1 378.1,276.1"/>
</g>
<g fill="#0b8f8c">
<rect x="193.3" y="116.1" width="37.7" height="38.7"/>
<rect x="374.5" y="198.0" width="37.7" height="38.7"/>
<rect x="193.3" y="350.5" width="37.7" height="38.7"/>
</g></svg>
```

`icons/icon-maskable.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="GLIME">
<rect width="512" height="512" fill="#071016"/>
<g fill="none" stroke="#0b8f8c" stroke-width="30.4" stroke-linecap="square" stroke-linejoin="miter">
<polyline points="205.5,143.2 290.2,143.2 354.5,209.2 266.8,209.2 205.5,272.2 266.8,335.2 354.5,335.2 354.5,266.2"/>
<polyline points="209.5,149.8 145.2,215.8 145.2,302.8 209.5,368.8 294.3,368.8 352.7,308.8"/>
<polyline points="211.3,272.2 354.5,272.2"/>
</g>
<g fill="#0b8f8c">
<rect x="205.5" y="143.2" width="30.4" height="31.2"/>
<rect x="351.6" y="209.2" width="30.4" height="31.2"/>
<rect x="205.5" y="332.2" width="30.4" height="31.2"/>
</g></svg>
```

### 4.5 Play Store के लिए PNG icon
PNG फ़ाइलें (192 और 512, maskable) सैंडबॉक्स में बनी हैं, पर GitHub tool से repo में नहीं जा सकतीं। Play Store को 512×512 PNG चाहिए ही, और plan में यह आपको देना तय है। इसलिए 512 वाली PNG अलग से आपको भेजी जाएगी। चाहें तो उसे GitHub के वेब पेज से `icons/` folder में upload कर सकते हैं; तब मैं manifest में PNG भी जोड़ दूँगा।

---

## 5. खुले सवाल, जिन्हें असली फ़ोन पर जाँचना है

1. **सिर्फ़ SVG icons से Android Chrome "Install app" दिखाएगा या नहीं।** Chrome के दस्तावेज़ों के हिसाब से icon के लिए PNG, SVG या WebP चलते हैं, पर मैं इसे सैंडबॉक्स में चलाकर पक्का नहीं कर सका। अगर फ़ोन पर सिर्फ़ "Add to Home screen" दिखे, तो PNG upload वाला रास्ता (4.5) अपनाना होगा।
2. **PWABuilder गतिशील रूप से जोड़ा गया manifest पढ़ पाएगा या नहीं।** अगर नहीं पढ़ा, तो `index.html` में एक पंक्ति `<link rel="manifest" href="/manifest.json">` सीधे जोड़नी होगी (यह 115 KB की फ़ाइल है, इसलिए मैंने इसे अभी टाला है)।
3. **Service worker अब सब visitors के लिए चलेगा।** पहले सिर्फ़ cookie "Accept" के बाद चलता था। नया worker सिर्फ़ page-navigation पर नेटवर्क विफल होने पर offline पेज दिखाता है। फिर भी live होने के बाद login, Google login और Razorpay payment एक बार असली फ़ोन पर ज़रूर देखें।
4. **iPhone पर icon:** iOS `apple-touch-icon` के लिए SVG नहीं मानता। iPhone पर होम स्क्रीन icon तब तक पेज का स्क्रीनशॉट रहेगा जब तक PNG न मिले।

---

## 6. अब तक repo में हुए बदलाव (इसी session के)

| Commit | क्या |
|---|---|
| `d37047b` | `ai-connections.html`: पूरा पेज "unavailable" होने की जगह सारे connectors दिखें; ChatGPT/Claude पर "Upgrade plan to connect" |
| `46178f4` | `ai-connections.html`: Razorpay और Shiprocket Cargo जुड़े; upgrade बटन `billing.html?plan=omni` पर |
| `05af48e` | `billing.html`: `?plan=omni` पर Omni (₹1499) का card अपने-आप सामने आकर highlight |
| `54a9b49` | `settings-connector-addon.js`: Settings > Connector में भी वही upgrade बटन |
| `59e6e68` | `ANDROID_APP_PLAN.md` (phase-wise योजना) |
| इस commit | `ANDROID_APP_WORK_NOTES.md` (यह फ़ाइल) |

---

## 7. आगे का क्रम (काम फिर शुरू होने पर)

1. 4.1 और 4.2 की सारी फ़ाइलें एक ही `push_files` commit में push करना।
2. `ANDROID_APP_PLAN.md` में पूरे हुए कदमों पर `[x]` लगाना।
3. 512 PNG icon आपको भेजना और बताना कि फ़ोन पर कौन-सी जाँचें करनी हैं (खुले सवाल 1 से 3)।
4. आपकी जाँच के बाद ही Phase 5 (Play Store) शुरू होगा।
