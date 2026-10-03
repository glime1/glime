/* ============================================================
   GLIME — Instagram Realtime + Media + Vision Frontend Layer
   ADD-ON FOR instagram-mobile-ui-addon-final.js

   RESPONSIBILITIES
   - Keep incoming Instagram conversations/messages live in UI
   - Render image/video/media messages when URL is available
   - Keep media_id/message_id available when URL is not yet resolved
   - Trigger secure backend Vision analysis for NEW inbound photos
   - Receive structured Vision understanding
   - Expose the understanding to the existing Sales Specialist
   - Show a suggested reply and allow inserting it into composer

   SECURITY
   - No Gemini/OpenAI/Meta secret is stored here.
   - Browser sends message/conversation identifiers to the backend.
   - Backend MUST authenticate the logged-in client and resolve media
     from Meta using server-side credentials.
   - Browser must never be treated as trusted for client_id authorization.

   BACKEND CONTRACT TO IMPLEMENT LATER

   POST /api/instagram/photo-understanding

   Request:
   {
     client_id,
     conversation_id,
     message_id,
     media_id,
     media_type,
     image_url: optional
   }

   Recommended response:
   {
     ok: true,
     message_id,
     resolved_media_url: optional,
     analysis: {
       summary,
       category,
       product_name,
       color,
       style,
       visible_details,
       attributes,
       confidence
     },
     sales_context,
     suggested_reply
   }

   The backend may additionally persist the structured understanding
   in message metadata / a dedicated table and hand it directly to the
   Sales Specialist orchestration. The frontend does not expose API keys.
   ============================================================ */

(function () {
  'use strict';

  var GLIME_IG_RT_URL =
    'https://ufoulgbiqgjriwapuopc.supabase.co';

  var GLIME_IG_RT_KEY =
    'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';

  var GLIME_IG_VISION_ENDPOINT =
    '/api/instagram/photo-understanding';

  var RT_STYLE_ID =
    'glime-instagram-realtime-media-vision-css-v1';

  var RT_INIT_KEY =
    '__glimeInstagramRealtimeMediaVisionInitialized';

  var rtClient = null;
  var rtChannel = null;
  var rtClientId = '';
  var pendingClientTimer = null;

  var analyzedMessages = Object.create(null);
  var renderedMessageIds = Object.create(null);

  /*
   * Shared browser-side context bridge.
   * Existing Sales Specialist code can read:
   * window.__glimeInstagramVisionContext[messageId]
   * after the glime:instagram-photo-understood event fires.
   */
  window.__glimeInstagramVisionContext =
    window.__glimeInstagramVisionContext ||
    Object.create(null);


  /* ============================================================
     SAFE HELPERS
     ============================================================ */

  function asText(value) {
    return value === null || value === undefined
      ? ''
      : String(value);
  }


  function getClientId() {
    var el = document.getElementById('clientId');

    if (!el) {
      return '';
    }

    return asText(
      el.value ||
      el.getAttribute('data-client-id') ||
      el.textContent
    ).trim();
  }


  function getConversationId() {
    var selectors = [
      '#conversationId',
      '#currentConversationId',
      '[data-current-conversation-id]',
      '#view [data-conversation-id]',
      '#view [data-conversation]',
      '.chat-view[data-conversation-id]'
    ];

    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);

      if (!el) {
        continue;
      }

      var value = asText(
        el.value ||
        el.getAttribute('data-current-conversation-id') ||
        el.getAttribute('data-conversation-id') ||
        el.getAttribute('data-conversation') ||
        el.textContent
      ).trim();

      if (value) {
        return value;
      }
    }

    var active = document.querySelector(
      '.conversation-item.active'
    );

    if (active) {
      var activeValue = asText(
        active.getAttribute('data-conversation-id') ||
        active.getAttribute('data-id') ||
        (active.dataset && active.dataset.conversationId) ||
        ''
      ).trim();

      if (activeValue) {
        return activeValue;
      }
    }

    return '';
  }


  function getMessageId(row) {
    if (!row) {
      return '';
    }

    return asText(
      row.getAttribute('data-glime-message-id') ||
      row.getAttribute('data-message-id') ||
      row.getAttribute('data-id') ||
      ''
    ).trim();
  }


  function sameId(a, b) {
    return asText(a) !== '' && asText(a) === asText(b);
  }


  function isMobile() {
    return window.innerWidth <= 720;
  }


  function isInboundRow(row) {
    if (!row) {
      return false;
    }

    if (row.classList.contains('inbound')) {
      return true;
    }

    if (row.classList.contains('outbound')) {
      return false;
    }

    return asText(
      row.getAttribute('data-direction') ||
      ''
    ).toLowerCase() === 'inbound';
  }


  /* ============================================================
     CSS
     ============================================================ */

  function addRealtimeStyles() {
    if (document.getElementById(RT_STYLE_ID)) {
      return;
    }

    var style = document.createElement('style');

    style.id = RT_STYLE_ID;

    style.textContent = `
      .glime-ig-live-media{
        margin-top:6px;
        max-width:min(300px,82vw);
      }

      .glime-ig-live-media img,
      .glime-ig-live-media video{
        display:block;
        width:100%;
        max-width:300px;
        max-height:390px;
        object-fit:cover;
        border-radius:16px;
        background:#eee;
        border:1px solid #e4e4e4;
        cursor:pointer;
      }

      .glime-ig-live-media-placeholder{
        display:flex;
        align-items:center;
        gap:8px;
        min-height:72px;
        padding:12px;
        border:1px solid #ddd;
        border-radius:15px;
        background:#f7f7f7;
        color:#666;
        font-size:12px;
      }

      .glime-ig-vision-panel{
        margin-top:7px;
      }

      .glime-ig-vision-tools{
        display:flex;
        align-items:center;
        gap:6px;
        flex-wrap:wrap;
      }

      .glime-ig-vision-button,
      .glime-ig-vision-use-reply{
        border:1px solid #ddd;
        background:#fff;
        color:#222;
        border-radius:17px;
        padding:6px 10px;
        font-size:11px;
        font-weight:600;
        cursor:pointer;
      }

      .glime-ig-vision-button:disabled{
        opacity:.55;
        cursor:wait;
      }

      .glime-ig-vision-status{
        margin-top:6px;
        padding:8px 10px;
        border-radius:12px;
        background:#f5f5f5;
        color:#444;
        font-size:11px;
        line-height:1.45;
        white-space:pre-wrap;
      }

      .glime-ig-vision-status.success{
        background:#f0faf4;
        color:#176b3a;
      }

      .glime-ig-vision-status.error{
        background:#fff2f3;
        color:#b42332;
      }

      .glime-ig-vision-details{
        margin-top:6px;
        font-size:10px;
        line-height:1.45;
        color:#666;
      }

      .glime-ig-ai-reply{
        margin-top:7px;
        padding:9px 11px;
        border-radius:13px;
        background:#f7f1ff;
        border:1px solid #eadcff;
        color:#27202f;
        font-size:11px;
        line-height:1.45;
        white-space:pre-wrap;
      }

      .glime-ig-ai-label{
        display:block;
        margin-bottom:4px;
        color:#7650a8;
        font-size:9px;
        font-weight:700;
        letter-spacing:.7px;
        text-transform:uppercase;
      }

      .glime-ig-live-badge{
        display:inline-flex;
        align-items:center;
        gap:5px;
        margin-left:6px;
        padding:3px 7px;
        border-radius:10px;
        background:#f3f3f3;
        color:#666;
        font-size:9px;
        font-weight:600;
      }

      .glime-ig-live-badge.online{
        background:#eefaf3;
        color:#19703e;
      }

      .glime-ig-live-dot{
        width:6px;
        height:6px;
        border-radius:50%;
        background:#999;
      }

      .glime-ig-live-badge.online .glime-ig-live-dot{
        background:#1aa45a;
      }

      .glime-ig-unread-badge{
        min-width:16px;
        height:16px;
        padding:0 4px;
        border-radius:8px;
        background:#111;
        color:#fff;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        font-size:9px;
        font-weight:700;
      }

      .glime-ig-vision-modal{
        position:fixed;
        inset:0;
        z-index:100000;
        display:none;
        align-items:center;
        justify-content:center;
        padding:18px;
        background:rgba(0,0,0,.9);
      }

      .glime-ig-vision-modal.open{
        display:flex;
      }

      .glime-ig-vision-modal img,
      .glime-ig-vision-modal video{
        max-width:96vw;
        max-height:92vh;
        object-fit:contain;
        border-radius:10px;
      }

      .glime-ig-vision-close{
        position:absolute;
        top:12px;
        right:14px;
        width:42px;
        height:42px;
        border:0;
        border-radius:50%;
        background:rgba(255,255,255,.16);
        color:#fff;
        font-size:28px;
        cursor:pointer;
      }

      @media(max-width:720px){
        .glime-ig-live-media,
        .glime-ig-live-media img,
        .glime-ig-live-media video{
          max-width:78vw;
        }
      }
    `;

    document.head.appendChild(style);
  }


  /* ============================================================
     LIVE STATUS
     ============================================================ */

  function setLiveStatus(online) {
    var topbar = document.querySelector('.topbar');

    if (!topbar) {
      return;
    }

    var existing = document.getElementById(
      'glimeIgLiveBadge'
    );

    if (!existing) {
      existing = document.createElement('span');
      existing.id = 'glimeIgLiveBadge';
      existing.className = 'glime-ig-live-badge';
      existing.innerHTML =
        '<span class="glime-ig-live-dot"></span>' +
        '<span class="glime-ig-live-label"></span>';

      var heading = topbar.querySelector('h1');

      if (heading && heading.parentNode) {
        heading.parentNode.appendChild(existing);
      } else {
        topbar.appendChild(existing);
      }
    }

    var label = existing.querySelector(
      '.glime-ig-live-label'
    );

    existing.classList.toggle(
      'online',
      !!online
    );

    if (label) {
      label.textContent = online
        ? 'Live'
        : 'Connecting…';
    }
  }


  /* ============================================================
     MEDIA MODAL
     ============================================================ */

  function ensureMediaModal() {
    var modal = document.getElementById(
      'glimeIgMediaModal'
    );

    if (modal) {
      return modal;
    }

    modal = document.createElement('div');
    modal.id = 'glimeIgMediaModal';
    modal.className = 'glime-ig-vision-modal';

    modal.innerHTML =
      '<button type="button" ' +
        'class="glime-ig-vision-close" ' +
        'aria-label="Close media">×</button>' +
      '<div id="glimeIgMediaModalBody"></div>';

    document.body.appendChild(modal);

    modal.addEventListener('click', function (event) {
      if (
        event.target === modal ||
        event.target.classList.contains(
          'glime-ig-vision-close'
        )
      ) {
        modal.classList.remove('open');

        var body = document.getElementById(
          'glimeIgMediaModalBody'
        );

        if (body) {
          body.innerHTML = '';
        }
      }
    });

    return modal;
  }


  function openMedia(url, type) {
    if (!url) {
      return;
    }

    var modal = ensureMediaModal();
    var body = document.getElementById(
      'glimeIgMediaModalBody'
    );

    if (!body) {
      return;
    }

    body.innerHTML = '';

    var node;

    if (type === 'video') {
      node = document.createElement('video');
      node.controls = true;
      node.autoplay = true;
      node.playsInline = true;
    } else {
      node = document.createElement('img');
    }

    node.src = url;
    node.alt = 'Instagram customer media';

    body.appendChild(node);
    modal.classList.add('open');
  }


  /* ============================================================
     MEDIA NORMALIZATION
     ============================================================ */

  function normalizeMetadata(message) {
    var metadata = message && message.metadata;

    if (typeof metadata === 'string') {
      try {
        metadata = JSON.parse(metadata);
      } catch (_) {
        metadata = {};
      }
    }

    return metadata && typeof metadata === 'object'
      ? metadata
      : {};
  }


  function normalizeMessage(raw) {
    var m = raw || {};
    var metadata = normalizeMetadata(m);

    var mediaUrl =
      metadata.media_url ||
      metadata.mediaUrl ||
      m.media_url ||
      m.mediaUrl ||
      '';

    var mediaId =
      m.media_id ||
      metadata.media_id ||
      metadata.mediaId ||
      '';

    var mediaType =
      m.message_type ||
      metadata.media_type ||
      metadata.mediaType ||
      '';

    if (/image|photo|picture/i.test(mediaType)) {
      mediaType = 'image';
    } else if (/video/i.test(mediaType)) {
      mediaType = 'video';
    } else if (/audio|voice/i.test(mediaType)) {
      mediaType = 'audio';
    } else if (mediaUrl) {
      mediaType = /\.(mp4|mov|webm)(\?|$)/i.test(mediaUrl)
        ? 'video'
        : 'image';
    }

    return {
      id: asText(m.id),
      clientId: asText(m.client_id),
      conversationId: asText(m.conversation_id),
      direction: asText(m.direction).toLowerCase(),
      textBody: asText(m.text_body),
      mediaId: asText(mediaId),
      mediaUrl: asText(mediaUrl),
      mediaType: mediaType || '',
      providerMessageId: asText(m.provider_message_id),
      createdAt: asText(
        m.provider_timestamp || m.created_at
      ),
      status: asText(m.status),
      senderId: asText(m.sender_instagram_user_id),
      recipientId: asText(m.recipient_instagram_user_id),
      specialist: asText(m.specialist_module_slug),
      raw: m
    };
  }


  function rowMediaInfo(row) {
    if (!row) {
      return null;
    }

    var url = asText(
      row.getAttribute('data-media-url') ||
      row.getAttribute('data-image-url') ||
      row.getAttribute('data-media') ||
      ''
    );

    var mediaType = asText(
      row.getAttribute('data-media-type') ||
      ''
    ).toLowerCase();

    var mediaId = asText(
      row.getAttribute('data-media-id') ||
      ''
    );

    var messageId = getMessageId(row);

    var img = row.querySelector('img[src]');
    var video = row.querySelector('video[src]');

    if (!url && img) {
      url = img.currentSrc || img.src || '';
      mediaType = 'image';
    }

    if (!url && video) {
      url = video.currentSrc || video.src || '';
      mediaType = 'video';
    }

    return {
      url: url,
      type: mediaType || 'image',
      mediaId: mediaId,
      messageId: messageId
    };
  }


  function isMediaMessage(message) {
    if (!message) {
      return false;
    }

    return !!(
      message.mediaId ||
      message.mediaUrl ||
      /image|photo|picture|video/i.test(
        message.mediaType
      )
    );
  }


  /* ============================================================
     MESSAGE DOM HELPERS
     ============================================================ */

  function findMessageRow(messageId) {
    if (!messageId) {
      return null;
    }

    var rows = document.querySelectorAll(
      '#messages .message-row'
    );

    for (var i = 0; i < rows.length; i++) {
      if (sameId(getMessageId(rows[i]), messageId)) {
        return rows[i];
      }
    }

    return null;
  }


  function findMessageTarget(row) {
    return (
      row.querySelector('.bubble') ||
      row.querySelector('.message-content') ||
      row
    );
  }


  function formatTime(value) {
    if (!value) {
      return '';
    }

    var d = new Date(value);

    if (isNaN(d.getTime())) {
      return '';
    }

    try {
      return d.toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit'
      });
    } catch (_) {
      return '';
    }
  }


  function appendMissingMessage(message) {
    var messages = document.getElementById('messages');

    if (!messages || !message || !message.id) {
      return null;
    }

    var existing = findMessageRow(message.id);

    if (existing) {
      return existing;
    }

    var row = document.createElement('div');

    row.className =
      'message-row ' +
      (message.direction === 'outbound'
        ? 'outbound'
        : 'inbound');

    row.setAttribute(
      'data-glime-message-id',
      message.id
    );

    row.setAttribute(
      'data-message-id',
      message.id
    );

    row.setAttribute(
      'data-conversation-id',
      message.conversationId
    );

    row.setAttribute(
      'data-direction',
      message.direction || 'inbound'
    );

    if (message.mediaId) {
      row.setAttribute(
        'data-media-id',
        message.mediaId
      );
    }

    if (message.mediaUrl) {
      row.setAttribute(
        'data-media-url',
        message.mediaUrl
      );
    }

    if (message.mediaType) {
      row.setAttribute(
        'data-media-type',
        message.mediaType
      );
    }

    var bubble = document.createElement('div');
    bubble.className = 'bubble';

    if (message.textBody) {
      var textNode = document.createElement('div');
      textNode.textContent = message.textBody;
      bubble.appendChild(textNode);
    }

    if (
      message.mediaId ||
      message.mediaUrl
    ) {
      bubble.setAttribute(
        'data-glime-media-pending',
        '1'
      );
    }

    if (message.createdAt) {
      var meta = document.createElement('small');
      meta.className = 'bubble-meta';
      meta.textContent = formatTime(
        message.createdAt
      );
      bubble.appendChild(meta);
    }

    row.appendChild(bubble);
    messages.appendChild(row);

    try {
      messages.scrollTop = messages.scrollHeight;
    } catch (_) {}

    return row;
  }


  function renderMedia(message, row) {
    if (!message || !row) {
      return;
    }

    if (!isMediaMessage(message)) {
      return;
    }

    var target = findMessageTarget(row);

    if (!target) {
      return;
    }

    var existing = target.querySelector(
      '.glime-ig-live-media'
    );

    if (existing) {
      return;
    }

    var wrap = document.createElement('div');
    wrap.className = 'glime-ig-live-media';

    if (message.mediaUrl) {
      var media;

      if (message.mediaType === 'video') {
        media = document.createElement('video');
        media.controls = true;
        media.preload = 'metadata';
        media.playsInline = true;
      } else {
        media = document.createElement('img');
        media.loading = 'lazy';
      }

      media.src = message.mediaUrl;
      media.alt = 'Instagram customer media';

      media.addEventListener('click', function () {
        openMedia(
          message.mediaUrl,
          message.mediaType
        );
      });

      wrap.appendChild(media);
    } else {
      var placeholder = document.createElement('div');
      placeholder.className =
        'glime-ig-live-media-placeholder';
      placeholder.textContent =
        message.mediaType === 'video'
          ? '🎥 Video received'
          : '📷 Photo received — media is being resolved';
      wrap.appendChild(placeholder);
    }

    target.appendChild(wrap);

    row.setAttribute(
      'data-glime-media-rendered',
      '1'
    );
  }


  /* ============================================================
     VISION UI
     ============================================================ */

  function setVisionStatus(node, value, cls) {
    node.style.display = 'block';
    node.className =
      'glime-ig-vision-status' +
      (cls ? ' ' + cls : '');
    node.textContent = value || '';
  }


  function getComposerTextarea() {
    return document.getElementById('input');
  }


  function putReplyInComposer(reply) {
    if (!reply) {
      return;
    }

    var input = getComposerTextarea();

    if (!input) {
      return;
    }

    input.value = reply;

    input.dispatchEvent(
      new Event('input', {bubbles: true})
    );

    input.focus();
  }


  function renderVisionPanel(row, message) {
    var target = findMessageTarget(row);

    if (!target) {
      return null;
    }

    var panel = target.querySelector(
      '.glime-ig-vision-panel'
    );

    if (panel) {
      return panel;
    }

    panel = document.createElement('div');
    panel.className = 'glime-ig-vision-panel';

    var tools = document.createElement('div');
    tools.className = 'glime-ig-vision-tools';

    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'glime-ig-vision-button';
    button.textContent = '🤖 Photo samjho';

    var useReply = document.createElement('button');
    useReply.type = 'button';
    useReply.className =
      'glime-ig-vision-use-reply';
    useReply.textContent = 'Reply use karo';
    useReply.style.display = 'none';

    var status = document.createElement('div');
    status.className = 'glime-ig-vision-status';
    status.style.display = 'none';

    var details = document.createElement('div');
    details.className = 'glime-ig-vision-details';
    details.style.display = 'none';

    var reply = document.createElement('div');
    reply.className = 'glime-ig-ai-reply';
    reply.style.display = 'none';

    var label = document.createElement('span');
    label.className = 'glime-ig-ai-label';
    label.textContent = 'Sales Specialist context';

    reply.appendChild(label);

    var replyText = document.createElement('span');
    reply.appendChild(replyText);

    tools.appendChild(button);
    tools.appendChild(useReply);

    panel.appendChild(tools);
    panel.appendChild(status);
    panel.appendChild(details);
    panel.appendChild(reply);

    target.appendChild(panel);

    var state = {
      row: row,
      message: message,
      button: button,
      useReply: useReply,
      status: status,
      details: details,
      reply: reply,
      replyText: replyText,
      replyValue: ''
    };

    button.addEventListener('click', function () {
      analyzePhoto(state, false);
    });

    useReply.addEventListener('click', function () {
      putReplyInComposer(state.replyValue);
    });

    panel.__glimeVisionState = state;

    return panel;
  }


  function renderAnalysisFields(details, analysis) {
    var fields = [];

    if (!analysis || typeof analysis !== 'object') {
      return;
    }

    if (analysis.category) {
      fields.push(
        'Category: ' + asText(analysis.category)
      );
    }

    if (analysis.product_name) {
      fields.push(
        'Product: ' + asText(analysis.product_name)
      );
    }

    if (analysis.color) {
      fields.push(
        'Color: ' + asText(analysis.color)
      );
    }

    if (analysis.style) {
      fields.push(
        'Style: ' + asText(analysis.style)
      );
    }

    if (analysis.visible_details) {
      var visible = Array.isArray(
        analysis.visible_details
      )
        ? analysis.visible_details.join(', ')
        : asText(analysis.visible_details);

      if (visible) {
        fields.push(
          'Visible details: ' + visible
        );
      }
    }

    if (analysis.attributes) {
      var attrs = analysis.attributes;

      if (typeof attrs === 'object') {
        try {
          attrs = JSON.stringify(attrs);
        } catch (_) {
          attrs = asText(attrs);
        }
      }

      if (attrs) {
        fields.push(
          'Attributes: ' + attrs
        );
      }
    }

    if (
      analysis.confidence !== undefined &&
      analysis.confidence !== null
    ) {
      fields.push(
        'Confidence: ' +
        asText(analysis.confidence)
      );
    }

    if (!fields.length) {
      details.style.display = 'none';
      return;
    }

    details.textContent = fields.join(' • ');
    details.style.display = 'block';
  }


  function analyzePhoto(state, automatic) {
    if (!state || !state.message) {
      return;
    }

    var message = state.message;
    var messageId = message.id || '';

    if (
      messageId &&
      analyzedMessages[messageId]
    ) {
      return;
    }

    if (
      !automatic &&
      state.button.disabled
    ) {
      return;
    }

    if (messageId) {
      analyzedMessages[messageId] = 'running';
    }

    state.button.disabled = true;
    state.button.textContent =
      'AI photo dekh raha hai…';

    setVisionStatus(
      state.status,
      'Photo ko samjha ja raha hai…',
      ''
    );

    var body = {
      client_id: getClientId(),
      conversation_id:
        message.conversationId ||
        getConversationId(),
      message_id: message.id,
      media_id: message.mediaId,
      media_type: message.mediaType || 'image'
    };

    /*
     * image_url is deliberately optional.
     * Backend should prefer message_id/media_id and resolve the
     * current Meta media server-side. This prevents browser-supplied
     * URLs from becoming a trusted source.
     */
    if (message.mediaUrl) {
      body.image_url = message.mediaUrl;
    }

    fetch(GLIME_IG_VISION_ENDPOINT, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })
    .then(function (response) {
      return response.text().then(function (raw) {
        var data = {};

        try {
          data = raw
            ? JSON.parse(raw)
            : {};
        } catch (_) {
          data = {};
        }

        if (!response.ok) {
          throw new Error(
            data.error ||
            data.message ||
            'Vision analysis failed.'
          );
        }

        return data;
      });
    })
    .then(function (data) {
      var analysis =
        data.analysis ||
        data.understanding ||
        data.vision ||
        {};

      var summary =
        analysis.summary ||
        analysis.description ||
        data.description ||
        '';

      var resolvedUrl = asText(
        data.resolved_media_url ||
        data.resolvedMediaUrl ||
        ''
      );

      if (
        resolvedUrl &&
        !message.mediaUrl
      ) {
        message.mediaUrl = resolvedUrl;

        state.row.setAttribute(
          'data-media-url',
          resolvedUrl
        );

        renderMedia(
          message,
          state.row
        );
      }

      if (!summary) {
        summary =
          'Photo analyze ho gayi, lekin readable description return nahi hui.';
      }

      setVisionStatus(
        state.status,
        summary,
        'success'
      );

      renderAnalysisFields(
        state.details,
        analysis
      );

      var salesContext = asText(
        data.sales_context ||
        data.salesContext ||
        data.context ||
        ''
      );

      var generatedReply = asText(
        data.suggested_reply ||
        data.suggestedReply ||
        data.reply ||
        ''
      );

      var replyValue =
        generatedReply ||
        salesContext ||
        '';

      if (replyValue) {
        state.replyValue =
          replyValue;

        state.replyText.textContent =
          replyValue;

        state.reply.style.display =
          'block';

        state.useReply.style.display =
          'inline-block';
      }

      state.button.textContent =
        '✓ Photo understood';

      state.button.disabled =
        true;

      if (messageId) {
        analyzedMessages[messageId] =
          'done';
      }

      if (messageId) {
        window.__glimeInstagramVisionContext[messageId] = {
          message_id: message.id,
          conversation_id:
            message.conversationId ||
            getConversationId(),
          media_id: message.mediaId,
          media_type: message.mediaType,
          image_url: message.mediaUrl,
          analysis: analysis,
          sales_context: salesContext,
          suggested_reply: generatedReply,
          updated_at: new Date().toISOString()
        };
      }

      /*
       * Existing GLIME Sales Specialist can listen for this event.
       * The event carries structured context only; it does not send
       * a customer-facing message by itself.
       */
      document.dispatchEvent(
        new CustomEvent(
          'glime:instagram-photo-understood',
          {
            detail: {
              client_id: getClientId(),
              conversation_id:
                message.conversationId ||
                getConversationId(),
              message_id: message.id,
              media_id: message.mediaId,
              media_type: message.mediaType,
              image_url: message.mediaUrl,
              analysis: analysis,
              sales_context: salesContext,
              suggested_reply: generatedReply,
              automatic: !!automatic,
              raw: data
            }
          }
        )
      );

      /*
       * A backend implementation can also return an explicit signal
       * that its own orchestration has already queued/sent the reply.
       * We only surface the state in the UI; sending remains backend work.
       */
      if (data.auto_reply_queued) {
        setVisionStatus(
          state.status,
          summary +
          '\n\nSales Specialist reply queued.',
          'success'
        );
      }
    })
    .catch(function (error) {
      console.error(
        '[GLIME Instagram Vision]',
        error
      );

      if (messageId) {
        analyzedMessages[messageId] =
          'error';
      }

      setVisionStatus(
        state.status,
        error && error.message
          ? error.message
          : 'Photo analysis failed.',
        'error'
      );

      state.button.disabled =
        false;

      state.button.textContent =
        'Try again';
    });
  }


  /* ============================================================
     ATTACH VISION TO A MESSAGE ROW
     ============================================================ */

  function attachVision(row, message, automatic) {
    if (!row || !message) {
      return;
    }

    if (!isMediaMessage(message)) {
      return;
    }

    renderMedia(message, row);

    if (
      message.mediaType === 'video' ||
      !isInboundRow(row)
    ) {
      return;
    }

    var panel = renderVisionPanel(
      row,
      message
    );

    if (!panel) {
      return;
    }

    var state =
      panel.__glimeVisionState;

    if (
      automatic &&
      state &&
      message.mediaType !== 'video'
    ) {
      setTimeout(function () {
        analyzePhoto(
          state,
          true
        );
      }, 40);
    }
  }


  function enhanceExistingRows() {
    var messages = document.getElementById(
      'messages'
    );

    if (!messages) {
      return;
    }

    var rows = messages.querySelectorAll(
      '.message-row'
    );

    Array.prototype.forEach.call(
      rows,
      function (row) {
        var info = rowMediaInfo(row);

        if (!info) {
          return;
        }

        var message = normalizeMessage({
          id: info.messageId,
          conversation_id:
            row.getAttribute(
              'data-conversation-id'
            ) || getConversationId(),
          direction:
            row.getAttribute(
              'data-direction'
            ) ||
            (row.classList.contains('outbound')
              ? 'outbound'
              : 'inbound'),
          media_id: info.mediaId,
          media_url: info.url,
          message_type: info.type
        });

        attachVision(
          row,
          message,
          false
        );
      }
    );
  }


  /* ============================================================
     REALTIME DOM SYNC
     ============================================================ */

  function messageBelongsToCurrentConversation(
    message
  ) {
    var current = getConversationId();

    if (!current || !message) {
      return false;
    }

    return sameId(
      current,
      message.conversationId
    );
  }


  function updateConversationPreview(
    message
  ) {
    if (!message || !message.conversationId) {
      return;
    }

    var items = document.querySelectorAll(
      '.conversation-item'
    );

    var matched = null;

    for (var i = 0; i < items.length; i++) {
      var item = items[i];

      var cid = asText(
        item.getAttribute(
          'data-conversation-id'
        ) ||
        item.getAttribute('data-id') ||
        (item.dataset &&
          item.dataset.conversationId) ||
        ''
      );

      if (sameId(cid, message.conversationId)) {
        matched = item;
        break;
      }
    }

    if (!matched) {
      return;
    }

    var preview = matched.querySelector(
      '.conv-preview'
    );

    if (preview) {
      preview.textContent =
        message.mediaType === 'image'
          ? '📷 Photo'
          : message.mediaType === 'video'
            ? '🎥 Video'
            : message.textBody ||
              'New Instagram message';
    }

    var time = matched.querySelector(
      '.conv-time'
    );

    if (time && message.createdAt) {
      time.textContent = formatTime(
        message.createdAt
      );
    }

    if (
      !messageBelongsToCurrentConversation(
        message
      ) &&
      !matched.classList.contains('active')
    ) {
      var badge = matched.querySelector(
        '.glime-ig-unread-badge'
      );

      if (!badge) {
        badge = document.createElement('span');
        badge.className =
          'glime-ig-unread-badge';
        badge.textContent = '1';
        matched.appendChild(badge);
      }
    }
  }


  function handleRealtimeMessage(raw) {
    var message = normalizeMessage(raw);

    if (!message.id) {
      return;
    }

    updateConversationPreview(message);

    if (
      !messageBelongsToCurrentConversation(
        message
      )
    ) {
      return;
    }

    var row = findMessageRow(message.id);

    if (!row) {
      row = appendMissingMessage(
        message
      );
    }

    if (!row) {
      return;
    }

    renderedMessageIds[message.id] = true;

    attachVision(
      row,
      message,
      message.direction === 'inbound' &&
        message.mediaType === 'image'
    );

    document.dispatchEvent(
      new CustomEvent(
        'glime:instagram-media',
        {
          detail: {
            messageId: message.id,
            conversationId:
              message.conversationId,
            mediaId: message.mediaId,
            mediaUrl: message.mediaUrl,
            mediaType: message.mediaType,
            direction: message.direction
          }
        }
      )
    );
  }


  /* ============================================================
     FETCH CURRENT CONVERSATION FROM SUPABASE
     Used as a synchronization fallback when the base renderer
     has not yet materialized rows containing media metadata.
     ============================================================ */

  async function loadConversationMessages(conversationId) {
    if (
      !rtClient ||
      !conversationId
    ) {
      return;
    }

    try {
      var result = await rtClient
        .from('instagram_messages')
        .select(
          'id,client_id,conversation_id,provider_message_id,direction,message_type,text_body,media_id,status,sender_instagram_user_id,recipient_instagram_user_id,provider_timestamp,specialist_module_slug,metadata,created_at,updated_at'
        )
        .eq(
          'client_id',
          getClientId()
        )
        .eq(
          'conversation_id',
          conversationId
        )
        .order('provider_timestamp', {
          ascending: true,
          nullsFirst: false
        });

      if (result.error) {
        console.warn(
          '[GLIME Instagram Realtime] message sync:',
          result.error
        );
        return;
      }

      var rows = result.data || [];

      rows.forEach(function (raw) {
        var message = normalizeMessage(raw);
        var row = findMessageRow(message.id);

        if (
          !row &&
          (
            message.mediaId ||
            message.mediaUrl ||
            message.textBody
          )
        ) {
          row = appendMissingMessage(
            message
          );
        }

        if (row) {
          attachVision(
            row,
            message,
            false
          );
        }
      });
    } catch (error) {
      console.warn(
        '[GLIME Instagram Realtime] sync failed:',
        error
      );
    }
  }


  /* ============================================================
     REFRESH CONVERSATION LIST
     ============================================================ */

  function refreshConversationList() {
    var refresh = document.getElementById(
      'refresh'
    );

    if (!refresh) {
      return;
    }

    try {
      refresh.click();
    } catch (_) {
      /* Never let UI refresh failures break realtime. */
    }
  }


  /* ============================================================
     SUPABASE REALTIME
     ============================================================ */

  function canCreateRealtimeClient() {
    return !!(
      window.supabase &&
      typeof window.supabase.createClient ===
      'function'
    );
  }


  function subscribeRealtime() {
    if (!canCreateRealtimeClient()) {
      setLiveStatus(false);
      return false;
    }

    var currentClientId = getClientId();

    if (!currentClientId) {
      return false;
    }

    if (
      rtClient &&
      rtClientId === currentClientId
    ) {
      return true;
    }

    if (rtChannel && rtClient) {
      try {
        rtClient.removeChannel(
          rtChannel
        );
      } catch (_) {}

      rtChannel = null;
    }

    try {
      rtClient = window.supabase.createClient(
        GLIME_IG_RT_URL,
        GLIME_IG_RT_KEY
      );

      rtClientId = currentClientId;

      rtChannel = rtClient
        .channel(
          'glime-instagram-live-' +
          currentClientId
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'instagram_conversations',
            filter:
              'client_id=eq.' +
              currentClientId
          },
          function () {
            /*
             * Conversation row changed/created.
             * Refresh only the in-app conversation list.
             */
            refreshConversationList();
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'instagram_messages',
            filter:
              'client_id=eq.' +
              currentClientId
          },
          function (payload) {
            handleRealtimeMessage(
              payload && payload.new
            );
          }
        )
        .subscribe(function (status) {
          var online =
            status === 'SUBSCRIBED';

          setLiveStatus(online);
        });

      return true;
    } catch (error) {
      console.error(
        '[GLIME Instagram Realtime] init:',
        error
      );

      rtClient = null;
      rtChannel = null;
      setLiveStatus(false);

      return false;
    }
  }


  function waitForDependencies() {
    if (subscribeRealtime()) {
      return;
    }

    if (pendingClientTimer) {
      return;
    }

    pendingClientTimer = setInterval(
      function () {
        if (subscribeRealtime()) {
          clearInterval(
            pendingClientTimer
          );

          pendingClientTimer = null;
        }
      },
      1000
    );

    setTimeout(function () {
      if (pendingClientTimer) {
        clearInterval(
          pendingClientTimer
        );

        pendingClientTimer = null;
      }
    }, 30000);
  }


  /* ============================================================
     OBSERVE CHAT RENDERING
     ============================================================ */

  function observeMessagesDom() {
    var messages = document.getElementById(
      'messages'
    );

    if (
      !messages ||
      window.__glimeIgRealtimeMessagesObserver
    ) {
      return;
    }

    window.__glimeIgRealtimeMessagesObserver =
      new MutationObserver(function () {
        enhanceExistingRows();
      });

    window.__glimeIgRealtimeMessagesObserver.observe(
      messages,
      {
        childList: true,
        subtree: true
      }
    );
  }


  function observeConversationOpen() {
    var view = document.getElementById(
      'view'
    );

    if (
      !view ||
      window.__glimeIgRealtimeViewObserver
    ) {
      return;
    }

    window.__glimeIgRealtimeViewObserver =
      new MutationObserver(function () {
        if (
          !view.classList.contains('hidden')
        ) {
          setTimeout(function () {
            enhanceExistingRows();

            if (rtClient) {
              loadConversationMessages(
                getConversationId()
              );
            }
          }, 80);
        }
      });

    window.__glimeIgRealtimeViewObserver.observe(
      view,
      {
        attributes: true,
        attributeFilter: ['class'],
        childList: true,
        subtree: true
      }
    );
  }


  /* ============================================================
     PHOTO-UNDERSTANDING EVENT BRIDGE
     ============================================================ */

  document.addEventListener(
    'glime:instagram-media',
    function (event) {
      var detail =
        event && event.detail;

      if (!detail) {
        return;
      }

      setTimeout(function () {
        enhanceExistingRows();
      }, 0);
    }
  );


  /* ============================================================
     INIT
     ============================================================ */

  function init() {
    if (window[RT_INIT_KEY]) {
      return;
    }

    window[RT_INIT_KEY] = true;

    addRealtimeStyles();
    ensureMediaModal();
    setLiveStatus(false);
    enhanceExistingRows();
    observeMessagesDom();
    observeConversationOpen();
    waitForDependencies();

    setTimeout(function () {
      enhanceExistingRows();
    }, 300);

    setTimeout(function () {
      waitForDependencies();
      enhanceExistingRows();
    }, 1500);
  }


  if (
    document.readyState ===
    'loading'
  ) {
    document.addEventListener(
      'DOMContentLoaded',
      init,
      {once: true}
    );
  } else {
    init();
  }

})();
