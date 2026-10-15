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
  var pendingRoots = [], queuedRoots = [], observer = null, renderFrame = 0, loadRun = 0;
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
  function hasMathSource(root) {
    var text = root && (root.nodeType === 3 ? root.nodeValue : root.textContent);
    return !!text && (text.indexOf("\\[") !== -1 || text.indexOf("\\(") !== -1 || text.indexOf("$$") !== -1 || text.indexOf("$") !== -1);
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
    if (!target || isInsideMath(target) || !window.renderMathInElement || !hasMathSource(target)) return;
    try { window.renderMathInElement(target, options); }
    catch (error) { /* Une formule incomplète ne doit pas bloquer la navigation ou la saisie. */ }
  }
  function render(root) {
    var target = asElement(root);
    if (!target || isInsideMath(target)) return;
    if (!window.renderMathInElement) { addRoot(pendingRoots, target); return; }
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
    if (!window.renderMathInElement) { addRoot(pendingRoots, target); return; }
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
    loadRun++; window.auroreMathStatus = "loading"; loadKatex(0, loadRun);
  };
  observeDynamicContent(); ensureStyles(0);
  window.auroreMathStatus = "loading"; loadRun++; loadKatex(0, loadRun);
})();