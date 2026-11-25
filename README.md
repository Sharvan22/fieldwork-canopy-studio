# Fieldwork Canopy Studio

A React and TypeScript configurator for a 10 × 10 ft event canopy. Edit four roof faces and four valances, add single- or double-sided walls, and build a priced Shopify cart payload with a production proof.

## Run the demo

The ZIP includes a compiled client and server. Extract it and run `node dist/server.mjs` from the extracted project with **Node 20.19 or later**. On Windows, double-click **Start Demo.cmd**. Open [the studio](http://127.0.0.1:4173/) or [the iframe demonstration](http://127.0.0.1:4173/embed-demo.html). The demo runs locally and has no runtime dependency on a CDN, API key or Shopify account.

To start the development server, run the following from the project directory.

```sh
npm ci
npm run dev
```

The development server prints its URL. The built server defaults to port 4173. For a hosted Node service, use `npm ci && npm run build` as the build command, `npm start` as the start command, `HOST=0.0.0.0` and the host's `PORT`. Set `PUBLIC_ORIGIN` to the external HTTPS origin so order links use the correct host. Mount a persistent volume at `STUDIO_DATA_DIR` (default `.data/`) for artwork, configuration records, PDFs and cart receipts. Git ignores local data, dependencies and generated builds.

## Try a complete order

1. Choose a side in **Panel navigator** and a surface in **Print section**. Change its color. Add text or a PNG, JPEG or WebP image.
2. Drag the artwork in **2D editor**, or enter position, width and rotation in the layer settings. Switch to **3D view** to inspect the same design. Undo and redo include a complete drag as one edit.
3. Select a frame, wall package and quantity under **Build options**. Inspect the price breakdown. Double-sided walls expose a separate inside print surface.
4. Choose **Export PDF** or **Add to cart**. The demo cart exposes the saved design JSON, PDF and Shopify payload. An example exported by the application is included in `examples/production-proof.pdf`.

## Architecture

On Netlify, import the project root from GitHub. The included netlify.toml defines the build, publish directory and API function. The function stores uploads, configuration records, PDFs and receipts in Netlify Blobs. The mock Shopify integration requires no merchant credentials.

| Location | Responsibility |
| --- | --- |
| `shared/artwork.ts` | Reusable print surface, panel and layer contracts. Layers store center X/Y, width as a fraction of panel width, and rotation in degrees. |
| `shared/config.ts` | The canopy product definition, option validation, active surface geometry and default design. Each panel is keyed by a stable mesh/surface ID. |
| `src/art/` | The editor, 3D textures, thumbnails and PDF panel previews use the same canvas compositor. Roofs clip artwork to their triangular print area. |
| `src/preview/` | Three.js adapter for the supplied GLB, wall geometry and camera controls. The renderer loads on demand, caps pixel density and redraws on changes. A software renderer supports browsers without WebGL. |
| `server/catalog.ts`, `server/pricing.ts` | Versioned example prices, variant mapping and an asynchronous pricing-service interface. Quotes use integer cents and charge only placements on active surfaces. |
| `server/api.ts`, `server/store.ts` | Fetch-based HTTP handlers and a replaceable object store. The Node adapter writes immutable proofs and content-addressed original uploads to disk. |
| `server/pdf.ts`, `server/shopify.ts` | Generate the production packet and map an authoritative quote to cart variant lines. |

The browser keeps a versioned draft and local cart references. Original uploads stay in the object store. Device-local artwork edits reuse cached canvases and images. Price requests are debounced, stale responses are discarded, and checkout recalculates the quote from the saved configuration. For another product, supply its options, surface descriptors and preview-to-surface mapping. The flat artwork editor and compositor work with the shared print-surface contract.

## Pricing, Shopify and order proofs

`GET /api/catalog` provides the price list. `POST /api/quotes` accepts a configuration and returns itemized USD totals. The standard frame starts at **$849**. Text costs **$8** and uploaded art costs **$18** per placement per canopy. These are demo rates. Built-in studio graphics and fabric colors are included.

`POST /api/configurations` saves an immutable JSON record and a PDF under one UUID. The PDF includes a rendered canopy, active flat panel proofs, layer transforms, filenames, colors, options, quantities and price lines. The exact JSON is also attached inside the PDF. Previews are visual approvals rendered by the customer session. The supplied 8-foot GLB was adapted to a 10-foot footprint for this demonstration. Manufacturing dimensions and print dielines require the supplier's specifications.

`POST /api/cart` accepts a configuration UUID and an idempotency key. Its response contains separately priced base, wall and print-service variants, plus private Shopify line properties linking to the JSON and PDF. A repeated submission with the same keys returns the same receipt.

The iframe emits a versioned `fieldwork-studio` message of type `cart:add` to its embedding origin. The example host verifies both the origin and sending frame. To connect a store, map the catalog to real merchant variant IDs and prices, place `examples/shopify-section.liquid` in the theme, configure the studio URL and enable the section's cart switch. Shopify determines actual charges from variant prices. The theme uses the storefront's locale-aware Ajax Cart endpoint. [Shopify Cart API](https://shopify.dev/docs/api/ajax/reference/cart)

An order-created webhook can read `_configuration_id` from a line item to retrieve the original artwork and archive the proof against the order. A live merchant integration should validate the complete group of product and service variants at checkout.

## Verification

`npm test` runs pricing, validation, upload and cart replay checks. For browser tests, run `npx playwright install chromium` followed by `npm run test:browser`. Set `STUDIO_BROWSER=chrome` to use an installed Chrome. Tests exercise 2D dragging, model updates, upload, pricing, draft reload, PDF export, an iframe on a second origin and the WebGL fallback.

The prepared 849 KB GLB is checked in. `tools/prepare_model.py` rebuilds it from the supplied ZIP using NumPy and Pillow. The original reference informed the frame and wall selection flow. [Reference product](https://mvpvisuals.com/products/10x10-custom-canopy-tent)

