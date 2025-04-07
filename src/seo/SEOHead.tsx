import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { getMetadataForPath, MetadataItem } from './metadata';

interface SEOHeadProps {
  overrideTitle?: string;
  overrideDescription?: string;
  overrideKeywords?: string;
  overrideImage?: string;
}

// Types for structured data
interface BaseStructuredData {
  '@context': 'https://schema.org';
  '@type': string;
  name?: string;
  description?: string;
  url: string;
}

interface WebsiteStructuredData extends BaseStructuredData {
  '@type': 'WebSite';
  name: string;
  description: string;
}

interface MedicalEntityStructuredData extends BaseStructuredData {
  '@type': 'MedicalEntity';
  name: string;
  description: string;
  category?: string;
}

interface OrganizationStructuredData extends BaseStructuredData {
  '@type': 'Organization';
  name: string;
  description: string;
}

interface WebPageStructuredData extends BaseStructuredData {
  '@type': 'WebPage';
  headline: string;
  description: string;
  author: {
    '@type': 'Organization';
    name: string;
    url: string;
  };
}

type StructuredData = 
  | WebsiteStructuredData 
  | MedicalEntityStructuredData 
  | OrganizationStructuredData 
  | WebPageStructuredData;

/**
 * Component to dynamically set SEO metadata based on current route
 */
const SEOHead: React.FC<SEOHeadProps> = ({
  overrideTitle,
  overrideDescription,
  overrideKeywords,
  overrideImage
}) => {
  const location = useLocation();
  
  useEffect(() => {
    // Get metadata for the current path
    const metadata = getMetadataForPath(location.pathname);
    
    // Set the page title - force update for homepage
    if (location.pathname === '/' || location.pathname === '') {
      document.title = overrideTitle || "PepSource - Trusted Research Chemicals Information Portal";
    } else {
      document.title = overrideTitle || metadata.title;
    }
    
    // Special handling for home page to ensure it uses the correct metadata
    const isHomePage = location.pathname === '/' || location.pathname === '';
    const metaDescription = isHomePage 
      ? "Find reliable information and vendors for research chemicals, peptides, and SARMs. Compare quality, pricing, and testing certifications."
      : (overrideDescription || metadata.description);
    
    const metaKeywords = isHomePage
      ? "research chemicals, peptides, SARMs, vendor comparison"
      : (overrideKeywords || metadata.keywords);
    
    // Update meta tags with home page special handling
    const metaTags = {
      'description': metaDescription,
      'keywords': metaKeywords,
      'og:title': isHomePage ? "PepSource - Trusted Research Chemicals Information Portal" : (overrideTitle || metadata.title),
      'og:description': metaDescription,
      'og:url': window.location.href,
      'og:type': 'website',
      'og:image': overrideImage || metadata.imageUrl || `${window.location.origin}/favicon.png`,
      'twitter:title': isHomePage ? "PepSource - Trusted Research Chemicals Information Portal" : (overrideTitle || metadata.title),
      'twitter:description': metaDescription,
      'twitter:card': 'summary_large_image',
      'twitter:image': overrideImage || metadata.imageUrl || `${window.location.origin}/favicon.png`
    };
    
    // Update existing meta tags or create new ones
    Object.entries(metaTags).forEach(([name, content]) => {
      if (!content) return;
      
      // Check if meta tag exists
      let metaTag: HTMLMetaElement | null;
      
      if (name.startsWith('og:') || name.startsWith('twitter:')) {
        metaTag = document.querySelector(`meta[property="${name}"]`);
        if (!metaTag) {
          metaTag = document.createElement('meta');
          metaTag.setAttribute('property', name);
          document.head.appendChild(metaTag);
        }
      } else {
        metaTag = document.querySelector(`meta[name="${name}"]`);
        if (!metaTag) {
          metaTag = document.createElement('meta');
          metaTag.setAttribute('name', name);
          document.head.appendChild(metaTag);
        }
      }
      
      // Set meta content
      metaTag.setAttribute('content', content);
    });
    
    // Add JSON-LD structured data for better indexing
    addStructuredData(metadata, location.pathname);
    
    // Clean up function
    return () => {
      // Remove structured data on unmount
      const existingScript = document.querySelector('script[type="application/ld+json"]');
      if (existingScript) {
        existingScript.remove();
      }
    };
  }, [location.pathname, overrideTitle, overrideDescription, overrideKeywords, overrideImage]);
  
  // Function to add structured data
  const addStructuredData = (metadata: MetadataItem, path: string): void => {
    // Remove any existing structured data
    const existingScript = document.querySelector('script[type="application/ld+json"]');
    if (existingScript) {
      existingScript.remove();
    }
    
    // Create structured data object
    let structuredData: StructuredData;
    
    // Different schema based on page type
    if (path === '/') {
      // Homepage - WebSite schema
      structuredData = {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: metadata.title,
        description: metadata.description,
        url: window.location.origin,
      };
    } else if (path.startsWith('/vendors/') || (path.match(/^\/[^/]+$/) && !path.match(/^\/(login|signup|contact|terms|privacy|search|ai-search|listing)$/))) {
      // Drug or vendor page - Product schema
      const isProbablyDrug = !path.includes('peptides') && !path.includes('chems');
      
      if (isProbablyDrug) {
        structuredData = {
          '@context': 'https://schema.org',
          '@type': 'MedicalEntity',
          name: metadata.title.split(' - ')[0],
          description: metadata.description,
          url: window.location.href,
          category: "Research Chemical"
        };
      } else {
        structuredData = {
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: metadata.title.split(' - ')[0],
          description: metadata.description,
          url: window.location.href,
        };
      }
    } else {
      // Default - Article schema
      structuredData = {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        headline: metadata.title,
        description: metadata.description,
        url: window.location.href,
        author: {
          '@type': 'Organization',
          name: 'PEPSource',
          url: window.location.origin
        }
      };
    }
    
    // Create script element
    const script = document.createElement('script');
    script.setAttribute('type', 'application/ld+json');
    script.textContent = JSON.stringify(structuredData);
    document.head.appendChild(script);
  };
  
  return null; // This component doesn't render anything
};

export default SEOHead; 