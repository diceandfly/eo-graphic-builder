<!--
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
English manual — mirrors docs/MANUAL.md (Korean).
Authoring rules live in MANUAL.md's top comment; follow the same
icon/link/table conventions here. Any functional edit must be made
in BOTH files. Anchors use this file's own English heading slugs.
3-column tables are identified by their first header text
('Position' / 'Tool' / 'Button') — keep those words if you edit headers.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-->

# EO Graphic Builder Help

## Contents

1. [Shortcuts](#1-shortcuts)
2. [Getting Started](#2-getting-started)
3. [Screen Layout](#3-screen-layout)
4. [Canvas Basics](#4-canvas-basics)
5. [Select · Move · Transform](#5-select-move-transform)
6. [Unit Parameters (Main Panel)](#6-unit-parameters-main-panel)
7. [Color](#7-color)
8. [Toolbar](#8-toolbar)
9. [Frames](#9-frames)
10. [Groups and Links](#10-groups-and-links)
11. [Align and Arrange](#11-align-and-arrange)
12. [Smart Guides and Snapping](#12-smart-guides-and-snapping)
13. [View Options (Corner Bar)](#13-view-options-corner-bar)
14. [Unit Presets](#14-unit-presets)
15. [Save · Open · Export](#15-save-open-export)
16. [Pattern Presets](#16-pattern-presets)
17. [Animation Mode](#17-animation-mode)

---

## 1. Shortcuts

Click a description to jump to the details.

### Tools & Modes
| Key | Action |
|---|---|
| V | {icon:select}[Select mode (units + frames)](#5-select-move-transform) — **press V again to toggle unit/frame priority**; zoomed out it goes [frame-first](#9-frames) automatically |
| F | {icon:frame}[Draw a frame](#9-frames) |
| I | {icon:eyedrop}[Eyedropper](#8-toolbar) |
| B | {icon:blend}[Run blend](#8-toolbar) |
| G | {icon:unitGrid}[Show/hide unit & frame grids](#13-view-options-corner-bar) |
| U / P | Open/close the [unit / pattern preset panels](#14-unit-presets) |
| Space (hold) | [Pan the canvas](#4-canvas-basics) |

### Color
| Key | Action |
|---|---|
| 1–7 | [Apply a brand color](#7-color) |
| C | [Apply the custom color](#7-color) |

### Editing
| Key | Action |
|---|---|
| ⌘Z / ⌘⇧Z | [Undo / redo](#5-select-move-transform) |
| ⌘C / ⌘⇧C / ⌘V | {icon:duplicate}[Copy / copy as PNG / paste](#5-select-move-transform) |
| ⌘G / ⌘⇧G | [Group / ungroup](#10-groups-and-links) |
| D, Delete, Backspace | {icon:trash}[Delete](#5-select-move-transform) |
| ⇧D | [Repeat the last action](#5-select-move-transform) |
| ⇧H / ⇧V | {icon:flipH}{icon:flipV}[Flip horizontal / vertical](#5-select-move-transform) |
| ⇧E | {icon:exportSvg}[Export as an SVG file](#15-save-open-export) |
| Q / W | [Bring to front / send to back](#5-select-move-transform) |
| Arrow keys (+Shift) | [Nudge (Shift = ×10)](#5-select-move-transform) |

### Mouse Modifiers
| Action | Result |
|---|---|
| Alt+drag | {icon:duplicate}[Move a copy](#5-select-move-transform) |
| Shift+drag | [Move on one axis / resize keeping proportions](#5-select-move-transform) |
| Alt+resize | [Resize from the center](#5-select-move-transform) |
| Click a selected object again | [Set it as the alignment key](#11-align-and-arrange) |
| ⌘+scroll / pinch | [Zoom](#4-canvas-basics) |

---

## 2. Getting Started

EO Graphic Builder is a parametric graphic tool for building brand assets from a screw-shaft cross-section motif. Shape a unit with [a few sliders](#6-unit-parameters-main-panel), [place and align](#11-align-and-arrange) it inside a [frame](#9-frames), then [export it as SVG or PNG](#15-save-open-export).

- **URL**: https://diceandfly.github.io/eo-graphic-builder/
- **Recommended browser**: Chrome
- **How is my work saved?** Your work is saved automatically in the browser you are using. It won't follow you to another computer or browser, so to hand it off or back it up, {icon:save}[download it as a file with the save button](#15-save-open-export).

---

## 3. Screen Layout

| Position | Name | Role |
|---|---|---|
| Left | **Main panel** | Settings for what you selected — unit: [shape controls](#6-unit-parameters-main-panel) / frame: [frame settings](#9-frames). Deselecting keeps the last object's settings up |
| Top left | **File bar** | {icon:manual}[Help](#13-view-options-corner-bar) · {icon:save}[Save](#save-and-open-as-a-file-file-bar) · {icon:open}[Open](#save-and-open-as-a-file-file-bar) · {icon:resetArrow}[Reset](#reset-file-bar) |
| Top right | **Corner bar (view)** | [Background grid · selection box · grid display · zoom level](#13-view-options-corner-bar) |
| Bottom left | **Align bar** | [Align · distribute](#11-align-and-arrange) |
| Bottom center | **Color bar + toolbar** | [7 brand colors + custom](#7-color) / [select · frame · eyedropper · blend · arrange tools](#8-toolbar) |
| Bottom right | **Preset bar** | [Unit presets](#14-unit-presets) · [Pattern presets](#16-pattern-presets) · [Animation Mode](#17-animation-mode) |

**{icon:mouseL}Left-click = run, {icon:mouseR}right-click = options** is the rule for every button. Numbers next to sliders can also be typed in directly.

---

## 4. Canvas Basics

| To do this | Do this |
|---|---|
| Pan | **Hold Space and drag**, or two-finger scroll on a trackpad |
| Zoom | **⌘(Ctrl)+scroll** or trackpad pinch |
| Back to 100% | Click the **% number** at the top right |
| Change background color/grid | {icon:mouseR}Right-click the grid button in the [corner bar](#13-view-options-corner-bar) (black-and-white tones) |

---

## 5. Select · Move · Transform

### {icon:select}Selecting
- **Click** = select one, **drag from an empty spot** = select everything in the area
- [Frames](#9-frames) can be clicked directly too — where a unit overlaps, the unit wins; click a frame's empty area or its **name label at the top left** to grab the frame
- Clicking anything in a [group](#10-groups-and-links) selects the whole group
- With several objects selected, **click one of them again** to make it the [alignment key](#11-align-and-arrange) (shown with a thicker outline)

### {icon:move}Moving
- Drag to move
- **Arrow keys** = nudge, **Shift+arrows** = ×10 (nudge distance is set in [view options](#13-view-options-corner-bar))
- **Shift+drag** = move on one axis only

### {icon:resize}Resize & Rotate (selection box handles)
- Drag corner/edge handles to resize (**Shift** = keep proportions, **Alt** = from the center)
- Rotate handle = rotate in 90° steps
- Selection box buttons: {icon:flipH}{icon:flipV}flip horizontal/vertical · {icon:duplicate}duplicate · {icon:trash}delete
- **Q / W** = bring to front / send to back

### {icon:duplicate}Copy & Paste
- **Alt+drag** = move a copy
- **⌘C** = copy — paste inside the app, and it's also copied as SVG you can paste straight into Figma and other tools
- **⌘⇧C** = copy as an image (PNG, 2× resolution)
- **⌘V** = paste at the mouse position — multiple objects keep their layout, groups stay groups
- **⇧D** = repeat the last action (blend, arrange, …)

### {icon:mouseR}Right-click Menu
{icon:trash}Delete · {icon:flipH}flip horizontal/vertical · {icon:presetAdd}[register unit preset](#14-unit-presets) · {icon:patternAdd}[register pattern preset](#16-pattern-presets) · {icon:duplicate}[copy as SVG](#15-save-open-export) · {icon:imagePng}[copy as PNG](#15-save-open-export) · {icon:exportSvg}[export file](#15-save-open-export)

### Undo
- **⌘Z / ⌘⇧Z** — undoes canvas work and preset register/delete. View settings and tool options are not part of undo.

---

## 6. Unit Parameters (Main Panel)

Select a unit to shape it in the left panel. Click the name at the top of the panel to rename it.

### SIZE
- Width/height values and ratio buttons (12:5 – 9:16)
- With several selected, they resize together as one block. To size each one separately, turn on **each** at the top right

### GRID — thread layout
- **cols** — number of threads (teeth)
- **pitch compression** — makes the teeth get progressively narrower toward one side. 0 is even, +/− picks the direction. The ratio buttons under the slider (1:1 – 1+√2) jump to common values, and changing direction keeps the slant shape of the teeth
- **gutter mode** — spacing between teeth as a fixed value (fixed) or proportional to width (prop)

### SHAPE
- **shaft size** — thickness of the center shaft (% of unit height)
- **thread top / bottom width** — width of each tooth's top/bottom edge (changes the slant)
- **thread sides** — double: teeth above and below the shaft / single: top only

---

## 7. Color

- **Color bar**: 7 brand colors — Builder Neon(1) · Day Blue(2) · Bay Green(3) · Air White(4) · Medium Gray(5) · Solid Gray(6) · Space Black(7). Number keys apply them instantly
- **Custom color (C)**: click to apply, **{icon:mouseR}right-click** to open a picker and choose any color
- With something selected, its color changes; with nothing selected, the color is remembered for the next object you create
- **Recent colors**: colors you pick are remembered automatically (up to 6) and reusable from the custom picker, the [frame stroke picker](#9-frames), and the [quick frame picker](#8-toolbar). {icon:mouseR}Right-click a chip to remove it
- You can also type a color code (#RRGGBB) into the picker

---

## 8. Toolbar

| Tool | {icon:mouseL}Left-click / key | {icon:mouseR}Right-click |
|---|---|---|
| {icon:select}**Select** | [Select mode](#5-select-move-transform) (V) — units and frames. Zoomed out it switches to [frame-first](#9-frames) automatically and the icon becomes a filled arrow | Temporarily flip unit↔frame priority (reverts to the automatic rule when you zoom or switch tools) |
| {icon:frame}**Frame** | Draw a [frame](#9-frames) (F) — made at the size you drag. **Double-click** the button to create one instantly at a preset size | Quick frame options: [social banner presets](#9-frames) · size · margin · gutter · color |
| {icon:eyedrop}**Eyedropper** | Eyedropper (I) | Choose what to pick up: color / size / grid / shape & style / orientation |
| {icon:blend}**Blend** | Run blend (B) | Direction · repeat count · gap · scale change |
| {icon:arrange}**Grid arrange** | Run arrange | Horizontal & vertical gaps · column count |

### {icon:eyedrop}Eyedropper — pick up another object's properties
With objects selected, click another object with the eyedropper to copy over the categories you enabled in {icon:mouseR}right-click (color, size, grid, shape, …). Units pick up from units and frames from frames only — overlapping objects of the other kind are never clicked by mistake.

### {icon:blend}Blend — repeat with variation
Select a unit (or a [group](#10-groups-and-links)) and run it: copies are laid out at even spacing, growing or shrinking in the chosen direction, and grouped automatically.

### {icon:arrange}Grid arrange — tidy layout
Rearranges the selected objects into a clean grid ([groups](#10-groups-and-links) move as one block). The options set **horizontal and vertical gaps** separately.

---

## 9. Frames

A frame is a board that holds and lays out units. Use it like an artboard.

### Creating
- Press **F** and drag, or **double-click** the {icon:frame}frame button (instantly created at the preset size and color)

### {icon:frame}Social Banner Presets
- **{icon:mouseR}Right-click** the {icon:frame}frame button and turn on a preset (YouTube · X · LinkedIn profile/company); **double-clicking** the button then creates a frame at that spec
- Preset frames come with **safe-area boundaries pre-drawn as grid lines** — e.g. the desktop display band and the mobile safe area of a YouTube banner (2560×1440). Keep important content inside the inner cells
- Press **Custom** to go back to your own size and margin inputs

### Selecting Frames
- **Frames can be selected and moved in V (normal select) too** — where a unit overlaps, the unit wins; click an empty area or the **name label at the top left** to grab the frame
- **Double-click a frame's name label** to rename it in place
- **Zoom out below a certain level and the select tool goes frame-first automatically** — the toolbar icon becomes a filled arrow, and clicking or dragging over units grabs the frame. Handy for picking and moving frames from a distance
- The switching level is set under **Frame first below** in the [% badge {icon:mouseR}right-click menu](#13-view-options-corner-bar) (0 = off)
- Need the opposite of what the current zoom gives you? **{icon:mouseR}Right-click** the {icon:select}select tool — it flips temporarily, and reverts to the automatic rule when you zoom or switch tools

### How do contents follow?
- A unit whose center is inside a frame counts as its content (topmost frame wins when frames overlap)
- **Moving, aligning, or arranging** a frame carries its contents; **resizing** changes the frame only
- **Copy, paste, and [export](#15-save-open-export)** include the contents
- The frame you created or touched most recently shows a faint outline — that's the frame used as the [reference for solo alignment](#11-align-and-arrange)

### Frame Settings (main panel)
- **SIZE** — switch between px/cm. In cm mode, print-size buttons (A2–A5, Letter) and a dpi setting appear
- **STYLE** — fill and stroke toggle independently. Stroke has thickness and [color](#7-color) controls
- **GRID** — shows a layout grid inside the frame with margin, gutters, and rows/columns. Turn on **compression** to make row/column widths shrink progressively toward one side ({icon:compDir}) or from the center ({icon:compSym}). The grid is a screen guide only — it's not exported — and dragged objects [snap to its lines](#12-smart-guides-and-snapping)

---

## 10. Groups and Links

### {icon:group}Groups (⌘G / ⌘⇧G) — handle as one
- Grouped objects click, move, and [align](#11-align-and-arrange) as one block. Groups can be nested
- Select a group to rename it at the top of the panel

### {icon:link}Links — change shapes together
- Select two or more units and press link parameters in the panel's **LINK** section; from then on, changing one unit changes the linked units with it
- The chips (size · grid · shape · color · orientation) choose which properties stay in sync
- Linked units show a chain icon ({icon:link})
- **[Copied](#5-select-move-transform) units join the original's link.** To give the copies their own link: select just the copies and press any chip — they split off into a new link at that moment. The unlink parameters button removes only the selected units from the link

---

## 11. Align and Arrange

The align bar at the bottom left:

- **6 alignments** {icon:alignLeft}{icon:alignHCenter}{icon:alignRight}{icon:alignTop}{icon:alignVCenter}{icon:alignBottom}: left/center/right · top/middle/bottom — the reference is the [object you clicked again](#5-select-move-transform), or the selection's bounding box if none is set
- **2 distributions** {icon:distributeH}{icon:distributeV}: keeps both ends in place and evens out the gaps between
- {icon:frame}**Align to frame**: even with a single unit selected, if there is an [active frame](#9-frames) (or the frame holding that unit), alignment uses the frame — centering something in a frame is two clicks

---

## 12. Smart Guides and Snapping

Dragging an object gets automatic help:

- Near another object's **edges or center**, it snaps like a magnet and guide lines appear
- It also snaps to [frame layout grid](#9-frames) lines
- **Spacing match**: positions that repeat the gap between neighbors, and the midpoint between two objects, snap too
- **Snap to background grid**: [corner bar](#13-view-options-corner-bar) → {icon:mouseR}right-click the grid button → turn on Snap to grid to move in grid steps

---

## 13. View Options (Corner Bar)

| Button | {icon:mouseL}Left-click | {icon:mouseR}Right-click |
|---|---|---|
| {icon:canvasGrid}Background grid | Show/hide the grid | Background & grid colors (b/w) · grid size · snap to grid · reset |
| {icon:boxSelect}Selection box | Show/hide selection marks | Nudge distance · group outlines · link icon display |
| {icon:unitGrid}Unit/frame grids | Show/hide both grids at once (G) | Unit minimum size · thread minimum thickness · grid color · unit/frame grids individually |
| % badge | Back to 100% | [Frame-first switching level](#9-frames) |

- **Unit min / Thread min** — floors that keep units from getting smaller, and [threads (teeth)](#6-unit-parameters-main-panel) from being drawn thinner, than these values
- **Resource monitor** — {icon:mouseR}right-click the {icon:manual}help button to toggle. Shows object count, memory, and responsiveness

---

The **zoom % badge's {icon:mouseR}right-click menu** includes a **minimap** — your current view appears as a yellow rectangle over all objects, and clicking or **dragging** moves the view there. **Fit all objects** brings everything back into view (for when you lose your work off-screen).

## 14. Unit Presets

Save unit shapes you use often and bring them back anytime.

- {icon:presetAdd}**Register**: click a unit, then [{icon:mouseR}right-click menu](#5-select-move-transform) → Register unit preset
- **Use**: open the panel with the unit presets button (**U**) in the bottom-right preset bar, then **drag a card onto the canvas** to create it right where you drop it (double-click = center of the view)
- **Organize**: click a card to select it, **⇧click** for multi-select · drag onto another card to reorder, **drag onto a category card to move it inside** · double-click a name to rename · 2/3/4/6-column toggle at the top right
- **Categories**: `+ Category` creates one, click a category to open it, `← Back` returns to everything, `Move out` moves the selection out of its category. Search covers every category and shows a badge on results
- {icon:mouseR}**Right-click menu**: acts on the whole selection at once — Duplicate · Rename · Delete
- {icon:trash}**Delete**: click the × at a thumbnail's top right twice within 3 seconds (mistake-proofing)
- **Share**: the EXPORT/IMPORT JSON buttons move your preset collection as a file
- **Update**: drag a unit from the canvas onto a preset card to overwrite that preset with its current shape
- Register and delete can be undone with ⌘Z

---

## 15. Save · Open · Export

### Autosave
Your work keeps saving to the browser without you doing anything. Reload and the last state opens as-is.

### Save and open as a file (File bar)
- {icon:save}**Save** = download the whole workspace as a file (JSON), {icon:open}**Open** = load that file (even your view position is restored)
- **{icon:mouseR}Right-click** either button to choose what to save/load: **Work data** / **Tools setting** / **Viewport setting** — e.g. hand only your settings to a teammate
- Use this file to exchange work with other people

### Export
- **⇧E** or the {icon:mouseR}right-click menu = save the selection as an SVG file — multiple objects become one file with their layout intact, and [frames](#9-frames) include their contents
- **⌘C** = copy as SVG for pasting straight into Figma etc., **⌘⇧C** = copy as an image (PNG, 2× resolution)
- On-screen guide lines (unit/frame grids) are not included in exports

### Reset (File bar)
{icon:resetArrow}Clears everything back to the initial state. To prevent accidents it takes three clicks (the last step shows a {icon:tombstone}tombstone icon), and even afterwards ⌘Z can bring your work back.

---

## 16. Pattern Presets

Save a frame together with the unit layout inside it, and bring the whole thing back anytime — the frame-level counterpart of [unit presets](#14-unit-presets).

- {icon:patternAdd}**Register**: select a frame, then [{icon:mouseR}right-click menu](#5-select-move-transform) → Register pattern preset — the frame's settings and its units (layout, [groups and links](#10-groups-and-links) included) are saved under the frame's name
- {icon:layers}**Use**: open the panel with the pattern presets button (**P**), then **drag a card onto the canvas** to create the whole pattern where you drop it (double-click = center of the view). Selection, categories, search, and the right-click menu work exactly like [unit presets](#14-unit-presets)
- {icon:trash}**Delete**: click a card's × twice within 3 seconds (mistake-proofing)
- **Update**: drag a frame from the canvas onto a pattern card to overwrite that pattern with the frame's current state
- **Share**: the EXPORT/IMPORT JSON buttons move your pattern collection as a file
- Register and delete can be undone with ⌘Z

---

## 17. Animation Mode

Design motion using frames as keyframes. Toggle with **A** or the {icon:animation}animation button in the preset bar (bottom right) — the **Animation window** (simulation player) opens at the bottom left alongside.

- **Make a keyframe copy**: in animation mode, select a [frame](#9-frames) and a **dashed ▶ badge** appears at its top right. {icon:mouseL}Click it → **Make new keyframe** — a new keyframe copy is created beside it. The same button on an already-keyframed frame's ▶ badge makes another keyframe from that frame. The original becomes the start keyframe and the copy the end keyframe, with every unit inside paired one-to-one. Edit units in the copy to build the end state (pairs do **not** sync values — this is different from [links](#10-groups-and-links); ⌥+drag duplication is now always a plain copy)
- **Connect**: every frame shows round nodes on its left and right. **Drag the start frame's right node onto the end frame's left node** to connect them with a curved wire (default ease in-out · 1s). Each node holds one connection; dragging a connected node elsewhere moves it, and **dropping on empty space disconnects**
- **Timing**: click the {icon:animation}control at the middle of a wire to set that connection's **Duration (ms) and one of 9 speed-curve presets** (default ease in-out · 1s)
- **Simulation**: the Animation window plays/pauses by **clicking the preview**, with a time scrubber and **pingpong/cycle** modes (pingpong by default). Frame rate is selectable — **30 or 24fps** (playback & export). Export as **WebM or a PNG sequence (ZIP)**, with **scale (0.5/1/2×)**, **transparent background (PNG only)**, **end hold (ms)** and **×n cycles** (one pingpong cycle = a round trip); files are named `From→To_1000ms`. A **collapse toggle** right under the preview hides everything but the playback screen. Units outside the frame are clipped, so moving across the edge reads as entering/leaving the screen. Unpaired units fade in/out, and integer values like Cols **dissolve smoothly** between their two states
- Outside animation mode, **wires and pair marks remain in grey** (nodes and the timing control are hidden - editing only happens inside the mode). The Animation window can be **moved by dragging any empty area of it**, and resized with the **bottom-right grip** (locked to the current frame's ratio)
- **Keyframe cleanup**: {icon:mouseL}click the **▶ badge** at the frame's top right — **Delete keyframe** removes the frame with its units and connections in one go, while **Detach keyframe from chain** only drops the pairing and connections, keeping the layout as a normal frame. An existing keyframe can also be **⌥+dragged** to make another keyframe copy in the same lineage
- **Constraints**: paired objects cannot be deleted while in animation mode (unpair first). Selecting a **paired frame** shows a move-only outline instead of resize handles (resizing/rotating would desync the animation — unpaired frames behave as usual). The pair badge popup's **Select chain** selects every connected frame at once, and moving a paired frame carries its homed units along even when they sit outside the frame
