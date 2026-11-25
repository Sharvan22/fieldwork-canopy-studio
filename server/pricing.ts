import { activeSurfaces, panelFor, type Configuration } from '../shared/config'
import type { Catalog, PricedOption, Quote, QuoteLine } from '../shared/contracts'

import { catalog } from './catalog'
export { catalog } from './catalog'

export interface PricingService {
  getCatalog(): Promise<Catalog>
  quote(config: Configuration): Promise<Quote>
}
export const demoPricing: PricingService = {
  async getCatalog() {
    return catalog
  },
  async quote(config) {
    return quoteConfiguration(config)
  },
}
export function quoteConfiguration(config: Configuration, prices = catalog): Quote {
  const lines: QuoteLine[] = []
  const append = (item: PricedOption, placements = 1) => {
    const count = placements * config.quantity
    if (count && item.cents)
      lines.push({
        sku: item.sku,
        label: item.label,
        variantId: item.variantId,
        count,
        unitCents: item.cents,
        totalCents: count * item.cents,
      })
  }
  for (const key of ['frame', 'full', 'half'] as const)
    append(prices[key].find((op) => op.id === config.options[key])!)
  const counts = { text: 0, image: 0 }
  for (const surface of activeSurfaces(config.options)) {
    for (const layer of panelFor(config, surface.id).layers)
      if (layer.type !== 'mark') counts[layer.type]++
  }
  append(prices.fees.text, counts.text)
  append(prices.fees.image, counts.image)
  return {
    revision: prices.revision,
    currency: 'USD',
    lines,
    quantity: config.quantity,
    totalCents: lines.reduce((s, l) => s + l.totalCents, 0),
  }
}
