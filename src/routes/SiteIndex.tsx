import { useEffect, useState } from 'react';
import SEOHead from '../seo/SEOHead';

const SiteIndex = () => {
  const [totalUrls, setTotalUrls] = useState(0);
  const [staticUrls, setStaticUrls] = useState(0);
  const [dynamicUrls, setDynamicUrls] = useState(0);

  useEffect(() => {
    // Load sitemap stats
    const fetchSitemapInfo = async () => {
      try {
        const response = await fetch('/sitemap.xml');
        const xmlText = await response.text();
        
        // Count URLs in the sitemap
        const urlMatches = xmlText.match(/<url>/g);
        if (urlMatches) {
          setTotalUrls(urlMatches.length);
          
          // Estimate static vs dynamic based on known structure
          setStaticUrls(14); // Known number of static routes
          setDynamicUrls(urlMatches.length - 14);
        }
      } catch (error) {
        console.error('Error fetching sitemap info:', error);
      }
    };

    fetchSitemapInfo();
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <SEOHead 
        overrideTitle="PEPSource Site Structure & SEO Implementation"
        overrideDescription="Explore PEPSource's site structure, SEO implementation, and sitemap details. Learn how we optimize our content for search engines."
        overrideKeywords="sitemap, SEO, site structure, research chemicals, metadata, XML sitemap, HTML sitemap"
      />
      
      <h1 className="text-3xl font-bold mb-6">PEPSource Site Structure</h1>
      
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-4">Site Structure Overview</h2>
        <p className="mb-4">
          PEPSource is structured to provide comprehensive, searchable information about research chemicals,
          their properties, effects, and trusted vendors. Our site is fully optimized for search engines to
          help researchers find accurate information quickly.
        </p>
        
        <div className="bg-gray-50 p-4 rounded-lg mb-6">
          <h3 className="text-lg font-medium mb-2">Sitemap Statistics:</h3>
          <ul className="list-disc list-inside">
            <li>Total URLs: {totalUrls}</li>
            <li>Static Pages: {staticUrls}</li>
            <li>Dynamic Content Pages: {dynamicUrls}</li>
          </ul>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-4">SEO Implementation</h2>
        <p className="mb-4">
          Our SEO implementation includes:
        </p>
        
        <ul className="list-disc list-inside mb-4">
          <li className="mb-2">
            <strong>XML Sitemap</strong> - A machine-readable sitemap following the sitemaps.org protocol that 
            helps search engines discover and index our content efficiently.
          </li>
          <li className="mb-2">
            <strong>HTML Sitemap</strong> - A human-readable sitemap that helps visitors navigate our content
            and provides search engines with additional context about our site structure.
          </li>
          <li className="mb-2">
            <strong>Structured Data</strong> - JSON-LD structured data that helps search engines understand
            our content and display rich results in search listings.
          </li>
          <li className="mb-2">
            <strong>Dynamic Metadata</strong> - Each page has optimized titles, descriptions, and keywords
            based on its content.
          </li>
          <li className="mb-2">
            <strong>Semantic HTML</strong> - Our pages use proper HTML5 semantic elements to help search
            engines understand the structure and meaning of our content.
          </li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-4">Available Resources</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <a 
            href="/sitemap.xml" 
            target="_blank" 
            rel="noopener noreferrer"
            className="block p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <h3 className="text-lg font-medium text-blue-600">XML Sitemap</h3>
            <p className="text-sm text-gray-600">
              View our machine-readable XML sitemap used by search engines.
            </p>
          </a>
          
          <a 
            href="/sitemap.html" 
            target="_blank" 
            rel="noopener noreferrer"
            className="block p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <h3 className="text-lg font-medium text-blue-600">HTML Sitemap</h3>
            <p className="text-sm text-gray-600">
              Browse our human-readable sitemap with all pages and descriptions.
            </p>
          </a>
          
          <a 
            href="/robots.txt" 
            target="_blank" 
            rel="noopener noreferrer"
            className="block p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <h3 className="text-lg font-medium text-blue-600">Robots.txt</h3>
            <p className="text-sm text-gray-600">
              View our robots.txt file that provides guidelines to search engines.
            </p>
          </a>
        </div>
      </section>
    </div>
  );
};

export default SiteIndex; 