/* =========================================================
   GLIME — VOICE AI CALL HISTORY
   ---------------------------------------------------------
   Client-side dashboard add-on.
   - Does NOT replace dashboard.html
   - Reads only the authenticated client's Voice AI data
   - Shows call stats, call history and transcript details
========================================================= */

(() => {
    'use strict';

    const SUPABASE_URL =
        'https://ufoulgbiqgjriwapuopc.supabase.co';

    const SUPABASE_KEY =
        'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';

    const db = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY
    );

    let currentClient = null;
    let currentCalls = [];

    const STYLE_ID = 'glime-voice-calls-style';
    const CARD_ID = 'glime-voice-calls-addon';

    /* =====================================================
       STYLES
    ====================================================== */

    function injectStyles() {

        if (document.getElementById(STYLE_ID)) {
            return;
        }

        const style = document.createElement('style');

        style.id = STYLE_ID;

        style.textContent = `

            #${CARD_ID} {
                margin-top: 30px;
            }

            .glime-vc-card {
                background: #111827;
                padding: 24px;
                border-radius: 15px;
                border: 1px solid rgba(255,255,255,.06);
                box-shadow: 0 10px 30px rgba(0,0,0,.35);
            }

            .glime-vc-head {
                display:flex;
                justify-content:space-between;
                align-items:flex-start;
                gap:16px;
                margin-bottom:18px;
                flex-wrap:wrap;
            }

            .glime-vc-title {
                color:#00f0ff;
                font-size:1.2rem;
                font-weight:700;
            }

            .glime-vc-subtitle {
                color:#9ca3af;
                font-size:.82rem;
                margin-top:5px;
            }

            .glime-vc-refresh {
                border:1px solid rgba(0,240,255,.25);
                background:rgba(0,240,255,.06);
                color:#00f0ff;
                border-radius:9px;
                padding:9px 13px;
                font-weight:700;
                cursor:pointer;
            }

            .glime-vc-refresh:disabled {
                opacity:.5;
                cursor:not-allowed;
            }

            .glime-vc-stats {
                display:grid;
                grid-template-columns:repeat(4,1fr);
                gap:12px;
                margin-bottom:20px;
            }

            .glime-vc-stat {
                background:rgba(255,255,255,.025);
                border:1px solid rgba(255,255,255,.05);
                border-radius:11px;
                padding:15px;
            }

            .glime-vc-stat-value {
                color:#50f5a8;
                font-size:1.35rem;
                font-weight:800;
            }

            .glime-vc-stat-label {
                color:#9ca3af;
                font-size:.72rem;
                margin-top:3px;
            }

            .glime-vc-status {
                color:#9ca3af;
                font-size:.82rem;
                padding:10px 0;
            }

            .glime-vc-table-wrap {
                overflow-x:auto;
                border:1px solid rgba(255,255,255,.05);
                border-radius:11px;
            }

            .glime-vc-table {
                width:100%;
                border-collapse:collapse;
                min-width:720px;
            }

            .glime-vc-table th {
                color:#9ca3af;
                font-size:.7rem;
                text-transform:uppercase;
                letter-spacing:.04em;
                text-align:left;
                padding:12px;
                background:rgba(255,255,255,.025);
            }

            .glime-vc-table td {
                color:#fff;
                font-size:.78rem;
                padding:12px;
                border-top:1px solid rgba(255,255,255,.05);
                vertical-align:middle;
            }

            .glime-vc-table tr:hover td {
                background:rgba(0,240,255,.025);
            }

            .glime-vc-direction {
                display:inline-flex;
                align-items:center;
                gap:5px;
                padding:4px 8px;
                border-radius:999px;
                font-size:.68rem;
                font-weight:800;
            }

            .glime-vc-inbound {
                color:#52e8ff;
                background:rgba(82,232,255,.09);
            }

            .glime-vc-outbound {
                color:#50f5a8;
                background:rgba(80,245,168,.09);
            }

            .glime-vc-open {
                border:1px solid rgba(80,245,168,.25);
                background:rgba(80,245,168,.06);
                color:#50f5a8;
                border-radius:7px;
                padding:6px 9px;
                cursor:pointer;
                font-weight:700;
                font-size:.7rem;
            }

            .glime-vc-empty {
                text-align:center;
                color:#9ca3af;
                padding:28px 12px;
                font-size:.82rem;
            }

            #glimeVoiceCallModal {
                position:fixed;
                inset:0;
                z-index:99999;
                display:none;
                align-items:center;
                justify-content:center;
                padding:16px;
                background:rgba(0,0,0,.72);
            }

            #glimeVoiceCallModal.visible {
                display:flex;
            }

            .glime-vc-modal {
                width:min(850px,100%);
                max-height:90vh;
                overflow:auto;
                background:#081019;
                border:1px solid rgba(82,232,255,.2);
                border-radius:16px;
                padding:22px;
                box-shadow:0 20px 70px rgba(0,0,0,.55);
            }

            .glime-vc-modal-head {
                display:flex;
                justify-content:space-between;
                gap:12px;
                align-items:flex-start;
                margin-bottom:18px;
            }

            .glime-vc-modal-title {
                color:#52e8ff;
                font-size:1.15rem;
                font-weight:800;
            }

            .glime-vc-close {
                border:0;
                background:rgba(255,255,255,.06);
                color:#fff;
                border-radius:8px;
                padding:7px 10px;
                cursor:pointer;
            }

            .glime-vc-detail-grid {
                display:grid;
                grid-template-columns:repeat(2,1fr);
                gap:10px;
                margin-bottom:18px;
            }

            .glime-vc-detail {
                background:rgba(255,255,255,.025);
                border:1px solid rgba(255,255,255,.05);
                border-radius:9px;
                padding:11px;
            }

            .glime-vc-detail-label {
                color:#9ca3af;
                font-size:.67rem;
                margin-bottom:3px;
            }

            .glime-vc-detail-value {
                color:#fff;
                font-size:.78rem;
                word-break:break-word;
            }

            .glime-vc-section-title {
                color:#50f5a8;
                font-size:.9rem;
                font-weight:800;
                margin:18px 0 9px;
            }

            .glime-vc-summary {
                color:#dbe7ec;
                background:rgba(255,255,255,.025);
                border-radius:10px;
                padding:13px;
                font-size:.8rem;
                line-height:1.6;
                white-space:pre-wrap;
            }

            .glime-vc-transcript {
                display:flex;
                flex-direction:column;
                gap:9px;
            }

            .glime-vc-message {
                padding:10px 12px;
                border-radius:10px;
                line-height:1.55;
                font-size:.78rem;
                white-space:pre-wrap;
            }

            .glime-vc-message-user {
                background:rgba(82,232,255,.07);
                border-left:3px solid #52e8ff;
            }

            .glime-vc-message-assistant {
                background:rgba(80,245,168,.07);
                border-left:3px solid #50f5a8;
            }

            .glime-vc-message-role {
                color:#9ca3af;
                font-size:.65rem;
                text-transform:uppercase;
                margin-bottom:3px;
                font-weight:800;
            }

            .glime-vc-recording {
                display:inline-block;
                color:#50f5a8;
                font-size:.78rem;
                font-weight:700;
                text-decoration:none;
            }

            @media (max-width: 700px) {

                .glime-vc-card {
                    padding:18px 14px;
                }

                .glime-vc-stats {
                    grid-template-columns:repeat(2,1fr);
                }

                .glime-vc-detail-grid {
                    grid-template-columns:1fr;
                }

            }

        `;

        document.head.appendChild(style);
    }

    /* =====================================================
       HELPERS
    ====================================================== */

    function formatDate(value) {

        if (!value) {
            return '—';
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return '—';
        }

        return date.toLocaleString('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'short'
        });
    }

    function formatDuration(seconds) {

        const total = Number(seconds || 0);

        if (!Number.isFinite(total) || total <= 0) {
            return '—';
        }

        const mins = Math.floor(total / 60);

        const secs = Math.round(total % 60);

        if (mins === 0) {
            return `${secs}s`;
        }

        return `${mins}m ${String(secs).padStart(2, '0')}s`;
    }

    function escapeHtml(value) {

        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    /* =====================================================
       CLIENT
    ====================================================== */

    async function getClient() {

        const {
            data,
            error
        } = await db.auth.getSession();

        if (error) {
            throw error;
        }

        const user = data?.session?.user;

        if (!user) {
            return null;
        }

        let result = await db
            .from('client_data')
            .select(`
                client_id,
                auth_user_id,
                email,
                client_name,
                full_name,
                name
            `)
            .eq(
                'auth_user_id',
                user.id
            )
            .maybeSingle();

        if (result.error) {
            throw result.error;
        }

        if (!result.data && user.email) {

            result = await db
                .from('client_data')
                .select(`
                    client_id,
                    auth_user_id,
                    email,
                    client_name,
                    full_name,
                    name
                `)
                .ilike(
                    'email',
                    user.email
                        .trim()
                        .toLowerCase()
                )
                .limit(1)
                .maybeSingle();

            if (result.error) {
                throw result.error;
            }

        }

        return result.data || null;
    }

    /* =====================================================
       DASHBOARD CARD
    ====================================================== */

    function renderShell() {

        if (
            document.getElementById(CARD_ID)
        ) {
            return;
        }

        const main =
            document.querySelector(
                '.main-content'
            );

        if (!main) {
            return;
        }

        const card =
            document.createElement(
                'section'
            );

        card.id = CARD_ID;

        card.innerHTML = `

            <div class="glime-vc-card">

                <div class="glime-vc-head">

                    <div>

                        <div class="glime-vc-title">
                            🎙️ Voice AI — Call History
                        </div>

                        <div class="glime-vc-subtitle">
                            Your Voice AI call activity,
                            summaries and transcripts.
                        </div>

                    </div>

                    <button
                        type="button"
                        id="glimeVoiceCallRefresh"
                        class="glime-vc-refresh"
                    >
                        ↻ Refresh
                    </button>

                </div>

                <div class="glime-vc-stats">

                    <div class="glime-vc-stat">

                        <div
                            id="glimeVoiceTotal"
                            class="glime-vc-stat-value"
                        >
                            0
                        </div>

                        <div class="glime-vc-stat-label">
                            Total Calls
                        </div>

                    </div>

                    <div class="glime-vc-stat">

                        <div
                            id="glimeVoiceInbound"
                            class="glime-vc-stat-value"
                        >
                            0
                        </div>

                        <div class="glime-vc-stat-label">
                            Incoming
                        </div>

                    </div>

                    <div class="glime-vc-stat">

                        <div
                            id="glimeVoiceOutbound"
                            class="glime-vc-stat-value"
                        >
                            0
                        </div>

                        <div class="glime-vc-stat-label">
                            Outgoing
                        </div>

                    </div>

                    <div class="glime-vc-stat">

                        <div
                            id="glimeVoiceDuration"
                            class="glime-vc-stat-value"
                        >
                            0m
                        </div>

                        <div class="glime-vc-stat-label">
                            Talk Time
                        </div>

                    </div>

                </div>

                <div
                    id="glimeVoiceCallStatus"
                    class="glime-vc-status"
                >
                    Loading Voice AI calls…
                </div>

                <div class="glime-vc-table-wrap">

                    <table class="glime-vc-table">

                        <thead>

                            <tr>

                                <th>Date</th>
                                <th>Direction</th>
                                <th>Phone</th>
                                <th>Duration</th>
                                <th>Intent</th>
                                <th>Outcome</th>
                                <th></th>

                            </tr>

                        </thead>

                        <tbody
                            id="glimeVoiceCallRows"
                        ></tbody>

                    </table>

                </div>

            </div>

        `;

        main.appendChild(card);

        document
            .getElementById(
                'glimeVoiceCallRefresh'
            )
            ?.addEventListener(
                'click',
                loadCalls
            );
    }

    /* =====================================================
       STATS
    ====================================================== */

    function updateStats(calls) {

        const inbound =
            calls.filter(
                call =>
                    String(
                        call.direction
                    ).toLowerCase() ===
                    'inbound'
            ).length;

        const outbound =
            calls.filter(
                call =>
                    String(
                        call.direction
                    ).toLowerCase() ===
                    'outbound'
            ).length;

        const totalSeconds =
            calls.reduce(
                (sum, call) =>
                    sum +
                    Number(
                        call.duration_seconds || 0
                    ),
                0
            );

        const minutes =
            Math.floor(
                totalSeconds / 60
            );

        const seconds =
            Math.round(
                totalSeconds % 60
            );

        document
            .getElementById(
                'glimeVoiceTotal'
            )
            .textContent =
            String(calls.length);

        document
            .getElementById(
                'glimeVoiceInbound'
            )
            .textContent =
            String(inbound);

        document
            .getElementById(
                'glimeVoiceOutbound'
            )
            .textContent =
            String(outbound);

        document
            .getElementById(
                'glimeVoiceDuration'
            )
            .textContent =
            minutes > 0
                ? `${minutes}m`
                : `${seconds}s`;
    }

    /* =====================================================
       RENDER CALLS
    ====================================================== */

    function renderCalls(calls) {

        const tbody =
            document.getElementById(
                'glimeVoiceCallRows'
            );

        if (!tbody) {
            return;
        }

        if (!calls.length) {

            tbody.innerHTML = `

                <tr>

                    <td colspan="7">

                        <div class="glime-vc-empty">
                            No Voice AI calls recorded yet.
                        </div>

                    </td>

                </tr>

            `;

            return;
        }

        tbody.innerHTML =
            calls
                .map(
                    (call, index) => {

                        const direction =
                            String(
                                call.direction ||
                                'unknown'
                            ).toLowerCase();

                        const inbound =
                            direction ===
                            'inbound';

                        return `

                            <tr>

                                <td>
                                    ${escapeHtml(
                                        formatDate(
                                            call.created_at ||
                                            call.started_at
                                        )
                                    )}
                                </td>

                                <td>

                                    <span
                                        class="
                                            glime-vc-direction
                                            ${
                                                inbound
                                                    ? 'glime-vc-inbound'
                                                    : 'glime-vc-outbound'
                                            }
                                        "
                                    >
                                        ${
                                            inbound
                                                ? '↙ Incoming'
                                                : '↗ Outgoing'
                                        }
                                    </span>

                                </td>

                                <td>
                                    ${escapeHtml(
                                        call.caller_phone ||
                                        '—'
                                    )}
                                </td>

                                <td>
                                    ${escapeHtml(
                                        formatDuration(
                                            call.duration_seconds
                                        )
                                    )}
                                </td>

                                <td>
                                    ${escapeHtml(
                                        call.intent ||
                                        '—'
                                    )}
                                </td>

                                <td>
                                    ${escapeHtml(
                                        call.outcome ||
                                        '—'
                                    )}
                                </td>

                                <td>

                                    <button
                                        type="button"
                                        class="glime-vc-open"
                                        data-call-index="${index}"
                                    >
                                        View
                                    </button>

                                </td>

                            </tr>

                        `;

                    }
                )
                .join('');

        tbody
            .querySelectorAll(
                '.glime-vc-open'
            )
            .forEach(
                button => {

                    button.addEventListener(
                        'click',
                        () => {

                            const index =
                                Number(
                                    button.dataset
                                        .callIndex
                                );

                            openCall(
                                calls[index]
                            );

                        }
                    );

                }
            );
    }

    /* =====================================================
       LOAD CALLS
    ====================================================== */

    async function loadCalls() {

        const status =
            document.getElementById(
                'glimeVoiceCallStatus'
            );

        const refresh =
            document.getElementById(
                'glimeVoiceCallRefresh'
            );

        if (status) {

            status.textContent =
                'Loading Voice AI calls…';
        }

        if (refresh) {
            refresh.disabled = true;
        }

        try {

            if (!currentClient?.client_id) {

                currentClient =
                    await getClient();
            }

            if (
                !currentClient?.client_id
            ) {

                if (status) {

                    status.textContent =
                        'Client profile could not be resolved.';
                }

                return;
            }

            const {
                data,
                error
            } =
                await db
                    .from(
                        'voice_agent_calls'
                    )
                    .select(`
                        id,
                        conversation_id,
                        client_id,
                        provider,
                        provider_call_id,
                        caller_phone,
                        direction,
                        duration_seconds,
                        intent,
                        outcome,
                        lead_data,
                        appointment_data,
                        summary,
                        recording_url,
                        started_at,
                        ended_at,
                        created_at
                    `)
                    .eq(
                        'client_id',
                        currentClient.client_id
                    )
                    .order(
                        'created_at',
                        {
                            ascending: false
                        }
                    )
                    .limit(50);

            if (error) {
                throw error;
            }

            currentCalls =
                data || [];

            updateStats(
                currentCalls
            );

            renderCalls(
                currentCalls
            );

            if (status) {

                status.textContent =
                    currentCalls.length
                        ? `Showing latest ${currentCalls.length} Voice AI call${currentCalls.length === 1 ? '' : 's'}.`
                        : 'No Voice AI calls recorded yet.';
            }

        } catch (error) {

            console.error(
                'GLIME Voice Call History:',
                error
            );

            if (status) {

                status.textContent =
                    'Unable to load Voice AI call history.';
            }

        } finally {

            if (refresh) {
                refresh.disabled = false;
            }

        }
    }

    /* =====================================================
       MODAL
    ====================================================== */

    function ensureModal() {

        if (
            document.getElementById(
                'glimeVoiceCallModal'
            )
        ) {
            return;
        }

        const modal =
            document.createElement(
                'div'
            );

        modal.id =
            'glimeVoiceCallModal';

        modal.innerHTML = `

            <div class="glime-vc-modal">

                <div class="glime-vc-modal-head">

                    <div class="glime-vc-modal-title">
                        Voice AI Call Details
                    </div>

                    <button
                        type="button"
                        id="glimeVoiceCallClose"
                        class="glime-vc-close"
                    >
                        ✕
                    </button>

                </div>

                <div
                    id="glimeVoiceCallDetails"
                >
                    Loading…
                </div>

            </div>

        `;

        document.body.appendChild(
            modal
        );

        document
            .getElementById(
                'glimeVoiceCallClose'
            )
            ?.addEventListener(
                'click',
                closeModal
            );

        modal.addEventListener(
            'click',
            event => {

                if (
                    event.target ===
                    modal
                ) {
                    closeModal();
                }

            }
        );
    }

    /* =====================================================
       OPEN CALL
    ====================================================== */

    async function openCall(call) {

        ensureModal();

        const modal =
            document.getElementById(
                'glimeVoiceCallModal'
            );

        const details =
            document.getElementById(
                'glimeVoiceCallDetails'
            );

        if (
            !modal ||
            !details
        ) {
            return;
        }

        modal.classList.add(
            'visible'
        );

        details.innerHTML = `

            <div class="glime-vc-status">
                Loading transcript…
            </div>

        `;

        let messages = [];

        if (
            call.conversation_id
        ) {

            const result =
                await db
                    .from(
                        'voice_messages'
                    )
                    .select(`
                        id,
                        role,
                        message_text,
                        created_at
                    `)
                    .eq(
                        'conversation_id',
                        call.conversation_id
                    )
                    .order(
                        'created_at',
                        {
                            ascending: true
                        }
                    );

            if (!result.error) {

                messages =
                    result.data || [];
            }
        }

        const leadData =
            call.lead_data &&
            typeof call.lead_data ===
                'object'
                ? JSON.stringify(
                    call.lead_data,
                    null,
                    2
                )
                : String(
                    call.lead_data ||
                    '—'
                );

        const appointmentData =
            call.appointment_data &&
            typeof call.appointment_data ===
                'object'
                ? JSON.stringify(
                    call.appointment_data,
                    null,
                    2
                )
                : String(
                    call.appointment_data ||
                    '—'
                );

        const transcript =
            messages.length
                ? messages
                    .map(
                        message => {

                            const isUser =
                                String(
                                    message.role
                                ).toLowerCase() ===
                                'user';

                            return `

                                <div
                                    class="
                                        glime-vc-message
                                        ${
                                            isUser
                                                ? 'glime-vc-message-user'
                                                : 'glime-vc-message-assistant'
                                        }
                                    "
                                >

                                    <div
                                        class="glime-vc-message-role"
                                    >
                                        ${
                                            isUser
                                                ? 'Customer'
                                                : 'Voice AI'
                                        }
                                    </div>

                                    ${escapeHtml(
                                        message.message_text
                                    )}

                                </div>

                            `;

                        }
                    )
                    .join('')
                : `

                    <div class="glime-vc-status">
                        Transcript is not available for this call.
                    </div>

                `;

        details.innerHTML = `

            <div class="glime-vc-detail-grid">

                <div class="glime-vc-detail">

                    <div class="glime-vc-detail-label">
                        Date
                    </div>

                    <div class="glime-vc-detail-value">
                        ${escapeHtml(
                            formatDate(
                                call.created_at ||
                                call.started_at
                            )
                        )}
                    </div>

                </div>

                <div class="glime-vc-detail">

                    <div class="glime-vc-detail-label">
                        Direction
                    </div>

                    <div class="glime-vc-detail-value">
                        ${escapeHtml(
                            call.direction ||
                            '—'
                        )}
                    </div>

                </div>

                <div class="glime-vc-detail">

                    <div class="glime-vc-detail-label">
                        Phone
                    </div>

                    <div class="glime-vc-detail-value">
                        ${escapeHtml(
                            call.caller_phone ||
                            '—'
                        )}
                    </div>

                </div>

                <div class="glime-vc-detail">

                    <div class="glime-vc-detail-label">
                        Duration
                    </div>

                    <div class="glime-vc-detail-value">
                        ${escapeHtml(
                            formatDuration(
                                call.duration_seconds
                            )
                        )}
                    </div>

                </div>

                <div class="glime-vc-detail">

                    <div class="glime-vc-detail-label">
                        Intent
                    </div>

                    <div class="glime-vc-detail-value">
                        ${escapeHtml(
                            call.intent ||
                            '—'
                        )}
                    </div>

                </div>

                <div class="glime-vc-detail">

                    <div class="glime-vc-detail-label">
                        Outcome
                    </div>

                    <div class="glime-vc-detail-value">
                        ${escapeHtml(
                            call.outcome ||
                            '—'
                        )}
                    </div>

                </div>

            </div>

            <div class="glime-vc-section-title">
                📝 Call Summary
            </div>

            <div class="glime-vc-summary">
                ${escapeHtml(
                    call.summary ||
                    'No summary available.'
                )}
            </div>

            <div class="glime-vc-section-title">
                🎯 Lead Data
            </div>

            <div class="glime-vc-summary">
                ${escapeHtml(
                    leadData
                )}
            </div>

            <div class="glime-vc-section-title">
                📅 Appointment
            </div>

            <div class="glime-vc-summary">
                ${escapeHtml(
                    appointmentData
                )}
            </div>

            <div class="glime-vc-section-title">
                💬 Transcript
            </div>

            <div class="glime-vc-transcript">
                ${transcript}
            </div>

            ${
                call.recording_url
                    ? `
                        <div class="glime-vc-section-title">
                            🎙️ Recording
                        </div>

                        <a
                            class="glime-vc-recording"
                            href="${escapeHtml(
                                call.recording_url
                            )}"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            ▶ Open recording
                        </a>
                    `
                    : ''
            }

        `;
    }

    /* =====================================================
       CLOSE MODAL
    ====================================================== */

    function closeModal() {

        document
            .getElementById(
                'glimeVoiceCallModal'
            )
            ?.classList.remove(
                'visible'
            );
    }

    /* =====================================================
       INIT
    ====================================================== */

    function init() {

        if (!window.supabase) {

            console.error(
                'GLIME Voice Call History: Supabase unavailable.'
            );

            return;
        }

        injectStyles();

        renderShell();

        ensureModal();

        loadCalls();
    }

    if (
        document.readyState ===
        'loading'
    ) {

        document.addEventListener(
            'DOMContentLoaded',
            init,
            {
                once: true
            }
        );

    } else {

        init();

    }

})();

               
