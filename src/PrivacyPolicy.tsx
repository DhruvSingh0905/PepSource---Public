import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const PrivacyPolicy: React.FC = () => {
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
          <h1 className="text-2xl font-bold text-center mb-4">Privacy Policy</h1>
          
          <div className="bg-blue-50 border-l-4 border-blue-500 p-3 mb-4">
            <h2 className="text-base font-bold text-blue-800 mb-1">Last Updated: March 22, 2025</h2>
            <p className="text-gray-700 text-sm">
              Your privacy is important to us. This Privacy Policy explains how we collect, use, disclose, 
              and safeguard your information when you visit our website or use our services.
            </p>
          </div>
          
          <section className="mb-4">
            <h2 className="text-lg font-semibold mb-2">Information We Collect</h2>
            <h3 className="text-base font-semibold mb-1">Personal Information</h3>
            <p className="mb-2 text-sm">
              We may collect personal information that you voluntarily provide when using our site, including but not limited to:
            </p>
            <ul className="list-disc ml-5 text-sm mb-2">
              <li>Name and email address when you create an account</li>
              <li>Billing information when you subscribe to premium services</li>
              <li>Profile information you choose to provide</li>
              <li>Content of reviews, comments, or feedback you submit</li>
            </ul>
            
            <h3 className="text-base font-semibold mb-1">Usage Information</h3>
            <p className="mb-2 text-sm">
              We automatically collect certain information about your device and how you interact with our website:
            </p>
            <ul className="list-disc ml-5 text-sm mb-2">
              <li>Log data including IP address, browser type, pages visited, and time spent</li>
              <li>Device information such as operating system and unique device identifiers</li>
              <li>Search queries and browsing behavior on our platform</li>
              <li>AI search usage patterns and history</li>
            </ul>
          </section>
          
          <section className="mb-4">
            <h2 className="text-lg font-semibold mb-2">How We Use Your Information</h2>
            <p className="mb-2 text-sm">We use the information we collect for various purposes, including:</p>
            <ul className="list-disc ml-5 text-sm mb-2">
              <li>Providing, maintaining, and improving our services</li>
              <li>Processing transactions and managing your account</li>
              <li>Responding to inquiries and customer service requests</li>
              <li>Sending administrative information and service updates</li>
              <li>Personalizing your experience and delivering content relevant to your interests</li>
              <li>Monitoring and analyzing usage patterns and trends</li>
              <li>Protecting against unauthorized access and maintaining security</li>
              <li>Enforcing our terms of service and preventing fraud</li>
            </ul>
          </section>
          
          <section className="mb-4">
            <h2 className="text-lg font-semibold mb-2">Cookies and Tracking Technologies</h2>
            <p className="mb-2 text-sm">
              We use cookies and similar tracking technologies to collect information and enhance your browsing experience. 
              These technologies help us understand how you use our site, remember your preferences, and improve our services.
            </p>
            <p className="mb-2 text-sm">
              You can control cookie settings through your browser preferences. However, disabling cookies may affect 
              the functionality and your experience on our website.
            </p>
          </section>
          
          <section className="mb-4">
            <h2 className="text-lg font-semibold mb-2">Data Retention</h2>
            <p className="mb-2 text-sm">
              We retain your personal information for as long as necessary to fulfill the purposes outlined in this 
              Privacy Policy, unless a longer retention period is required by law. When determining how long to keep 
              your information, we consider the nature and sensitivity of the data, potential risks of unauthorized 
              disclosure, and legal requirements.
            </p>
          </section>
          
          <section className="mb-4">
            <h2 className="text-lg font-semibold mb-2">Information Sharing and Disclosure</h2>
            <p className="mb-2 text-sm">We may share your information with the following parties:</p>
            <ul className="list-disc ml-5 text-sm mb-2">
              <li>Service providers who help us operate our business and deliver services</li>
              <li>Business partners with whom we offer co-branded services or promotions</li>
              <li>Legal authorities when required by law or to protect our rights</li>
              <li>Third parties in connection with a merger, acquisition, or sale of assets</li>
            </ul>
            <p className="mb-2 text-sm">
              We do not sell your personal information to third parties for their own marketing purposes.
            </p>
          </section>
          
          <section className="mb-4">
            <h2 className="text-lg font-semibold mb-2">Data Security</h2>
            <p className="mb-2 text-sm">
              We implement appropriate technical and organizational measures to protect your personal information 
              against unauthorized access, alteration, disclosure, or destruction. However, no method of transmission 
              over the Internet or electronic storage is 100% secure, and we cannot guarantee absolute security.
            </p>
          </section>
          
          <section className="mb-4">
            <h2 className="text-lg font-semibold mb-2">Your Rights and Choices</h2>
            <p className="mb-2 text-sm">Depending on your location, you may have certain rights regarding your personal information:</p>
            <ul className="list-disc ml-5 text-sm mb-2">
              <li>Accessing, correcting, or deleting your personal information</li>
              <li>Restricting or objecting to our processing of your data</li>
              <li>Receiving your data in a structured, machine-readable format</li>
              <li>Withdrawing consent at any time (where processing is based on consent)</li>
              <li>Lodging a complaint with a supervisory authority</li>
            </ul>
            <p className="mb-2 text-sm">
              To exercise these rights, please visit our <Link to="/contact" className="text-[#3294b4] hover:underline">Contact Page</Link>.
            </p>
          </section>
          
          <section className="mb-4">
            <h2 className="text-lg font-semibold mb-2">Children's Privacy</h2>
            <p className="mb-2 text-sm">
              Our services are not intended for children under 18 years of age. We do not knowingly collect personal 
              information from children. If we learn that we have collected personal information from a child, we will 
              take steps to delete that information as quickly as possible.
            </p>
          </section>
          
          <section className="mb-4">
            <h2 className="text-lg font-semibold mb-2">Changes to This Privacy Policy</h2>
            <p className="mb-2 text-sm">
              We may update this Privacy Policy from time to time to reflect changes in our practices or legal requirements. 
              We will notify you of any material changes by posting the updated policy on this page with a new "Last Updated" date.
            </p>
            <p className="mb-2 text-sm">
              We encourage you to review this policy periodically to stay informed about how we protect your information.
            </p>
          </section>
          
          <section className="mb-4">
            <h2 className="text-lg font-semibold mb-2">Contact Information</h2>
            <p className="mb-2 text-sm">
              If you have questions, concerns, or requests regarding this Privacy Policy or our privacy practices, 
              please contact us through our contact page:
            </p>
            <Link to="/contact" className="text-[#3294b4] hover:underline text-sm">
              Contact Us
            </Link>
          </section>
          
          <div className="bg-gray-100 p-4 text-center mt-4">
            <p className="font-medium text-sm mb-3">
              By using this website, you acknowledge that you have read and understood this Privacy Policy.
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
        <h1 className="text-4xl font-bold text-center mb-8">Privacy Policy</h1>
        
        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-8 rounded-md">
          <h2 className="text-xl font-bold text-blue-800 mb-2">Last Updated: March 22, 2025</h2>
          <p className="text-gray-700">
            Your privacy is important to us. This Privacy Policy explains how we collect, use, disclose, 
            and safeguard your information when you visit our website or use our services.
          </p>
        </div>
        
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Information We Collect</h2>
          <div className="border-l-4 border-blue-400 pl-4">
            <h3 className="text-xl font-semibold mb-2">Personal Information</h3>
            <p className="mb-4">
              We may collect personal information that you voluntarily provide when using our site, including but not limited to:
            </p>
            <ul className="list-disc ml-8 mb-4">
              <li>Name and email address when you create an account</li>
              <li>Billing information when you subscribe to premium services</li>
              <li>Profile information you choose to provide</li>
              <li>Content of reviews, comments, or feedback you submit</li>
            </ul>
            
            <h3 className="text-xl font-semibold mb-2">Usage Information</h3>
            <p className="mb-4">
              We automatically collect certain information about your device and how you interact with our website:
            </p>
            <ul className="list-disc ml-8 mb-4">
              <li>Log data including IP address, browser type, pages visited, and time spent</li>
              <li>Device information such as operating system and unique device identifiers</li>
              <li>Search queries and browsing behavior on our platform</li>
              <li>AI search usage patterns and history</li>
            </ul>
          </div>
        </section>
        
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">How We Use Your Information</h2>
          <div className="border-l-4 border-blue-400 pl-4">
            <p className="mb-4">We use the information we collect for various purposes, including:</p>
            <ul className="list-disc ml-8 mb-4">
              <li>Providing, maintaining, and improving our services</li>
              <li>Processing transactions and managing your account</li>
              <li>Responding to inquiries and customer service requests</li>
              <li>Sending administrative information and service updates</li>
              <li>Personalizing your experience and delivering content relevant to your interests</li>
              <li>Monitoring and analyzing usage patterns and trends</li>
              <li>Protecting against unauthorized access and maintaining security</li>
              <li>Enforcing our terms of service and preventing fraud</li>
            </ul>
          </div>
        </section>
        
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Cookies and Tracking Technologies</h2>
          <div className="border-l-4 border-blue-400 pl-4">
            <p className="mb-4">
              We use cookies and similar tracking technologies to collect information and enhance your browsing experience. 
              These technologies help us understand how you use our site, remember your preferences, and improve our services.
            </p>
            <p className="mb-4">
              You can control cookie settings through your browser preferences. However, disabling cookies may affect 
              the functionality and your experience on our website.
            </p>
          </div>
        </section>
        
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Data Retention</h2>
          <div className="border-l-4 border-blue-400 pl-4">
            <p className="mb-4">
              We retain your personal information for as long as necessary to fulfill the purposes outlined in this 
              Privacy Policy, unless a longer retention period is required by law. When determining how long to keep 
              your information, we consider the nature and sensitivity of the data, potential risks of unauthorized 
              disclosure, and legal requirements.
            </p>
          </div>
        </section>
        
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Information Sharing and Disclosure</h2>
          <div className="border-l-4 border-blue-400 pl-4">
            <p className="mb-4">We may share your information with the following parties:</p>
            <ul className="list-disc ml-8 mb-4">
              <li>Service providers who help us operate our business and deliver services</li>
              <li>Business partners with whom we offer co-branded services or promotions</li>
              <li>Legal authorities when required by law or to protect our rights</li>
              <li>Third parties in connection with a merger, acquisition, or sale of assets</li>
            </ul>
            <p className="mb-4">
              We do not sell your personal information to third parties for their own marketing purposes.
            </p>
          </div>
        </section>
        
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Data Security</h2>
          <div className="border-l-4 border-blue-400 pl-4">
            <p className="mb-4">
              We implement appropriate technical and organizational measures to protect your personal information 
              against unauthorized access, alteration, disclosure, or destruction. However, no method of transmission 
              over the Internet or electronic storage is 100% secure, and we cannot guarantee absolute security.
            </p>
          </div>
        </section>
        
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Your Rights and Choices</h2>
          <div className="border-l-4 border-blue-400 pl-4">
            <p className="mb-4">Depending on your location, you may have certain rights regarding your personal information:</p>
            <ul className="list-disc ml-8 mb-4">
              <li>Accessing, correcting, or deleting your personal information</li>
              <li>Restricting or objecting to our processing of your data</li>
              <li>Receiving your data in a structured, machine-readable format</li>
              <li>Withdrawing consent at any time (where processing is based on consent)</li>
              <li>Lodging a complaint with a supervisory authority</li>
            </ul>
            <p className="mb-4">
              To exercise these rights, please visit our <Link to="/contact" className="text-[#3294b4] hover:underline">Contact Page</Link>.
            </p>
          </div>
        </section>
        
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Children's Privacy</h2>
          <div className="border-l-4 border-blue-400 pl-4">
            <p className="mb-4">
              Our services are not intended for children under 18 years of age. We do not knowingly collect personal 
              information from children. If we learn that we have collected personal information from a child, we will 
              take steps to delete that information as quickly as possible.
            </p>
          </div>
        </section>
        
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Changes to This Privacy Policy</h2>
          <div className="border-l-4 border-blue-400 pl-4">
            <p className="mb-4">
              We may update this Privacy Policy from time to time to reflect changes in our practices or legal requirements. 
              We will notify you of any material changes by posting the updated policy on this page with a new "Last Updated" date.
            </p>
            <p className="mb-4">
              We encourage you to review this policy periodically to stay informed about how we protect your information.
            </p>
          </div>
        </section>
        
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Contact Information</h2>
          <div className="border-l-4 border-blue-400 pl-4">
            <p className="mb-4">
              If you have questions, concerns, or requests regarding this Privacy Policy or our privacy practices, 
              please contact us through our contact page:
            </p>
            <Link to="/contact" className="inline-block text-[#3294b4] font-medium hover:underline mb-4">
              Contact Us
            </Link>
          </div>
        </section>
        
        <div className="bg-gray-100 p-6 rounded-lg text-center mt-4">
          <p className="font-bold mb-4">
            By using this website, you acknowledge that you have read and understood this Privacy Policy.
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

export default PrivacyPolicy;