import { useState, useEffect } from 'react';

interface SideEffectsTimelinePanelProps {
  drugId: number;
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

const SideEffectsTimelinePanel: React.FC<SideEffectsTimelinePanelProps> = ({ drugId }) => {
  const [drugInfo, setDrugInfo] = useState<DrugInfoData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'side_effects' | 'timeline'>('side_effects');
  
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

  if (loading) return <div className="mt-6 p-4 bg-gray-50 rounded-lg">Loading effects information...</div>;
  if (error) return <div className="mt-6 p-4 bg-gray-50 rounded-lg text-red-500">Error: {error}</div>;
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

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mt-6">
      <h2 className="text-2xl font-bold mb-4">Effects Information</h2>
      
      {/* Tab Selection */}
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
      
      {/* Content Area */}
      <div className="tab-content bg-white p-4 rounded-lg border">
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
      </div>
    </div>
  );
};

export default SideEffectsTimelinePanel;