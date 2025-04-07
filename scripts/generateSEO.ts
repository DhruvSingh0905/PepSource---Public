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

// Define the SEO metadata type with index signature
type SEOMetadata = {
  path: string;
  title: string;
  description: string;
  keywords?: string[];
  imageUrl?: string;
};

// Function to generate SEO metadata for static routes
function getStaticRoutesMetadata(): SEOMetadata[] {
  return [
    {
      path: '/',
      title: 'PepSource - Trusted Research Chemicals Information Portal',
      description: 'Find reliable information and vendors for research chemicals, peptides, and SARMs. Compare quality, pricing, and testing certifications.',
      keywords: ['research chemicals', 'peptides', 'SARMs', 'vendor comparison']
    },
    {
      path: '/listing',
      title: 'Complete Research Chemical Listing - PepSource',
      description: 'Browse our comprehensive database of research chemicals, peptides, and SARMs with detailed information on effects, mechanisms of action, and trusted vendors.',
      keywords: ['research chemicals list', 'peptides catalog', 'SARMs directory']
    },
    {
      path: '/search',
      title: 'Search Research Chemicals - PepSource',
      description: 'Search our extensive database for specific research chemicals, peptides, and SARMs. Find detailed information and trusted vendors.',
      keywords: ['search research chemicals', 'find peptides', 'SARM information']
    },
    {
      path: '/ai-search',
      title: 'AI-Powered Research Chemical Search - PepSource',
      description: 'Use our advanced AI search to find detailed information about research chemicals, peptides, and SARMs with natural language queries.',
      keywords: ['AI research chemical search', 'advanced peptide finder', 'natural language search']
    },
    {
      path: '/contact',
      title: 'Contact PepSource - Research Chemical Information Portal',
      description: 'Contact our team for questions about research chemicals, peptides, SARMs, or to suggest additions to our database.',
      keywords: ['contact', 'research chemical information', 'support']
    },
    {
      path: '/terms',
      title: 'Terms of Service - PepSource',
      description: 'PepSource terms of service for our research chemical information portal. Read about the terms governing your use of our website.',
      keywords: ['terms of service', 'terms and conditions', 'legal']
    },
    {
      path: '/privacy',
      title: 'Privacy Policy - PepSource',
      description: 'PepSource privacy policy for our research chemical information portal. Learn how we handle and protect your data.',
      keywords: ['privacy policy', 'data protection', 'information security']
    }
  ];
}

// Function to generate SEO metadata for dynamic routes
async function getDynamicRoutesMetadata(): Promise<SEOMetadata[]> {
  try {
    // Get all drugs with their "what it does" field
    const { data: drugs, error: drugsError } = await supabase
      .from('drugs')
      .select('name, proper_name, what_it_does, alt_tag_1, alt_tag_2')
      .not('name', 'eq', '');

    if (drugsError) {
      console.error('Error fetching drugs:', drugsError);
      return [];
    }

    // Get vendor details for each drug
    const { data: vendors, error: vendorsError } = await supabase
      .from('vendordetails')
      .select('name, contact, years_in_business');

    if (vendorsError) {
      console.error('Error fetching vendors:', vendorsError);
      return [];
    }

    // Create metadata for drugs
    const drugMetadata = drugs.map(drug => {
      // Create a summary of what it does (truncate if too long)
      let description = drug.what_it_does || '';
      if (description.length > 150) {
        description = description.substring(0, 147) + '...';
      }

      // Add information about vendor availability
      const additionalInfo = 'Compare trusted vendors and prices.';
      
      return {
        path: `/${drug.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        title: `${drug.proper_name || drug.name} - Research Chemical Information | PepSource`,
        description: `${description} ${additionalInfo}`,
        keywords: [drug.name, drug.proper_name, drug.alt_tag_1, drug.alt_tag_2, 'research chemical', 'vendor comparison'].filter(Boolean)
      };
    });

    // Create metadata for vendors
    const vendorMetadata = vendors.map(vendor => {
      let description = `Information about ${vendor.name}, `;
      
      if (vendor.years_in_business) {
        description += `established ${vendor.years_in_business} years ago. `;
      }
      
      description += 'Explore product selection, quality, and pricing information for this research chemical vendor.';
      
      return {
        path: `/${vendor.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        title: `${vendor.name} - Vendor Profile | PepSource`,
        description,
        keywords: [vendor.name, 'vendor', 'research chemicals', 'peptides', 'SARMs', 'product quality'].filter(Boolean)
      };
    });

    return [...drugMetadata, ...vendorMetadata];
  } catch (error) {
    console.error('Error generating dynamic routes metadata:', error);
    return [];
  }
}

// Function to generate SEO metadata file
async function generateSEOMetadata() {
  try {
    // Get static and dynamic routes metadata
    const staticRoutesMetadata = getStaticRoutesMetadata();
    const dynamicRoutesMetadata = await getDynamicRoutesMetadata();

    // Combine metadata
    const allMetadata = [...staticRoutesMetadata, ...dynamicRoutesMetadata];

    // Create metadata object with path as key for easier lookup
    const metadataObject = allMetadata.reduce((acc, item) => {
      acc[item.path] = {
        title: item.title,
        description: item.description,
        keywords: item.keywords?.join(', ') || '',
        imageUrl: item.imageUrl || ''
      };
      return acc;
    }, {} as Record<string, { title: string; description: string; keywords: string; imageUrl: string }>);

    // Ensure the public directory exists
    const publicDir = path.resolve('public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    // Write the metadata to a JSON file
    fs.writeFileSync(
      path.join(publicDir, 'seo-metadata.json'),
      JSON.stringify(metadataObject, null, 2)
    );

    // Create a TypeScript file with metadata for use in components
    const tsContent = `// Auto-generated SEO metadata
// This file is generated by scripts/generateSEO.ts
// Do not edit this file directly

export interface MetadataItem {
  title: string;
  description: string;
  keywords: string;
  imageUrl: string;
}

export const SEOMetadata: Record<string, MetadataItem> = ${JSON.stringify(metadataObject, null, 2)};

export function getMetadataForPath(path: string): MetadataItem {
  // Normalize the path
  path = path.startsWith('/') ? path : '/' + path;
  
  // Strip any trailing slash
  path = path.endsWith('/') ? path.slice(0, -1) : path;
  
  // Return the metadata or default values
  return SEOMetadata[path] || {
    title: 'PepSource - Research Chemical Information',
    description: 'Find reliable information about research chemicals, peptides, and SARMs with trusted vendor comparisons.',
    keywords: 'research chemicals, peptides, SARMs, vendor comparison',
    imageUrl: ''
  };
}
`;

    // Create or ensure the src/seo directory exists
    const seoDir = path.resolve('src', 'seo');
    if (!fs.existsSync(seoDir)) {
      fs.mkdirSync(seoDir, { recursive: true });
    }

    // Write the TypeScript file
    fs.writeFileSync(
      path.join(seoDir, 'metadata.ts'),
      tsContent
    );

    console.log('SEO metadata generated successfully!');
    console.log(`Total entries: ${allMetadata.length}`);
    console.log(`Static entries: ${staticRoutesMetadata.length}`);
    console.log(`Dynamic entries: ${dynamicRoutesMetadata.length}`);

  } catch (error) {
    console.error('Error generating SEO metadata:', error);
  }
}

// Generate the SEO metadata
generateSEOMetadata(); 