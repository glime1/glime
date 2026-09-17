/* =========================================================
   GLIME CARE — CLIENT DASHBOARD ACCESS
   ---------------------------------------------------------
   Additive addon for existing dashboard.html.

   IMPORTANT:
   - Does NOT replace dashboard.html.
   - Does NOT modify dashboard-modules-addon.js.
   - Does NOT use client_modules.
   - CARE access comes from care_profiles.
   - Only the authenticated client's own CARE profile
     can activate the dashboard entry.
========================================================= */

(() => {
    'use strict';

    const SUPABASE_URL =
        'https://ufoulgbiqgjriwapuopc.supabase.co';

    const SUPABASE_KEY =
        'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';

    const CARE_NAV_ID =
        'glime-care-dashboard-nav';

    const CARE_HREF =
        'care.html';


    /* =====================================================
       SUPABASE
    ====================================================== */

    if (!window.supabase) {
        console.error(
            'GLIME CARE Dashboard: Supabase library not loaded.'
        );
        return;
    }

    const db =
        window.supabase.createClient(
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


    /* =====================================================
       STYLES
    ====================================================== */

    function addStyles() {

        if (
            document.getElementById(
                'glime-care-dashboard-style'
            )
        ) {
            return;
        }

        const style =
            document.createElement('style');

        style.id =
            'glime-care-dashboard-style';

        style.textContent = `

            #${CARE_NAV_ID} {
                position: relative;
            }

            #${CARE_NAV_ID} .care-nav-badge {
                display: inline-block;
                margin-left: 6px;
                padding: 2px 6px;
                border-radius: 999px;
                font-size: 9px;
                font-weight: 700;
                color: #00ff88;
                background: rgba(0,255,136,.08);
                border: 1px solid rgba(0,255,136,.20);
                vertical-align: middle;
            }

            #${CARE_NAV_ID}:hover {
                color: #00ff88;
            }

        `;

        document.head.appendChild(style);
    }


    /* =====================================================
       GET AUTHENTICATED USER
    ====================================================== */

    async function getSession() {

        const {
            data,
            error
        } =
            await db.auth.getSession();

        if (error) {
            throw error;
        }

        return data?.session || null;
    }


    /* =====================================================
       GET CLIENT DATA
    ====================================================== */

    async function getClient(session) {

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
            error
        } =
            await db
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


        if (error) {
            throw error;
        }


        /* -----------------------------------------------
           FALLBACK: EMAIL
        ------------------------------------------------ */

        if (
            !client &&
            user.email
        ) {

            const fallback =
                await db
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


        return client || null;
    }


    /* =====================================================
       CHECK CARE PROFILE
    ====================================================== */

    async function getCareProfile(client) {

        if (
            !client ||
            !client.client_id
        ) {
            return null;
        }


        /*
           CARE uses client_id as the product-level
           client identity.
        */

        const {
            data,
            error
        } =
            await db
                .from('care_profiles')
                .select(`
                    id,
                    client_id,
                    auth_user_id,
                    status,
                    display_name,
                    family_id
                `)
                .eq(
                    'client_id',
                    client.client_id
                )
                .maybeSingle();


        if (error) {
            throw error;
        }


        return data || null;
    }


    /* =====================================================
       VALID CARE ACCESS
    ====================================================== */

    function hasActiveCare(profile) {

        if (!profile) {
            return false;
        }


        /*
           CARE must be active.
        */

        if (
            String(
                profile.status || ''
            ).toLowerCase() !== 'active'
        ) {
            return false;
        }


        return true;
    }


    /* =====================================================
       CREATE NAV
    ====================================================== */

    function addCareNavigation(profile) {

        if (
            document.getElementById(
                CARE_NAV_ID
            )
        ) {
            return;
        }


        const sidebar =
            document.querySelector(
                '.sidebar'
            );


        if (!sidebar) {

            console.warn(
                'GLIME CARE Dashboard: .sidebar not found.'
            );

            return;
        }


        addStyles();


        const nav =
            document.createElement('a');


        nav.id =
            CARE_NAV_ID;

        nav.className =
            'nav-item';

        nav.href =
            CARE_HREF;

        nav.innerHTML =
            `❤️ GLIME CARE`;


        /*
           If the dashboard has Billing,
           place CARE before Billing.
        */

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


        console.log(
            'GLIME CARE Dashboard: CARE navigation added.',
            profile?.display_name || ''
        );
    }


    /* =====================================================
       REMOVE CARE NAV
    ====================================================== */

    function removeCareNavigation() {

        const nav =
            document.getElementById(
                CARE_NAV_ID
            );

        if (nav) {
            nav.remove();
        }
    }


    /* =====================================================
       LOAD CARE ACCESS
    ====================================================== */

    async function initializeCareAccess() {

        try {

            const session =
                await getSession();


            /*
               Not logged in:
               do not show CARE.
            */

            if (!session) {

                removeCareNavigation();

                return;
            }


            const client =
                await getClient(
                    session
                );


            /*
               No client record:
               do not show CARE.
            */

            if (
                !client ||
                !client.client_id
            ) {

                removeCareNavigation();

                return;
            }


            const profile =
                await getCareProfile(
                    client
                );


            /*
               Only ACTIVE CARE profiles
               get the dashboard entry.
            */

            if (
                hasActiveCare(profile)
            ) {

                addCareNavigation(
                    profile
                );

            } else {

                removeCareNavigation();

            }


        } catch (error) {

            console.error(
                'GLIME CARE Dashboard Error:',
                error
            );

            /*
               Fail closed:
               if access cannot be verified,
               do not display CARE.
            */

            removeCareNavigation();
        }
    }


    /* =====================================================
       WAIT FOR DASHBOARD
    ====================================================== */

    function waitForDashboard() {

        const sidebar =
            document.querySelector(
                '.sidebar'
            );


        const clientBadge =
            document.querySelector(
                '.client-badge'
            );


        if (
            sidebar &&
            clientBadge
        ) {

            initializeCareAccess();

            return;
        }


        /*
           dashboard.html may still be initializing.
        */

        setTimeout(
            waitForDashboard,
            250
        );
    }


    /* =====================================================
       AUTH STATE CHANGE
    ====================================================== */

    function watchAuth() {

        db.auth.onAuthStateChange(
            (_event, session) => {

                if (!session) {

                    removeCareNavigation();

                    return;
                }


                /*
                   Give dashboard DOM time to settle.
                */

                setTimeout(
                    initializeCareAccess,
                    100
                );
            }
        );
    }


    /* =====================================================
       START
    ====================================================== */

    function start() {

        addStyles();

        waitForDashboard();

        watchAuth();
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

})();
