/** How tiles share the stage. Portrait frames stay tall; 3 people never leave an empty cell. */

export function tileClass({ off = false, aspect = 'landscape', pinned = false, feature = false, rail = false, pressable = false }) {
  return [
    'meet-tile',
    off ? 'is-off' : '',
    aspect === 'portrait' ? 'orient-portrait' : 'orient-landscape',
    pinned ? 'is-pinned' : '',
    feature ? 'is-feature' : '',
    rail ? 'is-rail' : '',
    pressable ? 'is-pressable' : ''
  ].filter(Boolean).join(' ')
}

function mostlyPortrait(ids, aspects) {
  const known = ids.filter((id) => aspects[id] === 'portrait').length
  return known > 0 && known * 2 >= ids.length
}

function equalShape(count, portraitMajority, stacked) {
  if (count <= 1) return { mode: 'equal', cols: 1, rows: 1 }
  if (count === 2) {
    if (stacked && !portraitMajority) return { mode: 'equal', cols: 1, rows: 2 }
    return { mode: 'equal', cols: 2, rows: 1 }
  }
  if (count === 4) {
    if (portraitMajority && !stacked) return { mode: 'equal', cols: 4, rows: 1 }
    return { mode: 'equal', cols: 2, rows: 2 }
  }
  if (count === 5 && !stacked && !portraitMajority) return { mode: 'five' }
  if (stacked) return { mode: 'equal', cols: 2, rows: Math.ceil(count / 2) }
  if (portraitMajority) {
    const cols = count <= 6 ? count : 4
    return { mode: 'equal', cols, rows: Math.ceil(count / cols) }
  }
  if (count <= 6) return { mode: 'equal', cols: 3, rows: 2 }
  if (count <= 9) return { mode: 'equal', cols: 3, rows: Math.ceil(count / 3) }
  return { mode: 'equal', cols: 4, rows: Math.ceil(count / 4) }
}

function spotlightWeights({ featurePortrait, rails, aspects, stacked, stageW, stageH }) {
  const railCount = Math.max(1, rails.length)
  if (!(stageW > 0 && stageH > 0)) {
    return stacked
      ? { feature: featurePortrait ? 2.4 : 1.7, rail: 1, railCols: Math.min(railCount, 2), railRows: Math.ceil(railCount / Math.min(railCount, 2)) }
      : { feature: featurePortrait ? 1 : 2.3, rail: 1, railCols: railCount > 4 ? 2 : 1, railRows: railCount > 4 ? Math.ceil(railCount / 2) : railCount }
  }

  if (stacked) {
    const railCols = Math.min(railCount, stageW < 520 ? 2 : 3)
    const railRows = Math.ceil(railCount / railCols)
    const railAspect = rails.some((id) => aspects[id] === 'portrait') ? 9 / 16 : 16 / 9
    const thumbH = Math.min(stageH * 0.28, (stageW / railCols) / railAspect)
    const band = Math.max(thumbH * railRows, stageH * 0.22)
    const featureBand = Math.max(stageH - band, stageH * 0.48)
    return { feature: featureBand, rail: band / railRows, railCols, railRows }
  }

  const railCols = railCount > 4 ? 2 : 1
  const railRows = Math.ceil(railCount / railCols)
  let fw = stageH * (featurePortrait ? 9 / 16 : 16 / 9)
  let rw = 0
  for (const id of rails) {
    const tileAspect = aspects[id] === 'portrait' ? 9 / 16 : 16 / 9
    rw = Math.max(rw, (stageH / railRows) * tileAspect)
  }
  rw = Math.max(rw, stageW * 0.2)
  const sum = fw + rw
  if (sum > stageW) {
    const scale = stageW / sum
    fw *= scale
    rw *= scale
  }
  const leftover = Math.max(0, stageW - fw - rw)
  fw += leftover * (featurePortrait ? 0.42 : 0.72)
  rw += leftover * (featurePortrait ? 0.58 : 0.28)
  const cap = featurePortrait ? 0.62 : 0.78
  if (fw / (fw + rw) > cap) {
    const next = cap * (fw + rw)
    rw += fw - next
    fw = next
  }
  return { feature: fw, rail: rw, railCols, railRows }
}

export function planGrid({ ids, aspects = {}, pinnedId = null, stageW = 0, stageH = 0 }) {
  const count = ids.length
  const stacked = stageH > stageW && stageW > 0
  const portraitMajority = mostlyPortrait(ids, aspects)
  const pin = pinnedId && ids.includes(pinnedId) ? pinnedId : null
  const autoFeature = count === 3 ? (ids.find((id) => id !== 'local') || ids[0]) : null
  const featureId = count >= 2 && (pin || (count === 3 && autoFeature)) ? (pin || autoFeature) : null

  if (!featureId) {
    return {
      ...equalShape(count, portraitMajority, stacked),
      featureId: null,
      pinnedId: pin,
      stacked
    }
  }

  const rails = ids.filter((id) => id !== featureId)
  const weights = spotlightWeights({
    featurePortrait: aspects[featureId] === 'portrait',
    rails,
    aspects,
    stacked,
    stageW,
    stageH
  })

  return {
    mode: 'spotlight',
    featureId,
    pinnedId: pin,
    stacked,
    ...weights
  }
}
