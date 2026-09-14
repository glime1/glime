/* =========================================================
   GLIME — UNIVERSAL DASHBOARD MODULE ACCESS
   ---------------------------------------------------------
   Reads client_modules and shows only modules that:
   1. belong to the authenticated client
   2. are enabled
   3. are visible_to_client
   4. are not expired
   ---------------------------------------------------------
   Existing dashboard.html is NOT replaced.
========================================================= */

(() => {
    'use strict';


    /* =====================================================
       CONFIG
    ====================================================== */

    const SUPABASE_URL =
        'https://ufoulgbiqgjriwapuopc.supabase.co';

    const SUPABASE_KEY =
        'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';


    /* =====================================================
       SUPABASE
    ====================================================== */

    const supabaseClient =
        window.supabase.createClient(
            SUPABASE_URL,
            SUPABASE_KEY
        );


    /* =====================================================
       MODULE → UI CONFIG
       Future modules can be added here.
    ====================================================== */

    const MODULE_UI = {

        instagram_ai_sales_agent: {
            name: 'AI Sales Agent',
            icon: '🤖',
            href: 'instagram-agent.html'
        },

        salon_ai: {
            name: 'Salon AI',
            icon: '💇',
            href: 'salon-ai.html'
        },

        voice_ai: {
            name: 'Voice AI',
            icon: '🎙️',
            href: 'voice-ai.html'
        },

        gallery: {
            name: 'Lookbook',
            icon: '📖',
            href: 'lookbook.html'
        },

        appointments: {
            name: 'Appointments',
            icon: '📅',
            href: 'appointments.html'
        },

        services: {
            name: 'Services',
            icon: '🛎️',
            href: 'services.html'
        },

        website_content: {
            name: 'Website Content',
            icon: '🌐',
            href: 'website-content.html'
        },

        leads: {
            name: 'Leads',
            icon: '👥',
            href: 'leads.html'
        }

    };


    /* =====================================================
       INTERNAL MODULE IDS
    ====================================================== */

    const DYNAMIC_NAV_PREFIX =
        'glime-module-nav-';


    /* =====================================================
       AUTHENTICATED CLIENT
    ====================================================== */

    async function getAuthenticatedClient() {

        const {
            data,
            error
        } =
            await supabaseClient.auth.getSession();


        if (error) {
            throw error;
        }


        const session =
            data?.session;


        if (
            !session ||
            !session.user
        ) {

            return null;

        }


        const user =
            session.user;


        /* -----------------------------------------------
           FIRST: AUTH USER ID
        ------------------------------------------------ */

        let {
            data: client,
            error: clientError
        } =
            await supabaseClient
                .from('client_data')
                .select(`
                    id,
                    client_id,
                    email,
                    auth_user_id,
                    client_name,
                    full_name,
                    name
                `)
                .eq(
                    'auth_user_id',
                    user.id
                )
                .maybeSingle();


        if (clientError) {
            throw clientError;
        }


        /* -----------------------------------------------
           FALLBACK: EMAIL
        ------------------------------------------------ */

        if (
            !client &&
            user.email
        ) {

            const fallback =
                await supabaseClient
                    .from('client_data')
                    .select(`
                        id,
                        client_id,
                        email,
                        auth_user_id,
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


            if (fallback.error) {
                throw fallback.error;
            }


            client =
                fallback.data;

        }


        return client;

    }


    /* =====================================================
       LOAD CLIENT MODULE ACCESS
    ====================================================== */

    async function loadClientModules(
        clientId
    ) {

        const {
            data,
            error
        } =
            await supabaseClient
                .from('client_modules')
                .select(`
                    module_id,
                    enabled,
                    visible_to_client,
                    status,
                    activated_at,
                    expires_at,
                    plan
                `)
                .eq(
                    'client_id',
                    clientId
                );


        if (error) {
            throw error;
        }


        return data || [];

    }


    /* =====================================================
       LOAD MODULE DEFINITIONS
    ====================================================== */

    async function loadModules(
        moduleIds
    ) {

        if (
            !moduleIds ||
            !moduleIds.length
        ) {

            return [];

        }


        const {
            data,
            error
        } =
            await supabaseClient
                .from('modules')
                .select(`
                    id,
                    name,
                    slug
                `)
                .in(
                    'id',
                    moduleIds
                );


        if (error) {
            throw error;
        }


        return data || [];

    }


    /* =====================================================
       ACTIVE ACCESS CHECK
    ====================================================== */

    function hasValidAccess(
        access
    ) {

        if (!access) {
            return false;
        }


        /* Must be enabled */

        if (
            access.enabled !== true
        ) {

            return false;

        }


        /* Must be visible */

        if (
            access.visible_to_client !== true
        ) {

            return false;

        }


        /* Status check */

        if (
            access.status &&
            ![
                'active',
                'trial'
            ].includes(
                String(
                    access.status
                ).toLowerCase()
            )
        ) {

            return false;

        }


        /* Expiry check */

        if (
            access.expires_at
        ) {

            const expiry =
                new Date(
                    access.expires_at
                );


            if (
                Number.isNaN(
                    expiry.getTime()
                )
            ) {

                return false;

            }


            if (
                expiry <= new Date()
            ) {

                return false;

            }

        }


        return true;

    }


    /* =====================================================
       REMOVE OLD DYNAMIC MODULE UI
    ====================================================== */

    function removeDynamicModules() {

        document
            .querySelectorAll(
                `[id^="${DYNAMIC_NAV_PREFIX}"]`
            )
            .forEach(
                element => {
                    element.remove();
                }
            );

    }


    /* =====================================================
       ADD SIDEBAR MODULE
    ====================================================== */

    function addSidebarModule(
        module
    ) {

        const config =
            MODULE_UI[
                module.slug
            ];


        /* Unknown module:
           don't invent UI */

        if (!config) {

            console.warn(
                'GLIME: No dashboard UI configured for module:',
                module.slug
            );

            return;

        }


        const sidebar =
            document.querySelector(
                '.sidebar'
            );


        if (!sidebar) {
            return;
        }


        const navId =
            DYNAMIC_NAV_PREFIX +
            module.slug
                .replace(
                    /[^a-zA-Z0-9_-]/g,
                    '-'
                );


        if (
            document.getElementById(
                navId
            )
        ) {

            return;

        }


        const nav =
            document.createElement(
                'a'
            );


        nav.id =
            navId;

        nav.className =
            'nav-item';

        nav.href =
            config.href;

        nav.innerHTML =
            `${config.icon} ${config.name}`;


        /* Put before Billing */

        const billing =
            sidebar.querySelector(
                'a[href="#billingSection"]'
            );


        if (billing) {

            sidebar.insertBefore(
                nav,
                billing
            );

        } else {

            const logout =
                sidebar.querySelector(
                    '.logout-btn'
                );


            if (logout) {

                sidebar.insertBefore(
                    nav,
                    logout
                );

            } else {

                sidebar.appendChild(
                    nav
                );

            }

        }

    }


    /* =====================================================
       HIDE HARD-CODED LOOKBOOK
       Universal manager controls it now.
    ====================================================== */

    function handleHardcodedLookbook(
        allowedModules
    ) {

        const lookbook =
            document.querySelector(
                '.sidebar a[href="lookbook.html"]'
            );


        if (!lookbook) {
            return;
        }


        const allowed =
            allowedModules.some(
                module =>
                    module.slug ===
                    'gallery'
            );


        if (!allowed) {

            lookbook.remove();

        } else {

            /* Existing Lookbook is already present,
               so don't create duplicate. */

            lookbook.id =
                DYNAMIC_NAV_PREFIX +
                'gallery';

        }

    }


    /* =====================================================
       LOAD + RENDER
    ====================================================== */

    async function initializeModuleAccess() {

        try {

            /* ---------------------------------------------
               AUTHENTICATED CLIENT
            ---------------------------------------------- */

            const client =
                await getAuthenticatedClient();


            if (
                !client ||
                !client.client_id
            ) {

                return;

            }


            /* ---------------------------------------------
               ACCESS ROWS
            ---------------------------------------------- */

            const accessRows =
                await loadClientModules(
                    client.client_id
                );


            /* ---------------------------------------------
               ONLY VALID ACCESS
            ---------------------------------------------- */

            const validAccess =
                accessRows.filter(
                    hasValidAccess
                );


            /* ---------------------------------------------
               MODULE IDs
            ---------------------------------------------- */

            const moduleIds =
                validAccess
                    .map(
                        row =>
                            row.module_id
                    );


            if (
                !moduleIds.length
            ) {

                handleHardcodedLookbook(
                    []
                );

                return;

            }


            /* ---------------------------------------------
               MODULE DEFINITIONS
            ---------------------------------------------- */

            const moduleDefinitions =
                await loadModules(
                    moduleIds
                );


            /* ---------------------------------------------
               JOIN ACCESS + MODULE
            ---------------------------------------------- */

            const allowedModules =
                moduleDefinitions.filter(
                    module =>
                        validAccess.some(
                            access =>
                                access.module_id ===
                                module.id
                        )
                );


            /* ---------------------------------------------
               REMOVE OLD DYNAMIC UI
            ---------------------------------------------- */

            removeDynamicModules();


            /* ---------------------------------------------
               LOOKBOOK
            ---------------------------------------------- */

            handleHardcodedLookbook(
                allowedModules
            );


            /* ---------------------------------------------
               ADD ALL OTHER MODULES
            ---------------------------------------------- */

            allowedModules.forEach(
                module => {

                    if (
                        module.slug ===
                        'gallery'
                    ) {

                        return;

                    }


                    addSidebarModule(
                        module
                    );

                }
            );


            console.log(
                'GLIME Universal Module Access:',
                allowedModules.map(
                    module =>
                        module.slug
                )
            );


        } catch (error) {

            console.error(
                'GLIME Universal Module Access Error:',
                error
            );

        }

    }


    /* =====================================================
       START AFTER DOM
    ====================================================== */

    function start() {

        if (
            document.readyState ===
            'loading'
        ) {

            document.addEventListener(
                'DOMContentLoaded',
                initializeModuleAccess,
                {
                    once:true
                }
            );

        } else {

            initializeModuleAccess();

        }

    }


    start();

})();
