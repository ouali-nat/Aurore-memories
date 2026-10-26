(function () {
  "use strict";
  var sources = [
    { js: "https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.js",
      auto: "https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/contrib/auto-render.min.js",
      css: "https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css" },
    { js: "https://unpkg.com/katex@0.16.22/dist/katex.min.js",
      auto: "https://unpkg.com/katex@0.16.22/dist/contrib/auto-render.min.js",
      css: "https://unpkg.com/katex@0.16.22/dist/katex.min.css" },
    { js: "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.22/katex.min.js",
      auto: "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.22/contrib/auto-render.min.js",
      css: "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.22/katex.min.css" }
  ];
  var pendingRoots = [], queuedRoots = [], observer = null, renderFrame = 0, loadRun = 0, katexRequested = false;
  var options = {
    delimiters: [
      { left: "\\[", right: "\\]", display: true },
      { left: "\\(", right: "\\)", display: false },
      { left: "$$", right: "$$", display: true },
      { left: "$", right: "$", display: false }
    ],
    throwOnError: false, strict: "ignore",
    ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code", "option"]
  };
  function asElement(root) { if (!root) return null; return root.nodeType === 3 ? root.parentElement : root; }
  function isInsideMath(root) { return !!(root && root.closest && root.closest(".katex, .katex-display")); }
  var bareCommandPattern = /\\(?:frac|dfrac|tfrac|sqrt|sum|prod|int|oint|lim|sin|cos|tan|log|ln|exp|mathrm|mathbf|boldsymbol|mathit|mathsf|mathtt|mathfrak|mathbb|mathcal|operatorname|text|textbf|displaystyle|textstyle|left|right|lfloor|rfloor|lceil|rceil|alpha|beta|gamma|delta|epsilon|varepsilon|theta|lambda|mu|pi|rho|sigma|tau|phi|psi|omega|kappa|iota|zeta|xi|eta|nu|chi|Gamma|Delta|Sigma|Omega|times|cdot|cdots|ldots|vdots|ddots|pm|mp|leq|geq|le|ge|neq|approx|equiv|propto|in|notin|infty|partial|nabla|circ|to|mapsto|longmapsto|Rightarrow|Leftarrow|Leftrightarrow|rightarrow|leftarrow|longrightarrow|longleftarrow|hookrightarrow|twoheadrightarrow|overline|underline|overbrace|underbrace|vec|hat|bar|begin|end|forall|exists|neg|land|lor|bmod|pmod|Re|Im|det|dim|ker|gcd|arg|top|bot)\b/;
  function bareMathPattern(text) {
    if (!text || /\\\(|\\\[|\$\$|(^|[^$])\$[^$\n]+\$(?!\$)/.test(text)) return false;
    return bareCommandPattern.test(text) || /(?:^|\s)[A-Za-z][A-Za-z0-9]*\s*(?:\^\{[^}]+\}|_\{[^}]+\})/.test(text);
  }
  function hasMathSource(root) {
    var text = root && (root.nodeType === 3 ? root.nodeValue : root.textContent);
    if (!text) return false;
    return /\\\[|\\\(|\$\$/.test(text) || /(^|[^$])\$[^$\n]+\$(?!\$)/.test(text) || bareMathPattern(text);
  }
  function normalizeBareLatex(root) {
    var target = asElement(root);
    if (!target || !document.createTreeWalker || isInsideMath(target)) return;
    var walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT), nodes = [], node;
    while ((node = walker.nextNode())) {
      var parent = node.parentElement;
      if (!parent || /^(SCRIPT|STYLE|TEXTAREA|PRE|CODE|NOSCRIPT|OPTION|INPUT|BUTTON|SELECT)$/.test(parent.tagName) || parent.closest(".katex, .katex-display, [contenteditable='true'], [data-no-math-normalize]")) continue;
      if (bareMathPattern(node.nodeValue)) nodes.push(node);
    }
    nodes.forEach(function (textNode) {
      var raw = textNode.nodeValue || "";
      if (/\\\(|\\\[|\$\$|(^|[^$])\$[^$\n]+\$(?!\$)/.test(raw)) return;
      var match = bareCommandPattern.exec(raw), start = match ? match.index : 0;
      var prefix = raw.slice(0, start), formula = raw.slice(start).trim();
      if (formula) textNode.nodeValue = prefix + "\\(" + formula + "\\)";
    });
  }
  function addRoot(collection, root) {
    var target = asElement(root);
    if (!target || isInsideMath(target) || !hasMathSource(target)) return;
    for (var i = collection.length - 1; i >= 0; i--) {
      var previous = collection[i];
      if (previous === target || (previous.contains && previous.contains(target))) return;
      if (target.contains && target.contains(previous)) collection.splice(i, 1);
    }
    collection.push(target);
    if (collection.length > 100) collection.splice(0, collection.length - 100);
  }
  function renderTarget(target) {
    if (!target || isInsideMath(target) || !hasMathSource(target)) return;
    normalizeBareLatex(target);
    if (!window.renderMathInElement || !hasMathSource(target)) return;
    try {
      window.renderMathInElement(target, options);
      if (typeof window.auroreMathRendered === "function") window.auroreMathRendered(target);
    } catch (error) { /* Une formule incomplète ne doit pas bloquer la navigation ou la saisie. */ }
  }
  function startKatexLoad() {
    if (window.renderMathInElement) { finishLoading(loadRun); return; }
    if (katexRequested) return;
    katexRequested = true;
    window.auroreMathStatus = "loading";
    loadRun += 1;
    loadKatex(0, loadRun);
  }
  function render(root) {
    var target = asElement(root);
    if (!target || isInsideMath(target) || !hasMathSource(target)) return;
    if (!window.renderMathInElement) {
      addRoot(pendingRoots, target);
      startKatexLoad();
      return;
    }
    renderTarget(target);
  }
  window.renderAuroreMath = render;
  function flushPending() {
    var roots = pendingRoots.splice(0);
    if (!roots.length && hasMathSource(document.body)) roots.push(document.body);
    roots.forEach(function (root) { if (root && root.isConnected !== false) renderTarget(root); });
  }
  function flushQueued() {
    renderFrame = 0;
    var roots = queuedRoots.splice(0);
    roots.forEach(function (root) { renderTarget(root); });
  }
  function queueObserved(root) {
    var target = asElement(root);
    if (!target || isInsideMath(target) || !hasMathSource(target)) return;
    if (!window.renderMathInElement) {
      addRoot(pendingRoots, target);
      startKatexLoad();
      return;
    }
    addRoot(queuedRoots, target);
    if (!renderFrame) {
      var schedule = window.requestAnimationFrame || function (callback) { return window.setTimeout(callback, 16); };
      renderFrame = schedule(flushQueued) || 1;
    }
  }
  function observeDynamicContent() {
    if (observer || !window.MutationObserver || !document.body) return;
    observer = new MutationObserver(function (records) {
      records.forEach(function (record) {
        record.addedNodes.forEach(function (node) {
          if (node.nodeType === 1) {
            if (!isInsideMath(node)) queueObserved(node);
          } else if (node.nodeType === 3 && node.parentElement && !isInsideMath(node.parentElement)) {
            queueObserved(node.parentElement);
          }
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
  function ensureStyles(index) {
    if (document.querySelector("link[data-aurore-katex-ready='true']") || document.querySelector("link[data-aurore-katex-style]")) return;
    if (index >= sources.length) return;
    var link = document.createElement("link"), settled = false;
    var timer = window.setTimeout(fallback, 2600);
    link.rel = "stylesheet"; link.href = sources[index].css;
    link.setAttribute("data-aurore-katex-style", "true");
    function fallback() {
      if (settled) return;
      settled = true; window.clearTimeout(timer); link.onload = null; link.onerror = null;
      if (link.parentNode) link.parentNode.removeChild(link);
      ensureStyles(index + 1);
    }
    link.onload = function () {
      if (settled) return;
      settled = true; window.clearTimeout(timer); link.setAttribute("data-aurore-katex-ready", "true");
    };
    link.onerror = fallback;
    document.head.appendChild(link);
  }
  function injectScript(url, onSuccess, onFailure, run) {
    var script = document.createElement("script"), settled = false;
    var timer = window.setTimeout(fail, 2600);
    function fail() {
      if (settled) return;
      settled = true; window.clearTimeout(timer); script.onload = null; script.onerror = null;
      if (script.parentNode) script.parentNode.removeChild(script);
      if (run === loadRun) onFailure();
    }
    script.onload = function () {
      if (settled) return;
      settled = true; window.clearTimeout(timer);
      if (run === loadRun) onSuccess();
    };
    script.onerror = fail; script.src = url; document.head.appendChild(script);
  }
  function finishLoading(run) {
    if (run !== loadRun || !window.renderMathInElement) return;
    window.auroreMathStatus = "ready";
    ensureStyles(0); flushPending();
    if (queuedRoots.length && !renderFrame) {
      var schedule = window.requestAnimationFrame || function (callback) { return window.setTimeout(callback, 16); };
      renderFrame = schedule(flushQueued) || 1;
    }
    observeDynamicContent();
  }
  function loadAutoRender(index, run) {
    if (run !== loadRun) return;
    if (window.renderMathInElement) { finishLoading(run); return; }
    if (index >= sources.length) { window.auroreMathStatus = "unavailable"; return; }
    injectScript(sources[index].auto, function () {
      if (window.renderMathInElement) finishLoading(run); else loadAutoRender(index + 1, run);
    }, function () { loadAutoRender(index + 1, run); }, run);
  }
  function loadKatex(index, run) {
    if (run !== loadRun) return;
    if (window.katex) { loadAutoRender(index, run); return; }
    if (index >= sources.length) { window.auroreMathStatus = "unavailable"; return; }
    injectScript(sources[index].js, function () {
      if (window.katex) loadAutoRender(index, run); else loadKatex(index + 1, run);
    }, function () { loadKatex(index + 1, run); }, run);
  }
  window.auroreMathRetry = function () {
    katexRequested = true;
    loadRun++;
    window.auroreMathStatus = "loading";
    loadKatex(0, loadRun);
  };
  observeDynamicContent();
  window.auroreMathStatus = "idle";
  if (document.body && hasMathSource(document.body)) {
    addRoot(pendingRoots, document.body);
    startKatexLoad();
  }
})();