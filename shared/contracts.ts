import type { Configuration, Options } from './config'
export interface PricedOption {
  id: string
  label: string
  cents: number
  sku: string
  variantId: number
}
export interface Catalog {
  product: { id: string; name: string; sku: string; size: string }
  frame: PricedOption[]
  full: PricedOption[]
  half: PricedOption[]
  fees: { text: PricedOption; image: PricedOption }
  revision: string
}
export interface QuoteLine {
  label: string
  sku: string
  variantId: number
  count: number
  unitCents: number
  totalCents: number
}
export interface Quote {
  revision: string
  currency: 'USD'
  lines: QuoteLine[]
  quantity: number
  totalCents: number
}
export interface Preview {
  id: string
  jpeg: string
}
export interface ProofRef {
  id: string
  pdfUrl: string
  configUrl: string
  createdAt: string
}
export interface ProductionRecord extends ProofRef {
  configuration: Configuration
  quote: Quote
}
export interface CartItem {
  id: number
  quantity: number
  properties: Record<string, string>
}
export interface CartReceipt {
  id: string
  mode: 'mock'
  proof: ProofRef
  quote: Quote
  options: Options
  items: CartItem[]
}
