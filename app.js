/* Park View Farm cut sheet builder: the page. All rules live in model.js. */
(function () {
  "use strict";
  var M = window.PVFModel, C = M.CONFIG, mount = document.getElementById("pvf-cut-sheet");
  if (!mount) return;
  var BASE = window.PVF_CUT_SHEET_BASE || "";
  var STORE_KEY = "pvf-cut-sheet-v1";
  var todayIso = M.todayNY();
  var params = new URLSearchParams(location.search);
  var addressReserved = false; // the address said the buyer has already reserved (a link from the deposit email)

  var STEPS = [
    { id: "start", label: "Your hog" },
    { id: "preset", label: "Start here" },
    { id: "loin", label: "The loin", title: "The loin", intro: "Chops, and the tenderloin if you want it on its own." },
    { id: "shoulder", label: "The shoulder", title: "The shoulder", intro: "This is where pulled pork comes from. Anything you don't want goes into the grind." },
    { id: "ham", label: "The ham", title: "The hams", intro: "The biggest cut on the hog." },
    { id: "belly", label: "Belly and ribs", title: "Belly, ribs and the smoked things", intro: "Smoked bacon, jowl and hocks each add a little to your price per pound. Fresh costs less." },
    { id: "ground", label: "The grind", title: "Ground and sausage", intro: "Everything you've sent to the grind ends up here, plus the trim. A half gets one choice." },
    { id: "extras", label: "Extras", title: "Anything else?", intro: "These are yours if you want them, at no charge." },
    { id: "review", label: "Review" },
    { id: "done", label: "Done" }
  ];
  var CAT = { "Chops and loin": "chops", "Roasts and steaks": "roasts", "Ham": "ham", "Bacon and smoked": "bacon", "Ground and sausage": "ground" };

  var NOTE_LONG = "Your note is too long to fit on Timberline's sheet.";
  var STALE_MESSAGE = "We've updated this page since you opened it. Reload it to see the current prices, then send again. Your choices are saved.";
  var NOTE_WONT_FIT ="That won't fit on Timberline's sheet with your other choices. Shorten it a little.";

  function freshState() {
    return {
      step: "start", side: "half", batch: "", preset: "standard", cure: "natural", answers: M.applyPreset("standard"),
      extras: { fat: false, bones: false, organs: [] }, instructions: "", name: "", email: "", phone: "",
      order: "", delivery: "", reserved: "", visited: {}, sent: null, noteRefused: false, submission: null
    };
  }
  var state = freshState(), hadDraft = false;

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ step: state.step === "done" ? "review" : state.step, side: state.side, batch: state.batch, preset: state.preset, cure: state.cure,
        answers: state.answers, extras: state.extras, instructions: state.instructions, name: state.name, email: state.email,
        phone: state.phone, order: state.order, delivery: state.delivery, reserved: state.reserved, visited: state.visited, submission: state.submission }));
    } catch (e) { /* private window */ }
  }
  /* A buyer who has reserved has no date of their own: the deposit holds it. Whenever the answer becomes yes, any date goes. */
  function setReserved(v) {
    state.reserved = v === "yes" || v === "no" ? v : "";
    if (state.reserved === "yes") state.batch = "";
  }
  /* What the address can set: the size, whether the buyer has reserved (reserved=1 or reserved=yes, or a deposit order
     number, which means the same thing) and, only when they have not, an open processing date. */
  function applyParams() {
    if (params.get("side") === "whole" || params.get("side") === "half") state.side = params.get("side");
    var rp = String(params.get("reserved") || "").toLowerCase();
    if (rp === "1" || rp === "yes") { setReserved("yes"); addressReserved = true; }
    if (params.get("order")) { state.order = String(params.get("order")).slice(0, C.limits.order); setReserved("yes"); addressReserved = true; }
    var pb = M.batch(params.get("batch") || "");
    if (pb && M.batchOpen(pb, todayIso) && state.reserved !== "yes") state.batch = pb.id;
  }
  function restore() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) { var sv = JSON.parse(raw); hadDraft = true; Object.keys(sv).forEach(function (k) { state[k] = sv[k]; }); }
    } catch (e) { /* start fresh */ }
    state.extras = M.cleanExtras(state.extras);
    state.instructions = M.cleanNote(state.instructions);
    state.order = String(state.order == null ? "" : state.order).slice(0, C.limits.order);
    setReserved(state.reserved);
    state.name = String(state.name == null ? "" : state.name).slice(0, C.limits.name);
    if (M.PRESETS.map(function (p) { return p.id; }).indexOf(state.preset) < 0) state.preset = "custom";
    if (M.DELIVERY.indexOf(state.delivery) < 0) state.delivery = "";
    var sub = state.submission;
    if (!sub || typeof sub !== "object" || typeof sub.key !== "string" || typeof sub.id !== "string" || !/^[A-Za-z0-9_-]{16,64}$/.test(sub.id)) state.submission = null;
    if (state.cure !== "natural" && state.cure !== "regular") state.cure = state.answers && state.answers.smoke_style === "regular" ? "regular" : "natural";
    applyParams();
    var hash = location.hash.match(/s=([\w-]+)/);
    if (hash) {
      var shared = M.decodeShare(hash[1]);
      if (shared) {
        var r = M.applyShare(state, shared);
        if (!M.batch(r.batch)) r.batch = state.batch;
        /* The link says true or false; a link that does not say hands back the draft's own yes, no or empty. */
        r.reserved = r.reserved === true ? "yes" : r.reserved === false ? "no" : r.reserved === "yes" || r.reserved === "no" ? r.reserved : "";
        Object.keys(r).forEach(function (k) { state[k] = r[k]; });
        setReserved(state.reserved);
        state.cure = r.answers.smoke_style === "regular" ? "regular" : "natural";
        if (M.PRESETS.map(function (p) { return p.id; }).indexOf(state.preset) < 0) state.preset = "custom";
        state.step = "review";
      }
    }
    /* A buyer coming from the deposit email has nothing to say on the first screen. */
    if (addressReserved && state.reserved === "yes" && state.step === "start") state.step = "preset";
  }

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function money(x) { return "$" + (Math.round(x) === x ? x.toLocaleString("en-US") : x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })); }
  function stepIndex(id) { return STEPS.map(function (s) { return s.id; }).indexOf(id); }
  function a() { return M.normalize(state.answers, state.side); }
  /* The answers as priced: the customer's cure choice is kept even while nothing smoked needs it. */
  function priced() {
    var x = {};
    Object.keys(state.answers).forEach(function (k) { x[k] = state.answers[k]; });
    x.smoke_style = state.cure;
    return x;
  }
  function renorm() { state.answers = M.normalize(priced(), state.side); }
  function isReserved() { return state.reserved === "yes"; }
  /* The state the model checks and writes from. A reserved sheet has no date of its own. */
  function modelState() {
    return { side: state.side, batch: isReserved() ? "" : state.batch, reserved: isReserved(), answers: state.answers, extras: state.extras,
      instructions: state.instructions, order: state.order };
  }
  function fitState() { return modelState(); }
  function anyOpen() { return C.batches.some(function (x) { return M.batchOpen(x, todayIso); }); }
  /* May the sheet be sent today? Reserved: while any processing date is still open. Not yet: its own date must be open. */
  function sendable() {
    if (state.reserved === "yes") return anyOpen();
    if (state.reserved === "no") { var sb = M.batch(state.batch); return !!(sb && M.batchOpen(sb, todayIso)); }
    return false;
  }
  /* Does the note fit Timberline's box? The review also counts a note the receiver has refused. */
  function reviewFits() { return !state.noteRefused && M.noteFits(fitState()); }
  /* Keeps the note warnings and the Send button honest while someone types, without drawing the page again. */
  function syncFit() {
    var fits = M.noteFits(fitState()), live = document.getElementById("cs-notefit"), long = document.getElementById("cs-notelong"), send = document.getElementById("cs-send");
    if (live) { live.textContent = fits ? "" : NOTE_WONT_FIT; live.hidden = fits; }
    if (long) long.hidden = reviewFits();
    if (send) send.disabled = !(sendable() && reviewFits());
  }
  /* Starts over: the saved draft is cleared and the page goes back to its first screen. The address keeps its say. */
  function startNew() {
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* private window */ }
    try { if (location.hash) history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* no history */ }
    state = freshState();
    applyParams();
    renorm();
    hadDraft = false;
    render();
  }

  /* The hog, drawn like a butcher's chart: one outline (body and the two near legs),
     the far legs behind it, and the four cuts clipped to the outline so the art stays in one piece. */
  function pigSvg() {
    var INK = "#1E1E1C";
    var body = "M 66 135 C 58 130, 47 133, 46 144 L 41 167 C 40 178, 47 186, 58 187 C 73 189, 85 194, 94 202 " +
      "C 104 214, 122 225, 146 229 C 158 231, 167 234, 172 240 C 173 258, 175 280, 176 296 C 176 303, 180 306, 186 306 " +
      "L 201 306 C 207 306, 209 302, 208 296 C 207 280, 206 264, 206 250 C 240 262, 300 268, 352 266 " +
      "C 400 264, 432 256, 454 245 C 470 252, 482 262, 484 276 C 484 284, 482 290, 481 296 C 481 303, 485 306, 491 306 " +
      "L 507 306 C 513 306, 515 302, 514 296 C 513 284, 512 274, 518 262 C 522 254, 526 248, 530 242 " +
      "C 549 219, 562 186, 558 152 C 555 126, 540 104, 516 92 C 470 70, 400 62, 330 63 C 268 64, 215 76, 186 80 " +
      "C 180 81, 174 80, 170 77 C 168 60, 156 44, 138 34 C 132 46, 127 62, 126 82 C 116 86, 106 93, 99 104 C 97 118, 85 131, 66 135 Z";
    function hoof(x1, x2) {
      return '<path fill="' + INK + '" d="M ' + x1 + " 294 L " + x2 + " 294 L " + x2 + " 297 C " + (x2 + 1) + " 303, " + (x2 - 2) + " 306, " + (x2 - 7) +
        " 306 L " + (x1 + 10) + " 306 C " + (x1 + 4) + " 306, " + x1 + " 303, " + x1 + ' 297 Z"/>';
    }
    function farLeg(d) { return '<path class="cs-farleg" d="' + d + '"/>'; }
    function region(id, label, d, tx, ty) {
      var cls = "cs-region" + (state.step === id ? " is-on" : state.visited[id] ? " is-done" : "");
      return '<path class="' + cls + '" data-go="' + id + '" d="' + d + '" tabindex="0" role="button" aria-label="' + label + '"></path>' +
        '<text x="' + tx + '" y="' + ty + '">' + label + "</text>";
    }
    return '<svg class="cs-pig" viewBox="20 30 600 290" role="group" aria-label="Pick a part of the hog">' +
      '<defs><clipPath id="cs-pigclip"><path d="' + body + '"/></clipPath></defs>' +
      farLeg("M 108 94 C 105 72, 109 53, 119 41 C 128 53, 132 69, 132 86 Z") + /* the far ear, behind the head */
      farLeg("M 220 240 C 221 262, 222 282, 223 296 C 223 303, 227 306, 233 306 L 246 306 C 252 306, 254 302, 253 296 C 252 280, 251 262, 251 242 Z") + hoof(223, 253) +
      farLeg("M 432 236 C 442 248, 448 266, 448 284 C 448 289, 446 293, 445 296 C 445 303, 449 306, 455 306 L 468 306 C 474 306, 476 302, 475 296 C 474 278, 474 258, 476 236 Z") + hoof(445, 475) +
      '<g clip-path="url(#cs-pigclip)">' +
      '<path class="cs-static" d="M 0 0 L 180 0 C 172 80, 162 160, 174 330 L 0 330 Z"></path>' +
      region("shoulder", "Shoulder", "M 180 0 C 172 80, 162 160, 174 330 L 296 330 C 286 250, 286 130, 300 0 Z", 236, 170) +
      region("loin", "Loin", "M 300 0 L 476 0 C 470 60, 464 120, 458 166 C 400 157, 340 157, 290 168 C 289 110, 293 50, 300 0 Z", 378, 122) +
      region("belly", "Belly", "M 290 168 C 340 157, 400 157, 458 166 C 454 220, 448 280, 442 330 L 296 330 C 290 280, 288 220, 290 168 Z", 372, 222) +
      region("ham", "Ham", "M 476 0 C 464 100, 452 200, 442 330 L 640 330 L 640 0 Z", 510, 174) +
      "</g>" +
      '<path class="cs-outline" stroke-linejoin="round" d="' + body + '"/>' + hoof(176, 208) + hoof(481, 514) +
      '<path class="cs-outline" stroke-linecap="round" d="M 547 117 C 558 103, 575 108, 571 121 C 568 131, 555 129, 557 120 C 558 114, 567 113, 571 118"/>' +
      '<path class="cs-outline cs-detail" stroke-linecap="round" d="M 141 46 C 138 58, 138 70, 141 79"/>' +
      '<path class="cs-outline cs-detail" stroke-linecap="round" d="M 58 187 C 69 186, 80 181, 87 172"/>' +
      '<circle cx="104" cy="127" r="3.6" fill="' + INK + '"/><circle cx="47" cy="157" r="2.2" fill="' + INK + '"/>' +
      "</svg>";
  }

  function signed(x) { return (x < 0 ? "- $" : "+ $") + Math.abs(x).toFixed(2); }
  function perLbTag(x) { return '<span class="cs-tag">' + signed(x) + "/lb</span>"; }
  function rateWith(key, value) {
    var tryIt = priced();
    tryIt[key] = value;
    return M.estimate(tryIt, state.side).rate;
  }
  /* What this option does to the price per pound, for the other choices as they stand now.
     A smoked option adds its amount at the chosen cure. Links move with the grind, so ask the model with this pick in place.
     The cure question shows what the other cure would do to the price. */
  function tag(op, key) {
    if (key === "smoke_style") {
      if (op.v === state.cure) return "";
      var diff = Math.round((rateWith(key, op.v) - rateWith(key, state.cure)) * 100) / 100;
      return diff ? perLbTag(diff) : "";
    }
    if (!op.addon) return "";
    if (op.addon.indexOf("cure:") === 0) return perLbTag(M.cureAmount(op.addon.split(":")[1], state.cure));
    var tryIt = priced();
    tryIt[key] = op.v;
    var item = M.addons(tryIt, state.side).items.filter(function (i) { return i.label === op.l; })[0];
    return item ? perLbTag(item.perLb) : "";
  }
  function optionHtml(row, op, selected) {
    return '<label class="cs-opt"><input type="radio" name="' + row.key + '" value="' + esc(op.v) + '"' + (selected ? " checked" : "") + '>' +
      '<span class="cs-opt__box"><span class="cs-opt__label">' + esc(op.l) + "</span>" +
      (op.d ? '<span class="cs-opt__desc">' + esc(op.d) + "</span>" : "") + tag(op, row.key) + "</span></label>";
  }
  /* Sausage is two quick picks, flavor then loose or links, not 19 boxes. */
  var FLAVORS = [["ground_pork", "Plain ground pork", M.option("sausage_1", "ground_pork").d]].concat(M.FLAVORS.map(function (f) { return [f.id, f.name, f.d]; }));
  function flavorOf(v) { return v === "ground_pork" ? v : v.replace(/_(bulk|links|rope)$/, ""); }
  function linkOf(row, flavor) { return row.options.filter(function (o) { return flavorOf(o.v) === flavor && o.addon; })[0]; }
  function sausageValue(row, flavor, wantLinks) {
    if (flavor === "ground_pork") return flavor;
    return wantLinks ? linkOf(row, flavor).v : flavor + "_bulk";
  }
  function sausageHtml(row, value) {
    var flavor = flavorOf(value), isLinks = !!M.option(row.key, value).addon;
    var html = '<div class="cs-opts cs-opts--flavors">' + FLAVORS.map(function (f) {
      return '<label class="cs-opt"><input type="radio" name="flavor-' + row.key + '" value="' + f[0] + '"' + (flavor === f[0] ? " checked" : "") + '>' +
        '<span class="cs-opt__box"><span class="cs-opt__label">' + esc(f[1]) + '</span><span class="cs-opt__desc">' + esc(f[2]) + "</span></span></label>";
    }).join("") + "</div>";
    if (flavor === "ground_pork") return html;
    var link = linkOf(row, flavor), opt = function (v, label, desc, on, extra) {
      return '<label class="cs-opt"><input type="radio" name="form-' + row.key + '" value="' + v + '"' + (on ? " checked" : "") + '>' +
        '<span class="cs-opt__box"><span class="cs-opt__label">' + label + '</span><span class="cs-opt__desc">' + desc + "</span>" + extra + "</span></label>";
    };
    return html + '<div class="cs-group">How do you want it?</div><div class="cs-opts cs-opts--compact">' +
      opt("bulk", "Loose", "In 1 lb packs. Included.", !isLinks, "") +
      opt("links", "Links", link.addon === "rope" ? "Full-size links." : "Small links.", isLinks, tag(link, row.key)) + "</div>";
  }
  function rowHtml(row) {
    var n = a();
    if (!M.isVisible(row, n, state.side)) return "";
    var title = row.key === "sausage_1" && state.side === "whole" ? "First half of the hog" : row.title;
    var html = '<fieldset class="cs-block"><legend>' + esc(title) + "</legend>";
    if (row.note) html += '<p class="cs-note">' + esc(row.note) + "</p>";
    if (row.sausage) {
      html += sausageHtml(row, n[row.key]);
    } else {
      html += '<div class="cs-opts' + (row.compact ? " cs-opts--compact" : "") + '">';
      row.options.forEach(function (o) { html += optionHtml(row, o, n[row.key] === o.v); });
      html += "</div>";
    }
    return html + "</fieldset>";
  }

  function navHtml(backTo, nextTo, nextLabel, extra) {
    return '<div class="cs-nav">' + (backTo ? '<button type="button" class="cs-btn" data-go="' + backTo + '">Back</button>' : "<span></span>") +
      '<div class="cs-nav__right">' + (extra || "") + '<button type="button" class="cs-btn cs-btn--primary" data-go="' + nextTo + '">' + esc(nextLabel) + "</button></div></div>";
  }

  function timingHtml() {
    return '<div class="cs-block cs-timing"><p class="cs-blocktitle">How the timing works</p><ol class="cs-timeline cs-clear">' +
      M.timingLines().map(function (l) { return "<li>" + esc(l) + "</li>"; }).join("") + "</ol></div>";
  }
  function viewStart() {
    var bs = C.batches.map(function (b) {
      var open = M.batchOpen(b, todayIso);
      return '<label class="cs-opt"><input type="radio" name="batch" value="' + b.id + '"' + (state.batch === b.id ? " checked" : "") + (open ? "" : " disabled") + '>' +
        '<span class="cs-opt__box"><span class="cs-opt__label">' + esc(M.shortDate(b.processing)) + '</span><span class="cs-opt__desc">' +
        (open ? "Cut sheet due " + esc(M.shortDate(b.due)) : "Closed " + esc(M.shortDate(b.due)) + ".") + "</span></span></label>";
    }).join("");
    function sideCard(id, name) {
      var e = M.estimate(M.defaults(), id);
      return '<label class="cs-opt"><input type="radio" name="side" value="' + id + '"' + (state.side === id ? " checked" : "") + '>' +
        '<span class="cs-opt__box"><span class="cs-opt__label">' + name + '</span><span class="cs-opt__desc">About ' + e.takeHome + " lb of pork.<br>Starting at $" +
        C.freshRate[id].toFixed(2) + "/lb hanging weight, butcher included.<br>" +
        (id === "whole" ? "Two sausage choices, one for each half." : "One sausage choice.") + "</span></span></label>";
    }
    function reservedCard(v, label, desc) {
      return '<label class="cs-opt"><input type="radio" name="reserved" value="' + v + '"' + (state.reserved === v ? " checked" : "") + '>' +
        '<span class="cs-opt__box"><span class="cs-opt__label">' + esc(label) + '</span><span class="cs-opt__desc">' + esc(desc) + "</span></span></label>";
    }
    return '<div class="cs-step"><h2 class="cs-steptitle">First, your hog</h2><p class="cs-stepintro">Reserved or just looking, start here.</p>' +
      (hadDraft ? '<p class="cs-note">Picking up where you left off. <button type="button" class="cs-link" id="cs-newsheet">Start a new sheet</button></p>' : "") +
      '<fieldset class="cs-block"><legend>How much?</legend><div class="cs-opts">' + sideCard("half", "Half hog") + sideCard("whole", "Whole hog") + "</div></fieldset>" +
      '<fieldset class="cs-block"><legend>Have you reserved yet?</legend><div class="cs-opts cs-opts--two">' +
      reservedCard("yes", "Yes, my deposit is down", "We use the processing date you picked at checkout. Nothing to pick here.") +
      reservedCard("no", "Not yet", "Pick a date below to see your deadlines. " + money(C.deposit[state.side]) + " holds a " + (state.side === "whole" ? "whole hog." : "half.")) +
      "</div></fieldset>" +
      (state.reserved === "no" ? '<fieldset class="cs-block"><legend>Which processing date?</legend><div class="cs-opts cs-opts--compact">' + bs + "</div></fieldset>" : "") +
      timingHtml() +
      navHtml(null, "preset", "Next") + "</div>";
  }
  function viewPreset() {
    var size = state.side === "whole" ? "whole" : "half", custom = state.preset === "custom";
    var cards = M.PRESETS.map(function (p) {
      var e = M.estimate(M.applyPreset(p.id, state.cure), state.side);
      return '<label class="cs-opt"><input type="radio" name="preset" value="' + p.id + '"' + (state.preset === p.id ? " checked" : "") + '>' +
        '<span class="cs-opt__box"><span class="cs-opt__label">' + esc(p.name) + '</span><span class="cs-opt__desc">' + esc(M.presetBlurb(p, state.side)) + "</span>" +
        '<span class="cs-opt__price">$' + e.rate.toFixed(2) + '/lb</span><span class="cs-opt__small">about ' + money(Math.round(e.total)) + " on a typical " + size + "</span></span></label>";
    }).join("");
    var own = '<label class="cs-opt"><input type="radio" name="preset" value="custom"' + (custom ? " checked" : "") + '>' +
      '<span class="cs-opt__box"><span class="cs-opt__label">Build your own</span><span class="cs-opt__desc">Go through the hog cut by cut: chops, roasts, ham, bacon and sausage. About five minutes. From $' +
      C.freshRate[state.side].toFixed(2) + "/lb.</span></span></label>";
    var cure = M.ROW.smoke_style.options.map(function (op) {
      return '<label class="cs-opt"><input type="radio" name="cure" value="' + op.v + '"' + (state.cure === op.v ? " checked" : "") + '>' +
        '<span class="cs-opt__box"><span class="cs-opt__label">' + esc(op.l) + '</span><span class="cs-opt__desc">' + esc(op.d) + "</span>" + tag(op, "smoke_style") + "</span></label>";
    }).join("");
    var showCure = custom || M.smokeNeeded(M.applyPreset(state.preset));
    var nav = custom ? navHtml("start", "loin", "Start building") :
      navHtml("start", "review", "Use this package", '<button type="button" class="cs-btn" data-go="loin">Change a few things</button>');
    return '<div class="cs-step"><h2 class="cs-steptitle">How do you want to do this?</h2><p class="cs-stepintro">Pick one of our packages and you&rsquo;re done, or build your own cut by cut.</p>' +
      '<fieldset class="cs-block"><legend>Pick a package</legend><div class="cs-opts cs-opts--two">' + cards + "</div></fieldset>" +
      '<fieldset class="cs-block"><legend>Or build your own</legend><div class="cs-opts cs-opts--one">' + own + "</div></fieldset>" +
      (showCure ? '<fieldset class="cs-block"><legend>How should your smoked cuts be cured?</legend><p class="cs-note">This only matters for what you have smoked. Nothing smoked, nothing cured.</p>' +
      '<div class="cs-opts">' + cure + "</div></fieldset>" : "") + nav + "</div>";
  }
  function viewCuts(id) {
    var i = stepIndex(id), s = STEPS[i], prev = STEPS[i - 1].id, next = STEPS[i + 1];
    var intro = id === "ground" && state.side === "whole" ? "Everything you've sent to the grind ends up here, plus the trim. A whole gets two choices, one for each half." : s.intro;
    var rows = M.ROWS.filter(function (r) { return r.step === id; }).map(rowHtml).join("");
    return '<div class="cs-step"><p class="cs-progress">' + (i - 1) + " of 6</p>" +
      '<h2 class="cs-steptitle">' + esc(s.title) + '</h2><p class="cs-stepintro">' + esc(intro) + "</p>" + rows +
      (id === "belly" && M.smokeNeeded(a()) ? '<p class="cs-cureline">Cured with ' + esc(M.option("smoke_style", state.cure).l.toLowerCase()) + '. <button type="button" class="cs-link" data-go="preset">change</button></p>' : "") +
      navHtml(prev, next.id, "Next: " + next.label) + "</div>";
  }
  function viewExtras() {
    var x = state.extras;
    function box(name, label, on) { return '<label class="cs-check"><input type="checkbox" name="' + name + '"' + (on ? " checked" : "") + "><span>" + label + "</span></label>"; }
    return '<div class="cs-step"><p class="cs-progress">6 of 6</p><h2 class="cs-steptitle">Anything else?</h2><p class="cs-stepintro">These are yours if you want them, at no charge.</p>' +
      '<div class="cs-block"><p class="cs-blocktitle">Keep from your hog</p><div class="cs-clear">' +
      box("fat", "Fat, for rendering lard", x.fat) + box("bones", "Bones, for stock", x.bones) +
      M.ORGANS.map(function (o) { return box("organ-" + o, o.charAt(0).toUpperCase() + o.slice(1), x.organs.indexOf(o) >= 0); }).join("") + "</div></div>" +
      '<div class="cs-block"><label class="cs-field" style="margin:0"><span>Anything else Timberline should know?</span><textarea name="instructions" rows="2" maxlength="' + C.limits.note + '" placeholder="Optional">' + esc(state.instructions) + "</textarea><small>Short notes only. For anything bigger, call or text Brian at " + C.phone + ".</small></label>" +
      '<p class="cs-err" id="cs-notefit" aria-live="polite"' + (M.noteFits(fitState()) ? " hidden" : "") + ">" + (M.noteFits(fitState()) ? "" : esc(NOTE_WONT_FIT)) + "</p></div>" +
      navHtml("ground", "review", "Review my sheet") + "</div>";
  }
  function summaryRows() {
    return M.summaryRows({ side: state.side, answers: state.answers, extras: state.extras, instructions: state.instructions });
  }
  function closedMessage(b) {
    return "The cut sheets for " + esc(M.longDate(b.processing)) + " closed on " + esc(M.longDate(b.due)) + ". " + esc(M.closedLine()) + " " +
      "Pick another date, or call or text Brian at " + esc(C.phone) + ".";
  }
  function allClosedMessage() {
    return "Every processing date has closed. " + M.closedLine() + " Call or text Brian at " + C.phone + ".";
  }
  function viewReview() {
    var e = M.estimate(priced(), state.side), res = isReserved(), b = res ? null : M.batch(state.batch);
    var data = summaryRows();
    if (!data.some(function (r) { return r.key === "Extras" || r.key === "Note"; })) data.push({ step: "extras", key: "Extras", val: "None" });
    var rows = data.map(function (r) {
      return '<div class="cs-review__row"><span class="cs-review__key">' + esc(r.key) + '</span><span class="cs-review__val">' + esc(r.val) + ' <button type="button" class="cs-link" data-go="' + r.step + '" aria-label="Change ' + esc(r.key) + '">change</button></span></div>';
    }).join("");
    var fits = reviewFits(), ok = sendable(), kind = state.side === "whole" ? "Whole hog" : "Half hog";
    var choose = ' <button type="button" class="cs-link" data-go="start">Choose one</button></span>';
    var intro;
    if (res) {
      intro = anyOpen() ? ". " + esc("Your processing date is the one on your deposit, and your cut sheet is due " + M.DUE_RULE.replace("your processing date", "it") + ".") :
        ". " + '<span class="cs-err">' + esc(allClosedMessage()) + "</span>";
    } else if (state.reserved === "no") {
      var closed = !!b && !M.batchOpen(b, todayIso);
      intro = closed ? ". " + '<span class="cs-err">' + closedMessage(b) + choose :
        b ? ", processing " + esc(M.longDate(b.processing)) + ". Cut sheet due " + esc(M.longDate(b.due)) + "." :
        ". " + '<span class="cs-err">Pick a processing date.' + choose;
    } else {
      intro = ". " + '<span class="cs-err">Tell us whether you have reserved.' + choose;
    }
    return '<div class="cs-step"><h2 class="cs-steptitle">Your cut sheet</h2><p class="cs-stepintro">' + kind + intro + "</p>" +
      '<div class="cs-block"><div class="cs-review">' + rows + "</div></div>" +
      '<p class="cs-err" id="cs-notelong"' + (fits ? " hidden" : "") + ">" + esc(NOTE_LONG + " ") + '<button type="button" class="cs-link" data-go="extras">Shorten it</button></p>' +
      '<form class="cs-block" id="cs-form" novalidate><p class="cs-blocktitle">Your details</p><p class="cs-note">We email you a copy of your cut sheet and your estimate.</p>' +
      (state.order ? '<p class="cs-note" id="cs-orderline">For deposit order ' + esc(state.order) + ".</p>" : "") + '<div class="cs-clear"></div><p id="cs-formerr" class="cs-err" hidden></p>' +
      '<div class="cs-fields2"><label class="cs-field"><span>Your name</span><input name="name" autocomplete="name" maxlength="' + C.limits.name + '" required value="' + esc(state.name) + '"></label>' +
      '<label class="cs-field"><span>Phone</span><input name="phone" type="tel" autocomplete="tel" maxlength="40" required value="' + esc(state.phone) + '"></label></div>' +
      '<label class="cs-field"><span>Email</span><input name="email" type="email" autocomplete="email" maxlength="254" required value="' + esc(state.email) + '">' +
      (res ? "<small>Use the email on your farm store account. That is how we find your deposit.</small>" : "") + "</label>" +
      '<p class="cs-blocktitle cs-blocktitle--gap">Delivery or pickup</p><div class="cs-clear"></div>' +
      '<label class="cs-field"><span>How do you want to get your pork?</span><select name="delivery">' +
      '<option value=""' + (state.delivery ? "" : " selected") + ">Choose one</option>" + M.DELIVERY.map(function (o) {
        return '<option value="' + o + '"' + (state.delivery === o ? " selected" : "") + ">" + esc(M.DELIVERY_LABEL[o]) + "</option>";
      }).join("") + "</select><small>" + esc(M.SCHEDULE_NOTE) + "</small></label>" +
      '<label class="cs-hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>' +
      '<button type="submit" class="cs-btn cs-btn--primary cs-btn--block" id="cs-send"' + (ok && fits ? "" : " disabled") + ">Send my cut sheet</button>" +
      '<div class="cs-linkrow"><button type="button" class="cs-link" data-go="extras">Back</button><button type="button" class="cs-link" id="cs-share">Copy a link to this sheet</button></div>' +
      '<p class="cs-fine">Sending this doesn&rsquo;t charge anything. You can change it until your due date by sending a new one. Your price is $' + e.rate.toFixed(2) +
      " per lb of hanging weight, butcher included. That is about " + money(Math.round(e.total)) + " on a typical " + (state.side === "whole" ? "whole hog" : "half") +
      "; your final bill is that price times your hog&rsquo;s actual hanging weight.</p></form></div>";
  }
  /* What the done screen says when the receiver accepted the sheet: honest about whether the customer's copy went out. */
  function doneIntro(s) {
    var first = state.name.split(" ")[0], refLine = s && s.ref ? " Your reference is " + s.ref + "." : "";
    return s && s.emailedCustomer ? "Thanks, " + first + ". A copy is on its way to " + state.email + "." + refLine :
      "Thanks, " + first + ". We have your cut sheet, but we couldn't email your copy yet. Download it below and keep it." + refLine;
  }
  function viewDone() {
    var s = state.sent, res = isReserved(), b = res ? null : M.batch(state.batch);
    var emailed = s && s.delivered;
    if (s && s.closed && res) {
      return '<div class="cs-step"><h2 class="cs-steptitle">Cut sheets have closed</h2><p class="cs-stepintro">' + esc(allClosedMessage()) + "</p>" +
        '<div class="cs-actions"><button type="button" class="cs-btn cs-btn--ghost" data-go="review">Back to my sheet</button></div></div>';
    }
    if (s && s.closed) {
      return '<div class="cs-step"><h2 class="cs-steptitle">That date has closed</h2><p class="cs-stepintro">' + closedMessage(b) + "</p>" +
        '<div class="cs-actions"><button type="button" class="cs-btn cs-btn--primary" data-go="start">Choose another date</button>' +
        '<button type="button" class="cs-btn cs-btn--ghost" data-go="review">Back to my sheet</button></div></div>';
    }
    var body = encodeURIComponent("My cut sheet is attached.\n\n" + (s ? s.lines.join("\n") : "") + "\n\nReopen it here: " + shareUrl());
    return '<div class="cs-step"><h2 class="cs-steptitle">' + (emailed ? "We have your cut sheet" : "One more step") + "</h2>" +
      '<p class="cs-stepintro">' + (emailed ? esc(doneIntro(s)) : "We couldn&rsquo;t send this automatically. Download your sheet and email it to us, or call or text Brian at " + C.phone + ".") + "</p>" +
      '<div class="cs-block"><p class="cs-blocktitle">What happens next</p><ol class="cs-timeline cs-clear">' +
      (res ? "" : '<li><strong>Put your deposit down.</strong> ' + money(C.deposit[state.side]) + " holds your spot. Reserve by " + esc(M.shortDate(b.reserveBy)) + ".</li>") +
      (res ? "<li><strong>" + esc(M.DUE_RULE.charAt(0).toUpperCase() + M.DUE_RULE.slice(1)) + ":</strong> last day to change your sheet. Send a new one any time before then.</li>" +
        "<li><strong>On your processing date:</strong> your hog goes to Timberline Meats in Dundee.</li>" :
        "<li><strong>" + esc(M.shortDate(b.due)) + ":</strong> last day to change your sheet. Send a new one any time before then.</li>" +
        "<li><strong>" + esc(M.shortDate(b.processing)) + ":</strong> your hog goes to Timberline Meats in Dundee.</li>") +
      "<li><strong>Usually " + esc(M.weeksPhrase()) + " later:</strong> your pork is back at the farm and we email you the hanging weight and your total.</li>" +
      "<li><strong>We schedule your " + esc(M.DELIVERY_PLAIN[state.delivery] || "delivery or pickup") + " for the next available day.</strong> Your balance is the hanging weight times your $" + M.estimate(priced(), state.side).rate.toFixed(2) + " price, less your deposit. " + esc(M.BALANCE_NOTE) + "</li></ol>" +
      '<div class="cs-actions">' + (res ? "" : '<a class="cs-btn cs-btn--primary" href="' + esc(C.reserveUrl[state.side]) + '">Reserve my ' + state.side + "</a>") +
      '<button type="button" class="cs-btn" id="cs-pdf">Download my sheet</button>' +
      (emailed ? "" : '<a class="cs-btn" href="mailto:' + C.email + "?subject=" + encodeURIComponent("Cut sheet: " + state.name) + "&body=" + body + '">Email Brian</a>') +
      '<button type="button" class="cs-btn cs-btn--ghost" data-go="review">Make a change</button></div>' +
      '<p class="cs-err" id="cs-pdferr" role="alert" hidden></p></div></div>';
  }

  function freezerHtml() {
    var e = M.estimate(priced(), state.side), f = e.freezer, tiles = "", list = "";
    f.rows.forEach(function (r) {
      var c = CAT[r.cat];
      for (var i = 0; i < r.packs; i++) tiles += '<span class="cs-pack cs-cat-' + c + '" style="animation-delay:' + Math.min(i * 8, 120) + 'ms"></span>';
      list += '<li><span class="cs-list__name"><span class="cs-dot cs-cat-' + c + '"></span>' + esc(r.name) + '</span><span class="cs-list__amt">' + r.packs + (r.packs === 1 ? " pack" : " packs") + ", " + Math.round(r.lb) + " lb</span></li>";
    });
    var adds = e.adders.map(function (i) { return '<div class="cs-price__row cs-small"><span>' + esc(i.label) + "</span><span>" + signed(i.perLb) + "</span></div>"; }).join("");
    return '<div class="cs-panel__head"><h3>Your freezer</h3><span class="cs-muted cs-small">about ' + e.takeHome + " lb</span></div>" +
      '<div class="cs-freezer" aria-hidden="true">' + tiles + "</div>" +
      '<ul class="cs-list">' + list + "</ul>" +
      '<div class="cs-price"><div class="cs-price__row cs-small"><span>Everything fresh</span><span>$' + e.freshRate.toFixed(2) + "/lb</span></div>" + adds +
      '<div class="cs-price__row cs-price__total"><span>Your price, butcher included</span><span>$' + e.rate.toFixed(2) + "/lb</span></div>" +
      '<div class="cs-price__row cs-small"><span>' + e.hanging + " lb hanging</span><span>= about " + money(Math.round(e.total)) + "</span></div></div>" +
      '<p class="cs-fine">Estimates from hogs we&rsquo;ve weighed package by package. Your final bill is that price times your hog&rsquo;s actual hanging weight. ' +
      (state.side === "whole" ? "Our whole hogs" : "Our halves") + " have hung " + C.hangingRange[state.side][0] + " to " + C.hangingRange[state.side][1] + " lb, so about " +
      money(Math.round(e.lowTotal)) + " to " + money(Math.round(e.highTotal)) + " at $" + e.rate.toFixed(2) + ".</p>";
  }

  var lastStep = null;
  function render() {
    var view = state.step === "start" ? viewStart() : state.step === "preset" ? viewPreset() : state.step === "extras" ? viewExtras() :
      state.step === "review" ? viewReview() : state.step === "done" ? viewDone() : viewCuts(state.step);
    if (!mount.querySelector(".cs-grid")) {
      mount.innerHTML = '<header class="cs-head"><h1>Build your cut sheet</h1><p>Tell us how you want your pork cut. It takes about five minutes, and you can start from how we cut our own.</p></header>' +
        '<div class="cs-pigwrap" id="cs-pig"></div><div class="cs-grid"><div class="cs-main" id="cs-main" aria-live="polite"></div>' +
        '<aside class="cs-side" id="cs-side" aria-label="Your freezer"><div class="cs-panel" id="cs-panel"></div></aside></div>' +
        '<button type="button" class="cs-bar" id="cs-bar" aria-expanded="false"></button>';
    }
    mount.querySelector(".cs-head").hidden = state.step !== "start";
    document.getElementById("cs-pig").innerHTML = pigSvg();
    document.getElementById("cs-main").innerHTML = view;
    updateFreezer();
    var fresh = state.step !== lastStep;
    if (fresh && lastStep !== null) {
      var top = document.getElementById("cs-pig").getBoundingClientRect().top + window.scrollY - 12;
      if (window.scrollY > top) window.scrollTo({ top: top, behavior: "smooth" });
    }
    if (!fresh) { var st = mount.querySelector(".cs-step"); if (st) st.style.animation = "none"; }
    lastStep = state.step;
  }
  function updateFreezer() {
    document.getElementById("cs-panel").innerHTML = freezerHtml();
    var e = M.estimate(priced(), state.side);
    document.getElementById("cs-bar").innerHTML = '<span class="cs-bar__row"><span>' + e.freezer.totalPacks + " packs, about " + e.takeHome + " lb<small>See your freezer</small></span><span>$" + e.rate.toFixed(2) + "/lb, about " + money(Math.round(e.total)) + "</span></span>";
  }
  function go(id) {
    if (STEPS[stepIndex(state.step)]) state.visited[state.step] = true;
    state.step = id;
    document.getElementById("cs-side").classList.remove("is-open");
    render(); save();
  }

  function lines() {
    return M.describeChoices(modelState());
  }

  function loadPdfLib() {
    return new Promise(function (ok, no) {
      if (window.PDFLib) return ok(window.PDFLib);
      var s = document.createElement("script");
      s.src = BASE + "vendor/pdf-lib.min.js";
      s.onload = function () { ok(window.PDFLib); };
      s.onerror = no;
      document.body.appendChild(s);
    });
  }
  async function makePdf() {
    var lib = await loadPdfLib();
    var tpl = await (await fetch(BASE + "vendor/pork-cut-sheet.pdf")).arrayBuffer();
    var d = new Date();
    var data = M.sheetData({ side: state.side, batch: modelState().batch, reserved: isReserved(), answers: state.answers, extras: state.extras, instructions: state.instructions,
      order: state.order, name: state.name, phone: state.phone, today: (d.getMonth() + 1 + "").padStart(2, "0") + "/" + (d.getDate() + "").padStart(2, "0") + "/" + d.getFullYear() });
    return window.PVFSheet.fill(lib, tpl, data);
  }
  function b64(bytes) {
    var s = "";
    for (var i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    return btoa(s);
  }
  async function downloadPdf() {
    var err = document.getElementById("cs-pdferr");
    if (err) err.hidden = true;
    try {
      var bytes = await makePdf();
      var url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      var link = document.createElement("a");
      link.href = url;
      link.download = "Park View Farm cut sheet - " + (state.name || "draft") + ".pdf";
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    } catch (e) {
      console.warn(e);
      if (err) { err.textContent = "We couldn't make your PDF. Try again, or call or text Brian at " + C.phone + "."; err.hidden = false; }
    }
  }
  function shareCode() {
    return M.encodeShare({ side: state.side, batch: isReserved() ? "" : state.batch, reserved: isReserved(), answers: state.answers, extras: state.extras, preset: state.preset,
      instructions: state.instructions, delivery: state.delivery, order: state.order });
  }
  function shareUrl() {
    return location.href.split("#")[0] + "#s=" + shareCode();
  }
  /* A random 22-character id for one send. The same id goes with every try of the same sheet, so the receiver can tell a retry from a new sheet. */
  function newSubmissionId() {
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", out = "", i;
    var buf = null;
    try { if (window.crypto && window.crypto.getRandomValues) { buf = new Uint8Array(22); window.crypto.getRandomValues(buf); } } catch (e) { buf = null; }
    for (i = 0; i < 22; i++) out += chars.charAt((buf ? buf[i] : Math.floor(Math.random() * 256)) % chars.length);
    return out;
  }
  /* The id for this sheet as it stands: the same one while nothing has changed and nothing was accepted, a new one otherwise. */
  function submissionId() {
    var key = [shareCode(), state.reserved, state.name, state.email, state.phone, state.delivery].join("|");
    if (!state.submission || state.submission.key !== key || !state.submission.id) state.submission = { id: newSubmissionId(), key: key };
    return state.submission.id;
  }
  /* Puts a message in the form's error line, with a Reload button when the page is out of date. */
  function showFormError(err, message, withReload) {
    err.textContent = message;
    if (withReload) {
      err.appendChild(document.createTextNode(" "));
      var rb = document.createElement("button");
      rb.type = "button"; rb.className = "cs-btn cs-reload"; rb.id = "cs-reload"; rb.textContent = "Reload";
      err.appendChild(rb);
    }
    err.hidden = false;
    err.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  async function submit(form) {
    var err = document.getElementById("cs-formerr"), btn = document.getElementById("cs-send");
    var fd = new FormData(form);
    ["name", "email", "phone"].forEach(function (k) { state[k] = String(fd.get(k) || "").trim().replace(/\s+/g, " "); });
    state.delivery = M.DELIVERY.indexOf(String(fd.get("delivery") || "")) >= 0 ? String(fd.get("delivery")) : "";
    var problem = !state.name ? "Enter your name." : !state.phone ? "Enter your phone number." :
      !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(state.email) ? "That email address doesn't look right." :
      !state.delivery ? "Choose how you want to get your pork." : "";
    if (!problem && !M.noteFits(fitState())) problem = NOTE_LONG;
    if (problem) { err.textContent = problem; err.hidden = false; err.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
    if (!sendable()) { go("review"); return; }
    err.hidden = true; btn.disabled = true; btn.textContent = "Sending";
    var subId = submissionId(), pageRate = M.estimate(priced(), state.side).rate;
    save();
    var l = lines(), delivered = false, closed = false, refused = false, stale = false, priceOff = false, serverRate = null, ref = "", emailedCustomer = false;
    if (C.endpoint && !fd.get("website")) {
      try {
        var pdf = await makePdf();
        var payload = JSON.stringify({
          name: state.name, email: state.email, phone: state.phone, order: state.order, delivery: state.delivery, reserved: isReserved(),
          choices: { side: state.side, batch: isReserved() ? "" : state.batch, answers: state.answers, extras: state.extras, instructions: state.instructions, preset: state.preset },
          modelVersion: C.version, rate: pageRate, submission: subId, share: shareUrl(), pdf: b64(pdf), website: fd.get("website") || "" });
        for (var attempt = 0; attempt < 2 && !delivered && !closed; attempt++) {
          var j, ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
          var timer = setTimeout(function () { if (ctl) ctl.abort(); }, C.sendTimeout * 1000);
          try {
            var res = await fetch(C.endpoint, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: payload, signal: ctl ? ctl.signal : undefined });
            j = await res.json();
          } catch (e) { j = { ok: false, reason: "network" }; } // a timeout lands here too
          clearTimeout(timer);
          if (!j || typeof j !== "object") j = { ok: false, reason: "error" };
          delivered = !!j.ok;
          closed = !j.ok && j.reason === "past_due";
          refused = !j.ok && j.reason === "note";
          stale = !j.ok && j.reason === "stale";
          priceOff = !j.ok && j.reason === "price";
          if (priceOff && typeof j.rate === "number" && isFinite(j.rate)) serverRate = j.rate;
          if (delivered) { ref = typeof j.ref === "string" ? j.ref : ""; emailedCustomer = !!(j.emailed && j.emailed.customer === true); }
          // Only a network failure, a busy receiver or an error is tried once more. Everything else is an answer.
          var again = !j.ok && (j.reason === "network" || j.reason === "busy" || j.reason === "error");
          if (!again) break;
          if (attempt === 0) await new Promise(function (ok) { setTimeout(ok, 2000); });
        }
      } catch (e) { delivered = false; }
    }
    if (refused) { state.noteRefused = true; go("review"); return; }
    state.sent = { delivered: delivered, closed: closed, stale: stale, price: priceOff, serverRate: serverRate, ref: ref, emailedCustomer: emailedCustomer, lines: l };
    if (stale || priceOff) {
      // Stay on the review. Nothing was recorded, the choices are saved, and a reload brings the current prices.
      btn.disabled = false; btn.textContent = "Send my cut sheet";
      showFormError(err, stale ? STALE_MESSAGE :
        "The price for these choices is $" + (serverRate == null ? "?" : serverRate.toFixed(2)) + " per lb, not the $" + pageRate.toFixed(2) + " this page showed. Reload the page, check your sheet, then send again.", true);
      return;
    }
    if (delivered) state.submission = null; // accepted: a later send of changed choices is a new sheet
    go("done");
  }

  mount.addEventListener("click", function (ev) {
    var t = ev.target.closest("[data-go]");
    if (t) { ev.preventDefault(); go(t.getAttribute("data-go")); return; }
    var bar = ev.target.closest("#cs-bar");
    if (bar) { var open = document.getElementById("cs-side").classList.toggle("is-open"); bar.setAttribute("aria-expanded", open ? "true" : "false"); return; }
    if (ev.target.id === "cs-pdf") { downloadPdf(); return; }
    if (ev.target.id === "cs-reload") { location.reload(); return; }
    if (ev.target.id === "cs-newsheet") { startNew(); return; }
    if (ev.target.id === "cs-share") {
      var f = document.getElementById("cs-form");
      if (f) { state.delivery = f.elements.delivery.value; save(); }
      var u = shareUrl(), btn = ev.target;
      (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { btn.textContent = "Link copied"; }, function () { window.prompt("Copy this link", u); });
    }
  });
  mount.addEventListener("keydown", function (ev) {
    if ((ev.key === "Enter" || ev.key === " ") && ev.target.classList && ev.target.classList.contains("cs-region")) { ev.preventDefault(); go(ev.target.getAttribute("data-go")); }
  });
  mount.addEventListener("change", function (ev) {
    var el = ev.target, name = el.name;
    if (name === "side") {
      state.side = el.value;
      /* A package stays a package when the size changes, so a whole gets the whole's version of it. */
      if (M.PRESETS.filter(function (p) { return p.id === state.preset; }).length) state.answers = M.applyPreset(state.preset, state.cure);
      renorm();
    }
    else if (name === "batch") state.batch = el.value;
    else if (name === "reserved") setReserved(el.value === "yes" ? "yes" : "no");
    else if (name === "preset") { state.preset = el.value; state.answers = M.applyPreset(el.value, state.cure); renorm(); }
    else if (name === "cure") { state.cure = el.value; renorm(); }
    else if (name && (name.indexOf("flavor-") === 0 || name.indexOf("form-") === 0)) {
      var skey = name.slice(name.indexOf("-") + 1), srow = M.ROW[skey], cur = state.answers[skey] || srow.std;
      var fl = name.indexOf("flavor-") === 0 ? el.value : flavorOf(cur);
      var wantLinks = name.indexOf("form-") === 0 ? el.value === "links" : !!M.option(skey, cur).addon;
      state.answers[skey] = sausageValue(srow, fl, wantLinks);
      renorm(); state.preset = "custom";
    }
    else if (M.ROW[name]) { if (name === "smoke_style") state.cure = el.value; state.answers[name] = el.value; renorm(); state.preset = "custom"; }
    else if (name === "fat" || name === "bones") state.extras[name] = el.checked;
    else if (name && name.indexOf("organ-") === 0) {
      var o = name.slice(6), list = state.extras.organs.filter(function (x) { return x !== o; });
      if (el.checked) list.push(o);
      state.extras.organs = list;
    } else if (name === "delivery") { state.delivery = el.value; save(); return; }
    else return;
    if (el.type === "checkbox") { state.noteRefused = false; save(); syncFit(); return; }
    render(); save();
    var again = mount.querySelector('input[name="' + name + '"]:checked');
    if (again) again.focus({ preventScroll: true });
  });
  mount.addEventListener("input", function (ev) {
    var nm = ev.target.name;
    if (nm === "instructions") { state.instructions = ev.target.value.replace(/\s+/g, " ").trimStart(); state.noteRefused = false; save(); syncFit(); }
    else if (nm === "name" || nm === "email" || nm === "phone") {
      state[nm] = ev.target.value;
      save();
    }
  });
  mount.addEventListener("submit", function (ev) { ev.preventDefault(); submit(ev.target); });

  restore();
  renorm();
  if (state.step === "done") state.step = "review";
  render();
})();
