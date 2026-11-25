import { canopyProduct } from '../shared/config'
import type { Catalog, PricedOption } from '../shared/contracts'

const option = (
  id: string,
  label: string,
  cents: number,
  sku: string,
  variantId: number,
): PricedOption => ({ id, label, cents, sku, variantId })
// Demo variant IDs and USD minor units. Replace this catalogue adapter with the merchant's price service.
export const catalog: Catalog = {
  revision: 'fieldwork-usd-v1',
  product: canopyProduct,
  frame: [
    option('standard', 'Standard aluminum frame', 84900, 'C10-STANDARD', 9010001),
    option('fabric', 'Canopy only', 49900, 'C10-FABRIC', 9010002),
    option('light', 'Light-up frame', 109900, 'C10-LIGHT', 9010003),
  ],
  full: [
    option('none', 'No full walls', 0, '', 0),
    option('one-single', '1 full wall · single-sided', 14900, 'W1-S', 9010010),
    option('three-single', '3 full walls · single-sided', 39900, 'W3-S', 9010011),
    option('one-double', '1 full wall · double-sided', 21900, 'W1-D', 9010012),
    option('three-double', '3 full walls · double-sided', 57900, 'W3-D', 9010013),
  ],
  half: [
    option('none', 'No half walls', 0, '', 0),
    option('pair-single', '2 half walls · single-sided', 15900, 'H2-S', 9010020),
    option('pair-double', '2 half walls · double-sided', 23900, 'H2-D', 9010021),
  ],
  fees: {
    text: option('text', 'Custom text placements', 800, 'PRINT-TEXT', 9010030),
    image: option('image', 'Uploaded artwork placements', 1800, 'PRINT-IMAGE', 9010031),
  },
}
