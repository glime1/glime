/* =========================================================
   GLIME 3D — BUSINESS OPERATING LAYER
   Vanilla JavaScript
   No external libraries
   ========================================================= */

(function () {
  "use strict";

  function initGLIME3D() {
    const aiPreview = document.querySelector(".ai-preview");

    if (!aiPreview) return;

    /* Prevent duplicate initialization */
    if (document.querySelector(".glime-3d-addon")) return;

    const agents = [
      {
        id: "sales",
        name: "SALES AGENT",
        role: "LEAD & SALES",
        icon: "↗",
        text:
          "Customer enquiries ko understand karke leads, follow-ups aur sales workflow ko coordinate kar sakta hai.",
        example: "New enquiry → Lead identified → Follow-up created"
      },
      {
        id: "support",
        name: "SUPPORT AGENT",
        role: "CUSTOMER SUPPORT",
        icon: "◌",
        text:
          "Customer messages ko understand karke relevant support workflow ko route aur coordinate kar sakta hai.",
        example: "Customer message → Intent understood → Support action"
      },
      {
        id: "marketing",
        name: "MARKETING AGENT",
        role: "MARKETING",
        icon: "✦",
        text:
          "Marketing-related workflows, campaigns aur customer communication processes ko coordinate kar sakta hai.",
        example: "Campaign signal → AI decision → Marketing workflow"
      },
      {
        id: "voice",
        name: "VOICE AGENT",
        role: "VOICE",
        icon: "◉",
        text:
          "Authorized voice workflows ke through customers se communication process ko coordinate kar sakta hai.",
        example: "Approved request → Voice workflow → Customer contact"
      },
      {
        id: "operations",
        name: "OPERATIONS AGENT",
        role: "OPERATIONS",
        icon: "◆",
        text:
          "Business ke operational processes ko understand karke repetitive workflows ko organize kar sakta hai.",
        example: "Operational event → Decision → Workflow update"
      },
      {
        id: "tasks",
        name: "TASK AGENT",
        role: "TASKS",
        icon: "✓",
        text:
          "Business tasks ko create, update, complete aur follow-up workflows ke saath coordinate kar sakta hai.",
        example: "Decision → Task created → Team follow-up"
      },
      {
        id: "intelligence",
        name: "INTELLIGENCE AGENT",
        role: "BUSINESS INTELLIGENCE",
        icon: "◈",
        text:
          "Business information ko analyze karke patterns, signals aur useful operational insights identify kar sakta hai.",
        example: "Business data → Analysis → Insight"
      },
      {
        id: "care",
        name: "CARE AGENT",
        role: "CARE",
        icon: "♡",
        text:
          "CARE workflows mein authorized actions, context aur coordination ko manage karne ke liye designed hai.",
        example: "Care context → Decision → Authorized action"
      }
    ];

    /* =====================================================
       MAIN HTML
       ===================================================== */

    const wrapper = document.createElement("section");

    wrapper.className = "glime-3d-addon";

    wrapper.innerHTML = `
      <div class="glime-3d-header">
        <div>
          <span class="glime-3d-eyebrow">GLIME BUSINESS OPERATING LAYER</span>
          <h2>AI Agents That Coordinate Business Workflows</h2>
          <p>
            Business event se lekar authorized action aur workflow update tak —
            GLIME AI agents ko ek coordinated system mein connect karta hai.
          </p>
        </div>

        <div class="glime-3d-live">
          <span class="glime-3d-live-dot"></span>
          <span>SYSTEM ACTIVE</span>
        </div>
      </div>

      <div class="glime-3d-stage">

        <div class="glime-3d-grid"></div>

        <div class="glime-3d-orbit orbit-one"></div>
        <div class="glime-3d-orbit orbit-two"></div>
        <div class="glime-3d-orbit orbit-three"></div>

        <svg
          class="glime-3d-connections"
          viewBox="0 0 1000 620"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="glimeFlowGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" />
              <stop offset="50%" />
              <stop offset="100%" />
            </linearGradient>

            <filter id="glimeGlow">
              <feGaussianBlur stdDeviation="3" result="blur"/>
              <feMerge>
                <feMergeNode in="blur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>

          <line class="glime-line line-sales"
                x1="500" y1="310" x2="175" y2="105"/>

          <line class="glime-line line-support"
                x1="500" y1="310" x2="500" y2="70"/>

          <line class="glime-line line-marketing"
                x1="500" y1="310" x2="825" y2="105"/>

          <line class="glime-line line-voice"
                x1="500" y1="310" x2="900" y2="310"/>

          <line class="glime-line line-operations"
                x1="500" y1="310" x2="825" y2="515"/>

          <line class="glime-line line-tasks"
                x1="500" y1="310" x2="500" y2="550"/>

          <line class="glime-line line-intelligence"
                x1="500" y1="310" x2="175" y2="515"/>

          <line class="glime-line line-care"
                x1="500" y1="310" x2="100" y2="310"/>
        </svg>

        <div class="glime-3d-particles">
          <span class="glime-particle particle-1"></span>
          <span class="glime-particle particle-2"></span>
          <span class="glime-particle particle-3"></span>
          <span class="glime-particle particle-4"></span>
          <span class="glime-particle particle-5"></span>
          <span class="glime-particle particle-6"></span>
          <span class="glime-particle particle-7"></span>
          <span class="glime-particle particle-8"></span>
        </div>

        <!-- CENTER AI CORE -->

        <div class="glime-3d-core">

          <div class="glime-core-ring core-ring-one"></div>
          <div class="glime-core-ring core-ring-two"></div>

          <div class="glime-core-inner">

            <div class="glime-core-mark">
              G
            </div>

            <div class="glime-core-title">
              GLIME AI
            </div>

            <div class="glime-core-subtitle">
              AGENT SYSTEM
            </div>

            <div class="glime-core-status">
              <span></span>
              ORCHESTRATING
            </div>

          </div>

        </div>

        <!-- AGENT NODES -->

        <div class="glime-agent-node node-sales" data-agent="sales">
          <button type="button" aria-label="Sales Agent">
            <span class="agent-icon">↗</span>
            <strong>SALES</strong>
            <small>AGENT</small>
          </button>
        </div>

        <div class="glime-agent-node node-support" data-agent="support">
          <button type="button" aria-label="Support Agent">
            <span class="agent-icon">◌</span>
            <strong>SUPPORT</strong>
            <small>AGENT</small>
          </button>
        </div>

        <div class="glime-agent-node node-marketing" data-agent="marketing">
          <button type="button" aria-label="Marketing Agent">
            <span class="agent-icon">✦</span>
            <strong>MARKETING</strong>
            <small>AGENT</small>
          </button>
        </div>

        <div class="glime-agent-node node-voice" data-agent="voice">
          <button type="button" aria-label="Voice Agent">
            <span class="agent-icon">◉</span>
            <strong>VOICE</strong>
            <small>AGENT</small>
          </button>
        </div>

        <div class="glime-agent-node node-operations" data-agent="operations">
          <button type="button" aria-label="Operations Agent">
            <span class="agent-icon">◆</span>
            <strong>OPERATIONS</strong>
            <small>AGENT</small>
          </button>
        </div>

        <div class="glime-agent-node node-tasks" data-agent="tasks">
          <button type="button" aria-label="Task Agent">
            <span class="agent-icon">✓</span>
            <strong>TASK</strong>
            <small>AGENT</small>
          </button>
        </div>

        <div class="glime-agent-node node-intelligence" data-agent="intelligence">
          <button type="button" aria-label="Business Intelligence Agent">
            <span class="agent-icon">◈</span>
            <strong>INTELLIGENCE</strong>
            <small>AGENT</small>
          </button>
        </div>

        <div class="glime-agent-node node-care" data-agent="care">
          <button type="button" aria-label="Care Agent">
            <span class="agent-icon">♡</span>
            <strong>CARE</strong>
            <small>AGENT</small>
          </button>
        </div>

      </div>

      <!-- CONTEXT PANEL -->

      <div class="glime-3d-context">

        <div class="glime-context-label">
          AGENT CONTEXT
        </div>

        <div class="glime-context-content">

          <div class="glime-context-icon">
            G
          </div>

          <div>
            <div class="glime-context-title">
              GLIME AI AGENT SYSTEM
            </div>

            <p class="glime-context-text">
              Kisi bhi agent par hover ya tap karke uska role aur workflow dekhein.
            </p>

            <div class="glime-context-example">
              <span>EXAMPLE</span>
              <strong>
                Business Event → AI → Authorized Action
              </strong>
            </div>
          </div>

        </div>

      </div>

      <!-- PROCESSING PIPELINE -->

      <div class="glime-3d-processing">

        <div class="glime-processing-head">
          <span>WORKFLOW ENGINE</span>
          <span class="glime-processing-state">
            <i></i>
            PROCESSING
          </span>
        </div>

        <div class="glime-processing-track">

          <div class="glime-process-step active" data-step="0">
            <span>01</span>
            <strong>BUSINESS EVENT</strong>
          </div>

          <div class="glime-process-arrow">→</div>

          <div class="glime-process-step" data-step="1">
            <span>02</span>
            <strong>AI UNDERSTANDS</strong>
          </div>

          <div class="glime-process-arrow">→</div>

          <div class="glime-process-step" data-step="2">
            <span>03</span>
            <strong>AGENT DECIDES</strong>
          </div>

          <div class="glime-process-arrow">→</div>

          <div class="glime-process-step" data-step="3">
            <span>04</span>
            <strong>AUTHORIZED ACTION</strong>
          </div>

          <div class="glime-process-arrow">→</div>

          <div class="glime-process-step" data-step="4">
            <span>05</span>
            <strong>WORKFLOW UPDATED</strong>
          </div>

        </div>

      </div>

      <!-- LIVE EXAMPLE -->

      <div class="glime-3d-example">

        <div class="glime-example-label">
          LIVE WORKFLOW MODEL
        </div>

        <div class="glime-example-flow">

          <span class="example-item">NEW CUSTOMER MESSAGE</span>

          <span class="example-arrow">→</span>

          <span class="example-item" data-example-agent>
            SUPPORT AGENT
          </span>

          <span class="example-arrow">→</span>

          <span class="example-item">
            SALES AGENT
          </span>

          <span class="example-arrow">→</span>

          <span class="example-item">
            TASK AGENT
          </span>

          <span class="example-arrow">→</span>

          <span class="example-item">
            WORKFLOW UPDATED
          </span>

        </div>

      </div>

      <div class="glime-3d-footnote">
        AI actions are designed around business context, permissions and authorization.
      </div>
    `;

    /*
     * Insert the visual before the existing workflow section.
     * This keeps the original index.html structure untouched.
     */

    const workflow = aiPreview.querySelector(".workflow");

    if (workflow) {
      aiPreview.insertBefore(wrapper, workflow);
    } else {
      aiPreview.appendChild(wrapper);
    }

    /* =====================================================
       INTERACTION
       ===================================================== */

    const nodes = wrapper.querySelectorAll(".glime-agent-node");

    const contextTitle = wrapper.querySelector(".glime-context-title");
    const contextText = wrapper.querySelector(".glime-context-text");
    const contextExample = wrapper.querySelector(
      ".glime-context-example strong"
    );

    const contextIcon = wrapper.querySelector(".glime-context-icon");

    const exampleAgent = wrapper.querySelector("[data-example-agent]");

    function activateAgent(id) {
      const agent = agents.find((item) => item.id === id);

      if (!agent) return;

      nodes.forEach((node) => {
        node.classList.remove("active");

        if (node.dataset.agent === id) {
          node.classList.add("active");
        }
      });

      contextTitle.textContent = agent.name;
      contextText.textContent = agent.text;
      contextExample.textContent = agent.example;
      contextIcon.textContent = agent.icon;

      if (exampleAgent) {
        exampleAgent.textContent = agent.name;
      }
    }

    nodes.forEach((node) => {
      const button = node.querySelector("button");

      if (!button) return;

      button.addEventListener("mouseenter", function () {
        activateAgent(node.dataset.agent);
      });

      button.addEventListener("focus", function () {
        activateAgent(node.dataset.agent);
      });

      button.addEventListener("click", function () {
        activateAgent(node.dataset.agent);
      });
    });

    /* =====================================================
       PROCESSING PIPELINE
       ===================================================== */

    const processSteps = wrapper.querySelectorAll(
      ".glime-process-step"
    );

    let currentStep = 0;
    let processingTimer = null;

    function updateProcessing() {
      processSteps.forEach((step, index) => {
        step.classList.toggle(
          "active",
          index === currentStep
        );

        step.classList.toggle(
          "completed",
          index < currentStep
        );
      });

      currentStep++;

      if (currentStep >= processSteps.length) {
        currentStep = 0;
      }
    }

    function startProcessing() {
      if (processingTimer) return;

      processingTimer = setInterval(
        updateProcessing,
        2400
      );
    }

    function stopProcessing() {
      if (!processingTimer) return;

      clearInterval(processingTimer);
      processingTimer = null;
    }

    /* =====================================================
       INTERSECTION OBSERVER
       Pause animation when visual is not visible.
       ===================================================== */

    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(
        function (entries) {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              startProcessing();
            } else {
              stopProcessing();
            }
          });
        },
        {
          threshold: 0.15
        }
      );

      observer.observe(wrapper);
    } else {
      startProcessing();
    }

    /* =====================================================
       MOUSE PARALLAX
       Desktop only
       ===================================================== */

    const stage = wrapper.querySelector(
      ".glime-3d-stage"
    );

    if (stage && window.matchMedia(
      "(hover: hover) and (pointer: fine)"
    ).matches) {

      let targetX = 0;
      let targetY = 0;
      let currentX = 0;
      let currentY = 0;
      let animationFrame = null;

      function animateParallax() {
        currentX += (targetX - currentX) * 0.08;
        currentY += (targetY - currentY) * 0.08;

        stage.style.setProperty(
          "--mouse-x",
          currentX.toFixed(2)
        );

        stage.style.setProperty(
          "--mouse-y",
          currentY.toFixed(2)
        );

        animationFrame = requestAnimationFrame(
          animateParallax
        );
      }

      stage.addEventListener(
        "pointermove",
        function (event) {
          const rect = stage.getBoundingClientRect();

          const x =
            (event.clientX - rect.left) /
            rect.width;

          const y =
            (event.clientY - rect.top) /
            rect.height;

          targetX = (x - 0.5) * 2;
          targetY = (y - 0.5) * 2;

          if (!animationFrame) {
            animationFrame =
              requestAnimationFrame(
                animateParallax
              );
          }
        }
      );

      stage.addEventListener(
        "pointerleave",
        function () {
          targetX = 0;
          targetY = 0;
        }
      );
    }

    /* =====================================================
       REDUCED MOTION SUPPORT
       ===================================================== */

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );

    if (reducedMotion.matches) {
      stopProcessing();
    }

    /* =====================================================
       DEFAULT AGENT
       ===================================================== */

    activateAgent("support");
  }

  /* =======================================================
     INIT
     ======================================================= */

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initGLIME3D
    );
  } else {
    initGLIME3D();
  }

})();
