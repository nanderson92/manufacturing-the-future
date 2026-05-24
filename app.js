(function () {
  const db = window.SCI_FI_DB;
  const validViews = ["universes", "technologies", "bottlenecks", "sources"];
  const state = {
    view: validViews.includes(window.location.hash.replace("#", "")) ? window.location.hash.replace("#", "") : "universes",
    query: "",
    category: "All",
    sourceKind: "All",
    selectedTech: null
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const techById = new Map(db.technologies.map((tech) => [tech.id, tech]));
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
    return item.accent || db.categoryColors[item.domain] || db.categoryColors[item] || "#50e3d3";
  }

  function pct(value) {
    return `${Math.round(value)}%`;
  }

  function score(value) {
    return Math.round(value);
  }

  function allCategories() {
    return ["All", ...Object.keys(db.categoryColors)];
  }

  function allSourceKinds() {
    return ["All", ...new Set(Object.values(db.sources).map((source) => source.kind || source.type))];
  }

  function compactDate(value) {
    if (!value) return "Unknown";
    return value.length === 10 ? value : value;
  }

  function searchText(value) {
    if (value === null || value === undefined) return "";
    if (Array.isArray(value)) return value.map(searchText).join(" " );
    if (typeof value === "object") return Object.values(value).map(searchText).join(" " );
    return String(value);
  }

  function matchesText(value, query = state.query) {
    if (!query) return true;
    const normalizedQuery = query.toLowerCase();
    return searchText(value).toLowerCase().includes(normalizedQuery);
  }

  function includesQuery(item) {
    return matchesText(item);
  }

  function universeSearchPayload(universe) {
    const techs = universe.technologies.map((id) => techById.get(id)).filter(Boolean);
    const sourceIds = new Set(techs.flatMap((tech) => tech.sources || []));
    const sources = [...sourceIds].map((id) => sourceById.get(id)).filter(Boolean);
    return { universe, techs, sources };
  }

  function techSearchPayload(tech) {
    const sources = (tech.sources || []).map((id) => sourceById.get(id)).filter(Boolean);
    const relatedBottlenecks = db.bottlenecks.filter((bottleneck) => bottleneck.unlocks.includes(tech.id));
    return { tech, sources, relatedBottlenecks };
  }

  function bottleneckSearchPayload(bottleneck) {
    const unlockedTechs = (bottleneck.unlocks || []).map((id) => techById.get(id)).filter(Boolean);
    const sources = (bottleneck.sources || []).map((id) => sourceById.get(id)).filter(Boolean);
    return { bottleneck, unlockedTechs, sources };
  }

  function sourceSearchPayload(id, source) {
    return { id, source, usedBy: technologyUsersForSource(id) };
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

  function technologyUsersForSource(sourceId) {
    return db.technologies.filter((tech) => tech.sources?.includes(sourceId));
  }

  function sourceLinks(ids = []) {
    const links = ids
      .map((id) => {
        const source = sourceById.get(id);
        if (!source) return "";
        return `<a class="source-chip" href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">
          <span class="source-kind">${escapeHtml(source.kind || source.type)}</span>
          ${escapeHtml(source.title)}
        </a>`;
      })
      .filter(Boolean)
      .join("");
    return links ? `<div class="chip-row source-row">${links}</div>` : "";
  }

  function techChip(id) {
    const tech = techById.get(id);
    const label = tech ? tech.name : id.replace(/([A-Z])/g, " $1");
    const domain = tech ? tech.domain : "Unknown";
    const color = tech ? colorFor(tech) : "#aaa99f";
    return `<span class="chip" style="--accent:${color}"><span style="color:${color}" aria-hidden="true">■</span>${escapeHtml(label)}<span class="subtle">${escapeHtml(domain)}</span></span>`;
  }

  function confidenceClass(confidence) {
    return `confidence-${String(confidence || "medium").toLowerCase()}`;
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

    const weights = $("#scoreWeights");
    if (weights) {
      weights.innerHTML = db.scoringDimensions
        .map(
          (dimension) => `
            <article class="weight-card">
              <div class="weight-top"><strong>${escapeHtml(dimension.label)}</strong><span>${dimension.weight}%</span></div>
              <p>${escapeHtml(dimension.text)}</p>
            </article>
          `
        )
        .join("");
    }
  }

  function renderStats() {
    const avgScore = db.technologies.reduce((sum, tech) => sum + tech.completion, 0) / db.technologies.length;
    const topUniverse = [...db.universes].sort((a, b) => b.accuracy - a.accuracy)[0];
    const closest = [...db.technologies].sort((a, b) => b.completion - a.completion)[0];
    const hardest = [...db.bottlenecks].sort((a, b) => b.severity - a.severity)[0];
    const updatedAt = $("#updatedAt");
    if (updatedAt) updatedAt.textContent = db.updatedAt;

    $("#statsGrid").innerHTML = [
      [`${db.universes.length}`, "fictional universes"],
      [`${db.technologies.length}`, "technology analogues"],
      [`${score(avgScore)}`, "average Reality Score"],
      [`${hardest.severity}/100`, `hardest blocker: ${hardest.name}`]
    ]
      .map(
        ([value, label]) => `
          <div class="stat">
            <strong>${escapeHtml(value)}</strong>
            <span>${escapeHtml(label)}</span>
          </div>
        `
      )
      .join("");

    const contrast = $("#heroContrast");
    if (contrast) {
      const furthest = [...db.technologies].sort((a, b) => a.completion - b.completion)[0];
      contrast.innerHTML = `
        <div class="contrast-card near">
          <span>Closest to reality</span>
          <strong>${escapeHtml(closest.name)}</strong>
          <p>${score(closest.completion)} Reality Score</p>
        </div>
        <div class="contrast-card far">
          <span>Still mostly fiction</span>
          <strong>${escapeHtml(furthest.name)}</strong>
          <p>${score(furthest.completion)} Reality Score</p>
        </div>
      `;
    }
    renderHeroRadar(topUniverse);
  }

  function renderHeroRadar(topUniverse) {
    const poweredArmor = techById.get("exoskeletonArmor");
    const lightsaber = techById.get("lightsaber");
    const replicator = techById.get("replicator");
    const examples = [poweredArmor, lightsaber, replicator].filter(Boolean);
    $("#heroRadar").innerHTML = `
      <div class="hero-feature-card">
        <p class="eyebrow">Start example</p>
        <h3>Could Iron Man armor exist?</h3>
        <p>
          The closest real analogue is not one object; it is exoskeleton robotics, compact actuation, armor materials, sensing, and thermal management trying to close at the same time.
        </p>
        <div class="feature-score-row" style="--accent:${escapeHtml(colorFor(poweredArmor || topUniverse))}">
          <strong>${poweredArmor ? poweredArmor.completion : topUniverse.accuracy}</strong>
          <div>
            <span>Reality Score</span>
            <div class="meter"><span style="--value:${poweredArmor ? poweredArmor.completion : topUniverse.accuracy}%"></span></div>
          </div>
        </div>
        <dl class="feature-dl">
          <div><dt>Closest analogue</dt><dd>${escapeHtml(poweredArmor?.realEquivalent || "Fielded cousin systems")}</dd></div>
          <div><dt>What breaks first</dt><dd>Compact energy, heat rejection, actuator reliability, and manufacturable protective structures.</dd></div>
          <div><dt>Manufacturing question</dt><dd>Can the millionth unit survive real duty cycles, inspection, maintenance, and qualification?</dd></div>
        </dl>
      </div>
      <div class="hero-mini-examples" aria-label="Example Reality Score entries">
        ${examples.map((tech) => `
          <article style="--accent:${escapeHtml(colorFor(tech))}">
            <span>${escapeHtml(tech.domain)}</span>
            <strong>${escapeHtml(tech.name)}</strong>
            <p>${tech.completion}/100 · ${escapeHtml(tech.confidence)} confidence</p>
          </article>
        `).join("")}
      </div>
    `;
  }

  function renderViewHeader(title, description, extra = "") {
    return `
      <div class="view-header">
        <div>
          <p class="eyebrow">Atlas view</p>
          <h2>${escapeHtml(title)}</h2>
          <p>${escapeHtml(description)}</p>
        </div>
        ${extra}
      </div>
    `;
  }

  function resultCount(count, label) {
    return `<div id="resultCount" class="result-count" aria-live="polite"><strong>${count}</strong> ${escapeHtml(label)} shown</div>`;
  }

  function renderUniverses() {
    const universes = [...db.universes]
      .filter(inCategoryUniverse)
      .filter((universe) => matchesText(universeSearchPayload(universe)))
      .sort((a, b) => b.accuracy - a.accuracy);

    if (!universes.length) return renderEmpty("No universes match this filter.");

    const cards = universes
      .map((universe, index) => {
        const scoreRows = Object.entries(universe.scores)
          .map(
            ([label, value]) => `
              <div class="mini-score">
                <span>${escapeHtml(label)}</span>
                <strong>${value}</strong>
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
              <strong>${universe.accuracy}</strong>
              <div>
                <div class="meter" aria-label="Universe realism score ${universe.accuracy}"><span style="--value:${universe.accuracy}%"></span></div>
                <p class="score-caption">Reality Score</p>
              </div>
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
        "Which fictional futures are closest?",
        "A ranking of fictional settings by engineering closure: demonstrated physics, fielded cousins, manufacturability, and the amount of cinematic stretch still required.",
        resultCount(universes.length, "universes")
      )}
      <div class="layout-grid">
        <div class="universe-grid">${cards}</div>
        <aside class="detail-panel accuracy-ladder" aria-label="Universe ranking ladder">
          <h3>Reality Ladder</h3>
          <p class="subtle">Higher means the setting depends more on demonstrated physics, fielded cousins, and manufacturable systems.</p>
          ${ladder}
        </aside>
      </div>
    `;
  }

  function shortLabel(name) {
    if (name.startsWith("Ion /")) return "Ion propulsion";
    if (name.startsWith("Warp /")) return "Warp drive";
    if (name.startsWith("Plasma blades")) return "Lightsabers";
    const cleaned = name.replace(/\s*\/\s*/g, " ");
    const words = cleaned.split(" ").filter(Boolean);
    if (words.length <= 2) return cleaned;
    return words.slice(0, 2).join(" ");
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
          <g class="tech-point" tabindex="0" role="button" data-tech-id="${escapeHtml(tech.id)}" aria-label="${escapeHtml(tech.name)} Reality Score ${tech.completion}">
            <circle cx="${x}" cy="${y}" r="${size}" fill="${escapeHtml(colorFor(tech))}" stroke="white" stroke-width="${selected ? 3 : 1.5}" />
            ${selected ? `<text x="${x + size + 8}" y="${y + 4}" fill="#fff4d8" font-size="12" font-weight="900">${escapeHtml(shortLabel(tech.name))}</text>` : ""}
            <title>${escapeHtml(tech.name)}: Reality Score ${tech.completion}</title>
          </g>
        `;
      })
      .join("");

    return `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Technology map by Reality Score and manufacturing difficulty">
        <rect x="0" y="0" width="${width}" height="${height}" rx="16" fill="rgba(12,16,24,.68)" />
        <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="rgba(238,232,214,.25)" />
        <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="rgba(238,232,214,.25)" />
        ${[20, 40, 60, 80].map((tick) => {
          const x = pad + (tick / 100) * (width - pad * 2);
          const y = height - pad - (tick / 100) * (height - pad * 2);
          return `
            <line x1="${x}" y1="${pad}" x2="${x}" y2="${height - pad}" stroke="rgba(238,232,214,.085)" />
            <line x1="${pad}" y1="${y}" x2="${width - pad}" y2="${y}" stroke="rgba(238,232,214,.085)" />
            <text x="${x}" y="${height - 24}" text-anchor="middle" font-size="11" fill="rgba(238,232,214,.66)">${tick}</text>
          `;
        }).join("")}
        <text x="${width / 2}" y="${height - 6}" text-anchor="middle" font-size="12" fill="rgba(238,232,214,.66)" font-weight="800">How much exists today?</text>
        <text x="16" y="${height / 2}" transform="rotate(-90 16 ${height / 2})" text-anchor="middle" font-size="12" fill="rgba(238,232,214,.66)" font-weight="800">How hard is it to build/deploy?</text>
        <text x="${pad}" y="${pad - 18}" font-size="12" fill="rgba(238,232,214,.66)">hard to build/deploy</text>
        <text x="${width - pad}" y="${height - pad + 34}" text-anchor="end" font-size="12" fill="rgba(238,232,214,.66)">closer to fielded reality</text>
        <text x="${pad + 18}" y="${height - pad - 18}" font-size="12" fill="rgba(238,232,214,.46)">missing core function</text>
        <text x="${width - pad - 18}" y="${pad + 20}" text-anchor="end" font-size="12" fill="rgba(238,232,214,.46)">real but hard to scale</text>
        ${nodes}
      </svg>
    `;
  }

  function renderTechnologies() {
    const techs = [...db.technologies]
      .filter(inCategoryTech)
      .filter((tech) => matchesText(techSearchPayload(tech)))
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
            <button type="button" data-tech-id="${escapeHtml(tech.id)}" aria-pressed="${tech.id === selected.id}">
              <div class="card-top">
                <div>
                  <p class="eyebrow">${escapeHtml(tech.domain)}</p>
                  <h3 class="card-title">${escapeHtml(tech.name)}</h3>
                </div>
                <span class="confidence-badge ${confidenceClass(tech.confidence)}">${escapeHtml(tech.confidence)}</span>
              </div>
              <div class="completion-row">
                <span class="completion-donut" style="--percent:${tech.completion};--accent:${escapeHtml(colorFor(tech))}">${tech.completion}</span>
                <div>
                  <div class="meter"><span style="--value:${tech.completion}%"></span></div>
                  <p class="score-caption">Reality Score</p>
                </div>
              </div>
              <dl class="card-dl">
                <div><dt>Closest analogue</dt><dd>${escapeHtml(tech.realEquivalent)}</dd></div>
                <div><dt>Main blockers</dt><dd>${escapeHtml(tech.blockers.slice(0, 2).join("; "))}</dd></div>
              </dl>
              <p>${escapeHtml(tech.plain)}</p>
            </button>
          </article>
        `
      )
      .join("");

    $("#databaseView").innerHTML = `
      ${renderViewHeader(
        "Technology map",
        "Each dot asks the same question: how much of the fictional function exists today, and how hard would it be to build, qualify, and deploy at scale?",
        resultCount(techs.length, "technologies")
      )}
      <div class="tech-layout">
        <div>
          <div class="map-panel">
            ${renderTechMapSvg(techs)}
            <p class="chart-note">Takeaway: upper-right technologies are closest to real but hardest to scale; lower-left technologies still lack core physics, function, or energy closure. Select a dot or card to inspect the evidence.</p>
            <div class="chip-row" aria-label="Domain legend">
              ${Object.entries(db.categoryColors)
                .map(([domain, color]) => `<span class="chip"><span style="color:${color}" aria-hidden="true">■</span>${escapeHtml(domain)}</span>`)
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
          <span class="completion-donut" style="--percent:${tech.completion};--accent:${escapeHtml(colorFor(tech))}">${tech.completion}</span>
          <div>
            <span class="kicker">${escapeHtml(tech.domain)} · ${escapeHtml(tech.confidence)} confidence · updated ${escapeHtml(compactDate(tech.updated))}</span>
            <h3>${escapeHtml(tech.name)}</h3>
            <p class="subtle">Reality Score ${tech.completion}/100 · ${escapeHtml(tech.confidence)} confidence</p>
          </div>
        </div>
        <div class="detail-block">
          <h4>Fictional Capability</h4>
          <p>${escapeHtml(tech.fiction)}</p>
        </div>
        <div class="detail-block">
          <h4>Closest Real Analogue</h4>
          <p>${escapeHtml(tech.realEquivalent)}</p>
        </div>
        <div class="detail-block highlight-block">
          <h4>Why this score</h4>
          <p>${escapeHtml(tech.scoreRationale)}</p>
        </div>
        <div class="detail-block">
          <h4>Plain-English Read</h4>
          <p>${escapeHtml(tech.plain)}</p>
        </div>
        <div class="detail-block sme-only">
          <h4>Expert Detail</h4>
          <p>${escapeHtml(tech.sme)}</p>
        </div>
        <div class="detail-block">
          <h4>Blocking Problems</h4>
          <div class="chip-row">${tech.blockers.map((blocker) => `<span class="risk-chip">${escapeHtml(blocker)}</span>`).join("")}</div>
        </div>
        ${
          unlockedBy.length
            ? `<div class="detail-block">
                <h4>Related What blocks deployment?</h4>
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

    const severityValues = bottlenecks.map((bottleneck) => bottleneck.severity);
    const difficultyValues = bottlenecks.map((bottleneck) => bottleneck.difficulty);
    const minSeverity = Math.min(...severityValues);
    const maxSeverity = Math.max(...severityValues);
    const minDifficulty = Math.min(...difficultyValues);
    const maxDifficulty = Math.max(...difficultyValues);
    const scaleToPlot = (value, min, max) => {
      if (max === min) return 50;
      return 10 + ((value - min) / (max - min)) * 80;
    };
    const matrix = bottlenecks
      .map((bottleneck, index) => {
        const displayIndex = index + 1;
        return `
          <button class="matrix-node" type="button" data-bottleneck-id="${escapeHtml(bottleneck.id)}"
            style="--x:${scaleToPlot(bottleneck.severity, minSeverity, maxSeverity)};--y:${scaleToPlot(bottleneck.difficulty, minDifficulty, maxDifficulty)};--size:${Math.max(bottleneck.severity, bottleneck.difficulty)};--accent:${escapeHtml(colorFor(bottleneck))}"
            title="${escapeHtml(displayIndex + '. ' + bottleneck.name)}" aria-label="${escapeHtml(bottleneck.name)} severity ${bottleneck.severity}, difficulty ${bottleneck.difficulty}">
            ${displayIndex}
          </button>
        `;
      })
      .join("");

    const matrixLegend = bottlenecks
      .map(
        (bottleneck, index) => `<button type="button" class="matrix-legend-item" data-bottleneck-id="${escapeHtml(bottleneck.id)}"><strong>${index + 1}</strong><span>${escapeHtml(bottleneck.name)}</span></button>`
      )
      .join("");

    const cards = bottlenecks
      .map(
        (bottleneck) => `
          <article class="bottleneck-card" id="bottleneck-${escapeHtml(bottleneck.id)}" style="--accent:${escapeHtml(colorFor(bottleneck))}">
            <div class="card-top">
              <div>
                <p class="eyebrow">${escapeHtml(bottleneck.domain)} · ${escapeHtml(bottleneck.type)}</p>
                <h3 class="card-title">${escapeHtml(bottleneck.name)}</h3>
              </div>
              <span class="chip danger-chip">Severity ${bottleneck.severity}</span>
            </div>
            <p>${escapeHtml(bottleneck.plain)}</p>
            <div class="bottleneck-meta">
              <div class="meta-box"><span>Severity</span><strong>${bottleneck.severity}/100</strong></div>
              <div class="meta-box"><span>Difficulty</span><strong>${bottleneck.difficulty}/100</strong></div>
              <div class="meta-box"><span>Unlocks</span><strong>${bottleneck.unlocks.length}</strong></div>
            </div>
            <div class="chip-row">${bottleneck.unlocks.map(techChip).join("")}</div>
            <div class="detail-block sme-only">
              <h4>Expert Bottleneck</h4>
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
        "What blocks deployment?",
        "The bottleneck is usually not the first demonstration. It is the millionth reliable unit: heat rejection, power density, materials lifetime, inspection, qualification, autonomy, supply chain, and scale.",
        resultCount(bottlenecks.length, "bottlenecks")
      )}
      <div class="matrix-wrap">
        <aside class="map-panel bottleneck-matrix" aria-label="Bottleneck severity matrix">
          <h3>Blocker Matrix</h3>
          <p class="subtle">Right means more technologies unlock if the blocker improves. Up means harder manufacturing, qualification, or integration.</p>
          <div class="matrix-stage">
            <div class="axis-label axis-y">harder to manufacture</div>
            <div class="axis-label axis-x"><span>lower unlock pressure</span><span>higher unlock pressure</span></div>
            ${matrix}
          </div>
          <div class="matrix-legend" aria-label="Blocker matrix legend">${matrixLegend}</div>
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

  function renderSourceFilters() {
    return `
      <div class="source-filter" aria-label="Evidence type filter">
        ${allSourceKinds()
          .map(
            (kind) => `<button class="pill-button ${state.sourceKind === kind ? "is-active" : ""}" type="button" data-source-kind="${escapeHtml(kind)}" aria-pressed="${state.sourceKind === kind}">${escapeHtml(kind)}</button>`
          )
          .join("")}
      </div>
    `;
  }

  function renderSources() {
    const query = state.query.toLowerCase();
    const sources = Object.entries(db.sources)
      .filter(([, source]) => state.sourceKind === "All" || source.kind === state.sourceKind)
      .filter(([id, source]) => !query || matchesText(sourceSearchPayload(id, source)))
      .sort(([, a], [, b]) => (a.kind || a.type).localeCompare(b.kind || b.type) || a.title.localeCompare(b.title));

    if (!sources.length) return renderEmpty("No evidence sources match this filter.");

    $("#databaseView").innerHTML = `
      ${renderViewHeader(
        "Sources & confidence",
        "The evidence layer behind the atlas, separated by source type so official programs, peer-reviewed work, patents, industry reports, and speculative concepts are not treated as equal proof.",
        resultCount(sources.length, "sources")
      )}
      ${renderSourceFilters()}
      <div class="source-grid">
        ${sources
          .map(([id, source]) => {
            const usedBy = technologyUsersForSource(id).slice(0, 5);
            return `
              <article class="source-card">
                <div class="card-top">
                  <p class="eyebrow">${escapeHtml(source.kind || source.type)}</p>
                  <span class="source-tier">${escapeHtml(source.tier || "Reference")}</span>
                </div>
                <h3>${escapeHtml(source.title)}</h3>
                <span class="chip">${escapeHtml(compactDate(source.date))}</span>
                <p><strong>Why it matters:</strong> ${escapeHtml(source.note)}</p>
                ${usedBy.length ? `<div class="used-by"><strong>Used by</strong><div class="chip-row">${usedBy.map((tech) => `<span class="chip">${escapeHtml(tech.name)}</span>`).join("")}</div></div>` : ""}
                <a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">Open source</a>
                <p class="subtle sme-only">ID: ${escapeHtml(id)} · ${escapeHtml(source.type)}</p>
              </article>
            `;
          })
          .join("")}
      </div>
    `;

    $$('[data-source-kind]').forEach((button) => {
      button.addEventListener("click", () => {
        state.sourceKind = button.dataset.sourceKind;
        renderSources();
      });
    });
  }

  function renderEmpty(message) {
    $("#databaseView").innerHTML = `
      ${renderViewHeader("No Matches", "Try a broader search, switch the domain filter back to All, or clear the evidence-type filter.")}
      <div class="empty-state">${escapeHtml(message)}</div>
    `;
  }

  function render() {
    $$(".tab").forEach((tab) => {
      const active = tab.dataset.view === state.view;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-pressed", String(active));
    });
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
        if (window.location.hash.replace("#", "") !== state.view) {
          window.history.replaceState(null, "", `#${state.view}`);
        }
        render();
        $("#databaseView")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    window.addEventListener("hashchange", () => {
      const view = window.location.hash.replace("#", "");
      if (validViews.includes(view)) {
        state.view = view;
        render();
      }
    });
    const syncSearchInputs = (value) => {
      [$("#searchInput"), $("#navSearchInput")].filter(Boolean).forEach((input) => {
        if (input.value !== value) input.value = value;
      });
    };
    [$("#searchInput"), $("#navSearchInput")].filter(Boolean).forEach((input) => {
      input.addEventListener("input", (event) => {
        state.query = event.target.value.trim();
        syncSearchInputs(event.target.value);
        render();
      });
    });
    $$('[data-query]').forEach((button) => {
      button.addEventListener('click', () => {
        state.query = button.dataset.query || '';
        syncSearchInputs(state.query);
        render();
        $("#databaseView")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
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
