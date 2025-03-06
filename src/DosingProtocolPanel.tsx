import { useState, useEffect } from 'react';

interface DosingProtocolProps {
  drugId: number;
}

interface ProtocolContent {
  available: boolean;
  type: 'structured' | 'text' | 'disclaimer' | 'none';
  content: string | null;
}

interface DosingData {
  status: string;
  drug_name: string;
  dosing_protocols: {
    obese: ProtocolContent;
    skinny_with_little_muscle: ProtocolContent;
    muscular: ProtocolContent;
  };
}

const DosingProtocolPanel: React.FC<DosingProtocolProps> = ({ drugId }) => {
  const [dosingData, setDosingData] = useState<DosingData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeBodyType, setActiveBodyType] = useState<'obese' | 'skinny_with_little_muscle' | 'muscular'>('muscular');

  useEffect(() => {
    if (!drugId) return;

    setLoading(true);
    fetch(`http://127.0.0.1:8000/api/drug/${drugId}/dosing`)
      .then(res => res.json())
      .then(data => {
        if (data.status === "success") {
          setDosingData(data);
          
          // Set initial active body type to the first available protocol
          const types = ['muscular', 'obese', 'skinny_with_little_muscle'] as const;
          for (const type of types) {
            if (data.dosing_protocols[type].available) {
              setActiveBodyType(type);
              break;
            }
          }
        } else {
          setError(data.message || "Error fetching dosing protocols");
        }
        setLoading(false);
      })
      .catch(err => {
        setError(err.toString());
        setLoading(false);
      });
  }, [drugId]);

  // Format protocol text for display
  const formatProtocolContent = (content: string | null): React.ReactNode => {
    if (!content) return null;

    // For structured content, split by headings and format
    if (dosingData?.dosing_protocols[activeBodyType].type === 'structured') {
      const sections = [
        "Recommended Starting Dose",
        "Frequency of Administration",
        "Dosing Adjustments",
        "Potential Cycle Length",
        "Special Considerations",
        "Potential Side Effects",
        "Warning Signs",
        "Side Effects That May Diminish"
      ];

      let formattedContent = content;

      // Replace headers with styled headers
      sections.forEach(section => {
        formattedContent = formattedContent.replace(
          new RegExp(`${section}`, 'g'),
          `<h4 class="text-lg font-semibold mt-3 mb-1">${section}</h4>`
        );
      });

      // Replace numbers followed by a period with styled list items
      formattedContent = formattedContent.replace(
        /(\d+)\.\s+([^<]+)/g,
        '<div class="ml-4 mb-2"><span class="font-bold">$1.</span> $2</div>'
      );

      return <div dangerouslySetInnerHTML={{ __html: formattedContent }} />;
    }

    // For text-based content, just return with paragraph formatting
    return <p className="whitespace-pre-wrap">{content}</p>;
  };

  // Determine if a protocol is available for a body type
  const isProtocolAvailable = (bodyType: 'obese' | 'skinny_with_little_muscle' | 'muscular'): boolean => {
    return dosingData?.dosing_protocols[bodyType].available || false;
  };

  // Get human-readable name for body type
  const getBodyTypeName = (bodyType: 'obese' | 'skinny_with_little_muscle' | 'muscular'): string => {
    switch (bodyType) {
      case 'obese':
        return 'Higher Body Fat';
      case 'skinny_with_little_muscle':
        return 'Lower Muscle Mass';
      case 'muscular':
        return 'Athletic Build';
      default:
        return bodyType;
    }
  };

  if (loading) return <div className="mt-6 p-4 bg-gray-50 rounded-lg">Loading dosing information...</div>;
  if (error) return <div className="mt-6 p-4 bg-gray-50 rounded-lg text-red-500">Error: {error}</div>;
  if (!dosingData) return null;

  // Check if any protocols are available
  const hasAnyProtocol = isProtocolAvailable('obese') || 
                        isProtocolAvailable('skinny_with_little_muscle') || 
                        isProtocolAvailable('muscular');

  if (!hasAnyProtocol) return null;

  return (
    <div className="dosing-protocol-panel mt-8 border rounded-lg p-6 bg-gray-50">
      <h2 className="text-2xl font-bold mb-4">Dosing Information</h2>
      
      {/* Body Type Selector */}
      <div className="body-type-selector flex flex-wrap mb-6">
        {['muscular', 'obese', 'skinny_with_little_muscle'].map((bodyType) => (
          isProtocolAvailable(bodyType as any) && (
            <button
              key={bodyType}
              onClick={() => setActiveBodyType(bodyType as any)}
              className={`mr-2 mb-2 px-4 py-2 rounded-md transition-colors ${
                activeBodyType === bodyType
                  ? 'bg-blue-500 text-white'
                  : 'bg-white text-gray-700 border hover:bg-gray-100'
              }`}
            >
              {getBodyTypeName(bodyType as any)}
            </button>
          )
        ))}
      </div>

      {/* Protocol Content */}
      <div className="protocol-content bg-white p-4 rounded-lg border">
        <h3 className="text-xl font-semibold mb-3">
          {getBodyTypeName(activeBodyType)} Dosing Protocol
        </h3>
        
        {dosingData.dosing_protocols[activeBodyType].type === 'disclaimer' ? (
          <div className="disclaimer text-gray-700 italic">
            {formatProtocolContent(dosingData.dosing_protocols[activeBodyType].content)}
          </div>
        ) : (
          <div className="protocol-details">
            {formatProtocolContent(dosingData.dosing_protocols[activeBodyType].content)}
          </div>
        )}
        
        <div className="mt-4 text-sm text-gray-500 italic">
          Note: This information is provided for research purposes only. Always consult with a healthcare 
          professional before starting any new supplement regimen.
        </div>
      </div>
    </div>
  );
};

export default DosingProtocolPanel;