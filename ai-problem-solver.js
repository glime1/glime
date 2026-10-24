(() => {
  'use strict';

  /*
   * GLIME AI Business Problem Solver (frontend only).
   *
   * Lead saving expects this backend, to be created in Supabase "Glime 1":
   *   RPC   public.submit_problem_solver_lead(...)  -> uuid
   *   Table public.problem_solver_leads
   * If the RPC is missing or fails, the page offers a WhatsApp message instead
   * and keeps the payload in localStorage (glime_pending_solver_lead).
   *
   * Business logic is local; a future AI endpoint can replace scoreFeatures()/calc().
   */

  const SUPABASE_URL = 'https://ufoulgbiqgjriwapuopc.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';
  const WA_NUMBER = '918504926242';

  const L = (en, hi) => ({ en, hi });
  let lang = 'en';
  try {
    const s = localStorage.getItem('glime_solver_lang');
    if (s === 'en' || s === 'hi') lang = s;
  } catch (e) { /* ignore */ }

  const tx = o => (o ? (o[lang] || o.en || '') : '');
  const nf = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
  const inr = n => '₹' + nf.format(Math.max(0, Math.round(n)));
  const $ = s => document.querySelector(s);
  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };

  /* ---------------------------------------------------------------
     UI STRINGS
  --------------------------------------------------------------- */
  const UI = {
    eyebrow: L('GLIME REVENUE DIAGNOSIS', 'GLIME रेवेन्यू डायग्नोसिस'),
    h_t: L('Find where your business is losing revenue.', 'पता लगाइए कि आपका बिज़नेस कहाँ से कमाई खो रहा है।'),
    h_p: L('Answer 5 quick questions. Get your biggest revenue leak, the GLIME features that fix it, a package suggestion and an estimated impact based on your own numbers.',
           '5 छोटे सवालों के जवाब दीजिए। आपको मिलेगा: सबसे बड़ा revenue leak, उसे ठीक करने वाले GLIME features, पैकेज सुझाव और आपके अपने नंबरों से निकला अनुमानित असर।'),
    h_start: L('Start free diagnosis', 'फ़्री डायग्नोसिस शुरू करें'),
    h_note: L('About 2 minutes. No signup needed.', 'लगभग 2 मिनट। साइनअप की ज़रूरत नहीं।'),
    w1t: L('Your biggest leak', 'आपका सबसे बड़ा लीक'),
    w1d: L('See where revenue slips away, in rupees.', 'देखिए कमाई कहाँ से फिसल रही है, रुपयों में।'),
    w2t: L('The right features', 'सही features'),
    w2d: L('Only the GLIME features that match your business.', 'सिर्फ़ वही GLIME features जो आपके बिज़नेस से मेल खाते हैं।'),
    w3t: L('Estimated impact', 'अनुमानित असर'),
    w3d: L('Adjust your numbers and watch the range change live.', 'अपने नंबर बदलिए और रेंज को लाइव बदलते देखिए।'),
    sample: L('Sample preview', 'नमूना झलक'),
    f_about: L('About', 'हमारे बारे में'),
    f_priv: L('Privacy', 'प्राइवेसी'),
    f_terms: L('Terms', 'शर्तें'),
    f_ref: L('Refund & Cancellation', 'रिफ़ंड और कैंसिलेशन'),
    f_contact: L('Contact', 'संपर्क'),
    a_e: L('ANALYSING', 'विश्लेषण जारी'),
    a_t: L('Building your report…', 'आपकी रिपोर्ट बन रही है…'),
    a1: L('Reading your answers', 'आपके जवाब पढ़ रहे हैं'),
    a2: L('Finding the revenue leak', 'revenue leak ढूँढ रहे हैं'),
    a3: L('Matching GLIME features', 'GLIME features मिला रहे हैं'),
    a4: L('Estimating the impact', 'असर का अनुमान लगा रहे हैं'),

    back: L('Back', 'वापस'),
    next: L('Continue', 'आगे'),
    show: L('Show my report', 'मेरी रिपोर्ट दिखाइए'),
    step: L('STEP {n} OF 5', 'स्टेप {n} / 5'),
    e_pick: L('Please choose an option to continue.', 'आगे बढ़ने के लिए एक विकल्प चुनिए।'),
    e_ch: L('Choose at least one channel.', 'कम से कम एक चैनल चुनिए।'),
    e_two: L('Please answer both questions.', 'कृपया दोनों सवालों के जवाब दीजिए।'),
    e_aov: L('Please enter an order value above zero.', 'कृपया शून्य से ज़्यादा ऑर्डर वैल्यू लिखिए।'),

    n_enq: L('Customer enquiries per month', 'महीने में ग्राहकों की पूछताछ'),
    n_conv: L('Enquiries that become sales', 'पूछताछ में से कितनी बिक्री बनती है'),
    n_aov: L('Average order / deal value', 'औसत ऑर्डर / डील की कीमत'),
    n_hint: L('Not sure? We started with a typical value for your business type. Change it any time.', 'पक्का नहीं पता? हमने आपके बिज़नेस टाइप के हिसाब से सामान्य मान भरे हैं। कभी भी बदल सकते हैं।'),
    t_team: L('How big is your team?', 'आपकी टीम कितनी बड़ी है?'),
    t_hours: L('Does someone reply at night and on weekends?', 'क्या रात और छुट्टी के दिन कोई जवाब देता है?'),

    rp_e: L('YOUR REVENUE REPORT', 'आपकी रेवेन्यू रिपोर्ट'),
    rp_t: L('Here is what we found.', 'हमें यह मिला।'),
    restart: L('Start over', 'फिर से शुरू करें'),
    leak: L('BIGGEST LEAK', 'सबसे बड़ा लीक'),
    risk: L('Revenue at risk each month', 'हर महीने जोखिम में revenue'),
    base: L('Current monthly revenue from enquiries', 'पूछताछ से मौजूदा मासिक revenue'),
    rec: L('GLIME could help recover (estimate)', 'GLIME इतना वापस लाने में मदद कर सकता है (अनुमान)'),
    upRec: L('Possible extra revenue (estimate)', 'संभावित अतिरिक्त revenue (अनुमान)'),
    perMonth: L('per month', 'प्रति माह'),
    adjust: L('Adjust your numbers', 'अपने नंबर बदलिए'),
    assume: L('Assumes GLIME recovers {lo}% to {hi}% of the revenue at risk. Other features you add can bring more, but their effects overlap.',
              'मानकर चला गया है कि GLIME जोखिम वाले revenue का {lo}% से {hi}% वापस लाता है। और features जोड़ने पर ज़्यादा फ़ायदा हो सकता है, पर उनके असर आपस में मिलते हैं।'),
    assumeUp: L('Assumes better decisions lift revenue by {lo}% to {hi}%. This depends on acting on the insights.',
                'मानकर चला गया है कि बेहतर फ़ैसलों से revenue {lo}% से {hi}% बढ़ता है। यह इनसाइट पर काम करने पर निर्भर है।'),
    disc: L('Illustrative estimate calculated from the numbers you entered. It is not a guarantee and not a result from any client.',
            'आपके डाले नंबरों से निकला उदाहरण-अनुमान। यह कोई गारंटी नहीं है, और किसी क्लाइंट का नतीजा भी नहीं।'),
    cost: L('Cost of AI replies is small: from your pay-as-you-use wallet, 1,000 WhatsApp replies cost ₹20 and 1,000 Instagram replies cost ₹10.',
            'AI जवाबों का खर्च बहुत कम है: pay-as-you-use वॉलेट से 1,000 WhatsApp जवाब ₹20 और 1,000 Instagram जवाब ₹10 के पड़ते हैं।'),
    feat_h: L('Recommended GLIME features', 'सुझाए गए GLIME features'),
    feat_p: L('Ranked for your business. Start with the first one.', 'आपके बिज़नेस के हिसाब से क्रम में। पहले वाले से शुरू कीजिए।'),
    start: L('START HERE', 'यहाँ से शुरू करें'),
    nextUp: L('NEXT', 'अगला'),
    why: L('Why:', 'क्यों:'),
    first: L('First step:', 'पहला कदम:'),
    studies: L('See how each feature adds revenue', 'देखिए हर feature revenue कैसे बढ़ाता है'),
    pkg_h: L('Suggested package', 'सुझाया गया पैकेज'),
    pkg_trial: L('Start 7-day free trial', '7 दिन का फ़्री ट्रायल शुरू करें'),
    pkg_all: L('Compare all packages', 'सभी पैकेज देखें'),
    pkg_note: L('7-day free trial, no card required to start. The Packages page and billing system are the source of truth for prices. AI replies on WhatsApp and Instagram run from your pay-as-you-use wallet.',
                '7 दिन का फ़्री ट्रायल, शुरू करने के लिए कार्ड नहीं चाहिए। दामों के लिए पैकेज पेज और बिलिंग सिस्टम ही अंतिम स्रोत हैं। WhatsApp और Instagram पर AI के जवाब आपके pay-as-you-use वॉलेट से चलते हैं।'),
    pkgG: L('Practical start: core AI agents, 1,00,000 AI credits, AI replies within the 24-hour messaging window.',
            'व्यावहारिक शुरुआत: core AI agents, 1,00,000 AI क्रेडिट, 24 घंटे की मैसेजिंग विंडो में AI जवाब।'),
    pkgO: L('More headroom: 10,00,000 AI credits, message customers even beyond the 24-hour window, ChatGPT + Claude connectors, priority support.',
            'ज़्यादा गुंजाइश: 10,00,000 AI क्रेडिट, 24 घंटे की विंडो के बाद भी ग्राहकों को मैसेज, ChatGPT + Claude connectors, प्राथमिकता सपोर्ट।'),
    r_vol: L('High enquiry volume', 'पूछताछ की मात्रा ज़्यादा'),
    r_ch: L('Customers on 3 or more channels', '3 या ज़्यादा चैनलों पर ग्राहक'),
    r_feat: L('Several features needed together', 'कई features साथ चाहिए'),
    r_team: L('Larger team', 'बड़ी टीम'),
    r_win: L('Follow-ups after the 24-hour WhatsApp window are part of Omni', '24 घंटे की WhatsApp विंडो के बाद फ़ॉलो-अप Omni में आता है'),
    r_start: L('Easy to start small and upgrade later', 'छोटी शुरुआत करके बाद में अपग्रेड करना आसान'),
    plan_h: L('Your first 30 days', 'आपके पहले 30 दिन'),
    d1: L('Day 1', 'दिन 1'),
    d1t: L('Create your account and start the 7-day free trial.', 'अकाउंट बनाइए और 7 दिन का फ़्री ट्रायल शुरू कीजिए।'),
    d2: L('Days 2–7', 'दिन 2–7'),
    d3: L('Week 2', 'हफ़्ता 2'),
    d4: L('Weeks 3–4', 'हफ़्ते 3–4'),
    d5: L('Every week', 'हर हफ़्ते'),
    d5t: L('Check what is working and adjust.', 'देखिए क्या काम कर रहा है और उसी हिसाब से बदलाव कीजिए।'),
    lead_h: L('Want our team to help you set this up?', 'चाहते हैं हमारी टीम यह सेटअप करने में मदद करे?'),
    lead_p: L('Share your details and we will contact you with this report. Free, no obligation.', 'अपनी जानकारी दीजिए, हम इस रिपोर्ट के साथ आपसे संपर्क करेंगे। मुफ़्त, कोई बाध्यता नहीं।'),
    lf_name: L('Your name', 'आपका नाम'),
    lf_phone: L('Phone / WhatsApp number', 'फ़ोन / WhatsApp नंबर'),
    lf_biz: L('Business name (optional)', 'बिज़नेस का नाम (वैकल्पिक)'),
    lf_note: L('Anything we should know? (optional)', 'कुछ और बताना चाहें? (वैकल्पिक)'),
    lf_consent: L('I agree that GLIME may contact me about this enquiry.', 'मैं सहमत हूँ कि GLIME इस पूछताछ के बारे में मुझसे संपर्क कर सकता है।'),
    lf_priv: L('Privacy Policy', 'प्राइवेसी पॉलिसी'),
    lf_send: L('Send my report to GLIME', 'मेरी रिपोर्ट GLIME को भेजें'),
    lf_sending: L('Sending…', 'भेज रहे हैं…'),
    lf_ok: L('Thank you! Our team will contact you soon.', 'धन्यवाद! हमारी टीम जल्द ही आपसे संपर्क करेगी।'),
    lf_en: L('Please enter your name.', 'कृपया अपना नाम लिखिए।'),
    lf_ep: L('Please enter a valid phone number.', 'कृपया सही फ़ोन नंबर लिखिए।'),
    lf_ec: L('Please tick the consent box.', 'कृपया सहमति वाला बॉक्स टिक कीजिए।'),
    lf_ew: L('Please wait a minute before sending again.', 'दोबारा भेजने से पहले कृपया एक मिनट रुकिए।'),
    lf_fail: L('We could not send it automatically. Please send it to us on WhatsApp instead.', 'हम इसे अपने-आप नहीं भेज पाए। कृपया इसे हमें WhatsApp पर भेज दीजिए।'),
    wa_btn: L('Send on WhatsApp', 'WhatsApp पर भेजें'),
    share: L('Share on WhatsApp', 'WhatsApp पर शेयर करें'),
    print: L('Save as PDF / Print', 'PDF सेव / प्रिंट'),
    talk: L('Talk to us', 'हमसे बात करें')
  };

  /* ---------------------------------------------------------------
     DATA
  --------------------------------------------------------------- */
  const INDUSTRIES = [
    { id: 'shop', icon: '🛍️', t: L('Shop / online store', 'दुकान / ऑनलाइन स्टोर'), enq: 200, conv: 8, aov: 1500, add: { ord: 1, fu: 1 } },
    { id: 'food', icon: '🍽️', t: L('Food & restaurant', 'खाना / रेस्टोरेंट'), enq: 300, conv: 15, aov: 600, add: { wa: 1, ord: 1 } },
    { id: 'appt', icon: '💇', t: L('Salon, clinic, fitness', 'सैलून, क्लिनिक, फ़िटनेस'), enq: 150, conv: 20, aov: 1200, add: { fu: 1, wa: 1 } },
    { id: 'realestate', icon: '🏠', t: L('Real estate & construction', 'रियल एस्टेट / निर्माण'), enq: 60, conv: 3, aov: 100000, add: { leads: 2, voice: 1 } },
    { id: 'edu', icon: '🎓', t: L('Coaching & education', 'कोचिंग / शिक्षा'), enq: 120, conv: 10, aov: 12000, add: { leads: 1, fu: 1, ig: 1 } },
    { id: 'service', icon: '🧰', t: L('Services & agency', 'सेवाएँ / एजेंसी'), enq: 80, conv: 10, aov: 15000, add: { leads: 1, kb: 1 } },
    { id: 'b2b', icon: '🏭', t: L('B2B / distributor', 'B2B / डिस्ट्रीब्यूटर'), enq: 60, conv: 6, aov: 40000, add: { leads: 2, gi: 1 } },
    { id: 'other', icon: '✨', t: L('Something else', 'कुछ और'), enq: 150, conv: 10, aov: 2000, add: {} }
  ];

  const CHANNELS = [
    { id: 'wa', icon: '💬', t: L('WhatsApp', 'WhatsApp') },
    { id: 'ig', icon: '📸', t: L('Instagram', 'Instagram') },
    { id: 'call', icon: '📞', t: L('Phone calls', 'फ़ोन कॉल') },
    { id: 'web', icon: '🌐', t: L('Website / forms', 'वेबसाइट / फ़ॉर्म') },
    { id: 'walk', icon: '🚶', t: L('Walk-ins / offline', 'सीधे आने वाले / ऑफ़लाइन') }
  ];

  const PROBLEMS = [
    { id: 'slow', icon: '⏱️', t: L('Replies are slow or missed', 'जवाब देर से जाते हैं या छूट जाते हैं'), d: L('Customers message, but replies are late or missed.', 'ग्राहक मैसेज करते हैं, पर जवाब देर से जाते हैं या छूट जाते हैं।'), mode: 'missed', leak: 40, lo: 30, hi: 50, ll: L('Enquiries missed or answered late', 'जो पूछताछ छूटती है या देर से जवाब मिलता है') },
    { id: 'forgot', icon: '🕳️', t: L('Leads get forgotten', 'लीड भूल जाते हैं'), d: L('Enquiries come in, but nobody follows up properly.', 'पूछताछ आती है, पर ठीक से फ़ॉलो-अप नहीं होता।'), mode: 'missed', leak: 30, lo: 25, hi: 40, ll: L('Leads that never get a follow-up', 'जिन लीड का फ़ॉलो-अप कभी नहीं होता') },
    { id: 'repeatq', icon: '❓', t: L('Same questions again and again', 'वही सवाल बार-बार'), d: L('Your team keeps answering the same questions.', 'आपकी टीम वही सवाल बार-बार जवाब देती रहती है।'), mode: 'missed', leak: 25, lo: 30, hi: 45, ll: L('Enquiries that wait too long or get dropped', 'जो पूछताछ बहुत इंतज़ार करती है या छूट जाती है') },
    { id: 'orders', icon: '📦', t: L('Orders cancelled or returned', 'ऑर्डर कैंसिल या रिटर्न'), d: L('Confirmed orders still get cancelled or returned.', 'कन्फ़र्म ऑर्डर भी कैंसिल या रिटर्न हो जाते हैं।'), mode: 'orders', leak: 18, lo: 20, hi: 30, ll: L('Orders cancelled or returned', 'कैंसिल या रिटर्न होने वाले ऑर्डर') },
    { id: 'calls', icon: '☎️', t: L('Phone calls are missed', 'फ़ोन कॉल छूट जाते हैं'), d: L('Calls come when nobody can pick up.', 'कॉल तब आते हैं जब कोई उठा नहीं पाता।'), mode: 'missed', leak: 40, lo: 35, hi: 50, ll: L('Phone calls you miss', 'जो फ़ोन कॉल छूट जाते हैं') },
    { id: 'blind', icon: '📊', t: L('I do not know what is working', 'पता नहीं क्या चल रहा है'), d: L('You cannot see what is working and what is not.', 'आपको पता नहीं चलता कि क्या चल रहा है और क्या नहीं।'), mode: 'uplift', leak: 0, lo: 2, hi: 6, ll: null },
    { id: 'comeback', icon: '🔁', t: L('Customers do not come back', 'ग्राहक दोबारा नहीं लौटते'), d: L('People buy once and never return.', 'लोग एक बार खरीदते हैं और फिर नहीं लौटते।'), mode: 'repeat', leak: 60, lo: 8, hi: 15, ll: L('Buyers who never buy again', 'जो ग्राहक दोबारा नहीं खरीदते') },
    { id: 'booking', icon: '📅', t: L('Bookings and no-shows', 'बुकिंग और नो-शो'), d: L('Appointments are missed, cancelled or hard to manage.', 'अपॉइंटमेंट छूटते हैं, कैंसिल होते हैं या संभालना मुश्किल है।'), mode: 'orders', leak: 20, lo: 25, hi: 40, ll: L('Bookings that are no-shows or cancelled', 'नो-शो या कैंसिल होने वाली बुकिंग') }
  ];

  const TEAM = [
    { id: 'solo', t: L('Just me', 'सिर्फ़ मैं') },
    { id: 'small', t: L('2–5 people', '2–5 लोग') },
    { id: 'mid', t: L('6–20 people', '6–20 लोग') },
    { id: 'large', t: L('20+ people', '20+ लोग') }
  ];

  const HOURS = [
    { id: 'yes', t: L('Yes, someone replies', 'हाँ, कोई जवाब देता है') },
    { id: 'some', t: L('Sometimes', 'कभी-कभी') },
    { id: 'no', t: L('No, customers wait till morning', 'नहीं, ग्राहक सुबह तक इंतज़ार करते हैं') }
  ];

  const FEATURES = [
    { id: 'wa', icon: '💬', t: L('WhatsApp Sales AI', 'WhatsApp सेल्स AI'), en: 'WhatsApp Sales AI',
      d: L('Answers customers on WhatsApp instantly, 24×7, and guides interested buyers to order.', 'WhatsApp पर ग्राहकों को तुरंत, 24×7 जवाब देता है और इच्छुक ग्राहकों को ऑर्डर तक ले जाता है।'),
      first: L('Connect your WhatsApp number and add your products and prices.', 'अपना WhatsApp नंबर जोड़ें और प्रोडक्ट व दाम डालें।') },
    { id: 'ig', icon: '📸', t: L('Instagram Sales AI', 'Instagram सेल्स AI'), en: 'Instagram Sales AI',
      d: L('Replies to Instagram DMs instantly and turns interest into orders.', 'Instagram DM का तुरंत जवाब देता है और रुचि को ऑर्डर में बदलता है।'),
      first: L('Connect your Instagram business account.', 'अपना Instagram बिज़नेस अकाउंट जोड़ें।') },
    { id: 'leads', icon: '🎯', t: L('Leads Pipeline', 'लीड्स पाइपलाइन'), en: 'Leads Pipeline',
      d: L('Keeps every lead in one pipeline with stages and AI next-step suggestions.', 'हर लीड एक पाइपलाइन में, स्टेज और AI के अगले-कदम सुझावों के साथ।'),
      first: L('Let leads from your channels flow into the pipeline and give each one an owner.', 'चैनलों की लीड पाइपलाइन में आने दें और हर लीड का मालिक तय करें।') },
    { id: 'fu', icon: '🔁', t: L('Follow-up & Repeat Sales', 'फ़ॉलो-अप और रिपीट सेल्स'), en: 'Follow-up & Repeat Sales',
      d: L('Automatic reminders bring back cold leads and past customers.', 'अपने-आप रिमाइंडर से ठंडे लीड और पुराने ग्राहक वापस आते हैं।'),
      first: L('Set follow-up rules for new leads and past buyers.', 'नए लीड और पुराने ग्राहकों के लिए फ़ॉलो-अप नियम बनाएँ।') },
    { id: 'ord', icon: '📦', t: L('Orders & Shiprocket', 'ऑर्डर और Shiprocket'), en: 'Orders & Shiprocket',
      d: L('Confirm orders, manage them in one place and ship through Shiprocket.', 'ऑर्डर की पुष्टि, एक जगह प्रबंधन और Shiprocket से शिपिंग।'),
      first: L('Move your orders into GLIME and connect Shiprocket.', 'अपने ऑर्डर GLIME में लाएँ और Shiprocket जोड़ें।') },
    { id: 'voice', icon: '📞', t: L('Voice AI', 'Voice AI'), en: 'Voice AI',
      d: L('Answers calls, handles common questions and captures callers as leads.', 'कॉल उठाता है, आम सवालों के जवाब देता है और कॉल करने वाले को लीड बनाता है।'),
      first: L('Set up your Voice AI greeting and call handling.', 'अपना Voice AI ग्रीटिंग और कॉल-हैंडलिंग सेट करें।') },
    { id: 'kb', icon: '🧠', t: L('AI Knowledge Base', 'AI नॉलेज बेस'), en: 'AI Knowledge Base',
      d: L('Teach the AI your products, prices and policies once; it answers correctly on every channel, at any hour.', 'AI को प्रोडक्ट, दाम और नियम एक बार सिखाएँ; वह हर चैनल पर, हर समय सही जवाब देता है।'),
      first: L('Add your products, prices and FAQs to the Knowledge Base.', 'Knowledge Base में प्रोडक्ट, दाम और FAQ डालें।') },
    { id: 'gi', icon: '📈', t: L('Growth Intelligence', 'ग्रोथ इंटेलिजेंस'), en: 'Growth Intelligence',
      d: L('Turns your business data into insights and recommended actions.', 'आपके बिज़नेस डेटा को इनसाइट और सुझाए गए कदमों में बदलता है।'),
      first: L('Review the weekly insights and act on the top one.', 'हर हफ़्ते के इनसाइट देखें और सबसे ऊपर वाले पर काम करें।') }
  ];

  const WHY = {
    problem: L('Matches your main problem', 'आपकी मुख्य समस्या से मेल खाता है'),
    ch_wa: L('Customers reach you on WhatsApp', 'ग्राहक आपसे WhatsApp पर संपर्क करते हैं'),
    ch_ig: L('Customers reach you on Instagram', 'ग्राहक आपसे Instagram पर संपर्क करते हैं'),
    ch_call: L('You get phone calls', 'आपके पास फ़ोन कॉल आते हैं'),
    ch_web: L('Enquiries come from your website', 'पूछताछ आपकी वेबसाइट से आती है'),
    ch_walk: L('Offline customers can be followed up', 'ऑफ़लाइन ग्राहकों का फ़ॉलो-अप हो सकता है'),
    ind: L('A common need in your industry', 'आपकी इंडस्ट्री की आम ज़रूरत'),
    hrs: L('Nobody replies at night or weekends', 'रात या छुट्टी में कोई जवाब नहीं देता'),
    team: L('Helps a small team do more', 'छोटी टीम को ज़्यादा करने में मदद'),
    teamL: L('Gives a large team one clear view', 'बड़ी टीम को एक साफ़ तस्वीर देता है')
  };

  const PKG = {
    growth: { name: 'GLIME Growth', param: 'glime_growth', price: '₹299', per: L('/ month', '/ माह'), alt: L('or ₹2,999 / year', 'या ₹2,999 / साल'), tag: UI.pkgG },
    omni: { name: 'GLIME Omni', param: 'glime_omni', price: '₹1,499', per: L('/ month', '/ माह'), alt: L('or ₹15,999 / year', 'या ₹15,999 / साल'), tag: UI.pkgO }
  };

  const IND = Object.fromEntries(INDUSTRIES.map(x => [x.id, x]));
  const CH = Object.fromEntries(CHANNELS.map(x => [x.id, x]));
  const PB = Object.fromEntries(PROBLEMS.map(x => [x.id, x]));
  const TM = Object.fromEntries(TEAM.map(x => [x.id, x]));
  const HR = Object.fromEntries(HOURS.map(x => [x.id, x]));

  const STEP_META = [
    { t: L('What kind of business do you run?', 'आप किस तरह का बिज़नेस चलाते हैं?'), s: L('Pick the closest match.', 'सबसे नज़दीकी विकल्प चुनिए।') },
    { t: L('Where do your customers reach you?', 'आपके ग्राहक आपसे कहाँ संपर्क करते हैं?'), s: L('Select all that apply.', 'जितने लागू हों सब चुनिए।') },
    { t: L('What hurts the most right now?', 'अभी सबसे ज़्यादा परेशानी क्या है?'), s: L('Pick the one problem you would fix first.', 'वह एक समस्या चुनिए जिसे आप सबसे पहले ठीक करना चाहेंगे।') },
    { t: L('Your numbers', 'आपके नंबर'), s: L('A best guess is fine.', 'अंदाज़ा चलेगा।') },
    { t: L('Your team and timings', 'आपकी टीम और समय'), s: L('This decides how much work the AI should take over.', 'इससे तय होता है कि AI को कितना काम संभालना चाहिए।') }
  ];

  /* ---------------------------------------------------------------
     STATE
  --------------------------------------------------------------- */
  const fresh = () => ({
    step: 1, industry: '', channels: [], problem: '', team: '', hours: '',
    enq: 200, conv: 10, aov: 1500, leak: 30, numsKey: '',
    recs: [], lead: { name: '', phone: '', biz: '', note: '', consent: false }
  });
  let S = fresh();
  let view = 'hero';

  /* ---------------------------------------------------------------
     HELPERS
  --------------------------------------------------------------- */
  function applyStatic() {
    document.documentElement.lang = lang === 'hi' ? 'hi' : 'en';
    document.querySelectorAll('[data-i]').forEach(n => {
      const o = UI[n.getAttribute('data-i')];
      if (o) n.textContent = tx(o);
    });
    document.querySelectorAll('.lang-btn').forEach(b => {
      b.setAttribute('aria-pressed', b.dataset.lang === lang ? 'true' : 'false');
    });
  }

  function show(id, focusSel) {
    view = id;
    ['hero', 'wizard', 'analysis', 'report'].forEach(v => {
      const n = document.getElementById(v);
      if (n) n.hidden = v !== id;
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (focusSel) requestAnimationFrame(() => { const f = $(focusSel); if (f) f.focus({ preventScroll: true }); });
  }

  function setDefaults() {
    const k = S.industry + '|' + S.problem;
    if (S.numsKey === k) return;
    S.numsKey = k;
    const i = IND[S.industry], p = PB[S.problem];
    S.enq = i.enq; S.conv = i.conv; S.aov = i.aov; S.leak = p.leak || 0;
  }

  /* ---------------------------------------------------------------
     WIZARD
  --------------------------------------------------------------- */
  function optionGrid(host, items, key, multi, auto) {
    const grid = el('div', 'opt-grid');
    items.forEach((it, idx) => {
      const sel = multi ? S[key].includes(it.id) : S[key] === it.id;
      const b = el('button', 'opt' + (sel ? ' sel' : '') + (items.length % 2 && idx === items.length - 1 ? ' wide' : ''));
      b.type = 'button';
      b.setAttribute('aria-pressed', sel ? 'true' : 'false');
      b.innerHTML = '<span class="opt-ic" aria-hidden="true">' + it.icon + '</span><span><span class="opt-t">' + tx(it.t) + '</span>' + (it.d ? '<span class="opt-d">' + tx(it.d) + '</span>' : '') + '</span>';
      b.addEventListener('click', () => {
        if (multi) {
          const a = S[key], p = a.indexOf(it.id);
          if (p >= 0) a.splice(p, 1); else a.push(it.id);
          const on = a.includes(it.id);
          b.classList.toggle('sel', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        } else {
          S[key] = it.id;
          grid.querySelectorAll('.opt').forEach(x => { x.classList.remove('sel'); x.setAttribute('aria-pressed', 'false'); });
          b.classList.add('sel');
          b.setAttribute('aria-pressed', 'true');
          if (auto) setTimeout(goNext, 240);
        }
        $('#wz-error').textContent = '';
      });
      grid.appendChild(b);
    });
    host.appendChild(grid);
  }

  function pillGroup(host, titleObj, items, key) {
    host.appendChild(el('p', 'grp-t', tx(titleObj)));
    const row = el('div', 'pills');
    items.forEach(it => {
      const b = el('button', 'pill' + (S[key] === it.id ? ' sel' : ''), tx(it.t));
      b.type = 'button';
      b.setAttribute('aria-pressed', S[key] === it.id ? 'true' : 'false');
      b.addEventListener('click', () => {
        S[key] = it.id;
        row.querySelectorAll('.pill').forEach(x => { x.classList.remove('sel'); x.setAttribute('aria-pressed', 'false'); });
        b.classList.add('sel');
        b.setAttribute('aria-pressed', 'true');
        $('#wz-error').textContent = '';
      });
      row.appendChild(b);
    });
    host.appendChild(row);
  }

  function numbersForm(host, onChange) {
    host.innerHTML = '';
    const p = PB[S.problem];
    const defs = [
      { k: 'enq', label: UI.n_enq, min: 10, max: 5000, step: 10, fmt: v => nf.format(v) },
      { k: 'conv', label: UI.n_conv, min: 1, max: 60, step: 1, fmt: v => v + '%' }
    ];
    if (p.mode !== 'uplift') defs.push({ k: 'leak', label: p.ll, min: 5, max: 90, step: 1, fmt: v => v + '%' });
    defs.forEach(d => {
      const id = 'nf-' + d.k + '-' + host.id;
      const w = el('div', 'field');
      w.innerHTML = '<label for="' + id + '"><span>' + tx(d.label) + '</span><output>' + d.fmt(S[d.k]) + '</output></label>' +
        '<input type="range" id="' + id + '" min="' + d.min + '" max="' + d.max + '" step="' + d.step + '" value="' + S[d.k] + '">';
      const r = w.querySelector('input'), o = w.querySelector('output');
      r.addEventListener('input', () => {
        S[d.k] = Number(r.value);
        o.textContent = d.fmt(S[d.k]);
        if (onChange) onChange();
      });
      host.appendChild(w);
    });
    const id = 'nf-aov-' + host.id;
    const w = el('div', 'field');
    w.innerHTML = '<label for="' + id + '"><span>' + tx(UI.n_aov) + '</span></label>' +
      '<div class="rupee"><span>₹</span><input type="number" id="' + id + '" inputmode="numeric" min="1" step="50" value="' + S.aov + '"></div>';
    w.querySelector('input').addEventListener('input', e => {
      const v = Number(e.target.value);
      if (v > 0) { S.aov = Math.min(v, 100000000); if (onChange) onChange(); }
    });
    host.appendChild(w);
  }

  function renderWizard() {
    const m = STEP_META[S.step - 1];
    $('#wz-step').textContent = tx(UI.step).replace('{n}', S.step);
    $('#wz-title').textContent = tx(m.t);
    $('#wz-sub').textContent = tx(m.s);
    $('#wz-error').textContent = '';
    $('#wz-dots').innerHTML = [1, 2, 3, 4, 5].map(n => '<span class="dot' + (n < S.step ? ' done' : n === S.step ? ' on' : '') + '"></span>').join('');
    const body = $('#wz-body');
    body.innerHTML = '';
    if (S.step === 1) optionGrid(body, INDUSTRIES, 'industry', false, true);
    else if (S.step === 2) optionGrid(body, CHANNELS, 'channels', true, false);
    else if (S.step === 3) optionGrid(body, PROBLEMS, 'problem', false, true);
    else if (S.step === 4) {
      setDefaults();
      const host = el('div'); host.id = 'wz-nums';
      body.appendChild(host);
      numbersForm(host);
      body.appendChild(el('p', 'hint', tx(UI.n_hint)));
    } else {
      pillGroup(body, UI.t_team, TEAM, 'team');
      pillGroup(body, UI.t_hours, HOURS, 'hours');
    }
    const back = $('#wz-back'), next = $('#wz-next');
    back.hidden = S.step === 1;
    back.textContent = tx(UI.back);
    next.innerHTML = tx(S.step === 5 ? UI.show : UI.next) + ' <span aria-hidden="true">→</span>';
  }

  function canNext() {
    if (S.step === 1) return S.industry ? '' : tx(UI.e_pick);
    if (S.step === 2) return S.channels.length ? '' : tx(UI.e_ch);
    if (S.step === 3) return S.problem ? '' : tx(UI.e_pick);
    if (S.step === 4) return S.aov > 0 ? '' : tx(UI.e_aov);
    return S.team && S.hours ? '' : tx(UI.e_two);
  }

  function goNext() {
    if (view !== 'wizard') return;
    const err = canNext();
    if (err) { $('#wz-error').textContent = err; return; }
    if (S.step < 5) { S.step++; renderWizard(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    else analyze();
  }

  function goBack() {
    if (S.step > 1) { S.step--; renderWizard(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  }

  /* ---------------------------------------------------------------
     ENGINE
  --------------------------------------------------------------- */
  function scoreFeatures() {
    const sc = {}, why = {};
    FEATURES.forEach(f => { sc[f.id] = 0; why[f.id] = []; });
    const add = (id, pts, key) => {
      if (!(id in sc)) return;
      sc[id] += pts;
      if (key && !why[id].includes(key)) why[id].push(key);
    };
    const PW = {
      slow: { wa: 3, ig: 2, kb: 2, voice: 1 },
      forgot: { leads: 3, fu: 3, wa: 1 },
      repeatq: { kb: 3, wa: 2, ig: 1 },
      orders: { ord: 3, wa: 1, fu: 1 },
      calls: { voice: 3, kb: 1, leads: 1 },
      blind: { gi: 3, leads: 1 },
      comeback: { fu: 3, wa: 1, gi: 1 },
      booking: { fu: 2, wa: 2, voice: 1, ig: 1 }
    };
    Object.entries(PW[S.problem] || {}).forEach(([id, p]) => add(id, p, 'problem'));
    const CHW = { wa: { wa: 2 }, ig: { ig: 2 }, call: { voice: 2 }, web: { leads: 1, kb: 1 }, walk: { fu: 1 } };
    S.channels.forEach(c => Object.entries(CHW[c] || {}).forEach(([id, p]) => add(id, p, 'ch_' + c)));
    Object.entries(IND[S.industry].add).forEach(([id, p]) => add(id, p, 'ind'));
    if (S.hours === 'no') { add('kb', 2, 'hrs'); add('wa', 1, 'hrs'); add('ig', 1, 'hrs'); }
    if (S.hours === 'some') add('kb', 1, 'hrs');
    if (S.team === 'solo') { add('kb', 1, 'team'); add('fu', 1, 'team'); }
    if (S.team === 'large') { add('gi', 1, 'teamL'); add('leads', 1, 'teamL'); }
    const gate = { wa: 'wa', ig: 'ig', voice: 'call' };
    Object.entries(gate).forEach(([id, ch]) => { if (!S.channels.includes(ch)) sc[id] *= 0.3; });
    return FEATURES.map(f => ({ f, score: sc[f.id], why: why[f.id] })).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
  }

  function pickFeatures() {
    const all = scoreFeatures();
    let top = all.filter(x => x.score >= 1).slice(0, 4);
    if (top.length < 2) top = all.slice(0, 2);
    return top;
  }

  function pickPackage(recs) {
    let pts = 0;
    const rs = [];
    if (S.enq >= 1500) { pts++; rs.push(UI.r_vol); }
    if (S.channels.length >= 3) { pts++; rs.push(UI.r_ch); }
    if (recs.length >= 4) { pts++; rs.push(UI.r_feat); }
    if (S.team === 'large') { pts++; rs.push(UI.r_team); }
    if (recs.some(r => r.f.id === 'fu') && S.channels.includes('wa')) { pts += 2; rs.push(UI.r_win); }
    return pts >= 2 ? { p: PKG.omni, reasons: rs } : { p: PKG.growth, reasons: [UI.r_start] };
  }

  function calc() {
    const p = PB[S.problem];
    const orders = S.enq * S.conv / 100;
    const revenue = orders * S.aov;
    let base;
    if (p.mode === 'missed') base = S.enq * S.leak / 100 * S.conv / 100 * S.aov;
    else if (p.mode === 'orders' || p.mode === 'repeat') base = orders * S.leak / 100 * S.aov;
    else base = revenue;
    return { base, low: base * p.lo / 100, high: base * p.hi / 100 };
  }

  /* ---------------------------------------------------------------
     ANALYSIS
  --------------------------------------------------------------- */
  function analyze() {
    show('analysis');
    const items = Array.from(document.querySelectorAll('#an-list li'));
    let i = 0;
    const tick = () => {
      items.forEach((li, n) => { li.className = n < i ? 'done' : n === i ? 'cur' : ''; });
      if (i < items.length) { i++; setTimeout(tick, 520); }
      else {
        setTimeout(() => {
          renderReport();
          show('report', '#rp-title');
          saveDiagnosis();
        }, 450);
      }
    };
    tick();
  }

  function saveDiagnosis() {
    try {
      const c = calc();
      localStorage.setItem('glime_business_diagnosis', JSON.stringify({
        industry: S.industry, channels: S.channels, problem: S.problem, team: S.team, hours: S.hours,
        answers: { enq: S.enq, conv: S.conv, aov: S.aov, leak: S.leak },
        features: S.recs.map(r => r.f.id), revenueLow: Math.round(c.low), revenueHigh: Math.round(c.high),
        savedAt: new Date().toISOString()
      }));
    } catch (e) { /* ignore */ }
  }

  /* ---------------------------------------------------------------
     REPORT
  --------------------------------------------------------------- */
  function summaryText() {
    const c = calc(), pk = pickPackage(S.recs).p;
    const p = PB[S.problem];
    return 'GLIME business diagnosis\n' +
      'Business: ' + IND[S.industry].t.en + '\n' +
      'Channels: ' + S.channels.map(x => CH[x].t.en).join(', ') + '\n' +
      'Biggest problem: ' + p.t.en + '\n' +
      'Enquiries/month: ' + nf.format(S.enq) + ', conversion: ' + S.conv + '%, avg value: ' + inr(S.aov) + '\n' +
      'Estimated impact (illustrative): ' + inr(c.low) + ' - ' + inr(c.high) + ' per month\n' +
      'Top features: ' + S.recs.map(r => r.f.en).join(', ') + '\n' +
      'Suggested package: ' + pk.name;
  }

  function leadPayload() {
    const c = calc(), pk = pickPackage(S.recs).p;
    return {
      p_full_name: S.lead.name.trim(),
      p_phone: S.lead.phone.trim(),
      p_business_name: S.lead.biz.trim() || null,
      p_note: S.lead.note.trim() || null,
      p_language: lang,
      p_industry: S.industry,
      p_channels: S.channels,
      p_main_problem: S.problem,
      p_team_size: S.team,
      p_after_hours: S.hours,
      p_monthly_enquiries: Math.round(S.enq),
      p_avg_order_value: Math.round(S.aov),
      p_conversion_pct: S.conv,
      p_leak_pct: S.leak,
      p_recommended_features: S.recs.map(r => r.f.id),
      p_recommended_package: pk.param,
      p_revenue_low: Math.round(c.low),
      p_revenue_high: Math.round(c.high),
      p_source: 'ai-problem-solver'
    };
  }

  function renderReport() {
    S.recs = pickFeatures();
    const recs = S.recs;
    const pkInfo = pickPackage(recs), pk = pkInfo.p;
    const p = PB[S.problem];
    const up = p.mode === 'uplift';
    const chips = [tx(IND[S.industry].t)].concat(S.channels.map(c => tx(CH[c].t)), [tx(TM[S.team].t)]);

    const feats = recs.map((r, i) =>
      '<article class="feat' + (i === 0 ? ' top' : '') + '">' +
        '<div class="feat-h"><span class="feat-ic" aria-hidden="true">' + r.f.icon + '</span><div>' +
        '<span class="badge' + (i === 0 ? ' hot' : '') + '">' + tx(i === 0 ? UI.start : UI.nextUp) + '</span><h3>' + tx(r.f.t) + '</h3></div></div>' +
        '<p>' + tx(r.f.d) + '</p>' +
        '<div class="why"><b>' + tx(UI.why) + '</b> ' + r.why.slice(0, 3).map(k => '<span class="chip">' + tx(WHY[k]) + '</span>').join('') + '</div>' +
        '<p class="first"><b>' + tx(UI.first) + '</b> ' + tx(r.f.first) + '</p>' +
      '</article>').join('');

    const steps = [[UI.d1, UI.d1t]];
    const w = [UI.d2, UI.d3, UI.d4];
    recs.slice(0, 3).forEach((r, i) => steps.push([w[i], r.f.first]));
    steps.push([UI.d5, UI.d5t]);
    const plan = steps.map(s => '<li><b>' + tx(s[0]) + '</b><span>' + tx(s[1]) + '</span></li>').join('');

    const addons = encodeURIComponent(recs.map(r => r.f.en).join(', '));
    const contactHref = 'contact.html?package=' + encodeURIComponent(pk.name) + '&addons=' + addons;
    const L2 = S.lead;

    $('#report-body').innerHTML =
      '<div class="rp-head"><div><p class="eyebrow">' + tx(UI.rp_e) + '</p><h1 id="rp-title" tabindex="-1">' + tx(UI.rp_t) + '</h1></div>' +
      '<button class="text-btn no-print" type="button" data-action="restart">' + tx(UI.restart) + '</button></div>' +
      '<div class="chips">' + chips.map(c => '<span class="chip">' + c + '</span>').join('') + '</div>' +

      '<section class="card metric"><p class="eyebrow">' + tx(UI.leak) + '</p><h2>' + tx(p.t) + '</h2>' +
        '<div class="mgrid">' +
          '<div class="m-box"><small>' + tx(up ? UI.base : UI.risk) + '</small><strong id="m-risk"></strong><em>' + tx(UI.perMonth) + '</em></div>' +
          '<div class="m-box good"><small>' + tx(up ? UI.upRec : UI.rec) + '</small><strong id="m-rec"></strong><em>' + tx(UI.perMonth) + '</em></div>' +
        '</div>' +
        '<p class="assume" id="m-assume"></p>' +
        '<div class="whatif no-print"><h3>' + tx(UI.adjust) + '</h3><div id="rp-nums"></div></div>' +
        '<p class="fine">' + tx(UI.cost) + '</p>' +
      '</section>' +

      '<section><div class="card" style="margin-bottom:0"><p class="eyebrow">' + tx(UI.feat_h) + '</p><h2>' + tx(UI.feat_p) + '</h2></div>' +
        '<div class="feats">' + feats + '</div>' +
        '<p class="fine"><a href="portfolio.html#features" style="color:var(--cyan);text-decoration:underline">' + tx(UI.studies) + ' →</a></p></section>' +

      '<section class="card pkg"><p class="eyebrow">' + tx(UI.pkg_h) + '</p><h2>' + pk.name + '</h2>' +
        '<div class="pkg-row"><span class="pkg-price">' + pk.price + '<small>' + tx(pk.per) + '</small></span><span class="pkg-alt">' + tx(pk.alt) + '</span></div>' +
        '<p class="lead">' + tx(pk.tag) + '</p>' +
        '<ul>' + pkInfo.reasons.map(r => '<li>' + tx(r) + '</li>').join('') + '</ul>' +
        '<div class="btn-row"><a class="btn primary" href="signup.html?package=' + pk.param + '">' + tx(UI.pkg_trial) + ' <span aria-hidden="true">→</span></a>' +
        '<a class="btn ghost" href="packages.html">' + tx(UI.pkg_all) + '</a></div>' +
        '<p class="fine">' + tx(UI.pkg_note) + '</p></section>' +

      '<section class="card"><p class="eyebrow">' + tx(UI.plan_h) + '</p><ol class="plan">' + plan + '</ol></section>' +

      '<section class="card lead-card no-print"><h2>' + tx(UI.lead_h) + '</h2><p class="lead">' + tx(UI.lead_p) + '</p>' +
        '<form class="lf" id="lead-form" novalidate>' +
          '<div><label for="lf-name">' + tx(UI.lf_name) + ' *</label><input type="text" id="lf-name" autocomplete="name" maxlength="80"></div>' +
          '<div><label for="lf-phone">' + tx(UI.lf_phone) + ' *</label><input type="tel" id="lf-phone" autocomplete="tel" inputmode="tel" maxlength="20"></div>' +
          '<div class="full"><label for="lf-biz">' + tx(UI.lf_biz) + '</label><input type="text" id="lf-biz" autocomplete="organization" maxlength="100"></div>' +
          '<div class="full"><label for="lf-note">' + tx(UI.lf_note) + '</label><textarea id="lf-note" maxlength="400"></textarea></div>' +
          '<div class="hp" aria-hidden="true"><label>Website<input type="text" id="lf-hp" tabindex="-1" autocomplete="off"></label></div>' +
          '<label class="consent full"><input type="checkbox" id="lf-consent"><span>' + tx(UI.lf_consent) + ' <a href="privacy.html" target="_blank" rel="noopener">' + tx(UI.lf_priv) + '</a></span></label>' +
          '<div class="full"><button class="btn primary" type="submit" id="lf-send">' + tx(UI.lf_send) + '</button></div>' +
        '</form>' +
        '<p class="status" id="lf-status" role="status"></p><div id="lf-fallback"></div>' +
      '</section>' +

      '<div class="actions-row no-print">' +
        '<a class="btn ghost small" id="act-share" target="_blank" rel="noopener" href="#">' + tx(UI.share) + '</a>' +
        '<button class="btn ghost small" type="button" data-action="print">' + tx(UI.print) + '</button>' +
        '<a class="btn ghost small" href="' + contactHref + '">' + tx(UI.talk) + '</a>' +
      '</div>' +
      '<p class="disc">' + tx(UI.disc) + '</p>';

    numbersForm($('#rp-nums'), updateMetrics);
    updateMetrics();

    $('#lf-name').value = L2.name; $('#lf-phone').value = L2.phone; $('#lf-biz').value = L2.biz;
    $('#lf-note').value = L2.note; $('#lf-consent').checked = L2.consent;
    $('#lf-name').addEventListener('input', e => { S.lead.name = e.target.value; });
    $('#lf-phone').addEventListener('input', e => { S.lead.phone = e.target.value; });
    $('#lf-biz').addEventListener('input', e => { S.lead.biz = e.target.value; });
    $('#lf-note').addEventListener('input', e => { S.lead.note = e.target.value; });
    $('#lf-consent').addEventListener('change', e => { S.lead.consent = e.target.checked; });
    $('#lead-form').addEventListener('submit', submitLead);
  }

  function updateMetrics() {
    const c = calc(), p = PB[S.problem];
    $('#m-risk').textContent = inr(c.base);
    $('#m-rec').textContent = inr(c.low) + ' – ' + inr(c.high);
    $('#m-assume').textContent = tx(p.mode === 'uplift' ? UI.assumeUp : UI.assume).replace('{lo}', p.lo).replace('{hi}', p.hi);
    $('#act-share').href = 'https://wa.me/?text=' + encodeURIComponent(summaryText());
  }

  /* ---------------------------------------------------------------
     LEAD SAVE
  --------------------------------------------------------------- */
  let sb = null;
  function client() {
    if (sb) return sb;
    if (window.supabase && window.supabase.createClient) {
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });
    }
    return sb;
  }

  function setStatus(msg, kind) {
    const s = $('#lf-status');
    s.textContent = msg;
    s.className = 'status' + (kind ? ' ' + kind : '');
  }

  function whatsappFallback(payload) {
    const txt = 'Hi GLIME, I completed the business diagnosis.\nName: ' + payload.p_full_name + '\nPhone: ' + payload.p_phone + '\n' +
      (payload.p_business_name ? 'Business: ' + payload.p_business_name + '\n' : '') + '\n' + summaryText();
    const a = el('a', 'btn primary small', tx(UI.wa_btn));
    a.href = 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(txt);
    a.target = '_blank'; a.rel = 'noopener';
    const host = $('#lf-fallback');
    host.innerHTML = '';
    host.appendChild(a);
  }

  async function submitLead(e) {
    e.preventDefault();
    if ($('#lf-hp').value) { setStatus(tx(UI.lf_ok), 'ok'); return; }
    const digits = S.lead.phone.replace(/\D/g, '');
    if (!S.lead.name.trim()) { setStatus(tx(UI.lf_en), 'bad'); return; }
    if (digits.length < 10 || digits.length > 13) { setStatus(tx(UI.lf_ep), 'bad'); return; }
    if (!S.lead.consent) { setStatus(tx(UI.lf_ec), 'bad'); return; }
    try {
      const last = Number(localStorage.getItem('glime_solver_last_submit') || 0);
      if (Date.now() - last < 60000) { setStatus(tx(UI.lf_ew), 'bad'); return; }
    } catch (err) { /* ignore */ }

    const btn = $('#lf-send');
    btn.disabled = true;
    btn.textContent = tx(UI.lf_sending);
    const payload = leadPayload();
    setStatus('', '');
    try {
      const c = client();
      if (!c) throw new Error('Supabase not available');
      const { error } = await c.rpc('submit_problem_solver_lead', payload);
      if (error) throw error;
      try {
        localStorage.setItem('glime_solver_last_submit', String(Date.now()));
        localStorage.removeItem('glime_pending_solver_lead');
      } catch (err) { /* ignore */ }
      $('#lead-form').querySelectorAll('input,textarea,button').forEach(x => { x.disabled = true; });
      setStatus(tx(UI.lf_ok), 'ok');
    } catch (err) {
      console.warn('GLIME lead could not be saved:', err);
      try { localStorage.setItem('glime_pending_solver_lead', JSON.stringify({ payload, savedAt: new Date().toISOString() })); } catch (e2) { /* ignore */ }
      setStatus(tx(UI.lf_fail), 'bad');
      whatsappFallback(payload);
      btn.disabled = false;
      btn.textContent = tx(UI.lf_send);
    }
  }

  /* ---------------------------------------------------------------
     EVENTS
  --------------------------------------------------------------- */
  function restart() {
    const l = S.lead;
    S = fresh();
    S.lead = l;
    show('hero', '#hero-title');
  }

  function setLang(l) {
    if (l !== 'en' && l !== 'hi') return;
    lang = l;
    try { localStorage.setItem('glime_solver_lang', l); } catch (e) { /* ignore */ }
    applyStatic();
    if (view === 'wizard') renderWizard();
    else if (view === 'report') renderReport();
  }

  document.addEventListener('click', e => {
    const lb = e.target.closest('.lang-btn');
    if (lb) { setLang(lb.dataset.lang); return; }
    const a = e.target.closest('[data-action]');
    if (!a) return;
    const act = a.dataset.action;
    if (act === 'start') { S.step = 1; show('wizard', '#wz-title'); renderWizard(); }
    else if (act === 'restart') restart();
    else if (act === 'print') window.print();
  });

  $('#wz-next').addEventListener('click', goNext);
  $('#wz-back').addEventListener('click', goBack);

  applyStatic();
})();
