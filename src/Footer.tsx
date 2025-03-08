// Footer.tsx
import React from 'react';

const Footer: React.FC = () => {
  return (
    <footer className="fixed bottom-0 left-0 w-full bg-gray-100 py-2 border-t border-gray-300 z-50">
      <div className="mx-auto text-center sm:text-xs text-[8px] text-gray-600 px-4">
        <p>
          <strong>FDA Disclaimer:</strong> All products listed on Pepsource.com are for research purposes only and have not been evaluated or approved by the FDA. They are not intended for human consumption, diagnosis, treatment, or prevention of any disease. Users are responsible for ensuring compliance with local laws and regulations.
        </p>
      </div>
    </footer>
  );
};

export default Footer;