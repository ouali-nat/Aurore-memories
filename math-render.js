(function () {
  "use strict";
  function render(root) {
    if (!root || !window.renderMathInElement) return;
    try { window.renderMathInElement(root, {
      delimiters: [
        {left:"\\[",right:"\\]",display:true},
        {left:"\\(",right:"\\)",display:false},
        {left:"$$",right:"$$",display:true},
        {left:"$",right:"$",display:false}
      ],
      throwOnError:false, strict:"ignore",
      ignoredTags:["script","noscript","style","textarea","pre","code","option"]
    }); } catch (e) {}
  }
  function boot() {
    if (!window.renderMathInElement) return;
    window.renderAuroreMath=render;
    render(document.body);
    if (window.MutationObserver) {
      new MutationObserver(function(records) {
        records.forEach(function(record) {
          record.addedNodes.forEach(function(node) {
            if (node.nodeType===1) render(node);
            else if (node.nodeType===3 && node.parentElement) render(node.parentElement);
          });
        });
      }).observe(document.body,{childList:true,subtree:true});
    }
  }
  var katex=document.createElement("script");
  katex.src="https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.js";
  katex.onload=function(){
    var auto=document.createElement("script");
    auto.src="https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/contrib/auto-render.min.js";
    auto.onload=boot;
    document.head.appendChild(auto);
  };
  document.head.appendChild(katex);
})();