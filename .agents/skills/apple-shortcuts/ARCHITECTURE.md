# ShortcutForge — Core Architecture

> **Status:** canonical design/theory/plan for the rebuild (2026-08-18). Supersedes the
> Balanced Sashimi framing in `research/docs/BALANCED_SASHIMI_*.md` as the *production*
> architecture; that research program is retained only as the scientific study of the
> coordinate-placement network (see §8). The theoretical foundation — ShortcutForge as a fourth
> σ / Specification-Complexity instantiation (alongside Wayfinder, LintGate, GSE) — is §11.
>
> **One line:** ShortcutForge generates Apple Shortcuts by **navigation, not prediction** —
> the corpus of real shortcuts *is* a data-geometry, the generator walks it deterministically,
> and a small model does exactly one job: place the starting coordinate.

---

## 1. Thesis

Generating a `.shortcut` is not next-token prediction over DSL text. It is **navigation of a
structured semantic geometry** whose nodes are the 615 catalog actions and whose edges are the
real relationships between them (data-flow, co-occurrence, type-compatibility, substitution).

- The neural model runs **once** per request, to place a coordinate (which action families to
  bias, which domain, which structural template). Everything after that is **deterministic
  arithmetic** over the geometry.
- **"Structure is recognized, not predicted."** Control-flow (linear / branch / loop / menu /
  api-chain) is template classification, not token generation.
- The existing compiler stack (linter → LALR parser → 615-action validator → 7-pass static
  analyzer → plist compiler → signer) is the **ground-truth verifier** — the typechecker of the
  domain. A shortcut compiles-and-signs or it deterministically does not, with a categorized reason.

This is the synthesis of three of the operator's working systems, ported to the `.shortcut` domain.

---

## 2. Provenance — three systems, one stack

| Source system | What it contributes | Read/verified |
|---|---|---|
| **Wayfinder** (`~/Projects/Wayfinder`) | the **navigation theory** — one coordinate-placement pass → deterministic multiplicative scoring + spreading activation. Lean-proof search at 1,277/2,000 raw. | `proof_network.navigate/_score_candidates`, `proof_spreading.spread`, `build_proof_network_db.*` read directly |
| **Peitho** (`/Volumes/VenusSteps/Peitho`) | the **storage / geometry substrate** — virtual, derive-don't-propagate, multi-lens deviation banks. Better than Wayfinder's materialized SQL for data this small and this multi-lens. | `DATA_GEOMETRY_DESIGN.md`, `DATA_ARCHITECTURE.md`, `geometry.deviation` read directly |
| **Detective / Mutation Theory** (`~/tools/Detective`, `~/tools/Wesker`) | **pins the deterministic core** — the geometry's edge network *is* the symbolic operator map a `.shortcut` Detective mutates over. | Detective 0.12.1 installed; regime + first pin live |

Plus the **coordinate-placement model**: Qwen-3.5-4B today (local, via `OllamaBackend`), with the
end-goal of **Apple's own on-device model** in the loop (§9).

**Division of labor (the whole stack):**

```
Peitho substrate  ─── the STORE   (virtual, multi-lens deviation geometry, derived from the corpus)
Wayfinder search  ─── the SEARCH  (place one coordinate → deterministic scoring + spreading activation)
Detective pins    ─── the PROOF   (the deterministic core cannot change behavior without a test going red)
small model       ─── the PLACER  (one pass: intent → starting coordinate; eventually Apple on-device)
compiler stack    ─── the ORACLE  (parse/validate/compile/sign = ground truth)
```

---

## 3. The data geometry (Peitho substrate)

The geometry is **not a database**. It is a set of pure functions of an immutable corpus. Peitho's
governing law — *derive, don't propagate* — is adopted verbatim: staleness has nowhere to live.

| Layer | What it is (ShortcutForge) | Mutability |
|---|---|---|
| **0 — raw mirror** | two static, execution-free sources: the **usage** source — the **1,772 `.shortcut` files** (+ decompiled IR) and `action_catalog.json`; and the **architecture** source — the OS's own action defs: App Intents `extract.actionsdata` (JSON) + WorkflowKit `Actions.intentdefinition` (plist). Immutable. The only sources of truth. | IMMUTABLE |
| **1 — clean** | `corpus_geometry` sweep of each shortcut → action sequence + UUID/magic-variable **data-flow wiring** (usage); `action_architecture` mine → each action as a **typed operator** (param schema, value types, output, description). `f(raw)`, virtual. | derived |
| **2 — semantic views** | one **wide, raw-preserving** view per action: name tokens · type signature (`input`/`result`) · param vocab · co-occurrence neighbors · structural roles · domain. `f(clean)`, virtual. | derived |
| **3 — node network** | the **banks** (below), zero-states, signed deviations, and the typed edge set. `f(views)`, virtual. | derived |

**Raw is sacred, wider is better, multi-lens.** Normalizing an action into one canonical shape
destroys deconvolution: an action's identity lives across several inconsistent lenses (its name
says one thing, its type signature another, its corpus context a third — cf. Peitho's
`section`/`subsection` two-lens finding). We keep it wide and deconvolve, never flatten.

### 3.1 Banks (deviation geometry)

Each bank is an orthogonal semantic dimension with a **zero-state = corpus mean** and entities
encoded as **signed deviations** from it (`geometry.deviation`), ternary {−1, 0, +1} / OTP, with
**asymmetric emission** — in-domain neutral = 0, only real signal earns ±1 (deliberate sparsity).

1. **SEMANTIC** — what the action does (name/description token anchors, IDF-weighted).
2. **TYPE-FLOW** — `input`/`result` signatures; the reachability dimension.
3. **PARAMETER** — per-action param vocabulary (`observed_params` / `param_observed_values`).
4. **STRUCTURAL** — control-flow role (linear / branch / loop / menu / api-chain) = the template layer.
5. **DOMAIN** — the 8 scenario domains (health, api, file, media, …).

**Composition** (Wayfinder's scoring, Peitho's fusion): candidate score is multiplicative across
lenses — `final = bank × anchor × seed × observability` (read from `_score_candidates`), i.e. a
Kuramoto-style fusion of bank estimates. Reachability is **spreading activation** (decaying
priority-BFS, `new_act = act · weight · decay`) over the typed edges.

### 3.2 Edges (the corpus IS the geometry)

Built by the same deterministic sweep Wayfinder uses (`_build_*_links`), over shortcuts instead of
proofs. Each shortcut is Wayfinder's `accessible_premises` row:

| Edge | Construction |
|---|---|
| `co_used_with` | actions co-occurring in the same shortcut, weight `min(0.75 + 0.05·(cnt−2), 0.95)` — **Wayfinder's exact formula** |
| `depends_on` | action B consumes action A's output — **read off the `.shortcut` UUID/magic-variable wiring, not inferred** |
| `substitutes_for` | nearest neighbor in TYPE-FLOW + PARAMETER space |
| `same_domain` | shared scenario domain |

**The keystone:** a symbolic sweep of the 1,772 shortcuts yields the whole geometry in one pass —
each shortcut is a *transaction* touching every network at once (action-semantic × type-flow ×
parameter × domain), and that shared substrate is the learning signal (Peitho §9, Society-of-Mind).
Crucially, `.shortcut` plists **encode data-flow explicitly** via UUID references, so `depends_on`
is *labeled ground truth* here — a higher-fidelity geometry than the proof domain, which must infer it.

---

## 4. The schema question, resolved

There is no hand-authored "typed skeleton" schema as the primary object. Per Peitho's *two layers,
not flat JSON*:

- The **node-network geometry (Layer 3) is the store** — wide, raw-preserving, where navigation happens.
- The **DSL / any JSON schema is a crystallized read-out** — a projection of a *navigation path*
  through the geometry, derived, never primary. Deterministic lowering emits it.

So the earlier plan to build an Ollama `format=schema` "typed skeleton" was the wrong altitude and is
dropped as the generator. Constrained decoding survives only as an optional guard on the coordinate
pass and/or the Tier-3 free-value tail.

---

## 5. Generation loop (end to end)

```
prompt
  │
  ▼  [PLACER] small model, ONE pass → StructuredQuery
     (domain bank target, preferred action-family anchors, structural template class)
  │
  ▼  [SEARCH] navigate(): multiplicative bank×anchor×seed×observability scoring over Layer-3 candidates
  │           spread(): decaying activation over co_used_with / depends_on edges → reachable frontier
  │
  ▼  [ASSEMBLE] template classification picks the control structure; type-flow edges order the actions;
  │             params filled from PARAMETER bank (enumerable) or Tier-3 value fill (free)
  │
  ▼  [LOWER] deterministic projection → canonical ShortcutDSL text (crystallized read-out)
  │
  ▼  [ORACLE] existing pipeline: lint → parse → validate → simulate → compile → sign → .shortcut
```

Only the first box is neural, and it runs once. Every other box is deterministic and Detective-pinnable.

### 5.1 The cognate-routing loop (production path)

The routing granularity is the **whole shortcut, not the individual action** (the corrected
architecture). A prompt's GSE intent routes to the nearest cognate SHORTCUTS in the corpus, and their
action DAGs are the scaffold — Wayfinder's holographic "fit a chunk to the whole" at the shortcut level.

```
prompt → GSE intent → SoM cognate-router ranks corpus shortcuts by fit
       → iterate top-N in fit order: decompile each cognate .shortcut → DSL → FILL values → compile-test
       → persist the top-c compiling candidates as .shortcut + .dsl  (the manual-fallback layer)
```

- **`src/router.py` (`CognateRouter`)** — the SoM router (~960 params) over GSE-intent similarity + data
  geometry. Top-1 cognate F1 **0.532** (was 0.437; 0.349 for GSE-cosine alone). The last jump came from
  a MINED channel, not model capacity: `action_sem_sim` = cosine(prompt, the shortcut's ACTION NAMES,
  e.g. "Log Health Sample") — a donor-independent "what it does" signal that the donor-worded
  descriptions lack. Lifting routing is a corpus-mining problem (richer mined channels + coverage), not a
  model-size one — the signal-quality ceiling. See [[project-som-routing-creative-division]].
- **`src/fill.py`** — the retrieved skeleton is right but its VALUES are the donor's; fill adapts them to
  the prompt. Deterministic SPINE (identify slots by exact DSL value-form, derive the title and any
  prompt-supplied URL, substitute through the DSL's own escaper — Wesker-style typed-slot safety); the
  small model touches ONLY natural-language free text (its Tier-3 role). Measured: value-relevance to the
  prompt **0.126 → 0.890** while strict-compile stays 10/10. This is the step that turns retrieval into
  generation — where the small model finally lives, at the tail, not the spine.
- **`src/structural.py`** — STRUCTURAL values (quantity units, enum tokens), a faithful port of Detective's
  Zone contract (`tools/Detective` §6). Each slot's option space is the set of values that (action, param)
  takes across the corpus — usually tiny (the health-log quantity unit is a 3-way pick `{mg, fl_oz_us,
  dBASPL}`). **Zone-1** (0/1 option) auto-fills; **Zone-2** (a small set) the small model PICKS from,
  **clamped to the corpus set so it cannot emit an off-corpus value**, remembered per (action, param) in
  `.shortcutforge/structural_inputs.json` (a `samples.py` port), `--resolve` overrides; **Zone-3** (open/
  non-scalar) keeps the donor. This is what fixes `dBASPL`-for-water: guessing a structural slot is the
  bug, so the slot is never guessed — it is a constrained choice from the corpus (water→`fl_oz_us`,
  weight→`mg`, from the same 3 options). The median enum slot has ONE corpus value → auto-filled.
  **The unknowables workflow (Detective's §6 residual, ported):** a slot too open to auto-pick
  (Zone-3) surfaces in `GenerationResult.structural_residual` as a `--resolve "action::param=value"`
  hint; the CLI `--resolve` supplies it (overrides the pick, remembered). **Magnitude:** an explicit
  prompt number ("log 500 ml") fills placeholder QTY amounts by regex; the SEMANTIC amount ("a lot",
  "daily") is a confirmed-computable GSE readout (there is a dedicated `SemanticBank.QUANTITY`) — the
  next build, projecting the prompt vector onto that bank and mapping onto the corpus magnitude scale.
- **`src/generate_loop.py`** — ranking-by-fit is not one-and-done: the loop fills then tests the top-N
  candidates and saves the top-c that compile, so an agent or a human picks one and tweaks it into place.
- **The two constants are computed, not guessed** (`training/calibrate_budget.py` →
  `configs/generation_budget.json`): **N** = smallest top-k that statistically hits a target compile rate
  (default 0.95, the promotion gate); **c** = where fallback quality saturates (95% of achievable
  intent-match). Empirically N=1 and c=7: a candidate IS a real decompiled corpus shortcut and both
  round-trip AND escaped fills round-trip losslessly (200/200; 10/10 post-fill), so the compile budget
  stays 1 — **N>1 is a real, wired safety net for a fill that breaks compilation, just rarely triggered
  because substitution is escaped and typed.** Fill's payoff is quality (value-relevance), not compile rate.
- **Production entry (`Orchestrator.generate(engine="cognate")`, CLI `--engine cognate`)** — the cognate
  engine is wired into the same `Orchestrator` as the LLM engine: it routes + fills, then reuses the exact
  parse → validate → simulate → compile → deliver pipeline (identical signing/delivery). It is genuinely
  NOT an LLM backend (no system prompt, snippets, budget, or parse-retry), so it is a dedicated branch, not
  a `GeneratorBackend`. `--no-fill` keeps the deterministic spine only (offline, no model); the default
  uses the fill model (`--fill-model`, Qwen 3.5 4B) and degrades to donor values if it is unreachable.

---

## 6. Detective-for-`.shortcut` (falls out for free)

The Layer-3 typed edge network **is** the "hierarchical network of operator-style functions in the
`.shortcut` DSL universe" needed for a `.shortcut` analogue of Detective: Wesker's Python mutation
operators are replaced by mutations over the shortcut operator geometry (swap an action for a
type-compatible neighbor, drop a `depends_on` edge, reorder within a structural template). Uroboros
(`~/tools/Uroboros`) = automated Detective over that. This raises the bar from **"it compiles"** (the
current 85%) to **"it provably does what the prompt asked."** Same geometry serves generation and pinning.

---

## 7. Why this beats the status quo (and the SQL variant)

- **Kills the hallucinated-action failure class structurally** (8 of the current 15pts of strict-compile
  failure): navigation can only visit real catalog nodes; there is nothing to hallucinate.
- **Auditable**: every action chosen traces to an edge/score, not a sampled guess.
- **Cheap & local**: one small-model pass; the rest is arithmetic — no GPU for the search.
- **No staleness**: geometry is `f(corpus)`, virtual; a new shortcut just re-derives.
- **Beats Wayfinder's materialized SQLite here** because `.shortcut` data is small and inherently
  multi-lens — Peitho's wide, raw-preserving, derive-don't-propagate store preserves the deconvolution
  a normalized `(source,target,relation,weight)` table would flatten.

---

## 8. What happens to Balanced Sashimi / PAB

- The **continuous-encoder → bottleneck → ternary decoder** is exactly the **PLACER** (coordinate
  placement). It is no longer the whole generator — it emits the `StructuredQuery`, matching Wayfinder's
  role for the network. The research question (purpose-built placer vs. stock small model) stays open and
  scientific, not load-bearing for shipping.
- **PAB / Process-Aware Benchmarking** remains the evaluation methodology for *training the placer*.
- The **σ / specification-complexity** spine (composition-gap theorem, `σ(A∘B) ≤ σ(A)+σ(B)+γ`) is the
  decomposition license shared by Wayfinder, Detective, and the Semantic Specification Learning papers.

---

## 9. End goal — the ouroboros

The PLACER's one call is model-agnostic. The target is **Apple's own on-device model** (Foundation
Models framework, MacOS 27 / Apple Intelligence) as the coordinate placer — and because Apple
Intelligence model calls are themselves invocable **from a shortcut**, a generated shortcut can call the
same class of small model that generated it. Shortcuts that use an Apple-Intelligence action are
**testable today** on the operator's MacOS 27 + Apple-Intelligence iPhone. A true ouroboros of small-model AI.

---

## 10. Build plan (phased)

1. **Corpus sweep → Layer 0/1.** Symbolic analysis of the 1,772 shortcuts → per-shortcut action sequence
   + UUID data-flow wiring. (Reuse decompiler `src/plist_to_dsl.py`; the catalog already carries
   `input`/`result`/`observed_params`.)
2. **Layer 2/3 geometry.** Build the wide per-action views + the banks (zero-states from corpus means) +
   the typed edge set (`co_used_with`, `depends_on`, `substitutes_for`). Port Peitho's `geometry.deviation`
   and Wayfinder's `navigate`/`spread`. Detective-pin every pure function from the first.
3. **PLACER interface.** Define `StructuredQuery` (domain target, family anchors, template class); wire the
   `OllamaBackend` (already live) to emit it. Keep the compiler stack unchanged downstream.
4. **Assemble + lower.** Template classification + type-flow ordering + deterministic lowering → DSL.
5. **Eval** against the frozen 100-example set; target hallucinated-action failures → ~0; compare to BL-1.
6. **Detective-for-`.shortcut` / Uroboros** over the same edge geometry.

The theoretical cement for all of the above is **§11**.

---

## 11. The theoretical cement — ShortcutForge as a σ instrument

The architecture above is not merely an elegant synthesis of three systems. It is a **fourth
instantiation of a Lean-proved complexity-theoretic homology.**

Rohan's **Specification Complexity** (`~/resume/Specification_Complexity_Paper/`, ~10k lines Lean 4)
defines **σ(P, μ)** — the minimum tests to fully specify a program under a mutation policy — proves it is
a **Blum complexity measure**, and identifies it across **five fields** (teaching dimension = query
complexity = identity testing = local testability = SpecP), with the **composition-gap theorem** and
**symmetry ⇒ regime**. The **Semantic Specification Learning** paper
(`~/Projects/rohan-vinaik.github.io/papers/Core Documents/Semantic_Specification_Learning/`) carries σ
into conceptual space (**σ_sem** = min constraints to drive conceptual entropy to zero) and names three
field/artifact instantiations: **Wayfinder** (proof-solving), **LintGate** (specification), **GSE**
(communicative meaning). **ShortcutForge is the fourth** — shortcut synthesis as the closed *artifact*
inside the open *field* of task automation.

### 11.1 The homology, one more noun-translation

| σ (Specification Complexity) | σ_sem (understanding) | σ_shortcut (this project) |
|---|---|---|
| program identity | a text's meaning | the intended shortcut |
| surviving mutant (behavioral DOF) | a candidate reading | a candidate action / sequence consistent with the prompt |
| a test that kills a mutant | a meta-narrative constraint | a navigation constraint (data-flow edge, type-compat, domain, template) |
| σ = min tests to SC=1 | σ_sem = min constraints to zero conceptual entropy | σ_shortcut = min constraints to resolve *the* shortcut |
| regime = symmetry (T6.15) | plural readings = lawful symmetry-breakings | multiple valid shortcuts for one intent (lawful plurality) |
| composition gap γ→0 (independent) | orthogonal sub-frames sum (H3) | orthogonal banks → additive σ |

### 11.2 What each theorem buys the architecture

- **Composition gap** `σ(A∘B) ≤ σ(A)+σ(B)+γ`, γ→0 for independent components — the **license** for the
  decomposition. Orthogonal banks = specification-independent components = **additive**, not multiplicative,
  σ. The stack is provably no harder to specify than the sum of its parts. This is a theorem, not a hope.
- **Symmetry ⇒ regime** (large `G_μ` → polynomial σ / Regime A; small → exponential / Regime B) — *"structure
  is recognized, not predicted"* is literally **injecting symmetry**. The typed geometry + template
  classification engineer a large symmetry group → polynomial σ → the domain is specifiable and navigable.
  This is *why* generation-by-navigation is tractable where token-prediction is not.
- **Closed artifact in an open field** — Apple Shortcuts is the sharp case: bounded lexicon (615 actions),
  fixed formal grammar (LALR), deterministic verifier. σ_shortcut is **well-posed and finite**; "have you
  solved shortcut generation?" becomes the measurable tuple `(H₀, L, I_solve, Completeness(t))`, not rhetoric.

### 11.3 Generate wide / resolve narrow

The generation loop (§5) **is** the σ-trajectory. The geometry enumerates the candidate neighborhood
`N(prompt)` (generate wide — banks surface candidate actions); deterministic navigation resolves narrow
(each constraint — a data-flow edge, a type-compat, a domain, a template — peels off rivals, driving
conceptual entropy to zero). The **PLACER's single coordinate is the meta-narrative controller** setting
sub-frame priors. The **compiler is the abstention** — it returns *does-not-compile* (not-entailed) where
nothing follows and **never fabricates**.

### 11.4 The corpus IS the structural amplification

SSL's Semantic Completeness Equation `dH/dt = −(N + C(H))`: teaching N facts, each propagating through
structure to resolve `C(H)` *unstated* readings (the hub-score / PageRank of the network). Measured on NLP:
**L ≈ 0.53** — half the domain resolves *for free* from structure, with a bulk→tail phase transition at
~3% of the curriculum. For ShortcutForge, the **1,772-shortcut corpus committed to the geometry is that
amplification**: most shortcuts fall to the structural majority (co-usage + type-flow); only the residual
needs the model. This is the leverage the whole design bets on — and it is measurable, not asserted.

### 11.5 Surprise, negative learning, and where the model lives

Surprise = the residual where the constraint set fails to predict = the **linter's repair taxonomy + the
compile failures**. This is the negative-learning signal (Winston near-miss; Genesis withdraw-on-*does-not*),
exactly what **PAB** tracks and what the **PLACER** trains on. The model does not carry the intelligence; it
consumes the residual σ the geometry cannot resolve.

### 11.6 The falsifiability guard (a real design law)

The PLACER sets action-family priors but is **FORBIDDEN from collapsing the plural valid shortcuts to one**:
require **σ_shortcut > 0** (more than one lawful shortcut survives the priors). A model that maps every intent
to a single memorized template has EIG = 0 — Quixote charging windmills. Lawful plurality (many valid ways to
build a shortcut) is regime-multiplicity, not error, and the controller must not suppress it.

### 11.7 Why this is "AI, not ML" — now formal

Classical symbolic AI is a *complete* algebra of concept-learning-as-constrained-search, long *starved* of a
grounding substrate. ShortcutForge is that stance instantiated: the intelligence is the **deterministic,
auditable, abstaining geometry + navigation**; the small model is "the fuel line — telling it what to look
at," the low-σ coordinate placer (eventually Apple's on-device model, §9). The compiler's abstention
(compiles-or-not, never fabricate) is what makes "complete" *honest*. This is the formal ground for skipping
the ML stack: **exact identification is the geometry's job; only the irreducible residual is the model's.**

### 11.8 Proved vs. asserted (honesty, inherited from SSL §9.1)

The σ theory (Blum axioms, five-field identification, composition gap, symmetry⇒regime) is **Lean-checked**.
The homology to shortcuts is **asserted** — the noun-translation is argued to preserve the theorems, not
re-proved in the shortcut domain. The empirical claims — σ_shortcut is well-posed, L is high, the phase
transition appears — are **measurable on our corpus**, and that measurement is the first validation to run
(it rides on the same corpus sweep as Phase 1, §10).
