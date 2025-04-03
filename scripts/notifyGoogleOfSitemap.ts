import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const SITE_URL = process.env.SITE_URL || 'https://pepsource.shop';

/**
 * Notify Google of sitemap updates
 * This function pings Google's sitemap notification service
 */
async function notifyGoogleOfSitemap() {
  try {
    // XML sitemap notification
    const xmlSitemapUrl = `${SITE_URL}/sitemap.xml`;
    const xmlResponse = await fetch(`https://www.google.com/ping?sitemap=${encodeURIComponent(xmlSitemapUrl)}`);
    
    if (xmlResponse.ok) {
      console.log(`✅ Successfully notified Google about XML sitemap: ${xmlSitemapUrl}`);
    } else {
      console.error(`❌ Failed to notify Google about XML sitemap. Status: ${xmlResponse.status}`);
    }

    // HTML sitemap notification
    const htmlSitemapUrl = `${SITE_URL}/sitemap.html`;
    const htmlResponse = await fetch(`https://www.google.com/ping?sitemap=${encodeURIComponent(htmlSitemapUrl)}`);
    
    if (htmlResponse.ok) {
      console.log(`✅ Successfully notified Google about HTML sitemap: ${htmlSitemapUrl}`);
    } else {
      console.error(`❌ Failed to notify Google about HTML sitemap. Status: ${htmlResponse.status}`);
    }

    console.log('Google Search Console notification complete.');
  } catch (error) {
    console.error('Error notifying Google:', error);
  }
}

// Run the notification function
notifyGoogleOfSitemap(); 