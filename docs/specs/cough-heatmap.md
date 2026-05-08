# Cough heatmap — design brief

Self-contained spec for the cough trend tile. Hand to any Claude that's implementing the visualization; it's everything they need without seeing the chat that produced it.

## What the caregiver sees

A grid of small cells, **4 rows tall × 14 columns wide**. Each row is a slice of the day — Morning, Afternoon, Evening, Nocturnal. Each column is a date over the past 14 days. Each cell answers one question: *did Mom cough during this window of this day, and how much?*

The point of the chart is to make three things obvious at one glance:

1. **Mostly clean weeks look mostly empty.** When there's no cough, the chart shows a faint cream grid with almost nothing in it. That's the desired state. The chart shouldn't *fill itself in* with default-color cells when there's nothing to report — empty has to look empty.
2. **A single cough event has to be unmistakable.** If Mom coughed once on Tuesday afternoon, that one cell needs to *jump out* against the 55 empty cells around it. The previous version's cells were all the same near-cream tint; the eye couldn't find the one event.
3. **Nocturnal cough is the row that matters most.** Per `research/chf-source-of-truth.md` §5, nocturnal cough sits late in the decompensation cascade — it's a bad sign and clinically distinct from a daytime tickle. The Nocturnal row label is permanently colored coral so the caregiver's eye lands there first when scanning, even on weeks where (mercifully) it's empty.

## Why a heatmap and not a sparkline or bar chart

Cough is **event-based, not continuous**. There's no "cough trend line" — Mom either coughed or she didn't. And **time-of-day matters clinically** — nocturnal cough is high-yield, daytime cough is mostly noise. A sparkline of "cough events per day" would lose the time-of-day distinction. A bar chart per day would lose it too. A heatmap is the right primitive because it preserves both the *when in the day* and the *over how many days* dimensions at once.

## Data model

Each cell encodes the count of cough events in one (day, time-of-day) bucket:

- **Day**: ISO date for the past 14 days, oldest on the left, today on the right.
- **Time-of-day bucket**: one of `morning` / `afternoon` / `evening` / `nocturnal`.
- **Count**: 0, 1, 2, 3+ (clamped — anything 3 or more renders the same as 3).

How counts get populated is a separate concern for the extraction layer — caregivers won't volunteer numeric counts, so Claude grades each voice-log dictation and writes one of the four levels per bucket. A caregiver who says *"she coughed last night"* gets `nocturnal: 1`. *"She was coughing all afternoon"* might get `afternoon: 3`. The chart consumes whatever the extractor produces; this brief doesn't constrain that.

## Visual encoding

Four cell states, increasing visual weight:

| Count | Treatment |
|---|---|
| 0 (empty) | Very faint sage tint at ~6% opacity. *Almost* invisible — looks like cream. The chart should read as mostly-empty when there's no cough. |
| 1 | Clearly visible amber at ~45% opacity. The single-event signal — has to be findable in a sea of empty cells. |
| 2 | Coral at ~55% opacity. |
| 3+ | Coral at ~85% opacity. |

The contrast jump between *0* and *1* is the most important thing in the encoding. If a caregiver glances and can't immediately tell whether their week had any coughs at all, the chart has failed. Don't tune the empty cells to be more visible "for grid clarity" — that's how the previous version broke.

The Nocturnal row label is permanently coral (`var(--coral)`, weight 600) regardless of whether the row has events. That visual anchor teaches the caregiver where to look first. Other row labels stay neutral muted-foreground.

## Today indicator

The rightmost column (today) gets a thin outline (`outline: 1.5px solid var(--line-strong)`) on every cell in that column. This anchors the eye to *now* without overpowering the data. No halo, no brightness change — just a frame.

## Headline copy above the chart

A short summary line that distills the 14-day picture into one read:

- **0 events** → "No cough" + supporting count: *"13 quiet · 0 daytime · 0 nocturnal"*
- **Daytime only** → "No cough" headline (still the caregiver-facing read), supporting count: *"13 quiet · 1 daytime · 0 nocturnal"*
- **Any nocturnal** → headline shifts to "Nocturnal cough this week" (or similar) and the supporting count leads with the nocturnal number

The headline should never read as alarmist when only daytime coughs are present. Daytime cough is low-yield clinically; the nudge intensity should match.

## Layout

Full-width tile (spans both columns of the dashboard grid). The 14-column-wide chart needs the horizontal real estate; cramming it into a half-width card crushes the cells.

Internal grid:

```
[ row labels (80px) ][ 14 columns of cells, 4-row stack ]
                    [ x-axis: Apr 10 ... Apr 16 ... Apr 23 · today ]
```

Cell height ~22px, gap ~4px. Cells are slightly rounded (`border-radius: 3px`) — softens the grid without making it cute.

## What NOT to do

- **Don't add a continuous color ramp** between counts (e.g. 1→2→3 as gradual amber gradation). The discrete tiers (0/1/2/3+) match how caregivers actually report — fuzzy gradation invents precision the data doesn't have.
- **Don't draw a "today" vertical line that spans the full chart height** — it crosses every row and competes with the data. Outlining just the today column's cells is enough.
- **Don't hide empty rows.** Show all four time-of-day rows always — the Nocturnal row's coral label is the *point*; if you hide empty rows, the caregiver loses the visual anchor that teaches them what to look for.
- **Don't add tooltips on hover that say "0 coughs"** — the cell already says "no cough" by being visually empty. A tooltip on every empty cell pollutes the interaction.
- **Don't summarize counts under the chart.** The headline above the chart already does that. A second summary below is duplicate.

## Source-of-truth citations

- `research/chf-source-of-truth.md` §5 (decompensation progression — nocturnal cough is item #6, late in the cascade, post-PND)
- `research/chf-source-of-truth.md` §3 (numeric thresholds; cough doesn't have a numeric threshold but is a tier-2 contributor)

## Reference mockup

Working HTML reference (throwaway, not in repo) was generated at `/tmp/heartnote-trend-cards-fixed.html` during the design pass. The cough card in that file is the visual spec — recreate the encoding, cell sizes, and color treatments shown there. If that file's gone, the values in this brief are sufficient to rebuild it.
