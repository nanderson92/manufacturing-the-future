(function () {
  const db = window.SCI_FI_DB;
  const VALID_VIEWS = new Set(["universes", "technologies", "bottlenecks", "sources"]);

  const state = {
    view: "universes",
    query: "",
    category: "All",
    selectedTech: null,
    sorts: {
      universes: "accuracy-desc",
      technologies: "completion-desc",
      bottlenecks: "severity-desc",
      sources: "date-desc"
    }
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const techById = new Map(db.technologies.map((tech) => [tech.id, tech]));
  const bottleneckById = new Map(db.bottlenecks.map((bottleneck) => [bottleneck.id, bottleneck]));

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

  function yearFromDate(value) {
    return value ? String(value).slice(0, 4) : "n.d.";
  }

  function sourceShortLabel(source) {
    return `${source.title}${source.date ? `, ${yearFromDate(source.date)}` : ""}`;
  }

  function sourceLinks(ids = []) {
    const links = ids
      .map((id) => {
        const source = db.sources[id];
        if (!source) return "";
        return `
          <a class="source-chip" href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer" title="${escapeHtml(source.note)}">
            <strong>${escapeHtml(sourceShortLabel(source))}</strong>
            <span>${escapeHtml(source.type)}</span>
          </a>
        `;
      })
      .filter(Boolean)
      .join("");
    return links ? `<div class="chip-row">${links}</div>` : "";
  }

  function sourceEvidenceList(ids = []) {
    const items = ids
      .map((id) => {
        const source = db.sources[id];
        if (!source) return "";
        return `<li><strong>${escapeHtml(sourceShortLabel(source))}:</strong> ${escapeHtml(source.note)}</li>`;
      })
      .filter(Boolean)
      .join("");
    return items ? `<ol class="detail-list">${items}</ol>` : `<p class="subtle">No linked source note found.</p>`;
  }

  function techChip(id) {
    const tech = techById.get(id);
    const label = tech ? tech.name : id.replace(/([A-Z])/g, " $1");
    const domain = tech ? tech.domain : "Unknown";
    const color = tech ? colorFor(tech) : "#5a616b";
    return `
      <a class="chip chip-link" href="#tech/${escapeHtml(id)}" style="--accent:${escapeHtml(color)}">
        <span style="color:${escapeHtml(color)}">■</span>${escapeHtml(label)}<span class="subtle">${escapeHtml(domain)}</span>
      </a>
    `;
  }

  function searchText(item, kind) {
    if (kind === "tech") {
      const sourceText = (item.sources || [])
        .map((id) => {
          const source = db.sources[id];
          return source ? `${source.title} ${source.type} ${source.note}` : "";
        })
        .join(" ");
      return [
        item.name,
        item.domain,
        item.fiction,
        item.realEquivalent,
        item.plain,
        item.sme,
        (item.blockers || []).join(" "),
        sourceText
      ].join(" ");
    }
    if (kind === "universe") {
      return [
        item.name,
        item.era,
        item.realism,
        item.read,
        item.signature,
        (item.stretches || []).join(" "),
        (item.technologies || []).map((id) => techById.get(id)?.name || id).join(" ")
      ].join(" ");
    }
    if (kind === "bottleneck") {
      return [
        item.name,
        item.domain,
        item.plain,
        item.sme,
        item.evidence,
        (item.unlocks || []).map((id) => techById.get(id)?.name || id).join(" "),
        (item.sources || []).map((id) => db.sources[id]?.title || id).join(" ")
      ].join(" ");
    }
    if (kind === "source") {
      return [item.title, item.type, item.date, item.note, item.url].join(" ");
    }
    return JSON.stringify(item);
  }

  function includesQuery(item, kind) {
    if (!state.query) return true;
    return searchText(item, kind).toLowerCase().includes(state.query.toLowerCase());
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

  function scoreBand(value) {
    if (value < 20) return "Physics gap";
    if (value < 50) return "Prototype territory";
    if (value < 80) return "Fielded cousin";
    return "Current reality";
  }

  function confidenceFor(tech) {
    const sources = tech.sources || [];
    const types = sources.map((id) => db.sources[id]?.type || "").join(" ").toLowerCase();
    const hasPrimary = /(official|nasa|darpa|esa|congressional|army|national lab|clinical)/.test(types);
    const hasPaper = /(paper|review|peer-reviewed|nature|rsc)/.test(types);

    let points = 0;
    if (sources.length >= 3) points += 2;
    else if (sources.length >= 2) points += 1;
    if (hasPrimary) points += 1;
    if (hasPaper) points += 1;
    if (tech.completion >= 70) points += 1;
    if (tech.completion <= 15) points -= 1;

    if (points >= 4) {
      return {
        label: "High source confidence",
        level: "high",
        note: "Multiple strong sources support the closest real-world analogue, though the fictional capability may still be far beyond it."
      };
    }
    if (points >= 2) {
      return {
        label: "Medium source confidence",
        level: "medium",
        note: "The analogue is evidence-linked, but the final score still requires interpretation about scaling and fictional stretch."
      };
    }
    return {
      label: "Low source confidence",
      level: "low",
      note: "Evidence is thin, early-stage, or highly speculative; the number should be read as a rough directional estimate."
    };
  }

  function manufacturingTranslation(tech) {
    const blockers = tech.blockers || [];
    if (!blockers.length) return `<p class="subtle">No blocker list available for this technology.</p>`;
    return `
      <ul class="detail-list">
        ${blockers
          .map((blocker) => `<li><strong>Scale target:</strong> ${escapeHtml(blocker)}</li>`)
          .join("")}
      </ul>
    `;
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
    const sourceCount = Object.keys(db.sources).length;
    $("#statsGrid").innerHTML = [
      [`${db.universes.length}`, "universes benchmarked"],
      [`${db.technologies.length}`, "technology mappings"],
      [`${db.bottlenecks.length}`, "manufacturing bottlenecks"],
      [`${sourceCount}`, "linked evidence sources"]
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
    $("#updatedAt").textContent = db.updatedAt;
    renderHeroRadar([...db.universes].sort((a, b) => b.accuracy - a.accuracy)[0]);
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
        <polygon points="${polygon}" fill="rgba(0,143,136,.30)" stroke="#72fff2" stroke-width="2" filter="url(#softGlow)" />
        <text x="${cx}" y="132" text-anchor="middle" fill="white" font-size="18" font-weight="900">${escapeHtml(topUniverse.name)}</text>
        <text x="${cx}" y="154" text-anchor="middle" fill="rgba(255,255,255,.74)" font-size="12">top universe realism: ${topUniverse.accuracy}%</text>
        <text x="${cx}" y="174" text-anchor="middle" fill="rgba(255,255,255,.52)" font-size="11">domain averages define the polygon</text>
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
        ${extra ? `<div class="view-toolbar">${extra}</div>` : ""}
      </div>
    `;
  }

  function sortControl(options, activeKey) {
    return `
      <label class="sort-wrap">
        <span>Sort</span>
        <select id="sortControl">
          ${options.map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === activeKey ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
        </select>
      </label>
    `;
  }

  function bindSortControl() {
    const control = $("#sortControl");
    if (!control) return;
    control.addEventListener("change", (event) => {
      state.sorts[state.view] = event.target.value;
      render();
    });
  }

  function sortUniverses(universes) {
    const sorted = [...universes];
    switch (state.sorts.universes) {
      case "accuracy-asc":
        return sorted.sort((a, b) => a.accuracy - b.accuracy);
      case "name-asc":
        return sorted.sort((a, b) => a.name.localeCompare(b.name));
      case "accuracy-desc":
      default:
        return sorted.sort((a, b) => b.accuracy - a.accuracy);
    }
  }

  function renderUniverses() {
    const universes = sortUniverses(
      db.universes.filter(inCategoryUniverse).filter((universe) => includesQuery(universe, "universe"))
    );

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
        "Major sci-fi settings ranked by how physically and engineering-accurate their technology stack is against current reality.",
        sortControl(
          [
            { value: "accuracy-desc", label: "Realism high to low" },
            { value: "accuracy-asc", label: "Realism low to high" },
            { value: "name-asc", label: "Name A to Z" }
          ],
          state.sorts.universes
        )
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
    setStatus(`${universes.length} universes shown.`);
    bindSortControl();
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
            ${selected || tech.completion >= 50 ? `<text x="${x + size + 6}" y="${y + 4}" fill="#15171a" font-size="12" font-weight="850">${escapeHtml(shortLabel(tech.name))}</text>` : ""}
            <title>${escapeHtml(tech.name)}: ${tech.completion}% complete</title>
          </g>
        `;
      })
      .join("");

    return `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Technology map by completion and manufacturing difficulty">
        <rect x="0" y="0" width="${width}" height="${height}" rx="22" fill="rgba(255,255,255,.58)" />
        <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#15171a" stroke-opacity=".3" />
        <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="#15171a" stroke-opacity=".3" />
        ${[20, 40, 60, 80]
          .map((tick) => {
            const x = pad + (tick / 100) * (width - pad * 2);
            const y = height - pad - (tick / 100) * (height - pad * 2);
            return `
              <line x1="${x}" y1="${pad}" x2="${x}" y2="${height - pad}" stroke="#15171a" stroke-opacity=".07" />
              <line x1="${pad}" y1="${y}" x2="${width - pad}" y2="${y}" stroke="#15171a" stroke-opacity=".07" />
              <text x="${x}" y="${height - 24}" text-anchor="middle" font-size="11" fill="#5a616b">${tick}%</text>
            `;
          })
          .join("")}
        <text x="${width / 2}" y="${height - 6}" text-anchor="middle" font-size="12" fill="#5a616b" font-weight="850">Completion against fictional capability</text>
        <text x="16" y="${height / 2}" transform="rotate(-90 16 ${height / 2})" text-anchor="middle" font-size="12" fill="#5a616b" font-weight="850">Manufacturing and integration difficulty</text>
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

  function sortTechnologies(techs) {
    const sorted = [...techs];
    switch (state.sorts.technologies) {
      case "completion-asc":
        return sorted.sort((a, b) => a.completion - b.completion);
      case "complexity-desc":
        return sorted.sort((a, b) => b.complexity - a.complexity);
      case "domain-asc":
        return sorted.sort((a, b) => a.domain.localeCompare(b.domain) || b.completion - a.completion);
      case "updated-desc":
        return sorted.sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
      case "completion-desc":
      default:
        return sorted.sort((a, b) => b.completion - a.completion);
    }
  }

  function renderTechnologies() {
    const techs = sortTechnologies(
      db.technologies.filter(inCategoryTech).filter((tech) => includesQuery(tech, "tech"))
    );

    if (!techs.length) return renderEmpty("No technologies match this filter.");

    if (!state.selectedTech || !techs.some((tech) => tech.id === state.selectedTech)) {
      state.selectedTech = techs[0].id;
    }
    const selected = techById.get(state.selectedTech) || techs[0];

    const techCards = techs
      .map((tech) => {
        const confidence = confidenceFor(tech);
        return `
          <article class="tech-card ${tech.id === selected.id ? "is-selected" : ""}" style="--accent:${escapeHtml(colorFor(tech))}">
            <button type="button" data-tech-id="${escapeHtml(tech.id)}" aria-label="Open ${escapeHtml(tech.name)} detail">
              <div class="card-top">
                <div>
                  <p class="eyebrow">${escapeHtml(tech.domain)}</p>
                  <h3 class="card-title">${escapeHtml(tech.name)}</h3>
                </div>
                <span class="chip">${escapeHtml(compactDate(tech.updated))}</span>
              </div>
              <div class="completion-row">
                <span class="completion-donut" style="--percent:${tech.completion};--accent:${escapeHtml(colorFor(tech))}" aria-label="Completion score ${tech.completion} percent">${tech.completion}%</span>
                <div>
                  <div class="meter" aria-label="Completion score ${tech.completion}%"><span style="--value:${tech.completion}%"></span></div>
                  <p class="subtle">${escapeHtml(tech.realEquivalent)}</p>
                </div>
              </div>
              <div class="chip-row" aria-label="Score metadata">
                <span class="band-chip">${escapeHtml(scoreBand(tech.completion))}</span>
                <span class="confidence-chip ${confidence.level}">${escapeHtml(confidence.label)}</span>
              </div>
              <p>${escapeHtml(tech.plain)}</p>
            </button>
          </article>
        `;
      })
      .join("");

    $("#databaseView").innerHTML = `
      ${renderViewHeader(
        "Sci-Fi Tech to R&D Map",
        "Each dot maps a familiar fictional technology to the closest current R&D equivalent, with interpretive completion scores, confidence labels, and manufacturing blockers.",
        sortControl(
          [
            { value: "completion-desc", label: "Completion high to low" },
            { value: "completion-asc", label: "Completion low to high" },
            { value: "complexity-desc", label: "Difficulty high to low" },
            { value: "domain-asc", label: "Domain" },
            { value: "updated-desc", label: "Recently updated" }
          ],
          state.sorts.technologies
        )
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

    setStatus(`${techs.length} technologies shown. Selected technology: ${selected.name}.`);
    bindSortControl();
    bindTechSelection();
  }

  function bindTechSelection() {
    $$(`[data-tech-id]`).forEach((node) => {
      node.addEventListener("click", (event) => {
        event.preventDefault();
        state.selectedTech = node.dataset.techId;
        setHashFromState(true);
        renderTechnologies();
      });
      node.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          state.selectedTech = node.dataset.techId;
          setHashFromState(true);
          renderTechnologies();
        }
      });
    });
  }

  function renderTechDetail(tech) {
    const unlockedBy = db.bottlenecks.filter((bottleneck) => bottleneck.unlocks.includes(tech.id));
    const confidence = confidenceFor(tech);
    return `
      <aside class="detail-panel" style="--accent:${escapeHtml(colorFor(tech))}" aria-label="Selected technology detail">
        <div class="detail-hero">
          <span class="completion-donut" style="--percent:${tech.completion};--accent:${escapeHtml(colorFor(tech))}" aria-label="Completion score ${tech.completion} percent">${tech.completion}%</span>
          <div>
            <span class="kicker">${escapeHtml(tech.domain)} · updated ${escapeHtml(compactDate(tech.updated))}</span>
            <h3>${escapeHtml(tech.name)}</h3>
            <p class="subtle">${escapeHtml(tech.fiction)}</p>
          </div>
        </div>
        <div class="detail-block">
          <div class="score-note-grid">
            <div class="score-note"><span>Score band</span><strong>${escapeHtml(scoreBand(tech.completion))}</strong></div>
            <div class="score-note"><span>Confidence</span><strong>${escapeHtml(confidence.label.replace(" source confidence", ""))}</strong></div>
          </div>
          <p class="subtle" style="margin-top:.55rem">${escapeHtml(confidence.note)}</p>
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
          <h4>Manufacturing Translation</h4>
          ${manufacturingTranslation(tech)}
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
        <div class="detail-block sme-only">
          <h4>How the Evidence Was Used</h4>
          ${sourceEvidenceList(tech.sources)}
        </div>
      </aside>
    `;
  }

  function sortBottlenecks(bottlenecks) {
    const sorted = [...bottlenecks];
    switch (state.sorts.bottlenecks) {
      case "difficulty-desc":
        return sorted.sort((a, b) => b.difficulty - a.difficulty);
      case "unlocks-desc":
        return sorted.sort((a, b) => b.unlocks.length - a.unlocks.length || b.severity - a.severity);
      case "name-asc":
        return sorted.sort((a, b) => a.name.localeCompare(b.name));
      case "severity-desc":
      default:
        return sorted.sort((a, b) => b.severity - a.severity);
    }
  }

  function renderBottlenecks() {
    const bottlenecks = sortBottlenecks(
      db.bottlenecks.filter(inCategoryBottleneck).filter((bottleneck) => includesQuery(bottleneck, "bottleneck"))
    );

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
            title="${escapeHtml(bottleneck.name)}" aria-label="Jump to ${escapeHtml(bottleneck.name)} bottleneck">
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
              <div class="meta-box"><span>Unlock pressure</span><strong>${bottleneck.severity}/100</strong></div>
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
        "The real blockers behind the fictional futures: materials, process control, qualification, energy, reliability, and scale.",
        sortControl(
          [
            { value: "severity-desc", label: "Unlock pressure" },
            { value: "difficulty-desc", label: "Manufacturing difficulty" },
            { value: "unlocks-desc", label: "Most cross-cutting" },
            { value: "name-asc", label: "Name A to Z" }
          ],
          state.sorts.bottlenecks
        )
      )}
      <div class="matrix-wrap">
        <aside class="map-panel bottleneck-matrix" aria-label="Bottleneck severity matrix">
          <h3>Blocker Matrix</h3>
          <p class="subtle">Right means higher unlock pressure. Up means higher manufacturing or integration difficulty.</p>
          <div class="matrix-stage">
            <div class="axis-label axis-y">harder to manufacture</div>
            <div class="axis-label axis-x"><span>lower unlock pressure</span><span>higher unlock pressure</span></div>
            ${matrix}
          </div>
        </aside>
        <div class="bottleneck-list">${cards}</div>
      </div>
    `;

    setStatus(`${bottlenecks.length} bottlenecks shown.`);
    bindSortControl();
    $$(`[data-bottleneck-id]`).forEach((node) => {
      node.addEventListener("click", () => {
        const target = document.getElementById(`bottleneck-${node.dataset.bottleneckId}`);
        target?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
  }

  function sortSources(sources) {
    const sorted = [...sources];
    switch (state.sorts.sources) {
      case "title-asc":
        return sorted.sort(([, a], [, b]) => a.title.localeCompare(b.title));
      case "type-asc":
        return sorted.sort(([, a], [, b]) => a.type.localeCompare(b.type) || a.title.localeCompare(b.title));
      case "date-asc":
        return sorted.sort(([, a], [, b]) => String(a.date).localeCompare(String(b.date)));
      case "date-desc":
      default:
        return sorted.sort(([, a], [, b]) => String(b.date).localeCompare(String(a.date)));
    }
  }

  function renderSources() {
    const sources = sortSources(
      Object.entries(db.sources).filter(([, source]) => includesQuery(source, "source"))
    );

    if (!sources.length) return renderEmpty("No sources match this filter.");

    $("#databaseView").innerHTML = `
      ${renderViewHeader(
        "Evidence and Source Library",
        "The database favors official program pages, peer-reviewed papers, government reports, patents, and named industry analyses. Each source card explains how the evidence informs the atlas.",
        sortControl(
          [
            { value: "date-desc", label: "Newest first" },
            { value: "date-asc", label: "Oldest first" },
            { value: "title-asc", label: "Title A to Z" },
            { value: "type-asc", label: "Source type" }
          ],
          state.sorts.sources
        )
      )}
      <div class="source-grid">
        ${sources
          .map(
            ([id, source]) => `
              <article class="source-card">
                <p class="eyebrow">${escapeHtml(source.type)}</p>
                <h3>${escapeHtml(source.title)}</h3>
                <div class="source-meta">
                  <span class="chip">${escapeHtml(compactDate(source.date))}</span>
                  <span class="chip sme-only">ID: ${escapeHtml(id)}</span>
                </div>
                <p>${escapeHtml(source.note)}</p>
                <a class="source-open" href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">Open source</a>
              </article>
            `
          )
          .join("")}
      </div>
    `;
    setStatus(`${sources.length} sources shown.`);
    bindSortControl();
  }

  function renderEmpty(message) {
    $("#databaseView").innerHTML = `
      ${renderViewHeader("No Matches", "Try a broader search or switch the domain filter back to All.")}
      <div class="empty-state">${escapeHtml(message)}</div>
    `;
    setStatus("No matching results.");
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
        setHashFromState(true);
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
    window.addEventListener("hashchange", () => {
      parseHashToState();
      render();
    });
  }

  function initCategoryFilter() {
    $("#categoryFilter").innerHTML = allCategories()
      .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
      .join("");
  }

  function setStatus(message) {
    const node = $("#resultStatus");
    if (node) node.textContent = message;
  }

  function parseHashToState() {
    const hash = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    if (!hash) return;
    const [viewOrType, id] = hash.split("/");
    if (viewOrType === "tech" && techById.has(id)) {
      state.view = "technologies";
      state.selectedTech = id;
      return;
    }
    if (VALID_VIEWS.has(viewOrType)) {
      state.view = viewOrType;
    }
  }

  function setHashFromState(push = false) {
    const nextHash = state.view === "technologies" && state.selectedTech ? `#tech/${state.selectedTech}` : `#${state.view}`;
    if (window.location.hash === nextHash) return;
    if (push) {
      window.history.pushState(null, "", nextHash);
    } else {
      window.history.replaceState(null, "", nextHash);
    }
  }

  function init() {
    initCategoryFilter();
    renderMethodCards();
    parseHashToState();
    bindEvents();
    render();
  }

  init();
})();
