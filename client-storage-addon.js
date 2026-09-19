(() => {
    'use strict';

    const SUPABASE_URL =
        'https://ufoulgbiqgjriwapuopc.supabase.co';

    const SUPABASE_KEY =
        'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';

    const FUNCTION_URL =
        `${SUPABASE_URL}/functions/v1/client-storage-knowledge`;

    const SECTION_ID =
        'glime-client-storage-addon';

    const escapeHtml = (value) =>
        String(value ?? '')
            .replace(/[&<>"']/g, (char) => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#039;'
            }[char]));

    function formatBytes(bytes) {
        const value = Number(bytes || 0);

        if (value < 1024 * 1024) {
            return `${Math.round(value / 1024)} KB`;
        }

        return `${(value / (1024 * 1024)).toFixed(2)} MB`;
    }

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

        if (error || !data.session) {
            throw new Error(
                'Please sign in again.'
            );
        }

        return {
            client,
            session: data.session
        };
    }

    async function api(
        action,
        payload = {}
    ) {

        const {
            session
        } = await getSession();

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
                'Storage request failed.'
            );
        }

        return result;
    }

    function showStatus(message) {

        const element =
            document.getElementById(
                'gcs-status'
            );

        if (element) {
            element.textContent = message;
        }
    }

    async function refresh() {

        try {

            const summary =
                await api('summary');

            document.getElementById(
                'gcs-used'
            ).textContent =
                formatBytes(
                    summary.used_bytes
                );

            document.getElementById(
                'gcs-reserved'
            ).textContent =
                formatBytes(
                    summary.reserved_bytes
                );

            document.getElementById(
                'gcs-remaining'
            ).textContent =
                formatBytes(
                    summary.remaining_bytes
                );

            document.getElementById(
                'gcs-limit'
            ).textContent =
                formatBytes(
                    summary.quota_bytes
                );

            renderDocuments(
                summary.documents || []
            );

            const knowledge =
                await api(
                    'list_knowledge'
                );

            renderKnowledge(
                knowledge.items || []
            );

        } catch (error) {

            showStatus(
                error.message ||
                'Unable to load storage.'
            );

        }
    }

    function renderDocuments(
        documents
    ) {

        const container =
            document.getElementById(
                'gcs-documents'
            );

        if (!container) {
            return;
        }

        if (!documents.length) {

            container.innerHTML =
                '<div class="gcs-empty">No documents uploaded yet.</div>';

            return;
        }

        container.innerHTML =
            documents
                .map((document) => `
                    <div class="gcs-document">

                        <div>
                            <strong>
                                ${escapeHtml(
                                    document.filename
                                )}
                            </strong>

                            <small>
                                ${formatBytes(
                                    document.size_bytes
                                )}
                                ·
                                ${escapeHtml(
                                    document.category
                                )}
                            </small>
                        </div>

                        <button
                            type="button"
                            data-open-document="${escapeHtml(
                                document.id
                            )}"
                        >
                            Open
                        </button>

                    </div>
                `)
                .join('');

        container
            .querySelectorAll(
                '[data-open-document]'
            )
            .forEach((button) => {

                button.addEventListener(
                    'click',
                    () => {
                        openDocument(
                            button.dataset.openDocument
                        );
                    }
                );

            });
    }

    function renderKnowledge(
        items
    ) {

        const container =
            document.getElementById(
                'gcs-knowledge'
            );

        if (!container) {
            return;
        }

        if (!items.length) {

            container.innerHTML =
                '<div class="gcs-empty">No client knowledge added yet.</div>';

            return;
        }

        container.innerHTML =
            items
                .map((item) => `
                    <div class="gcs-knowledge-item">

                        <strong>
                            ${escapeHtml(
                                item.title
                            )}
                        </strong>

                        <small>
                            ${escapeHtml(
                                item.status
                            )}
                        </small>

                        <p>
                            ${escapeHtml(
                                item.content.slice(
                                    0,
                                    180
                                )
                            )}
                        </p>

                    </div>
                `)
                .join('');
    }

    async function openDocument(
        documentId
    ) {

        try {

            showStatus(
                'Preparing secure document link...'
            );

            const result =
                await api(
                    'signed_url',
                    {
                        document_id:
                            documentId,

                        expires_in:
                            900
                    }
                );

            window.open(
                result.url,
                '_blank',
                'noopener'
            );

            showStatus(
                'Secure document link created.'
            );

        } catch (error) {

            showStatus(
                error.message
            );

        }
    }

    async function uploadFile() {

        const fileInput =
            document.getElementById(
                'gcs-file'
            );

        const category =
            document.getElementById(
                'gcs-category'
            ).value;

        const file =
            fileInput?.files?.[0];

        if (!file) {

            showStatus(
                'Please select a file first.'
            );

            return;
        }

        try {

            showStatus(
                'Checking storage quota...'
            );

            const documentType =
                file.type.startsWith(
                    'image/'
                )
                    ? 'image'
                    : file.type.startsWith(
                        'video/'
                    )
                        ? 'video'
                        : file.type.startsWith(
                            'audio/'
                        )
                            ? 'audio'
                            : 'document';

            const preparation =
                await api(
                    'prepare_upload',
                    {
                        filename:
                            file.name,

                        mime_type:
                            file.type ||
                            'application/octet-stream',

                        size_bytes:
                            file.size,

                        category,

                        document_type:
                            documentType
                    }
                );

            const {
                client
            } = await getSession();

            showStatus(
                'Uploading file...'
            );

            const {
                error
            } =
                await client.storage
                    .from(
                        'client-assets'
                    )
                    .uploadToSignedUrl(
                        preparation.path,
                        preparation.token,
                        file
                    );

            if (error) {
                throw error;
            }

            showStatus(
                'Finalizing upload...'
            );

            await api(
                'complete_upload',
                {
                    reservation_id:
                        preparation.reservation_id,

                    category,

                    document_type:
                        documentType
                }
            );

            fileInput.value = '';

            showStatus(
                'Upload completed successfully.'
            );

            await refresh();

        } catch (error) {

            showStatus(
                error.message ||
                'Upload failed.'
            );

        }
    }

    async function saveKnowledge() {

        const title =
            document.getElementById(
                'gcs-knowledge-title'
            ).value.trim();

        const content =
            document.getElementById(
                'gcs-knowledge-content'
            ).value.trim();

        if (!title || !content) {

            showStatus(
                'Knowledge title and content are required.'
            );

            return;
        }

        try {

            await api(
                'save_knowledge',
                {
                    title,
                    content,
                    source_type:
                        'manual',
                    status:
                        'active'
                }
            );

            document.getElementById(
                'gcs-knowledge-title'
            ).value = '';

            document.getElementById(
                'gcs-knowledge-content'
            ).value = '';

            showStatus(
                'Knowledge saved successfully.'
            );

            await refresh();

        } catch (error) {

            showStatus(
                error.message
            );

        }
    }

    function mount() {

        if (
            document.getElementById(
                SECTION_ID
            )
        ) {
            return;
        }

        const host =
            document.querySelector(
                '.main-content'
            ) ||
            document.querySelector(
                '.dashboard-content'
            ) ||
            document.querySelector(
                'main'
            ) ||
            document.body;

        const section =
            document.createElement(
                'section'
            );

        section.id =
            SECTION_ID;

        section.innerHTML = `

            <div class="gcs-header">

                <div>
                    <h2>
                        Client Storage & Knowledge
                    </h2>

                    <p>
                        Manage private files and
                        client-specific knowledge.
                    </p>
                </div>

            </div>

            <div class="gcs-stats">

                <div>
                    <small>Used</small>
                    <strong id="gcs-used">
                        —
                    </strong>
                </div>

                <div>
                    <small>Reserved</small>
                    <strong id="gcs-reserved">
                        —
                    </strong>
                </div>

                <div>
                    <small>Remaining</small>
                    <strong id="gcs-remaining">
                        —
                    </strong>
                </div>

                <div>
                    <small>Limit</small>
                    <strong id="gcs-limit">
                        —
                    </strong>
                </div>

            </div>

            <div class="gcs-upload">

                <select id="gcs-category">

                    <option value="general">
                        General
                    </option>

                    <option value="business">
                        Business
                    </option>

                    <option value="service">
                        Service
                    </option>

                    <option value="offer">
                        Offer
                    </option>

                    <option value="marketing">
                        Marketing
                    </option>

                    <option value="legal">
                        Legal
                    </option>

                    <option value="knowledge">
                        Knowledge
                    </option>

                    <option value="conversation">
                        Conversation
                    </option>

                </select>

                <input
                    id="gcs-file"
                    type="file"
                >

                <button
                    id="gcs-upload"
                    type="button"
                >
                    Upload File
                </button>

            </div>

            <div id="gcs-status"></div>

            <h3>
                Documents
            </h3>

            <div id="gcs-documents">
                Loading...
            </div>

            <h3>
                Client Knowledge
            </h3>

            <input
                id="gcs-knowledge-title"
                placeholder="Knowledge title"
            >

            <textarea
                id="gcs-knowledge-content"
                placeholder="Business information, FAQ, policies, opening hours..."
            ></textarea>

            <button
                id="gcs-save-knowledge"
                type="button"
            >
                Save Knowledge
            </button>

            <div id="gcs-knowledge"></div>

        `;

        const style =
            document.createElement(
                'style'
            );

        style.textContent = `

            #${SECTION_ID} {
                margin:24px 0;
                padding:20px;
                border:1px solid
                    rgba(184,222,234,.13);
                border-radius:18px;
                background:#101b29;
                color:#f4fbfd;
                font-family:
                    Manrope,
                    system-ui,
                    sans-serif;
            }

            #${SECTION_ID} h2 {
                margin:0 0 6px;
            }

            #${SECTION_ID} h3 {
                margin-top:24px;
            }

            #${SECTION_ID} p,
            #${SECTION_ID} small {
                color:#9cabb9;
            }

            .gcs-stats {
                display:grid;
                grid-template-columns:
                    repeat(4,minmax(0,1fr));
                gap:10px;
                margin:18px 0;
            }

            .gcs-stats > div {
                padding:14px;
                border:1px solid
                    rgba(184,222,234,.13);
                border-radius:12px;
            }

            .gcs-stats small {
                display:block;
            }

            .gcs-stats strong {
                display:block;
                margin-top:4px;
            }

            .gcs-upload {
                display:grid;
                grid-template-columns:
                    1fr 2fr auto;
                gap:10px;
            }

            #${SECTION_ID} input,
            #${SECTION_ID} select,
            #${SECTION_ID} textarea {

                width:100%;
                box-sizing:border-box;
                padding:10px;
                margin:6px 0;

                background:#071016;
                color:#f4fbfd;

                border:1px solid
                    rgba(184,222,234,.13);

                border-radius:8px;
            }

            #${SECTION_ID} textarea {
                min-height:100px;
            }

            #${SECTION_ID} button {

                padding:10px 14px;

                border:1px solid
                    rgba(82,232,255,.45);

                border-radius:8px;

                background:
                    rgba(82,232,255,.08);

                color:#52e8ff;

                font-weight:700;

                cursor:pointer;
            }

            .gcs-document,
            .gcs-knowledge-item {

                display:flex;
                justify-content:
                    space-between;

                gap:12px;

                padding:12px 0;

                border-top:1px solid
                    rgba(184,222,234,.09);
            }

            .gcs-document small {
                display:block;
            }

            .gcs-knowledge-item {
                display:block;
            }

            .gcs-knowledge-item small {
                display:block;
                margin-top:4px;
            }

            @media(max-width:700px) {

                .gcs-stats {
                    grid-template-columns:
                        1fr 1fr;
                }

                .gcs-upload {
                    grid-template-columns:
                        1fr;
                }

            }

        `;

        document.head.appendChild(
            style
        );

        host.appendChild(
            section
        );

        document.getElementById(
            'gcs-upload'
        ).addEventListener(
            'click',
            uploadFile
        );

        document.getElementById(
            'gcs-save-knowledge'
        ).addEventListener(
            'click',
            saveKnowledge
        );

        refresh();
    }

    function start() {

        if (
            document.readyState ===
            'loading'
        ) {

            document.addEventListener(
                'DOMContentLoaded',
                mount,
                {
                    once: true
                }
            );

        } else {

            mount();

        }
    }

    start();

    window.GLIMEClientStorage = {
        refresh
    };

})();
