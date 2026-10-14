# Bonzai — Design Document

Status: living document, pre-production. Last updated 2026-10-13.
Owner: repository owner. Drafted with Claude from design conversations; every decision below was agreed in conversation unless marked **Proposal** or **Open**.

Conventions in this document:
- **Decided**: agreed; change only deliberately and log it in §15.
- **Proposal**: Claude's suggestion, not yet confirmed.
- **Open**: unresolved question; listed again in §16.
- **TBD value**: a number to be tuned in playtesting; the value given is a starting point.

---

## 1. Vision

A turn-based mobile game about tending a magical bonsai that refuses to stay small. It climbs, endlessly, up through a sunken labyrinth of ancient ruins (a blend of Atlantean, Angkor and Maya architecture). You play a hand of gardening actions (water, prune, wire, tether, rooting powder and more) to steer its growth around obstacles and toward the little light that reaches into the ruins. A run ends when the tree grows itself into a corner and can no longer grow.

The feeling: calm, beautiful, strategic, never rushed, yet with pressure that builds as you climb, like an arcade game played at your own pace.

Tone: the fantasy is played straight. It is obviously magical (a bonsai growing up through a vertical ruin), but treated sincerely, without winking.

### Design pillars

1. **Beautiful first.** Lush, colourful, softly lit 3D. A screenshot from any run should look worth keeping.
2. **Strategy without a clock.** Turn-based, no timer. Pressure comes from the situation, not from time.
3. **Planning ahead, as in Tetris.** You do not choose your pieces, only where and how to play them. Bad placements compound later.
4. **Real plant logic.** Rules are drawn from real botany (apical dominance, phototropism, back-budding, sagging under weight) so players can predict outcomes.
5. **One more run.** Arcade structure: endless height, rising difficulty, permanent unlocks, a gallery of past trees.

### Audience and scope

- **Decided:** a personal project first, polished enough to share with close friends.
- **Decided:** optimised for playing on a phone in the browser, portrait orientation, one hand where possible.

---

## 2. Platform and technology

| Topic | Decision |
|---|---|
| Platform | **Decided:** mobile web browser first; desktop browser must also work. |
| Rendering | **Decided:** real 3D with three.js (WebGL). 2D, 2.5D canvas and ink-wash were tried and rejected (§15). |
| Code | **Proposal:** plain ES modules, no build step for as long as possible; three.js loaded from a pinned CDN version (currently 0.160.0). |
| Hosting | **Decided:** GitHub Pages from the public repo `leftoverjacksons/bonzai`. A claude.ai artifact copy is used for quick phone tests. |
| Saving | **Decided:** progress is kept when the page is closed and reopened (§12). |
| Performance target | **Proposal:** 60 fps on a recent mid-range phone, 30 fps minimum on older phones; a quality setting lowers leaf count, shadow resolution and glow. |

---

## 3. Core loop

1. **The tree grows by itself.** **Decided (2026-10-13, revised 2026-10-14).** Every turn the whole tree takes one growth flush (§4.9). Left alone, that growth causes problems: leggy shoots, crowded foliage that shades itself, starved lower branches, shoots that run into stone. The player's work keeps it healthy and climbing.
2. **A hand of three cards, all forced** (§5). **Decided (2026-10-14, revised same day):** you draw three cards and must play all three, in any order you choose; the tree grows after each card, so order matters. A hand is **never three of the same card**. When the hand is empty, a new one is drawn. (Replaces the single forced card with a visible queue.)
3. You must play the card; you choose only **where**. Cards are real bonsai work: **Cut, Pinch, Wire** (§5). There is **no direct redirect tool** and **no Lantern** (decided 2026-10-14). The game should feel like a **puzzle**.
4. **The whole tree then grows, animated.** **Decided:** every turn shows the entire plant growing according to its conditions (light, space, obstacles). There is **no auto-run**: the player always advances turns by hand.
5. The world clock advances (§8), the hand refills, and the camera follows the growth (§7).
6. Repeat until the tree **stagnates** (§4.6).

- **Decided:** no timer. Turns wait for the player.
- **Decided:** a **hold** slot (keep one card for later) is unlocked much later in progression, not available at the start.

---

## 4. The tree

### 4.1 Structure

The tree is a graph of **segments** (pieces of trunk or branch) joined at **nodes**. Each branch ends in a **tip**. Tips grow; segments thicken over time.

### 4.2 Vigor

Each tip has **vigor**, a growth budget. One step of growth uses vigor. Vigor comes from the roots and is split among tips.

### 4.3 Rules from real plant biology

| Real effect | Game rule | Status |
|---|---|---|
| **Apical dominance:** the top tip suppresses buds below it | The highest tip receives the largest share of vigor; lower tips grow slowly unless helped. | Proposal |
| **Pruning releases the buds below** | Cutting a branch converts its removed length into vigor, shared among the remaining tips in proportion. | Decided (from original idea) |
| **Phototropism:** growth bends toward light | Tips bend toward the brightest light opening nearby. Light reaching a tip increases its vigor. | Proposal |
| **Back-budding** | Rooting powder makes a new bud on old wood. | Decided (from original idea) |
| **Sagging under weight** | Long, heavy, unsupported side branches droop over turns. Tethering to the ruins holds them up. | Decided |

### 4.7 Growth model

**Decided (2026-10-13):** growth uses a **space colonization** model (Runions, Lane and Prusinkiewicz, 2007), adapted to light:
- **Light points** are scattered through the open space of the ruins. Their density follows how much sky each spot can see, so sunlit courtyards are full of them, dark chambers have few, and openings (windows, holes in ceilings) pull growth toward them.
- Each growth step, every light point within reach attracts its nearest part of the tree. Each attracted part grows a short segment toward the average direction of its light points, with a slight upward bias and a tendency to keep its heading.
- A light point is consumed when the tree reaches it.
- Where light comes from several directions, the tree branches. In shade there are no light points, so branches stop and buds stay dormant. Obstacles block growth; branches route around them toward light.
- Branch thickness follows the pipe model: a branch is as thick as the branches it carries combined, so the trunk thickens as the crown grows.
- The tree is continuous (no cell grid); the world keeps an internal map for collisions and light.

**Pacing:** **Open.** The first goal is how growth looks; the speed of growth is tuned later.

### 4.9 Growth model v2: bonsai rules (decided 2026-10-14; supersedes the free growth of §4.7)

Feedback on v1: the tree was dense and aggressive and could grow its way around anything, so the game played itself. v2 makes unmanaged growth the problem and real bonsai work the solution.

- **Start as an established bonsai.** Every run begins with a mature small tree: thick, flared, aged trunk about 1 m tall, three or four main branches, foliage pads at their ends. The magic is that it keeps climbing.
- **Growth only from buds.** Shoots extend from their tips. Every new segment carries a dormant bud pointing off to one side (alternate, spiral arrangement). Old wood does not sprout on its own; dormant buds wake when the player pinches or cuts nearby, and occasionally on their own along a strong shoot.
- **Energy from lit foliage.** Each shoot's foliage pad produces energy according to how much sky it sees and how crowded it is by pads just above it (self-shading). Energy pays for extension.
- **Apical dominance.** The highest shoots get the largest share of energy. Unmanaged, the top runs long and the lower branches starve.
- **Shoots keep their heading.** They bend gently upward and toward light. **Revised (2026-10-14) after playtest** (a tree trapped under a ceiling whose only gap was in a corner was more aggravating than fun):
  - **Wider light sensing:** each shoot senses brighter space within about a metre and bends gradually toward it, not only toward open sky directly at its tip.
  - **Sliding along stone:** a shoot that meets stone creeps along the surface toward the brighter side at reduced speed instead of stopping dead. It only loses health if it stays fully blocked for more than two turns.
  - Both are deliberately subtle; poor choices can still trap a shoot.
- **Health per shoot.** Shoots lose health when blocked by stone, shaded, starved, or leggy; they recover when fed and lit. At zero health a shoot dies back: its last segments become dead wood (silver-grey) and its foliage drops.
- **Legginess, sagging and snapping.** A long run of shoot with no side branches sags downward; a very long one snaps off. Wiring to a ring prevents both.
- **Night.** Foliage produces almost no energy at night, so growth nearly stops; damage from stone and sagging still applies.
- **Neglect hurts a fair amount** (decided): a few poor turns lose shoots and foliage, and a badly kept tree can collapse. Recoverable with good cuts, but not free.

### 4.9b Tree appearance (decided 2026-10-14 after playtest)

The tree looked disconnected and "shape-shifting". Rules for how it is drawn:
- **Stable shapes:** a branch keeps its identity and path from the moment it grows; thickness only increases, gradually. A turn changes only the new growth.
- **Grown-in joints:** branches emerge from the parent's surface with a slight collar, so the wood reads as one solid piece.
- **Bark at a constant scale** on trunk and twigs alike; mid-size branches are rounder.
- **Cut ends show pale wood**, so past cuts stay visible on the tree.

### 4.10 Species (decided 2026-10-14: one at a time)

Each species is a set of growth settings plus its own character. Build one, make it fun, then add others.

| Species | Character | Status |
|---|---|---|
| **Temple fig (Ficus)** | Vigorous and fast, so poor care shows quickly; buds readily behind cuts, so pruning is productive; glossy leaves; fits the ruins (strangler figs grip Angkor's Ta Prohm). Later: aerial roots. | **First, in progress** |
| Juniper | Slow, dense scale-foliage pads; branches that die stay as silvery deadwood (jin and shari), which can be a feature. | Later |
| Pine | Grows in yearly bursts ("candles") that must be pinched or it gets leggy; strong apical dominance. | Later |
| Japanese maple | Paired (opposite) buds, so cuts split neatly in two; leaves change colour with the seasons. | Later |
| Others (azalea, wisteria, olive, ...) | Flowering or fruiting variants with their own quirks. | Ideas |

### 4.4 Stalled tips

A tip that hits an obstacle **stalls**. A stalled tip still draws vigor but does not grow, so it is a cost the player must remove by pruning, re-budding around it, or wiring it in a new direction. **Decided** (from the original idea that branches "get stuck, so you re-branch").

### 4.5 Sagging and tethers

- **Decided:** branches sag under their own length and foliage weight unless supported.
- **Decided:** wiring means tying a branch to something in the ruins (an iron ring, a statue's hand, a chain, a lintel, a carved knob). The tethered branch is held up and grows toward the anchor. The tree behaves partly like a vine climbing the ruins (the original "vining bonsai, Jack and the Beanstalk" idea; real model: strangler figs on Angkor's Ta Prohm).
- **Proposal:** a sagging branch can droop into an obstacle and stall, so neglecting support has consequences.
- Whole-tree balance and toppling were considered and dropped in favour of sagging and tethers (§15).

### 4.6 Ending a run: stagnation

- **Decided:** the run ends when no tip can grow any more (all stalled, dead or blocked), i.e. you grew into a corner.
- **Decided:** the game **warns** before this happens (for example "last growing tip", shown clearly on the tree and in the HUD).
- **Decided:** no rising "shade line" or other time pressure; pressure comes from the labyrinth and difficulty, not a chasing threat.
- **Open:** whether a run also offers one rescue (for example a single emergency card per run).

---

## 5. Actions (cards)

**Decided (2026-10-14), current rules:** one forced card per turn from a queue; the next three are visible. You must play it; you choose where. Real bonsai work only:

| Card | Target | Effect |
|---|---|---|
| **Pinch** | a shoot tip | Stops that shoot. Up to two dormant buds just behind it wake as short new shoots, so the foliage pad gets denser and more compact, and energy goes elsewhere. |
| **Cut** | any point on a branch | Removes everything beyond that point. The nearest dormant bud just behind the cut wakes and grows in its own direction. Lost foliage means less energy, but the remaining shoots get a larger share. |
| **Wire** | a shoot tip, then an iron ring within reach | The shoot grows toward the ring and does not sag; once it arrives it is tied and continues upward. |
| **Rooting powder** | a dormant bud on old wood | That bud wakes as a new shoot in its own direction. Direct influence without a redirect tool (added 2026-10-14). |

- Deck mix (working values): Cut and Pinch most of the time, Wire and Rooting powder occasionally. A hand of three is never all the same card. If a card has no valid target it may be discarded.
- **Removed:** Lantern (decided 2026-10-14), any direct redirect tool (decided 2026-10-14).
- Water, Rooting powder and the forced/negative cards below remain ideas for later.

Earlier list (v0 ideas, kept for reference):

### Helpful

| Card | Target | Effect | Status |
|---|---|---|---|
| Water | branch | Boosts vigor of that branch (may spread to neighbours). | Decided (original) |
| Rooting powder | node on old wood | Sprouts a new bud / branch. | Decided (original) |
| Prune | segment | Cuts there; removed growth becomes vigor for the rest (§4.3). | Decided (original) |
| Tether (wire) | tip + anchor | Ties the branch to a ruin anchor; it grows toward it and stops sagging. | Decided |
| Fertilizer | whole tree | Strong boost to all tips; **Proposal:** also increases difficulty or sag for a few turns. | Proposal |
| Pinch | tip | Stops a tip; thickens its parent (stronger, sags less). | Proposal |
| Graft | two nearby branches | Joins them, merging vigor. | Proposal |
| Lantern / light | empty space | Creates light that attracts nearby tips for a few turns. | Proposal |

### Forced or negative

| Card | Effect | Status |
|---|---|---|
| Shears (mandatory cut) | You must cut somewhere this turn. | Proposal |
| Pests | Placed on a branch, they drain it each turn until cleared. | Proposal |
| Wind gust | Pushes all tips one way; tethers resist it. | Proposal |
| Rockfall | A block drops into the shaft, creating a new obstacle. | Proposal |

- **Decided:** new actions ("powers") are **unlocked** at height thresholds and are available from the next run onward (§9).
- **Open:** whether cards are drawn uniformly or weighted by situation (for example more pruning when many tips are stalled).

---

## 6. World: the ruin labyrinth

### 6.1 Setting

- **Decided:** the tree grows *inside* the ruins, not in an open courtyard. Think of a vertical labyrinth or shaft: walls, galleries, arches, beams and fallen blocks all around, with **limited light** entering through gaps, windows and broken roofs.
- **Decided (2026-10-13), structure "C":** not a single silo. The climb **alternates** between **open, sunlit spaces** (terraces, courtyards, colonnades, bridges, overhangs) and **enclosed chambers** the tree must grow through (galleries with windows, towers, ceilings with holes). The rhythm is: claustrophobic and dim, then breaking into light.
- **Decided:** the ruins must not be too dark to enjoy. Shaded areas are rendered readable (bounced light, warmer stone, sky visible); what is dark *for the rules* is shown clearly without making the screen murky.
- **Decided:** more obstacles than prototype v0, and they are real architecture (slabs, beams, columns, statues, chains, fallen blocks), not cubes.
- **Decided:** the ruins have an ancient, ruinous feel and are a **blend of Atlantis, Angkor and Maya** (§10.3).
- **Decided:** the world is effectively **unlimited in height** (§9).

### 6.2 What the ruins do in play

| Element | Role | Status |
|---|---|---|
| Walls, beams, overhangs, collapsed floors | Obstacles; tips that hit them stall. | Decided |
| Anchors (rings, statue hands, chains, carved knobs) | Tether points. **Decided (2026-10-14): rings are attached to the ruins in sensible places**: on the inner faces of walls, around columns, and hanging from beams and the undersides of slabs. | Decided |
| Light openings (windows, cracks, broken roofs) | Light sources; tips bend toward them and gain vigor. | Proposal |
| Light that moves with the time of day | Shafts of sunlight sweep across the shaft as hours pass, so where light falls depends on the turn. | Proposal |
| Ruin features that close off routes as you climb | Main source of rising difficulty (§9). | Proposal |

### 6.3 Generation

- **Decided:** the ruins are generated procedurally from the run's seed as a vertical stack of **modules** (for example courtyard, chamber, terrace, tower), alternating open and enclosed. Module templates are hand-designed to stay fair (there is always at least one route upward, for instance a hole in every ceiling), then varied and dressed by the run's culture blend.
- **Decided:** strata (difficulty bands) are predefined at fixed height intervals (§9).

---

## 7. Camera and controls

- **Decided:** the camera is close to the tree (much closer than early studies). It **follows growth automatically**, so the base drops out of view as you climb.
- **Decided (2026-10-13): branch travel.** Tap a branch to put the camera on it; swipe up and down to travel along that branch toward its tips or back toward the trunk; tap another branch to jump to it. A button returns to following the growth.
- **Proposal:** outside branch travel, a vertical swipe scrolls the view up and down the tree; horizontal drag walks around it; pinch zooms.
- **Decided:** the view can rotate around the vertical axis; branches and obstacles hide behind each other, and rotating to see them is part of play.
- **Decided:** stone between the camera and the tree is cut away (as in diorama games), so the tree stays visible while still enclosed.
- **Decided (2026-10-14) after playtest:** the cut-away removes **whole stone blocks**, not holes in surfaces. Surface holes made the thin walls look hollow and disorienting; removing whole blocks always shows solid stone and leaves an edge like a crumbled wall.
- **Proposal:** drag to orbit, pinch to zoom, tap a card then tap a target. A small side silhouette or map shows the whole tree and where you are.

---

## 8. Day and night

- **Decided:** a day/night cycle runs during each run and advances with turns.
- **TBD value:** 1 turn = 1 hour, 24 turns per day.
- **Decided:** the tree must stay clearly visible at night (night is darker and moodier, never unreadable).
- Night look (current study): moonlight, stars, fireflies, blossoms that glow, magical glow in the stone.
- **Decided:** day and night change the rules a little. In prototype v0: sunlight (and therefore sap from tips) exists only by day; at night only the roots, Lanterns and the night-only Moonbloom card feed the tree, and wood upkeep still has to be paid, so sap must be saved during the day (§18).
- **Open:** night-only hazards; whether night should be shorter or longer than day.

---

## 9. Run structure and progression (arcade)

- **Decided:** arcade style. A run is effectively unlimited in height, throttled by **rising difficulty**.
- **Decided:** **strata** are predefined bands every *X* height. Each new stratum raises difficulty and can introduce new obstacle types or rules. **TBD value:** X, and what each stratum adds.
- **Decided:** the visual theme does **not** change between strata within a run (§10.3).
- **Decided:** reaching certain height thresholds **unlocks new powers** (cards, the hold slot, other upgrades) for future runs.
- **Decided:** trees that pass a height threshold are saved to a **gallery** where they stand side by side and can be visited.
- **Decided (2026-10-14):** score combines **height and health**. Working formula: peak height (cm) × average tree health over the run, so a well-kept tree scores more than a leggy one that limped upward.
- **Open:** run length is open-ended by design; target a typical first run of about 10 minutes and skilled runs much longer.

---

## 10. Art direction

### 10.1 Overall

- **Decided:** lush and colourful, beautiful to play. Soft, believable lighting: sun and moon shadows, rim light, fog, glow on bright magical things.
- **Decided:** real 3D. Branches must be organic and continuous. Visible seams, cartoon-like strokes and flat-vector looks were rejected (§15).
- **Decided:** the plant must look organic: a gnarled, tapered trunk with root flare, curving movement and textured bark. This is the current focus of rendering work.

### 10.2 Enclosure and light

- **Decided:** the tree is surrounded by ruins with limited light coming through; it is not an open scene.
- **Proposal:** visible light shafts (dusty sunbeams) through openings, moving with the time of day.

### 10.3 Culture blend per run

- **Decided:** every run uses a **blend of all three** architectural styles, and each new run is a **new blend**. The blend stays the same for the whole run.
- Source styles:
  - **Atlantis:** pale weathered marble and teal-green stone, fluted columns, rings of glowing orichalcum (copper-gold metal from Plato's account), spirals and concentric circles, water and coral.
  - **Angkor:** warm sandstone and laterite, stacked blocks, lotus-petal bands, baluster windows, tiered lotus-bud towers, strangler-fig roots gripping stone.
  - **Maya:** pale limestone with traces of red paint, stepped forms and corbel (stepped) arches, glyph panels, jade green.
- **Proposal:** the blend is a set of three weights drawn from the run seed. It sets stone colour, which carved motifs appear, which architectural pieces are used, the colour of magical glow (cyan, gold, jade), and whether there is standing water.

### 10.4 Rejected looks

- Ink wash (sumi-e) in 2.5D: liked the beauty, but wanted lush colour.
- 2.5D painted canvas in colour: branches looked cartoon-like and joints between pieces looked bad.

---

## 11. Audio

- **Decided:** generative tones tied to growth (each growth event plays a note, so the tree "composes" as it grows).
- **Proposal:** pentatonic or modal scales chosen from the run's blend; ambient bed (water drips, insects, wind) changing with day and night.
- **Open:** whether there is any music besides the generative tones.

---

## 12. Saving and data

- **Decided:** progress is retained when the page is closed and reopened.
- **Proposal:** save a run as its **seed plus the list of moves**. Replaying the moves rebuilds the exact tree. This keeps saves tiny, makes the gallery cheap (each gallery tree is a seed and move list), and later allows sharing a tree with a friend as a short code.
- **Proposal:** autosave after every turn and when the app goes to the background, using browser local storage (`localStorage` or IndexedDB). Caveat: data lives in one browser on one device and is lost if site data is cleared. Cross-device sync is out of scope for now.
- Determinism requirement: all randomness must come from the seeded generator so replays are exact.

---

## 13. Technical architecture (proposal)

- **Simulation** (pure logic, no rendering): tree graph, vigor, growth, collisions with the labyrinth, cards and deck, scoring. Deterministic and testable.
- **World generation:** chunked labyrinth from seed and stratum.
- **Renderer:** three.js scene built from simulation state. Current techniques (from `studies/3d`): tapered tube meshes merged per tree, instanced leaf cards with wind sway in the shader, shadow-casting sun or moon, procedural sky, fog, bloom.
- **UI layer:** HTML overlay for hand, HUD, menus (keeps text crisp and accessible).
- **Persistence:** save/load of seed and move log, unlocks and gallery.

---

## 14. Milestones (proposal)

| # | Milestone | Content |
|---|---|---|
| M0 | Look studies | Done: ink, colour 2.5D, 3D. 3D chosen. |
| M1 | Rendering slice | Organic trunk, enclosed labyrinth with limited light, readable night, culture blend per run. Done as `studies/3d`. |
| M2 | Rules prototype v0 | Tree simulation with tips, vigor, growth per turn, prune / water / rooting powder / tether, stalls, stagnation and warning. Done as `play/` (§18). Feedback: felt like guiding vines; growth should be natural. |
| M2b | Growth prototype v1 | Self-growing tree (space colonization toward light), animated growth each turn, alternating ruin modules, auto-follow camera with branch travel. **In progress** as `grow/`. Cards are re-added after the growth looks right. |
| M2c | Bonsai prototype v2 | Established starting tree, bud-based growth with apical dominance and self-shading, health and die-back, forced card queue (Cut, Pinch, Wire), rings on the ruins, height and health score. **In progress** in `grow/`. Species: temple fig. |
| M3 | Playable run | Cards in hand, labyrinth chunks, camera follow, strata and difficulty, day/night by turn, save and resume. |
| M4 | Meta progression | Unlocks, gallery, hold slot. |
| M5 | Polish and share | Audio, performance tiers, tutorial, sharing a tree by code, GitHub Pages release for friends. |

---

## 15. Decision log

| Date | Decision | Alternatives considered | Reason |
|---|---|---|---|
| 2026-10-13 | Turn-based, no timer | Real-time growth; turn timer | Strategy without time pressure. |
| 2026-10-13 | Hand of 3; hold unlocked late | Fixed Tetris-style queue | More strategy; hold as progression reward. |
| 2026-10-13 | Every tip grows each turn ("1a") | Only the targeted part grows | Whole tree keeps moving; Tetris-like pressure. |
| 2026-10-13 | Stagnation ends a run, with a warning | Rising shade line; toppling | Low pressure; failure comes from your own choices. |
| 2026-10-13 | Hybrid → arcade structure with unlocks and gallery | Pure zen single tree; short fixed runs | "One more run"; runs felt too small. |
| 2026-10-13 | Ruins: Atlantis, Angkor, Maya | Japanese stone; one culture | Lush, fantastical, varied. |
| 2026-10-13 | Sagging and tethers | Whole-tree balance / toppling | Gentler; makes the ruins necessary. |
| 2026-10-13 | Day/night cycle advancing with turns | Fixed lighting per stratum | Variety and mood within a run. |
| 2026-10-13 | Real 3D (three.js) | 2D; 2.5D ink wash; 2.5D colour | 2.5D branches looked cartoon-like, joins looked bad; wanted closer, richer view. |
| 2026-10-13 | One blended theme per run, new blend each run | Theme changes per stratum | Consistency within a run, variety across runs. |
| 2026-10-13 | Tree enclosed by ruins with limited light | Open courtyard | Labyrinth feel; light becomes meaningful. |
| 2026-10-13 | Night must stay readable | Realistic darkness | Playability on a phone. |
| 2026-10-13 | GitHub Pages hosting (public repo) | Artifact only | Shareable with friends; artifact kept for quick tests. |
| 2026-10-13 | Generative tones tied to growth | None; fixed music | Tree "composes" as it grows. |
| 2026-10-13 | Day and night change the rules (sunlight only by day) | Cosmetic only | Gives the day/night cycle a strategic role. |
| 2026-10-13 | Build a playable rules prototype before tuning strata | Tune on paper | Band height and difficulty are judged by playing. |
| 2026-10-13 | The tree grows itself (space colonization toward light); cards tend it | Player steers every tip one cell per turn (v0) | v0 felt like guiding vines; the goal is to watch a tree grow. |
| 2026-10-13 | Same control as v0 in spirit: gentle cards plus one sharp tool that redirects the leading shoot | Only indirect cards | Keeps one decisive move among gentle ones. |
| 2026-10-13 | Ruin structure C: alternating open terraces and enclosed chambers | Stacked chambers only (A); open temple mountain (B); single silo | Rhythm of dark and light; fixes the darkness complaint. |
| 2026-10-13 | Animated growth of the whole plant every turn; no auto-run | Auto-play several turns | The player wants to watch growth, in control of time. |
| 2026-10-13 | Camera follows growth; tap a branch and swipe to travel along it | Free camera only | Lets the player explore the tree as it gets tall. |
| 2026-10-14 | Bonsai growth rules (§4.9): buds, apical dominance, self-shading, health, die-back; shoots no longer route around stone | Free space-colonization growth (v1) | v1 was dense and aggressive and played itself. |
| 2026-10-14 | One forced card per turn, next three visible | Hand of 3 | Puzzle feel, closer to Tetris. |
| 2026-10-14 | Cards are Cut, Pinch, Wire; no Lantern; no direct redirect tool | Gentle cards plus a sharp redirect tool | Mimic real bonsai work. |
| 2026-10-14 | Start every run with an established bonsai | Seedling | Thick lower trunk from the start; real bonsai are rarely started from seed. |
| 2026-10-14 | Rings attached to ruins in sensible places | Rings floating near walls | Believable wiring. |
| 2026-10-14 | Score = height and health | Height only | Rewards good care, not just climbing. |
| 2026-10-14 | Neglect hurts a fair amount | Gentle, forgiving | It should feel like a puzzle. |
| 2026-10-14 | One species at a time, temple fig first | Several at once | Make one fun before adding others. |
| 2026-10-14 | Hand of three, all forced, any order; never three of the same; tree grows after each card | One forced card with a visible queue | More choice in sequencing while keeping obligation. |
| 2026-10-14 | Shoots slide along stone toward light and sense light within about a metre | Hard stop at stone | Playtest: being trapped under a ceiling with a corner gap was aggravating, not fun. |
| 2026-10-14 | Add Rooting powder (wake a chosen dormant bud) | Graft; no direct tool | Direct influence that is real horticulture; grafting deferred. |
| 2026-10-14 | Stable tree geometry, grown-in joints, constant bark scale, visible cut ends | Rebuild everything each turn | Playtest: tree looked disconnected and shape-shifting. |
| 2026-10-14 | Cut-away removes whole blocks | Dithered holes in surfaces | Playtest: hollow surfaces were disorienting. |

---

## 16. Open questions

1. Height interval *X* between strata, and what each stratum adds. To be decided by playing the prototype (currently 8 m).
1b. Pacing of growth (how much the tree grows per turn) and how cards map onto the new growth model.
2. Resolved: day and night change the rules (§8). Still open: night hazards.
3. One rescue per run before stagnation?
4. Card draw: uniform or weighted by situation?
5. Score: height only, or height plus a beauty bonus?
6. Which powers unlock at which heights, and the gallery height threshold.
7. Music beyond generative tones.
8. Exact controls for targeting on a small screen (tap-tap vs drag).
9. How much the camera may zoom out to show the whole tree, given the base should drop out of view.

---

## 17. Glossary

- **Tip:** the growing end of a branch.
- **Vigor:** a tip's growth budget.
- **Stall:** a tip blocked by an obstacle; it still uses vigor.
- **Stagnation:** no tip can grow; the run ends.
- **Tether (wire):** tying a branch to an anchor in the ruins.
- **Stratum (plural strata):** a predefined height band that raises difficulty.
- **Blend:** the per-run mix of Atlantis, Angkor and Maya styles.
- **Run:** one game from a new seed until stagnation.
- **2.5D:** 3D positions drawn as flat 2D strokes; tried and rejected.

---

## 18. Prototype v0 rules (as implemented in `play/sim.js`)

**Superseded for growth** by §4.7 (feedback: too much like guiding a vine). Kept for reference; the economy ideas (sap, upkeep, day-only sunlight) may return on top of the new growth model.

Every number below is a first guess, defined in one place (`CFG` in `play/sim.js`). Nothing here is final; it exists so the game can be played and tuned.

**Space.** The world is a grid of cells (0.4 m) inside a round shaft about 11 cells wide. The tree occupies cells; so do obstacles. Tips grow one cell per turn.

**Turn.** Play one card from a hand of 3, or discard one. Then the turn resolves: income, upkeep, growth, rockfall, clock +2 hours (12 turns per day). The hand refills.

**Sap.**
- Income each turn: 1 from the roots, plus 1 for each tip standing in light. Cap 12.
- Upkeep each turn: 1 sap per 30 cells of living wood. If it cannot be paid, every tip gets hungrier.
- Each stuck tip drains 1 sap per turn.
- Each growth step costs 1 sap. The highest tips are fed first (apical dominance).

**Light.** A cell is sunlit by day if no stone lies within 8 cells above it (plus 2 more cells per stratum), or if it is within 3 cells inside a window facing the sun. Lanterns light a radius of 2.6 cells for 8 turns, day or night. There is no sunlight at night.

**Growth.** A tip keeps its heading when the next cell is free, bends up to 45° toward a lit cell, and deflects up to 45° around obstacles. A tip with no move is stuck.

**Death and the end of a run.**
- A tip stuck for 3 turns in a row withers. A tip unfed for 4 turns in a row withers.
- A branch that has grown 4 cells sideways sags downward unless it is tethered.
- If no tip can grow, the player gets one turn of warning; if still none can grow, the run ends.

**Obstacles.** Ledges grow from the walls; broken beams cross the shaft (their gaps narrow with height); fallen blocks appear from stratum 1 on. A 2×2 rock falls every 9 turns at first, down to every 3 turns higher up, near the highest tip; a red column shows where the next one lands two turns ahead.

**Cards.** Water (+2 free growth steps for a tip), Prune (cut a branch, refund half its cells as sap, a bud forms at the cut), Rooting powder (new tip from old wood), Bend (new heading), Tether (grow toward an iron ring; +3 sap on arrival; no sag), Lantern (light for 8 turns), Moonbloom (night only, +3 sap), Shears (forced: must cut something). Draw weights shift with night (more Lanterns, Moonbloom) and height (more Shears).

**Score.** Peak height reached. Trees over 4 m enter the gallery. Saves are the seed plus the list of moves; the game rebuilds by replaying them.

**Measured with simple bots (40 seeds each, `tests/sim.test.mjs`).** Random play reaches 14.4 m on average over about 160 turns; a simple greedy player reaches 17.3 m. These are baselines for tuning, not targets.
