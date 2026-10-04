# Scratchpad Shorthand V1

Scratchpad Shorthand V1 is an optional compatibility grammar for compact
Obsidian/Scratchpad intake. Normal loose/freeform Scratchpad text remains
supported as the parser fallback.

This document defines the V1 contract. Prefix meanings, token rules, and the
domain decisions below must remain backward compatible in future versions.

## Date context

Date headings remain authoritative:

```text
10/2
10/2/2026
**10/2**
**10/2**\
```

An omitted year is inferred using the existing reference-date rule. A record
without a valid date heading is still parsed into its domain, but carries a
missing-date review issue. The parser never silently substitutes today.

## Prefixes and precedence

Prefixes are case-insensitive and whitespace after the colon is optional.

| Prefix | Domain |
| --- | --- |
| `t:` | Task History |
| `w:` | Water |
| `wt:` | Weight |
| `f:` | Focus |
| `b:` | Breakfast |
| `l:` | Lunch |
| `d:` | Dinner |
| `s:` | Snack |

Each non-empty line is considered in this order: date heading, structural
heading, explicit shorthand prefix, existing section-specific parser, existing
loose parser, then Unsupported/Needs Review. Explicit shorthand is authoritative
for its line and does not change the active loose-parser section.

## Shared tokens and time

Comma-separated shorthand lists support double-quoted values and doubled escaped
quotes:

```text
t: NBA 2K done, "Call Smith, Jr." done
t: "Say ""hello""" dmb
```

Trailing Markdown backslashes are tolerated. A trailing `@ time` is recognized
only when it matches a supported time form: `4pm`, `4:15pm`, `4:15 pm`, or
`16:15`. It is normalized internally to `HH:mm`.

## Task shorthand

```text
t: nba 2k
t: nba 2k done
t: adhdice dmb
t: animal control did my best
t: animal control missed
t: nba 2k done, adhdice dmb, wolverine
```

Outcome aliases are `done`, `dmb`, `did my best`, and `missed`. An unmarked
Task has No change; it is not executable until reviewed and changed. Task
matching uses canonical exact-match rules: one unique exact match can be
selected automatically, while multiple exact matches and no exact match remain
Needs Review. Fuzzy matches never auto-select and `t:` never creates a Task.

### Task multi-date history

Historical Task outcomes can use one Task expression with multiple inline dates:

```text
t: NBA 2K - Done 9/27 9/28 9/29
```

The deliberate ` - ` separator must be followed by a recognized outcome:
`Done`, `DMB`, `Did My Best`, or `Missed`, case-insensitively. The parser creates
one flat occurrence draft per date under one visible Task group after canonical
Task matching. It removes the outcome and dates before exact Task matching, so
the canonical search title is `NBA 2K`.

Inline dates are authoritative for that line and override the active date
heading. A line without inline dates falls back to the active heading; without
either, the occurrence remains visible with `Missing date heading`. Dates use
the same `M/D`, `MM/DD`, and explicit-year validation and nearest-not-after
year inference as date headings, including year-boundary rollover. Duplicate
dates within one expression are kept as one occurrence in source order.

Malformed inline date tokens remain visible as non-executable review issues while
valid sibling dates remain eligible for partial Apply. Existing simple Task
shorthand and comma-separated Task shorthand remain unchanged.

## Water shorthand

```text
w: 20oz done
w: 15 fl oz pending
w: 2 cups confirmed
w: 20oz done @ 2:15pm
```

Supported units are `oz`, `fl oz`, `floz`, `fl_oz`, `cup`, and `cups`. Within
`w:` shorthand, `oz` means `fl_oz`. `done` and `confirmed` both mean
Confirmed; `pending` remains Pending. A missing status is retained as a Water
submission with a Choose Pending or Confirmed review issue.

Without a time, existing deterministic/default Water timestamp behavior is
preserved.

## Weight shorthand

```text
wt: 233.6
wt: 233.6lb
wt: 106kg
wt: 233.6 @ 8:30am
```

Supported explicit units are `lb`, `lbs`, and `kg`; `lbs` normalizes to `lb`.
Without an explicit unit, Health `preferred_weight_unit` is required. If the
Health profile is not ready, the row stays Needs Review rather than guessing.

Without a time, existing deterministic/default Weight timestamp behavior is
preserved.

## Focus shorthand

```text
f: Coding 1h
f: Coding 1h @ 4:15pm
f: Coding 1h30m @ 4:15pm
f: Coding 90m
f: Music 45 min @ 8pm
```

Existing duration forms remain supported, including `1h`, `1 hr`, `1 hour`,
`1h 30m`, `1 hr 30 min`, `90m`, `90 min`, and `30 minutes`. An exact normalized
saved Focus category match supplies its canonical type and subtypes. An unknown
category remains a Focus review row with a null category, rather than becoming
Unsupported; fuzzy category matching never auto-selects. Missing completion
time carries Choose a Focus completion time before Apply.

## Meal shorthand

`b:`, `l:`, `d:`, and `s:` map directly to one Breakfast, Lunch, Dinner, or
Snack occurrence. Comma tokens become food proposals beneath that one
occurrence, and one trailing time applies to the whole occurrence:

```text
b: turkey bacon 8, watermelon 290g, fanta 20fl oz @ 11:30am
```

The V1 food token is `<food name> [quantity][unit]`. Quantity/unit parsing is
trailing only, so numbers in the middle of a food name are preserved. Supported
units include `g`, `gram`, `grams`, `oz`, `ounce`, `ounces`, `ml`, `milliliter`,
`milliliters`, `fl oz`, `floz`, `fl_oz`, `cup`, `cups`, `serving`, and
`servings`, plus stored Custom Food units such as `slice`, `slices`, `piece`,
and `pieces`.

Meal proposals are ephemeral review state, not Health rows. Once the lazy Health
Custom Nutrition Library is available, exact normalized food-name matching may
resolve a unique match. Multiple exact matches and no exact match remain review
items; the user can select a Custom Food or use the manual-food fallback. The
raw source token, requested quantity, and requested unit remain visible.

Explicit quantity and unit become the consumed quantity/unit. A unitless
quantity adopts the uniquely matched Custom Food's stored serving unit; if no
library match exists, the unit is not guessed. With no quantity, the matched
food's stored serving quantity/unit is used. Resolved nutrition is calculated by
the existing Health nutrition authority, and each resolved food becomes one
flat `useHealth.addMealEntries` child under the same occurrence. The occurrence
shell itself counts as zero Apply rows.

Legacy loose Meals such as the following remain on the existing loose parser and
are not forced through the V1 food-token grammar:

```text
breakfast - fanta Turkey bacon 8 watermelon 290g
```

## Deferred domains

Sleep, CPAP, and Nap shorthand are **not** part of V1. Do not advertise or rely
on `sleep:`, `cpap:`, or `nap:` syntax as implemented shorthand.
