# Sitemap Generator

This directory contains scripts for generating the sitemap.xml file for the website.

## Sitemap Generator Script

The `generateSitemap.ts` file is a TypeScript script that generates a sitemap.xml file for the website. This sitemap helps search engines like Google discover and index all pages on the site.

### Features

- Generates sitemap.xml with static and dynamic routes
- Includes all drug pages from the database (e.g., `/tamoxifen`, `/bpc-157`)
- Includes all vendor pages from the database (e.g., `/eros-peptides`, `/peptidesciences`)
- Sets proper changefreq and priority values for each page
- Adds lastmod dates based on database timestamps when available

### How to Run

To generate the sitemap, run:

```bash
npm run generate-sitemap
```

This will create or update the `public/sitemap.xml` file.

### Configuration

The script is configured to use:

1. Static routes defined in the `getStaticRoutes()` function
2. Dynamic routes from the Supabase database:
   - Drug pages from the `drugs` table - directly at root path (e.g., `/tamoxifen`)
   - Vendor pages from the `vendordetails` table - directly at root path (e.g., `/eros-peptides`)

### Automating Sitemap Generation

The sitemap generation is now included in the build process:

```json
"scripts": {
  "build": "tsc -b && npm run generate-sitemap && vite build"
}
```

This ensures your sitemap is always up-to-date with the latest content from your database whenever you build the site.

### Submitting to Search Engines

After generating your sitemap:

1. Upload it to Google Search Console: https://search.google.com/search-console
2. The robots.txt file already includes a reference to the sitemap

## robots.txt

The `robots.txt` file in the public directory tells search engines which pages they should and shouldn't crawl. It also points to the sitemap.xml file. 