(function () {
  const recipes = window.RECIPES || [];
  const storageKey = "lilach-book-v1";
  const CATEGORY_ORDER = ["עוגות", "עוגיות", "קינוחים", "מאפים", "בשר ועוף", "דגים", "מרקים", "סלטים", "תבשילים", "תוספות", "פסח", "עוד מהמטבח"];
  const AISLES = [
    ["ירקות ופירות", /בצל|עגבנ|פלפל|חציל|קישוא|גזר|תפוח|תפוז|פטרי|שום|לימון|כרוב|חסה|נענע|פטרוז|כוסבר|תמר|אוכמנ|שזיף|משמש|רימון|תות|סלק|קינוא|מלפפון|תרד|תפו"א|תפוחי אדמה/],
    ["בשר, עוף ודגים", /בשר|עוף|הודו|כבד|דג|בקר|טחון|נקניק|פרפר|גפילט|חזה|כרעיים/],
    ["מוצרי חלב וביצים", /גבינ|שמנת|חלב|חמאה|יוגורט|ביצ|חלמון|חלבון|קוטג|מסקרפונ|בולגרית|מרגרינ|טוב טעם/],
    ["מזווה", /קמח|סוכר|שמן|אורז|קקאו|שוקולד|קוסקוס|פסטה|אטרי|חומוס|עדש|שמר|סולת|טחינה|דבש|וניל|אבקת|מלח|כמון|פפריק|כורכום|קינמון|קורנפלור|פודינג|אפייה|פירורי|אגוז|שקד|פרג|קוקוס|שומשום|ריבה|מצה|ביסקוו|פתי בר/]
  ];
  const AISLE_ORDER = AISLES.map(function (a) { return a[0]; }).concat(["שונות"]);
  const ordered = CATEGORY_ORDER.reduce(function (acc, c) {
    return acc.concat(recipes.filter(function (r) { return r.category === c; }));
  }, []);
  const bookPage = {};
  ordered.forEach(function (r, i) { bookPage[r.id] = i + 1; });
  const UNITS = ["ק\"ג", "קג", "קילו", "גרם", "גר'", "גר’", "גר", "מ\"ל", "מל", "ליטר", "כפות", "כף", "כפיות", "כפית", "כוסות", "כוס", "חב'", "שיני", "שן"];

  const $ = function (id) { return document.getElementById(id); };
  const els = {
    cover: $("cover"), app: $("app"),
    library: $("view-library"), recipe: $("view-recipe"), list: $("view-list"),
    categories: $("categories"), featured: $("featured"), sections: $("sections"),
    search: $("searchInput"), count: $("listCount"),
    picked: $("picked"), shop: $("shop"),
    lightbox: $("lightbox"), lightboxImg: $("lightboxImg"), toast: $("toast")
  };

  let filter = "";
  let query = "";
  const openChapters = {};
  let draftTimes = 1;
  let photoIndex = 0;
  let store = load();

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
      return { picks: saved.picks || {}, checks: saved.checks || {}, hidden: saved.hidden || {} };
    } catch (error) {
      return { picks: {}, checks: {}, hidden: {} };
    }
  }

  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify(store)); } catch (error) { /* private mode */ }
    const n = Object.keys(store.picks).filter(byId).length;
    els.count.textContent = n;
    els.count.classList.toggle("zero", n === 0);
  }

  function byId(id) { return recipes.find(function (r) { return r.id === id; }); }
  function esc(value) {
    return String(value).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function rich(value) {
    return esc(value)
      .replace(/([\u05D0-\u05EA])(?=\d)/g, "$1 ")
      .replace(/\d+(?:[.,\/]\d+)*°?/g, "<span class=\"num\">$&</span>")
      .replace(/\[\?\]/g, "<mark>[?]</mark>");
  }
  function isHeading(line) { return /:\s*$/.test(String(line).trim()); }
  function iconFor(category) {
    if (/עוגות|עוגיות|קינוחים|מאפים/.test(category)) return "cake";
    if (category === "בשר ועוף") return "meat";
    if (category === "דגים") return "fish";
    if (/מרקים|תבשילים/.test(category)) return "bowl";
    return "leaf";
  }
  function food(file) { return "images/food/" + file; }
  function notebook(recipe) { return "images/notebook/" + recipe.notebook; }
  function ingredientCount(recipe) { return recipe.ingredients.filter(function (l) { return !isHeading(l); }).length; }

  function toast(text) {
    els.toast.textContent = text;
    els.toast.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { els.toast.hidden = true; }, 1800);
  }

  /* ---------- Quantities ---------- */
  function fraction(value) {
    return value.trim().split(/\s+/).reduce(function (sum, part) {
      if (part.indexOf("/") !== -1) {
        const bits = part.split("/");
        return sum + Number(bits[0]) / Number(bits[1]);
      }
      return sum + Number(part.replace(",", "."));
    }, 0);
  }

  function parseLine(line) {
    const text = String(line).trim();
    let qty = null;
    let rest = "";
    const match = text.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?)\s+(.+)$/);
    if (match) { qty = fraction(match[1]); rest = match[2]; }
    else if (text.indexOf("חצי ") === 0) { qty = 0.5; rest = text.slice(4); }
    else if (text.indexOf("רבע ") === 0) { qty = 0.25; rest = text.slice(4); }
    if (qty === null || !isFinite(qty) || /^\d/.test(rest)) return null;
    let unit = "";
    let name = rest;
    for (let i = 0; i < UNITS.length; i += 1) {
      if (rest === UNITS[i] || rest.indexOf(UNITS[i] + " ") === 0) {
        unit = UNITS[i];
        name = rest.slice(UNITS[i].length).trim();
        break;
      }
    }
    return name ? { qty: qty, unit: unit, name: name } : null;
  }

  const QTY_WORDS = "כוסות|כוס|כפיות|כפית|כפות|כף|חב'|ק\"ג|קילו|גרם|גר'|גר’|גר|מ\"ל|ליטר|שקיות|שקית|חבילות|חבילת|חבילה|חופן|מיכל|גביע|גביעים|שיני|שן|פחית|קופסת|קופסה|יחידות";
  const QTY_RE = new RegExp(
    "^((?:כ-?\\s?)?(?:\\d+(?:[.,]\\d+)?(?:\\/\\d+)?(?:\\s*[-–]\\s*\\d+(?:[.,]\\d+)?)?(?:\\s+\\d+(?:\\/\\d+)?)?|[½¼¾]|חצי|רבע|שליש)" +
    "(?:\\s+(?:" + QTY_WORDS + ")(?=\\s|$))?" +
    "(?:\\s+(?:וחצי|ורבע))?)\\s+(.+)$"
  );
  const UNIT_ONLY_RE = new RegExp("^((?:" + QTY_WORDS + "|קורט|מעט|קצת)(?:\\s+(?:וחצי|ורבע))?)\\s+(.+)$");

  const MARKER_RE = /^(?:\(\d{1,2}\)|\d{1,2}[.)](?!\d)|[א-י][.)](?=\s)|[*•·])\s*/;
  const INLINE_HEAD_RE = /^([^:]{2,30}):\s*((?:\(\d{1,2}\)|\d{1,2}[.)](?!\d)|[א-י][.)](?=\s))\s*.+)$/;
  const METHOD_TITLE_RE = /^(?:אופן\s+(?:ה)?הכנה|הכנה|ההכנה)$/;

  function cleanIngredient(line) { return String(line).trim().replace(/^[*•·]\s*/, ""); }

  function stepItems(recipe) {
    const items = [];
    recipe.steps.forEach(function (line) {
      let raw = String(line).trim();
      if (!raw) return;
      const inline = raw.match(INLINE_HEAD_RE);
      if (inline) {
        if (!METHOD_TITLE_RE.test(inline[1].trim())) items.push({ group: true, text: inline[1].trim() });
        raw = inline[2];
      } else if (isHeading(raw)) {
        const title = raw.replace(/:\s*$/, "").trim();
        if (title.length > 90) { items.push({ group: false, intro: true, text: raw }); return; }
        if (!METHOD_TITLE_RE.test(title)) items.push({ group: true, text: title });
        return;
      }
      items.push({ group: false, text: raw.replace(MARKER_RE, "") });
    });
    while (items.length && items[items.length - 1].group) items.pop();
    return items;
  }

  function splitQty(line) {
    const text = String(line).trim();
    const m = text.match(QTY_RE) || text.match(UNIT_ONLY_RE);
    return m ? [m[1], m[2]] : ["", text];
  }

  const icon = function (body) { return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\">" + body + "</svg>"; };
  const ICONS = {
    list: icon("<path d=\"M9 6h11M9 12h11M9 18h11\"/><circle cx=\"4.5\" cy=\"6\" r=\"1\"/><circle cx=\"4.5\" cy=\"12\" r=\"1\"/><circle cx=\"4.5\" cy=\"18\" r=\"1\"/>"),
    steps: icon("<path d=\"M4 7l2 2 3.5-4M4 16l2 2 3.5-4M13 7h7M13 16h7\"/>"),
    scale: icon("<path d=\"M3 11h18a9 9 0 0 1-18 0Z\"/><path d=\"M8 7c0-1.5 1-2 1-3.5M12 7c0-1.5 1-2 1-3.5M16 7c0-1.5 1-2 1-3.5\"/>"),
    book: icon("<path d=\"M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5Z\"/><path d=\"M12 6.5v13\"/>")
  };

  function formatQty(qty) {
    const whole = Math.floor(qty + 0.001);
    const part = qty - whole;
    const FRACTIONS = [[0.5, "חצי", " וחצי"], [0.25, "רבע", " ורבע"], [0.75, "3/4", " ו-3/4"], [0.125, "1/8", " ו-1/8"], [0.375, "3/8", " ו-3/8"], [0.625, "5/8", " ו-5/8"], [0.875, "7/8", " ו-7/8"], [1 / 3, "שליש", " ושליש"], [2 / 3, "2/3", " ו-2/3"]];
    let glyph = null;
    FRACTIONS.forEach(function (f) { if (!glyph && Math.abs(part - f[0]) < 0.02) glyph = f; });
    if (part < 0.02) return String(whole);
    if (glyph) return whole ? whole + glyph[2] : glyph[1];
    return String(Math.round(qty * 100) / 100);
  }

  function aisleFor(text) {
    for (let i = 0; i < AISLES.length; i += 1) if (AISLES[i][1].test(text)) return AISLES[i][0];
    return "שונות";
  }

  function shopping() {
    const merged = {};
    const groups = {};
    shopping.hiddenItems = [];
    Object.keys(store.picks).forEach(function (id) {
      const recipe = byId(id);
      if (!recipe) return;
      const times = store.picks[id];
      recipe.ingredients.forEach(function (line) {
        if (isHeading(line)) return;
        line = cleanIngredient(line);
        const parsed = parseLine(line);
        let key;
        let entry;
        if (parsed) {
          key = parsed.unit + "|" + parsed.name;
          entry = merged[key] || (merged[key] = { key: key, qty: 0, unit: parsed.unit, name: parsed.name, from: [], aisle: aisleFor(parsed.name) });
          entry.qty += parsed.qty * times;
        } else {
          key = "raw|" + id + "|" + line;
          entry = merged[key] || (merged[key] = { key: key, raw: line, times: times, from: [], aisle: aisleFor(line) });
        }
        if (entry.from.indexOf(recipe.name) === -1) entry.from.push(recipe.name);
      });
    });
    Object.keys(merged).forEach(function (key) {
      const e = merged[key];
      e.label = e.raw !== undefined
        ? e.raw + (e.times > 1 ? " (×" + e.times + ")" : e.times < 1 ? " (חצי כמות)" : "")
        : [formatQty(e.qty), e.unit, e.name].filter(Boolean).join(" ");
      if (store.hidden[key]) { shopping.hiddenItems.push(e); return; }
      (groups[e.aisle] = groups[e.aisle] || []).push(e);
    });
    return groups;
  }

  /* ---------- Routing ---------- */
  function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }

  function route() {
    const hash = location.hash;
    if (!hash) {
      els.cover.hidden = false;
      els.app.hidden = true;
      document.body.classList.remove("is-recipe", "is-library");
      return;
    }
    els.cover.hidden = true;
    els.app.hidden = false;
    const recipeMatch = hash.match(/^#\/recipe\/([\w-]+)/);
    const view = recipeMatch ? "recipe" : hash.indexOf("#/list") === 0 ? "list" : "library";
    els.library.hidden = view !== "library";
    els.recipe.hidden = view !== "recipe";
    document.body.classList.toggle("is-recipe", view === "recipe");
    document.body.classList.toggle("is-library", view === "library");
    els.list.hidden = view !== "list";
    $("libraryBtn").classList.toggle("on", view !== "list");
    $("listBtn").classList.toggle("on", view === "list");
    if (view === "library") renderLibrary();
    if (view === "recipe") {
      draftTimes = 1;
      photoIndex = 0;
      renderRecipe(recipeMatch[1]);
    }
    if (view === "list") renderList();
    window.scrollTo(0, 0);
  }

  /* ---------- Library ---------- */
  function presentCategories() {
    return CATEGORY_ORDER.filter(function (c) { return recipes.some(function (r) { return r.category === c; }); });
  }

  function matches(recipe) {
    if (!query) return true;
    return (recipe.name + " " + recipe.ingredients.join(" ")).toLowerCase().indexOf(query) !== -1;
  }

  function renderCategories() {
    const items = [["", "הכול"]].concat(presentCategories().map(function (c) { return [c, c]; }));
    els.categories.innerHTML = items.map(function (item) {
      return "<button type=\"button\" data-cat=\"" + esc(item[0]) + "\" class=\"" + (item[0] === filter ? "on" : "") + "\">" + esc(item[1]) + "</button>";
    }).join("");
  }

  function entryHtml(recipe) {
    const on = !!store.picks[recipe.id];
    return "<div class=\"entry\">" +
      "<button type=\"button\" class=\"entry-name\" data-open=\"" + recipe.id + "\">" + esc(recipe.name) + "</button>" +
      "<span class=\"leader\"></span>" +
      "<span class=\"entry-page\">" + bookPage[recipe.id] + "</span>" +
      "<button type=\"button\" class=\"pick-btn" + (on ? " in" : "") + "\" data-add=\"" + recipe.id + "\" aria-label=\"" + (on ? "הסרה מרשימת הקניות" : "הוספה לרשימת הקניות") + "\" title=\"" + (on ? "ברשימת הקניות" : "לרשימת הקניות") + "\">" + (on ? "✓" : "+") + "</button>" +
    "</div>";
  }

  function renderLibrary() {
    renderCategories();
    els.featured.innerHTML = "";

    const searching = !!query;
    const all = presentCategories();
    const cats = filter ? [filter] : all;
    const html = cats.map(function (c) {
      const list = ordered.filter(function (r) { return r.category === c && matches(r); });
      if (!list.length) return "";
      const open = searching || filter || !!openChapters[c];
      return "<section class=\"chapter\">" +
        "<button type=\"button\" class=\"chapter-toggle\" data-toggle=\"" + esc(c) + "\" aria-expanded=\"" + open + "\">" +
          "<span>" + esc(c) + "</span><span class=\"mark\">" + (open ? "–" : "+") + "</span></button>" +
        "<span class=\"chapter-rule\"></span>" +
        (open ? "<div class=\"entries\">" + list.map(entryHtml).join("") + "</div>" : "") +
      "</section>";
    }).join("");
    els.sections.innerHTML = html || "<p class=\"empty\">לא נמצאו מתכונים. אפשר לנסות מילה אחרת.</p>";
  }

  function recipeHeading(name) {
    const match = String(name).match(/^(.*?)\s*[(\[]\s*([^)\]]+?)\s*[)\]]\s*$/);
    if (match && match[1].trim()) return { title: match[1].trim(), sub: match[2].trim() };
    return { title: String(name).trim(), sub: "" };
  }

  /* ---------- Recipe ---------- */
  function renderRecipe(id) {
    const recipe = byId(id);
    if (!recipe) { go("#/"); return; }
    const picked = store.picks[id];
    const times = picked || draftTimes;
    const hasGap = recipe.ingredients.concat(recipe.steps).some(function (l) { return String(l).indexOf("[?]") !== -1; });
    const heading = recipeHeading(recipe.name);

    let n = 0;
    const steps = stepItems(recipe).map(function (item) {
      if (item.group) { n = 0; return "<li class=\"group\"><span class=\"t\">" + rich(item.text) + "</span></li>"; }
      if (item.intro) return "<li class=\"intro\"><span class=\"t\">" + rich(item.text) + "</span></li>";
      n += 1;
      return "<li><span class=\"n\">" + n + "</span><span class=\"t\">" + rich(item.text) + "</span></li>";
    }).join("");

    const ingredients = recipe.ingredients.map(function (line) {
      if (isHeading(line)) return "<p class=\"ing-group\">" + rich(String(line).replace(/:\s*$/, "")) + "</p>";
      const parts = splitQty(cleanIngredient(line));
      return "<p class=\"ing\">" + (parts[0] ? "<span class=\"qty\">" + rich(parts[0]) + "</span> " : "") + rich(parts[1]) + "</p>";
    }).join("");

    let photoSrc = "";
    let footer = "<footer class=\"recipe-foot\"></footer>";
    if (recipe.photos.length || recipe.ai) {
      photoSrc = recipe.photos.length ? food(recipe.photos[photoIndex] || recipe.photos[0]) : "images/" + recipe.ai;
      const thumbs = recipe.photos.length > 1
        ? "<div class=\"thumbs\">" + recipe.photos.map(function (p, i) {
          return "<button type=\"button\" data-photo=\"" + i + "\" class=\"" + (i === photoIndex ? "on" : "") + "\"><img src=\"" + food(p) + "\" alt=\"\"></button>";
        }).join("") + "</div>"
        : "";
      footer = "<footer class=\"recipe-foot\">" +
        (recipe.photos.length ? "" : "<span class=\"photo-caption\">תמונה להמחשה</span>") + thumbs + "</footer>";
    }

    const index = ordered.findIndex(function (r) { return r.id === id; });
    const prevRecipe = index > 0 ? ordered[index - 1] : null;
    const nextRecipe = index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : null;

    els.recipe.innerHTML =
      "<article class=\"recipe\">" +
        "<div class=\"book-stage\">" +
        turnButton(prevRecipe, "prev") +
        "<div class=\"page-wrap\"><div class=\"spread\">" +
          (photoSrc ? "<div class=\"photo-bleed\" aria-hidden=\"true\"></div><div class=\"photo-layer\" role=\"img\" aria-label=\"" + esc(heading.title) + "\"></div>" : "") +
          "<header class=\"recipe-head\">" +
            "<div class=\"recipe-intro\">" +
              "<p class=\"from-notebook\">מהמחברת של לילך</p>" +
              "<h1 class=\"recipe-title\">" + esc(heading.title) + "</h1>" +
              (heading.sub ? "<p class=\"recipe-sub\">" + rich(heading.sub) + "</p>" : "") +
              "<div class=\"recipe-tools\">" +
                "<div class=\"qty-step\"><button type=\"button\" id=\"more\" aria-label=\"יותר\">+</button><output id=\"times\">" + timesLabel(times) + "</output><button type=\"button\" id=\"less\" aria-label=\"פחות\">−</button></div>" +
                (recipe.notebook ? "<button type=\"button\" class=\"notebook-link\" id=\"openNotebook\">עמוד " + recipe.page + "</button>" : "") +
            "<button type=\"button\" id=\"addRecipe\" class=\"btn" + (picked ? " added" : "") + "\">" + (picked ? "✓ ברשימת הקניות" : "הוספה לרשימת הקניות") + "</button>" +
              "</div>" +
            "</div>" +
          "</header>" +
          "<div class=\"cols\"><span class=\"rule-icon ico-" + iconFor(recipe.category) + "\"></span>" +
          "<section class=\"page page-r\">" +
            "<h2>מצרכים</h2>" +
            "<div class=\"ing-list\">" + ingredients + "</div>" +
            "" +
          "</section>" +
          "<section class=\"page page-l\">" +
            "<h2>אופן ההכנה</h2>" +
            (steps ? "<ol class=\"steps\">" + steps + "</ol>" : "<p class=\"note\">אופן ההכנה עדיין לא הועתק מהמחברת. אפשר לקרוא אותו בצילום הדף.</p>") +
            (hasGap ? "<p class=\"note\">מילה שלא נקראה בכתב היד מסומנת <mark>[?]</mark>. אפשר לבדוק בצילום הדף מהמחברת.</p>" : "") +
          "</section>" +
          "</div>" + footer +
        "</div></div>" +
        turnButton(nextRecipe, "next") +
      "</div>" +
      "</article>";

    const spread = els.recipe.querySelector(".spread");
    els.recipe.querySelector(".recipe-title").style.setProperty("--tsize", Math.max(3.8, Math.min(6.2, 36 / (heading.title.length * 0.36))).toFixed(2) + "cqw");
    if (photoSrc) spread.style.setProperty("--photo", "url(\"" + encodeURI(photoSrc).replace(/"/g, "%22") + "\")");

    if (prevRecipe) $("prevRecipe").onclick = function () { turnTo(prevRecipe.id); };
    if (nextRecipe) $("nextRecipe").onclick = function () { turnTo(nextRecipe.id); };

    $("less").onclick = function () { setTimes(id, lessTimes(times)); };
    $("more").onclick = function () { setTimes(id, moreTimes(times)); };
    $("addRecipe").onclick = function () {
      if (store.picks[id]) { go("#/list"); return; }
      store.picks[id] = times;
      save();
      toast("נוסף לרשימת הקניות");
      renderRecipe(id);
    };
    if (recipe.notebook) $("openNotebook").onclick = function () { openLightbox(notebook(recipe)); };
  }

  function timesLabel(times) { return times === 1 ? "רגילה" : times < 1 ? "חצי" : "פי " + times; }
  function moreTimes(t) { return t < 1 ? 1 : t + 1; }
  function lessTimes(t) { return t <= 1 ? 0.5 : t - 1; }

  /* Previous/next arrows follow the book order, like turning pages. */
  function turnButton(target, dir) {
    const label = dir === "prev" ? "הקודם" : "הבא";
    /* SVG, not a character: Hebrew layout would otherwise mirror both chevrons inward. */
    const arrow = dir === "prev"
      ? "<svg class=\"arrow\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M9 5l7 7-7 7\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>"
      : "<svg class=\"arrow\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M15 5L8 12l7 7\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>";
    const name = target ? esc(target.name) : "";
    return "<button type=\"button\" class=\"page-turn " + dir + "\" id=\"" + dir + "Recipe\"" +
      (target ? " title=\"" + name + "\" aria-label=\"" + label + ": " + name + "\"" : " disabled aria-label=\"" + label + "\"") + ">" +
      arrow + "<span class=\"turn-label\">" + label + "</span></button>";
  }
  function turnTo(recipeId) {
    window.scrollTo(0, 0);
    go("#/recipe/" + recipeId);
  }

  function setTimes(id, value) {
    if (store.picks[id]) { store.picks[id] = value; save(); }
    else draftTimes = value;
    renderRecipe(id);
  }

  function openLightbox(src) {
    els.lightboxImg.src = src;
    els.lightbox.hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeLightbox() {
    els.lightbox.hidden = true;
    els.lightboxImg.removeAttribute("src");
    document.body.style.overflow = "";
  }

  /* ---------- List ---------- */
  function renderList() {
    const ids = Object.keys(store.picks).filter(byId);
    if (!ids.length) {
      els.picked.innerHTML = "<p class=\"none\">עדיין לא נבחרו מתכונים. בכל מתכון יש כפתור «לרשימה».</p>";
      els.shop.innerHTML = "<p class=\"none\">הרשימה ריקה.</p>";
      return;
    }
    els.picked.innerHTML = ids.map(function (id) {
      const r = byId(id);
      return "<div class=\"chosen\">" +
        "<div class=\"dot\">" + (r.photos.length ? "<img src=\"" + food(r.photos[0]) + "\" alt=\"\">" : r.ai ? "<img src=\"images/" + r.ai + "\" alt=\"\">" : "") + "</div>" +
        "<div><button type=\"button\" data-open=\"" + id + "\"><strong>" + esc(r.name) + "</strong></button>" +
        "<div class=\"controls\"><span class=\"mini\"><button type=\"button\" data-inc=\"" + id + "\" aria-label=\"יותר\">+</button><b>" + timesLabel(store.picks[id]) + "</b><button type=\"button\" data-dec=\"" + id + "\" aria-label=\"פחות\">−</button></span>" +
        "<button type=\"button\" class=\"remove\" data-remove=\"" + id + "\">הסרה</button></div></div>" +
      "</div>";
    }).join("");

    const groups = shopping();
    els.shop.innerHTML = AISLE_ORDER.filter(function (a) { return groups[a]; }).map(function (a) {
      return "<section class=\"aisle\"><h4>" + a + "</h4>" + groups[a].map(function (item) {
        const done = !!store.checks[item.key];
        return "<label class=\"item" + (done ? " done" : "") + "\"><input type=\"checkbox\" data-check=\"" + esc(item.key) + "\"" + (done ? " checked" : "") + ">" +
          "<span><span class=\"label\">" + rich(item.label) + "</span><small>" + esc(item.from.join(" · ")) + "</small></span>" +
          "<button type=\"button\" class=\"item-x\" data-hide=\"" + esc(item.key) + "\" aria-label=\"הסרת " + esc(item.label) + " מהרשימה\" title=\"הסרה מהרשימה\">×</button></label>";
      }).join("") + "</section>";
    }).join("");
    const hiddenCount = shopping.hiddenItems.length;
    if (hiddenCount) {
      els.shop.innerHTML += "<button type=\"button\" class=\"restore\" id=\"restoreItems\">החזרת " + (hiddenCount === 1 ? "פריט אחד שהוסר" : hiddenCount + " פריטים שהוסרו") + "</button>";
    }
    if (!els.shop.querySelector(".aisle")) els.shop.innerHTML = "<p class=\"none\">כל הפריטים הוסרו מהרשימה.</p>" + els.shop.innerHTML;
  }

  function listText() {
    const groups = shopping();
    return "רשימת קניות — המטבח של לילך\n\n" + AISLE_ORDER.filter(function (a) { return groups[a]; }).map(function (a) {
      return a + "\n" + groups[a].map(function (i) { return "• " + i.label; }).join("\n");
    }).join("\n\n");
  }

  /* ---------- Events ---------- */
  $("openBook").onclick = function () { go("#/"); };
  $("homeBtn").onclick = function () { filter = ""; query = ""; els.search.value = ""; go("#/"); };
  $("libraryBtn").onclick = function () { go("#/"); };
  $("listBtn").onclick = function () { go("#/list"); };

  els.search.addEventListener("input", function () {
    query = els.search.value.trim().toLowerCase();
    renderLibrary();
  });

  document.addEventListener("click", function (event) {
    const t = event.target;
    const toggle = t.closest("[data-toggle]");
    if (toggle) {
      const name = toggle.getAttribute("data-toggle");
      openChapters[name] = !openChapters[name];
      renderLibrary();
      return;
    }
    const cat = t.closest("[data-cat]");
    if (cat) { filter = cat.dataset.cat; renderLibrary(); return; }
    const catGo = t.closest("[data-cat-go]");
    if (catGo) { filter = catGo.dataset.catGo; go("#/"); return; }
    const goto = t.closest("[data-go]");
    if (goto) { go(goto.dataset.go); return; }
    const add = t.closest("[data-add]");
    if (add) {
      const id = add.dataset.add;
      if (store.picks[id]) delete store.picks[id];
      else { store.picks[id] = 1; toast("נוסף לרשימת הקניות"); }
      save();
      renderLibrary();
      return;
    }
    const open = t.closest("[data-open]");
    if (open) { go("#/recipe/" + open.dataset.open); return; }
    const photo = t.closest("[data-photo]");
    if (photo) {
      photoIndex = Number(photo.dataset.photo);
      const m = location.hash.match(/^#\/recipe\/([\w-]+)/);
      if (m) renderRecipe(m[1]);
      return;
    }
    const hide = t.closest("[data-hide]");
    if (hide) { event.preventDefault(); store.hidden[hide.dataset.hide] = true; save(); renderList(); return; }
    if (t.closest("#restoreItems")) { store.hidden = {}; save(); renderList(); return; }
    const dec = t.closest("[data-dec]");
    const inc = t.closest("[data-inc]");
    const remove = t.closest("[data-remove]");
    if (dec) store.picks[dec.dataset.dec] = lessTimes(store.picks[dec.dataset.dec]);
    if (inc) store.picks[inc.dataset.inc] = moreTimes(store.picks[inc.dataset.inc]);
    if (remove) delete store.picks[remove.dataset.remove];
    if (dec || inc || remove) { save(); renderList(); }
  });

  els.shop.addEventListener("change", function (event) {
    const box = event.target.closest("[data-check]");
    if (!box) return;
    if (box.checked) store.checks[box.dataset.check] = true;
    else delete store.checks[box.dataset.check];
    save();
    renderList();
  });

  $("clearList").onclick = function () {
    if (!Object.keys(store.picks).length) return;
    if (!confirm("לנקות את כל רשימת הקניות?")) return;
    store.picks = {};
    store.checks = {};
    store.hidden = {};
    save();
    renderList();
  };
  $("copyList").onclick = function () {
    const text = listText();
    if (navigator.share) { navigator.share({ title: "רשימת קניות", text: text }).catch(function () {}); return; }
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { toast("הרשימה הועתקה"); });
  };
  $("printList").onclick = function () { window.print(); };
  $("lightboxClose").onclick = closeLightbox;
  els.lightbox.addEventListener("click", function (event) { if (event.target === els.lightbox) closeLightbox(); });
  document.addEventListener("keydown", function (event) { if (event.key === "Escape" && !els.lightbox.hidden) closeLightbox(); });
  window.addEventListener("hashchange", route);

document.addEventListener("keydown", function (e) {
  if (els.recipe.hidden || (e.target.closest && e.target.closest("input, textarea"))) return;
  const button = document.getElementById(e.key === "ArrowLeft" ? "nextRecipe" : e.key === "ArrowRight" ? "prevRecipe" : "");
  if (button && !button.disabled) { e.preventDefault(); button.click(); }
});

  save();
  route();
})();
