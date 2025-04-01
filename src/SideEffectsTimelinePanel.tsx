import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import logo from "./assets/logo.png"; // Adjust the import path as needed

interface SideEffectsTimelinePanelProps {
  drugId: number;
  subscriptionStatus: boolean;
}

interface SideEffectProfile {
  normal: string[];
  worrying: string[];
  stop_asap: string[];
}

interface TimelinePeriod {
  period: string;
  effects: string[];
}

interface TimelineData {
  timeline: TimelinePeriod[];
  notes?: string;
}

interface DrugInfoData {
  status: string;
  drug_name: string;
  side_effects?: SideEffectProfile;
  effects_timeline?: TimelineData;
}
const apiUrl:string = import.meta.env.VITE_BACKEND_PRODUCTION_URL; //import.meta.env.VITE_BACKEND_DEV_URL

const SideEffectsTimelinePanel: React.FC<SideEffectsTimelinePanelProps> = ({ drugId, subscriptionStatus }) => {
  const [drugInfo, setDrugInfo] = useState<DrugInfoData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'side_effects' | 'timeline'>('side_effects');
  
  // Add state for tracking screen width directly in the component
  const [isMobile, setIsMobile] = useState<boolean>(false);
  
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
  
  useEffect(() => {
    if (!drugId) return;

    setLoading(true);
    fetch(`${apiUrl}/api/drug/${drugId}/effects_info`)
      .then(res => res.json())
      .then(data => {
        if (data.status === "success") {
          setDrugInfo(data);
          
          // If side effects are not available but timeline is, switch to timeline tab
          if (!data.side_effects && data.effects_timeline) {
            setActiveView('timeline');
          }
        } else {
          setError(data.message || "Error fetching drug effects information");
        }
        setLoading(false);
      })
      .catch(err => {
        setError(err.toString());
        setLoading(false);
      });
  }, [drugId]);

  if (loading) return (
    <div className={`mt-6 p-4 bg-gray-50 rounded-lg ${isMobile ? 'text-sm' : ''}`}>
      Loading effects information...
    </div>
  );
  
  if (error) return (
    <div className={`mt-6 p-4 bg-gray-50 rounded-lg text-red-500 ${isMobile ? 'text-sm' : ''}`}>
      Error: {error}
    </div>
  );
  
  if (!drugInfo) return null;

  // Check if any effects data is available
  const hasSideEffects = drugInfo.side_effects && 
    (drugInfo.side_effects.normal?.length > 0 || 
     drugInfo.side_effects.worrying?.length > 0 || 
     drugInfo.side_effects.stop_asap?.length > 0);
     
  const hasTimeline = drugInfo.effects_timeline && 
    drugInfo.effects_timeline.timeline && 
    drugInfo.effects_timeline.timeline.length > 0;
    
  // If no data is available, don't render the component
  if (!hasSideEffects && !hasTimeline) return null;

  // MOBILE VERSION
  if (isMobile) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-4 mt-4">
        <h2 className="text-lg font-bold mb-3">Effects Information</h2>

        {/* Tab Selection - Always visible for both subscribers and non-subscribers */}
        <div className="flex mb-4 border border-gray-200 rounded-lg overflow-hidden">
          {hasSideEffects && (
            <button
              onClick={() => setActiveView('side_effects')}
              className={`flex-1 py-2 text-center text-sm font-medium ${
                activeView === 'side_effects' 
                  ? 'bg-[#3294b4] text-white' 
                  : 'bg-white text-gray-700'
              }`}
            >
              Side Effects
            </button>
          )}
          
          {hasTimeline && (
            <button
              onClick={() => setActiveView('timeline')}
              className={`flex-1 py-2 text-center text-sm font-medium ${
                activeView === 'timeline' 
                  ? 'bg-[#3294b4] text-white' 
                  : 'bg-white text-gray-700'
              }`}
            >
              Timeline
            </button>
          )}
        </div>
            
        {/* Content Area - CONDITIONAL RENDERING */}
        <div className="tab-content bg-white rounded-lg border border-gray-200 p-3">
          {subscriptionStatus ? (
            // SUBSCRIPTION CONTENT - Only render actual content for subscribers
            <>
              {activeView === 'side_effects' && hasSideEffects && (
                <div className="side-effects-content">
                  {/* Normal Side Effects - Mobile */}
                  {drugInfo.side_effects?.normal && drugInfo.side_effects.normal.length > 0 && (
                    <div className="mb-4">
                      <h3 className="text-base font-medium mb-1 text-green-700 flex items-center">
                        <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-2"></span>
                        Normal Side Effects
                      </h3>
                      <p className="text-xs text-gray-600 mb-1">
                        Common effects that don't usually require medical attention.
                      </p>
                      <ul className="list-disc ml-5 space-y-1">
                        {drugInfo.side_effects.normal.map((effect, index) => (
                          <li key={index} className="text-gray-700 text-sm">{effect}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {/* Worrying Side Effects - Mobile */}
                  {drugInfo.side_effects?.worrying && drugInfo.side_effects.worrying.length > 0 && (
                    <div className="mb-4">
                      <h3 className="text-base font-medium mb-1 text-amber-700 flex items-center">
                        <span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-2"></span>
                        Worrying Side Effects
                      </h3>
                      <p className="text-xs text-gray-600 mb-1">
                        Concerning effects that may require monitoring.
                      </p>
                      <ul className="list-disc ml-5 space-y-1">
                        {drugInfo.side_effects.worrying.map((effect, index) => (
                          <li key={index} className="text-gray-700 text-sm">{effect}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {/* Stop ASAP Side Effects - Mobile */}
                  {drugInfo.side_effects?.stop_asap && drugInfo.side_effects.stop_asap.length > 0 && (
                    <div className="mb-4">
                      <h3 className="text-base font-medium mb-1 text-red-700 flex items-center">
                        <span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-2"></span>
                        Stop ASAP Side Effects
                      </h3>
                      <p className="text-xs text-gray-600 mb-1">
                        Serious effects requiring immediate discontinuation and medical attention.
                      </p>
                      <ul className="list-disc ml-5 space-y-1">
                        {drugInfo.side_effects.stop_asap.map((effect, index) => (
                          <li key={index} className="text-gray-700 text-sm">{effect}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              
              {activeView === 'timeline' && hasTimeline && (
                <div className="timeline-content">
                  <div className="relative">
                    {/* Timeline periods - Mobile */}
                    {drugInfo.effects_timeline?.timeline.map((period, index) => (
                      <div key={index} className="mb-4">
                        <div className="flex items-start">
                          {/* Timeline connector - smaller for mobile */}
                          <div className="flex flex-col items-center mr-3">
                            <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
                              {index + 1}
                            </div>
                            {index < drugInfo.effects_timeline!.timeline.length - 1 && (
                              <div className="w-1 bg-blue-200 h-full mt-1 mb-1"></div>
                            )}
                          </div>
                          
                          {/* Content - Mobile */}
                          <div className="bg-blue-50 rounded-lg p-3 flex-1">
                            <h3 className="text-base font-semibold text-blue-700 mb-1">{period.period}</h3>
                            <ul className="space-y-1">
                              {period.effects.map((effect, effectIndex) => {
                                // Split the effect into title and description
                                const parts = effect.split(': ');
                                const title = parts.length > 1 ? parts[0] : '';
                                const description = parts.length > 1 ? parts.slice(1).join(': ') : effect;
                                
                                return (
                                  <li key={effectIndex} className="text-gray-700 text-sm">
                                    {title && <span className="font-medium">{title}: </span>}
                                    {description}
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Notes section - Mobile */}
                  {drugInfo.effects_timeline?.notes && (
                    <div className="mt-4 p-3 bg-gray-50 border-l-4 border-blue-500 rounded text-sm">
                      <h4 className="font-semibold text-gray-700 mb-1">Notes</h4>
                      <p className="text-gray-600 text-sm">{drugInfo.effects_timeline.notes}</p>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            // NON-SUBSCRIBER CONTENT - This is what non-subscribers see
            <Link 
              to="/subscription" 
              className="flex flex-col items-center justify-center py-8 px-4 text-center"
            >
              <img src={logo} alt="Logo" className="w-24 h-12 mx-auto mb-2" />
              <h3 className="text-base font-bold text-[#3294b4] mb-1">Unlock Effects Information</h3>
              <p className="text-gray-700 mb-3 text-xs px-4 text-center">
                Subscribe to view detailed {activeView === 'side_effects' ? 'side effects' : 'timeline'} information.
              </p>
              <button className="bg-[#3294b4] text-white px-4 py-1 rounded-full text-sm hover:bg-blue-600 transition-colors">
                Upgrade Now
              </button>
            </Link>
          )}
        </div>
      </div>
    );
  }

  // DESKTOP VERSION - Completely unchanged original component
  return (
    <div className="bg-white rounded-lg shadow-md p-6 mt-6">
      <h2 className="text-2xl font-bold mb-4">Effects Information</h2>

      {/* Tab Selection - Always visible for subscribers and non-subscribers */}
      <div className="flex mb-6 border-b">
        {hasSideEffects && (
          <button
            onClick={() => setActiveView('side_effects')}
            className={`py-2 px-4 font-medium text-sm focus:outline-none ${
              activeView === 'side_effects' 
                ? 'border-b-2 border-blue-500 text-blue-600' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Side Effects
          </button>
        )}
        
        {hasTimeline && (
          <button
            onClick={() => setActiveView('timeline')}
            className={`py-2 px-4 font-medium text-sm focus:outline-none ${
              activeView === 'timeline' 
                ? 'border-b-2 border-blue-500 text-blue-600' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Effects Timeline
          </button>
        )}
      </div>
      
      {/* Content Area - CONDITIONAL RENDERING */}
      <div className="tab-content bg-white p-4 rounded-lg border">
        {subscriptionStatus ? (
          // SUBSCRIBER CONTENT - Only show actual content to subscribers
          <>
            {activeView === 'side_effects' && hasSideEffects && (
              <div className="side-effects-content">
                {/* Normal Side Effects */}
                {drugInfo.side_effects?.normal && drugInfo.side_effects.normal.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-lg font-medium mb-2 text-green-700 flex items-center">
                      <span className="inline-block w-3 h-3 rounded-full bg-green-500 mr-2"></span>
                      Normal Side Effects
                    </h3>
                    <p className="text-sm text-gray-600 mb-2">
                      These side effects are common and generally not concerning. 
                      They don't usually require medical attention.
                    </p>
                    <ul className="list-disc ml-6 space-y-1">
                      {drugInfo.side_effects.normal.map((effect, index) => (
                        <li key={index} className="text-gray-700">{effect}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {/* Worrying Side Effects */}
                {drugInfo.side_effects?.worrying && drugInfo.side_effects.worrying.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-lg font-medium mb-2 text-amber-700 flex items-center">
                      <span className="inline-block w-3 h-3 rounded-full bg-amber-500 mr-2"></span>
                      Worrying Side Effects
                    </h3>
                    <p className="text-sm text-gray-600 mb-2">
                      These side effects are concerning and may require medical monitoring. 
                      Pay close attention if you experience any of these.
                    </p>
                    <ul className="list-disc ml-6 space-y-1">
                      {drugInfo.side_effects.worrying.map((effect, index) => (
                        <li key={index} className="text-gray-700">{effect}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {/* Stop ASAP Side Effects */}
                {drugInfo.side_effects?.stop_asap && drugInfo.side_effects.stop_asap.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-lg font-medium mb-2 text-red-700 flex items-center">
                      <span className="inline-block w-3 h-3 rounded-full bg-red-500 mr-2"></span>
                      Stop ASAP Side Effects
                    </h3>
                    <p className="text-sm text-gray-600 mb-2">
                      These are serious side effects that indicate you should immediately 
                      discontinue use and seek medical attention.
                    </p>
                    <ul className="list-disc ml-6 space-y-1">
                      {drugInfo.side_effects.stop_asap.map((effect, index) => (
                        <li key={index} className="text-gray-700">{effect}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            
            {activeView === 'timeline' && hasTimeline && (
              <div className="timeline-content">
                <div className="relative">
                  {/* Timeline periods */}
                  {drugInfo.effects_timeline?.timeline.map((period, index) => (
                    <div key={index} className="mb-8">
                      <div className="flex items-start">
                        {/* Timeline connector */}
                        <div className="flex flex-col items-center mr-4">
                          <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
                            {index + 1}
                          </div>
                          {index < drugInfo.effects_timeline!.timeline.length - 1 && (
                            <div className="w-1 bg-blue-200 h-full mt-1 mb-1"></div>
                          )}
                        </div>
                        
                        {/* Content */}
                        <div className="bg-blue-50 rounded-lg p-4 flex-1">
                          <h3 className="text-lg font-semibold text-blue-700 mb-2">{period.period}</h3>
                          <ul className="space-y-2">
                            {period.effects.map((effect, effectIndex) => {
                              // Split the effect into title and description
                              const parts = effect.split(': ');
                              const title = parts.length > 1 ? parts[0] : '';
                              const description = parts.length > 1 ? parts.slice(1).join(': ') : effect;
                              
                              return (
                                <li key={effectIndex} className="text-gray-700">
                                  {title && <span className="font-medium">{title}: </span>}
                                  {description}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Notes section */}
                {drugInfo.effects_timeline?.notes && (
                  <div className="mt-6 p-4 bg-gray-50 border-l-4 border-blue-500 rounded">
                    <h4 className="font-semibold text-gray-700 mb-2">Notes</h4>
                    <p className="text-gray-600">{drugInfo.effects_timeline.notes}</p>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          // NON-SUBSCRIBER CONTENT - Subscription CTA
          <Link 
            to="/subscription" 
            className="block relative p-8 bg-white text-center"
          >
            <img src={logo} alt="Logo" className="w-36 h-18 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-[#3294b4] mb-2">Access Detailed Effects Information</h3>
            <p className="text-gray-700 mb-4 max-w-md mx-auto">
              Subscribe to view comprehensive information about potential side effects and the expected 
              timeline of effects for this compound.
            </p>
            <button className="bg-[#3294b4] text-white px-6 py-2 rounded-full hover:bg-blue-600 transition-colors">
              Upgrade Now
            </button>
          </Link>
        )}
      </div>
    </div>
  );
};

export default SideEffectsTimelinePanel;