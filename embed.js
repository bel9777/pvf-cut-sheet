/* Park View Farm cut sheet builder: embed loader.
   Paste this on a GrazeCart custom page:

     <div id="pvf-cut-sheet"></div>
     <script src="https://bel9777.github.io/pvf-cut-sheet/embed.js" defer></script>

   Everything loads from GitHub Pages, so updates ship from the repo without
   touching GrazeCart again. */
(function () {
  var BASE = "https://bel9777.github.io/pvf-cut-sheet/";
  var mount = document.getElementById("pvf-cut-sheet");
  if (!mount || mount.dataset.loaded) return;
  mount.dataset.loaded = "1";
  window.PVF_CUT_SHEET_BASE = BASE;

  var link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = BASE + "style.css";
  document.head.appendChild(link);

  function load(name, next) {
    var s = document.createElement("script");
    s.src = BASE + name;
    s.onload = next;
    s.onerror = function () {
      mount.innerHTML = '<p style="text-align:center;padding:24px;">The cut sheet builder couldn\'t load. ' +
        '<a href="' + BASE + '">Open it here instead</a>, or call or text Brian at 585-484-0799.</p>';
    };
    document.body.appendChild(s);
  }
  load("model.js", function () { load("sheet.js", function () { load("app.js"); }); });
})();
