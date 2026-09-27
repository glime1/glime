/* GLIME — Instagram Natural Sales Qualification Addon */
(() => {
  'use strict';

  const SUPABASE_URL = 'https://ufoulgbiqgjriwapuopc.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';
  const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  const $ = id => document.getElementById(id);

  let busy = false;
  let lastQualificationHash = '';

  const clean = value => String(value ?? '').trim();

  function normalizePhone(value) {
    const digits = clean(value).replace(/\D/g, '');
    if (digits.length === 10 && /^[6-9]/.test(digits)) return '+91' + digits;
    if (digits.length === 12 && digits.startsWith('91')) return '+' + digits;
    return digits;
  }

  function activeConversation() {
    const el = document.querySelector('.conversation-item.active');
    if (!el) return null;

    return {
      id: el.dataset.id || '',
      username: clean($('name')?.textContent),
      instagram_user_id: clean($('ctxInstagramId')?.textContent)
    };
  }

  function conversationText() {
    return [...document.querySelectorAll('#messages .message-row')]
      .slice(-16)
      .map(row => {
        const text = clean(
          row.querySelector('.bubble')?.textContent
        );

        return text
          ? (
              row.classList.contains('inbound')
                ? 'Customer: '
                : 'Business: '
            ) + text
          : '';
      })
      .filter(Boolean)
      .join('\n');
  }

  async function getContext() {
    const sessionResult = await db.auth.getSession();
    const session = sessionResult.data?.session;

    if (!session?.user) {
      throw new Error(
        'Active login session is missing.'
      );
    }

    const clientResult =
      await db
        .from('client_data')
        .select(
          'client_id,business_name,name,full_name'
        )
        .eq(
          'auth_user_id',
          session.user.id
        )
        .maybeSingle();

    if (clientResult.error) {
      throw clientResult.error;
    }

    if (!clientResult.data?.client_id) {
      throw new Error(
        'Client account not found.'
      );
    }

    const response =
      await fetch(
        `${SUPABASE_URL}/functions/v1/catalog-context`,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',

            apikey:
              SUPABASE_KEY,

            Authorization:
              `Bearer ${session.access_token}`
          },

          body: '{}'
        }
      );

    const catalog =
      await response
        .json()
        .catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        catalog.error ||
          `catalog-context ${response.status}`
      );
    }

    return {
      session,
      client:
        clientResult.data,
      catalog
    };
  }

  async function callAI(
    prompt,
    sessionToken
  ) {
    const response =
      await fetch(
        `${SUPABASE_URL}/functions/v1/glime-ai`,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body: JSON.stringify({
            action: 'chat',
            sessionToken:
              sessionToken || null,
            message:
              prompt
          })
        }
      );

    const data =
      await response
        .json()
        .catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.error ||
          'GLIME AI unavailable.'
      );
    }

    return data;
  }

  function parseJson(text) {
    const source =
      clean(text);

    if (!source) {
      return null;
    }

    try {
      return JSON.parse(source);
    } catch (_) {}

    const start =
      source.indexOf('{');

    const end =
      source.lastIndexOf('}');

    if (
      start >= 0 &&
      end > start
    ) {
      try {
        return JSON.parse(
          source.slice(
            start,
            end + 1
          )
        );
      } catch (_) {}
    }

    return null;
  }

  async function findLead(
    clientId,
    conversation
  ) {
    if (
      conversation.lead_id
    ) {
      const found =
        await db
          .from('leads')
          .select('*')
          .eq(
            'id',
            conversation.lead_id
          )
          .eq(
            'client_id',
            clientId
          )
          .maybeSingle();

      if (found.error) {
        throw found.error;
      }

      if (found.data) {
        return found.data;
      }
    }

    const found =
      await db
        .from('leads')
        .select('*')
        .eq(
          'client_id',
          clientId
        )
        .eq(
          'instagram_user_id',
          conversation.instagram_user_id
        )
        .order(
          'updated_at',
          {
            ascending: false
          }
        )
        .limit(1)
        .maybeSingle();

    if (found.error) {
      throw found.error;
    }

    return found.data || null;
  }

  function qualificationNotes(q) {
    const fields = [
      [
        'Occasion / purpose',
        q.occasion ||
          q.purpose
      ],

      [
        'For whom',
        q.for_whom
      ],

      [
        'Quantity',
        q.quantity
      ],

      [
        'Preferred date',
        q.preferred_date
      ],

      [
        'City / area',
        q.city_area
      ],

      [
        'Delivery needed',
        q.delivery_needed
          ? 'yes'
          : ''
      ],

      [
        'Address',
        q.address
      ],

      [
        'WhatsApp continuation requested',
        q.wants_whatsapp
          ? 'yes'
          : ''
      ]
    ];

    return fields
      .filter(
        ([, value]) =>
          clean(value)
      )
      .map(
        ([label, value]) =>
          `${label}: ${clean(value)}`
      )
      .join('\n');
  }

  async function syncQualification(
    client,
    conversation,
    q
  ) {
    if (
      !q ||
      typeof q !== 'object'
    ) {
      return null;
    }

    const meaningful = [
      q.customer_name,
      q.occasion,
      q.purpose,
      q.for_whom,
      q.product,
      q.product_service,
      q.quantity,
      q.preferred_date,
      q.city_area,
      q.mobile,
      q.whatsapp,
      q.address,
      q.budget
    ].some(
      value =>
        clean(value)
    );

    if (!meaningful) {
      return null;
    }

    let lead =
      await findLead(
        client.client_id,
        conversation
      );

    const mobile =
      normalizePhone(
        q.mobile
      );

    const whatsapp =
      normalizePhone(
        q.whatsapp
      );

    if (!lead) {
      const budget =
        clean(q.budget)
          ? Number(
              String(q.budget)
                .replace(/,/g, '')
            )
          : null;

      const created =
        await db
          .from('leads')
          .insert({
            client_id:
              client.client_id,

            name:
              clean(
                q.customer_name
              ) ||
              conversation.username ||
              `Instagram ${conversation.instagram_user_id}`,

            mobile:
              mobile ||
              null,

            whatsapp:
              whatsapp ||
              mobile ||
              null,

            city_area:
              clean(q.city_area) ||
              null,

            interest:
              clean(
                q.occasion
              ) ||
              clean(q.purpose) ||
              null,

            product_service:
              clean(
                q.product
              ) ||
              clean(
                q.product_service
              ) ||
              null,

            budget:
              Number.isFinite(
                budget
              )
                ? budget
                : null,

            budget_currency:
              clean(
                q.budget_currency
              ) ||
              'INR',

            source:
              'instagram',

            source_ref:
              conversation.instagram_user_id,

            status:
              'new',

            priority:
              'normal',

            instagram_user_id:
              conversation.instagram_user_id
          })
          .select('*')
          .single();

      if (created.error) {
        throw created.error;
      }

      lead =
        created.data;

      const linked =
        await db
          .from(
            'instagram_conversations'
          )
          .update({
            lead_id:
              lead.id,

            updated_at:
              new Date().toISOString()
          })
          .eq(
            'id',
            conversation.id
          )
          .eq(
            'client_id',
            client.client_id
          );

      if (linked.error) {
        throw linked.error;
      }
    }

    const update = {
      updated_at:
        new Date().toISOString()
    };

    if (
      q.customer_name
    ) {
      update.name =
        clean(
          q.customer_name
        );
    }

    if (mobile) {
      update.mobile =
        mobile;
    }

    if (whatsapp) {
      update.whatsapp =
        whatsapp;
    } else if (
      mobile &&
      !clean(
        lead.whatsapp
      )
    ) {
      update.whatsapp =
        mobile;
    }

    if (
      q.city_area
    ) {
      update.city_area =
        clean(
          q.city_area
        );
    }

    if (
      q.occasion ||
      q.purpose
    ) {
      update.interest =
        clean(
          q.occasion
        ) ||
        clean(
          q.purpose
        );
    }

    if (
      q.product ||
      q.product_service
    ) {
      update.product_service =
        clean(
          q.product
        ) ||
        clean(
          q.product_service
        );
    }

    const budget =
      clean(q.budget)
        ? Number(
            String(q.budget)
              .replace(/,/g, '')
          )
        : null;

    if (
      Number.isFinite(
        budget
      )
    ) {
      update.budget =
        budget;

      update.budget_currency =
        clean(
          q.budget_currency
        ) ||
        lead.budget_currency ||
        'INR';
    }

    const details =
      qualificationNotes(
        q
      );

    if (details) {
      const oldNotes =
        clean(
          lead.notes
        );

      update.notes =
        (
          oldNotes
            ? oldNotes +
              '\n\n'
            : ''
        ) +
        `[Instagram Sales ${new Date().toLocaleString()}]\n` +
        details;

      update.notes =
        update.notes.slice(
          -12000
        );
    }

    if (
      Object.keys(update)
        .length > 1
    ) {
      const saved =
        await db
          .from('leads')
          .update(update)
          .eq(
            'id',
            lead.id
          )
          .eq(
            'client_id',
            client.client_id
          )
          .select('*')
          .single();

      if (saved.error) {
        throw saved.error;
      }

      lead =
        saved.data;
    }

    await db
      .from('lead_timeline')
      .insert({
        client_id:
          client.client_id,

        lead_id:
          lead.id,

        event_type:
          'sales_qualification',

        title:
          'Instagram sales qualification updated',

        description:
          details ||
          'Customer qualification updated.',

        source:
          'instagram_sales_specialist',

        metadata: {
          channel:
            'instagram',

          instagram_user_id:
            conversation.instagram_user_id,

          qualification:
            q
        }
      });

    if (
      whatsapp ||
      q.wants_whatsapp
    ) {
      await linkWhatsApp(
        client.client_id,
        lead.id,
        whatsapp ||
          mobile
      );
    }

    return lead;
  }

  async function linkWhatsApp(
    clientId,
    leadId,
    number
  ) {
    const normalized =
      normalizePhone(
        number
      );

    if (!normalized) {
      return;
    }

    const digits =
      normalized.replace(
        /\D/g,
        ''
      );

    const result =
      await db
        .from('whatsapp_conversations')
        .select(
          'id,customer_phone'
        )
        .eq(
          'client_id',
          clientId
        )
        .in(
          'customer_phone',
          [
            normalized,
            digits
          ]
        )
        .limit(5);

    if (result.error) {
      return;
    }

    for (
      const row
      of result.data || []
    ) {
      await db
        .from(
          'whatsapp_conversations'
        )
        .update({
          lead_id:
            leadId,

          updated_at:
            new Date().toISOString()
        })
        .eq(
          'id',
          row.id
        )
        .eq(
          'client_id',
          clientId
        );
    }
  }

  async function findWhatsAppConversation(
    clientId,
    leadId,
    phone
  ) {
    if (leadId) {
      const byLead =
        await db
          .from('whatsapp_conversations')
          .select('id')
          .eq(
            'client_id',
            clientId
          )
          .eq(
            'lead_id',
            leadId
          )
          .limit(1)
          .maybeSingle();

      if (byLead.error) {
        throw byLead.error;
      }

      if (byLead.data) {
        return byLead.data;
      }
    }

    const normalized =
      normalizePhone(
        phone
      );

    if (!normalized) {
      return null;
    }

    const digits =
      normalized.replace(
        /\D/g,
        ''
      );

    const variants =
      new Set([
        normalized,
        digits
      ]);

    if (
      digits.length === 12 &&
      digits.startsWith('91')
    ) {
      variants.add(
        digits.slice(2)
      );
    } else if (
      digits.length === 10
    ) {
      variants.add(
        '91' + digits
      );
    }

    const byPhone =
      await db
        .from('whatsapp_conversations')
        .select('id')
        .eq(
          'client_id',
          clientId
        )
        .in(
          'customer_phone',
          [...variants]
        )
        .limit(1)
        .maybeSingle();

    if (byPhone.error) {
      throw byPhone.error;
    }

    return byPhone.data || null;
  }

  function showHandoff(
    lead,
    q,
    clientId
  ) {
    const host =
      document.querySelector(
        '.context-actions'
      );

    if (!host) {
      return;
    }

    document
      .getElementById(
        'igWhatsAppHandoff'
      )
      ?.remove();

    const number =
      normalizePhone(
        q.whatsapp ||
        q.mobile ||
        lead?.whatsapp ||
        lead?.mobile
      );

    if (
      !number &&
      !q.wants_whatsapp
    ) {
      return;
    }

    const box =
      document.createElement(
        'div'
      );

    box.id =
      'igWhatsAppHandoff';

    box.style.cssText =
      'margin-top:10px;padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,.1);font-size:12px;line-height:1.5;';

    box.innerHTML =
      '<strong>WhatsApp continuation</strong>' +
      '<div style="opacity:.72;margin-top:4px;">' +
      (
        number
          ? 'Customer number saved in the lead. Continue on WhatsApp after the customer chooses that channel.'
          : 'Ask for the WhatsApp number naturally when the customer wants to continue there.'
      ) +
      '</div>';

    if (
      number &&
      lead?.id
    ) {
      const button =
        document.createElement(
          'button'
        );

      button.type =
        'button';

      button.textContent =
        'Open WhatsApp Sales';

      button.style.cssText =
        'margin-top:8px;width:100%;padding:9px;border:0;border-radius:8px;cursor:pointer;';

      button.onclick =
        async () => {
          if (
            button.disabled
          ) {
            return;
          }

          const originalText =
            button.textContent;

          button.disabled =
            true;

          button.textContent =
            'Checking WhatsApp conversation…';

          try {
            const match =
              await findWhatsAppConversation(
                clientId,
                lead.id,
                number
              );

            if (match) {
              location.href =
                'whatsapp-sales-specialist.html?lead=' +
                encodeURIComponent(
                  lead.id
                ) +
                '&phone=' +
                encodeURIComponent(
                  number
                );
            } else {
              button.disabled =
                false;

              button.textContent =
                originalText;

              localToast(
                'WhatsApp conversation अभी उपलब्ध नहीं है। पहले customer से WhatsApp पर conversation शुरू करें।',
                true
              );
            }
          } catch (error) {
            button.disabled =
              false;

            button.textContent =
              originalText;

            localToast(
              error.message ||
                'WhatsApp conversation check failed.',
              true
            );
          }
        };

      box.appendChild(
        button
      );
    }

    host.appendChild(
      box
    );
  }

  function updateLeadUI(
    lead
  ) {
    if (!lead) {
      return;
    }

    if ($('leadStatus')) {
      $('leadStatus')
        .textContent =
        'Lead';
    }

    if ($('interest')) {
      $('interest')
        .textContent =
        lead.interest ||
        '—';
    }

    if ($('product')) {
      $('product')
        .textContent =
        lead.product_service ||
        '—';
    }

    if ($('budget')) {
      $('budget')
        .textContent =
        lead.budget !== null &&
        lead.budget !== undefined
          ? `${lead.budget} ${
              lead.budget_currency ||
              'INR'
            }`
          : '—';
    }

    if (
      $('openLead')
    ) {
      $('openLead').href =
        'leads.html?lead=' +
        encodeURIComponent(
          lead.id
        );
    }
  }

  async function suggest() {
    if (busy) {
      return;
    }

    const conversation =
      activeConversation();

    if (
      !conversation?.id
    ) {
      localToast(
        'Select an Instagram conversation first.',
        true
      );
      return;
    }

    busy = true;

    if ($('suggest')) {
      $('suggest').disabled =
        true;
    }

    try {
      const ctx =
        await getContext();

      const lead =
        await findLead(
          ctx.client.client_id,
          conversation
        );

      const catalog =
        ctx.catalog.catalog ||
        [];

      const knowledge =
        (
          ctx.catalog.knowledge ||
          []
        ).slice(
          0,
          20
        );

      const prompt = [
        'You are GLIME Instagram Sales Specialist.',
        'Your role is natural sales qualification, not just answering prices.',
        '',

        'Business:',
        JSON.stringify(
          ctx.catalog.business ||
          ctx.client
        ),

        '',

        'Verified business knowledge:',
        JSON.stringify(
          knowledge
        ),

        '',

        'Verified offer catalog:',
        JSON.stringify(
          catalog.slice(
            0,
            20
          )
        ),

        '',

        'Existing lead:',
        JSON.stringify(
          lead || {}
        ),

        '',

        'Recent conversation:',
        conversationText() ||
          'No messages available.',

        '',

        'Return JSON only in this shape:',

        '{"reply":"...","qualification":{"customer_name":"","occasion":"","purpose":"","for_whom":"","product":"","product_service":"","quantity":"","preferred_date":"","city_area":"","mobile":"","whatsapp":"","address":"","budget":"","budget_currency":"","delivery_needed":false,"wants_whatsapp":false}}',

        '',

        'Rules:',

        'Only capture customer-stated facts or already verified lead facts. Never infer.',

        'Do not ask again for details already known.',

        'Make the conversation warm and human. Ask only the next one or two useful questions.',

        'Naturally discover what the customer needs, who it is for, occasion/purpose, product/service, quantity and timing.',

        'Do not ask for a full address at the beginning. Ask city/area first when delivery matters, then ask detailed address only at genuine order/delivery stage.',

        'When the customer shows real purchase interest, it is appropriate to offer continuing on WhatsApp and ask for the WhatsApp number naturally.',

        'Never say a WhatsApp handoff already happened unless the system has actually completed it.',

        'Never promise home delivery unless delivery coverage is explicitly verified. Otherwise say you will confirm availability for their area.',

        'Never invent price, discount, feature, availability, guarantee, policy, delivery promise or timeline.',

        'Match the customer language and tone.',

        'reply must contain only the customer-facing message. Do not mention AI, JSON or internal rules.'
      ].join('\n');

      const aiSession =
        sessionStorage.getItem(
          'glime_instagram_ai_session'
        ) ||
        '';

      const data =
        await callAI(
          prompt,
          aiSession
        );

      if (
        data.sessionToken
      ) {
        sessionStorage.setItem(
          'glime_instagram_ai_session',
          data.sessionToken
        );
      }

      const parsed =
        parseJson(
          data.reply ||
          data.message ||
          data.output ||
          data.content ||
          ''
        ) ||
        {};

      const reply =
        clean(
          parsed.reply ||
          data.reply ||
          data.message ||
          data.output ||
          data.content
        );

      const q =
        parsed.qualification &&
        typeof parsed.qualification ===
          'object'
          ? parsed.qualification
          : {};

      if (!reply) {
        throw new Error(
          'No sales reply returned.'
        );
      }

      const hash =
        JSON.stringify(q);

      let savedLead =
        lead;

      if (
        hash !==
        lastQualificationHash
      ) {
        savedLead =
          await syncQualification(
            ctx.client,
            conversation,
            q
          ) ||
          lead;

        lastQualificationHash =
          hash;
      }

      if (
        $('suggestionText')
      ) {
        $('suggestionText')
          .textContent =
          reply;
      }

      if (
        $('aiSuggestion')
      ) {
        $('aiSuggestion')
          .classList
          .remove(
            'hidden'
          );
      }

      updateLeadUI(
        savedLead
      );

      if (
        q.wants_whatsapp ||
        q.whatsapp ||
        q.mobile
      ) {
        showHandoff(
          savedLead,
          q,
          ctx.client.client_id
        );
      }

    } catch (error) {
      console.error(
        '[GLIME IG SALES]',
        error
      );

      localToast(
        error.message ||
          'Sales suggestion failed.',
        true
      );

    } finally {
      busy = false;

      if ($('suggest')) {
        $('suggest').disabled =
          false;
      }
    }
  }

  function localToast(
    message,
    error
  ) {
    const old =
      document.querySelector(
        '.glime-ig-sales-toast'
      );

    old?.remove();

    const el =
      document.createElement(
        'div'
      );

    el.className =
      'glime-ig-sales-toast';

    el.textContent =
      message;

    el.style.cssText =
      'position:fixed;right:18px;bottom:18px;z-index:99999;padding:12px 16px;border-radius:12px;background:' +
      (
        error
          ? '#7f1d1d'
          : '#111827'
      ) +
      ';color:#fff;box-shadow:0 12px 40px rgba(0,0,0,.35);';

    document.body.appendChild(
      el
    );

    setTimeout(
      () =>
        el.remove(),
      3200
    );
  }

  let tries = 0;

  const timer =
    setInterval(
      () => {
        tries++;

        if (
          $('suggest') &&
          $('refreshSuggestion')
        ) {
          clearInterval(
            timer
          );

          $('suggest').onclick =
            suggest;

          $('refreshSuggestion').onclick =
            suggest;
        }

        if (
          tries > 40
        ) {
          clearInterval(
            timer
          );
        }
      },
      250
    );

  document.addEventListener(
    'click',
    event => {
      if (
        event.target.closest(
          '.conversation-item'
        )
      ) {
        lastQualificationHash =
          '';
      }
    }
  );

  console.log(
    '[GLIME IG SALES] Natural sales qualification addon active.'
  );
})();
