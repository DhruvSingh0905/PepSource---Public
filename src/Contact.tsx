import React, { useState } from 'react';
import axios from 'axios';

// Email endpoints would be set up in your backend
const GENERAL_CONTACT_ENDPOINT = '/api/contact/general';
const VENDOR_CONTACT_ENDPOINT = '/api/contact/vendor';

// Contact form types
type FormStatus = 'idle' | 'submitting' | 'success' | 'error';

type ContactFormData = {
  name: string;
  email: string;
  subject: string;
  message: string;
};

type VendorFormData = {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  website: string;
  requestType: 'info' | 'update' | 'removal' | 'other';
  message: string;
};

const Contact: React.FC = () => {
  // State for general contact form
  const [contactForm, setContactForm] = useState<ContactFormData>({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  const [contactStatus, setContactStatus] = useState<FormStatus>('idle');
  const [contactError, setContactError] = useState<string>('');

  // State for vendor form
  const [vendorForm, setVendorForm] = useState<VendorFormData>({
    companyName: '',
    contactName: '',
    email: '',
    phone: '',
    website: '',
    requestType: 'info',
    message: ''
  });
  const [vendorStatus, setVendorStatus] = useState<FormStatus>('idle');
  const [vendorError, setVendorError] = useState<string>('');

  // Handle general contact form changes
  const handleContactChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setContactForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Handle vendor form changes
  const handleVendorChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setVendorForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Submit general contact form
  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactStatus('submitting');
    setContactError('');

    try {
      // Replace with your actual API endpoint
      await axios.post(GENERAL_CONTACT_ENDPOINT, contactForm);
      setContactStatus('success');
      setContactForm({
        name: '',
        email: '',
        subject: '',
        message: ''
      });
    } catch (error) {
      console.error('Error submitting contact form:', error);
      setContactStatus('error');
      setContactError('Failed to send your message. Please try again later.');
    }
  };

  // Submit vendor form
  const handleVendorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setVendorStatus('submitting');
    setVendorError('');

    try {
      // Replace with your actual API endpoint
      await axios.post(VENDOR_CONTACT_ENDPOINT, vendorForm);
      setVendorStatus('success');
      setVendorForm({
        companyName: '',
        contactName: '',
        email: '',
        phone: '',
        website: '',
        requestType: 'info',
        message: ''
      });
    } catch (error) {
      console.error('Error submitting vendor form:', error);
      setVendorStatus('error');
      setVendorError('Failed to send your request. Please try again later.');
    }
  };

  return (
    <div className="bg-gray-50 min-h-screen pt-24">
      {/* Page Header - pt-24 ensures it starts under the search bar */}
      <div className="bg-gradient-to-r from-[#3294b4]/10 to-transparent py-12">
        <div className="w-full max-w-screen-xl mx-auto px-4">
          <h1 className="text-gray-800 text-3xl md:text-5xl font-bold mb-6 tracking-tight leading-tight">
            Contact Us.
          </h1>
          <p className="text-gray-600 text-lg max-w-xl mb-4">
            Have questions? We're here to help. Choose the appropriate form below.
          </p>
        </div>
      </div>

      <div className="w-full max-w-screen-xl mx-auto px-4 py-12">
        <div className="grid md:grid-cols-2 gap-12">
          {/* General Contact Form */}
          <div className="bg-white rounded-lg shadow-sm p-8">
            <div className="flex items-center mb-6">
              <div className="w-8 h-8 rounded-full bg-[#3294b4] flex items-center justify-center mr-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-800">General Contact</h2>
            </div>
            <p className="text-gray-600 mb-6">Questions, feedback, or general inquiries? Use this form to get in touch with our team.</p>

            {contactStatus === 'success' ? (
              <div className="bg-green-50 border-l-4 border-green-500 p-4 mb-6">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-green-700 font-medium">Thank you for your message! We'll be in touch shortly.</p>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleContactSubmit}>
                <div className="mb-4">
                  <label htmlFor="name" className="block text-gray-700 font-medium mb-2">Name</label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={contactForm.name}
                    onChange={handleContactChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#3294b4] bg-white text-gray-900"
                    required
                  />
                </div>

                <div className="mb-4">
                  <label htmlFor="email" className="block text-gray-700 font-medium mb-2">Email</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={contactForm.email}
                    onChange={handleContactChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#3294b4] bg-white text-gray-900"
                    required
                  />
                </div>

                <div className="mb-4">
                  <label htmlFor="subject" className="block text-gray-700 font-medium mb-2">Subject</label>
                  <input
                    type="text"
                    id="subject"
                    name="subject"
                    value={contactForm.subject}
                    onChange={handleContactChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#3294b4] bg-white text-gray-900"
                    required
                  />
                </div>

                <div className="mb-6">
                  <label htmlFor="message" className="block text-gray-700 font-medium mb-2">Message</label>
                  <textarea
                    id="message"
                    name="message"
                    value={contactForm.message}
                    onChange={handleContactChange}
                    rows={5}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#3294b4] bg-white text-gray-900"
                    required
                  ></textarea>
                </div>

                {contactError && (
                  <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <p className="text-red-700">{contactError}</p>
                      </div>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={contactStatus === 'submitting'}
                  className="w-full bg-[#3294b4] text-white py-3 px-4 rounded-md hover:bg-[#2a7d99] transition-colors focus:outline-none focus:ring-2 focus:ring-[#3294b4] focus:ring-offset-2 disabled:opacity-70"
                >
                  {contactStatus === 'submitting' ? 'Sending...' : 'Send Message'}
                </button>
              </form>
            )}
          </div>

          {/* Vendor Contact Form */}
          <div className="bg-white rounded-lg shadow-sm p-8">
            <div className="flex items-center mb-6">
              <div className="w-8 h-8 rounded-full bg-[#3294b4] flex items-center justify-center mr-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-800">Vendor Support</h2>
            </div>
            <p className="text-gray-600 mb-6">Are you a vendor looking to update information, address concerns, or inquire about your listing? Use this dedicated form.</p>

            {vendorStatus === 'success' ? (
              <div className="bg-green-50 border-l-4 border-green-500 p-4 mb-6">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-green-700 font-medium">Thank you for your submission! Our vendor support team will contact you shortly.</p>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleVendorSubmit}>
                <div className="mb-4">
                  <label htmlFor="companyName" className="block text-gray-700 font-medium mb-2">Company Name</label>
                  <input
                    type="text"
                    id="companyName"
                    name="companyName"
                    value={vendorForm.companyName}
                    onChange={handleVendorChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#3294b4] bg-white text-gray-900"
                    required
                  />
                </div>

                <div className="mb-4">
                  <label htmlFor="contactName" className="block text-gray-700 font-medium mb-2">Contact Name</label>
                  <input
                    type="text"
                    id="contactName"
                    name="contactName"
                    value={vendorForm.contactName}
                    onChange={handleVendorChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#3294b4] bg-white text-gray-900"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label htmlFor="email" className="block text-gray-700 font-medium mb-2">Email</label>
                    <input
                      type="email"
                      id="vendor-email"
                      name="email"
                      value={vendorForm.email}
                      onChange={handleVendorChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#3294b4] bg-white text-gray-900"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="phone" className="block text-gray-700 font-medium mb-2">Phone Number</label>
                    <input
                      type="tel"
                      id="phone"
                      name="phone"
                      value={vendorForm.phone}
                      onChange={handleVendorChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#3294b4] bg-white text-gray-900"
                      placeholder="Optional"
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <label htmlFor="website" className="block text-gray-700 font-medium mb-2">Website</label>
                  <input
                    type="url"
                    id="website"
                    name="website"
                    value={vendorForm.website}
                    onChange={handleVendorChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#3294b4] bg-white text-gray-900"
                  />
                </div>

                <div className="mb-4">
                  <label htmlFor="requestType" className="block text-gray-700 font-medium mb-2">Request Type</label>
                  <select
                    id="requestType"
                    name="requestType"
                    value={vendorForm.requestType}
                    onChange={handleVendorChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#3294b4] bg-white text-gray-900"
                    required
                  >
                    <option value="info">Information Request</option>
                    <option value="update">Update Listing</option>
                    <option value="removal">Request Removal</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="mb-6">
                  <label htmlFor="vendor-message" className="block text-gray-700 font-medium mb-2">Message</label>
                  <textarea
                    id="vendor-message"
                    name="message"
                    value={vendorForm.message}
                    onChange={handleVendorChange}
                    rows={5}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#3294b4] bg-white text-gray-900"
                    required
                    placeholder="Please provide specific details about your request..."
                  ></textarea>
                </div>

                {vendorError && (
                  <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <p className="text-red-700">{vendorError}</p>
                      </div>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={vendorStatus === 'submitting'}
                  className="w-full bg-[#3294b4] text-white py-3 px-4 rounded-md hover:bg-[#2a7d99] transition-colors focus:outline-none focus:ring-2 focus:ring-[#3294b4] focus:ring-offset-2 disabled:opacity-70"
                >
                  {vendorStatus === 'submitting' ? 'Submitting...' : 'Submit Request'}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Additional contact information */}

      </div>
    </div>
  );
};

export default Contact;