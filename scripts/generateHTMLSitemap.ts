import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';

// Load environment variables
dotenv.config();

// Define the Supabase client
const supabaseUrl = 'https://vctuoupvfzofjtteiolo.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

// Base site URL
const siteURL = 'https://pepsource.shop';

interface SitemapEntry {
  url: string;
  title: string;
  description: string;
  lastmod?: string;
  changefreq?: string;
  priority?: number;
  type: 'static' | 'drug' | 'vendor';
}

// Function to get metadata from JSON file
function getMetadataFromFile(): Record<string, { title: string; description: string; keywords: string; imageUrl: string }> {
  try {
    const metadataPath = path.resolve('public', 'seo-metadata.json');
    if (fs.existsSync(metadataPath)) {
      const metadataContent = readFileSync(metadataPath, 'utf8');
      return JSON.parse(metadataContent);
    }
    return {};
  } catch (error) {
    console.error('Error reading metadata file:', error);
    return {};
  }
}

// Function to get all sitemap entries
async function getAllEntries(): Promise<SitemapEntry[]> {
  const metadata = getMetadataFromFile();
  const entries: SitemapEntry[] = [];
  
  // Get all drugs
  const { data: drugs, error: drugsError } = await supabase
    .from('drugs')
    .select('name, proper_name, what_it_does, last_checked')
    .not('name', 'eq', '');

  if (drugsError) {
    console.error('Error fetching drugs:', drugsError);
  } else if (drugs) {
    // Add drug entries
    drugs.forEach(drug => {
      const url = `/${drug.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      entries.push({
        url,
        title: metadata[url]?.title || `${drug.proper_name || drug.name} - Research Chemical Information`,
        description: metadata[url]?.description || drug.what_it_does?.substring(0, 150) || '',
        lastmod: drug.last_checked || new Date().toISOString(),
        changefreq: 'weekly',
        priority: 0.7,
        type: 'drug'
      });
    });
  }

  // Get all vendors
  const { data: vendors, error: vendorsError } = await supabase
    .from('vendordetails')
    .select('name')
    .not('name', 'eq', '');

  if (vendorsError) {
    console.error('Error fetching vendors:', vendorsError);
  } else if (vendors) {
    // Add vendor entries
    vendors.forEach(vendor => {
      const url = `/${vendor.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      entries.push({
        url,
        title: metadata[url]?.title || `${vendor.name} - Vendor Profile`,
        description: metadata[url]?.description || `Information about ${vendor.name}, a vendor of research chemicals.`,
        lastmod: new Date().toISOString(),
        changefreq: 'weekly',
        priority: 0.6,
        type: 'vendor'
      });
    });
  }

  // Add static pages
  const staticPages = [
    {
      url: '/',
      title: 'PEPSource - Trusted Research Chemicals Information Portal',
      description: 'Find reliable information and vendors for research chemicals, peptides, and SARMs.',
      changefreq: 'daily',
      priority: 1.0
    },
    {
      url: '/listing',
      title: 'Complete Research Chemical Listing - PEPSource',
      description: 'Browse our comprehensive database of research chemicals with detailed information.',
      changefreq: 'daily',
      priority: 0.9
    },
    {
      url: '/search',
      title: 'Search Research Chemicals - PEPSource',
      description: 'Search our extensive database for specific research chemicals and peptides.',
      changefreq: 'weekly',
      priority: 0.8
    },
    {
      url: '/ai-search',
      title: 'AI-Powered Research Chemical Search - PEPSource',
      description: 'Use our advanced AI search to find detailed information about research chemicals.',
      changefreq: 'weekly',
      priority: 0.8
    },
    {
      url: '/contact',
      title: 'Contact PEPSource - Research Chemical Information Portal',
      description: 'Contact our team for questions about research chemicals or to suggest additions.',
      changefreq: 'monthly',
      priority: 0.6
    },
    {
      url: '/terms',
      title: 'Terms of Service - PEPSource',
      description: 'PEPSource terms of service for our research chemical information portal.',
      changefreq: 'monthly',
      priority: 0.4
    },
    {
      url: '/privacy',
      title: 'Privacy Policy - PEPSource',
      description: 'PEPSource privacy policy for our research chemical information portal.',
      changefreq: 'monthly',
      priority: 0.4
    }
  ];
  
  // Add static entries with metadata from file or defaults
  staticPages.forEach(page => {
    entries.push({
      url: page.url,
      title: metadata[page.url]?.title || page.title,
      description: metadata[page.url]?.description || page.description,
      lastmod: new Date().toISOString(),
      changefreq: page.changefreq,
      priority: page.priority,
      type: 'static'
    });
  });

  return entries;
}

// Generate HTML sitemap
async function generateHTMLSitemap() {
  try {
    const entries = await getAllEntries();
    
    // Sort entries
    entries.sort((a, b) => {
      // Sort by type first (static, drug, vendor)
      if (a.type !== b.type) {
        const typeOrder = { static: 0, drug: 1, vendor: 2 };
        return typeOrder[a.type] - typeOrder[b.type];
      }
      // Then by URL alphabetically
      return a.url.localeCompare(b.url);
    });

    // Generate HTML
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="index, follow">
  <title>PEPSource - Complete Site Index</title>
  <style>
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    h1 { 
      color: #2C3E50;
      margin-bottom: 30px;
      border-bottom: 1px solid #eee;
      padding-bottom: 10px;
    }
    h2 {
      color: #2C3E50;
      margin-top: 40px;
      margin-bottom: 20px;
      border-bottom: 1px solid #eee;
      padding-bottom: 10px;
    }
    .sitemap-section {
      margin-bottom: 40px;
    }
    .entry {
      margin-bottom: 25px;
      padding-bottom: 15px;
      border-bottom: 1px solid #f5f5f5;
    }
    .entry h3 {
      margin-bottom: 5px;
      color: #3498db;
    }
    .entry h3 a {
      color: #3498db;
      text-decoration: none;
    }
    .entry h3 a:hover {
      text-decoration: underline;
    }
    .entry p {
      margin: 0;
      color: #666;
    }
    .entry .meta {
      margin-top: 8px;
      font-size: 12px;
      color: #999;
    }
    .tag {
      display: inline-block;
      background: #f5f5f5;
      padding: 2px 8px;
      border-radius: 3px;
      font-size: 12px;
      margin-right: 5px;
      color: #666;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
      gap: 20px;
    }
  </style>
</head>
<body>
  <header>
    <h1>PEPSource Complete Site Index</h1>
    <p>This page provides a complete index of all content available on PEPSource.</p>
  </header>
  
  <main>
    <section class="sitemap-section">
      <h2>Main Pages</h2>
      <div class="entries">
${entries
  .filter(entry => entry.type === 'static')
  .map(entry => `
        <div class="entry">
          <h3><a href="${siteURL}${entry.url}">${entry.title}</a></h3>
          <p>${entry.description}</p>
          <div class="meta">
            <span class="tag">Priority: ${entry.priority}</span>
            <span class="tag">Updated: ${formatDate(entry.lastmod)}</span>
          </div>
        </div>
  `).join('')}
      </div>
    </section>

    <section class="sitemap-section">
      <h2>Research Chemicals</h2>
      <p>Browse our comprehensive database of research chemicals.</p>
      <div class="grid">
${entries
  .filter(entry => entry.type === 'drug')
  .map(entry => `
        <div class="entry">
          <h3><a href="${siteURL}${entry.url}">${entry.title}</a></h3>
          <p>${entry.description}</p>
          <div class="meta">
            <span class="tag">Last updated: ${formatDate(entry.lastmod)}</span>
          </div>
        </div>
  `).join('')}
      </div>
    </section>

    <section class="sitemap-section">
      <h2>Vendors</h2>
      <p>Browse our database of research chemical vendors.</p>
      <div class="grid">
${entries
  .filter(entry => entry.type === 'vendor')
  .map(entry => `
        <div class="entry">
          <h3><a href="${siteURL}${entry.url}">${entry.title}</a></h3>
          <p>${entry.description}</p>
          <div class="meta">
            <span class="tag">Last updated: ${formatDate(entry.lastmod)}</span>
          </div>
        </div>
  `).join('')}
      </div>
    </section>
  </main>
  
  <footer>
    <p>© ${new Date().getFullYear()} PEPSource. Last updated: ${new Date().toLocaleDateString()}</p>
  </footer>
</body>
</html>
    `;

    // Write HTML sitemap
    fs.writeFileSync(path.join('public', 'sitemap.html'), html);
    console.log('HTML sitemap generated successfully!');

  } catch (error) {
    console.error('Error generating HTML sitemap:', error);
  }
}

// Helper function to format date
function formatDate(dateString?: string): string {
  if (!dateString) return 'N/A';
  
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  } catch {
    return dateString;
  }
}

// Generate the HTML sitemap
generateHTMLSitemap(); 