/* Fills Timberline's cut sheet in the browser. A port of the staff tool's
   overlay_cut_sheet (cutsheet_pdf.py), including the PVF form fix that wraps
   special instructions inside the left box. Two deliberate differences: the
   pounds-per-pack blank on the Ground pork row is filled, and the package
   address starts inside its blank.
   tests/compare_pdf.py rasterizes this output against the Python output,
   ignoring those two places, and checks them directly. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PVFSheet = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var SAUSAGE_BLANKS = {
    ground_pork: [136.5, 178.5, 324], breakfast_bulk: [195.2, 251.2, 308], breakfast_links: [493.7, 549.7, 308],
    maple_bulk: [185.8, 248.8, 292], maple_links: [494.8, 550.8, 292], southern_bulk: [175.7, 238.7, 276],
    southern_links: [485.0, 541.0, 276], chorizo_bulk: [187.4, 229.4, 260], chorizo_rope: [370.9, 426.9, 260],
    garlic_bulk: [190.5, 232.5, 244], garlic_rope: [374.0, 430.0, 244], hot_italian_bulk: [153.2, 195.2, 228],
    hot_italian_rope: [336.7, 392.7, 228], mild_italian_bulk: [159.4, 201.4, 212], mild_italian_rope: [342.9, 398.9, 212],
    sweet_italian_bulk: [165.6, 207.6, 196], sweet_italian_rope: [349.1, 405.1, 196], regular_bulk: [185.1, 248.1, 180],
    regular_rope: [389.3, 452.3, 180]
  };
  /* The "specify pound(s) per pack" blank on the Ground pork row (measured from the form: x 331.5 to 401.5, same row as the
     ground pork mark). The staff tool leaves it empty; this builder fills it. */
  var PACK_BLANK = [331.5, 401.5, 324];
  var YELLOW = [1.0, 0.94, 0.35], ORANGE = [1.0, 0.65, 0.0];

  /* The model's sheetText does this too (this file does not import the model): curly quotes, dashes and the ellipsis
     become their plain forms first, then anything the sheet's font cannot show becomes a question mark. */
  function pdfSafe(t) {
    return String(t || "").replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, "-")
      .replace(/\u2026/g, "...").replace(/[^\x20-\x7E\u00a0-\u00ff]/g, "?");
  }

  /* Greedy wrap. A word wider than the box is broken into pieces that each fit. */
  function wrap(text, font, size, width) {
    var words = text.split(/\s+/).filter(Boolean), lines = [], cur = "";
    function w(t) { return font.widthOfTextAtSize(t, size); }
    words.forEach(function (word) {
      var t = cur ? cur + " " + word : word;
      if (w(t) <= width) { cur = t; return; }
      if (cur) { lines.push(cur); cur = ""; }
      while (w(word) > width) {
        var k = 1;
        while (k < word.length && w(word.slice(0, k + 1)) <= width) k++;
        lines.push(word.slice(0, k));
        word = word.slice(k);
      }
      cur = word;
    });
    if (cur) lines.push(cur);
    return lines;
  }
  function instructionLines(text, font) {
    var sizes = [7.2, 6.8, 6.4, 6.0];
    for (var i = 0; i < sizes.length; i++) {
      var lines = wrap(text, font, sizes[i], 122);
      if (lines.length <= 4 || (sizes[i] < 7.2 && lines.length <= 6)) return { size: sizes[i], lines: lines };
    }
    return { size: 6.0, lines: wrap(text, font, 6.0, 122) };
  }
  function needsSmoke(d) {
    return ["smoked", "bone_in_smoked", "canadian"].indexOf(d.pork_chops) >= 0 || d.butt === "irish" ||
      d.ham === "smoked_whole" || d.ham === "smoked_slices" || d.bacon === "smoked_sliced" ||
      d.ham_hocks === "smoked" || d.smoked_jowl === "yes";
  }

  async function fill(PDFLib, templateBytes, d) {
    var doc = await PDFLib.PDFDocument.load(templateBytes);
    var page = doc.getPages()[0];
    var reg = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
    var bold = await doc.embedFont(PDFLib.StandardFonts.HelveticaBold);
    var rgb = PDFLib.rgb, black = rgb(0, 0, 0);
    function c(a) { return rgb(a[0], a[1], a[2]); }
    function write(x, y, value, size, maxWidth) {
      if (!value) return;
      size = size || 10;
      var t = pdfSafe(value);
      if (maxWidth) while (reg.widthOfTextAtSize(t, size) > maxWidth && size > 7) size -= 1;
      page.drawText(t, { x: x, y: y, size: size, font: reg, color: black });
    }
    function centered(mid, y, t, font, size) {
      page.drawText(t, { x: mid - font.widthOfTextAtSize(t, size) / 2, y: y, size: size, font: font, color: black });
    }
    function writeInBlank(x1, x2, y, value, size) {
      if (!value) return;
      size = size || 9;
      var t = pdfSafe(value), max = x2 - x1 - 2;
      while (reg.widthOfTextAtSize(t, size) > max && size > 6) size -= 0.5;
      centered((x1 + x2) / 2, y, t, reg, size);
    }
    function markBlank(x1, x2, y) {
      page.drawRectangle({ x: x1 - 1, y: y - 2, width: x2 - x1 + 2, height: 13, color: c(YELLOW) });
      centered((x1 + x2) / 2, y + 1, "X", bold, 12);
    }
    function highlight(x1, x2, y) {
      page.drawRectangle({ x: x1 - 2, y: y - 2, width: x2 - x1 + 4, height: 13, borderColor: c(ORANGE), borderWidth: 1.4 });
    }
    function choice(field, map) {
      var p = map[d[field]];
      if (p) markBlank(p[0], p[1], p[2]);
    }

    write(160, 709, d.customer_name, 10, 165);
    write(160, 690, d.farmer_name, 10, 185);
    write(158, 673, d.contact_phone, 10, 205);
    write(143, 657, d.price_quoted, 10, 100);
    write(277, 657, d.date, 10, 95);
    write(428, 657, d.hanging_weight, 10, 120);
    choice("side", { whole: [95.7, 144.7, 641], half: [171.1, 220.1, 641] });
    if (d.farm_logo === "yes") highlight(314.9, 342.1, 624); else highlight(362.4, 383.3, 624);
    write(180, 609, d.package_name, 10, 134);
    write(367, 609, d.package_address, 10, 178);
    if (d.package_weight === "yes") highlight(398.9, 426.1, 592); else highlight(446.3, 467.3, 592);
    choice("invoice_to", { farmer: [254.5, 284.5, 579], customer: [466.9, 514.9, 579] });
    writeInBlank(192.5, 234.5, 550, d.steak_thickness);
    writeInBlank(422.0, 457.0, 550, d.roast_weight);
    choice("pork_chops", { bone_in: [171.9, 199.9, 501], boneless: [266.3, 301.3, 501], smoked: [370.9, 398.9, 501], canadian: [520.2, 555.2, 501] });
    choice("butt", { steak: [117.8, 145.8, 485], roast: [192.8, 227.8, 485], irish: [319.6, 368.6, 485] });
    choice("shoulder", { steak: [145.8, 187.8, 469], roast: [234.8, 290.8, 469] });
    if (d.spare_ribs === "yes") markBlank(149.3, 177.3, 453);
    if (d.tenderloin === "yes") markBlank(122.8, 164.8, 437);
    if (d.baby_back_ribs === "yes") markBlank(255.0, 297.0, 437);
    choice("ham", { fresh_whole: [158.6, 186.6, 421], fresh_slices: [268.2, 303.2, 421], smoked_whole: [411.2, 439.2, 421], smoked_slices: [526.6, 554.6, 421] });
    choice("bacon", { fresh_whole: [166.4, 201.4, 405], fresh_sliced: [285.3, 320.3, 405], smoked_sliced: [452.8, 508.8, 405] });
    choice("ham_hocks", { fresh: [160.9, 195.9, 389], smoked: [303.2, 359.2, 389] });
    if (d.smoked_jowl === "yes") markBlank(180.4, 236.4, 373);

    var choices = [d.sausage_1 || "ground_pork"];
    if (d.side !== "half" && d.sausage_2) choices.push(d.sausage_2);
    var seen = {};
    choices.forEach(function (k) {
      if (seen[k] || !SAUSAGE_BLANKS[k]) return;
      seen[k] = 1;
      var b = SAUSAGE_BLANKS[k];
      markBlank(b[0], b[1], b[2]);
    });
    if (seen.ground_pork && d.ground_pack_size) writeInBlank(PACK_BLANK[0], PACK_BLANK[1], PACK_BLANK[2], d.ground_pack_size);
    if (needsSmoke(d)) {
      if (d.smoke_style === "natural") highlight(291.1, 543.0, 127); else highlight(56.8, 283.0, 127);
    }
    /* The model has already laid the notes out (special_lines at special_size), so the page, the receiver and this PDF agree.
       Without that, measure and wrap here. Lines are never dropped: more than six is an error, not a cut-off note. */
    var laidOut = Array.isArray(d.special_lines) && typeof d.special_size === "number";
    if (laidOut ? d.special_lines.length : d.special_instructions) {
      var fit = laidOut ? { size: d.special_size, lines: d.special_lines } : instructionLines(pdfSafe(d.special_instructions), reg), y = 83;
      if (fit.lines.length > 6) throw new Error("special instructions do not fit");
      fit.lines.forEach(function (line) {
        page.drawText(pdfSafe(line), { x: 58, y: y, size: fit.size, font: reg, color: black });
        y -= fit.size === 7.2 ? 10 : fit.size + 2;
      });
    }
    return doc.save();
  }
  return { fill: fill, instructionLines: instructionLines };
});
