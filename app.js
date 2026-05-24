(function () {
  const db = window.SCI_FI_DB;
  const state = {
    view: "universes",
    query: "",
    category: "All",
    selectedTech: null
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const techById = new Map(db.technologies.map((tech) => [tech.id, tech]));
  const bottleneckById = new Map(db.bottlenecks.map((bottleneck) => [bottleneck.id, bottleneck]));
  const sourceById = new Map(Object.entries(db.sources));

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function colorFor(item) {
    return item.accent || db.categoryColors[item.domain] || db.categoryColors[item] || "#008f88";
  }

  function pct(value) {
    return `${Math.round(value)}%`;
  }

  function allCategories() {
    return ["All", ...Object.keys(db.categoryColors)];
  }

  function compactDate(value) {
    if (!value) return "Unknown";
    return value.length === 10 ? value : value;
  }

  function sourceLinks(ids = []) {
    const links = ids
      .map((id) => {
        const source = db.sources[id];
        if (!source) return "";
        return `<a class="source-chip" href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.type)}</a>`;
      })
      .filter(Boolean)
      .join("");
    return links ? `<div class="chip-row">${links}</div>` : "";
  }

  function techChip(id) {
    const tech = techById.get(id);
    const label = tech ? tech.name : id.replace(/([A-Z])/g, " $1");
    const domain = tech ? tech.domain : "Unknown";
    const color = tech ? colorFor(tech) : "#5a616b";
    return `<span class="chip" style="--accent:${color}"><span style="color:${color}">■</span>${escapeHtml(label)}<span class="subtle">${escapeHtml(domain)}</span></span>`;
  }

  function includesQuery(item) {
    if (!state.query) return true;
    return JSON.stringify(item).toLowerCase().includes(state.query.toLowerCase());
  }

  function inCategoryTech(tech) {
    return state.category === "All" || tech.domain === state.category;
  }

  function inCategoryUniverse(universe) {
    if (state.category === "All") return true;
    return universe.technologies.some((id) => techById.get(id)?.domain === state.category);
  }

  function inCategoryBottleneck(bottleneck) {
    return state.category === "All" || bottleneck.domain === state.category;
  }

  function renderMethodCards() {
    $("#methodCards").innerHTML = db.methodCards
      .map(
        (card) => `
          <article class="method-tile" style="--accent:${escapeHtml(card.accent)}">
            <h3>${escapeHtml(card.title)}</h3>
            <p>${escapeHtml(card.text)}</p>
          </article>
        `
      )
      .join("");
  }

  function renderStats() {
    const avgCompletion = db.technologies.reduce((sum, tech) => sum + tech.completion, 0) / db.technologies.length;
    const topUniverse = [...db.universes].sort((a, b) => b.accuracy - a.accuracy)[0];
    const hardest = [...db.bottlenecks].sort((a, b) => b.severity - a.severity)[0];
    $("#statsGrid").innerHTML = [
      [`${db.universes.length}`, "major universes scored"],
      [`${db.technologies.length}`, "technology mappings"],
      [pct(avgCompletion), "average real-world completion"],
      [`${hardest.severity}/100`, `highest bottleneck: ${hardest.name}`]
    ]
      .map(
        ([value, label], index) => `
          <div class="stat">
            <strong>${escapeHtml(value)}</strong>
            <span>${escapeHtml(label)}</span>
          </div>
        `
      )
      .join("");
    $("#updatedAt").textContent = db.updatedAt;
    renderHeroRadar(topUniverse);
  }

  function renderHeroRadar(topUniverse) {
    const categories = Object.keys(db.categoryColors);
    const averaged = categories.map((category) => {
      const items = db.technologies.filter((tech) => tech.domain === category);
      const average = items.length ? items.reduce((sum, tech) => sum + tech.completion, 0) / items.length : 0;
      return { category, average };
    });
    const cx = 150;
    const cy = 150;
    const maxR = 112;
    const points = averaged.map((entry, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / averaged.length;
      const r = (entry.average / 100) * maxR;
      return {
        ...entry,
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
        ax: cx + Math.cos(angle) * maxR,
        ay: cy + Math.sin(angle) * maxR
      };
    });
    const polygon = points.map((point) => `${point.x},${point.y}`).join(" ");
    $("#heroRadar").innerHTML = `
      <svg viewBox="0 0 300 300" role="img" aria-label="Average completion radar by technology domain">
        <defs>
          <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle cx="${cx}" cy="${cy}" r="112" fill="none" stroke="rgba(255,255,255,.18)" />
        <circle cx="${cx}" cy="${cy}" r="75" fill="none" stroke="rgba(255,255,255,.12)" />
        <circle cx="${cx}" cy="${cy}" r="38" fill="none" stroke="rgba(255,255,255,.1)" />
        ${points
          .map(
            (point) => `
              <line x1="${cx}" y1="${cy}" x2="${point.ax}" y2="${point.ay}" stroke="rgba(255,255,255,.12)" />
              <circle cx="${point.ax}" cy="${point.ay}" r="3" fill="${escapeHtml(db.categoryColors[point.category])}" />
            `
          )
          .join("")}
        <polygon points="${polygon}" fill="rgba(0,143,136,.28)" stroke="#72fff2" stroke-width="2" filter="url(#softGlow)" />
        <text x="${cx}" y="142" text-anchor="middle" fill="white" font-size="17" font-weight="800">${escapeHtml(topUniverse.name)}</text>
        <text x="${cx}" y="164" text-anchor="middle" fill="rgba(255,255,255,.72)" font-size="12">top realism score: ${topUniverse.accuracy}%</text>
      </svg>
    `;
  }

  function renderViewHeader(title, description, extra = "") {
    return `
      <div class="view-header">
        <div>
          <p class="eyebrow">Database view</p>
          <h2>${escapeHtml(title)}</h2>
          <p>${escapeHtml(description)}</p>
        </div>
        ${extra}
      </div>
    `;
  }

  function renderUniverses() {
    const universes = [...db.universes]
      .filter(inCategoryUniverse)
      .filter(includesQuery)
      .sort((a, b) => b.accuracy - a.accuracy);

    if (!universes.length) return renderEmpty("No universes match this filter.");

    const cards = universes
      .map((universe, index) => {
        const scoreRows = Object.entries(universe.scores)
          .map(
            ([label, value]) => `
              <div class="mini-score">
                <span>${escapeHtml(label)}</span>
                <strong>${value}%</strong>
              </div>
            `
          )
          .join("");
        return `
          <article class="universe-card" style="--accent:${escapeHtml(colorFor(universe))}">
            <div class="card-top">
              <div>
                <p class="eyebrow">${escapeHtml(universe.realism)}</p>
                <h3 class="card-title">${escapeHtml(universe.name)}</h3>
                <p class="subtle">${escapeHtml(universe.era)}</p>
              </div>
              <span class="rank-badge">#${index + 1}</span>
            </div>
            <div class="score-row">
              <strong>${universe.accuracy}%</strong>
              <div class="meter" aria-label="Accuracy ${universe.accuracy}%"><span style="--value:${universe.accuracy}%"></span></div>
            </div>
            <p>${escapeHtml(universe.read)}</p>
            <div>
              <p class="subtle"><strong>Signature:</strong> ${escapeHtml(universe.signature)}</p>
              <div class="chip-row">${universe.technologies.map(techChip).join("")}</div>
            </div>
            <div class="score-breakdown sme-only">${scoreRows}</div>
            <div class="sme-only">
              <p class="subtle"><strong>Reality stretch:</strong> ${escapeHtml(universe.stretches.join("; "))}</p>
            </div>
          </article>
        `;
      })
      .join("");

    const ladder = universes
      .map(
        (universe) => `
          <div class="ladder-row" style="--accent:${escapeHtml(colorFor(universe))}">
            <span class="ladder-label" title="${escapeHtml(universe.name)}">${escapeHtml(universe.name)}</span>
            <strong>${universe.accuracy}</strong>
            <div class="ladder-track"><span style="--value:${universe.accuracy}%"></span></div>
          </div>
        `
      )
      .join("");

    $("#databaseView").innerHTML = `
      ${renderViewHeader(
        "Universe Accuracy Atlas",
        "Major sci-fi settings ranked by how physically and engineering-accurate their technology stack is against current reality."
      )}
      <div class="layout-grid">
        <div class="universe-grid">${cards}</div>
        <aside class="detail-panel accuracy-ladder" aria-label="Universe ranking ladder">
          <h3>Reality Ladder</h3>
          <p class="subtle">Higher means the signature technology relies more on demonstrated physics and nearer-term engineering.</p>
          ${ladder}
        </aside>
      </div>
    `;
  }

  function renderTechMapSvg(techs) {
    const width = 760;
    const height = 460;
    const pad = 58;
    const selectedId = state.selectedTech || techs[0]?.id;
    const nodes = techs
      .map((tech) => {
        const x = pad + (tech.completion / 100) * (width - pad * 2);
        const y = height - pad - (tech.complexity / 100) * (height - pad * 2);
        const selected = tech.id === selectedId;
        const size = selected ? 13 : Math.max(6, Math.min(11, 5 + tech.completion / 13));
        return `
          <g class="tech-point" tabindex="0" role="button" data-tech-id="${escapeHtml(tech.id)}" aria-label="${escapeHtml(tech.name)} ${tech.completion}% complete">
            <circle cx="${x}" cy="${y}" r="${size}" fill="${escapeHtml(colorFor(tech))}" stroke="white" stroke-width="${selected ? 3 : 1.5}" />
            ${selected || tech.completion >= 50 ? `<text x="${x + size + 6}" y="${y + 4}" fill="#15171a" font-size="12" font-weight="800">${escapeHtml(shortLabel(tech.name))}</text>` : ""}
            <title>${escapeHtml(tech.name)}: ${tech.completion}% complete</title>
          </g>
        `;
      })
      .join("");

    return `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Technology map by completion and manufacturing difficulty">
        <rect x="0" y="0" width="${width}" height="${height}" rx="8" fill="rgba(255,255,255,.55)" />
        <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#15171a" stroke-opacity=".3" />
        <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="#15171a" stroke-opacity=".3" />
        ${[20, 40, 60, 80].map((tick) => {
          const x = pad + (tick / 100) * (width - pad * 2);
          const y = height - pad - (tick / 100) * (height - pad * 2);
          return `
            <line x1="${x}" y1="${pad}" x2="${x}" y2="${height - pad}" stroke="#15171a" stroke-opacity=".07" />
            <line x1="${pad}" y1="${y}" x2="${width - pad}" y2="${y}" stroke="#15171a" stroke-opacity=".07" />
            <text x="${x}" y="${height - 24}" text-anchor="middle" font-size="11" fill="#5a616b">${tick}%</text>
          `;
        }).join("")}
        <text x="${width / 2}" y="${height - 6}" text-anchor="middle" font-size="12" fill="#5a616b" font-weight="800">Completion against fictional capability</text>
        <text x="16" y="${height / 2}" transform="rotate(-90 16 ${height / 2})" text-anchor="middle" font-size="12" fill="#5a616b" font-weight="800">Manufacturing and integration difficulty</text>
        <text x="${pad}" y="${pad - 18}" font-size="12" fill="#5a616b">hard to manufacture</text>
        <text x="${width - pad}" y="${height - pad + 34}" text-anchor="end" font-size="12" fill="#5a616b">closer to real</text>
        ${nodes}
      </svg>
    `;
  }

  function shortLabel(name) {
    const words = name.split(" ").filter(Boolean);
    if (words.length <= 2) return name;
    return words.slice(0, 2).join(" ");
  }

  function renderTechnologies() {
    const techs = [...db.technologies]
      .filter(inCategoryTech)
      .filter(includesQuery)
      .sort((a, b) => b.completion - a.completion);

    if (!techs.length) return renderEmpty("No technologies match this filter.");

    if (!state.selectedTech || !techs.some((tech) => tech.id === state.selectedTech)) {
      state.selectedTech = techs[0].id;
    }
    const selected = techById.get(state.selectedTech) || techs[0];

    const techCards = techs
      .map(
        (tech) => `
          <article class="tech-card ${tech.id === selected.id ? "is-selected" : ""}" style="--accent:${escapeHtml(colorFor(tech))}">
            <button type="button" data-tech-id="${escapeHtml(tech.id)}">
              <div class="card-top">
                <div>
                  <p class="eyebrow">${escapeHtml(tech.domain)}</p>
                  <h3 class="card-title">${escapeHtml(tech.name)}</h3>
                </div>
                <span class="chip">${escapeHtml(compactDate(tech.updated))}</span>
              </div>
              <div class="completion-row">
                <span class="completion-donut" style="--percent:${tech.completion};--accent:${escapeHtml(colorFor(tech))}">${tech.completion}%</span>
                <div>
                  <div class="meter"><span style="--value:${tech.completion}%"></span></div>
                  <p class="subtle">${escapeHtml(tech.realEquivalent)}</p>
                </div>
              </div>
              <p>${escapeHtml(tech.plain)}</p>
            </button>
          </article>
        `
      )
      .join("");

    $("#databaseView").innerHTML = `
      ${renderViewHeader(
        "Sci-Fi Tech to R&D Map",
        "Each dot maps a familiar fictional technology to the closest current R&D equivalent, with an interpretive completion score and last-updated date."
      )}
      <div class="tech-layout">
        <div>
          <div class="map-panel">
            ${renderTechMapSvg(techs)}
            <div class="chip-row" aria-label="Domain legend">
              ${Object.entries(db.categoryColors)
                .map(([domain, color]) => `<span class="chip"><span style="color:${color}">■</span>${escapeHtml(domain)}</span>`)
                .join("")}
            </div>
          </div>
          <div class="tech-list">${techCards}</div>
        </div>
        ${renderTechDetail(selected)}
      </div>
    `;

    $$("[data-tech-id]").forEach((node) => {
      node.addEventListener("click", () => {
        state.selectedTech = node.dataset.techId;
        renderTechnologies();
      });
      node.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          state.selectedTech = node.dataset.techId;
          renderTechnologies();
        }
      });
    });
  }

  function renderTechDetail(tech) {
    const unlockedBy = db.bottlenecks.filter((bottleneck) => bottleneck.unlocks.includes(tech.id));
    return `
      <aside class="detail-panel" style="--accent:${escapeHtml(colorFor(tech))}" aria-label="Selected technology detail">
        <div class="detail-hero">
          <span class="completion-donut" style="--percent:${tech.completion};--accent:${escapeHtml(colorFor(tech))}">${tech.completion}%</span>
          <div>
            <span class="kicker">${escapeHtml(tech.domain)} · updated ${escapeHtml(compactDate(tech.updated))}</span>
            <h3>${escapeHtml(tech.name)}</h3>
            <p class="subtle">${escapeHtml(tech.fiction)}</p>
          </div>
        </div>
        <div class="detail-block">
          <h4>Closest R&amp;D Equivalent</h4>
          <p>${escapeHtml(tech.realEquivalent)}</p>
        </div>
        <div class="detail-block">
          <h4>Plain-English Read</h4>
          <p>${escapeHtml(tech.plain)}</p>
        </div>
        <div class="detail-block sme-only">
          <h4>SME Detail</h4>
          <p>${escapeHtml(tech.sme)}</p>
        </div>
        <div class="detail-block">
          <h4>Blocking Problems</h4>
          <div class="chip-row">${tech.blockers.map((blocker) => `<span class="risk-chip">${escapeHtml(blocker)}</span>`).join("")}</div>
        </div>
        ${
          unlockedBy.length
            ? `<div class="detail-block">
                <h4>Related Manufacturing Bottlenecks</h4>
                <div class="chip-row">${unlockedBy.map((b) => `<span class="chip">${escapeHtml(b.name)}</span>`).join("")}</div>
              </div>`
            : ""
        }
        <div class="detail-block">
          <h4>Evidence Links</h4>
          ${sourceLinks(tech.sources)}
        </div>
      </aside>
    `;
  }

  function renderBottlenecks() {
    const bottlenecks = [...db.bottlenecks]
      .filter(inCategoryBottleneck)
      .filter(includesQuery)
      .sort((a, b) => b.severity - a.severity);

    if (!bottlenecks.length) return renderEmpty("No bottlenecks match this filter.");

    const matrix = bottlenecks
      .map((bottleneck) => {
        const label = bottleneck.name
          .split(" ")
          .map((part) => part[0])
          .join("")
          .slice(0, 3)
          .toUpperCase();
        return `
          <button class="matrix-node" type="button" data-bottleneck-id="${escapeHtml(bottleneck.id)}"
            style="--x:${bottleneck.severity};--y:${bottleneck.difficulty};--size:${Math.max(bottleneck.severity, bottleneck.difficulty)};--accent:${escapeHtml(colorFor(bottleneck))}"
            title="${escapeHtml(bottleneck.name)}">
            ${escapeHtml(label)}
          </button>
        `;
      })
      .join("");

    const cards = bottlenecks
      .map(
        (bottleneck) => `
          <article class="bottleneck-card" id="bottleneck-${escapeHtml(bottleneck.id)}" style="--accent:${escapeHtml(colorFor(bottleneck))}">
            <div class="card-top">
              <div>
                <p class="eyebrow">${escapeHtml(bottleneck.domain)}</p>
                <h3 class="card-title">${escapeHtml(bottleneck.name)}</h3>
              </div>
              <span class="chip">Severity ${bottleneck.severity}</span>
            </div>
            <p>${escapeHtml(bottleneck.plain)}</p>
            <div class="bottleneck-meta">
              <div class="meta-box"><span>Severity</span><strong>${bottleneck.severity}/100</strong></div>
              <div class="meta-box"><span>Difficulty</span><strong>${bottleneck.difficulty}/100</strong></div>
              <div class="meta-box"><span>Unlocks</span><strong>${bottleneck.unlocks.length}</strong></div>
            </div>
            <div class="chip-row">${bottleneck.unlocks.map(techChip).join("")}</div>
            <div class="detail-block sme-only">
              <h4>SME Bottleneck</h4>
              <p>${escapeHtml(bottleneck.sme)}</p>
            </div>
            <div class="detail-block">
              <h4>Evidence</h4>
              <p>${escapeHtml(bottleneck.evidence)}</p>
              ${sourceLinks(bottleneck.sources)}
            </div>
          </article>
        `
      )
      .join("");

    $("#databaseView").innerHTML = `
      ${renderViewHeader(
        "Unsolved Manufacturing Problems",
        "The real blockers behind the fictional futures: materials, process control, qualification, energy, reliability, and scale."
      )}
      <div class="matrix-wrap">
        <aside class="map-panel bottleneck-matrix" aria-label="Bottleneck severity matrix">
          <h3>Blocker Matrix</h3>
          <p class="subtle">Right means high unlock value. Up means high manufacturing/integration difficulty.</p>
          <div class="matrix-stage">
            <div class="axis-label axis-y">harder to manufacture</div>
            <div class="axis-label axis-x"><span>lower unlock pressure</span><span>higher unlock pressure</span></div>
            ${matrix}
          </div>
        </aside>
        <div class="bottleneck-list">${cards}</div>
      </div>
    `;

    $$("[data-bottleneck-id]").forEach((node) => {
      node.addEventListener("click", () => {
        const target = $(`#bottleneck-${CSS.escape(node.dataset.bottleneckId)}`);
        target?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
  }

  function renderSources() {
    const query = state.query.toLowerCase();
    const sources = Object.entries(db.sources)
      .filter(([, source]) => !query || JSON.stringify(source).toLowerCase().includes(query))
      .sort(([, a], [, b]) => a.title.localeCompare(b.title));

    if (!sources.length) return renderEmpty("No sources match this filter.");

    $("#databaseView").innerHTML = `
      ${renderViewHeader(
        "Evidence and Source Library",
        "The database favors official program pages, peer-reviewed papers, government reports, patents, and named industry analyses."
      )}
      <div class="source-grid">
        ${sources
          .map(
            ([id, source]) => `
              <article class="source-card">
                <p class="eyebrow">${escapeHtml(source.type)}</p>
                <h3>${escapeHtml(source.title)}</h3>
                <span class="chip">${escapeHtml(compactDate(source.date))}</span>
                <p>${escapeHtml(source.note)}</p>
                <a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">Open source</a>
                <p class="subtle sme-only">ID: ${escapeHtml(id)}</p>
              </article>
            `
          )
          .join("")}
      </div>
    `;
  }

  function renderEmpty(message) {
    $("#databaseView").innerHTML = `
      ${renderViewHeader("No Matches", "Try a broader search or switch the domain filter back to All.")}
      <div class="empty-state">${escapeHtml(message)}</div>
    `;
  }

  function render() {
    $$(".tab").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.view === state.view));
    document.body.classList.toggle("sme-mode", $("#smeToggle").checked);
    renderStats();
    if (state.view === "universes") renderUniverses();
    if (state.view === "technologies") renderTechnologies();
    if (state.view === "bottlenecks") renderBottlenecks();
    if (state.view === "sources") renderSources();
  }

  function bindEvents() {
    $$(".tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        state.view = tab.dataset.view;
        render();
      });
    });
    $("#searchInput").addEventListener("input", (event) => {
      state.query = event.target.value.trim();
      render();
    });
    $("#categoryFilter").addEventListener("change", (event) => {
      state.category = event.target.value;
      render();
    });
    $("#smeToggle").addEventListener("change", render);
  }

  function initCategoryFilter() {
    $("#categoryFilter").innerHTML = allCategories()
      .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
      .join("");
  }

  function init() {
    initCategoryFilter();
    renderMethodCards();
    bindEvents();
    render();
  }

  init();
})();
