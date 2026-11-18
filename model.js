/* Park View Farm cut sheet builder: the one source of truth.
   Options, prices, dates, pack estimates and the mapping onto Timberline's
   sheet all live here. The page, the PDF and the tests read this file.

   Evidence for the numbers:
   - Rates, deposits: decisions.md 2026-10-17 (Brian).
   - Add-on rates: Timberline price list effective Jan 1, 2026. Re-check each December.
   - Pricing (owner decision 2026-11-16): one price per pound of hanging weight.
     The cheapest sheet is everything fresh (freshRate). Every smoked item adds a fixed amount
     per pound of hanging weight that depends on the cure, and links add a little more, each
     component rounded to the nearest nickel on its own so the breakdown adds up to the price.
     The standard sheet in natural cure comes to the published price (standardRate). The bill is
     hanging weight times the customer's price, less the deposit. Nothing is billed on top.
     The receiver carries a copy of this file; bump CONFIG.version whenever a price or date changes.
   - Yield shares: two complete Timberline records (66.5% and 67.5% of hanging).
   - Pack sizes: average lb per package across the Jan and Jul 2026 Timberline reports. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PVFModel = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var CONFIG = {
    version: "2027-winter-5", // the receiver's copy of this file must carry the same value
    endpoint: "https://script.google.com/macros/s/AKfycbwjD23x8AhwjoSm5PlU-ksgX6pW6ABgLurW87zKp1pb5aNU-_CSEdSeMRJJjFYUPPY/exec", // Google Apps Script web app URL. Empty = download and email fallback.
    phone: "585-484-0799",
    email: "brian@parkviewfamilyfarm.com",
    farmerOnSheet: "Park View Farm",
    /* What Timberline prints on each package label. Their 2026 price list shows customized logos at no extra charge. */
    packageName: "Park View Farm",
    packageAddress: "5700 Gibsonville Road, Leicester, NY 14481",
    reserveUrl: {
      half: "https://parkviewfamilyfarm.com/store/product/1-2-hog-pre-order-deposit",
      whole: "https://parkviewfamilyfarm.com/store/product/whole-hog-pre-order-deposit"
    },
    freshRate: { half: 7.6, whole: 7.4 }, // everything fresh: nothing smoked or cured, loose sausage
    standardRate: { half: 8.0, whole: 7.8 }, // the published price: the standard sheet in natural cure (a test checks this)
    deposit: { half: 100, whole: 200 },
    typicalHanging: { half: 90, whole: 180 },
    hangingRange: { half: [78, 112], whole: [155, 224] },
    /* The longest a customer's note, a deposit order number and a name may be. The page's inputs and the receiver both read these. */
    limits: { note: 120, order: 12, name: 100 },
    /* Timberline's special instructions box: width in points, the font sizes to try, the most lines at the first size, the most lines at any size. */
    noteBox: { width: 122, sizes: [7.2, 6.8, 6.4, 6.0], firstSizeLines: 4, maxLines: 6 },
    sendTimeout: 30, // seconds the page waits for the receiver before it treats the send as failed
    /* Timberline's rates and the average yields every price component comes from.
       cureLbPerHalf is the assumed cured pounds per half that turn Timberline's per-pound cure
       charge into an amount per pound of hanging weight (pounds x cure rate / typical hanging weight). */
    cure: { natural: 2.95, regular: 2.05 },
    cureLbPerHalf: { bacon: 9, hocks: 2.2, jowl: 1.35, ham: 14, chops: 10, butt: 11 },
    linksRate: 1.25,
    /* How long after the processing date the pork is usually back at the farm, in weeks (earliest, latest). */
    readyWeeks: [2, 3],
    batches: [
      { id: "b1", processing: "2027-01-06", reserveBy: "2026-12-30", due: "2026-12-30" },
      { id: "b2", processing: "2027-01-13", reserveBy: "2027-01-06", due: "2027-01-06" },
      { id: "b3", processing: "2027-01-27", reserveBy: "2027-01-20", due: "2027-01-20" },
      { id: "b4", processing: "2027-02-10", reserveBy: "2027-02-03", due: "2027-02-03" }
    ]
  };

  var ORGANS = ["heart", "liver", "kidneys", "tongue"];
  var DELIVERY = ["rochester", "buffalo", "brighton", "pickup"]; // delivery first; there is no default way to get it
  var DELIVERY_LABEL = { pickup: "Pick up at the farm in Leicester", brighton: "Pick up at the Brighton Farmers Market", rochester: "Rochester delivery (free)", buffalo: "Buffalo delivery (free)" };
  var DELIVERY_SHORT = { pickup: "Farm pickup", brighton: "Brighton market", rochester: "Rochester route", buffalo: "Buffalo route" };

  /* Share of hanging weight by part of the hog. Sums to 0.67, the typical take-home share. */
  var YIELD = {
    loin: 0.1, butt: 0.1, shoulder: 0.053, ribs: 0.02, ham: 0.135,
    belly: 0.093, hocks: 0.024, jowl: 0.015, trim: 0.13
  };

  /* One option: v value, l label, d plain description, staff = value on the
     Timberline sheet ("" = into the grind), addon = pricing rule. */
  function o(v, l, d, extra) {
    var out = { v: v, l: l, d: d || "", staff: v, addon: null };
    if (extra) Object.keys(extra).forEach(function (k) { out[k] = extra[k]; });
    return out;
  }
  function GRIND(d) { return o("grind", "Add to the grind", d || "Goes into your ground pork or sausage.", { staff: "" }); }

  /* The sausage flavors the farm sells, in the order the page shows them. This is the one place to add,
     remove or reword one; SAUSAGE and the page's flavor buttons both come from it. kind is the link style:
     "links" are small links, charged at linksRate; "rope" are full-size links, free at Timberline. Plain ground pork is always first. */
  var FLAVORS = [
    /* Each d says what is actually in it, from Timberline's ingredient list (their cut list, Aug 2024).
       Re-check the list before changing a flavor's words. */
    { id: "breakfast", name: "Breakfast", d: "Sage, thyme and black pepper.", group: "Breakfast", kind: "links", bulk: "Breakfast sausage, bulk", bulkD: "Loose, for patties.", links: "Breakfast links", linksD: "Small links, ready for the pan." },
    { id: "sweet_italian", name: "Sweet Italian", d: "Fennel and a little brown sugar. No heat.", group: "Italian", kind: "rope", bulk: "Sweet Italian, bulk", bulkD: "Loose.", links: "Sweet Italian rope links", linksD: "Full-size links." },
    { id: "mild_italian", name: "Mild Italian", d: "Fennel and coriander with a little red pepper.", group: "Italian", kind: "rope", bulk: "Mild Italian, bulk", bulkD: "Loose.", links: "Mild Italian rope links", linksD: "Full-size links." },
    { id: "hot_italian", name: "Hot Italian", d: "Fennel and coriander with real red pepper heat.", group: "Italian", kind: "rope", bulk: "Hot Italian, bulk", bulkD: "Loose.", links: "Hot Italian rope links", linksD: "Full-size links." },
    { id: "chorizo", name: "Chorizo", d: "Paprika, garlic and oregano.", group: "More", kind: "rope", bulk: "Chorizo, bulk", bulkD: "Loose.", links: "Chorizo rope links", linksD: "Full-size links." },
    { id: "garlic", name: "Garlic bratwurst", d: "Garlic and mustard seed.", group: "More", kind: "rope", bulk: "Garlic bratwurst, bulk", bulkD: "Loose.", links: "Garlic bratwurst rope links", linksD: "Full-size links." }
  ];
  var PLAIN_D = "Just pork. Season it yourself.";
  var SAUSAGE = [o("ground_pork", "Plain ground pork", PLAIN_D, { group: "Ground" })];
  FLAVORS.forEach(function (f) {
    SAUSAGE.push(o(f.id + "_bulk", f.bulk, f.bulkD, { group: f.group }));
    SAUSAGE.push(o(f.id + "_" + (f.kind === "rope" ? "rope" : "links"), f.links, f.linksD, { group: f.group, addon: f.kind }));
  });

  var ROWS = [
    { key: "pork_chops", step: "loin", title: "Pork chops", std: "bone_in", options: [
      o("bone_in", "Bone-in chops", "The classic. It's what we cut for ourselves."),
      o("boneless", "Boneless chops", "Quick to cook, and you can take baby back ribs too."),
      o("smoked", "Smoked chops", "Cured and smoked. Cook them like any chop.", { addon: "cure:chops" }),
      o("canadian", "Canadian bacon", "The whole loin, smoked and sliced.", { addon: "cure:chops" })
    ] },
    { key: "steak_thickness", step: "loin", title: "Chop and steak thickness", std: "1 inch", compact: true,
      note: "One thickness for your chops and any steaks.",
      showIf: function (a) { return thickNeeded(a); }, options: [
      o("3/4 inch", "3/4 inch", "Cooks fast"), o("1 inch", "1 inch", "Our pick"),
      o("1 1/4 inch", "1 1/4 inch", "Hard to overcook"), o("1 1/2 inch", "1 1/2 inch", "Thick, for the grill")
    ] },
    { key: "baby_back_ribs", step: "loin", title: "Baby back ribs?", std: "no", compact: true,
      note: "Baby backs come off the loin, so they only work with boneless chops.",
      showIf: function (a) { return a.pork_chops === "boneless"; }, options: [
      o("yes", "Yes", "A small rack off the loin."), o("no", "No", "They go into the grind.", { staff: "" })
    ] },
    { key: "tenderloin", step: "loin", title: "Tenderloin", std: "no", compact: true, options: [
      o("no", "Leave it in the chops", "How we do ours.", { staff: "" }),
      o("yes", "Pull it out whole", "About a pound, the most tender cut.")
    ] },
    { key: "butt", step: "shoulder", title: "Pork butt", std: "roast", options: [
      o("roast", "Roasts", "Pulled pork and slow cooker dinners."),
      o("steak", "Steaks", "Well marbled, good on the grill."),
      o("irish", "Irish bacon", "Smoked and sliced, leaner than belly bacon.", { addon: "cure:butt" }),
      GRIND()
    ] },
    { key: "shoulder", step: "shoulder", title: "Picnic shoulder", std: "grind", options: [
      GRIND("How we do ours. More ground pork or sausage."),
      o("roast", "Roasts", "More slow cooker dinners."),
      o("steak", "Steaks", "Bone-in shoulder steaks.")
    ] },
    { key: "roast_weight", step: "shoulder", title: "Roast size", std: "3-4 lb", compact: true,
      showIf: function (a) { return a.butt === "roast" || a.shoulder === "roast"; }, options: [
      o("2 lb", "2 lb", "Smaller table"), o("3-4 lb", "3-4 lb", "Family dinner")
    ] },
    { key: "ham", step: "ham", title: "The hams", std: "fresh_slices", options: [
      o("fresh_slices", "Fresh ham steaks", "Cook them like a thick chop."),
      o("fresh_whole", "Fresh whole ham", "An uncured roast for a crowd."),
      o("smoked_slices", "Smoked ham steaks", "What we do for ours. Cured and smoked. Cook to 160 degrees.", { addon: "cure:ham" }),
      o("smoked_whole", "Smoked whole ham", "The holiday ham. Cured and smoked. Cook to 160 degrees.", { addon: "cure:ham" }),
      GRIND()
    ] },
    { key: "bacon", step: "belly", title: "Bacon", std: "smoked_sliced", options: [
      o("smoked_sliced", "Smoked and sliced", "Classic smoked bacon.", { addon: "cure:bacon" }),
      o("fresh_sliced", "Fresh sliced", "Side pork. Unsmoked belly, sliced like bacon."),
      o("fresh_whole", "Fresh whole belly", "For roasting or curing your own."),
      GRIND()
    ] },
    { key: "spare_ribs", step: "belly", title: "Spare ribs", std: "yes", compact: true, options: [
      o("yes", "Yes", "A rack for the smoker or the oven."), GRIND("")
    ] },
    { key: "ham_hocks", step: "belly", title: "Ham hocks", std: "smoked", compact: true, options: [
      o("smoked", "Smoked", "For beans and soup.", { addon: "cure:hocks" }), o("fresh", "Fresh", "For braising."), GRIND("")
    ] },
    { key: "smoked_jowl", step: "belly", title: "Jowl bacon", std: "yes", compact: true, options: [
      o("yes", "Yes", "Rich, in small packs.", { addon: "cure:jowl" }), GRIND("")
    ] },
    /* Chosen on the starting-point screen, shown on the review. The descriptions are the one copy the page,
       the FAQ and the tests read. */
    { key: "smoke_style", step: "preset", title: "Cure", std: "natural",
      showIf: function (a) { return smokeNeeded(a); }, options: [
      o("natural", "Natural cure", "Cured with sea salt and celery powder. No nitrates or nitrites added except those naturally occurring in sea salt and celery powder. It's what we use on our own bacon and ham."),
      o("regular", "Modern cure", "Timberline's regular cure, made with sodium nitrite. Costs a little less.")
    ] },
    { key: "sausage_1", step: "ground", title: "Ground and sausage", std: "ground_pork", sausage: true, options: SAUSAGE },
    { key: "sausage_2", step: "ground", title: "Second half of the hog", std: "ground_pork", sausage: true, wholeOnly: true,
      note: "A whole hog gets two choices, one for each half.", options: SAUSAGE },
    { key: "ground_pack_size", step: "ground", title: "Ground pork pack size", std: "1 lb", compact: true,
      showIf: function (a, side) { return a.sausage_1 === "ground_pork" || (side === "whole" && a.sausage_2 === "ground_pork"); }, options: [
      o("1 lb", "1 lb", "Easy to thaw"), o("2 lb", "2 lb", "Bigger meals")
    ] }
  ];

  var ROW = {};
  ROWS.forEach(function (r) { ROW[r.key] = r; });

  /* Starting points. Anything not listed is the standard choice. */
  var PRESETS = [
    { id: "fresh", name: "Fresh and simple", blurb: "Nothing smoked or cured. Chops, roasts, fresh ham steaks, fresh side pork and ground pork.", set: { bacon: "fresh_sliced", ham_hocks: "fresh", smoked_jowl: "grind" } },
    { id: "standard", name: "The standard", blurb: "Bone-in chops, roasts, fresh ham steaks, smoked bacon, hocks and jowl, and plenty of ground pork.", set: {} },
    { id: "ours", name: "How we cut ours", blurb: "The standard, with the hams smoked and sliced.", set: { ham: "smoked_slices" } },
    { id: "breakfast", name: "Breakfast all year", blurb: "Canadian bacon, smoked ham steaks and breakfast links.", blurbWhole: "Canadian bacon, smoked ham steaks, breakfast links from one half and mild Italian links from the other.", set: { pork_chops: "canadian", ham: "smoked_slices", sausage_1: "breakfast_links", sausage_2: "mild_italian_rope" } }
  ];

  function defaults() {
    var a = {};
    ROWS.forEach(function (r) { a[r.key] = r.std; });
    return a;
  }
  /* A starting point. cure, when given, is the customer's cure choice and survives a change of card. */
  function applyPreset(id, cure) {
    var a = defaults();
    var p = PRESETS.filter(function (x) { return x.id === id; })[0];
    if (p) Object.keys(p.set).forEach(function (k) { a[k] = p.set[k]; });
    if (cure && CONFIG.cure[cure]) a.smoke_style = cure;
    return a;
  }
  /* What a starting point's card says. A whole hog's card can say more about its second sausage. preset is a starting point or its id. */
  function presetBlurb(preset, side) {
    var p = typeof preset === "string" ? PRESETS.filter(function (x) { return x.id === preset; })[0] : preset;
    if (!p) return "";
    return side === "whole" && p.blurbWhole ? p.blurbWhole : p.blurb;
  }
  function option(key, value) {
    return ROW[key].options.filter(function (x) { return x.v === value; })[0];
  }
  /* One thickness blank on Timberline's form covers chops and every steak. */
  function thickNeeded(a) {
    return a.pork_chops !== "canadian" || a.butt === "steak" || a.shoulder === "steak" || a.ham === "fresh_slices" || a.ham === "smoked_slices";
  }
  function smokeNeeded(a) {
    return a.pork_chops === "smoked" || a.pork_chops === "canadian" || a.butt === "irish" ||
      a.ham === "smoked_whole" || a.ham === "smoked_slices" || a.bacon === "smoked_sliced" ||
      a.ham_hocks === "smoked" || a.smoked_jowl === "yes";
  }

  /* Hide-and-reset rules, so a sheet can't carry a contradiction. */
  function normalize(a, side) {
    var n = {};
    Object.keys(defaults()).forEach(function (k) {
      n[k] = (a && a[k] != null && option(k, a[k])) ? a[k] : ROW[k].std;
    });
    if (n.pork_chops !== "boneless") n.baby_back_ribs = "no";
    if (!thickNeeded(n)) n.steak_thickness = ROW.steak_thickness.std;
    if (side !== "whole") n.sausage_2 = n.sausage_1;
    if (!smokeNeeded(n)) n.smoke_style = "natural";
    return n;
  }
  function isVisible(row, a, side) {
    if (row.wholeOnly && side !== "whole") return false;
    return row.showIf ? !!row.showIf(a, side) : true;
  }

  function round2(x) { return Math.round(x * 100) / 100; }
  function packs(lb, per) { return Math.max(1, Math.round(lb / per)); }

  /* What lands in the freezer. Estimates, scaled from the typical hanging weight. */
  function freezer(a, side, hanging) {
    var n = a, h = hanging || CONFIG.typicalHanging[side || "half"], y = YIELD, grind = y.trim, out = [];
    function add(cat, name, share, perPack, count) {
      var lb = share * h;
      out.push({ cat: cat, name: name, lb: lb, packs: count != null ? count : packs(lb, perPack) });
    }
    var loin = y.loin;
    if (n.tenderloin === "yes") { add("Chops and loin", "Tenderloin", 0.008, 0.8); loin -= 0.008; }
    var thick = { "3/4 inch": 0.9, "1 inch": 1.15, "1 1/4 inch": 1.4, "1 1/2 inch": 1.6 }[n.steak_thickness] || 1.15;
    if (n.pork_chops === "bone_in") add("Chops and loin", "Bone-in chops", loin, thick);
    if (n.pork_chops === "boneless") {
      add("Chops and loin", "Boneless chops", loin * 0.75, thick * 0.8);
      if (n.baby_back_ribs === "yes") add("Chops and loin", "Baby back ribs", loin * 0.12, 1);
      else grind += loin * 0.12;
    }
    if (n.pork_chops === "smoked") add("Chops and loin", "Smoked chops", loin * 0.95, 0.82);
    if (n.pork_chops === "canadian") add("Chops and loin", "Canadian bacon", loin * 0.8, 1.04);

    var roast = n.roast_weight === "2 lb" ? 2.1 : 3.6;
    if (n.butt === "roast") add("Roasts and steaks", "Butt roasts", y.butt, roast);
    if (n.butt === "steak") add("Roasts and steaks", "Butt steaks", y.butt, 1.06);
    if (n.butt === "irish") add("Roasts and steaks", "Irish bacon", y.butt * 0.9, 1.0);
    if (n.butt === "grind") grind += y.butt;
    if (n.shoulder === "roast") add("Roasts and steaks", "Shoulder roasts", y.shoulder, roast);
    if (n.shoulder === "steak") add("Roasts and steaks", "Shoulder steaks", y.shoulder, 1.27);
    if (n.shoulder === "grind") grind += y.shoulder;
    if (n.spare_ribs === "yes") add("Roasts and steaks", "Spare ribs", y.ribs, 1.47);
    else grind += y.ribs;

    var hamCount = side === "whole" ? 2 : 1;
    if (n.ham === "fresh_slices") add("Ham", "Fresh ham steaks", y.ham, 1.8);
    if (n.ham === "fresh_whole") add("Ham", "Fresh whole ham", y.ham, 12, hamCount);
    if (n.ham === "smoked_slices") add("Ham", "Smoked ham steaks", y.ham * 0.9, 1.8);
    if (n.ham === "smoked_whole") add("Ham", "Smoked whole ham", y.ham * 0.9, 10, hamCount);
    if (n.ham === "grind") grind += y.ham;

    if (n.bacon === "smoked_sliced") add("Bacon and smoked", "Smoked bacon", y.belly, 0.92);
    if (n.bacon === "fresh_sliced") add("Bacon and smoked", "Fresh sliced belly", y.belly, 1);
    if (n.bacon === "fresh_whole") add("Bacon and smoked", "Fresh whole belly", y.belly, 3.4);
    if (n.bacon === "grind") grind += y.belly;
    if (n.smoked_jowl === "yes") add("Bacon and smoked", "Jowl bacon", y.jowl, 0.68);
    else grind += y.jowl;
    if (n.ham_hocks === "smoked") add("Bacon and smoked", "Smoked hocks", y.hocks, 0.95);
    if (n.ham_hocks === "fresh") add("Bacon and smoked", "Fresh hocks", y.hocks, 1.19);
    if (n.ham_hocks === "grind") grind += y.hocks;

    var picks = side === "whole" && n.sausage_2 !== n.sausage_1 ? ["sausage_1", "sausage_2"] : ["sausage_1"];
    picks.forEach(function (k) {
      var op = option(k, n[k]);
      var per = op.addon === "links" ? 0.82 : op.addon === "rope" ? 0.97 : 1.05;
      if (n[k] === "ground_pork") per = n.ground_pack_size === "2 lb" ? 2 : 1;
      add("Ground and sausage", op.l, grind / picks.length, per);
    });
    return {
      rows: out,
      totalLb: out.reduce(function (s, r) { return s + r.lb; }, 0),
      totalPacks: out.reduce(function (s, r) { return s + r.packs; }, 0),
      grindLb: grind * h
    };
  }

  /* Nearest nickel, as the owner specified. The + 0 keeps a negative zero out. */
  function nickel(x) { return round2(Math.round(x * 20) / 20 + 0); }

  /* What one smoked item adds, per pound of hanging weight, at a cure. */
  function cureAmount(key, cure) {
    return nickel(CONFIG.cureLbPerHalf[key] * (CONFIG.cure[cure] || CONFIG.cure.natural) / CONFIG.typicalHanging.half);
  }

  /* Price components, in dollars per pound of hanging weight, on top of freshRate. Each is rounded to
     the nickel on its own, so the breakdown adds up to the price.
     1. Every smoked item adds cureAmount at the chosen cure. The cure has no line of its own.
     2. Breakfast links (addon "links"): linksRate times the pounds of that choice over the hanging weight.
        A whole hog splits the grind across its two choices as the freezer does. Full-size "rope" links
        (Italian, chorizo, garlic bratwurst) are free at Timberline, so they add nothing; the marker stays
        so the page and the sheet can still tell them apart.
     Sending something to the grind changes nothing by itself. More in the grind raises the breakfast-links amount and nothing else.
     perLb is the sum of the components. */
  function addons(a, side) {
    var n = normalize(a, side), hanging = CONFIG.typicalHanging[side || "half"];
    var f = freezer(n, side), items = [], cure = n.smoke_style;
    function smoked(key, label) { items.push({ label: label, perLb: cureAmount(key, cure) }); }
    if (n.bacon === "smoked_sliced") smoked("bacon", "Smoked bacon");
    if (n.ham_hocks === "smoked") smoked("hocks", "Smoked hocks");
    if (n.smoked_jowl === "yes") smoked("jowl", "Jowl bacon");
    if (option("ham", n.ham).addon) smoked("ham", option("ham", n.ham).l);
    if (option("pork_chops", n.pork_chops).addon) smoked("chops", option("pork_chops", n.pork_chops).l);
    if (option("butt", n.butt).addon) smoked("butt", option("butt", n.butt).l);
    var picks = side === "whole" ? (n.sausage_2 !== n.sausage_1 ? ["sausage_1", "sausage_2"] : ["sausage_1"]) : ["sausage_1"];
    var share = f.grindLb / picks.length;
    picks.forEach(function (k) {
      var op = option(k, n[k]);
      if (op.addon === "links") {
        var v = nickel(CONFIG.linksRate * share / hanging);
        if (v) items.push({ label: op.l, perLb: v });
      }
    });
    return { items: items, perLb: round2(items.reduce(function (s, i) { return s + i.perLb; }, 0)) };
  }

  function estimate(a, side) {
    var n = normalize(a, side), hanging = CONFIG.typicalHanging[side], freshRate = CONFIG.freshRate[side];
    var add = addons(n, side), rate = round2(freshRate + add.perLb), fz = freezer(n, side);
    /* One take-home weight: the freezer rows added up, to the nearest 5 lb. The page, the email and the loss all use it. */
    var take = Math.round(fz.totalLb / 5) * 5;
    var range = CONFIG.hangingRange[side], total = round2(hanging * rate);
    return {
      hanging: hanging, freshRate: freshRate, rate: rate, adders: add.items,
      total: total, freezer: fz, takeHome: take, loss: hanging - take,
      perLb: total / take, deposit: CONFIG.deposit[side],
      lowTotal: round2(range[0] * rate), highTotal: round2(range[1] * rate)
    };
  }

  /* Whatever arrives (a link, a saved draft) comes out as known extras only. */
  function cleanExtras(x) {
    var organs = [];
    if (x && typeof x === "object" && Array.isArray(x.organs)) {
      organs = ORGANS.filter(function (o) { return x.organs.indexOf(o) >= 0; });
    }
    return { fat: !!(x && typeof x === "object" && x.fat === true), bones: !!(x && typeof x === "object" && x.bones === true), organs: organs };
  }
  function cleanNote(s) {
    return String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, CONFIG.limits.note);
  }
  function cleanOrder(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, CONFIG.limits.order).trim(); }

  /* Extras become plain words in the special instructions box. */
  function extrasLine(x) {
    var c = cleanExtras(x), keep = [];
    if (c.fat) keep.push("fat");
    if (c.bones) keep.push("bones");
    if (c.organs.length) keep.push(c.organs.join(", "));
    return keep.length ? "Keep: " + keep.join(", ") + "." : "";
  }

  /* The date in New York, so a deadline closes at midnight there for everyone. */
  function todayNY(date) {
    var d = date || new Date();
    try {
      var p = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d), o = {};
      p.forEach(function (x) { o[x.type] = x.value; });
      if (o.year && o.month && o.day) return o.year + "-" + o.month + "-" + o.day;
      throw new Error("no parts");
    } catch (e) {
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    }
  }

  function batch(id) { return CONFIG.batches.filter(function (b) { return b.id === id; })[0]; }
  function parseDate(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function longDate(s) { var d = parseDate(s); return DAYS[d.getDay()] + ", " + MONTHS[d.getMonth()] + " " + d.getDate(); }
  function shortDate(s) { var d = parseDate(s); return MONTHS[d.getMonth()].slice(0, 3) + " " + d.getDate(); }
  var WORDS = ["zero", "one", "two", "three", "four", "five", "six"];
  function weeksPhrase() { return WORDS[CONFIG.readyWeeks[0]] + " to " + WORDS[CONFIG.readyWeeks[1]] + " weeks"; }
  var DELIVERY_PLAIN = { pickup: "farm pickup", brighton: "Brighton market pickup", rochester: "Rochester delivery", buffalo: "Buffalo delivery" };
  var SCHEDULE_NOTE = "We'll schedule it for the next available day after your pork is back.";
  /* The one rule for the balance, same as any farm order: the card on the deposit is charged at packing. */
  var BALANCE_NOTE = "We charge the balance to the card you used for your deposit when we pack your order.";
  /* What a customer is told about a date that has closed. The page and the receiver both say it. */
  function closedLine() {
    return "If you reserved that date, we are using the last sheet you sent, or the standard sheet if you didn't send one.";
  }
  /* The deadline rule in words: every batch's due date is a week before its processing date (a test checks it). */
  var DUE_RULE = "one week before your processing date";
  /* The customer email's deposit sentence. order is the deposit order number when one came with the sheet (from a link). */
  function depositLine(side, reserved, order) {
    var ord = cleanOrder(order);
    if (ord) return "We will match this sheet to your deposit, order " + ord + ".";
    if (reserved) return "We will match this sheet to your deposit by this email address. If you used a different email at the farm store, reply and tell us which.";
    return "This sheet is not tied to a deposit yet. Your spot isn't held until your deposit is down: " + CONFIG.reserveUrl[side === "whole" ? "whole" : "half"];
  }
  /* How the timing works. No estimated dates: the customer sees only the dates they chose. */
  function timingLines() {
    var w = weeksPhrase();
    return [
      "Your hog goes to Timberline Meats on your processing date.",
      "Your pork is usually back at the farm, frozen, " + w + " after that. Smoked cuts take the longest.",
      "We email you as soon as it's back, with your hanging weight and your total.",
      "Then we schedule your delivery or pickup for the next available day: free delivery on our next Rochester or Buffalo delivery day, or pickup at the farm or the Brighton Farmers Market.",
      BALANCE_NOTE
    ];
  }
  /* The customer email's "When you get it" lines for the way they chose. */
  function whenLines(way) {
    return ["Your pork is usually back at the farm " + weeksPhrase() + " after your processing date. We'll email you when it's in, then schedule your " + (DELIVERY_PLAIN[way] || "delivery or pickup") + " for the next available day."];
  }

  function batchOpen(b, todayIso) { return b.due >= todayIso; }

  /* The rows both the review page and the receiver show: step, title, choice. */
  function summaryRows(state) {
    var side = state.side, n = normalize(state.answers, side), out = [];
    ROWS.forEach(function (r) {
      if (!isVisible(r, n, side)) return;
      var title = r.key === "sausage_1" && side === "whole" ? "Sausage, first half" : r.key === "sausage_2" ? "Sausage, second half" : r.title;
      out.push({ step: r.step, key: title.replace(/\?$/, ""), val: option(r.key, n[r.key]).l });
    });
    var keep = extrasLine(state.extras), note = cleanNote(state.instructions);
    if (keep) out.push({ step: "extras", key: "Extras", val: keep.replace("Keep: ", "").replace(/\.$/, "") });
    if (note) out.push({ step: "extras", key: "Note", val: note });
    return out;
  }
  function describeChoices(state) {
    var b = batch(state.batch), kind = state.side === "whole" ? "Whole hog" : "Half hog";
    var out = [!b && state.reserved === true ? kind + ", reserved. Processing date on the deposit." : kind + ", processing " + longDate(b.processing), ""];
    summaryRows(state).forEach(function (r) { out.push(r.key + ": " + r.val); });
    return out;
  }

  /* Text that goes on Timberline's sheet. The sheet's font has plain letters only, so curly quotes, dashes and
     accents become their plain forms and anything else becomes a question mark (one per character, an emoji too). */
  function sheetText(s) {
    var t = String(s == null ? "" : s).replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, "-")
      .replace(/\u2026/g, "...").replace(/\u00a0/g, " ");
    if (typeof t.normalize === "function") t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return t.replace(/[\ud800-\udbff][\udc00-\udfff]/g, "?").replace(/[^\x20-\x7e]/g, "?");
  }

  /* Helvetica's width for each character from 0x20 to 0x7E, per 1000 of the font size. Generated from pdf-lib's own
     metrics (StandardFonts.Helvetica, widthOfTextAtSize(ch, 1000)), one character at a time. pdf-lib's own measure of a
     whole string also subtracts kerning, but its drawText does not kern, so the sum of these is the width that gets drawn. */
  var HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
    278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611,
    722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
    556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
  function textWidth(s, size) {
    var t = sheetText(s), w = 0;
    for (var i = 0; i < t.length; i++) w += HELV[t.charCodeAt(i) - 32];
    return w * size / 1000;
  }
  /* Greedy wrap to the box at one size. A word wider than the box is broken into pieces that each fit. */
  function wrapAt(text, size) {
    var width = CONFIG.noteBox.width, words = text.split(/\s+/).filter(Boolean), lines = [], cur = "";
    words.forEach(function (w) {
      var t = cur ? cur + " " + w : w;
      if (textWidth(t, size) <= width) { cur = t; return; }
      if (cur) { lines.push(cur); cur = ""; }
      while (textWidth(w, size) > width) {
        var k = 1;
        while (k < w.length && textWidth(w.slice(0, k + 1), size) <= width) k++;
        lines.push(w.slice(0, k));
        w = w.slice(k);
      }
      cur = w;
    });
    if (cur) lines.push(cur);
    return lines;
  }
  /* The special instructions box: the first size whose lines fit (firstSizeLines at the first size, maxLines at the others).
     If none does, the last size's lines and fits false. Nothing is ever dropped. */
  function layoutInstructions(text) {
    var t = sheetText(text), sizes = CONFIG.noteBox.sizes, lines = [];
    for (var i = 0; i < sizes.length; i++) {
      lines = wrapAt(t, sizes[i]);
      if (lines.length <= (i === 0 ? CONFIG.noteBox.firstSizeLines : CONFIG.noteBox.maxLines)) return { size: sizes[i], lines: lines, fits: true };
    }
    return { size: sizes[sizes.length - 1], lines: lines, fits: false };
  }

  /* Maps answers onto the fields of Timberline's sheet. The notes go in this order so the identity (side, date, order)
     can never be pushed out of the box: identity, order, extras, then the customer's own note last. The ground pork pack
     size is not a note: it is written in the form's own "specify pound(s) per pack" blank. */
  function sheetData(state) {
    var side = state.side, n = normalize(state.answers, side), b = batch(state.batch), order = cleanOrder(state.order);
    var notes = [b ? "PVF " + side + ", processing " + shortDate(b.processing) + "." : "PVF " + side + ", reserved."];
    if (order) notes.push("Order #" + order + ".");
    var groundPork = n.sausage_1 === "ground_pork" || (side === "whole" && n.sausage_2 === "ground_pork");
    var ex = extrasLine(state.extras), note = cleanNote(state.instructions);
    if (ex) notes.push(ex);
    if (note) notes.push(note);
    var special = sheetText(notes.join(" ")), lay = layoutInstructions(special);
    function staff(k) { return option(k, n[k]).staff; }
    return {
      customer_name: state.name, farmer_name: CONFIG.farmerOnSheet, contact_phone: CONFIG.phone,
      price_quoted: "", date: state.today || "", hanging_weight: "", side: side,
      farm_logo: "yes", package_name: CONFIG.packageName, package_address: CONFIG.packageAddress, package_weight: "yes", invoice_to: "farmer",
      steak_thickness: thickNeeded(n) ? staff("steak_thickness") : "",
      roast_weight: n.butt === "roast" || n.shoulder === "roast" ? staff("roast_weight") : "", // no roasts, no roast weight on the sheet
      pork_chops: staff("pork_chops"),
      butt: staff("butt"), shoulder: staff("shoulder"), spare_ribs: staff("spare_ribs"), tenderloin: staff("tenderloin"),
      baby_back_ribs: n.pork_chops === "boneless" ? staff("baby_back_ribs") : "",
      ham: staff("ham"), bacon: staff("bacon"), ham_hocks: staff("ham_hocks"), smoked_jowl: staff("smoked_jowl"),
      sausage_1: n.sausage_1, sausage_2: side === "whole" ? n.sausage_2 : "",
      ground_pack_size: groundPork ? n.ground_pack_size : "", smoke_style: n.smoke_style, special_instructions: special,
      special_lines: lay.lines, special_size: lay.size, special_fits: lay.fits
    };
  }
  /* Will the notes fit Timberline's box? state needs side, batch, answers, extras, instructions, order and reserved.
     The batch job later prints the real date and order number on the sheet, so a note that fits now has to keep fitting then:
     the check runs on a copy with the order (or the stand-in 000000 when none is given yet), and a reserved sheet
     (no date of its own) must fit with every batch's date substituted. sheetData itself never prints the stand-in.
     No date and not reserved means no sheet yet, and the date check stops a send, so that is not a note problem. */
  function noteFits(state) {
    if (!state) return true;
    var order = cleanOrder(state.order) || "000000";
    function copy(batchId) {
      var c = {};
      Object.keys(state).forEach(function (k) { c[k] = state[k]; });
      c.order = order; c.batch = batchId;
      return c;
    }
    if (batch(state.batch)) return sheetData(copy(state.batch)).special_fits;
    if (state.reserved === true) {
      return CONFIG.batches.every(function (b) { return sheetData(copy(b.id)).special_fits; });
    }
    return true;
  }

  /* Base64 of a binary string. Browsers and Node have btoa and atob; Google Apps Script has neither, so the receiver
     (which rebuilds links from a sheet's choices) uses these plain versions. */
  var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  function b64encode(bin) {
    if (typeof btoa !== "undefined") return btoa(bin);
    var out = "", i, a, b, c;
    for (i = 0; i < bin.length; i += 3) {
      a = bin.charCodeAt(i); b = i + 1 < bin.length ? bin.charCodeAt(i + 1) : NaN; c = i + 2 < bin.length ? bin.charCodeAt(i + 2) : NaN;
      out += B64.charAt(a >> 2) + B64.charAt(((a & 3) << 4) | (isNaN(b) ? 0 : b >> 4)) +
        (isNaN(b) ? "=" : B64.charAt(((b & 15) << 2) | (isNaN(c) ? 0 : c >> 6))) + (isNaN(c) ? "=" : B64.charAt(c & 63));
    }
    return out;
  }
  function b64decode(b64) {
    if (typeof atob !== "undefined") return atob(b64);
    var s = String(b64).replace(/=+$/, ""), out = "", bits = 0, acc = 0, i, v;
    for (i = 0; i < s.length; i++) {
      v = B64.indexOf(s.charAt(i));
      if (v < 0) throw new Error("not base64");
      acc = (acc << 6) | v; bits += 6;
      if (bits >= 8) { bits -= 8; out += String.fromCharCode((acc >> bits) & 255); acc &= (1 << bits) - 1; }
    }
    return out;
  }

  /* Choices travel in the link, so a sheet can be reopened or shared without an account.
     It carries the note, delivery choice and order number; never name, email or phone. */
  function encodeShare(state) {
    var j = { s: state.side, b: state.batch, a: state.answers, x: cleanExtras(state.extras), p: state.preset, r: state.reserved ? 1 : 0 };
    /* The note, delivery choice and order number are always written, empty or not, so a link with none of them
       clears what an older saved draft still holds. A link that leaves a key out (an old link) falls back to the draft. */
    j.n = cleanNote(state.instructions);
    j.d = DELIVERY.indexOf(state.delivery) >= 0 ? state.delivery : "";
    j.o = cleanOrder(state.order);
    var s = JSON.stringify(j);
    var b64 = b64encode(unescape(encodeURIComponent(s)));
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function decodeShare(hash) {
    try {
      var h = String(hash).replace(/-/g, "+").replace(/_/g, "/");
      var raw = decodeURIComponent(escape(b64decode(h)));
      var j = JSON.parse(raw);
      if (!j || typeof j !== "object" || Array.isArray(j)) return null;
      var out = { side: j.s === "whole" ? "whole" : "half", batch: typeof j.b === "string" ? j.b : "", answers: j.a && typeof j.a === "object" ? j.a : {},
        extras: cleanExtras(j.x), preset: typeof j.p === "string" ? j.p : "" };
      if (typeof j.n === "string") out.instructions = cleanNote(j.n);
      if (j.d === "" || DELIVERY.indexOf(j.d) >= 0) out.delivery = j.d; // "" is a choice not made; anything else unknown is ignored
      if (typeof j.o === "string") out.order = cleanOrder(j.o);
      if (j.r === 1 || j.r === 0) out.reserved = j.r === 1; // an old link has no r: reserved stays undefined
      return out;
    } catch (e) { return null; }
  }

  /* What to use when a link is opened. Link wins for the sheet and for the
     note, delivery and order number it carries (an empty one included); a link that does not carry one falls back to the
     saved draft. Contact details come from the saved draft. */
  function applyShare(saved, shared) {
    var sv = saved || {}, sh = shared || {}, side = sh.side === "whole" ? "whole" : "half";
    return {
      side: side,
      batch: sh.batch || "",
      preset: sh.preset || "custom",
      answers: normalize(sh.answers, side),
      extras: cleanExtras(sh.extras),
      instructions: sh.instructions !== undefined ? cleanNote(sh.instructions) : cleanNote(sv.instructions),
      delivery: sh.delivery === "" ? "" : (DELIVERY.indexOf(sh.delivery) >= 0 ? sh.delivery : (DELIVERY.indexOf(sv.delivery) >= 0 ? sv.delivery : "")),
      order: sh.order !== undefined ? cleanOrder(sh.order) : cleanOrder(sv.order),
      /* true or false when the link says so; a link without it (an old link) hands back the saved draft's own value untouched.
         The page keeps "yes", "no" or "" and maps the two in app.js. */
      reserved: sh.reserved === true || sh.reserved === false ? sh.reserved : sv.reserved,
      name: String(sv.name == null ? "" : sv.name),
      email: String(sv.email == null ? "" : sv.email),
      phone: String(sv.phone == null ? "" : sv.phone)
    };
  }

  return {
    CONFIG: CONFIG, FLAVORS: FLAVORS, ROWS: ROWS, ROW: ROW, PRESETS: PRESETS, YIELD: YIELD, defaults: defaults, applyPreset: applyPreset,
    option: option, normalize: normalize, smokeNeeded: smokeNeeded, isVisible: isVisible, addons: addons, cureAmount: cureAmount, summaryRows: summaryRows, describeChoices: describeChoices, freezer: freezer,
    estimate: estimate, extrasLine: extrasLine, sheetData: sheetData, batch: batch, longDate: longDate, shortDate: shortDate,
    batchOpen: batchOpen, encodeShare: encodeShare, decodeShare: decodeShare,
    ORGANS: ORGANS, DELIVERY: DELIVERY, DELIVERY_LABEL: DELIVERY_LABEL, DELIVERY_SHORT: DELIVERY_SHORT, DELIVERY_PLAIN: DELIVERY_PLAIN, SCHEDULE_NOTE: SCHEDULE_NOTE, BALANCE_NOTE: BALANCE_NOTE,
    timingLines: timingLines, whenLines: whenLines, weeksPhrase: weeksPhrase, cleanExtras: cleanExtras, cleanNote: cleanNote, todayNY: todayNY, applyShare: applyShare,
    sheetText: sheetText, textWidth: textWidth, layoutInstructions: layoutInstructions, noteFits: noteFits, presetBlurb: presetBlurb,
    closedLine: closedLine, depositLine: depositLine, DUE_RULE: DUE_RULE, cleanOrder: cleanOrder, HELVETICA_WIDTHS: HELV
  };
});
