/* =========================================================
   GLIME CARE — CLIENT DASHBOARD ACCESS
   ---------------------------------------------------------
   Secure client-side CARE access.

   Flow:
   Client Login
        ↓
   care_dashboard_snapshot RPC
        ↓
   CARE profile exists + Active
        ↓
   ❤️ GLIME CARE दिखाई देगा

   IMPORTANT:
   - dashboard.html को replace नहीं करता
   - dashboard-modules-addon.js को नहीं छेड़ता
   - client_modules का उपयोग नहीं करता
   - care_profiles को सीधे read नहीं करता
   - existing secure CARE RPC का उपयोग करता है
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

            #${CARE_NAV_ID}:hover {
                color: #00ff88;
            }

        `;

        document.head.appendChild(style);
    }


    /* =====================================================
       REMOVE CARE NAVIGATION
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
       ADD CARE NAVIGATION
    ====================================================== */

    function addCareNavigation() {

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
                'GLIME CARE Dashboard: sidebar not found.'
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

        nav.textContent =
            '❤️ GLIME CARE';

        nav.setAttribute(
            'aria-label',
            'Open GLIME CARE'
        );


        /* -----------------------------------------------
           Put CARE before Billing if available
        ------------------------------------------------ */

        const billing =
            sidebar.querySelector(
                'a[href="#billingSection"]'
            );

        if (billing) {

            sidebar.insertBefore(
                nav,
                billing
            );

            return;
        }


        /* -----------------------------------------------
           Otherwise put CARE before Logout
        ------------------------------------------------ */

        const logout =
            sidebar.querySelector(
                '.logout-btn'
            );

        if (logout) {

            sidebar.insertBefore(
                nav,
                logout
            );

            return;
        }


        /* -----------------------------------------------
           Final fallback
        ------------------------------------------------ */

        sidebar.appendChild(
            nav
        );

        console.log(
            'GLIME CARE Dashboard: CARE navigation added.'
        );
    }


    /* =====================================================
       CHECK CARE ACCESS
       -----------------------------------------------------
       Uses the same secure RPC already used by care.html.
    ====================================================== */

    async function checkCareAccess() {

        /* -----------------------------------------------
           Get authenticated session
        ------------------------------------------------ */

        const {
            data: sessionData,
            error: sessionError
        } =
            await db.auth.getSession();

        if (sessionError) {
            throw sessionError;
        }

        const session =
            sessionData?.session;


        /* -----------------------------------------------
           No login = no CARE
        ------------------------------------------------ */

        if (!session?.user) {

            removeCareNavigation();

            return false;
        }


        /* -----------------------------------------------
           SECURE CARE SNAPSHOT
        ------------------------------------------------ */

        const {
            data,
            error
        } =
            await db.rpc(
                'care_dashboard_snapshot'
            );

        if (error) {

            console.error(
                'GLIME CARE snapshot error:',
                error
            );

            throw error;
        }


        console.log(
            'GLIME CARE snapshot:',
            data
        );


        /* -----------------------------------------------
           CARE profile must exist
        ------------------------------------------------ */

        if (!data?.profile) {

            console.log(
                'GLIME CARE: profile not found / disabled.'
            );

            removeCareNavigation();

            return false;
        }


        /* -----------------------------------------------
           CARE must be ACTIVE
        ------------------------------------------------ */

        const status =
            String(
                data.profile.status || ''
            ).toLowerCase();

        if (
            status !== 'active'
        ) {

            console.log(
                'GLIME CARE: profile is not active.',
                status
            );

            removeCareNavigation();

            return false;
        }


        /* -----------------------------------------------
           ACTIVE CARE
        ------------------------------------------------ */

        console.log(
            'GLIME CARE: ACTIVE',
            data.profile.display_name || ''
        );

        addCareNavigation();

        return true;
    }


    /* =====================================================
       INITIALIZE
    ====================================================== */

    async function initializeCareAccess() {

        try {

            await checkCareAccess();

        } catch (error) {

            console.error(
                'GLIME CARE Dashboard Access Error:',
                error
            );

            /*
               Fail closed.
               If access cannot be verified,
               CARE stays hidden.
            */

            removeCareNavigation();
        }
    }


    /* =====================================================
       WAIT FOR DASHBOARD DOM
    ====================================================== */

    function waitForDashboard(
        attempt = 0
    ) {

        const sidebar =
            document.querySelector(
                '.sidebar'
            );

        if (sidebar) {

            initializeCareAccess();

            return;
        }


        /*
           Maximum 20 seconds.
        */

        if (
            attempt >= 80
        ) {

            console.warn(
                'GLIME CARE Dashboard: sidebar not found.'
            );

            return;
        }


        setTimeout(
            () => {
                waitForDashboard(
                    attempt + 1
                );
            },
            250
        );
    }


    /* =====================================================
       AUTH STATE WATCH
    ====================================================== */

    function watchAuth() {

        db.auth.onAuthStateChange(
            (_event, session) => {

                if (!session) {

                    removeCareNavigation();

                    return;
                }


                /*
                   Wait for dashboard DOM.
                */

                setTimeout(
                    initializeCareAccess,
                    300
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


    /* =====================================================
       BOOT
    ====================================================== */

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
