(function () {
  "use strict";

  // Le moteur est exposé immédiatement : l’éditeur peut demander un rendu
  // même si les bibliothèques KaTeX n’ont pas fini de se charger.
  var sources = [
    {
      js: "https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.js",
      auto: "https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/contrib/auto-render.min.js",
      css: "https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css"
    },
    {
      js: "https://unpkg.com/katex@0.16.22/dist/katex.min.js",
      auto: "https://unpkg.com/katex@0.16.22/dist/contrib/auto-render.min.js",
      css: "https://unpkg.com/katex@0.16.22/dist/katex.min.css"
    },
    {
      js: "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.22/katex.min.js",
      auto: "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.22/contrib/auto-render.min.js",
      css: "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.22/katex.min.css"
    }
  ];

  var pendingRoots = [];
  var observer = null;
  var ready = false;

  function render(root) {
    if (!root) return;
    var target = root.nodeType === 3 ? root.parentElement : root;
    if (!target) return;

    if (!window.renderMathInElement) {
      if (pendingRoots.indexOf(target) === -1) pendingRoots.push(target);
      return;
    }

    try {
      window.renderMathInElement(target, {
        delimiters: [
          { left: "\\[", right: "\\]", display: true },
          { left: "\\(", right: "\\)", display: false },
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false }
        ],
        throwOnError: false,
        strict: "ignore",
        ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code", "option"]
      });
    } catch (error) {
      // Un contenu incomplet pendant la saisie ne doit pas interrompre l’éditeur.
    }
  }

  // Fonction disponible avant le chargement asynchrone des scripts.
  window.renderAuroreMath = render;

  function ensureStyles(index) {
    if (document.querySelector("link[data-aurore-katex-style]")) return;
    if (index >= sources.length) return;

    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = sources[index].css;
    link.setAttribute("data-aurore-katex-style", "true");
    link.onerror = function () {
      link.remove();
      ensureStyles(index + 1);
    };
    document.head.appendChild(link);
  }

  function finishLoading() {
    if (!window.renderMathInElement) return;
    ready = true;
    ensureStyles(0);

    // Le rendu global couvre les champs qui ont reçu du texte avant KaTeX.
    render(document.body);
    pendingRoots.length = 0;

    if (!observer && window.MutationObserver && document.body) {
      observer = new MutationObserver(function (records) {
        records.forEach(function (record) {
          record.addedNodes.forEach(function (node) {
            if (node.nodeType === 1) {
              if (!(node.matches && node.matches(".katex"))) render(node);
            } else if (node.nodeType === 3 && node.parentElement) {
              if (!(node.parentElement.closest && node.parentElement.closest(".katex"))) {
                render(node.parentElement);
              }
            }
          });
        });
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  function loadAutoRender(index) {
    if (window.renderMathInElement) {
      finishLoading();
      return;
    }
    if (index >= sources.length) {
      window.auroreMathStatus = "unavailable";
      return;
    }

    var script = document.createElement("script");
    script.src = sources[index].auto;
    script.onload = function () {
      if (window.renderMathInElement) finishLoading();
      else loadAutoRender(index + 1);
    };
    script.onerror = function () { loadAutoRender(index + 1); };
    document.head.appendChild(script);
  }

  function loadKatex(index) {
    if (window.katex) {
      loadAutoRender(index);
      return;
    }
    if (index >= sources.length) {
      window.auroreMathStatus = "unavailable";
      return;
    }

    var script = document.createElement("script");
    script.src = sources[index].js;
    script.onload = function () {
      if (window.katex) loadAutoRender(index);
      else loadKatex(index + 1);
    };
    script.onerror = function () { loadKatex(index + 1); };
    document.head.appendChild(script);
  }

  // Une reprise manuelle permet aux pages de retenter le rendu si nécessaire.
  window.auroreMathRetry = function () {
    window.auroreMathStatus = "loading";
    loadKatex(0);
  };

  ensureStyles(0);
  window.auroreMathStatus = "loading";
  loadKatex(0);
})();