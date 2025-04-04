import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Define the Supabase client
const supabaseUrl = 'https://vctuoupvfzofjtteiolo.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

// Define the types
type SitemapURL = {
  loc: string;
  lastmod?: string;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
};

interface TableSchema {
  nameField: string;
  dateField?: string;
  idField?: string;
}

// Base site URL
const siteURL = 'https://pepsource.shop';

// Function to get the static routes
function getStaticRoutes(): SitemapURL[] {
  return [
    {
      loc: '/',
      changefreq: 'daily',
      priority: 1
    },
    {
      loc: '/listing',
      changefreq: 'daily',
      priority: 0.9
    },
    {
      loc: '/login',
      changefreq: 'monthly',
      priority: 0.7
    },
    {
      loc: '/signup',
      changefreq: 'monthly',
      priority: 0.7
    },
    {
      loc: '/forgot-password',
      changefreq: 'monthly',
      priority: 0.5
    },
    {
      loc: '/profile',
      changefreq: 'monthly',
      priority: 0.6
    },
    {
      loc: '/subscription',
      changefreq: 'monthly',
      priority: 0.6
    },
    {
      loc: '/payment-methods',
      changefreq: 'monthly',
      priority: 0.6
    },
    {
      loc: '/cancel-subscription',
      changefreq: 'monthly',
      priority: 0.5
    },
    {
      loc: '/terms',
      changefreq: 'monthly',
      priority: 0.4
    },
    {
      loc: '/privacy',
      changefreq: 'monthly',
      priority: 0.4
    },
    {
      loc: '/contact',
      changefreq: 'monthly',
      priority: 0.6
    },
    {
      loc: '/search',
      changefreq: 'weekly',
      priority: 0.8
    },
    {
      loc: '/ai-search',
      changefreq: 'weekly',
      priority: 0.8
    }
  ];
}

// Function to detect available columns in a table
async function detectTableSchema(tableName: string): Promise<TableSchema | null> {
  try {
    // Get a single row to detect available columns
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .limit(1);

    if (error || !data || data.length === 0) {
      console.error(`Error detecting schema for ${tableName}:`, error);
      return null;
    }

    const sampleRow = data[0];
    const schema: TableSchema = { nameField: 'name' }; // Default
    
    // Look for ID field
    const idFields = ['id', 'uuid', 'drug_id', 'vendor_id'];
    for (const field of idFields) {
      if (field in sampleRow) {
        schema.idField = field;
        break;
      }
    }
    
    // Look for date fields for lastmod
    const dateFields = ['updated_at', 'created_at', 'last_checked', 'last_updated', 'modified_at'];
    for (const field of dateFields) {
      if (field in sampleRow) {
        schema.dateField = field;
        break;
      }
    }
    
    // Look for name fields
    const nameFields = ['name', 'proper_name', 'title', 'display_name'];
    for (const field of nameFields) {
      if (field in sampleRow) {
        schema.nameField = field;
        break;
      }
    }
    
    console.log(`Detected schema for ${tableName}:`, schema);
    return schema;
  } catch (error) {
    console.error(`Error detecting schema for ${tableName}:`, error);
    return null;
  }
}

// Function to get dynamic routes from Supabase
async function getDynamicRoutes(): Promise<SitemapURL[]> {
  try {
    const dynamicRoutes: SitemapURL[] = [];

    // Detect schemas
    const drugsSchema = await detectTableSchema('drugs');
    const vendorsSchema = await detectTableSchema('vendordetails');

    if (drugsSchema) {
      // Build the select query based on detected schema
      let selectFields = drugsSchema.nameField;
      if (drugsSchema.dateField) {
        selectFields += `, ${drugsSchema.dateField}`;
      }
      if (drugsSchema.idField && drugsSchema.idField !== drugsSchema.nameField) {
        selectFields += `, ${drugsSchema.idField}`;
      }

      // Get all drugs with detected fields
      const { data: drugs, error: drugsError } = await supabase
        .from('drugs')
        .select(selectFields)
        .not(drugsSchema.nameField, 'eq', '');

      if (drugsError) {
        console.error('Error fetching drugs:', drugsError);
      } else if (drugs) {
        // Create dynamic routes for drugs
        drugs.forEach(drug => {
          const name = drug[drugsSchema.nameField];
          const lastmod = drugsSchema.dateField ? drug[drugsSchema.dateField] : null;
          
          dynamicRoutes.push({
            loc: `/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
            changefreq: 'weekly',
            priority: 0.7,
            lastmod: lastmod || new Date().toISOString()
          });
        });
      }
    }

    if (vendorsSchema) {
      // Build the select query based on detected schema
      let selectFields = vendorsSchema.nameField;
      if (vendorsSchema.dateField) {
        selectFields += `, ${vendorsSchema.dateField}`;
      }
      if (vendorsSchema.idField && vendorsSchema.idField !== vendorsSchema.nameField) {
        selectFields += `, ${vendorsSchema.idField}`;
      }

      // Get all vendors with detected fields
      const { data: vendors, error: vendorsError } = await supabase
        .from('vendordetails')
        .select(selectFields)
        .not(vendorsSchema.nameField, 'eq', '');

      if (vendorsError) {
        console.error('Error fetching vendors:', vendorsError);
      } else if (vendors) {
        // Create dynamic routes for vendors
        vendors.forEach(vendor => {
          const name = vendor[vendorsSchema.nameField];
          const lastmod = vendorsSchema.dateField ? vendor[vendorsSchema.dateField] : null;
          
          dynamicRoutes.push({
            loc: `/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
            changefreq: 'weekly',
            priority: 0.6,
            lastmod: lastmod || new Date().toISOString()
          });
        });
      }
    }

    return dynamicRoutes;
  } catch (error) {
    console.error('Error getting dynamic routes:', error);
    return [];
  }
}

// Function to generate sitemap
async function generateSitemap() {
  try {
    // Get static and dynamic routes
    const staticRoutes = getStaticRoutes();
    const dynamicRoutes = await getDynamicRoutes();

    // Combine routes
    const allRoutes = [...staticRoutes, ...dynamicRoutes];

    // Generate XML
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    // Add URLs to XML
    allRoutes.forEach(route => {
      xml += '  \n    <url>\n';
      xml += `      <loc>${siteURL}${route.loc}</loc>\n`;
      if (route.lastmod) {
        xml += `      <lastmod>${route.lastmod}</lastmod>\n`;
      }
      if (route.changefreq) {
        xml += `      <changefreq>${route.changefreq}</changefreq>\n`;
      }
      if (route.priority !== undefined) {
        xml += `      <priority>${route.priority}</priority>\n`;
      }
      xml += '    </url>\n';
    });

    xml += '</urlset>';

    // Ensure the public directory exists
    const publicDir = path.resolve('public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    // Write the sitemap to a file
    fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), xml);

    console.log('Sitemap generated successfully!');
    console.log(`Total URLs: ${allRoutes.length}`);
    console.log(`Static URLs: ${staticRoutes.length}`);
    console.log(`Dynamic URLs: ${dynamicRoutes.length}`);

  } catch (error) {
    console.error('Error generating sitemap:', error);
  }
}

// Generate the sitemap
generateSitemap(); 