# Intracely Design System

## Stack
- Tailwind CSS v3
- Lucide React (icons)
- No external component library — everything custom

---

## Colors

### Primary
```
blue-600  #2563eb  — primary buttons, links, active states
blue-50   #eff6ff  — light backgrounds, hover states
blue-100  #dbeafe  — badges, highlights
blue-700  #1d4ed8  — hover on primary button
```

### Text
```
gray-900  #111827  — headings, important text
gray-700  #374151  — body text, labels
gray-500  #6b7280  — secondary text, subtitles
gray-400  #9ca3af  — placeholder, muted text
gray-300  #d1d5db  — disabled text
```

### Backgrounds
```
white     #ffffff  — cards, modals, inputs
gray-50   #f9fafb  — page background, table header
gray-100  #f3f4f6  — hover states
```

### Borders
```
gray-200  #e5e7eb  — cards, inputs, tables
gray-100  #f3f4f6  — dividers, subtle borders
```

### Status colors
```
green-100 / green-700   — active, success, closed
amber-100 / amber-700   — issued, warning
blue-100  / blue-700    — sent, info
red-100   / red-600     — cancelled, danger
gray-100  / gray-600    — draft, inactive
purple-50 / purple-600  — open POs
```

---

## Typography

```
Page title:       text-2xl font-bold text-gray-900
Section title:    text-sm font-semibold text-gray-700
Card subtitle:    text-sm text-gray-500 mt-1
Label:            text-sm font-medium text-gray-700
Body:             text-sm text-gray-600
Muted / meta:     text-xs text-gray-400
Table header:     text-xs font-medium text-gray-500 uppercase tracking-wide
Monospace:        font-mono (PO numbers, item codes)
```

---

## Spacing & Layout

```
Page padding:     p-4 lg:p-6
Max width app:    max-w-6xl mx-auto
Max width forms:  max-w-3xl mx-auto
Card padding:     p-5 or p-6
Section gap:      gap-4 or gap-5
Grid gap:         gap-3 lg:gap-4
Sidebar width:    240px (w-60)
```

---

## Border Radius

```
Inputs, buttons:  rounded-lg   (8px)
Cards, modals:    rounded-xl   (12px)
Badges, tags:     rounded-full
Small elements:   rounded-md   (6px)
```

---

## Shadows

```
Cards:    no shadow (border only)
Modals:   shadow-lg
Dropdowns: shadow-lg
Sticky nav: shadow-sm or border-b
```

---

## Components

### Buttons

```html
<!-- Primary -->
<button class="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60">

<!-- Secondary -->
<button class="border border-gray-200 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">

<!-- Danger -->
<button class="bg-red-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-red-700 transition-colors">
```

### Inputs

```html
<input class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
```

### Cards

```html
<div class="bg-white rounded-xl border border-gray-200 p-5">
```

### Table

```html
<div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
  <div class="overflow-x-auto">
    <table class="w-full text-sm">
      <thead class="bg-gray-50 border-b border-gray-100">
        <tr>
          <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
      <tbody class="divide-y divide-gray-50">
        <tr class="hover:bg-gray-50 transition-colors">
          <td class="px-4 py-3 text-gray-600">
```

### Badges / Status pills

```html
<!-- Green -->
<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">

<!-- Amber -->
<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">

<!-- Blue -->
<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">

<!-- Gray -->
<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
```

### Modal

```html
<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
  <div class="bg-white rounded-2xl shadow-lg w-full max-w-md p-6">
```

### Section header (in tables/cards)

```html
<div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
  <h2 class="text-sm font-semibold text-gray-700">Title</h2>
```

### Empty state

```html
<div class="flex flex-col items-center justify-center h-48 text-center">
  <Icon class="w-10 h-10 text-gray-200 mb-3" />
  <p class="text-sm text-gray-400">No data</p>
```

### Search input

```html
<div class="relative">
  <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
  <input class="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
```

---

## Navigation / Sidebar

```
Width:          w-60 (240px)
Background:     white
Border:         border-r border-gray-100
Nav item:       px-3 py-2 rounded-lg text-sm
Active item:    bg-blue-50 text-blue-700 font-medium
Inactive item:  text-gray-600 hover:bg-gray-50
Icon size:      w-4 h-4
```

---

## Forms

```
Grid:           grid grid-cols-1 sm:grid-cols-2 gap-4
Label margin:   mb-1
Required mark:  append " *" to label text
Error text:     text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2
```

---

## Responsive Breakpoints (Tailwind defaults)

```
sm:   640px   — tablets portrait
md:   768px   — tablets landscape
lg:   1024px  — desktop
xl:   1280px  — wide desktop
```

### Mobile patterns used:
- Sidebar: hidden on mobile, drawer on md+
- Tables: overflow-x-auto with min-w
- Grids: grid-cols-1 → sm:grid-cols-2 → lg:grid-cols-4
- Buttons: sticky bottom bar on mobile for forms

---

## Charts (Recharts)

```
Colors:       ['#2563eb','#3b82f6','#60a5fa','#93c5fd','#1d4ed8','#1e40af','#7c3aed','#8b5cf6']
Tick style:   { fontSize: 12, fill: '#374151' }
Label style:  { fontSize: 13, fill: '#374151', fontWeight: 600 }
Bar radius:   [0, 4, 4, 0] (horizontal), [4, 4, 0, 0] (vertical)
Grid:         CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6"
Tooltip:      bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2
```

---

## Icons

Library: **Lucide React**

```
Standard size:  w-4 h-4
Large:          w-5 h-5
Extra large:    w-6 h-6
Empty states:   w-10 h-10 text-gray-200
```

---

## Logo / Brand

- App name: **Intracely**
- Logo: Isometric 3D box (custom SVG), blue-600 background
- Font in logo: font-bold tracking-tight

---

## Tone / UX principles

- Clean, minimal — no unnecessary decorations
- Data-dense but readable
- Mobile-first responsive
- Slovenian + English (i18n)
- Vikanje (formal "you") in Slovenian
