(() => {
    'use strict';

    const SUPABASE_URL =
        'https://ufoulgbiqgjriwapuopc.supabase.co';

    const SUPABASE_KEY =
        'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';

    const FUNCTION_URL =
        `${SUPABASE_URL}/functions/v1/client-storage-admin`;

    const ADMIN_EMAIL =
        'admin@glime.online';

    const SECTION_ID =
        'glime-admin-storage-quota';

    async function getSession() {

        const client =
            window.supabase.createClient(
                SUPABASE_URL,
                SUPABASE_KEY
            );

        const {
            data,
            error
        } =
            await client.auth.getSession();

        if (
            error ||
            !data.session
        ) {
            throw new Error(
                'Admin session required.'
            );
        }

        const email =
            (
                data.session.user.email ||
                ''
            )
                .trim()
                .toLowerCase();

        if (
            email !==
            ADMIN_EMAIL.toLowerCase()
        ) {
            throw new Error(
                'Admin access required.'
            );
        }

        return data.session;
    }

    async function api(
        action,
        payload = {}
    ) {

        const session =
            await getSession();

        const response =
            await fetch(
                FUNCTION_URL,
                {
                    method: 'POST',

                    headers: {
                        Authorization:
                            `Bearer ${session.access_token}`,

                        'Content-Type':
                            'application/json'
                    },

                    body: JSON.stringify({
                        action,
                        ...payload
                    })
                }
            );

        const result =
            await response
                .json()
                .catch(() => ({}));

        if (
            !response.ok ||
            result.ok === false
        ) {
            throw new Error(
                result.error ||
                'Admin request failed.'
            );
        }

        return result;
    }

    function formatMB(
        bytes
    ) {

        return (
            Number(bytes || 0) /
            1048576
        ).toFixed(2) + ' MB';

    }

    function mount() {

        if (
            document.getElementById(
                SECTION_ID
            )
        ) {
            return;
        }

        const controlRoom =
            document.getElementById(
                'control-room'
            );

        if (!controlRoom) {
            return;
        }

        const section =
            document.createElement(
                'div'
            );

        section.id =
            SECTION_ID;

        section.innerHTML = `

            <div class="gas-title">
                Client Storage Quota
            </div>

            <p class="gas-description">
                Manage the storage quota assigned
                to a GLIME client.
            </p>

            <div class="gas-row">

                <input
                    id="gas-client-id"
                    type="text"
                    placeholder="GLM-0001"
                >

                <input
                    id="gas-limit"
                    type="number"
                    min="1"
                    step="1"
                    value="100"
                    placeholder="Limit in MB"
                >

                <button
                    id="gas-load"
                    type="button"
                >
                    Load
                </button>

                <button
                    id="gas-save"
                    type="button"
                >
                    Save Limit
                </button>

            </div>

            <div
                id="gas-message"
                class="gas-message"
            ></div>

        `;

        const style =
            document.createElement(
                'style'
            );

        style.textContent = `

            #${SECTION_ID} {

                margin-top:22px;
                padding-top:20px;

                border-top:1px solid
                    rgba(255,255,255,.09);

            }

            #${SECTION_ID} .gas-title {

                color:#ff9f43;

                font-weight:700;

                font-size:1rem;

            }

            #${SECTION_ID}
            .gas-description {

                color:#9ba7b7;

                font-size:.78rem;

                margin:6px 0 12px;

            }

            #${SECTION_ID} .gas-row {

                display:grid;

                grid-template-columns:
                    1fr 1fr auto auto;

                gap:8px;

            }

            #${SECTION_ID} input {

                width:100%;

                box-sizing:border-box;

                padding:10px;

                background:#0c1420;

                color:#fff;

                border:1px solid
                    rgba(255,255,255,.09);

                border-radius:8px;

            }

            #${SECTION_ID} button {

                padding:10px 14px;

                background:#00ff88;

                color:#06100b;

                border:0;

                border-radius:8px;

                font-weight:700;

                cursor:pointer;

            }

            #${SECTION_ID}
            .gas-message {

                margin-top:10px;

                color:#9ba7b7;

                font-size:.78rem;

            }

            @media(max-width:650px) {

                #${SECTION_ID} .gas-row {

                    grid-template-columns:
                        1fr 1fr;

                }

            }

        `;

        document.head.appendChild(
            style
        );

        controlRoom.appendChild(
            section
        );

        document.getElementById(
            'gas-load'
        ).addEventListener(
            'click',
            loadQuota
        );

        document.getElementById(
            'gas-save'
        ).addEventListener(
            'click',
            saveQuota
        );
    }

    async function loadQuota() {

        const clientId =
            document.getElementById(
                'gas-client-id'
            ).value.trim();

        if (!clientId) {
            showMessage(
                'Enter a Client ID first.'
            );
            return;
        }

        try {

            showMessage(
                'Loading storage information...'
            );

            const result =
                await api(
                    'summary',
                    {
                        client_id:
                            clientId
                    }
                );

            document.getElementById(
                'gas-limit'
            ).value =
                Math.round(
                    Number(
                        result.quota_bytes
                    ) / 1048576
                );

            showMessage(
                `Used: ${formatMB(
                    result.used_bytes
                )} · Remaining: ${formatMB(
                    result.remaining_bytes
                )} · Limit: ${formatMB(
                    result.quota_bytes
                )}`
            );

        } catch (error) {

            showMessage(
                error.message
            );
        }
    }

    async function saveQuota() {

        const clientId =
            document.getElementById(
                'gas-client-id'
            ).value.trim();

        const mb =
            Number(
                document.getElementById(
                    'gas-limit'
                ).value
            );

        if (!clientId) {

            showMessage(
                'Enter a Client ID first.'
            );

            return;
        }

        if (
            !Number.isFinite(mb) ||
            mb < 1
        ) {

            showMessage(
                'Storage limit must be at least 1 MB.'
            );

            return;
        }

        try {

            showMessage(
                'Saving storage quota...'
            );

            await api(
                'set_quota',
                {
                    client_id:
                        clientId,

                    quota_bytes:
                        Math.round(
                            mb * 1048576
                        ),

                    max_file_bytes:
                        Math.min(
                            25 * 1048576,
                            Math.round(
                                mb * 1048576
                            )
                        )
                }
            );

            showMessage(
                `Storage limit updated to ${mb} MB.`
            );

            await loadQuota();

        } catch (error) {

            showMessage(
                error.message
            );
        }
    }

    function showMessage(
        message
    ) {

        const element =
            document.getElementById(
                'gas-message'
            );

        if (element) {
            element.textContent =
                message;
        }
    }

    function start() {

        if (
            document.getElementById(
                'control-room'
            )
        ) {

            mount();

        }
    }

    if (
        document.readyState ===
        'loading'
    ) {

        document.addEventListener(
            'DOMContentLoaded',
            start,
            {
                once: true
            }
        );

    } else {

        start();

    }

    window.GLIMEAdminStorage = {
        refresh: loadQuota
    };

})();
