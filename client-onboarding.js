/* =========================================================
   GLIME CLIENT ONBOARDING
   ---------------------------------------------------------
   Page: client-onboarding.html   (English / हिन्दी toggle)

   What it does
   - Shows a guided checklist: logo and business details, services,
     AI knowledge, WhatsApp, Instagram, test the AI, install the app,
     first lead.
   - Steps that can be verified are ticked automatically (READ-ONLY):
       WhatsApp / Instagram  -> client_channel_connections
       First lead            -> row count of leads
       Install               -> app opened as an installed app
     This is the same read-only pattern glime-app-shell.js uses; RLS
     limits every table to the signed-in client's own rows.
   - Logo + business name, services, and AI knowledge are also read
     from the backend (profile_media, client_profile_details, offers,
     client_business_profiles, client_knowledge_items). If a check cannot
     run, the client can still mark the step done by hand.
   - A "Reports" tab shows what GLIME did in the last 7 or 30 days
     (leads, customers, orders, AI replies, estimated time saved), read
     from leads, orders, customers, whatsapp_messages and
     instagram_messages. Read-only, own rows only.
   - Progress is kept on this device, per signed-in client, and a small
     summary is exposed for the dashboard (see GlimeOnboarding).

   Nothing here writes to the backend. Authentication is never handled
   here; if no session is found the page only shows a sign-in note.
========================================================= */
(function () {
  'use strict';
  if (window.GlimeOnboarding) return;

  /* ---------- Settings you may want to change ---------- */
  var CFG = {
    SB_URL: 'https://ufoulgbiqgjriwapuopc.supabase.co',
    SB_KEY: 'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA',
    SB_LIB: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js',
    LANG_KEY: 'glime_onb_lang',
    STATE_PREFIX: 'glime_onb_v1_',
    LAST_UID: 'glime_onb_last_uid',
    SUMMARY_KEY: 'glime_onb_summary'
  };

  /* Where each step sends the client. Change a link here if a page moves. */
  var STEPS = [
    { id: 'profile',   phase: 'setup',    min: 3,  href: 'settings.html', auto: 'profile', manualOk: true },
    { id: 'services',  phase: 'setup',    min: 5,  href: 'settings.html', auto: 'services', manualOk: true },
    { id: 'knowledge', phase: 'setup',    min: 10, href: 'settings.html', auto: 'knowledge', manualOk: true },
    { id: 'whatsapp',  phase: 'channels', min: 4,  href: 'whatsapp-sales-specialist.html', auto: 'whatsapp', skippable: true },
    { id: 'instagram', phase: 'channels', min: 4,  href: 'instagram-sales-specialist.html', auto: 'instagram', skippable: true },
    { id: 'testai',    phase: 'live',     min: 2,  href: 'client-assistant.html' },
    { id: 'install',   phase: 'live',     min: 1,  href: 'dashboard.html', auto: 'standalone', manualOk: true, skippable: true },
    { id: 'telegram',  phase: 'live',     min: 3,  href: 'ai-connections.html', skippable: true },
    { id: 'firstlead', phase: 'live',     min: 0,  href: 'leads.html', auto: 'leads' }
  ];
  var PHASES = ['setup', 'channels', 'live'];

  /* ---------- Text: English and Hindi ---------- */
  var I18N = {
    en: {
      pageTitle: 'Get started',
      tabSetup: 'Get started',
      tabReport: 'Reports',
      nextCta: 'Continue setup',
      dLogo: 'Logo',
      dName: 'Business name',
      dDesc: 'Business description',
      dServices: '{n} active services',
      dItems: '{n} knowledge items',
      telegram_t: 'Get your daily report on Telegram',
      telegram_why: 'See what GLIME did for you each day without opening the app. It is free.',
      telegram_how: 'Open the Connector page, connect Telegram, and your daily report will arrive in your chat. Mark this done once it is connected.',
      telegram_cta: 'Connect Telegram',
      rpTitle: 'What GLIME did for you',
      rpRange: 'Last {n} days, {from} to {to}',
      perWeek: 'Weekly',
      perMonth: 'Monthly',
      rpKpiLeads: 'New leads',
      rpKpiCustomers: 'New customers',
      rpKpiOrders: 'Orders',
      rpKpiValue: 'Order value',
      rpKpiReplies: 'AI replies sent',
      rpKpiSaved: 'Time saved (estimate)',
      rpVsPrev: 'Changes compare with the previous {n} days.',
      rpEstNote: 'Time saved is an estimate at {m} minutes per AI reply.',
      rpPartial: 'Some numbers could not be loaded. Try Refresh.',
      rpNew: 'New',
      rpSame: 'No change',
      rpChartTitle: 'New leads per day',
      rpChartAria: 'New leads per day. Total {total}. Busiest day {day} with {peak}.',
      rpSrcTitle: 'Where your leads came from',
      rpNoSrc: 'No leads in this period yet.',
      rpOther: 'Other',
      rpInsight1: 'In the last {n} days GLIME brought you {leads} new leads and sent {replies} AI replies, saving you about {saved}.',
      rpInsightUp: 'Leads are up {x}% on the previous {n} days.',
      rpInsightDown: 'Leads are down {x}% on the previous {n} days.',
      rpInsightNone: 'No activity in the last {n} days yet. Connect WhatsApp or Instagram and share your number to start seeing results here.',
      rpLoading: 'Loading your report…',
      rpSignin: 'Sign in to see your report.',
      rpFail: 'We could not load your report. Try Refresh.',
      unitMin: 'min',
      unitHr: 'h',
      tgFree: 'Free',
      tgTitle: 'Get this report on Telegram every day',
      tgText: 'Connect Telegram once and your daily report reaches your chat, so you never need to open GLIME to check. Set it up from the Connector page.',
      tgCta: 'Open Connector',
      rpCopy: 'Copy summary',
      rpCopied: 'Summary copied',
      rpPrint: 'Print or save as PDF',
      heroTitle: 'Get GLIME ready for your customers',
      heroSub: 'Finish these steps and your AI will answer like someone who knows your business.',
      progress: '{done} of {total} steps done',
      timeLeft: 'About {min} min left',
      timeNone: 'Waiting for your first lead',
      level0: 'Just getting started',
      level1: 'Setup in progress',
      level2: 'Almost live',
      level3: 'Ready for customers',
      refresh: 'Refresh status',
      refreshing: 'Checking…',
      phase_setup: 'Teach GLIME your business',
      phase_channels: 'Connect where customers write',
      phase_live: 'Go live',
      phaseCount: '{done} of {total}',
      stDone: 'Done',
      stTodo: 'To do',
      stSkipped: 'Skipped',
      detected: 'Detected automatically',
      minutes: '{n} min',
      tagAuto: 'Ticks by itself',
      tagManual: 'You mark this',
      markDone: 'Mark as done',
      markUndo: 'Mark as not done',
      skip: 'Skip this step',
      unskip: 'Add this step back',
      noCheck: 'We could not check this just now, so you can mark it yourself.',
      completeTitle: 'GLIME is ready for your customers',
      completeText: 'Every step is done. You can improve your AI knowledge any time from Settings.',
      completeCta: 'Go to Overview',
      tplTitle: 'AI knowledge starter template',
      tplSub: 'Cover these points to help your AI answer the questions customers ask first. Write as if you were briefing a new team member.',
      tplCopy: 'Copy template',
      tplCopied: 'Template copied',
      tplFail: 'Could not copy. Please select the text and copy it.',
      helpTitle: 'Stuck on a step?',
      helpText: 'Tell us where you are stuck. A real person reads every message.',
      helpBtn: 'Ask for help',
      signinNote: 'Sign in to see your live progress.',
      signinLink: 'Sign in',
      reset: 'Reset checklist',
      resetConfirm: 'Clear your progress on this checklist?',
      profile_t: 'Add your logo and business details',
      profile_why: 'This is how GLIME knows who it is working for.',
      profile_how: 'Open Settings, upload your logo, and fill in your business name, what you sell and where you operate.',
      profile_cta: 'Open Settings',
      services_t: 'Add your services',
      services_why: 'Your AI can only talk about what it knows you sell, with the right names and prices.',
      services_how: 'In Settings, add each service with a clear name, a short description and the price or price range.',
      services_cta: 'Open Settings',
      knowledge_t: 'Teach your AI the basics',
      knowledge_why: 'Customers ask the same questions again and again. Answer them once and your AI can handle them from then on.',
      knowledge_how: 'In Settings, fill in the AI knowledge: timings, location, delivery, payments, refunds and common questions. Use the starter template on this page to begin.',
      knowledge_cta: 'Open Settings',
      whatsapp_t: 'Connect WhatsApp',
      whatsapp_why: 'Once connected, your AI can reply when customers message you on WhatsApp.',
      whatsapp_how: 'Open the WhatsApp Sales Specialist and follow the connection steps. This step turns green by itself when WhatsApp is connected.',
      whatsapp_cta: 'Connect WhatsApp',
      instagram_t: 'Connect Instagram',
      instagram_why: 'Once connected, customers who message you on Instagram get a reply too.',
      instagram_how: 'Open the Instagram Sales Specialist and follow the connection steps. This step turns green by itself when Instagram is connected.',
      instagram_cta: 'Connect Instagram',
      testai_t: 'Test your AI like a customer',
      testai_why: 'Ask what your customers ask. If an answer sounds off, improve it in AI knowledge.',
      testai_how: 'Open AI Assistant and ask about your prices, timings and delivery. Mark this done when the answers sound right.',
      testai_cta: 'Open AI Assistant',
      install_t: 'Install GLIME on your phone',
      install_why: 'GLIME opens like an app, one tap from your home screen.',
      install_how: 'Open Overview on your phone and use the install banner. This turns green by itself when you open GLIME as an app.',
      install_cta: 'Open Overview',
      firstlead_t: 'Receive your first lead',
      firstlead_why: 'This is where GLIME starts doing its real work.',
      firstlead_how: 'Share your WhatsApp or Instagram with a few customers, or send a test message yourself. This turns green by itself when a lead arrives.',
      firstlead_cta: 'Open Leads',
      tpl: [
        ['Business introduction', 'Who you are, what you do and how long you have been doing it.'],
        ['Opening hours', 'Days and timings, and when you are closed.'],
        ['Location and service area', 'Address, landmarks and the areas you serve.'],
        ['Services and prices', 'Each service with its price or price range.'],
        ['Booking, delivery or appointments', 'How a customer orders or books, and how long it takes.'],
        ['Payment methods', 'UPI, cards, cash, EMI or anything else you accept.'],
        ['Refunds, returns and cancellations', 'What you allow and what you do not.'],
        ['Common questions', 'The ten questions customers ask most, each with its answer.'],
        ['How you want to sound', 'Friendly, formal, short or detailed.']
      ]
    },
    hi: {
      pageTitle: 'शुरुआत करें',
      tabSetup: 'शुरुआत',
      tabReport: 'रिपोर्ट',
      nextCta: 'सेटअप जारी रखें',
      dLogo: 'लोगो',
      dName: 'बिज़नेस का नाम',
      dDesc: 'बिज़नेस का विवरण',
      dServices: '{n} active सर्विसेज़',
      dItems: '{n} knowledge आइटम',
      telegram_t: 'रोज़ की रिपोर्ट Telegram पर पाएँ',
      telegram_why: 'ऐप खोले बिना देखें कि GLIME ने हर दिन आपके लिए क्या किया। यह बिल्कुल मुफ़्त है।',
      telegram_how: 'Connector पेज खोलें, Telegram कनेक्ट करें, और रोज़ की रिपोर्ट आपकी चैट में आ जाएगी। कनेक्ट होने पर इसे पूरा चिह्नित करें।',
      telegram_cta: 'Telegram कनेक्ट करें',
      rpTitle: 'GLIME ने आपके लिए क्या किया',
      rpRange: 'पिछले {n} दिन, {from} से {to}',
      perWeek: 'साप्ताहिक',
      perMonth: 'मासिक',
      rpKpiLeads: 'नई leads',
      rpKpiCustomers: 'नए ग्राहक',
      rpKpiOrders: 'ऑर्डर',
      rpKpiValue: 'ऑर्डर की कुल कीमत',
      rpKpiReplies: 'AI के भेजे जवाब',
      rpKpiSaved: 'बचा समय (अनुमान)',
      rpVsPrev: 'बदलाव पिछले {n} दिनों से तुलना में हैं।',
      rpEstNote: 'बचा समय अनुमान है: हर AI जवाब पर {m} मिनट।',
      rpPartial: 'कुछ आँकड़े लोड नहीं हो पाए। रिफ़्रेश करके देखें।',
      rpNew: 'नया',
      rpSame: 'कोई बदलाव नहीं',
      rpChartTitle: 'हर दिन की नई leads',
      rpChartAria: 'हर दिन की नई leads। कुल {total}। सबसे व्यस्त दिन {day}, {peak} leads।',
      rpSrcTitle: 'आपकी leads कहाँ से आईं',
      rpNoSrc: 'इस अवधि में अभी कोई lead नहीं आई।',
      rpOther: 'अन्य',
      rpInsight1: 'पिछले {n} दिनों में GLIME ने आपके लिए {leads} नई leads जुटाईं और {replies} AI जवाब भेजे, जिससे लगभग {saved} बचे।',
      rpInsightUp: 'पिछले {n} दिनों के मुक़ाबले leads {x}% बढ़ी हैं।',
      rpInsightDown: 'पिछले {n} दिनों के मुक़ाबले leads {x}% घटी हैं।',
      rpInsightNone: 'पिछले {n} दिनों में अभी कोई गतिविधि नहीं है। WhatsApp या Instagram कनेक्ट करें और अपना नंबर शेयर करें, फिर नतीजे यहाँ दिखेंगे।',
      rpLoading: 'आपकी रिपोर्ट लोड हो रही है…',
      rpSignin: 'रिपोर्ट देखने के लिए साइन इन करें।',
      rpFail: 'रिपोर्ट लोड नहीं हो पाई। रिफ़्रेश करके देखें।',
      unitMin: 'मिनट',
      unitHr: 'घंटे',
      tgFree: 'मुफ़्त',
      tgTitle: 'यही रिपोर्ट रोज़ Telegram पर पाएँ',
      tgText: 'Telegram एक बार कनेक्ट करें और रोज़ की रिपोर्ट सीधे आपकी चैट में आएगी, GLIME खोलकर देखने की ज़रूरत नहीं। इसे Connector पेज से सेट करें।',
      tgCta: 'Connector खोलें',
      rpCopy: 'सारांश कॉपी करें',
      rpCopied: 'सारांश कॉपी हो गया',
      rpPrint: 'प्रिंट करें या PDF सेव करें',
      heroTitle: 'अपने ग्राहकों के लिए GLIME तैयार करें',
      heroSub: 'ये स्टेप्स पूरे करें, फिर आपका AI आपके बिज़नेस को जानने वाले की तरह जवाब देगा।',
      progress: '{total} में से {done} स्टेप पूरे',
      timeLeft: 'लगभग {min} मिनट बाकी',
      timeNone: 'आपकी पहली lead का इंतज़ार',
      level0: 'अभी शुरुआत',
      level1: 'सेटअप जारी है',
      level2: 'लगभग लाइव',
      level3: 'ग्राहकों के लिए तैयार',
      refresh: 'स्टेटस रिफ़्रेश करें',
      refreshing: 'जाँच हो रही है…',
      phase_setup: 'GLIME को अपना बिज़नेस सिखाएँ',
      phase_channels: 'वहाँ जुड़ें जहाँ ग्राहक लिखते हैं',
      phase_live: 'लाइव हों',
      phaseCount: '{total} में से {done}',
      stDone: 'पूरा',
      stTodo: 'बाकी',
      stSkipped: 'छोड़ा गया',
      detected: 'अपने-आप पहचाना गया',
      minutes: '{n} मिनट',
      tagAuto: 'अपने-आप पूरा होगा',
      tagManual: 'आप चिह्नित करें',
      markDone: 'पूरा हुआ चिह्नित करें',
      markUndo: 'अधूरा चिह्नित करें',
      skip: 'यह स्टेप छोड़ें',
      unskip: 'यह स्टेप वापस जोड़ें',
      noCheck: 'अभी यह जाँच नहीं हो पाई, इसलिए आप इसे खुद चिह्नित कर सकते हैं।',
      completeTitle: 'GLIME आपके ग्राहकों के लिए तैयार है',
      completeText: 'सारे स्टेप पूरे हो गए। आप कभी भी Settings से अपनी AI knowledge बेहतर कर सकते हैं।',
      completeCta: 'Overview पर जाएँ',
      tplTitle: 'AI knowledge का स्टार्टर टेम्पलेट',
      tplSub: 'इन बातों को भरें ताकि आपका AI ग्राहकों के शुरुआती सवालों के जवाब दे सके। ऐसे लिखें जैसे किसी नए साथी को समझा रहे हों।',
      tplCopy: 'टेम्पलेट कॉपी करें',
      tplCopied: 'टेम्पलेट कॉपी हो गया',
      tplFail: 'कॉपी नहीं हो पाया। कृपया टेक्स्ट चुनकर खुद कॉपी करें।',
      helpTitle: 'किसी स्टेप पर अटके हैं?',
      helpText: 'बताइए कहाँ अटके हैं। हर मैसेज एक असली इंसान पढ़ता है।',
      helpBtn: 'मदद माँगें',
      signinNote: 'लाइव प्रोग्रेस देखने के लिए साइन इन करें।',
      signinLink: 'साइन इन',
      reset: 'चेकलिस्ट रीसेट करें',
      resetConfirm: 'क्या आप इस चेकलिस्ट की प्रोग्रेस मिटाना चाहते हैं?',
      profile_t: 'अपना लोगो और बिज़नेस की जानकारी जोड़ें',
      profile_why: 'इसी से GLIME को पता चलता है कि वह किसके लिए काम कर रहा है।',
      profile_how: 'Settings खोलें, अपना लोगो अपलोड करें और बिज़नेस का नाम, आप क्या बेचते हैं और कहाँ काम करते हैं, यह भरें।',
      profile_cta: 'Settings खोलें',
      services_t: 'अपनी सर्विसेज़ जोड़ें',
      services_why: 'आपका AI वही बता सकता है जो उसे पता है कि आप बेचते हैं, सही नाम और कीमत के साथ।',
      services_how: 'Settings में हर सर्विस जोड़ें: साफ़ नाम, छोटा विवरण और कीमत या कीमत की रेंज।',
      services_cta: 'Settings खोलें',
      knowledge_t: 'अपने AI को बुनियादी बातें सिखाएँ',
      knowledge_why: 'ग्राहक बार-बार वही सवाल पूछते हैं। एक बार जवाब भरें, फिर आपका AI उन्हें संभाल सकता है।',
      knowledge_how: 'Settings में AI knowledge भरें: समय, पता, डिलीवरी, पेमेंट, रिफ़ंड और आम सवाल। शुरू करने के लिए इस पेज का स्टार्टर टेम्पलेट इस्तेमाल करें।',
      knowledge_cta: 'Settings खोलें',
      whatsapp_t: 'WhatsApp कनेक्ट करें',
      whatsapp_why: 'कनेक्ट होने पर आपका AI WhatsApp पर आए ग्राहकों के मैसेज का जवाब दे सकता है।',
      whatsapp_how: 'WhatsApp Sales Specialist खोलें और कनेक्शन के स्टेप पूरे करें। WhatsApp कनेक्ट होते ही यह स्टेप अपने-आप हरा हो जाएगा।',
      whatsapp_cta: 'WhatsApp कनेक्ट करें',
      instagram_t: 'Instagram कनेक्ट करें',
      instagram_why: 'कनेक्ट होने पर Instagram पर मैसेज करने वाले ग्राहकों को भी जवाब मिलेगा।',
      instagram_how: 'Instagram Sales Specialist खोलें और कनेक्शन के स्टेप पूरे करें। Instagram कनेक्ट होते ही यह स्टेप अपने-आप हरा हो जाएगा।',
      instagram_cta: 'Instagram कनेक्ट करें',
      testai_t: 'ग्राहक बनकर अपने AI को टेस्ट करें',
      testai_why: 'वही सवाल पूछें जो आपके ग्राहक पूछते हैं। कोई जवाब ठीक न लगे तो AI knowledge में सुधार करें।',
      testai_how: 'AI Assistant खोलें और अपनी कीमतों, समय और डिलीवरी के बारे में पूछें। जवाब सही लगें तो इसे पूरा चिह्नित करें।',
      testai_cta: 'AI Assistant खोलें',
      install_t: 'GLIME को अपने फ़ोन में इंस्टॉल करें',
      install_why: 'GLIME ऐप की तरह खुलेगा, होम स्क्रीन से सिर्फ़ एक टैप में।',
      install_how: 'अपने फ़ोन पर Overview खोलें और इंस्टॉल बैनर इस्तेमाल करें। GLIME को ऐप की तरह खोलते ही यह स्टेप अपने-आप हरा हो जाएगा।',
      install_cta: 'Overview खोलें',
      firstlead_t: 'अपनी पहली lead पाएँ',
      firstlead_why: 'यहीं से GLIME का असली काम शुरू होता है।',
      firstlead_how: 'अपना WhatsApp या Instagram कुछ ग्राहकों के साथ शेयर करें, या खुद एक टेस्ट मैसेज भेजें। lead आते ही यह स्टेप अपने-आप हरा हो जाएगा।',
      firstlead_cta: 'Leads खोलें',
      tpl: [
        ['बिज़नेस का परिचय', 'आप कौन हैं, क्या करते हैं और कितने समय से कर रहे हैं।'],
        ['खुलने का समय', 'दिन और समय, और कब बंद रहते हैं।'],
        ['पता और सेवा क्षेत्र', 'पता, पहचान की जगह और जिन इलाकों में आप सेवा देते हैं।'],
        ['सर्विसेज़ और कीमतें', 'हर सर्विस के साथ उसकी कीमत या रेंज।'],
        ['बुकिंग, डिलीवरी या अपॉइंटमेंट', 'ग्राहक कैसे ऑर्डर या बुक करता है और कितना समय लगता है।'],
        ['पेमेंट के तरीके', 'UPI, कार्ड, कैश, EMI या जो भी आप लेते हैं।'],
        ['रिफ़ंड, रिटर्न और कैंसलेशन', 'आप क्या मानते हैं और क्या नहीं।'],
        ['आम सवाल', 'ग्राहक सबसे ज़्यादा जो दस सवाल पूछते हैं, हर एक के जवाब के साथ।'],
        ['आप किस लहजे में बात करना चाहते हैं', 'दोस्ताना, औपचारिक, छोटा या विस्तृत।']
      ]
    }
  };

  var ICON = {
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 12h12"/></svg>',
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>'
  };

  /* ---------- State ---------- */
  var root, stepsEl, toastEl, arcEl, wrapEl;
  var lang = 'en';
  var uid = '';
  var state = { done: {}, skipped: {}, celebrated: false };
  var auto = { whatsapp: null, instagram: null, leads: null, standalone: null, profile: null, services: null, knowledge: null };
  var det = { logo: null, name: null, desc: null, services: null, items: null };
  var tab = 'setup';
  var per = 'week';
  var rep = {};
  var repBusy = false;
  var EST_MIN = 2;
  var openId = null;
  var openChosen = false;
  var busy = false;
  var remoteDone = false;
  var signedIn = null;
  var toastTimer = null;
  var firstPaint = true;
  var CIRC = 2 * Math.PI * 54;

  function qs(sel) { return document.querySelector(sel); }
  function qsa(sel, scope) { return Array.prototype.slice.call((scope || document).querySelectorAll(sel)); }

  function t(key, vars) {
    var s = I18N[lang] && I18N[lang][key];
    if (s == null) s = I18N.en[key];
    if (s == null) return key;
    if (typeof s !== 'string') return s;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
    return s;
  }

  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (e) { /* ignore */ }
    return null;
  }

  function loadState(id) {
    var s = { done: {}, skipped: {}, celebrated: false };
    try {
      var raw = store(CFG.STATE_PREFIX + (id || 'anon'));
      if (raw) {
        var p = JSON.parse(raw);
        if (p && typeof p === 'object') {
          s.done = p.done || {};
          s.skipped = p.skipped || {};
          s.celebrated = !!p.celebrated;
        }
      }
    } catch (e) { /* ignore */ }
    return s;
  }

  function saveState() {
    store(CFG.STATE_PREFIX + (uid || 'anon'), JSON.stringify(state));
  }

  /* ---------- Step status ---------- */
  function autoValue(s) { return s.auto ? auto[s.auto] : undefined; }

  function status(s) {
    if (state.skipped[s.id]) return 'skipped';
    var a = autoValue(s);
    if (a === true) return 'done';
    if (s.auto && !s.manualOk && a === false) return 'todo';
    return state.done[s.id] ? 'done' : 'todo';
  }

  function canManual(s) {
    if (!s.auto || s.manualOk) return autoValue(s) !== true;
    return autoValue(s) == null;
  }

  function summary() {
    var total = 0, done = 0, min = 0;
    STEPS.forEach(function (s) {
      var st = status(s);
      if (st === 'skipped') return;
      total++;
      if (st === 'done') done++; else min += s.min;
    });
    var pct = total ? Math.round(done / total * 100) : 0;
    return { total: total, done: done, min: min, pct: pct, complete: total > 0 && done === total };
  }

  function levelKey(pct) {
    if (pct >= 100) return 'level3';
    if (pct >= 67) return 'level2';
    if (pct >= 34) return 'level1';
    return 'level0';
  }

  /* ---------- Rendering ---------- */
  function applyStatic() {
    root.setAttribute('lang', lang === 'hi' ? 'hi' : 'en');
    qsa('[data-i18n]').forEach(function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    qsa('.ob-lang [data-lang]').forEach(function (b) {
      b.setAttribute('aria-checked', String(b.getAttribute('data-lang') === lang));
    });
    updateTitle();
    var tpl = qs('#obTpl');
    if (tpl) {
      tpl.innerHTML = t('tpl').map(function (row) {
        return '<li><strong>' + esc(row[0]) + '</strong><span>' + esc(row[1]) + '</span></li>';
      }).join('');
    }
    var rb = qs('#obRefresh');
    if (rb) rb.textContent = busy ? t('refreshing') : t('refresh');
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function firstTodoId() {
    for (var i = 0; i < STEPS.length; i++) if (status(STEPS[i]) === 'todo') return STEPS[i].id;
    return null;
  }

  function stepHtml(s, idx) {
    var st = status(s);
    var isOpen = openId === s.id;
    var a = autoValue(s);
    var label = st === 'done' ? (a === true ? t('detected') : t('stDone')) : (st === 'skipped' ? t('stSkipped') : t('stTodo'));
    var node = st === 'done' ? ICON.check : (st === 'skipped' ? ICON.minus : String(idx + 1));
    var tag = s.auto ? t('tagAuto') : t('tagManual');
    var meta = '<span class="ob-s">' + esc(label) + '</span>' +
      (st === 'todo' && s.min ? '<span>' + esc(t('minutes', { n: s.min })) + '</span>' : '') +
      (st === 'todo' ? '<span>' + esc(s.auto && !s.manualOk ? tag : (s.manualOk ? t('tagAuto') : t('tagManual'))) + '</span>' : '');

    var note = '';
    if (s.auto && s.auto !== 'standalone' && remoteDone && a == null && st === 'todo') {
      note = '<p class="ob-warn">' + esc(t('noCheck')) + '</p>';
    }

    var acts = '';
    if (s.href) acts += '<a class="ob-btn ob-pri" href="' + esc(s.href) + '">' + esc(t(s.id + '_cta')) + '</a>';
    if (st !== 'skipped' && canManual(s)) {
      acts += '<button type="button" class="ob-btn" data-act="mark" data-id="' + s.id + '">' +
        esc(st === 'done' ? t('markUndo') : t('markDone')) + '</button>';
    }
    if (s.skippable) {
      acts += '<button type="button" class="ob-link" data-act="skip" data-id="' + s.id + '">' +
        esc(st === 'skipped' ? t('unskip') : t('skip')) + '</button>';
    }

    return '<li class="ob-step" data-st="' + st + '" data-open="' + isOpen + '">' +
      '<h3 class="ob-sh"><button type="button" class="ob-trig" data-act="open" data-id="' + s.id + '"' +
        ' aria-expanded="' + isOpen + '" aria-controls="obp-' + s.id + '">' +
        '<span class="ob-node" aria-hidden="true">' + node + '</span>' +
        '<span><span class="ob-title">' + esc(t(s.id + '_t')) + '</span><span class="ob-meta">' + meta + '</span></span>' +
        '<span class="ob-chev">' + ICON.chev + '</span></button></h3>' +
      '<div class="ob-panel" id="obp-' + s.id + '"' + (isOpen ? '' : ' hidden') + '>' +
        '<p class="ob-why">' + esc(t(s.id + '_why')) + '</p>' +
        '<p>' + esc(t(s.id + '_how')) + '</p>' + detailHtml(s) + note +
        '<div class="ob-act">' + acts + '</div>' +
      '</div></li>';
  }

  function render() {
    if (!stepsEl) return;
    if (!openChosen) openId = firstTodoId();

    var sum = summary();
    var html = '';
    PHASES.forEach(function (ph) {
      var list = STEPS.map(function (s, i) { return { s: s, i: i }; })
        .filter(function (x) { return x.s.phase === ph; });
      var pTotal = 0, pDone = 0;
      list.forEach(function (x) {
        var st = status(x.s);
        if (st === 'skipped') return;
        pTotal++;
        if (st === 'done') pDone++;
      });
      html += '<section class="ob-phase"><div class="ob-phead"><h2>' + esc(t('phase_' + ph)) + '</h2>' +
        '<span>' + esc(t('phaseCount', { done: pDone, total: pTotal })) + '</span></div>' +
        '<ol class="ob-steps">' + list.map(function (x) { return stepHtml(x.s, x.i); }).join('') + '</ol></section>';
    });
    stepsEl.innerHTML = html;

    qs('#obPct').textContent = sum.pct + '%';
    qs('#obLevel').textContent = t(levelKey(sum.pct));
    qs('#obProgress').textContent = t('progress', { done: sum.done, total: sum.total });
    qs('#obTime').textContent = sum.complete ? '' : (sum.min > 0 ? t('timeLeft', { min: sum.min }) : t('timeNone'));

    var nx = qs('#obNext'), nextStep = null;
    STEPS.some(function (s) { if (status(s) === 'todo' && s.href) { nextStep = s; return true; } return false; });
    if (nextStep && !sum.complete) {
      nx.hidden = false;
      nx.href = nextStep.href;
      nx.textContent = t('nextCta');
      nx.title = t(nextStep.id + '_t');
    } else {
      nx.hidden = true;
    }

    var offset = CIRC * (1 - sum.pct / 100);
    if (firstPaint) {
      firstPaint = false;
      arcEl.style.strokeDashoffset = String(CIRC);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { arcEl.style.strokeDashoffset = String(offset); });
      });
    } else {
      arcEl.style.strokeDashoffset = String(offset);
    }

    var comp = qs('#obComplete');
    comp.hidden = !sum.complete;
    if (sum.complete && !state.celebrated) {
      state.celebrated = true;
      saveState();
      root.classList.add('ob-celebrate');
      setTimeout(function () { root.classList.remove('ob-celebrate'); }, 2000);
    }

    qs('#obSignin').hidden = signedIn !== false;

    store(CFG.SUMMARY_KEY, JSON.stringify({ done: sum.done, total: sum.total, pct: sum.pct, complete: sum.complete, t: Date.now() }));
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('on'); }, 2200);
  }

  function focusTrigger(id) {
    if (!id) return;
    var n = stepsEl.querySelector('[data-act="open"][data-id="' + id + '"]');
    if (n) n.focus();
  }

  /* ---------- Live checks (read-only) ---------- */
  function checkStandalone() {
    try {
      auto.standalone = !!((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
        window.navigator.standalone === true);
    } catch (e) { auto.standalone = null; }
  }

  function loadLib() {
    if (document.querySelector('script[data-onb-sb]')) return;
    var s = document.createElement('script');
    s.src = CFG.SB_LIB;
    s.async = true;
    s.setAttribute('data-onb-sb', '1');
    document.head.appendChild(s);
  }

  /* Uses the page's own client when there is one; otherwise the same public
     key the app shell uses. Calls back with null if neither is available. */
  function getClient(cb) {
    var tries = 0;
    (function loop() {
      if (window.supabaseClient && window.supabaseClient.auth) { cb(window.supabaseClient); return; }
      if (window.supabase && typeof window.supabase.createClient === 'function') {
        try { cb(window.supabase.createClient(CFG.SB_URL, CFG.SB_KEY)); return; } catch (e) { /* fall through */ }
      }
      if (tries === 0) loadLib();
      if (++tries < 30) { setTimeout(loop, 300); return; }
      cb(null);
    })();
  }

  function adoptUid(id) {
    if (!id || id === uid) return;
    uid = id;
    store(CFG.LAST_UID, id);
    state = loadState(id);
  }

  function setBusy(on) {
    busy = on;
    var rb = qs('#obRefresh');
    if (rb) { rb.disabled = on; rb.textContent = on ? t('refreshing') : t('refresh'); }
  }

  var ctxP = null;

  function safe(p) { return p.then(function (x) { return x && !x.error ? x : null; }, function () { return null; }); }
  function cnt(p) { return safe(p).then(function (x) { return x && typeof x.count === 'number' ? x.count : null; }); }

  /* Signed-in client and their client_id (cached; force looks again). */
  function getCtx(force) {
    if (ctxP && !force) return ctxP;
    ctxP = new Promise(function (resolve) {
      getClient(function (client) {
        if (!client) { resolve(null); return; }
        client.auth.getSession().then(function (r) {
          var session = r && r.data && r.data.session;
          if (!session) { signedIn = false; resolve(null); return; }
          signedIn = true;
          adoptUid(session.user.id);
          return client.from('client_data').select('client_id').eq('auth_user_id', session.user.id).maybeSingle()
            .then(function (res) {
              var cid = res && res.data && res.data.client_id;
              resolve(cid ? { client: client, cid: cid } : null);
            });
        }).catch(function () { resolve(null); });
      });
    });
    return ctxP;
  }

  function text(v) { return !!(v && String(v).trim()); }

  function checkRemote() {
    if (busy) return;
    setBusy(true);
    checkStandalone();
    getCtx(true).then(function (ctx) {
      if (!ctx) return null;
      var c = ctx.client, cid = ctx.cid;
      return Promise.all([
        cnt(c.from('leads').select('id', { count: 'exact', head: true }).eq('client_id', cid)),
        safe(c.from('client_channel_connections').select('channel,status,can_send').eq('client_id', cid).in('channel', ['instagram', 'whatsapp'])),
        cnt(c.from('profile_media').select('id', { count: 'exact', head: true }).eq('client_id', cid).eq('entity_type', 'business').eq('media_role', 'logo')),
        safe(c.from('client_profile_details').select('business_display_name').eq('client_id', cid).maybeSingle()),
        safe(c.from('client_business_profiles').select('description').eq('client_id', cid).maybeSingle()),
        cnt(c.from('offers').select('id', { count: 'exact', head: true }).eq('client_id', cid).eq('status', 'active')),
        cnt(c.from('client_knowledge_items').select('id', { count: 'exact', head: true }).eq('client_id', cid).eq('status', 'active'))
      ]);
    }).then(function (a) {
      if (!a) return;
      auto.leads = a[0] == null ? null : a[0] > 0;
      var rows = a[1] && Array.isArray(a[1].data) ? a[1].data : null;
      if (rows) {
        var on = { instagram: false, whatsapp: false };
        rows.forEach(function (row) {
          if (row && row.status === 'connected' && row.can_send !== false && row.channel in on) on[row.channel] = true;
        });
        auto.whatsapp = on.whatsapp;
        auto.instagram = on.instagram;
      } else { auto.whatsapp = null; auto.instagram = null; }
      det.logo = a[2] == null ? null : a[2] > 0;
      det.name = a[3] == null ? null : text(a[3].data && a[3].data.business_display_name);
      det.desc = a[4] == null ? null : text(a[4].data && a[4].data.description);
      det.services = a[5];
      det.items = a[6];
      auto.profile = det.logo == null || det.name == null ? null : (det.logo && det.name);
      auto.services = det.services == null ? null : det.services > 0;
      auto.knowledge = det.desc == null || det.items == null ? null : (det.desc && det.items > 0);
    }).catch(function () { /* keep what is shown */ })
      .then(function () { remoteDone = true; setBusy(false); render(); });
  }

  function detailHtml(s) {
    var items = [];
    if (s.id === 'profile') items = [[det.logo, t('dLogo')], [det.name, t('dName')]];
    else if (s.id === 'services') { if (det.services != null) items = [[det.services > 0, t('dServices', { n: det.services })]]; }
    else if (s.id === 'knowledge') {
      items = [[det.desc, t('dDesc')]];
      if (det.items != null) items.push([det.items > 0, t('dItems', { n: det.items })]);
    }
    items = items.filter(function (x) { return x[0] != null; });
    if (!items.length) return '';
    return '<ul class="ob-det">' + items.map(function (x) {
      return '<li data-ok="' + (x[0] === true) + '">' + esc(x[1]) + '</li>';
    }).join('') + '</ul>';
  }

  /* ---------- Template copy ---------- */
  function templateText() {
    return t('tpl').map(function (row) { return row[0] + ':\n' + row[1] + '\n'; }).join('\n');
  }

  function copyText(text, okKey) {
    var fallback = function () {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      toast(ok ? t(okKey) : t('tplFail'));
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(t(okKey)); }, fallback);
    } else {
      fallback();
    }
  }

  function copyTemplate() { copyText(templateText(), 'tplCopied'); }

  /* ---------- Events ---------- */
  function setLang(next) {
    if (next !== 'en' && next !== 'hi') return;
    lang = next;
    store(CFG.LANG_KEY, lang);
    applyStatic();
    render();
    renderReport();
  }

  function bind() {
    qsa('.ob-lang [data-lang]').forEach(function (b) {
      b.addEventListener('click', function () { setLang(b.getAttribute('data-lang')); });
    });

    stepsEl.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var id = b.getAttribute('data-id');
      var act = b.getAttribute('data-act');
      var focusId = id;

      if (act === 'open') {
        openChosen = true;
        openId = openId === id ? null : id;
      } else if (act === 'mark') {
        state.done[id] = !state.done[id];
        saveState();
        if (state.done[id]) {
          openChosen = false;
          openId = null;
          render();
          openChosen = true;
          focusId = openId || id;
          focusTrigger(focusId);
          return;
        }
      } else if (act === 'skip') {
        state.skipped[id] = !state.skipped[id];
        saveState();
      }
      render();
      focusTrigger(focusId);
    });

    qs('#obRefresh').addEventListener('click', function () { checkRemote(); });

    qsa('.ob-tabs [data-tab]').forEach(function (b) {
      b.addEventListener('click', function () { setTab(b.getAttribute('data-tab'), true); });
    });
    qs('.ob-tabs').addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var nx = tab === 'setup' ? 'report' : 'setup';
      setTab(nx, true);
      var b = qs('.ob-tabs [data-tab="' + nx + '"]');
      if (b) b.focus();
    });
    qsa('.rp-per [data-per]').forEach(function (b) {
      b.addEventListener('click', function () { per = b.getAttribute('data-per'); loadReport(per, false); });
    });
    qs('#rpRefresh').addEventListener('click', function () { checkRemote(); delete rep[per]; loadReport(per, true); });
    qs('#rpCopy').addEventListener('click', function () { var s = summaryText(); if (s) copyText(s, 'rpCopied'); });
    qs('#rpPrint').addEventListener('click', function () { window.print(); });
    window.addEventListener('hashchange', function () {
      var hh = (location.hash || '').toLowerCase();
      if (hh === '#reports') setTab('report', false);
      else if (hh === '#setup') setTab('setup', false);
    });
    qs('#obCopy').addEventListener('click', copyTemplate);
    qs('#obHelp').addEventListener('click', function () {
      if (window.GlimeFeedback && typeof window.GlimeFeedback.open === 'function') {
        window.GlimeFeedback.open({ type: 'question' });
      } else {
        location.hash = '#feedback';
      }
    });
    qs('#obReset').addEventListener('click', function () {
      if (!window.confirm(t('resetConfirm'))) return;
      state = { done: {}, skipped: {}, celebrated: false };
      saveState();
      openChosen = false;
      render();
    });

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) checkRemote();
    });
  }

  function init() {
    root = document.getElementById('ob');
    if (!root) return;
    stepsEl = document.getElementById('obSteps');
    toastEl = document.getElementById('obToast');
    arcEl = document.getElementById('obArc');
    wrapEl = document.getElementById('obRingWrap');

    var saved = store(CFG.LANG_KEY);
    if (saved === 'en' || saved === 'hi') lang = saved;
    else lang = /^hi\b/i.test(navigator.language || '') ? 'hi' : 'en';

    uid = store(CFG.LAST_UID) || '';
    state = loadState(uid);
    checkStandalone();

    var hh = (location.hash || '').toLowerCase(), startTab = 'setup';
    if (hh === '#reports' || hh === '#report') startTab = 'report';
    else if (hh !== '#setup') {
      try { var ls = JSON.parse(store(CFG.SUMMARY_KEY) || 'null'); if (ls && ls.complete) startTab = 'report'; } catch (e) { /* ignore */ }
    }
    tab = startTab;
    applyStatic();
    bind();
    render();
    setTab(startTab, false);
    checkRemote();
  }

  /* =========================================================
     TABS + REPORTS
  ========================================================= */
  function updateTitle() {
    var key = tab === 'report' ? 'tabReport' : 'pageTitle';
    var gt = document.getElementById('gasTitle');
    if (gt) gt.textContent = t(key);
    document.title = t(key) + ' | GLIME';
  }

  function setTab(next, replace) {
    tab = next === 'report' ? 'report' : 'setup';
    qs('#viewSetup').hidden = tab !== 'setup';
    qs('#viewReport').hidden = tab !== 'report';
    qsa('.ob-tabs [data-tab]').forEach(function (b) {
      b.setAttribute('aria-selected', String(b.getAttribute('data-tab') === tab));
    });
    updateTitle();
    if (replace) { try { history.replaceState(null, '', '#' + (tab === 'report' ? 'reports' : 'setup')); } catch (e) { /* ignore */ } }
    if (tab === 'report') loadReport(per, false);
  }

  function range(p) {
    var n = p === 'month' ? 30 : 7, end = new Date();
    var start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (n - 1));
    var prevStart = new Date(start.getFullYear(), start.getMonth(), start.getDate() - n);
    return { n: n, start: start, prevStart: prevStart, end: end };
  }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function dkey(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function loc() { return lang === 'hi' ? 'hi-IN' : 'en-IN'; }
  function fmtNum(n) { return n == null ? '–' : Number(n).toLocaleString('en-IN'); }
  function fmtMoney(n, cur) {
    if (n == null) return '–';
    try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: cur || 'INR', maximumFractionDigits: 0 }).format(n); }
    catch (e) { return fmtNum(Math.round(n)); }
  }
  function fmtDur(min) {
    if (min == null) return '–';
    if (min < 60) return min + ' ' + t('unitMin');
    var h = Math.floor(min / 60), m = min % 60;
    return h + ' ' + t('unitHr') + (m ? ' ' + m + ' ' + t('unitMin') : '');
  }
  function fmtDate(d) {
    try { return d.toLocaleDateString(loc(), { day: 'numeric', month: 'short' }); } catch (e) { return dkey(d); }
  }
  function srcName(s) {
    s = String(s || '').trim();
    if (!s) return t('rpOther');
    var low = s.toLowerCase();
    if (low === 'whatsapp') return 'WhatsApp';
    if (low === 'instagram') return 'Instagram';
    return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
  }

  function loadReport(p, force) {
    if (!force && rep[p]) { renderReport(); return; }
    if (repBusy) return;
    repBusy = true;
    renderReport();
    getCtx().then(function (ctx) {
      if (!ctx) { rep[p] = { error: signedIn === false ? 'signin' : 'fail' }; return; }
      var c = ctx.client, cid = ctx.cid, r = range(p);
      var s0 = r.start.toISOString(), p0 = r.prevStart.toISOString(), e0 = new Date(r.end.getTime() + 60000).toISOString();
      var between = function (table, from, to, mod) {
        var q = c.from(table).select('id', { count: 'exact', head: true }).eq('client_id', cid).gte('created_at', from).lt('created_at', to);
        return cnt(mod ? mod(q) : q);
      };
      var ai = function (q) { return q.eq('direction', 'outbound').not('specialist_module_slug', 'is', null); };
      var rowsQ = function (table, cols) {
        return safe(c.from(table).select(cols).eq('client_id', cid).gte('created_at', p0).order('created_at', { ascending: false }).limit(5000))
          .then(function (x) { return x && Array.isArray(x.data) ? x.data : null; });
      };
      return Promise.all([
        rowsQ('leads', 'created_at,source'),
        rowsQ('orders', 'created_at,total_amount,status,currency'),
        between('customers', s0, e0), between('customers', p0, s0),
        between('whatsapp_messages', s0, e0, ai), between('whatsapp_messages', p0, s0, ai),
        between('instagram_messages', s0, e0, ai), between('instagram_messages', p0, s0, ai)
      ]).then(function (a) { rep[p] = buildReport(r, a); });
    }).catch(function () { rep[p] = { error: 'fail' }; })
      .then(function () {
        repBusy = false;
        renderReport();
        if (tab === 'report' && !rep[per]) loadReport(per, false);
      });
  }

  function buildReport(r, a) {
    var out = { partial: false, days: [], sources: [], currency: 'INR' };
    var sT = r.start.getTime(), pT = r.prevStart.getTime(), idx = {}, i;
    for (i = 0; i < r.n; i++) {
      var d = new Date(r.start.getFullYear(), r.start.getMonth(), r.start.getDate() + i);
      var day = { k: dkey(d), d: d, n: 0 };
      out.days.push(day);
      idx[day.k] = day;
    }
    if (a[0]) {
      var lc = 0, lp = 0, src = {};
      a[0].forEach(function (row) {
        var tt = new Date(row.created_at).getTime();
        if (tt >= sT) {
          lc++;
          var dd = idx[dkey(new Date(tt))];
          if (dd) dd.n++;
          var sk = String(row.source || '').trim().toLowerCase();
          src[sk] = (src[sk] || 0) + 1;
        } else if (tt >= pT) lp++;
      });
      out.leads = { c: lc, p: lp };
      out.sources = Object.keys(src).map(function (k) { return [k, src[k]]; }).sort(function (x, y) { return y[1] - x[1]; });
    } else { out.leads = null; out.partial = true; }
    if (a[1]) {
      var oc = 0, op = 0, vc = 0, vp = 0;
      a[1].forEach(function (row) {
        if (String(row.status || '').toLowerCase() === 'cancelled') return;
        var tt = new Date(row.created_at).getTime(), v = Number(row.total_amount) || 0;
        if (row.currency) out.currency = row.currency;
        if (tt >= sT) { oc++; vc += v; } else if (tt >= pT) { op++; vp += v; }
      });
      out.orders = { c: oc, p: op };
      out.value = { c: vc, p: vp };
    } else { out.orders = null; out.value = null; out.partial = true; }
    var pair = function (x, y) { return x == null || y == null ? null : { c: x, p: y }; };
    out.customers = pair(a[2], a[3]);
    var rc = a[4] == null || a[6] == null ? null : a[4] + a[6];
    var rp = a[5] == null || a[7] == null ? null : a[5] + a[7];
    out.replies = pair(rc, rp);
    out.saved = pair(rc == null ? null : rc * EST_MIN, rp == null ? null : rp * EST_MIN);
    if (!out.customers || !out.replies) out.partial = true;
    return out;
  }

  function kpiDefs(data) {
    return [
      ['leads', 'rpKpiLeads', fmtNum],
      ['customers', 'rpKpiCustomers', fmtNum],
      ['orders', 'rpKpiOrders', fmtNum],
      ['value', 'rpKpiValue', function (v) { return fmtMoney(v, data.currency); }],
      ['replies', 'rpKpiReplies', fmtNum],
      ['saved', 'rpKpiSaved', fmtDur]
    ];
  }

  function deltaHtml(m) {
    if (!m || m.c == null || m.p == null) return '';
    var dir, txt;
    if (m.p === 0) { dir = m.c === 0 ? 'flat' : 'up'; txt = m.c === 0 ? t('rpSame') : t('rpNew'); }
    else {
      var pc = Math.round((m.c - m.p) / m.p * 100);
      dir = pc > 0 ? 'up' : (pc < 0 ? 'down' : 'flat');
      txt = pc === 0 ? t('rpSame') : (pc > 0 ? '▲ ' : '▼ ') + Math.abs(pc) + '%';
    }
    return '<em class="rp-d" data-dir="' + dir + '">' + esc(txt) + '</em>';
  }

  function renderReport() {
    var kp = qs('#rpKpis');
    if (!kp) return;
    qsa('.rp-per [data-per]').forEach(function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-per') === per)); });
    var r = range(per), n = r.n, data = rep[per];
    qs('#rpRange').textContent = t('rpRange', { n: n, from: fmtDate(r.start), to: fmtDate(r.end) });
    var ins = qs('#rpInsight'), bars = qs('#rpBars'), axis = qs('#rpAxis'), srcEl = qs('#rpSources'), note = qs('#rpNote');

    if (!data || data.error) {
      ins.textContent = !data ? t('rpLoading') : (data.error === 'signin' ? t('rpSignin') : t('rpFail'));
      kp.innerHTML = data ? '' : kpiDefs({}).map(function (k) {
        return '<div class="rp-k rp-load"><b>&nbsp;</b><span>' + esc(t(k[1])) + '</span></div>';
      }).join('');
      bars.innerHTML = ''; axis.innerHTML = ''; srcEl.innerHTML = ''; note.textContent = '';
      return;
    }

    kp.innerHTML = kpiDefs(data).map(function (k) {
      var m = data[k[0]];
      return '<div class="rp-k"><b>' + esc(m ? k[2](m.c) : '–') + '</b><span>' + esc(t(k[1])) + '</span>' + deltaHtml(m) + '</div>';
    }).join('');

    var L = data.leads, R = data.replies, txt;
    if (!(L && L.c) && !(R && R.c) && !(data.orders && data.orders.c)) txt = t('rpInsightNone', { n: n });
    else {
      txt = t('rpInsight1', { n: n, leads: fmtNum(L ? L.c : 0), replies: fmtNum(R ? R.c : 0), saved: fmtDur(data.saved ? data.saved.c : 0) });
      if (L && L.p > 0) {
        var pc = Math.round((L.c - L.p) / L.p * 100);
        if (pc !== 0) txt += ' ' + t(pc > 0 ? 'rpInsightUp' : 'rpInsightDown', { x: Math.abs(pc), n: n });
      }
    }
    ins.textContent = txt;
    note.textContent = t('rpVsPrev', { n: n }) + ' ' + t('rpEstNote', { m: EST_MIN }) + (data.partial ? ' ' + t('rpPartial') : '');

    var max = 0, total = 0, peak = null;
    data.days.forEach(function (d) { total += d.n; if (d.n > max) { max = d.n; peak = d; } });
    bars.setAttribute('aria-label', t('rpChartAria', { total: total, day: peak ? fmtDate(peak.d) : '–', peak: max }));
    bars.innerHTML = data.days.map(function (d) {
      var h = d.n === 0 ? 2 : Math.max(6, Math.round(d.n / max * 100));
      return '<div class="rp-bar" data-n="' + d.n + '" style="height:' + h + '%" title="' + esc(fmtDate(d.d) + ': ' + d.n) + '"></div>';
    }).join('');
    axis.innerHTML = data.days.map(function (d, i) {
      var lbl = per === 'week' ? d.d.toLocaleDateString(loc(), { weekday: 'short' }) : (i % 5 === 0 ? String(d.d.getDate()) : '');
      return '<span>' + esc(lbl) + '</span>';
    }).join('');

    var top = data.sources.slice(0, 5), topMax = top.length ? top[0][1] : 1;
    srcEl.innerHTML = top.length ? top.map(function (s) {
      return '<li><span>' + esc(srcName(s[0])) + '</span><b>' + s[1] + '</b><i style="--w:' + Math.round(s[1] / topMax * 100) + '%"></i></li>';
    }).join('') : '<li class="rp-empty">' + esc(t('rpNoSrc')) + '</li>';
  }

  function summaryText() {
    var data = rep[per];
    if (!data || data.error) return '';
    var r = range(per);
    var lines = ['GLIME: ' + t('rpTitle'), t('rpRange', { n: r.n, from: fmtDate(r.start), to: fmtDate(r.end) }), ''];
    kpiDefs(data).forEach(function (k) {
      var m = data[k[0]];
      lines.push(t(k[1]) + ': ' + (m ? k[2](m.c) : '–'));
    });
    lines.push('', t('rpEstNote', { m: EST_MIN }));
    return lines.join('\n');
  }

  window.GlimeOnboarding = {
    /* Small summary the dashboard can read: { done, total, pct, complete } */
    getProgress: function () { return summary(); },
    refresh: function () { checkRemote(); },
    setLanguage: function (l) { setLang(l); }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
