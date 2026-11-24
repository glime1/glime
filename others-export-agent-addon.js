/* =========================================================
   GLIME OTHERS > EXPORT AGENT
   Deep link: others.html#export-agent

   WHAT IT IS
   An AI agent that talks to an overseas distributor on WhatsApp, in the
   distributor's language, from GLIME's own WhatsApp number. The client
   reads the whole conversation (both sides) translated into any language
   they choose, and can pause the agent, instruct it privately, or take
   over and reply themselves.

   The agent has its OWN knowledge ("Agent setup"), separate from the rest
   of GLIME: business summary, products, the distributor margin %, the
   maximum extra discount it may offer, key points, things it must never
   say, FAQ, and when it must ask the client first.

   FRONTEND IS FINAL. Backend must follow this contract exactly.
   Full backend spec: EXPORT_AGENT_BACKEND_SPEC.md

   ACCESS
   Same gate as the Export Network: export_network_my_access() must return
   approved. Anything else shows the locked screen (fails closed).

   RPC CONTRACT (all security definer; caller must be an approved client)
   View language = p_view_language, plain English name of the language
   ("Hindi", "English", "Arabic"...). Backend translates, caches, and
   returns text already in that language plus the original.

   export_agent_config_get() -> { config: object|null, version: int, updated_at }
   export_agent_config_save(p_config jsonb, p_version int) -> { ok, version }
        raises version_conflict | invalid

   export_agent_distributors() -> { items: [{ id, company_name, country,
        country_code, city, primary_language, languages[],
        open_conversation_id|null }], limits: { daily_new, used_today } }
        Only distributors the client is CONNECTED to.

   export_agent_conversation_preview(p_distributor_id uuid, p_product_ids text[],
        p_goal text, p_language text, p_view_language text)
        -> { language, text, text_view }
   export_agent_conversation_start(p_distributor_id uuid, p_product_ids text[],
        p_goal text, p_language text) -> { ok, id }
        raises setup_incomplete | not_connected | already_open | daily_limit |
               country_not_allowed | agent_disabled

   export_agent_conversations(p_status text, p_search text, p_limit int,
        p_offset int, p_view_language text)
        -> { total, counts: { all, needs_you, active, paused, closed },
             items: [{ id, distributor_id, company_name, country, country_code,
               city, status, mode, language, needs_you, needs_you_kind,
               last_message_preview, last_message_at, unread, started_at }] }
        status: queued | active | needs_you | paused | closed | failed
        mode:   agent | manual
        p_status '' = all

   export_agent_messages(p_conversation_id uuid, p_view_language text, p_after text)
        -> { conversation: { same fields as an item above, plus
               needs_you_reason }, messages: [{ id, sender, kind, text,
               original_text, original_language, created_at, delivery }] }
        sender: agent | distributor | client | system
        kind:   text | instruction | escalation | notice
        delivery (outgoing only): queued | sent | delivered | read | failed
        Fetching marks incoming messages as read.

   export_agent_conversation_control(p_conversation_id uuid, p_action text)
        -> { ok, status, mode }
        action: pause | resume | takeover | handback | close
   export_agent_instruct(p_conversation_id uuid, p_note text) -> { ok }
   export_agent_translate(p_text text, p_from text, p_to text) -> { text }
   export_agent_reply(p_conversation_id uuid, p_text text, p_text_language text)
        -> { ok } (manual mode only)

   Error words the UI recognises: not_approved, agent_disabled,
   setup_incomplete, daily_limit, country_not_allowed, not_connected,
   already_open, not_found, invalid, version_conflict, closed, rate_limited,
   translate_failed, note_too_long.

   CONFIG (schema 1) is stored by the backend as-is (jsonb):
   { schema, agent_name, business_name, about, tone, view_language,
     products[{ id, name, category, unit, min_order_qty, price, currency,
                lead_time_days, hs_code, packaging, certifications, description }],
     terms{ distributor_margin_percent, max_discount_percent, min_order_value,
            min_order_currency, payment_terms[], shipping_terms[],
            sample_policy, sample_note, delivery_note, regions },
     talking_points, avoid, faq[{ q, a }], escalate[],
     quiet_hours{ enabled, start, end } }
========================================================= */
(function () {
  'use strict';
  if (!window.GLIME_OTHERS) return;

  var O = window.GLIME_OTHERS;
  var esc = function (v) { return O.ui.escapeHtml(v); };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var LS_UI = 'glime_exa_ui_lang';
  var LS_VIEW = 'glime_exa_view_lang';
  var PAGE = 20;
  var POLL_LIST = 30000;
  var POLL_THREAD = 12000;
  var MAX = { about: 1500, talk: 1500, avoid: 800, desc: 500, products: 100, faq: 20, instr: 500, reply: 1000, goal: 500, short: 250 };

  var LANGS = ['English', 'Hindi', 'Arabic', 'Russian', 'Chinese (Mandarin)', 'French', 'Spanish', 'Portuguese', 'German', 'Italian', 'Dutch', 'Turkish', 'Persian (Farsi)', 'Urdu', 'Bengali', 'Tamil', 'Telugu', 'Marathi', 'Gujarati', 'Punjabi', 'Kannada', 'Malayalam', 'Nepali', 'Sinhala', 'Indonesian', 'Malay', 'Vietnamese', 'Thai', 'Japanese', 'Korean', 'Filipino (Tagalog)', 'Khmer', 'Burmese', 'Swahili', 'Amharic', 'Hausa', 'Yoruba', 'Zulu', 'Afrikaans', 'Somali', 'Polish', 'Ukrainian', 'Romanian', 'Greek', 'Czech', 'Hungarian', 'Bulgarian', 'Serbian', 'Croatian', 'Slovak', 'Swedish', 'Norwegian', 'Danish', 'Finnish', 'Hebrew', 'Kazakh', 'Uzbek', 'Azerbaijani', 'Georgian', 'Armenian', 'Albanian', 'Pashto', 'Kurdish', 'Mongolian'];
  var UNITS = ['kg', 'ton', 'piece', 'box', 'carton', 'litre', 'metre', 'pack', 'other'];
  var CURRENCIES = ['USD', 'AED', 'INR', 'EUR'];
  var PAY = ['Advance payment', 'Letter of credit (LC)', 'Net 30 days', 'Net 60 days', 'Escrow', 'Other'];
  var SHIP = ['EXW', 'FOB', 'CIF', 'CFR', 'DDP'];
  var ESC_KINDS = ['price_below_limit', 'order_confirmation', 'payment_details', 'contract_legal', 'customs_documents', 'complaint', 'unsure'];
  var ESC_LOCKED = ['order_confirmation', 'payment_details', 'contract_legal'];

  /* ---------------- text: [English, Hindi] ---------------- */
  var D = {
    title: ['Export Agent', 'एक्सपोर्ट एजेंट'],
    sub: ['An AI agent talks to your overseas distributors on WhatsApp, in their language. You read everything in yours.', 'एक AI एजेंट आपके विदेशी distributor से WhatsApp पर उनकी भाषा में बात करता है। आप सब कुछ अपनी भाषा में पढ़ते हैं।'],
    ui_lang: ['Interface', 'इंटरफ़ेस'],
    view_lang: ['Show conversations in', 'बातचीत इस भाषा में दिखाएँ'],
    tab_conv: ['Conversations', 'बातचीत'],
    tab_new: ['New conversation', 'नई बातचीत'],
    tab_setup: ['Agent setup', 'एजेंट सेटअप'],
    checking: ['Checking access…', 'अनुमति जाँची जा रही है…'],
    loading: ['Loading…', 'लोड हो रहा है…'],
    locked_t: ['This section is locked', 'यह सेक्शन लॉक है'],
    locked_d: ['The Export Agent opens only after GLIME approves your account for the Export Network.', 'Export Agent तभी खुलता है जब GLIME आपके अकाउंट को Export Network के लिए मंज़ूर कर दे।'],
    retry: ['Try again', 'दोबारा कोशिश करें'],
    refresh: ['Refresh', 'रिफ़्रेश'],
    back: ['Back', 'वापस'],
    cancel: ['Cancel', 'रद्द करें'],
    show_more: ['Show more', 'और दिखाएँ'],
    select_one: ['Select one', 'एक चुनें'],
    err_generic: ['Something went wrong. Please try again.', 'कुछ गड़बड़ हो गई। कृपया दोबारा कोशिश करें।'],
    err_backend: ['This feature is not available yet.', 'यह सुविधा अभी उपलब्ध नहीं है।'],
    e_not_approved: ['Your account is not approved for the Export Network.', 'आपका अकाउंट Export Network के लिए मंज़ूर नहीं है।'],
    e_disabled: ['The Export Agent is switched off for now.', 'Export Agent अभी बंद है।'],
    e_setup: ['Finish the agent setup first.', 'पहले एजेंट सेटअप पूरा करें।'],
    e_daily: ["You reached today's limit for new conversations. Try again tomorrow.", 'आज की नई बातचीतों की सीमा पूरी हो गई। कल फिर कोशिश करें।'],
    e_country: ['Conversations with distributors in this country are not open yet.', 'इस देश के distributor से बातचीत अभी शुरू नहीं हुई है।'],
    e_not_connected: ['You are not connected to this distributor yet.', 'आप इस distributor से अभी जुड़े नहीं हैं।'],
    e_open: ['A conversation with this distributor is already open.', 'इस distributor से बातचीत पहले से खुली है।'],
    e_not_found: ['This item no longer exists.', 'यह अब मौजूद नहीं है।'],
    e_invalid: ['Some details are missing or not valid.', 'कुछ जानकारी अधूरी या गलत है।'],
    e_conflict: ['This was changed somewhere else. Reload to see the latest version.', 'यह कहीं और बदला गया है। नवीनतम देखने के लिए रीलोड करें।'],
    e_closed: ['This conversation is closed.', 'यह बातचीत बंद है।'],
    e_rate: ['Too many requests. Please wait a moment.', 'बहुत ज़्यादा अनुरोध। थोड़ा रुकें।'],
    e_translate: ['Translation is not available right now.', 'अनुवाद अभी उपलब्ध नहीं है।'],
    e_note_long: ['The text is too long.', 'लिखा हुआ पाठ बहुत लंबा है।'],

    f_all: ['All', 'सभी'],
    f_needs: ['Needs you', 'आपकी ज़रूरत'],
    f_active: ['Active', 'चालू'],
    f_paused: ['Paused', 'रुकी हुई'],
    f_closed: ['Closed', 'बंद'],
    search_ph: ['Search by company or country', 'कंपनी या देश से खोजें'],
    empty_conv: ['No conversations yet. Start one from the New conversation tab.', 'अभी कोई बातचीत नहीं है। "नई बातचीत" टैब से शुरू करें।'],
    empty_filter: ['No conversations match this filter.', 'इस फ़िल्टर से कोई बातचीत नहीं मिली।'],
    st_queued: ['Queued', 'कतार में'],
    st_active: ['Active', 'चालू'],
    st_needs_you: ['Needs you', 'आपकी ज़रूरत'],
    st_paused: ['Paused', 'रुकी हुई'],
    st_closed: ['Closed', 'बंद'],
    st_failed: ['Failed', 'विफल'],
    mode_agent: ['Agent is replying', 'एजेंट जवाब दे रहा है'],
    mode_manual: ['You are replying', 'आप खुद जवाब दे रहे हैं'],
    talking_in: ['Talking in {lang}', '{lang} में बातचीत'],
    who_agent: ['Agent', 'एजेंट'],
    who_distributor: ['Distributor', 'Distributor'],
    who_client: ['You', 'आप'],
    who_system: ['GLIME', 'GLIME'],
    note_label: ['Your private instruction to the agent', 'एजेंट को आपका निजी निर्देश'],
    show_orig: ['Show original', 'मूल दिखाएँ'],
    hide_orig: ['Hide original', 'मूल छिपाएँ'],
    orig_in: ['Original ({lang})', 'मूल ({lang})'],
    orig_all: ['Show original text under every message', 'हर संदेश के नीचे मूल पाठ दिखाएँ'],
    d_queued: ['Waiting to send', 'भेजने के इंतज़ार में'],
    d_sent: ['Sent', 'भेजा गया'],
    d_delivered: ['Delivered', 'पहुँचा'],
    d_read: ['Read', 'पढ़ा गया'],
    d_failed: ['Not delivered', 'नहीं पहुँचा'],
    needs_banner: ['The agent needs your decision', 'एजेंट को आपका फ़ैसला चाहिए'],
    needs_help: ['Write your answer below. It goes to the agent privately and the agent continues from there. Or reply yourself.', 'नीचे अपना जवाब लिखें। यह एजेंट तक निजी रूप से जाता है और एजेंट वहीं से आगे बढ़ता है। या खुद जवाब दें।'],
    esc_price_below_limit: ['Price or discount beyond your limit', 'आपकी सीमा से बाहर कीमत या छूट'],
    esc_order_confirmation: ['Order confirmation', 'ऑर्डर की पुष्टि'],
    esc_payment_details: ['Payment or bank details', 'पेमेंट या बैंक विवरण'],
    esc_contract_legal: ['Contract or legal terms', 'अनुबंध या कानूनी शर्तें'],
    esc_customs_documents: ['Customs or export documents', 'कस्टम या एक्सपोर्ट दस्तावेज़'],
    esc_complaint: ['Complaint or dispute', 'शिकायत या विवाद'],
    esc_unsure: ['Anything the agent is unsure about', 'कोई भी बात जिसमें एजेंट को संदेह हो'],
    btn_pause: ['Pause agent', 'एजेंट रोकें'],
    btn_resume: ['Resume agent', 'एजेंट फिर चालू करें'],
    btn_takeover: ['I will reply myself', 'मैं खुद जवाब दूँगा'],
    btn_handback: ['Let the agent continue', 'एजेंट को आगे चलाने दें'],
    btn_close: ['End conversation', 'बातचीत खत्म करें'],
    confirm_close: ['End this conversation? The agent will stop and cannot send more messages.', 'यह बातचीत खत्म करें? एजेंट रुक जाएगा और आगे संदेश नहीं भेज सकेगा।'],
    confirm_takeover: ['Take over? The agent stops replying until you hand it back.', 'क्या आप खुद सँभालेंगे? जब तक आप वापस न दें, एजेंट जवाब नहीं देगा।'],
    instr_ph: ['For example: You can offer 5% extra on orders above 10 tons.', 'उदाहरण: 10 टन से ऊपर के ऑर्डर पर 5% अतिरिक्त छूट दे सकते हैं।'],
    instr_send: ['Send to agent', 'एजेंट को भेजें'],
    instr_ok: ['Instruction sent to the agent.', 'निर्देश एजेंट को भेज दिया गया।'],
    reply_lbl: ['Your reply', 'आपका जवाब'],
    reply_ph: ['Write in any language. GLIME translates it for the distributor.', 'किसी भी भाषा में लिखें। GLIME इसे distributor के लिए अनुवाद करेगा।'],
    reply_from: ['I am writing in', 'मैं इस भाषा में लिख रहा हूँ'],
    btn_preview: ['Preview translation', 'अनुवाद देखें'],
    btn_send: ['Send', 'भेजें'],
    will_send: ['Will be sent in {lang}:', '{lang} में यह भेजा जाएगा:'],
    sent_ok: ['Message sent.', 'संदेश भेज दिया गया।'],
    read_only: ['This conversation is closed. You can still read it.', 'यह बातचीत बंद है। आप इसे पढ़ सकते हैं।'],
    failed_note: ['This conversation could not continue.', 'यह बातचीत आगे नहीं चल सकी।'],
    ctl_ok: ['Done.', 'हो गया।'],
    no_messages: ['No messages yet.', 'अभी कोई संदेश नहीं।'],

    new_title: ['Start a conversation', 'बातचीत शुरू करें'],
    setup_first: ['Finish the agent setup before starting a conversation.', 'बातचीत शुरू करने से पहले एजेंट सेटअप पूरा करें।'],
    go_setup: ['Open agent setup', 'एजेंट सेटअप खोलें'],
    no_connected: ['No connected distributors yet. Ask for an introduction in the Export Network section. When GLIME connects you, the distributor appears here.', 'अभी कोई जुड़ा हुआ distributor नहीं है। Export Network में introduction माँगें। GLIME के जोड़ने पर distributor यहाँ दिखेगा।'],
    f_dist: ['Distributor', 'Distributor'],
    f_conv_lang: ['Conversation language', 'बातचीत की भाषा'],
    f_products: ['Products to talk about *', 'जिन उत्पादों पर बात करनी है *'],
    f_goal: ['What should the agent achieve? *', 'एजेंट को क्या हासिल करना है? *'],
    goal_ph: ['For example: Introduce our basmati rice and find out their monthly demand and preferred price.', 'उदाहरण: हमारे बासमती चावल का परिचय दें और उनकी मासिक माँग व पसंदीदा कीमत पूछें।'],
    has_open: ['conversation already open', 'बातचीत पहले से खुली है'],
    btn_preview_open: ['Preview opening message', 'पहला संदेश देखें'],
    btn_start: ['Send via GLIME WhatsApp', 'GLIME WhatsApp से भेजें'],
    open_note: ["The first message is sent from GLIME's WhatsApp number as an approved template. After the distributor replies, the agent continues the conversation.", 'पहला संदेश GLIME के WhatsApp नंबर से मंज़ूर template के रूप में जाता है। distributor के जवाब देने पर एजेंट बातचीत आगे बढ़ाता है।'],
    limit_note: ['{used} of {max} new conversations used today.', 'आज {used}/{max} नई बातचीतें इस्तेमाल हुईं।'],
    started_ok: ['Conversation started.', 'बातचीत शुरू हो गई।'],
    pv_orig: ['Opening message in {lang}', '{lang} में पहला संदेश'],
    pv_view: ['In your language ({lang})', 'आपकी भाषा में ({lang})'],
    v_new: ['Choose a distributor, at least one product, and write the goal (at least 10 characters).', 'distributor चुनें, कम से कम एक उत्पाद चुनें और लक्ष्य लिखें (कम से कम 10 अक्षर)।'],

    su_sub: ["This is the agent's own knowledge. It is separate from the rest of GLIME. The agent only talks about what you write here.", 'यह एजेंट का अपना ज्ञान है। यह GLIME के बाकी सिस्टम से अलग है। एजेंट सिर्फ़ वही बताएगा जो आप यहाँ लिखेंगे।'],
    su_unsaved: ['Unsaved changes', 'बिना सेव किए बदलाव'],
    su_saved: ['All changes saved', 'सभी बदलाव सेव हैं'],
    su_save: ['Save agent setup', 'एजेंट सेटअप सेव करें'],
    su_ok: ['Agent setup saved.', 'एजेंट सेटअप सेव हो गया।'],
    su_reload: ['Reload', 'रीलोड'],
    su_ready: ['Ready: the agent can start conversations.', 'तैयार: एजेंट बातचीत शुरू कर सकता है।'],
    su_notready: ['Not ready yet. Fill in the required items marked *.', 'अभी तैयार नहीं। * वाले ज़रूरी हिस्से भरें।'],
    sec_about: ['About your business', 'आपके व्यवसाय के बारे में'],
    f_agent_name: ['Name the agent uses', 'एजेंट किस नाम से बात करे'],
    agent_name_ph: ['AI assistant of Your Company', 'Your Company का AI सहायक'],
    f_business: ['Business name', 'व्यवसाय का नाम'],
    f_about: ['What your business exports *', 'आपका व्यवसाय क्या एक्सपोर्ट करता है *'],
    f_tone: ['Tone', 'बोलने का तरीका'],
    tone_professional: ['Professional', 'पेशेवर'],
    tone_friendly: ['Friendly', 'मिलनसार'],
    tone_formal: ['Formal', 'औपचारिक'],
    sec_products: ['Products *', 'उत्पाद *'],
    add_product: ['Add product', 'उत्पाद जोड़ें'],
    no_products: ['No products yet. Add at least one.', 'अभी कोई उत्पाद नहीं। कम से कम एक जोड़ें।'],
    p_name: ['Product name *', 'उत्पाद का नाम *'],
    p_cat: ['Category', 'श्रेणी'],
    p_unit: ['Unit', 'इकाई'],
    p_moq: ['Minimum order quantity', 'न्यूनतम ऑर्डर मात्रा'],
    p_price: ['Price per unit', 'प्रति इकाई कीमत'],
    p_cur: ['Currency', 'मुद्रा'],
    p_lead: ['Lead time (days)', 'डिलीवरी समय (दिन)'],
    p_hs: ['HS code', 'HS कोड'],
    p_pack: ['Packaging', 'पैकेजिंग'],
    p_cert: ['Certifications', 'प्रमाणन'],
    p_desc: ['Description', 'विवरण'],
    remove: ['Remove', 'हटाएँ'],
    price_req: ['Price on request', 'कीमत पूछने पर'],
    unnamed: ['Unnamed product', 'बिना नाम का उत्पाद'],
    sec_terms: ['Terms for distributors', 'distributor के लिए शर्तें'],
    f_margin: ['Distributor margin (%) *', 'distributor का मार्जिन (%) *'],
    margin_hint: ['The percentage you give distributors. The agent states it.', 'जो प्रतिशत आप distributor को देते हैं। एजेंट यही बताएगा।'],
    f_maxdisc: ['Maximum extra discount the agent may offer (%) *', 'एजेंट अधिकतम कितनी अतिरिक्त छूट दे सकता है (%) *'],
    maxdisc_hint: ['Use 0 if the agent must not offer any discount. Beyond this the agent asks you.', 'अगर एजेंट को छूट नहीं देनी है तो 0 रखें। इससे आगे एजेंट आपसे पूछेगा।'],
    f_minorder: ['Minimum order value', 'न्यूनतम ऑर्डर मूल्य'],
    f_pay: ['Payment terms you accept', 'जो पेमेंट शर्तें आप मानते हैं'],
    f_ship: ['Shipping terms', 'शिपिंग शर्तें'],
    f_sample: ['Samples', 'सैंपल'],
    sample_none: ['No samples', 'सैंपल नहीं'],
    sample_free: ['Free samples', 'मुफ़्त सैंपल'],
    sample_paid: ['Paid samples', 'सशुल्क सैंपल'],
    f_sample_note: ['Sample details', 'सैंपल का विवरण'],
    f_delivery: ['Delivery and shipping notes', 'डिलीवरी और शिपिंग नोट'],
    f_regions: ['Countries or regions you want to sell to', 'जिन देशों या क्षेत्रों में बेचना है'],
    sec_talk: ['What the agent should say', 'एजेंट को क्या बताना है'],
    f_talk: ['Key points to tell the distributor', 'distributor को बताने के मुख्य बिंदु'],
    talk_ph: ['For example: 15 years of export experience, own packaging unit, ships within 10 days.', 'उदाहरण: 15 साल का एक्सपोर्ट अनुभव, अपनी पैकेजिंग यूनिट, 10 दिन में शिपमेंट।'],
    f_avoid: ['Things the agent must never say or promise', 'जो बातें एजेंट को कभी नहीं कहनी या वादा नहीं करनी'],
    avoid_ph: ['For example: Never mention other buyers. Never promise delivery dates.', 'उदाहरण: दूसरे खरीदारों का ज़िक्र न करें। डिलीवरी की तारीख का वादा न करें।'],
    sec_faq: ['Questions and answers', 'सवाल और जवाब'],
    faq_hint: ['Questions distributors often ask, with your answers.', 'distributor जो सवाल अक्सर पूछते हैं, आपके जवाबों के साथ।'],
    add_faq: ['Add question', 'सवाल जोड़ें'],
    f_q: ['Question', 'सवाल'],
    f_a: ['Answer', 'जवाब'],
    sec_esc: ['When the agent must ask you first', 'एजेंट को कब पहले आपसे पूछना है'],
    esc_hint: ['The agent never confirms orders, shares payment details or agrees contract terms by itself. Those three cannot be turned off.', 'एजेंट ऑर्डर की पुष्टि, पेमेंट विवरण या अनुबंध की शर्तें कभी खुद तय नहीं करता। ये तीनों बंद नहीं हो सकते।'],
    always_on: ['always on', 'हमेशा चालू'],
    sec_hours: ['Message timing', 'संदेश का समय'],
    f_quiet: ['Do not message the distributor at night', 'रात में distributor को संदेश न भेजें'],
    f_quiet_from: ['From (distributor local time)', 'से (distributor का स्थानीय समय)'],
    f_quiet_to: ['Until', 'तक'],
    v_required: ['Please fill in the required items marked *.', '* वाले ज़रूरी हिस्से भरें।'],
    v_number: ['Enter valid numbers (not negative).', 'सही संख्याएँ डालें (ऋणात्मक नहीं)।'],
    v_pct: ['Percentages must be between 0 and 100.', 'प्रतिशत 0 से 100 के बीच होना चाहिए।']
  };

  /* ---------------- state ---------------- */
  var api = null, root = null, wrap = null;
  var S = {
    ui: 'en', view: 'English',
    tab: 'conv', filter: 'all', q: '',
    items: [], total: 0, counts: {}, limits: null, listLoading: false, listToken: 0, searchTimer: null,
    thread: null, msgs: [], openOrig: {}, showOrigAll: false, shown: null,
    cfg: null, cfgVersion: 0, dirty: false, cfgLoaded: false,
    dists: null, newToken: 0, preview: null,
    timers: []
  };

  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  S.ui = lsGet(LS_UI) === 'hi' ? 'hi' : 'en';
  S.view = lsGet(LS_VIEW) || 'English';

  function t(k, v) {
    var e = D[k];
    var s = e ? (e[S.ui === 'hi' ? 1 : 0] || e[0]) : k;
    if (v) Object.keys(v).forEach(function (n) { s = s.split('{' + n + '}').join(v[n]); });
    return s;
  }

  /* ---------------- helpers ---------------- */
  function arr(v) { return Array.isArray(v) ? v.filter(function (x) { return x !== null && x !== undefined && x !== ''; }) : []; }
  function obj(d) { if (Array.isArray(d)) d = d[0]; return d && typeof d === 'object' ? d : {}; }
  function flag(cc) {
    if (!/^[A-Za-z]{2}$/.test(cc || '')) return '';
    var u = cc.toUpperCase();
    return String.fromCodePoint(127397 + u.charCodeAt(0), 127397 + u.charCodeAt(1));
  }
  function initials(n) {
    var p = String(n || '?').trim().split(/\s+/).slice(0, 2);
    return p.map(function (w) { return w.charAt(0).toUpperCase(); }).join('') || '?';
  }
  function when(v) {
    if (!v) return '';
    var d = new Date(v);
    if (isNaN(d.getTime())) return '';
    var tm = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === new Date().toDateString()) return tm;
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' ' + tm;
  }
  function alive() { return !!wrap && document.body.contains(wrap); }
  function toast(m, bad) { O.ui.toast(m, !!bad); }
  function rpcMissing(e) { return !!e && /could not find the function|pgrst202|42883/i.test(((e.code || '') + ' ' + (e.message || ''))); }
  function errText(e) {
    var m = String((e && e.message) || '').toLowerCase();
    var map = [['not_approved', 'e_not_approved'], ['agent_disabled', 'e_disabled'], ['setup_incomplete', 'e_setup'], ['daily_limit', 'e_daily'], ['country_not_allowed', 'e_country'], ['not_connected', 'e_not_connected'], ['already_open', 'e_open'], ['not_found', 'e_not_found'], ['version_conflict', 'e_conflict'], ['closed', 'e_closed'], ['rate_limited', 'e_rate'], ['translate_failed', 'e_translate'], ['note_too_long', 'e_note_long'], ['invalid', 'e_invalid']];
    for (var i = 0; i < map.length; i++) if (m.indexOf(map[i][0]) !== -1) return t(map[i][1]);
    if (rpcMissing(e)) return t('err_backend');
    return t('err_generic');
  }
  async function rpc(name, args) {
    var r = await api.supabase.rpc(name, args || {});
    if (r.error) throw r.error;
    return r.data;
  }
  function stopTimers() { S.timers.forEach(function (x) { clearInterval(x); }); S.timers = []; }
  function every(ms, fn) {
    S.timers.push(setInterval(function () {
      if (!alive()) { stopTimers(); return; }
      if (document.hidden) return;
      fn();
    }, ms));
  }
  function options(list, cur, ph) {
    return (ph ? '<option value="">' + esc(ph) + '</option>' : '') + list.map(function (o) {
      var v = typeof o === 'string' ? o : o.v, l = typeof o === 'string' ? o : o.l;
      return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(l) + '</option>';
    }).join('');
  }
  function statusChip(s) {
    var cls = { active: 'ok', needs_you: 'warn', queued: 'info', paused: '', closed: '', failed: 'bad' }[s] || '';
    return '<span class="exa-chip ' + cls + '">' + esc(t('st_' + s)) + '</span>';
  }

  /* ---------------- styles ---------------- */
  function styles() {
    if ($('#exa-style')) return;
    var s = document.createElement('style');
    s.id = 'exa-style';
    s.textContent =
      '.exa .top{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;justify-content:space-between;margin-bottom:14px}' +
      '.exa .top h2{font-size:1.18rem}.exa .top p{color:var(--mu);font-size:.76rem;max-width:620px;margin-top:2px}' +
      '.exa .langbar{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end}' +
      '.exa .langbar label{display:block;color:var(--mu);font-size:.68rem;font-weight:800;margin-bottom:4px}' +
      '.exa .seg{display:inline-flex;border:1px solid var(--bd);border-radius:10px;overflow:hidden}' +
      '.exa .seg button{border:0;background:transparent;color:var(--mu);padding:8px 12px;font-size:.78rem;font-weight:800}' +
      '.exa .seg button.on{background:rgba(82,232,255,.12);color:var(--cy)}' +
      'html[data-theme="light"] .exa .seg button.on{color:#0e7490;background:rgba(14,116,144,.1)}' +
      '.exa input[type=text],.exa input[type=search],.exa input[type=number],.exa input[type=time],.exa select,.exa textarea{width:100%;background:var(--surf2);color:var(--tx);border:1px solid var(--bd);border-radius:10px;padding:10px 12px;font:inherit;font-size:.82rem;min-width:0}' +
      '.exa textarea{min-height:84px;resize:vertical}' +
      '.exa input:focus-visible,.exa select:focus-visible,.exa textarea:focus-visible,.exa button:focus-visible{outline:2px solid var(--cy);outline-offset:2px}' +
      '.exa .tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}' +
      '.exa .tab{border:1px solid var(--bd);background:transparent;color:var(--mu);border-radius:10px;padding:9px 15px;font-size:.8rem;font-weight:800}' +
      '.exa .tab.active{color:var(--cy);border-color:rgba(82,232,255,.4);background:rgba(82,232,255,.08)}' +
      'html[data-theme="light"] .exa .tab.active{color:#0e7490;border-color:rgba(14,116,144,.45);background:rgba(14,116,144,.09)}' +
      '.exa .filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}' +
      '.exa .fbtn{border:1px solid var(--bd);background:transparent;color:var(--mu);border-radius:99px;padding:6px 13px;font-size:.75rem;font-weight:800}' +
      '.exa .fbtn.on{color:var(--cy);border-color:rgba(82,232,255,.4);background:rgba(82,232,255,.08)}' +
      '.exa .fbtn b{margin-left:5px;font-weight:800}' +
      '.exa .row{display:flex;gap:12px;align-items:center;background:var(--surf);border:1px solid var(--bd);border-radius:14px;padding:13px 15px;margin-bottom:10px;cursor:pointer;width:100%;text-align:left;color:var(--tx)}' +
      '.exa .row:hover{border-color:rgba(82,232,255,.35)}' +
      '.exa .av{width:42px;height:42px;border-radius:12px;background:linear-gradient(105deg,var(--gr),var(--cy));color:#031014;font-weight:800;display:grid;place-items:center;flex:none;font-size:.85rem}' +
      '.exa .rmain{min-width:0;flex:1}.exa .rname{font-weight:800;font-size:.9rem;word-break:break-word}' +
      '.exa .rsub{color:var(--mu);font-size:.74rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.exa .rside{display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex:none}.exa .rtime{color:var(--mu);font-size:.68rem}' +
      '.exa .badge{background:var(--cy);color:#031014;border-radius:99px;font-size:.68rem;font-weight:800;padding:1px 7px}' +
      '.exa-chip{display:inline-flex;align-items:center;border:1px solid var(--bd);color:var(--mu);border-radius:99px;padding:3px 9px;font-size:.68rem;font-weight:800;line-height:1.4;white-space:nowrap}' +
      '.exa-chip.ok{color:var(--gr);border-color:rgba(80,245,168,.4);background:rgba(80,245,168,.07)}' +
      '.exa-chip.info{color:var(--cy);border-color:rgba(82,232,255,.4);background:rgba(82,232,255,.07)}' +
      '.exa-chip.warn{color:#ffc857;border-color:rgba(255,200,87,.45);background:rgba(255,200,87,.08)}' +
      '.exa-chip.bad{color:var(--rd);border-color:rgba(255,130,145,.4);background:rgba(255,130,145,.07)}' +
      'html[data-theme="light"] .exa-chip.ok{color:#047857}html[data-theme="light"] .exa-chip.info{color:#0e7490}html[data-theme="light"] .exa-chip.warn{color:#b45309}' +
      '.exa .thead{background:var(--surf);border:1px solid var(--bd);border-radius:16px;padding:14px 16px;margin-bottom:12px}' +
      '.exa .thead .line{display:flex;gap:10px;align-items:center;flex-wrap:wrap}' +
      '.exa .thbar{display:flex;gap:8px;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap}' +
      '.exa .banner{border:1px solid rgba(255,200,87,.45);background:rgba(255,200,87,.08);border-radius:12px;padding:11px 13px;margin-bottom:12px;font-size:.78rem}' +
      '.exa .banner b{display:block;margin-bottom:3px}' +
      '.exa .chat{background:var(--surf2);border:1px solid var(--bd);border-radius:16px;padding:14px;max-height:520px;min-height:180px;overflow:auto;margin-bottom:12px}' +
      '.exa .msg{max-width:84%;padding:9px 12px;border-radius:14px;font-size:.82rem;margin-bottom:10px;word-break:break-word;white-space:pre-wrap}' +
      '.exa .msg small{display:block;color:var(--mu);font-size:.66rem;font-weight:700;margin-bottom:3px}' +
      '.exa .msg.in{background:rgba(82,232,255,.08);border:1px solid var(--bd)}' +
      '.exa .msg.out{margin-left:auto;background:rgba(80,245,168,.11);border:1px solid rgba(80,245,168,.28)}' +
      '.exa .msg.note{margin-left:auto;background:rgba(255,200,87,.09);border:1px dashed rgba(255,200,87,.5)}' +
      '.exa .msg.sys{margin:0 auto 10px;max-width:92%;text-align:center;color:var(--mu);font-size:.74rem;background:transparent;border:1px solid var(--bd)}' +
      '.exa .msg .meta{display:flex;gap:10px;justify-content:space-between;margin-top:5px;color:var(--mu);font-size:.64rem}' +
      '.exa .msg .orig{margin-top:7px;padding-top:7px;border-top:1px dashed var(--bd);color:var(--mu);font-size:.76rem}' +
      '.exa .msg .orig b{display:block;font-size:.64rem;margin-bottom:2px}' +
      '.exa .linkbtn{border:0;background:transparent;color:var(--cy);font-size:.66rem;font-weight:800;padding:0}' +
      'html[data-theme="light"] .exa .linkbtn{color:#0e7490}' +
      '.exa .ctl{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}' +
      '.exa .comp{background:var(--surf);border:1px solid var(--bd);border-radius:16px;padding:14px}' +
      '.exa .comp label,.exa .f>label{display:block;color:var(--mu);font-size:.72rem;font-weight:800;margin-bottom:5px}' +
      '.exa .comp .actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}' +
      '.exa .pv{margin-top:10px;padding:10px 12px;border-radius:10px;border:1px solid var(--bd);background:var(--surf2);font-size:.8rem;white-space:pre-wrap;word-break:break-word}' +
      '.exa .pv b{display:block;color:var(--mu);font-size:.68rem;margin-bottom:4px}' +
      '.exa .note{border:1px solid var(--bd);border-radius:12px;padding:11px 13px;color:var(--mu);font-size:.76rem;margin-bottom:12px}' +
      '.exa .note.bad{color:var(--rd);border-color:rgba(255,130,145,.4)}' +
      '.exa .grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}' +
      '.exa .f{margin-bottom:12px;min-width:0}.exa .f small{display:block;color:var(--mu);font-size:.68rem;margin-top:4px}' +
      '.exa .f.full{grid-column:1/-1}' +
      '.exa .pills{display:flex;flex-wrap:wrap;gap:7px}' +
      '.exa .pill{position:relative;cursor:pointer}.exa .pill input{position:absolute;opacity:0;inset:0;width:100%;height:100%;margin:0;cursor:pointer}' +
      '.exa .pill span{display:inline-block;padding:7px 12px;border-radius:99px;border:1px solid var(--bd);color:var(--mu);font-size:.76rem;font-weight:600}' +
      '.exa .pill input:checked+span{background:rgba(82,232,255,.12);border-color:rgba(82,232,255,.55);color:var(--tx)}' +
      '.exa .pill input:disabled+span{opacity:.85}' +
      '.exa .pill input:focus-visible+span{outline:2px solid var(--cy);outline-offset:2px}' +
      '.exa .sec{margin-bottom:15px}.exa .sec>h3{font-size:1rem;margin-bottom:4px}.exa .sec>.hint{color:var(--mu);font-size:.74rem;margin-bottom:12px}' +
      '.exa .item{border:1px solid var(--bd);border-radius:14px;padding:13px;margin-bottom:10px;background:var(--surf2)}' +
      '.exa .item .ih{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:10px}.exa .item .ih b{font-size:.84rem;word-break:break-word}' +
      '.exa .savebar{position:sticky;bottom:10px;z-index:5;display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;background:var(--surf);border:1px solid var(--bd);border-radius:14px;padding:11px 14px;box-shadow:0 10px 30px rgba(0,0,0,.35)}' +
      '.exa .savebar span{font-size:.76rem;color:var(--mu)}.exa .savebar span.dirty{color:#ffc857}' +
      '.exa .chk{display:flex;gap:9px;align-items:center;margin:0 0 10px;color:var(--tx);font-size:.8rem;font-weight:600}.exa .chk input{width:17px;height:17px;margin:0;accent-color:#50f5a8}' +
      '@media(max-width:700px){.exa .grid2{grid-template-columns:1fr}.exa .msg{max-width:92%}}';
    document.head.appendChild(s);
  }

  /* ---------------- access ---------------- */
  async function isApproved() {
    try {
      var res = await api.supabase.rpc('export_network_my_access');
      if (res.error) return false;
      var d = res.data;
      if (Array.isArray(d)) d = d[0];
      if (d === true) return true;
      return !!(d && typeof d === 'object' && d.approved === true);
    } catch (e) { return false; }
  }
  function lockedView() {
    return '<div class="exa"><div class="top"><div><h2>' + esc(t('title')) + '</h2></div></div>' +
      '<div class="card" style="text-align:center;padding:38px 20px"><div style="font-size:2.4rem;line-height:1" aria-hidden="true">\uD83D\uDD12</div>' +
      '<h2 style="font-size:1.1rem;margin:12px 0 6px">' + esc(t('locked_t')) + '</h2>' +
      '<p style="color:var(--mu);font-size:.82rem;max-width:460px;margin:0 auto">' + esc(t('locked_d')) + '</p></div></div>';
  }

  /* ---------------- shell ---------------- */
  function drawShell() {
    wrap.innerHTML =
      '<div class="top"><div><h2>' + esc(t('title')) + '</h2><p>' + esc(t('sub')) + '</p></div>' +
      '<div class="langbar"><div><label>' + esc(t('ui_lang')) + '</label><div class="seg"><button type="button" data-ex="ui" data-v="en" class="' + (S.ui === 'en' ? 'on' : '') + '">English</button><button type="button" data-ex="ui" data-v="hi" class="' + (S.ui === 'hi' ? 'on' : '') + '">\u0939\u093f\u0928\u094d\u0926\u0940</button></div></div>' +
      '<div style="min-width:170px"><label for="exaView">' + esc(t('view_lang')) + '</label><select id="exaView">' + options(LANGS, S.view) + '</select></div></div></div>' +
      '<div class="tabs" role="tablist">' + ['conv', 'new', 'setup'].map(function (k) {
        return '<button type="button" class="tab' + (S.tab === k ? ' active' : '') + '" role="tab" data-ex="tab" data-v="' + k + '" aria-selected="' + (S.tab === k) + '">' + esc(t('tab_' + k)) + '</button>';
      }).join('') + '</div><div id="exaBody"></div>';
  }
  function body() { return $('#exaBody', wrap); }
  function show(tab) {
    stopTimers();
    S.tab = tab;
    $$('.tab', wrap).forEach(function (b) { var on = b.getAttribute('data-v') === tab; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
    if (tab === 'conv') showConv();
    else if (tab === 'new') showNew();
    else showSetup();
  }

  /* =========================================================
     CONVERSATIONS
  ========================================================= */
  function showConv() {
    S.thread = null;
    body().innerHTML =
      '<div class="filters" id="exaFilters"></div>' +
      '<div style="margin-bottom:12px"><input type="search" id="exaSearch" maxlength="80" placeholder="' + esc(t('search_ph')) + '" aria-label="' + esc(t('search_ph')) + '" value="' + esc(S.q) + '"></div>' +
      '<div id="exaList"></div>';
    drawFilters();
    loadList(false);
    every(POLL_LIST, function () { if (!S.thread) loadList(false, true); });
  }
  function drawFilters() {
    var el = $('#exaFilters', wrap); if (!el) return;
    var c = S.counts || {};
    el.innerHTML = [['all', 'f_all'], ['needs_you', 'f_needs'], ['active', 'f_active'], ['paused', 'f_paused'], ['closed', 'f_closed']].map(function (p) {
      return '<button type="button" class="fbtn' + (S.filter === p[0] ? ' on' : '') + '" data-ex="filter" data-v="' + p[0] + '">' + esc(t(p[1])) + '<b>' + (typeof c[p[0]] === 'number' ? c[p[0]] : '') + '</b></button>';
    }).join('') + '<button type="button" class="fbtn" data-ex="list-refresh">' + esc(t('refresh')) + '</button>';
  }
  async function loadList(append, silent) {
    var box = $('#exaList', wrap); if (!box) return;
    var my = ++S.listToken;
    if (!append && !silent) box.innerHTML = '<div class="loading">' + esc(t('loading')) + '</div>';
    var d;
    try {
      d = obj(await rpc('export_agent_conversations', { p_status: S.filter === 'all' ? '' : S.filter, p_search: S.q.trim(), p_limit: PAGE, p_offset: append ? S.items.length : 0, p_view_language: S.view }));
    } catch (e) {
      if (my !== S.listToken || !alive()) return;
      if (!silent) box.innerHTML = '<div class="error">' + esc(errText(e)) + ' <button class="btn" data-ex="list-refresh" style="margin-left:8px">' + esc(t('retry')) + '</button></div>';
      return;
    }
    if (my !== S.listToken || S.tab !== 'conv' || S.thread) return;
    var got = arr(d.items);
    S.items = append ? S.items.concat(got) : got;
    S.total = typeof d.total === 'number' ? d.total : S.items.length;
    S.counts = d.counts || {};
    S.limits = d.limits || S.limits;
    drawFilters();
    drawList();
  }
  function drawList() {
    var box = $('#exaList', wrap); if (!box) return;
    if (!S.items.length) {
      var filtered = S.filter !== 'all' || S.q.trim();
      box.innerHTML = '<div class="empty">' + esc(t(filtered ? 'empty_filter' : 'empty_conv')) + '</div>';
      return;
    }
    box.innerHTML = S.items.map(function (it) {
      return '<button type="button" class="row" data-ex="open" data-id="' + esc(it.id) + '">' +
        '<span class="av" aria-hidden="true">' + esc(initials(it.company_name)) + '</span>' +
        '<span class="rmain"><span class="rname">' + esc(it.company_name) + '</span>' +
        '<span class="rsub" style="display:block">' + esc((flag(it.country_code) ? flag(it.country_code) + ' ' : '') + [it.city, it.country].filter(Boolean).join(', ')) + '</span>' +
        '<span class="rsub" style="display:block;margin-top:2px">' + esc(it.last_message_preview || '') + '</span></span>' +
        '<span class="rside"><span class="rtime">' + esc(when(it.last_message_at)) + '</span>' + statusChip(it.status) +
        (it.unread > 0 ? '<span class="badge">' + esc(it.unread) + '</span>' : '') + '</span></button>';
    }).join('') + (S.items.length < S.total ? '<div style="text-align:center;margin:14px 0"><button class="btn" data-ex="more">' + esc(t('show_more')) + '</button></div>' : '');
  }

  /* ---------------- thread ---------------- */
  function openThread(id) {
    var it = S.items.filter(function (x) { return String(x.id) === String(id); })[0] || { id: id };
    stopTimers();
    S.thread = it; S.msgs = []; S.shown = null; S.openOrig = {};
    body().innerHTML =
      '<div class="thbar"><button class="btn" data-ex="th-back">\u2190 ' + esc(t('back')) + '</button><button class="btn" data-ex="th-refresh">' + esc(t('refresh')) + '</button></div>' +
      '<div id="exaThHead"></div>' +
      '<label class="chk"><input type="checkbox" id="exaOrigAll"' + (S.showOrigAll ? ' checked' : '') + '> ' + esc(t('orig_all')) + '</label>' +
      '<div class="chat" id="exaThChat" aria-live="polite"><div class="loading">' + esc(t('loading')) + '</div></div>' +
      '<div id="exaThBtns"></div><div id="exaThComposer"></div>';
    paintHead();
    loadThread(id, false);
    every(POLL_THREAD, function () { if (S.thread && S.thread.id === id) loadThread(id, true); });
  }
  async function loadThread(id, silent) {
    var d;
    try { d = obj(await rpc('export_agent_messages', { p_conversation_id: id, p_view_language: S.view, p_after: null })); }
    catch (e) {
      if (!silent && alive()) { var c = $('#exaThChat', wrap); if (c) c.innerHTML = '<div class="error">' + esc(errText(e)) + '</div>'; }
      return;
    }
    if (!alive() || !S.thread || S.thread.id !== id) return;
    S.thread = Object.assign({}, S.thread, d.conversation || {});
    S.msgs = arr(d.messages);
    paintHead(); paintChat();
    var key = S.thread.status + '|' + S.thread.mode;
    if (S.shown !== key) { S.shown = key; paintControls(); }
  }
  function paintHead() {
    var th = S.thread, el = $('#exaThHead', wrap); if (!el || !th) return;
    var needs = th.needs_you || th.status === 'needs_you';
    el.innerHTML = '<div class="thead"><div class="line"><span class="av" aria-hidden="true">' + esc(initials(th.company_name)) + '</span>' +
      '<div style="min-width:0;flex:1"><div class="rname">' + esc(th.company_name || '') + '</div><div class="rsub">' +
      esc((flag(th.country_code) ? flag(th.country_code) + ' ' : '') + [th.city, th.country].filter(Boolean).join(', ')) + '</div></div>' +
      statusChip(th.status || 'active') + '</div><div class="line" style="margin-top:10px">' +
      (th.language ? '<span class="exa-chip info">' + esc(t('talking_in', { lang: th.language })) + '</span>' : '') +
      (th.mode ? '<span class="exa-chip ' + (th.mode === 'manual' ? 'warn' : 'ok') + '">' + esc(t('mode_' + th.mode)) + '</span>' : '') + '</div></div>' +
      (needs && th.status !== 'closed' ? '<div class="banner"><b>' + esc(t('needs_banner')) + (th.needs_you_kind && D['esc_' + th.needs_you_kind] ? ': ' + esc(t('esc_' + th.needs_you_kind)) : '') + '</b>' +
        (th.needs_you_reason ? '<div>' + esc(th.needs_you_reason) + '</div>' : '') + '<div style="color:var(--mu);margin-top:4px">' + esc(t('needs_help')) + '</div></div>' : '');
  }
  function paintChat() {
    var el = $('#exaThChat', wrap); if (!el) return;
    var near = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
    if (!S.msgs.length) { el.innerHTML = '<div class="loading">' + esc(t('no_messages')) + '</div>'; return; }
    el.innerHTML = S.msgs.map(function (m) {
      var sender = m.sender || 'system';
      var cls = sender === 'distributor' ? 'in' : sender === 'system' || m.kind === 'notice' ? 'sys' : m.kind === 'instruction' ? 'note' : 'out';
      var who = m.kind === 'instruction' ? t('note_label') : t('who_' + (sender === 'agent' || sender === 'distributor' || sender === 'client' ? sender : 'system'));
      var hasOrig = m.original_text && m.original_text !== m.text;
      var openO = S.showOrigAll || S.openOrig[m.id];
      var delivery = (cls === 'out' && m.kind !== 'instruction' && m.delivery && D['d_' + m.delivery]) ? '<span>' + esc(t('d_' + m.delivery)) + '</span>' : '<span></span>';
      return '<div class="msg ' + cls + '">' + (cls === 'sys' ? '' : '<small>' + esc(who) + '</small>') + esc(m.text || '') +
        (hasOrig && openO ? '<div class="orig"><b>' + esc(t('orig_in', { lang: m.original_language || '' })) + '</b>' + esc(m.original_text) + '</div>' : '') +
        '<div class="meta">' + delivery + '<span>' + (hasOrig && !S.showOrigAll ? '<button type="button" class="linkbtn" data-ex="orig" data-id="' + esc(m.id) + '">' + esc(t(openO ? 'hide_orig' : 'show_orig')) + '</button> \u00b7 ' : '') + esc(when(m.created_at)) + '</span></div></div>';
    }).join('');
    if (near || !S.shown) el.scrollTop = el.scrollHeight;
  }
  function btn(act, key, cls) { return '<button type="button" class="btn' + (cls ? ' ' + cls : '') + '" data-ex="ctl" data-v="' + act + '">' + esc(t(key)) + '</button>'; }
  function paintControls() {
    var th = S.thread, b = $('#exaThBtns', wrap), c = $('#exaThComposer', wrap); if (!b || !c || !th) return;
    if (th.status === 'closed' || th.status === 'failed') {
      b.innerHTML = '';
      c.innerHTML = '<div class="note' + (th.status === 'failed' ? ' bad' : '') + '">' + esc(t(th.status === 'failed' ? 'failed_note' : 'read_only')) + '</div>';
      return;
    }
    var h = '';
    if (th.mode === 'manual') h += btn('handback', 'btn_handback', 'primary');
    else { h += th.status === 'paused' ? btn('resume', 'btn_resume', 'primary') : btn('pause', 'btn_pause'); h += btn('takeover', 'btn_takeover'); }
    h += btn('close', 'btn_close', 'danger');
    b.innerHTML = '<div class="ctl">' + h + '</div>';
    if (th.mode === 'manual') {
      c.innerHTML = '<div class="comp"><label for="exaReply">' + esc(t('reply_lbl')) + '</label>' +
        '<textarea id="exaReply" maxlength="' + MAX.reply + '" placeholder="' + esc(t('reply_ph')) + '"></textarea>' +
        '<div style="margin-top:10px;max-width:260px"><label for="exaReplyLang">' + esc(t('reply_from')) + '</label><select id="exaReplyLang">' + options(LANGS, S.view) + '</select></div>' +
        '<div id="exaPv"></div><div class="actions"><button class="btn" data-ex="reply-preview">' + esc(t('btn_preview')) + '</button><button class="btn primary" data-ex="reply-send">' + esc(t('btn_send')) + '</button></div></div>';
    } else {
      c.innerHTML = '<div class="comp"><label for="exaInstr">' + esc(t('note_label')) + '</label>' +
        '<textarea id="exaInstr" maxlength="' + MAX.instr + '" placeholder="' + esc(t('instr_ph')) + '"></textarea>' +
        '<div class="actions"><button class="btn primary" data-ex="instr-send">' + esc(t('instr_send')) + '</button></div></div>';
    }
  }
  async function control(action) {
    var th = S.thread; if (!th) return;
    if (action === 'close' && !(await O.ui.confirm(t('confirm_close')))) return;
    if (action === 'takeover' && !(await O.ui.confirm(t('confirm_takeover')))) return;
    try {
      await rpc('export_agent_conversation_control', { p_conversation_id: th.id, p_action: action });
      toast(t('ctl_ok'));
      S.shown = null;
      await loadThread(th.id, false);
    } catch (e) { toast(errText(e), true); }
  }
  async function sendInstr(b) {
    var th = S.thread, ta = $('#exaInstr', wrap); if (!th || !ta) return;
    var note = ta.value.trim();
    if (!note) { ta.focus(); return; }
    b.disabled = true;
    try { await rpc('export_agent_instruct', { p_conversation_id: th.id, p_note: note.slice(0, MAX.instr) }); ta.value = ''; toast(t('instr_ok')); await loadThread(th.id, false); }
    catch (e) { toast(errText(e), true); }
    b.disabled = false;
  }
  async function previewReply(b) {
    var th = S.thread, ta = $('#exaReply', wrap), pv = $('#exaPv', wrap); if (!th || !ta || !pv) return;
    var text = ta.value.trim();
    if (!text) { ta.focus(); return; }
    b.disabled = true;
    try {
      var d = obj(await rpc('export_agent_translate', { p_text: text, p_from: $('#exaReplyLang', wrap).value, p_to: th.language || 'English' }));
      pv.innerHTML = '<div class="pv"><b>' + esc(t('will_send', { lang: th.language || '' })) + '</b>' + esc(d.text || '') + '</div>';
    } catch (e) { toast(errText(e), true); }
    b.disabled = false;
  }
  async function sendReply(b) {
    var th = S.thread, ta = $('#exaReply', wrap); if (!th || !ta) return;
    var text = ta.value.trim();
    if (!text) { ta.focus(); return; }
    b.disabled = true;
    try {
      await rpc('export_agent_reply', { p_conversation_id: th.id, p_text: text.slice(0, MAX.reply), p_text_language: $('#exaReplyLang', wrap).value });
      ta.value = ''; var pv = $('#exaPv', wrap); if (pv) pv.innerHTML = '';
      toast(t('sent_ok')); await loadThread(th.id, false);
    } catch (e) { toast(errText(e), true); }
    b.disabled = false;
  }

  /* =========================================================
     NEW CONVERSATION
  ========================================================= */
  function complete(c) {
    if (!c) return false;
    var tm = c.terms || {};
    return String(c.about || '').trim().length >= 20 && arr(c.products).some(function (p) { return String(p.name || '').trim(); }) &&
      typeof tm.distributor_margin_percent === 'number' && typeof tm.max_discount_percent === 'number';
  }
  async function ensureConfig() {
    if (S.cfgLoaded) return;
    var d = obj(await rpc('export_agent_config_get'));
    S.cfg = normCfg(d.config); S.cfgVersion = d.version || 0; S.cfgLoaded = true; S.dirty = false;
    if (!lsGet(LS_VIEW) && d.config && d.config.view_language) { S.view = d.config.view_language; }
  }
  async function showNew() {
    var my = ++S.newToken;
    body().innerHTML = '<div class="loading">' + esc(t('loading')) + '</div>';
    var d;
    try { await ensureConfig(); d = obj(await rpc('export_agent_distributors')); }
    catch (e) { if (my === S.newToken && alive()) body().innerHTML = '<div class="error">' + esc(errText(e)) + ' <button class="btn" data-ex="tab" data-v="new" style="margin-left:8px">' + esc(t('retry')) + '</button></div>'; return; }
    if (my !== S.newToken || S.tab !== 'new' || !alive()) return;
    S.dists = arr(d.items); S.limits = d.limits || S.limits; S.preview = null;
    if (!complete(S.cfg)) {
      body().innerHTML = '<div class="card"><p style="margin-bottom:12px">' + esc(t('setup_first')) + '</p><button class="btn primary" data-ex="tab" data-v="setup">' + esc(t('go_setup')) + '</button></div>';
      return;
    }
    if (!S.dists.length) { body().innerHTML = '<div class="empty">' + esc(t('no_connected')) + '</div>'; return; }
    var prods = arr(S.cfg.products).filter(function (p) { return String(p.name || '').trim(); });
    var lim = S.limits && S.limits.daily_new ? '<div class="note">' + esc(t('limit_note', { used: S.limits.used_today || 0, max: S.limits.daily_new })) + '</div>' : '';
    body().innerHTML = '<div class="card"><h3 style="margin-bottom:12px">' + esc(t('new_title')) + '</h3>' + lim +
      '<div class="grid2"><div class="f"><label for="exaNDist">' + esc(t('f_dist')) + ' *</label><select id="exaNDist">' +
      '<option value="">' + esc(t('select_one')) + '</option>' + S.dists.map(function (x) {
        return '<option value="' + esc(x.id) + '"' + (x.open_conversation_id ? ' disabled' : '') + '>' + esc((flag(x.country_code) ? flag(x.country_code) + ' ' : '') + x.company_name + ' \u2014 ' + [x.city, x.country].filter(Boolean).join(', ') + (x.open_conversation_id ? ' (' + t('has_open') + ')' : '')) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="f"><label for="exaNLang">' + esc(t('f_conv_lang')) + '</label><select id="exaNLang"></select></div>' +
      '<div class="f full"><label>' + esc(t('f_products')) + '</label><div class="pills">' + prods.map(function (p) {
        return '<label class="pill"><input type="checkbox" name="exaNProd" value="' + esc(p.id) + '"><span>' + esc(p.name) + '</span></label>';
      }).join('') + '</div></div>' +
      '<div class="f full"><label for="exaNGoal">' + esc(t('f_goal')) + '</label><textarea id="exaNGoal" maxlength="' + MAX.goal + '" placeholder="' + esc(t('goal_ph')) + '"></textarea></div></div>' +
      '<div class="note">' + esc(t('open_note')) + '</div><div id="exaNPv"></div>' +
      '<div class="actions" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-ex="new-preview">' + esc(t('btn_preview_open')) + '</button>' +
      '<button class="btn primary" data-ex="new-start" id="exaNStart" disabled>' + esc(t('btn_start')) + '</button></div></div>';
    fillNewLang();
  }
  function fillNewLang() {
    var sel = $('#exaNDist', wrap), l = $('#exaNLang', wrap); if (!sel || !l) return;
    var d = S.dists.filter(function (x) { return String(x.id) === sel.value; })[0];
    var langs = d ? (arr(d.languages).length ? arr(d.languages) : [d.primary_language || 'English']) : [];
    l.innerHTML = options(langs, d ? (d.primary_language || langs[0]) : '', d ? '' : t('select_one'));
  }
  function readNew() {
    return {
      p_distributor_id: ($('#exaNDist', wrap) || {}).value || '',
      p_product_ids: $$('input[name="exaNProd"]:checked', wrap).map(function (i) { return i.value; }),
      p_goal: String(($('#exaNGoal', wrap) || {}).value || '').trim().slice(0, MAX.goal),
      p_language: ($('#exaNLang', wrap) || {}).value || ''
    };
  }
  function newValid(a) { return a.p_distributor_id && a.p_product_ids.length && a.p_goal.length >= 10 && a.p_language; }
  async function previewNew(b) {
    var a = readNew();
    if (!newValid(a)) { toast(t('v_new'), true); return; }
    b.disabled = true;
    try {
      var d = obj(await rpc('export_agent_conversation_preview', Object.assign({}, a, { p_view_language: S.view })));
      $('#exaNPv', wrap).innerHTML = '<div class="pv"><b>' + esc(t('pv_orig', { lang: d.language || a.p_language })) + '</b>' + esc(d.text || '') + '</div>' +
        '<div class="pv"><b>' + esc(t('pv_view', { lang: S.view })) + '</b>' + esc(d.text_view || '') + '</div>';
      S.preview = JSON.stringify(a);
      $('#exaNStart', wrap).disabled = false;
    } catch (e) { toast(errText(e), true); }
    b.disabled = false;
  }
  async function startNew(b) {
    var a = readNew();
    if (!newValid(a) || S.preview !== JSON.stringify(a)) { toast(t('v_new'), true); b.disabled = true; return; }
    b.disabled = true;
    try {
      var d = obj(await rpc('export_agent_conversation_start', a));
      toast(t('started_ok'));
      S.tab = 'conv'; drawShell();
      stopTimers(); S.items = []; S.filter = 'all'; S.q = '';
      body().innerHTML = '<div id="exaList"></div>';
      openThread(d.id);
    } catch (e) { toast(errText(e), true); b.disabled = false; }
  }

  /* =========================================================
     AGENT SETUP
  ========================================================= */
  function uid() { return 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function newCfg() {
    return { schema: 1, agent_name: '', business_name: '', about: '', tone: 'professional', view_language: S.view, products: [],
      terms: { distributor_margin_percent: null, max_discount_percent: null, min_order_value: null, min_order_currency: 'USD', payment_terms: [], shipping_terms: [], sample_policy: 'none', sample_note: '', delivery_note: '', regions: '' },
      talking_points: '', avoid: '', faq: [], escalate: ESC_KINDS.slice(), quiet_hours: { enabled: true, start: '21:00', end: '08:00' } };
  }
  function normCfg(c) {
    var d = newCfg();
    if (!c || typeof c !== 'object') return d;
    ['agent_name', 'business_name', 'about', 'tone', 'view_language', 'talking_points', 'avoid'].forEach(function (k) { if (typeof c[k] === 'string') d[k] = c[k]; });
    d.terms = Object.assign(d.terms, c.terms || {});
    d.terms.payment_terms = arr(d.terms.payment_terms); d.terms.shipping_terms = arr(d.terms.shipping_terms);
    d.quiet_hours = Object.assign(d.quiet_hours, c.quiet_hours || {});
    d.products = arr(c.products).map(function (p) { return Object.assign({ id: uid(), name: '', category: '', unit: 'kg', min_order_qty: null, price: null, currency: 'USD', lead_time_days: null, hs_code: '', packaging: '', certifications: '', description: '' }, p); });
    d.faq = arr(c.faq).map(function (f) { return { q: String(f.q || ''), a: String(f.a || '') }; });
    d.escalate = arr(c.escalate).filter(function (k) { return ESC_KINDS.indexOf(k) !== -1; });
    ESC_LOCKED.forEach(function (k) { if (d.escalate.indexOf(k) === -1) d.escalate.push(k); });
    return d;
  }
  function getP(o, p) { return p.split('.').reduce(function (a, k) { return a == null ? a : a[k]; }, o); }
  function setP(o, p, v) { var ks = p.split('.'), last = ks.pop(); ks.reduce(function (a, k) { return a[k]; }, o)[last] = v; }
  function numVal(v) { if (v === '' || v === null || v === undefined) return null; var n = Number(v); return isFinite(n) ? n : null; }

  function fk(label, path, opt) {
    opt = opt || {};
    var v = getP(S.cfg, path);
    var tag = opt.area ? '<textarea data-k="' + path + '" maxlength="' + (opt.max || MAX.short) + '" placeholder="' + esc(opt.ph || '') + '">' + esc(v == null ? '' : v) + '</textarea>'
      : '<input type="' + (opt.num ? 'number' : 'text') + '" data-k="' + path + '"' + (opt.num ? ' data-n="1" min="0" step="any" inputmode="decimal"' : ' maxlength="' + (opt.max || MAX.short) + '"') + ' value="' + esc(v == null ? '' : v) + '" placeholder="' + esc(opt.ph || '') + '">';
    return '<div class="f ' + (opt.full ? 'full' : '') + '"><label>' + esc(label) + '</label>' + tag + (opt.hint ? '<small>' + esc(opt.hint) + '</small>' : '') + '</div>';
  }
  function pills(path, list, locked) {
    var cur = arr(getP(S.cfg, path));
    return '<div class="pills">' + list.map(function (v) {
      var isLocked = locked && locked.indexOf(v) !== -1;
      var label = path === 'escalate' ? t('esc_' + v) : v;
      return '<label class="pill"><input type="checkbox" data-arr="' + path + '" value="' + esc(v) + '"' + (cur.indexOf(v) !== -1 || isLocked ? ' checked' : '') + (isLocked ? ' disabled' : '') + '><span>' + esc(label) + (isLocked ? ' \u00b7 ' + esc(t('always_on')) : '') + '</span></label>';
    }).join('') + '</div>';
  }
  function productHtml(p, i) {
    function f(key, label, o) {
      o = o || {};
      var v = p[key];
      var el = o.sel ? '<select data-pi="' + i + '" data-pk="' + key + '">' + options(o.sel, v) + '</select>'
        : o.area ? '<textarea data-pi="' + i + '" data-pk="' + key + '" maxlength="' + MAX.desc + '">' + esc(v || '') + '</textarea>'
        : '<input type="' + (o.num ? 'number' : 'text') + '" data-pi="' + i + '" data-pk="' + key + '"' + (o.num ? ' data-pn="1" min="0" step="any" inputmode="decimal"' : ' maxlength="' + MAX.short + '"') + ' value="' + esc(v == null ? '' : v) + '">';
      return '<div class="f ' + (o.full ? 'full' : '') + '"><label>' + esc(label) + '</label>' + el + '</div>';
    }
    return '<div class="item"><div class="ih"><b>' + esc(p.name || t('unnamed')) + '</b><button class="btn danger" data-ex="p-del" data-i="' + i + '">' + esc(t('remove')) + '</button></div><div class="grid2">' +
      f('name', t('p_name')) + f('category', t('p_cat')) + f('unit', t('p_unit'), { sel: UNITS }) + f('min_order_qty', t('p_moq'), { num: 1 }) +
      f('price', t('p_price') + ' (' + t('price_req') + ')', { num: 1 }) + f('currency', t('p_cur'), { sel: CURRENCIES }) + f('lead_time_days', t('p_lead'), { num: 1 }) + f('hs_code', t('p_hs')) +
      f('packaging', t('p_pack')) + f('certifications', t('p_cert')) + f('description', t('p_desc'), { area: 1, full: 1 }) + '</div></div>';
  }
  function showSetup() {
    var bd = body();
    bd.innerHTML = '<div class="loading">' + esc(t('loading')) + '</div>';
    ensureConfig().then(function () { if (S.tab === 'setup' && alive()) drawSetup(); }).catch(function (e) {
      if (S.tab === 'setup' && alive()) bd.innerHTML = '<div class="error">' + esc(errText(e)) + ' <button class="btn" data-ex="tab" data-v="setup" style="margin-left:8px">' + esc(t('retry')) + '</button></div>';
    });
  }
  function drawSetup() {
    var c = S.cfg, tm = c.terms;
    body().innerHTML = '<div class="note">' + esc(t('su_sub')) + '</div><div id="exaReady"></div>' +
      '<div class="card sec"><h3>' + esc(t('sec_about')) + '</h3><div class="grid2">' +
      fk(t('f_agent_name'), 'agent_name', { ph: t('agent_name_ph') }) + fk(t('f_business'), 'business_name') +
      fk(t('f_about'), 'about', { area: 1, max: MAX.about, full: 1 }) +
      '<div class="f"><label>' + esc(t('f_tone')) + '</label><select data-k="tone">' + options([{ v: 'professional', l: t('tone_professional') }, { v: 'friendly', l: t('tone_friendly') }, { v: 'formal', l: t('tone_formal') }], c.tone) + '</select></div></div></div>' +
      '<div class="card sec"><h3>' + esc(t('sec_products')) + '</h3><div id="exaProds">' + (c.products.length ? c.products.map(productHtml).join('') : '<div class="empty">' + esc(t('no_products')) + '</div>') + '</div>' +
      (c.products.length < MAX.products ? '<button class="btn" data-ex="p-add" style="margin-top:10px">+ ' + esc(t('add_product')) + '</button>' : '') + '</div>' +
      '<div class="card sec"><h3>' + esc(t('sec_terms')) + '</h3><div class="grid2">' +
      fk(t('f_margin'), 'terms.distributor_margin_percent', { num: 1, hint: t('margin_hint') }) + fk(t('f_maxdisc'), 'terms.max_discount_percent', { num: 1, hint: t('maxdisc_hint') }) +
      fk(t('f_minorder'), 'terms.min_order_value', { num: 1 }) + '<div class="f"><label>' + esc(t('p_cur')) + '</label><select data-k="terms.min_order_currency">' + options(CURRENCIES, tm.min_order_currency) + '</select></div>' +
      '<div class="f full"><label>' + esc(t('f_pay')) + '</label>' + pills('terms.payment_terms', PAY) + '</div>' +
      '<div class="f full"><label>' + esc(t('f_ship')) + '</label>' + pills('terms.shipping_terms', SHIP) + '</div>' +
      '<div class="f"><label>' + esc(t('f_sample')) + '</label><select data-k="terms.sample_policy">' + options([{ v: 'none', l: t('sample_none') }, { v: 'free', l: t('sample_free') }, { v: 'paid', l: t('sample_paid') }], tm.sample_policy) + '</select></div>' +
      fk(t('f_sample_note'), 'terms.sample_note') + fk(t('f_delivery'), 'terms.delivery_note', { area: 1, max: MAX.desc, full: 1 }) + fk(t('f_regions'), 'terms.regions', { full: 1 }) + '</div></div>' +
      '<div class="card sec"><h3>' + esc(t('sec_talk')) + '</h3><div class="grid2">' +
      fk(t('f_talk'), 'talking_points', { area: 1, max: MAX.talk, ph: t('talk_ph'), full: 1 }) + fk(t('f_avoid'), 'avoid', { area: 1, max: MAX.avoid, ph: t('avoid_ph'), full: 1 }) + '</div></div>' +
      '<div class="card sec"><h3>' + esc(t('sec_faq')) + '</h3><div class="hint">' + esc(t('faq_hint')) + '</div><div id="exaFaq">' + c.faq.map(function (f, i) {
        return '<div class="item"><div class="ih"><b>' + esc(f.q || t('f_q')) + '</b><button class="btn danger" data-ex="f-del" data-i="' + i + '">' + esc(t('remove')) + '</button></div><div class="f"><label>' + esc(t('f_q')) + '</label><input type="text" data-fi="' + i + '" data-fk="q" maxlength="' + MAX.short + '" value="' + esc(f.q) + '"></div><div class="f"><label>' + esc(t('f_a')) + '</label><textarea data-fi="' + i + '" data-fk="a" maxlength="' + MAX.desc + '">' + esc(f.a) + '</textarea></div></div>';
      }).join('') + '</div>' + (c.faq.length < MAX.faq ? '<button class="btn" data-ex="f-add">+ ' + esc(t('add_faq')) + '</button>' : '') + '</div>' +
      '<div class="card sec"><h3>' + esc(t('sec_esc')) + '</h3><div class="hint">' + esc(t('esc_hint')) + '</div>' + pills('escalate', ESC_KINDS, ESC_LOCKED) + '</div>' +
      '<div class="card sec"><h3>' + esc(t('sec_hours')) + '</h3><label class="chk"><input type="checkbox" id="exaQuiet"' + (c.quiet_hours.enabled ? ' checked' : '') + '> ' + esc(t('f_quiet')) + '</label><div class="grid2">' +
      '<div class="f"><label>' + esc(t('f_quiet_from')) + '</label><input type="time" data-k="quiet_hours.start" value="' + esc(c.quiet_hours.start) + '"></div><div class="f"><label>' + esc(t('f_quiet_to')) + '</label><input type="time" data-k="quiet_hours.end" value="' + esc(c.quiet_hours.end) + '"></div></div></div>' +
      '<div class="savebar"><span id="exaDirty"></span><button class="btn primary" id="exaSave" data-ex="su-save">' + esc(t('su_save')) + '</button></div>';
    updateBar();
  }
  function updateBar() {
    var d = $('#exaDirty', wrap), b = $('#exaSave', wrap), r = $('#exaReady', wrap);
    if (d) { d.textContent = t(S.dirty ? 'su_unsaved' : 'su_saved'); d.className = S.dirty ? 'dirty' : ''; }
    if (b) b.disabled = !S.dirty;
    if (r) r.innerHTML = '<div class="note' + (complete(S.cfg) ? '' : ' bad') + '">' + esc(t(complete(S.cfg) ? 'su_ready' : 'su_notready')) + '</div>';
  }
  function validateCfg(c) {
    var tm = c.terms;
    if (String(c.about).trim().length < 20 || !c.products.length) return 'v_required';
    for (var i = 0; i < c.products.length; i++) if (!String(c.products[i].name).trim()) return 'v_required';
    if (typeof tm.distributor_margin_percent !== 'number' || typeof tm.max_discount_percent !== 'number') return 'v_required';
    if (tm.distributor_margin_percent < 0 || tm.distributor_margin_percent > 100 || tm.max_discount_percent < 0 || tm.max_discount_percent > 100) return 'v_pct';
    var nums = [tm.min_order_value];
    c.products.forEach(function (p) { nums.push(p.min_order_qty, p.price, p.lead_time_days); });
    for (var j = 0; j < nums.length; j++) if (nums[j] !== null && nums[j] !== undefined && (typeof nums[j] !== 'number' || nums[j] < 0)) return 'v_number';
    return '';
  }
  function cleanCfg() {
    var c = JSON.parse(JSON.stringify(S.cfg));
    var cut = function (s, n) { return String(s || '').trim().slice(0, n); };
    c.schema = 1; c.view_language = S.view;
    c.agent_name = cut(c.agent_name, MAX.short); c.business_name = cut(c.business_name, MAX.short); c.about = cut(c.about, MAX.about);
    c.talking_points = cut(c.talking_points, MAX.talk); c.avoid = cut(c.avoid, MAX.avoid);
    c.products = c.products.slice(0, MAX.products).map(function (p) {
      ['name', 'category', 'hs_code', 'packaging', 'certifications'].forEach(function (k) { p[k] = cut(p[k], MAX.short); });
      p.description = cut(p.description, MAX.desc); return p;
    });
    c.faq = c.faq.map(function (f) { return { q: cut(f.q, MAX.short), a: cut(f.a, MAX.desc) }; }).filter(function (f) { return f.q && f.a; }).slice(0, MAX.faq);
    ['sample_note', 'delivery_note', 'regions'].forEach(function (k) { c.terms[k] = cut(c.terms[k], MAX.desc); });
    ESC_LOCKED.forEach(function (k) { if (c.escalate.indexOf(k) === -1) c.escalate.push(k); });
    return c;
  }
  async function saveCfg(b) {
    var c = cleanCfg(), bad = validateCfg(c);
    if (bad) { toast(t(bad), true); return; }
    b.disabled = true;
    try {
      var d = obj(await rpc('export_agent_config_save', { p_config: c, p_version: S.cfgVersion }));
      S.cfg = normCfg(c); S.cfgVersion = d.version || S.cfgVersion + 1; S.dirty = false;
      toast(t('su_ok')); drawSetup();
    } catch (e) {
      var m = String((e && e.message) || '').toLowerCase();
      if (m.indexOf('version_conflict') !== -1) {
        if (await O.ui.confirm(t('e_conflict') + ' (' + t('su_reload') + '?)')) { S.cfgLoaded = false; showSetup(); return; }
      } else toast(errText(e), true);
    }
    b.disabled = !S.dirty;
  }

  /* ---------------- events ---------------- */
  function onClick(e) {
    var b = e.target.closest ? e.target.closest('[data-ex]') : null; if (!b) return;
    var a = b.getAttribute('data-ex'), v = b.getAttribute('data-v'), id = b.getAttribute('data-id'), i = b.getAttribute('data-i');
    if (a === 'ui') { S.ui = v === 'hi' ? 'hi' : 'en'; lsSet(LS_UI, S.ui); drawShell(); show(S.tab); return; }
    if (a === 'tab') { drawShell(); show(v); return; }
    if (a === 'filter') { S.filter = v; S.items = []; drawFilters(); loadList(false); return; }
    if (a === 'list-refresh') { loadList(false); return; }
    if (a === 'more') { loadList(true); return; }
    if (a === 'open') { openThread(id); return; }
    if (a === 'th-back') { show('conv'); return; }
    if (a === 'th-refresh') { if (S.thread) loadThread(S.thread.id, false); return; }
    if (a === 'orig') { S.openOrig[id] = !S.openOrig[id]; paintChat(); return; }
    if (a === 'ctl') { control(v); return; }
    if (a === 'instr-send') { sendInstr(b); return; }
    if (a === 'reply-preview') { previewReply(b); return; }
    if (a === 'reply-send') { sendReply(b); return; }
    if (a === 'new-preview') { previewNew(b); return; }
    if (a === 'new-start') { startNew(b); return; }
    if (a === 'p-add') { S.cfg.products.push({ id: uid(), name: '', category: '', unit: 'kg', min_order_qty: null, price: null, currency: 'USD', lead_time_days: null, hs_code: '', packaging: '', certifications: '', description: '' }); S.dirty = true; drawSetup(); return; }
    if (a === 'p-del') { S.cfg.products.splice(Number(i), 1); S.dirty = true; drawSetup(); return; }
    if (a === 'f-add') { S.cfg.faq.push({ q: '', a: '' }); S.dirty = true; drawSetup(); return; }
    if (a === 'f-del') { S.cfg.faq.splice(Number(i), 1); S.dirty = true; drawSetup(); return; }
    if (a === 'su-save') { saveCfg(b); }
  }
  function onInput(e) {
    var el = e.target; if (!el || !el.getAttribute) return;
    if (el.id === 'exaView') {
      S.view = el.value; lsSet(LS_VIEW, S.view);
      if (S.cfg) { S.cfg.view_language = S.view; }
      if (S.tab === 'conv') { if (S.thread) { S.shown = null; loadThread(S.thread.id, false); } else loadList(false); }
      return;
    }
    if (el.id === 'exaSearch') { S.q = el.value; clearTimeout(S.searchTimer); S.searchTimer = setTimeout(function () { S.items = []; loadList(false); }, 350); return; }
    if (el.id === 'exaOrigAll') { S.showOrigAll = el.checked; paintChat(); return; }
    if (el.id === 'exaNDist') { fillNewLang(); }
    if (el.id === 'exaNDist' || el.id === 'exaNLang' || el.id === 'exaNGoal' || el.name === 'exaNProd') { S.preview = null; var st = $('#exaNStart', wrap); if (st) st.disabled = true; return; }
    if (S.tab !== 'setup' || !S.cfg) return;
    var k = el.getAttribute('data-k'), ar = el.getAttribute('data-arr'), pi = el.getAttribute('data-pi'), fi = el.getAttribute('data-fi');
    if (el.id === 'exaQuiet') { S.cfg.quiet_hours.enabled = el.checked; }
    else if (k) { setP(S.cfg, k, el.getAttribute('data-n') ? numVal(el.value) : el.value); }
    else if (ar) { var cur = arr(getP(S.cfg, ar)); var idx = cur.indexOf(el.value); if (el.checked && idx === -1) cur.push(el.value); if (!el.checked && idx !== -1) cur.splice(idx, 1); setP(S.cfg, ar, cur); }
    else if (pi !== null) { S.cfg.products[Number(pi)][el.getAttribute('data-pk')] = el.getAttribute('data-pn') ? numVal(el.value) : el.value; }
    else if (fi !== null) { S.cfg.faq[Number(fi)][el.getAttribute('data-fk')] = el.value; }
    else return;
    S.dirty = true; updateBar();
  }

  /* ---------------- register ---------------- */
  O.register({
    id: 'export-agent',
    label: 'Export Agent',
    order: 42,
    render: async function (ctx) {
      api = ctx.api; root = ctx.container;
      stopTimers(); styles();
      root.innerHTML = '<div class="loading">' + esc(t('checking')) + '</div>';
      var ok = await isApproved();
      if (!ok) { root.innerHTML = lockedView(); return; }
      root.innerHTML = '<div class="exa" id="exaRoot"></div>';
      wrap = $('#exaRoot', root);
      wrap.addEventListener('click', onClick);
      wrap.addEventListener('input', onInput);
      wrap.addEventListener('change', onInput);
      S.cfgLoaded = false; S.dirty = false; S.items = []; S.thread = null; S.tab = 'conv';
      drawShell(); show('conv');
    }
  });
})();
