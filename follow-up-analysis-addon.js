(function () {
    "use strict";

    /*
     * GLIME Follow-up Specialist
     * Conversation Analysis Add-on
     *
     * This file extends follow-up.js without modifying its core logic.
     * Responsibilities:
     * - Load follow-up cases
     * - Run conversation analysis
     * - Display AI conclusions
     * - Display proposed lead changes
     * - Allow client editing
     * - Allow client approval
     * - Apply approved changes to the Lead
     */

    const SUPABASE_URL = "https://ufoulgbiqgjriwapuopc.supabase.co";
    const SUPABASE_KEY = "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";
    const FUNCTION_URL =
        `${SUPABASE_URL}/functions/v1/follow-up-specialist`;

    let supabaseClient = null;
    let clientId = null;
    let cases = [];
    let changes = [];
    let leads = [];

    function getSupabase() {
        if (supabaseClient) return supabaseClient;

        if (!window.supabase || !window.supabase.createClient) {
            throw new Error("Supabase client is not available.");
        }

        supabaseClient = window.supabase.createClient(
            SUPABASE_URL,
            SUPABASE_KEY
        );

        return supabaseClient;
    }

    async function getSession() {
        const supabase = getSupabase();

        const {
            data,
            error
        } = await supabase.auth.getSession();

        if (error) {
            throw error;
        }

        if (!data || !data.session) {
            throw new Error("Authentication session not found.");
        }

        return data.session;
    }

    async function getClientId() {
        if (clientId) return clientId;

        const supabase = getSupabase();
        const session = await getSession();

        const {
            data,
            error
        } = await supabase
            .from("client_data")
            .select("client_id")
            .eq("user_id", session.user.id)
            .maybeSingle();

        if (error) {
            throw error;
        }

        if (!data || !data.client_id) {
            throw new Error("Client profile was not found.");
        }

        clientId = data.client_id;

        return clientId;
    }

    async function api(action, payload = {}) {
        const session = await getSession();

        const response = await fetch(FUNCTION_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${session.access_token}`,
                "apikey": SUPABASE_KEY
            },
            body: JSON.stringify({
                action,
                ...payload
            })
        });

        let result = null;

        try {
            result = await response.json();
        } catch {
            throw new Error("Invalid response from Follow-up Specialist.");
        }

        if (!response.ok) {
            throw new Error(
                result?.error ||
                result?.message ||
                "Follow-up Specialist request failed."
            );
        }

        return result;
    }

    async function loadCases() {
        const supabase = getSupabase();
        const id = await getClientId();

        const {
            data,
            error
        } = await supabase
            .from("follow_up_cases")
            .select("*")
            .eq("client_id", id)
            .order("created_at", { ascending: false });

        if (error) {
            throw error;
        }

        cases = data || [];

        return cases;
    }

    async function loadChanges() {
        const supabase = getSupabase();
        const id = await getClientId();

        const {
            data,
            error
        } = await supabase
            .from("follow_up_proposed_changes")
            .select("*")
            .eq("client_id", id)
            .order("created_at", { ascending: false });

        if (error) {
            throw error;
        }

        changes = data || [];

        return changes;
    }

    async function loadLeads() {
        const supabase = getSupabase();
        const id = await getClientId();

        const {
            data,
            error
        } = await supabase
            .from("leads")
            .select(`
                id,
                name,
                mobile,
                whatsapp,
                status,
                priority,
                interest,
                product_service,
                budget,
                next_follow_up_at,
                notes
            `)
            .eq("client_id", id);

        if (error) {
            throw error;
        }

        leads = data || [];

        return leads;
    }

    function installPanel() {
        if (document.getElementById("glime-followup-analysis-addon")) {
            return;
        }

        const panel = document.createElement("section");

        panel.id = "glime-followup-analysis-addon";

        panel.innerHTML = `
            <div class="glime-addon-card">
                <div class="glime-addon-header">
                    <div>
                        <div class="glime-addon-eyebrow">
                            FOLLOW-UP INTELLIGENCE
                        </div>

                        <h2>Conversation Analysis</h2>

                        <p>
                            Analyze specialist conversations and review
                            AI-proposed lead updates before applying them.
                        </p>
                    </div>

                    <button
                        type="button"
                        class="glime-addon-refresh"
                        data-addon-action="refresh"
                    >
                        Refresh
                    </button>
                </div>

                <div id="glime-addon-status"></div>

                <div id="glime-addon-cases"></div>

                <div id="glime-addon-changes"></div>
            </div>
        `;

        const existingChangesList =
            document.getElementById("changesList");

        if (existingChangesList) {
            const parent = existingChangesList.closest(
                "section, .card, .panel, .dashboard-card"
            );

            if (parent && parent.parentNode) {
                parent.parentNode.insertBefore(panel, parent);
                return;
            }
        }

        const main =
            document.querySelector("main") ||
            document.querySelector(".container") ||
            document.body;

        main.prepend(panel);
    }

    function setStatus(message, type = "info") {
        const element =
            document.getElementById("glime-addon-status");

        if (!element) return;

        element.innerHTML = `
            <div class="glime-addon-status ${escapeHtml(type)}">
                ${escapeHtml(message)}
            </div>
        `;
    }

    function renderCases() {
        const container =
            document.getElementById("glime-addon-cases");

        if (!container) return;

        const pendingCases = cases.filter((item) => {
            return (
                item.status !== "applied" &&
                item.status !== "concluded"
            );
        });

        if (!pendingCases.length) {
            container.innerHTML = `
                <div class="glime-addon-empty">
                    <strong>No pending conversation analyses</strong>
                    <span>
                        Follow-up cases requiring analysis will appear here.
                    </span>
                </div>
            `;

            return;
        }

        container.innerHTML = `
            <div class="glime-addon-section-title">
                Pending Cases
            </div>

            <div class="glime-addon-case-list">
                ${pendingCases.map((item) => {
                    const lead = findLead(item.lead_id);

                    return `
                        <div class="glime-addon-case">
                            <div class="glime-addon-case-info">
                                <strong>
                                    ${escapeHtml(
                                        lead?.name ||
                                        `Lead ${item.lead_id || ""}`
                                    )}
                                </strong>

                                <span>
                                    Case:
                                    ${escapeHtml(item.id || "")}
                                </span>

                                <span>
                                    Status:
                                    ${escapeHtml(item.status || "pending")}
                                </span>
                            </div>

                            <button
                                type="button"
                                class="glime-addon-primary"
                                data-addon-action="analyze"
                                data-case-id="${escapeHtml(item.id)}"
                            >
                                Analyze Conversation
                            </button>
                        </div>
                    `;
                }).join("")}
            </div>
        `;
    }

    function renderChanges() {
        const container =
            document.getElementById("glime-addon-changes");

        if (!container) return;

        const pendingChanges = changes.filter((item) => {
            return (
                item.status === "proposed" ||
                item.status === "edited" ||
                item.status === "approved"
            );
        });

        if (!pendingChanges.length) {
            container.innerHTML = "";
            return;
        }

        container.innerHTML = `
            <div class="glime-addon-section-title">
                Proposed Lead Changes
            </div>

            <div class="glime-addon-change-list">
                ${pendingChanges.map(renderChange).join("")}
            </div>
        `;
    }

    function renderChange(change) {
        const lead = findLead(change.lead_id);

        const field =
            change.field_name ||
            change.field ||
            "unknown";

        const oldValue =
            change.current_value ??
            change.old_value ??
            "";

        const proposedValue =
            change.proposed_value ??
            change.new_value ??
            "";

        const status =
            change.status || "proposed";

        const isApproved = status === "approved";

        return `
            <div class="glime-addon-change">

                <div class="glime-addon-change-top">

                    <div>
                        <strong>
                            ${escapeHtml(
                                lead?.name ||
                                `Lead ${change.lead_id || ""}`
                            )}
                        </strong>

                        <span>
                            ${escapeHtml(field)}
                        </span>
                    </div>

                    <span class="glime-addon-badge">
                        ${escapeHtml(status)}
                    </span>

                </div>

                <div class="glime-addon-change-values">

                    <div>
                        <small>Current</small>
                        <div>
                            ${escapeHtml(formatValue(oldValue))}
                        </div>
                    </div>

                    <div class="glime-addon-arrow">
                        →
                    </div>

                    <div>
                        <small>Proposed</small>
                        <div>
                            ${escapeHtml(formatValue(proposedValue))}
                        </div>
                    </div>

                </div>

                <div class="glime-addon-actions">

                    ${
                        !isApproved
                            ? `
                                <button
                                    type="button"
                                    data-addon-action="edit"
                                    data-change-id="${escapeHtml(change.id)}"
                                >
                                    Edit
                                </button>

                                <button
                                    type="button"
                                    class="glime-addon-primary"
                                    data-addon-action="approve"
                                    data-change-id="${escapeHtml(change.id)}"
                                >
                                    Review & Approve
                                </button>
                            `
                            : `
                                <button
                                    type="button"
                                    class="glime-addon-primary"
                                    data-addon-action="apply"
                                    data-change-id="${escapeHtml(change.id)}"
                                >
                                    Apply to Lead
                                </button>
                            `
                    }

                </div>

            </div>
        `;
    }

    function findLead(leadId) {
        return leads.find(
            (lead) => String(lead.id) === String(leadId)
        );
    }

    async function analyzeCase(caseId) {
        setStatus("Analyzing conversation...", "info");

        try {
            const result = await api("analyze_case", {
                case_id: caseId
            });

            await refreshData();

            setStatus(
                result?.message ||
                "Conversation analysis completed.",
                "success"
            );

            showCoreToast(
                "Conversation analysis completed.",
                "success"
            );

        } catch (error) {
            console.error(
                "[GLIME Follow-up Addon] analyzeCase:",
                error
            );

            setStatus(
                error.message ||
                "Conversation analysis failed.",
                "error"
            );

            showCoreToast(
                error.message ||
                "Conversation analysis failed.",
                "error"
            );
        }
    }

    async function editChange(changeId) {
        const change = changes.find(
            (item) => String(item.id) === String(changeId)
        );

        if (!change) {
            throw new Error("Proposed change not found.");
        }

        const currentValue =
            change.proposed_value ??
            change.new_value ??
            "";

        const newValue = window.prompt(
            `Edit proposed value for "${change.field_name || change.field}"`,
            formatValue(currentValue)
        );

        if (newValue === null) {
            return;
        }

        const trimmedValue = newValue.trim();

        if (!trimmedValue) {
            throw new Error("Proposed value cannot be empty.");
        }

        setStatus("Saving proposed change...", "info");

        await api("edit_change", {
            change_id: changeId,
            proposed_value: parseValue(
                trimmedValue,
                change.field_name || change.field
            )
        });

        await refreshData();

        setStatus(
            "Proposed change updated.",
            "success"
        );

        showCoreToast(
            "Proposed change updated.",
            "success"
        );
    }

    async function approveChange(changeId) {
        const confirmed = window.confirm(
            "Approve this proposed Lead change?"
        );

        if (!confirmed) {
            return;
        }

        setStatus("Approving proposed change...", "info");

        await api("approve_change", {
            change_id: changeId
        });

        await refreshData();

        setStatus(
            "Change approved. It is ready to be applied.",
            "success"
        );

        showCoreToast(
            "Change approved. Click Apply to Lead to commit it.",
            "success"
        );
    }

    async function applyChange(changeId) {
        const confirmed = window.confirm(
            "Apply this approved change to the Lead?"
        );

        if (!confirmed) {
            return;
        }

        setStatus("Applying approved change...", "info");

        await api("apply_change", {
            change_id: changeId
        });

        await refreshData();

        setStatus(
            "Approved change applied to Lead.",
            "success"
        );

        showCoreToast(
            "Approved change applied to Lead.",
            "success"
        );
    }

    async function refreshData() {
        await Promise.all([
            loadCases(),
            loadChanges(),
            loadLeads()
        ]);

        renderCases();
        renderChanges();

        /*
         * Refresh the existing Follow-up Specialist UI
         * without changing follow-up.js.
         */
        if (
            typeof window.loadFollowUpSpecialist === "function"
        ) {
            try {
                await window.loadFollowUpSpecialist();
            } catch (error) {
                console.warn(
                    "[GLIME Follow-up Addon] Core refresh failed:",
                    error
                );
            }
        }
    }

    async function initialize() {
        try {
            installPanel();

            setStatus(
                "Loading conversation analysis...",
                "info"
            );

            await getClientId();
            await refreshData();

            setStatus(
                "Conversation analysis is ready.",
                "success"
            );

        } catch (error) {
            console.error(
                "[GLIME Follow-up Addon] Initialization failed:",
                error
            );

            setStatus(
                error.message ||
                "Conversation Analysis could not be initialized.",
                "error"
            );
        }
    }

    function handleAction(event) {
        const button =
            event.target.closest("[data-addon-action]");

        if (!button) return;

        /*
         * Stop this event from reaching the existing
         * follow-up.js click handler.
         */
        event.preventDefault();
        event.stopImmediatePropagation();

        const action =
            button.dataset.addonAction;

        const caseId =
            button.dataset.caseId;

        const changeId =
            button.dataset.changeId;

        executeAction(
            action,
            caseId,
            changeId
        );
    }

    async function executeAction(
        action,
        caseId,
        changeId
    ) {
        try {
            switch (action) {
                case "refresh":
                    setStatus(
                        "Refreshing...",
                        "info"
                    );

                    await refreshData();

                    setStatus(
                        "Data refreshed.",
                        "success"
                    );
                    break;

                case "analyze":
                    await analyzeCase(caseId);
                    break;

                case "edit":
                    await editChange(changeId);
                    break;

                case "approve":
                    await approveChange(changeId);
                    break;

                case "apply":
                    await applyChange(changeId);
                    break;

                default:
                    console.warn(
                        "[GLIME Follow-up Addon] Unknown action:",
                        action
                    );
            }

        } catch (error) {
            console.error(
                "[GLIME Follow-up Addon] Action failed:",
                error
            );

            setStatus(
                error.message ||
                "Action failed.",
                "error"
            );

            showCoreToast(
                error.message ||
                "Action failed.",
                "error"
            );
        }
    }

    function parseValue(value, fieldName) {
        if (
            value === null ||
            value === undefined
        ) {
            return null;
        }

        const text = String(value).trim();

        if (
            fieldName === "budget"
        ) {
            const numeric = Number(
                text.replace(/,/g, "")
            );

            return Number.isFinite(numeric)
                ? numeric
                : text;
        }

        if (
            fieldName === "next_follow_up_at"
        ) {
            const date = new Date(text);

            return Number.isNaN(date.getTime())
                ? text
                : date.toISOString();
        }

        return text;
    }

    function formatValue(value) {
        if (
            value === null ||
            value === undefined ||
            value === ""
        ) {
            return "—";
        }

        if (typeof value === "object") {
            try {
                return JSON.stringify(value);
            } catch {
                return String(value);
            }
        }

        return String(value);
    }

    function showCoreToast(
        message,
        type = "info"
    ) {
        if (
            typeof window.showToast === "function"
        ) {
            window.showToast(
                message,
                type
            );
            return;
        }

        console.log(
            `[GLIME Follow-up Addon] ${message}`
        );
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    /*
     * Capture phase is intentional.
     * It allows this addon to handle only its own
     * buttons before follow-up.js sees the event.
     */
    document.addEventListener(
        "click",
        handleAction,
        true
    );

    /*
     * Wait until follow-up.js has initialized the page.
     */
    if (
        document.readyState === "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            initialize,
            { once: true }
        );
    } else {
        initialize();
    }

    /*
     * Optional public API for future modules.
     */
    window.GLIMEFollowUpAnalysis = {
        refresh: refreshData,
        analyzeCase,
        editChange,
        approveChange,
        applyChange
    };

})();
