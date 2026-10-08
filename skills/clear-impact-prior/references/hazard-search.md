# From hazard code to search

An Event's `types` are codes, not words. Nothing on the web is tagged `rs` or `FL`; you have
to search for what people write. This file maps the codes CLEAR uses to search phrases and
to the source families that report them. For a code this file does not list, derive the
phrases from the Event's title and description, use the source family of its nearest
neighbour here, and record the phrases you used under `hazardPhrases` in `result`.

Look a code up in this file case-insensitively (clear-api stores them in lower case: `fl`,
`rs`). In tool calls — `clear_list_events(eventTypes: …)`, a case's `hazardType` — spell it
exactly as `clear_get_event` returned it: clear-api compares codes exactly.

## Natural hazards (GLIDE)

Source family — search with `allowed_domains` set to these, then the open web:
`reliefweb.int`, `unocha.org`, `ifrc.org`, `dtm.iom.int`, `who.int`, `glidenumber.net`,
`emdat.be`, `floodobservatory.colorado.edu`, `usgs.gov`, `gdacs.org`.

| Code | Hazard | Search phrases |
|---|---|---|
| `fl` | Flood | flood, flooding, "heavy rains", "river overflow" |
| `ff` | Flash flood | "flash flood", "flash flooding" |
| `dr` | Drought | drought, "failed rains", "dry spell" |
| `tc` | Tropical cyclone | cyclone, hurricane, typhoon, "tropical storm" |
| `st` | Severe local storm | storm, "heavy storm", "windstorm", hail |
| `ss` | Storm surge | "storm surge", "coastal flooding" |
| `vw` | Violent wind | "strong winds", "windstorm" |
| `eq` | Earthquake | earthquake, quake, "magnitude" |
| `ts` | Tsunami | tsunami |
| `vo` | Volcano | "volcanic eruption", eruption, "volcano" |
| `ls` / `ms` / `sl` | Landslide / mudslide / slide | landslide, mudslide, "debris flow" |
| `av` | Avalanche | avalanche |
| `wf` | Wildfire | wildfire, "forest fire", "bush fire" |
| `fr` | Fire (urban/structural) | fire, blaze, "camp fire", "market fire" |
| `ht` | Heat wave | heatwave, "heat wave", "extreme heat" |
| `cw` | Cold wave | "cold wave", "cold snap", "extreme cold" |
| `et` | Extreme temperature | "extreme temperatures", heatwave, "cold wave" |
| `ep` | Epidemic | outbreak, epidemic, plus the disease if the Event names it (cholera, measles, dengue, Ebola…) |
| `in` | Insect infestation | "locust", "locust swarm", infestation |
| `fa` | Famine / food insecurity | famine, "food insecurity", "IPC Phase", "acute malnutrition" |
| `ac` | Technological / accident | accident, collapse, explosion, "chemical spill", crash |
| `ce` | Complex emergency | "complex emergency", "humanitarian crisis", conflict, displacement |
| `ot` | Other | from the Event's title and description |

For natural hazards, **GLIDE** (`glidenumber.net`) and **EM-DAT** index events by exactly
this hazard and country: one query there (`site:glidenumber.net <hazard> <country>`) often
lists every dated prior at once. Fetch the ReliefWeb disaster page or situation report it
points to for the quote.

## Conflict and unrest (ACLED-style codes)

Source family — `acleddata.com`, `reliefweb.int`, `unocha.org`, `ohchr.org`, `hrw.org`,
`amnesty.org`, `crisisgroup.org`, `dtm.iom.int`, plus the regional press that covers the
country day by day (for Sudan: `sudantribune.com`, `dabangasudan.org`; for others, the
best-known English-language national outlet). Search the regional press **by year**: it is
where single dated incidents live; the UN sources summarise them.

| Code | Hazard | Search phrases |
|---|---|---|
| `rs` | Explosions / remote violence | "drone strike", airstrike, "air strike", shelling, "artillery", explosion, "missile strike" |
| `rd` | Remote violence — air/drone strike | "drone strike", airstrike, "air raid" |
| `rm` | Remote violence — shelling/artillery/missile | shelling, "artillery fire", "missile attack", "rocket attack" |
| `ri` / `rl` | Remote violence — IED / landmine | IED, "roadside bomb", landmine, "explosive device" |
| `rb` | Remote violence — suicide bomb | "suicide bombing", "suicide attack" |
| `rg` | Remote violence — grenade | grenade, "grenade attack" |
| `rc` | Remote violence — chemical | "chemical attack", "chemical weapon" |
| `ba` / `bo` / `bg` | Battles (armed clash; territory changes hands) | clashes, fighting, "armed clash", "seized", "recaptured", offensive |
| `va` / `vs` / `vd` | Violence against civilians (attack; sexual violence; abduction) | "attack on civilians", massacre, "killed civilians", "sexual violence", abduction, kidnapping |
| `pp` / `pi` / `pf` | Protests (peaceful; with intervention; excessive force) | protest, demonstration, "protesters", "dispersed", "tear gas" |
| `pv` / `po` / `pl` / `pw` / `pt` / `pg` / `ph` / `pa` | Riots and other protest sub-types | riot, "violent protest", "mob violence", "looting", protest |

The CLEAR vocabulary for conflict codes is wider than ACLED's published sub-events and not
every two-letter code above is documented; where this table and the Event's own title
disagree, the title wins and the discrepancy goes in `result.notes` so the vocabulary can be
fixed.

For `rs` and its sub-types, "same hazard" means another **remote-violence** incident —
a strike, shelling, an explosion — not a ground battle (`ba`) or an attack on civilians
(`va`) in the same war. A page reporting both counts once, as the hazard it leads with.

## Query shapes that work

- `<hazard phrase> <place> <month year>` — the targeted search for one known CLEAR incident
  (skill step 6a), with the source family's domains allowed first.
- `<hazard phrase> <country> <year>` — one per year slice of the horizon.
- `<hazard phrase> <state or district name> <country>` — one per admin name and spelling.
- `<hazard phrase> <country> "situation report" OR "flash update" OR DREF` with the UN/Red
  Cross domains allowed.
- `<hazard phrase> <country> displaced OR affected OR households` on the open web — the
  words outcome figures come with.
- For a place with several spellings, put them in one query with `OR`.

Use your search tool's extended mode (`mode: "extended"`) where it has one. Standard mode
returns ten links and a summary; it is not research.
