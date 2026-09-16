/*
  GLIME — Voice AI Setup Auth Fix
  ---------------------------------------------------------
  Fixes authenticated Supabase session handling for the
  Voice AI Business Setup Save button.

  IMPORTANT:
  - voice-ai.js को modify नहीं करता
  - existing voice-ai-setup-addon.js को replace नहीं करता
  - सिर्फ Save button को authenticated RPC call देता है
*/

(() => {
  'use strict';

  const SUPABASE_URL =
    'https://ufoulgbiqgjriwapuopc.supabase.co';

  const SUPABASE_KEY =
    'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';

  const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );

  function getValue(id) {
    return (
      document
        .getElementById(id)
        ?.value
        ?.trim()
    ) || '';
  }

  function lines(value) {
    return String(value || '')
      .split(/\r?\n/)
      .map(v => v.trim())
      .filter(Boolean);
  }

  function objectFromLines(value) {
    const output = {};

    lines(value).forEach(line => {

      const index = line.indexOf(':');

      if (index > 0) {

        const key =
          line
            .slice(0, index)
            .trim();

        const val =
          line
            .slice(index + 1)
            .trim();

        output[key] = val;
      }

    });

    return output;
  }

  function servicesFromText(value) {

    return lines(value).map(line => {

      const parts =
        line.split(/\s*[—|-]\s*/);

      return {
        name:
          parts[0]?.trim() ||
          line,

        price:
          parts
            .slice(1)
            .join(' — ')
            .trim()
      };

    });

  }

  function faqsFromText(value) {

    return lines(value).map(line => {

      const parts =
        line.split('|');

      return {

        question:
          parts[0]?.trim() ||
          '',

        answer:
          parts
            .slice(1)
            .join('|')
            .trim()

      };

    });

  }

  function leadFieldsFromText(value) {

    return lines(value)
      .map(name => ({
        name
      }));

  }

  function buildBusinessProfile() {

    return {

      business_name:
        getValue(
          'gvaBusinessName'
        ),

      business_type:
        getValue(
          'gvaBusinessType'
        ),

      description:
        getValue(
          'gvaDescription'
        ),

      location:
        getValue(
          'gvaLocation'
        ),

      working_hours:
        objectFromLines(
          getValue(
            'gvaHours'
          )
        ),

      services:
        servicesFromText(
          getValue(
            'gvaServices'
          )
        ),

      faqs:
        faqsFromText(
          getValue(
            'gvaFaqs'
          )
        ),

      policies:
        objectFromLines(
          getValue(
            'gvaPolicies'
          )
        ),

      lead_fields:
        leadFieldsFromText(
          getValue(
            'gvaLeadFields'
          )
        ),

      handoff_rules: {

        instructions:
          getValue(
            'gvaHandoff'
          )

      }

    };

  }

  async function getAuthenticatedSession() {

    /*
      First try the existing persisted session.
    */

    let result =
      await db.auth.getSession();

    if (result.error) {
      throw result.error;
    }

    let session =
      result.data?.session ||
      null;

    /*
      If the session is temporarily unavailable,
      ask Supabase to refresh it.
    */

    if (!session) {

      const refreshed =
        await db.auth.refreshSession();

      if (refreshed.error) {
        throw refreshed.error;
      }

      session =
        refreshed.data?.session ||
        null;
    }

    if (
      !session ||
      !session.access_token
    ) {

      throw new Error(
        'Login session nahi mili. Pehle Client Dashboard mein login karein, phir Voice AI kholen.'
      );

    }

    return session;

  }

  async function saveVoiceAISettings() {

    const saveButton =
      document.getElementById(
        'glimeVaSave'
      );

    const status =
      document.getElementById(
        'glimeVaStatus'
      );

    if (!saveButton || !status) {
      return;
    }

    saveButton.disabled = true;

    status.textContent =
      'Checking secure login session…';

    status.className =
      'glime-va-status';

    try {

      /*
        IMPORTANT:
        Explicitly obtain the authenticated
        Supabase session before RPC.
      */

      const session =
        await getAuthenticatedSession();

      const incomingButton =
        document.getElementById(
          'gvaIncoming'
        );

      const outboundButton =
        document.getElementById(
          'gvaOutbound'
        );

      const incomingEnabled =
        incomingButton
          ?.classList
          .contains('on') ||
        false;

      const outboundEnabled =
        outboundButton
          ?.classList
          .contains('on') ||
        false;

      const businessProfile =
        buildBusinessProfile();

      /*
        Call the secure client RPC.
      */

      const {
        data,
        error
      } = await db.rpc(
        'client_save_voice_ai_config',
        {

          p_goal:
            getValue(
              'gvaGoal'
            ),

          p_language:
            getValue(
              'gvaLanguage'
            ),

          p_tone:
            getValue(
              'gvaTone'
            ),

          p_greeting:
            getValue(
              'gvaGreeting'
            ),

          p_instructions:
            getValue(
              'gvaInstructions'
            ),

          p_incoming_enabled:
            incomingEnabled,

          p_outbound_enabled:
            outboundEnabled,

          p_business_profile:
            businessProfile

        }
      );

      if (error) {
        throw error;
      }

      if (!data?.success) {

        throw new Error(
          'Settings save nahi hui.'
        );

      }

      status.textContent =
        '✓ Voice AI settings saved successfully.';

      status.className =
        'glime-va-status ok';

      console.log(
        'GLIME Voice AI settings saved for authenticated user:',
        session.user?.id
      );

    } catch (error) {

      console.error(
        'GLIME Voice AI authenticated save error:',
        error
      );

      status.textContent =
        error?.message ||
        'Settings save failed.';

      status.className =
        'glime-va-status err';

    } finally {

      saveButton.disabled =
        false;

    }

  }

  function installFix() {

    const oldButton =
      document.getElementById(
        'glimeVaSave'
      );

    /*
      Existing setup addon may not have
      created the button yet.
    */

    if (!oldButton) {

      setTimeout(
        installFix,
        500
      );

      return;

    }

    /*
      Prevent duplicate installation.
    */

    if (
      oldButton.dataset
        .glimeAuthFix === '1'
    ) {

      return;

    }

    /*
      Clone the existing button.
      This removes the old click listener
      from voice-ai-setup-addon.js while
      preserving its styling and text.
    */

    const newButton =
      oldButton.cloneNode(true);

    newButton.dataset
      .glimeAuthFix = '1';

    oldButton.replaceWith(
      newButton
    );

    /*
      Install the corrected authenticated
      Save handler.
    */

    newButton.addEventListener(
      'click',
      saveVoiceAISettings
    );

    console.log(
      'GLIME Voice AI Auth Fix installed.'
    );

  }

  if (
    document.readyState ===
    'loading'
  ) {

    document.addEventListener(
      'DOMContentLoaded',
      installFix,
      {
        once: true
      }
    );

  } else {

    installFix();

  }

})();
