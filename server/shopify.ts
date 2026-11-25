import type { CartReceipt, ProductionRecord, Quote } from '../shared/contracts'

/** Shopify charges the base and service variants. Line properties carry proof references. */
export function mockShopifyCart(
  record: ProductionRecord,
  quote: Quote,
  requestId: string,
  origin: string,
): CartReceipt {
  const { id, configUrl, pdfUrl, createdAt } = record
  return {
    id: requestId,
    mode: 'mock',
    proof: { id, configUrl, pdfUrl, createdAt },
    quote,
    options: record.configuration.options,
    items: quote.lines.map((line) => ({
      id: line.variantId,
      quantity: line.count,
      properties: {
        _configuration_id: id,
        _configuration_url: new URL(configUrl, origin).href,
        _production_pdf: new URL(pdfUrl, origin).href,
        _quote_revision: quote.revision,
        _quoted_total_usd: (quote.totalCents / 100).toFixed(2),
        _component_sku: line.sku,
      },
    })),
  }
}
