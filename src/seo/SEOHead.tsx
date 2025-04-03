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
    
    // Set the page title
    document.title = overrideTitle || metadata.title;
    
    // Update meta tags
    const metaTags = {
      'description': overrideDescription || metadata.description,
      'keywords': overrideKeywords || metadata.keywords,
      'og:title': overrideTitle || metadata.title,
      'og:description': overrideDescription || metadata.description,
      'og:url': window.location.href,
      'og:type': 'website',
      'og:image': overrideImage || metadata.imageUrl || `${window.location.origin}/logo.png`,
      'twitter:title': overrideTitle || metadata.title,
      'twitter:description': overrideDescription || metadata.description,
      'twitter:card': 'summary_large_image',
      'twitter:image': overrideImage || metadata.imageUrl || `${window.location.origin}/logo.png`
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