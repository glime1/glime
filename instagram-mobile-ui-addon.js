(function () {
  'use strict';

  /*
   * GLIME — Instagram Mobile UI Add-on
   * SINGLE-FILE VERSION
   *
   * UI ONLY:
   * - No Supabase calls
   * - No AI calls
   * - No Instagram API calls
   * - No authentication changes
   * - Does not replace existing Instagram sales logic
   * - Mobile CSS is contained inside this file
   */

  var BP = 720;
  var CSS_ID = 'glime-instagram-mobile-ui-css-v2';
  var MENU_ID = 'glime-instagram-mobile-menu-v2';

  function isMobile() {
    return window.innerWidth <= BP;
  }

  function addStyles() {
    if (document.getElementById(CSS_ID)) {
      return;
    }

    var style = document.createElement('style');

    style.id = CSS_ID;

    style.textContent = `
@media (max-width:720px){

  html,
  body{
    margin:0!important;
    width:100%!important;
    min-height:100%!important;
    overflow-x:hidden!important;
    background:#fff!important;
    color:#111!important;
  }

  body{
    font-family:Poppins,sans-serif!important;
  }

  body.ig-mobile-lock{
    overflow:hidden!important;
  }

  .main{
    width:100%!important;
    min-width:0!important;
    padding:0!important;
  }

  .topbar{
    position:relative!important;
    display:flex!important;
    align-items:center!important;
    gap:7px!important;
    min-height:62px!important;
    padding:7px 9px!important;
    background:#fff!important;
    color:#111!important;
    border-bottom:1px solid #e9e9e9!important;
  }

  .topbar>div:first-child{
    min-width:0!important;
    flex:1!important;
  }

  .topbar .eyebrow,
  .topbar p,
  .connection-badge{
    display:none!important;
  }

  .topbar h1{
    font-size:1.05rem!important;
    line-height:1.2!important;
    margin:0!important;
    color:#111!important;
    white-space:nowrap!important;
    overflow:hidden!important;
    text-overflow:ellipsis!important;
  }

  .top-actions{
    display:flex!important;
    align-items:center!important;
    gap:4px!important;
    margin-left:auto!important;
  }

  #connect{
    min-height:35px!important;
    padding:7px 9px!important;
    border-radius:18px!important;
    font-size:.55rem!important;
    white-space:nowrap!important;
  }

  .ig-mob-menu-btn{
    display:grid!important;
    place-items:center!important;
    width:40px!important;
    height:40px!important;
    flex:0 0 40px!important;
    padding:0!important;
    border:0!important;
    border-radius:50%!important;
    background:#f4f4f4!important;
    color:#111!important;
    font-size:22px!important;
    line-height:1!important;
  }

  .ig-mob-menu-btn span{
    display:block!important;
    transform:translateY(-1px)!important;
  }


  /* =========================
     MAIN MOBILE WORKSPACE
     ========================= */

  .workspace{
    display:block!important;
    width:100%!important;
    height:calc(100dvh - 62px)!important;
    min-height:0!important;
    margin:0!important;
    border:0!important;
    border-radius:0!important;
    overflow:hidden!important;
    position:relative!important;
    background:#fff!important;
  }

  .inbox,
  .chat{
    position:absolute!important;
    inset:0!important;
    width:100%!important;
    height:100%!important;
    min-height:0!important;
    border:0!important;
    border-radius:0!important;
    background:#fff!important;
    color:#111!important;
  }

  .inbox{
    display:flex!important;
    flex-direction:column!important;
    padding:8px 9px!important;
    overflow:hidden!important;
  }

  .context{
    display:none!important;
  }

  .workspace.ig-chat-open .inbox{
    display:none!important;
  }

  .workspace:not(.ig-chat-open) .chat{
    display:none!important;
  }


  /* =========================
     INBOX
     ========================= */

  .panel-head{
    display:flex!important;
    align-items:center!important;
    justify-content:space-between!important;
    min-height:44px!important;
  }

  .panel-head h2{
    font-size:1rem!important;
    margin:2px 0!important;
    color:#111!important;
  }

  .kicker{
    font-size:.52rem!important;
    color:#8b8b8b!important;
    letter-spacing:1.5px!important;
  }

  .search-box{
    display:flex!important;
    align-items:center!important;
    min-height:43px!important;
    margin:7px 0!important;
    padding:8px 10px!important;
    background:#f4f4f4!important;
    border:1px solid #e8e8e8!important;
    border-radius:22px!important;
    color:#777!important;
  }

  .search-box input{
    color:#111!important;
    font-size:.72rem!important;
    background:transparent!important;
  }

  .filters{
    display:grid!important;
    grid-template-columns:repeat(3,1fr)!important;
    gap:6px!important;
    margin-bottom:5px!important;
  }

  .filters button{
    min-height:34px!important;
    padding:6px!important;
    border:1px solid #e3e3e3!important;
    border-radius:17px!important;
    background:#fff!important;
    color:#444!important;
    font-size:.56rem!important;
  }

  .filters button.active{
    background:#111!important;
    color:#fff!important;
    border-color:#111!important;
  }

  .conversation-list{
    flex:1!important;
    min-height:0!important;
    margin-top:3px!important;
    overflow:auto!important;
    -webkit-overflow-scrolling:touch!important;
  }

  .conversation-item{
    display:flex!important;
    gap:9px!important;
    min-height:64px!important;
    padding:9px 6px!important;
    margin:0!important;
    border:0!important;
    border-bottom:1px solid #f0f0f0!important;
    border-radius:0!important;
    background:#fff!important;
  }

  .conversation-item.active{
    background:#f6f6f6!important;
    border-color:#eee!important;
  }

  .conversation-item .avatar{
    width:46px!important;
    height:46px!important;
    flex:0 0 46px!important;
    background:#eee!important;
    color:#222!important;
  }

  .conv-top strong,
  .conv-preview{
    color:#111!important;
  }

  .conv-time,
  .conv-preview{
    color:#777!important;
  }

  .order-link{
    display:flex!important;
    flex:0 0 auto!important;
    justify-content:space-between!important;
    margin-top:6px!important;
    padding:9px!important;
    background:#f7f7f7!important;
    border:1px solid #e8e8e8!important;
    border-radius:11px!important;
    color:#111!important;
  }


  /* =========================
     CHAT HEADER
     ========================= */

  .chat{
    display:flex!important;
    flex-direction:column!important;
  }

  .chat-view{
    display:flex!important;
    flex-direction:column!important;
    width:100%!important;
    height:100%!important;
    min-height:0!important;
    background:#fff!important;
  }

  .chat-header{
    display:flex!important;
    align-items:center!important;
    flex:0 0 62px!important;
    min-height:62px!important;
    padding:7px 8px!important;
    gap:7px!important;
    background:#fff!important;
    color:#111!important;
    border-bottom:1px solid #ededed!important;
    box-shadow:0 1px 4px rgba(0,0,0,.04)!important;
  }

  .ig-mob-back{
    display:grid!important;
    place-items:center!important;
    width:34px!important;
    height:40px!important;
    flex:0 0 34px!important;
    padding:0 0 4px!important;
    border:0!important;
    background:transparent!important;
    color:#111!important;
    font-size:34px!important;
    line-height:1!important;
  }

  .chat-header .avatar{
    width:40px!important;
    height:40px!important;
    flex:0 0 40px!important;
    background:#eee!important;
    color:#111!important;
  }

  .chat-title{
    flex:1!important;
    min-width:0!important;
  }

  .chat-title b{
    display:block!important;
    color:#111!important;
    font-size:.76rem!important;
    white-space:nowrap!important;
    overflow:hidden!important;
    text-overflow:ellipsis!important;
  }

  .chat-title small{
    display:block!important;
    color:#777!important;
    font-size:.53rem!important;
    margin-top:2px!important;
  }

  .chat-actions{
    display:flex!important;
    align-items:center!important;
    gap:0!important;
    margin-left:auto!important;
  }

  .chat-actions #closeConversation{
    display:none!important;
  }

  .ig-chat-action{
    display:grid!important;
    place-items:center!important;
    width:34px!important;
    height:36px!important;
    padding:0!important;
    border:0!important;
    background:transparent!important;
    color:#111!important;
    font-size:20px!important;
  }


  /* =========================
     MESSAGES
     ========================= */

  .messages{
    flex:1!important;
    min-height:0!important;
    padding:13px 9px 16px!important;
    overflow:auto!important;
    -webkit-overflow-scrolling:touch!important;
    background:#fff!important;
    color:#111!important;
  }

  .message-row{
    display:flex!important;
    width:100%!important;
    height:auto!important;
    min-height:0!important;
    margin:5px 0!important;
    align-items:flex-end!important;
  }

  .message-row.inbound{
    justify-content:flex-start!important;
  }

  .message-row.outbound{
    justify-content:flex-end!important;
  }

  .message-row .bubble{
    display:inline-block!important;
    width:auto!important;
    max-width:78%!important;
    min-height:0!important;
    padding:9px 12px!important;
    border:0!important;
    border-radius:19px!important;
    font-size:.82rem!important;
    line-height:1.35!important;
    word-break:break-word!important;
    overflow-wrap:anywhere!important;
    white-space:pre-wrap!important;
    box-shadow:none!important;
    color:#111!important;
  }

  .message-row.inbound .bubble{
    margin-right:auto!important;
    background:#efefef!important;
    border-top-left-radius:6px!important;
  }

  .message-row.outbound .bubble{
    margin-left:auto!important;
    background:linear-gradient(
      135deg,
      #833ab4,
      #e1306c,
      #fd1d1d,
      #fcb045
    )!important;
    color:#fff!important;
    border-top-right-radius:6px!important;
  }

  .bubble-meta{
    display:block!important;
    margin-top:3px!important;
    font-size:.47rem!important;
    text-align:right!important;
    color:#777!important;
  }

  .message-row.outbound .bubble-meta{
    color:rgba(255,255,255,.78)!important;
  }


  /* =========================
     COMPOSER
     ========================= */

  .composer{
    flex:0 0 auto!important;
    padding:
      7px
      8px
      calc(8px + env(safe-area-inset-bottom,0px))
      !important;
    background:#fff!important;
    border-top:1px solid #ededed!important;
  }

  .ig-composer-wrap{
    display:flex!important;
    align-items:center!important;
    gap:4px!important;
    min-height:46px!important;
    padding:4px 6px!important;
    background:#f0f0f0!important;
    border:1px solid #e4e4e4!important;
    border-radius:24px!important;
  }

  .ig-composer-wrap textarea{
    flex:1!important;
    min-width:0!important;
    min-height:34px!important;
    max-height:90px!important;
    margin:0!important;
    padding:7px 4px!important;
    border:0!important;
    outline:0!important;
    resize:none!important;
    background:transparent!important;
    color:#111!important;
    font-size:.78rem!important;
  }

  .ig-composer-wrap textarea::placeholder{
    color:#777!important;
  }

  .ig-composer-btn{
    display:grid!important;
    place-items:center!important;
    width:34px!important;
    height:34px!important;
    flex:0 0 34px!important;
    padding:0!important;
    border:0!important;
    background:transparent!important;
    color:#111!important;
    font-size:20px!important;
  }

  .ig-composer-plus{
    width:32px!important;
    height:32px!important;
    border:1px solid #777!important;
    border-radius:50%!important;
    font-size:21px!important;
  }

  .composer-bottom{
    display:flex!important;
    align-items:center!important;
    gap:5px!important;
    margin-top:6px!important;
  }

  .composer-bottom #suggest{
    font-size:.54rem!important;
    padding:6px 8px!important;
  }

  .composer-bottom #send{
    margin-left:auto!important;
    padding:7px 13px!important;
    border-radius:18px!important;
    font-size:.57rem!important;
    background:linear-gradient(
      135deg,
      #833ab4,
      #e1306c,
      #fd1d1d
    )!important;
    color:#fff!important;
  }

  .composer-bottom #sendHint{
    display:none!important;
  }


  /* =========================
     MOBILE MENU
     ========================= */

  .ig-mobile-drawer-overlay{
    position:fixed!important;
    inset:0!important;
    z-index:9000!important;
    background:rgba(0,0,0,.45)!important;
    opacity:0!important;
    visibility:hidden!important;
    transition:opacity .2s ease!important;
  }

  .ig-mobile-drawer{
    position:fixed!important;
    left:0!important;
    top:0!important;
    bottom:0!important;
    z-index:9001!important;
    width:min(310px,86vw)!important;
    padding:16px 11px 12px!important;
    background:#fff!important;
    color:#111!important;
    box-shadow:12px 0 35px rgba(0,0,0,.25)!important;
    transform:translateX(-105%)!important;
    transition:transform .22s ease!important;
    display:flex!important;
    flex-direction:column!important;
  }

  body.ig-menu-open .ig-mobile-drawer-overlay{
    opacity:1!important;
    visibility:visible!important;
  }

  body.ig-menu-open .ig-mobile-drawer{
    transform:translateX(0)!important;
  }

  .ig-drawer-head{
    display:flex!important;
    align-items:center!important;
    justify-content:space-between!important;
    padding-bottom:10px!important;
    border-bottom:1px solid #eee!important;
  }

  .ig-drawer-head img{
    width:82px!important;
    height:42px!important;
    object-fit:contain!important;
  }

  .ig-drawer-close{
    display:grid!important;
    place-items:center!important;
    width:38px!important;
    height:38px!important;
    border:0!important;
    border-radius:50%!important;
    background:#f3f3f3!important;
    color:#111!important;
    font-size:24px!important;
  }

  .ig-drawer-label{
    padding:12px 8px 7px!important;
    color:#777!important;
    font-size:.52rem!important;
    letter-spacing:1.5px!important;
    font-weight:700!important;
  }

  .ig-drawer-nav{
    display:grid!important;
    gap:3px!important;
    overflow:auto!important;
  }

  .ig-drawer-nav a{
    display:flex!important;
    align-items:center!important;
    gap:11px!important;
    min-height:46px!important;
    padding:8px 11px!important;
    border-radius:10px!important;
    color:#222!important;
    font-size:.72rem!important;
    font-weight:600!important;
  }

  .ig-drawer-nav a.active{
    background:#f0f0f0!important;
    font-weight:700!important;
  }

  .ig-drawer-bottom{
    margin-top:auto!important;
    padding-top:9px!important;
    border-top:1px solid #eee!important;
  }

  .ig-drawer-workspace{
    display:flex!important;
    align-items:center!important;
    gap:8px!important;
    padding:9px!important;
    border-radius:10px!important;
    background:#f6f6f6!important;
  }

  .ig-drawer-dot{
    width:8px!important;
    height:8px!important;
    border-radius:50%!important;
    background:#18b968!important;
  }

  .ig-drawer-workspace b,
  .ig-drawer-workspace small{
    display:block!important;
  }

  .ig-drawer-workspace b{
    font-size:.63rem!important;
  }

  .ig-drawer-workspace small{
    font-size:.5rem!important;
    color:#777!important;
    margin-top:2px!important;
  }

  .ig-drawer-logout{
    width:100%!important;
    margin-top:7px!important;
    min-height:39px!important;
    border:1px solid #f0c8ce!important;
    border-radius:10px!important;
    background:#fff5f6!important;
    color:#b42332!important;
    font-size:.58rem!important;
    font-weight:700!important;
  }
}

@media(max-width:380px){

  .ig-chat-action{
    width:29px!important;
    font-size:18px!important;
  }

  .message-row .bubble{
    max-width:82%!important;
  }

  #connect{
    display:none!important;
  }
}
`;

    document.head.appendChild(style);
  }


  function closeMenu() {
    document.body.classList.remove(
      'ig-menu-open',
      'ig-mobile-lock'
    );
  }


  function openMenu() {
    document.body.classList.add(
      'ig-menu-open',
      'ig-mobile-lock'
    );
  }


  function addMenu() {

    if (
      document.getElementById(MENU_ID)
    ) {
      return;
    }

    var overlay =
      document.createElement('div');

    overlay.id =
      'glimeInstagramMobileOverlay';

    overlay.className =
      'ig-mobile-drawer-overlay';

    overlay.addEventListener(
      'click',
      closeMenu
    );


    var drawer =
      document.createElement('aside');

    drawer.id =
      MENU_ID;

    drawer.className =
      'ig-mobile-drawer';

    drawer.setAttribute(
      'aria-label',
      'GLIME menu'
    );


    var sidebar =
      document.querySelector(
        '.sidebar'
      );

    var links =
      sidebar
        ? sidebar.querySelectorAll(
            'nav a'
          )
        : [];

    var navHtml = '';


    Array.prototype.forEach.call(
      links,
      function (a) {

        navHtml +=
          '<a href="' +
          (a.getAttribute('href') || '#') +
          '"' +
          (
            a.classList.contains(
              'active'
            )
            ? ' class="active"'
            : ''
          ) +
          '>' +
          a.innerHTML +
          '</a>';
      }
    );


    drawer.innerHTML =
      '<div class="ig-drawer-head">' +

        '<img ' +
        'src="glime_logo_clean.svg" ' +
        'alt="GLIME">' +

        '<button ' +
        'type="button" ' +
        'class="ig-drawer-close" ' +
        'aria-label="Close menu">' +
        '×' +
        '</button>' +

      '</div>' +

      '<div class="ig-drawer-label">' +
        'GLIME BUSINESS WORKSPACE' +
      '</div>' +

      '<nav class="ig-drawer-nav">' +
        navHtml +
      '</nav>' +

      '<div class="ig-drawer-bottom">' +

        '<div class="ig-drawer-workspace">' +

          '<span class="ig-drawer-dot"></span>' +

          '<div>' +

            '<b id="igMobileBusiness">' +
              'Business' +
            '</b>' +

            '<small id="igMobileClient">' +
              'Loading…' +
            '</small>' +

          '</div>' +

        '</div>' +

        '<button ' +
          'type="button" ' +
          'class="ig-drawer-logout">' +
          'Secure Logout' +
        '</button>' +

      '</div>';


    document.body.appendChild(
      overlay
    );

    document.body.appendChild(
      drawer
    );


    drawer
      .querySelector(
        '.ig-drawer-close'
      )
      .addEventListener(
        'click',
        closeMenu
      );


    drawer
      .querySelector(
        '.ig-drawer-logout'
      )
      .addEventListener(
        'click',
        function () {

          var logout =
            document.getElementById(
              'logout'
            );

          if (logout) {
            logout.click();
          }

        }
      );


    Array.prototype.forEach.call(
      drawer.querySelectorAll('a'),
      function (a) {

        a.addEventListener(
          'click',
          closeMenu
        );

      }
    );
  }


  function addMenuButton() {

    if (
      document.getElementById(
        'glimeInstagramMobileMenuButton'
      )
    ) {
      return;
    }

    var topbar =
      document.querySelector(
        '.topbar'
      );

    if (!topbar) {
      return;
    }


    var button =
      document.createElement(
        'button'
      );

    button.type =
      'button';

    button.id =
      'glimeInstagramMobileMenuButton';

    button.className =
      'ig-mob-menu-btn';

    button.setAttribute(
      'aria-label',
      'Open menu'
    );

    button.innerHTML =
      '<span>☰</span>';


    button.addEventListener(
      'click',
      openMenu
    );


    topbar.insertBefore(
      button,
      topbar.firstElementChild
    );
  }


  function syncIdentity() {

    var business =
      document.getElementById(
        'businessName'
      );

    var client =
      document.getElementById(
        'clientId'
      );

    var b =
      document.getElementById(
        'igMobileBusiness'
      );

    var c =
      document.getElementById(
        'igMobileClient'
      );


    if (
      business &&
      b
    ) {
      b.textContent =
        business.textContent;
    }


    if (
      client &&
      c
    ) {
      c.textContent =
        client.textContent;
    }
  }


  function showInbox() {

    var workspace =
      document.querySelector(
        '.workspace'
      );

    if (workspace) {
      workspace.classList.remove(
        'ig-chat-open'
      );
    }

    if (isMobile()) {
      closeMenu();
    }
  }


  function showChat() {

    var workspace =
      document.querySelector(
        '.workspace'
      );

    if (
      workspace &&
      isMobile()
    ) {
      workspace.classList.add(
        'ig-chat-open'
      );
    }
  }


  function addBackButton() {

    var header =
      document.querySelector(
        '.chat-header'
      );

    if (
      !header ||
      document.getElementById(
        'glimeInstagramMobileBack'
      )
    ) {
      return;
    }


    var button =
      document.createElement(
        'button'
      );

    button.type =
      'button';

    button.id =
      'glimeInstagramMobileBack';

    button.className =
      'ig-mob-back';

    button.setAttribute(
      'aria-label',
      'Back to conversations'
    );

    button.textContent =
      '‹';


    button.addEventListener(
      'click',
      function (e) {

        e.preventDefault();

        showInbox();

      }
    );


    header.insertBefore(
      button,
      header.firstElementChild
    );
  }


  function addHeaderActions() {

    var actions =
      document.querySelector(
        '.chat-actions'
      );

    if (
      !actions ||
      document.getElementById(
        'glimeIgCall'
      )
    ) {
      return;
    }


    var items = [

      [
        'glimeIgCall',
        '☎',
        'Call'
      ],

      [
        'glimeIgVideo',
        '▣',
        'Video'
      ],

      [
        'glimeIgTag',
        '◇',
        'Tag'
      ]

    ];


    items.forEach(
      function (item) {

        var button =
          document.createElement(
            'button'
          );

        button.type =
          'button';

        button.id =
          item[0];

        button.className =
          'ig-chat-action';

        button.setAttribute(
          'aria-label',
          item[2]
        );

        button.textContent =
          item[1];


        actions.insertBefore(
          button,
          actions.firstChild
        );

      }
    );
  }


  function addComposer() {

    var composer =
      document.querySelector(
        '.composer'
      );

    var textarea =
      document.getElementById(
        'input'
      );


    if (
      !composer ||
      !textarea ||
      document.getElementById(
        'glimeIgComposerWrap'
      )
    ) {
      return;
    }


    var wrap =
      document.createElement(
        'div'
      );

    wrap.id =
      'glimeIgComposerWrap';

    wrap.className =
      'ig-composer-wrap';


    var camera =
      document.createElement(
        'button'
      );

    camera.type =
      'button';

    camera.className =
      'ig-composer-btn';

    camera.setAttribute(
      'aria-label',
      'Camera'
    );

    camera.textContent =
      '◉';


    var gallery =
      document.createElement(
        'button'
      );

    gallery.type =
      'button';

    gallery.className =
      'ig-composer-btn';

    gallery.setAttribute(
      'aria-label',
      'Gallery'
    );

    gallery.textContent =
      '▧';


    var plus =
      document.createElement(
        'button'
      );

    plus.type =
      'button';

    plus.className =
      'ig-composer-btn ig-composer-plus';

    plus.setAttribute(
      'aria-label',
      'More'
    );

    plus.textContent =
      '+';


    textarea.parentNode.insertBefore(
      wrap,
      textarea
    );


    wrap.appendChild(
      camera
    );

    wrap.appendChild(
      gallery
    );

    wrap.appendChild(
      textarea
    );

    wrap.appendChild(
      plus
    );


    [
      camera,
      gallery,
      plus
    ].forEach(
      function (button) {

        button.addEventListener(
          'click',
          function () {
            textarea.focus();
          }
        );

      }
    );
  }


  function bindConversationList() {

    var list =
      document.getElementById(
        'list'
      );


    if (
      !list ||
      list.getAttribute(
        'data-glime-ig-mobile'
      ) === '1'
    ) {
      return;
    }


    list.setAttribute(
      'data-glime-ig-mobile',
      '1'
    );


    list.addEventListener(
      'click',
      function (event) {

        var item =
          event.target.closest(
            '.conversation-item'
          );


        if (!item) {
          return;
        }


        setTimeout(
          function () {

            var view =
              document.getElementById(
                'view'
              );

            var empty =
              document.getElementById(
                'empty'
              );


            if (
              isMobile() &&
              view &&
              !view.classList.contains(
                'hidden'
              ) &&
              (
                !empty ||
                empty.classList.contains(
                  'hidden'
                )
              )
            ) {

              showChat();

              addBackButton();

              addHeaderActions();

              addComposer();

            }

          },
          30
        );
      }
    );
  }


  function bindBackBehavior() {

    var close =
      document.getElementById(
        'closeConversation'
      );


    if (
      close &&
      close.getAttribute(
        'data-glime-mobile-bound'
      ) !== '1'
    ) {

      close.setAttribute(
        'data-glime-mobile-bound',
        '1'
      );


      close.addEventListener(
        'click',
        function () {

          if (isMobile()) {
            showInbox();
          }

        }
      );
    }
  }


  function observeView() {

    var view =
      document.getElementById(
        'view'
      );


    if (
      !view ||
      window.__glimeIgMobileObserver
    ) {
      return;
    }


    window.__glimeIgMobileObserver =
      new MutationObserver(
        function () {

          if (!isMobile()) {
            return;
          }


          if (
            !view.classList.contains(
              'hidden'
            )
          ) {

            showChat();

            addBackButton();

            addHeaderActions();

            addComposer();

          } else {

            showInbox();

          }

        }
      );


    window.__glimeIgMobileObserver.observe(
      view,
      {
        attributes:true,
        attributeFilter:['class']
      }
    );
  }


  function start() {

    addStyles();

    addMenu();

    addMenuButton();

    syncIdentity();

    addBackButton();

    addHeaderActions();

    addComposer();

    bindConversationList();

    bindBackBehavior();

    observeView();


    window.addEventListener(
      'resize',
      function () {

        if (!isMobile()) {

          showInbox();

          closeMenu();

        }

      },
      {
        passive:true
      }
    );


    document.addEventListener(
      'keydown',
      function (e) {

        if (
          e.key === 'Escape'
        ) {

          closeMenu();

          if (isMobile()) {
            showInbox();
          }

        }

      }
    );
  }


  if (
    document.readyState ===
    'loading'
  ) {

    document.addEventListener(
      'DOMContentLoaded',
      start,
      {
        once:true
      }
    );

  } else {

    start();

  }

})();
