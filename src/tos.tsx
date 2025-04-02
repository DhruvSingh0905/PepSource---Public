import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const TermsOfService: React.FC = () => {
  const [isMobile, setIsMobile] = useState<boolean>(window.innerWidth < 768);
  
  // Set up screen width detection
  useEffect(() => {
    const checkScreenWidth = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    // Initial check
    checkScreenWidth();
    
    // Add event listener
    window.addEventListener('resize', checkScreenWidth);
    
    // Clean up
    return () => {
      window.removeEventListener('resize', checkScreenWidth);
    };
  }, []);

  // Mobile version
  if (isMobile) {
    return (
      <div className="flex justify-center w-full min-h-full pt-16">
        <div className="flex flex-col bg-white w-full mx-4 p-4 my-4">
          <h1 className="text-2xl font-bold text-center mb-4">Terms of Service and Disclaimer</h1>
          
          <div className="bg-yellow-50 border-l-4 border-yellow-500 p-3 mb-4">
            <h2 className="text-base font-bold text-yellow-800 mb-1">Important Notice</h2>
            <p className="text-gray-700 text-sm">
              The information on this website is for research and educational purposes only. 
              By continuing to use this site, you acknowledge that you have read, understood, 
              and agree to these Terms of Service.
            </p>
          </div>
          
          <section className="mb-4">
            <h2 className="text-lg font-semibold mb-2">Research Chemicals Disclaimer</h2>
            <p className="text-sm mb-2">
              All chemicals referenced on this platform are research chemicals intended for laboratory, 
              educational, and research purposes only. They are <span className="font-bold">NOT</span> intended 
              for human consumption or medical use. The information provided is solely for scientific and 
              educational purposes.
            </p>
          </section>
          
          <section className="mb-4">
            <h2 className="text-lg font-semibold mb-2">Not Medical Advice</h2>
            <p className="text-sm mb-2">
              The information on this website, including but not limited to side effect profiles, timelines, 
              dosages, and mechanisms of action, is derived from our research and is provided for informational 
              purposes only. We are <span className="font-bold">NOT</span> medical professionals, physicians, 
              or healthcare providers.
            </p>
            <p className="text-sm mb-2 font-bold">IMPORTANT:</p>
            <ul className="list-disc ml-5 text-sm mb-2">
              <li>Consult with qualified healthcare professionals before making any decisions</li>
              <li>Conduct your own independent research</li>
              <li>Exercise caution and critical thinking when reviewing any information</li>
            </ul>
          </section>
          
          <section className="mb-4">
            <h2 className="text-lg font-semibold mb-2">Opinion-Based Content</h2>
            <h3 className="text-base font-semibold mb-1">Vendor Ratings</h3>
            <p className="text-sm mb-2">
              Our vendor ratings and reviews are based on our own research methodology and evaluation rubric. 
              These ratings represent <span className="font-bold">OUR OPINION</span> and are not guaranteed to 
              reflect objective quality, safety, or reliability. Different users may have different experiences 
              with the same vendors.
            </p>
            
            <h3 className="text-base font-semibold mb-1">Article Summarizations</h3>
            <p className="text-sm mb-2">
              While we provide links to the full scientific articles, the summarizations we offer are created 
              based on what <span className="font-bold">WE THINK</span> is most relevant and accessible for new 
              users. These summaries reflect our editorial perspective and may emphasize certain aspects of the 
              research over others.
            </p>
          </section>
          
          <section className="mb-4">
            <h2 className="text-lg font-semibold mb-2">Pricing Information</h2>
            <p className="text-sm mb-2">
              The prices displayed on our website might not reflect the most recent sales, promotions, or price updates 
              from vendors. While we strive to keep pricing information as current and accurate as possible, prices 
              can change frequently, and there may be a delay between when a vendor updates their pricing and when our 
              website reflects those changes.
            </p>
            <p className="text-sm mb-2">
              We recommend always checking the current pricing directly with the vendor before making any purchasing 
              decisions. We are not responsible for any discrepancies between the prices shown on our website and the 
              actual prices charged by vendors.
            </p>
          </section>
          
          <section className="mb-4">
            <h2 className="text-lg font-semibold mb-2">Product Images</h2>
            <p className="text-sm mb-2">
              The product images displayed on our website are <span className="font-bold">NOT</span> owned by us. They 
              are borrowed from the respective vendors for informational and educational purposes only. All image rights 
              remain with their original owners.
            </p>
            <p className="text-sm mb-2">
              If you are a vendor and wish to have your images removed or updated, please 
              <Link to="/contact" className="text-[#3294b4] hover:underline ml-1">
                visit our contact page
              </Link>.
            </p>
          </section>
          
          <section className="mb-4">
            <h2 className="text-lg font-semibold mb-2">AI Search Capabilities</h2>
            <p className="text-sm mb-2">Our AI-powered search feature:</p>
            <ul className="list-disc ml-5 text-sm mb-2">
              <li>Is <span className="font-bold">NOT</span> a doctor or medical diagnostic tool</li>
              <li>Cannot and does not provide medical diagnoses</li>
              <li>Does not replace professional medical advice</li>
              <li>Utilizes vector-based searching to find relevant information based on your queries</li>
              <li>May not return complete or comprehensive results</li>
            </ul>
          </section>
          
          <section className="mb-4">
            <h2 className="text-lg font-semibold mb-2">Accuracy and Completeness</h2>
            <p className="text-sm mb-2">
              While we strive to provide accurate and up-to-date information, we make no representations or 
              warranties of any kind, express or implied, about the completeness, accuracy, reliability, 
              suitability, or availability of the information contained on our website.
            </p>
          </section>
          
          <section className="mb-4">
            <h2 className="text-lg font-semibold mb-2">Assumption of Risk</h2>
            <p className="text-sm mb-2">
              By using this website, you acknowledge and agree that you are assuming all risks associated with 
              the use of any information provided. You agree to use critical thinking and proper judgment when 
              evaluating any information found on this platform.
            </p>
          </section>
          
          <section className="mb-4">
            <h2 className="text-lg font-semibold mb-2">Intellectual Property</h2>
            <p className="text-sm mb-2">
              All content on this website, including text, graphics, logos, images, and software, is the property 
              of the website owner and is protected by copyright laws.
            </p>
          </section>
          
          <section className="mb-4">
            <h2 className="text-lg font-semibold mb-2">Privacy</h2>
            <p className="text-sm mb-2">
              Your use of our website is also governed by our Privacy Policy, which outlines how we collect, 
              use, and protect your personal information.
            </p>
          </section>
          
          <section className="mb-4">
            <h2 className="text-lg font-semibold mb-2">Modifications</h2>
            <p className="text-sm mb-2">
              We reserve the right to modify these terms at any time without prior notice. Your continued use 
              of the website after any changes indicates your acceptance of the modified terms.
            </p>
          </section>
          
          <section className="mb-4">
            <h2 className="text-lg font-semibold mb-2">Limitation of Liability</h2>
            <p className="text-sm mb-2">
              Under no circumstances shall we be liable for any direct, indirect, incidental, special, or 
              consequential damages arising out of or in any way connected with the use of this website.
            </p>
          </section>
          
          <section className="mb-4">
            <h2 className="text-lg font-semibold mb-2">Contact Information</h2>
            <p className="text-sm mb-2">
              If you have any questions about these Terms of Service, please contact us through our contact page:
            </p>
            <Link to="/contact" className="text-[#3294b4] hover:underline text-sm">
              Contact Us
            </Link>
          </section>
          
          <div className="bg-gray-100 p-4 text-center mt-4">
            <p className="font-medium text-sm mb-3">
              By using this website, you acknowledge that you have read, understood, and agree to these Terms of Service.
            </p>
            <div className="flex space-x-2 justify-center">
              <Link to="/" className="bg-[#3294b4] text-white px-4 py-1.5 rounded-full text-sm hover:bg-blue-600">
                Return Home
              </Link>
              <Link to="/contact" className="border border-[#3294b4] text-[#3294b4] px-4 py-1.5 rounded-full text-sm hover:bg-blue-50">
                Contact Us
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Desktop version
  return (
    <div className="flex justify-center w-full min-h-full pt-20">
      <div className="flex flex-col bg-white shadow-lg rounded-lg w-[1200px] min-h-screen p-8 my-8">
        <h1 className="text-4xl font-bold text-center mb-8">Terms of Service and Disclaimer</h1>
        
        <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 mb-8 rounded-md">
          <h2 className="text-xl font-bold text-yellow-800 mb-2">Important Notice</h2>
          <p className="text-gray-700">
            The information on this website is for research and educational purposes only. 
            By continuing to use this site, you acknowledge that you have read, understood, 
            and agree to these Terms of Service.
          </p>
        </div>
        
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Research Chemicals Disclaimer</h2>
          <div className="border-l-4 border-blue-400 pl-4">
            <p className="mb-4">
              All chemicals referenced on this platform are research chemicals intended for laboratory, 
              educational, and research purposes only. They are <span className="font-bold">NOT</span> intended 
              for human consumption or medical use. The information provided is solely for scientific and 
              educational purposes.
            </p>
          </div>
        </section>
        
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Not Medical Advice</h2>
          <div className="border-l-4 border-blue-400 pl-4">
            <p className="mb-4">
              The information on this website, including but not limited to side effect profiles, timelines, 
              dosages, and mechanisms of action, is derived from our research and is provided for informational 
              purposes only. We are <span className="font-bold">NOT</span> medical professionals, physicians, 
              or healthcare providers.
            </p>
            <p className="mb-4 font-bold">IMPORTANT:</p>
            <ul className="list-disc ml-8 mb-4">
              <li>Consult with qualified healthcare professionals before making any decisions</li>
              <li>Conduct your own independent research</li>
              <li>Exercise caution and critical thinking when reviewing any information</li>
            </ul>
          </div>
        </section>
        
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Opinion-Based Content</h2>
          <div className="border-l-4 border-blue-400 pl-4">
            <h3 className="text-xl font-semibold mb-2">Vendor Ratings</h3>
            <p className="mb-4">
              Our vendor ratings and reviews are based on our own research methodology and evaluation rubric. 
              These ratings represent <span className="font-bold">OUR OPINION</span> and are not guaranteed to 
              reflect objective quality, safety, or reliability. Different users may have different experiences 
              with the same vendors.
            </p>
            
            <h3 className="text-xl font-semibold mb-2">Article Summarizations</h3>
            <p className="mb-4">
              While we provide links to the full scientific articles, the summarizations we offer are created 
              based on what <span className="font-bold">WE THINK</span> is most relevant and accessible for new 
              users. These summaries reflect our editorial perspective and may emphasize certain aspects of the 
              research over others.
            </p>
          </div>
        </section>
        
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Pricing Information</h2>
          <div className="border-l-4 border-blue-400 pl-4">
            <p className="mb-4">
              The prices displayed on our website might not reflect the most recent sales, promotions, or price updates 
              from vendors. While we strive to keep pricing information as current and accurate as possible, prices 
              can change frequently, and there may be a delay between when a vendor updates their pricing and when our 
              website reflects those changes.
            </p>
            <p className="mb-4">
              We recommend always checking the current pricing directly with the vendor before making any purchasing 
              decisions. We are not responsible for any discrepancies between the prices shown on our website and the 
              actual prices charged by vendors.
            </p>
          </div>
        </section>
        
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Product Images</h2>
          <div className="border-l-4 border-blue-400 pl-4">
            <p className="mb-4">
              The product images displayed on our website are <span className="font-bold">NOT</span> owned by us. They 
              are borrowed from the respective vendors for informational and educational purposes only. All image rights 
              remain with their original owners.
            </p>
            <p className="mb-4">
              If you are a vendor and wish to have your images removed or updated, please 
              <Link to="/contact" className="text-[#3294b4] font-medium hover:underline ml-1">
                visit our contact page
              </Link>.
            </p>
          </div>
        </section>
        
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">AI Search Capabilities</h2>
          <div className="border-l-4 border-blue-400 pl-4">
            <p className="mb-4">Our AI-powered search feature:</p>
            <ul className="list-disc ml-8 mb-4">
              <li>Is <span className="font-bold">NOT</span> a doctor or medical diagnostic tool</li>
              <li>Cannot and does not provide medical diagnoses</li>
              <li>Does not replace professional medical advice</li>
              <li>Utilizes vector-based searching to find relevant information based on your queries</li>
              <li>May not return complete or comprehensive results</li>
            </ul>
          </div>
        </section>
        
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Accuracy and Completeness</h2>
          <div className="border-l-4 border-blue-400 pl-4">
            <p className="mb-4">
              While we strive to provide accurate and up-to-date information, we make no representations or 
              warranties of any kind, express or implied, about the completeness, accuracy, reliability, 
              suitability, or availability of the information contained on our website.
            </p>
          </div>
        </section>
        
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Assumption of Risk</h2>
          <div className="border-l-4 border-blue-400 pl-4">
            <p className="mb-4">
              By using this website, you acknowledge and agree that you are assuming all risks associated with 
              the use of any information provided. You agree to use critical thinking and proper judgment when 
              evaluating any information found on this platform.
            </p>
          </div>
        </section>
        
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Intellectual Property</h2>
          <div className="border-l-4 border-blue-400 pl-4">
            <p className="mb-4">
              All content on this website, including text, graphics, logos, images, and software, is the property 
              of the website owner and is protected by copyright laws.
            </p>
          </div>
        </section>
        
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Privacy</h2>
          <div className="border-l-4 border-blue-400 pl-4">
            <p className="mb-4">
              Your use of our website is also governed by our Privacy Policy, which outlines how we collect, 
              use, and protect your personal information.
            </p>
          </div>
        </section>
        
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Modifications</h2>
          <div className="border-l-4 border-blue-400 pl-4">
            <p className="mb-4">
              We reserve the right to modify these terms at any time without prior notice. Your continued use 
              of the website after any changes indicates your acceptance of the modified terms.
            </p>
          </div>
        </section>
        
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Limitation of Liability</h2>
          <div className="border-l-4 border-blue-400 pl-4">
            <p className="mb-4">
              Under no circumstances shall we be liable for any direct, indirect, incidental, special, or 
              consequential damages arising out of or in any way connected with the use of this website.
            </p>
          </div>
        </section>
        
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Contact Information</h2>
          <div className="border-l-4 border-blue-400 pl-4">
            <p className="mb-4">
              If you have any questions about these Terms of Service, please contact us through our contact page:
            </p>
            <Link to="/contact" className="inline-block text-[#3294b4] font-medium hover:underline mb-4">
              Contact Us
            </Link>
          </div>
        </section>
        
        <div className="bg-gray-100 p-6 rounded-lg text-center mt-4">
          <p className="font-bold mb-4">
            By using this website, you acknowledge that you have read, understood, and agree to these Terms of Service.
          </p>
          <div className="flex space-x-4 justify-center">
            <Link to="/" className="inline-block bg-[#3294b4] text-white px-6 py-2 rounded-full hover:bg-blue-600 transition">
              Return to Home
            </Link>
            <Link to="/contact" className="inline-block border border-[#3294b4] text-[#3294b4] px-6 py-2 rounded-full hover:bg-blue-50 transition">
              Contact Us
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TermsOfService;