import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, Save, FolderOpen, X, Download, 
  AlertCircle, CheckCircle, Loader2, Zap, Image as ImageIcon 
} from 'lucide-react';

// --- Types ---
type AspectRatio = '3:4' | '9:16' | '1:1' | '16:9';
type BatchSize = 1 | 2 | 3 | 4;
type GenerationStatus = 'idle' | 'loading' | 'success' | 'failed';

interface CharacterPreset {
  id: string;
  name: string;
  image: string; // base64
  createdAt: number;
}

interface GeneratedImage {
  id: string;
  url: string;
  timestamp: number;
  status: GenerationStatus;
  error?: string;
}

// --- Constants ---
const STORAGE_KEYS = {
  PRESETS: 'synthetic_good_presets',
  LAST_PROMPT: 'synthetic_good_last_prompt',
};

const ASPECT_RATIOS: AspectRatio[] = ['3:4', '9:16', '1:1', '16:9'];
const BATCH_SIZES: BatchSize[] = [1, 2, 3, 4];

// --- Helper Functions ---
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

// --- Components ---

const NeoCard = ({ children, className = '', noPadding = false }: { children: React.ReactNode; className?: string, noPadding?: boolean }) => (
  <div className={`bg-white border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${noPadding ? '' : 'p-4'} ${className}`}>
    {children}
  </div>
);

const NeoButton = ({ onClick, disabled, children, className = '', active = false, variant = 'default' }: any) => {
  const baseStyles = "px-4 py-2 font-bold border-[3px] border-black transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2";
  
  let colorStyles = "bg-white hover:bg-gray-50";
  if (active) colorStyles = "bg-yellow-400";
  if (variant === 'danger') colorStyles = "bg-red-300 hover:bg-red-400";
  if (variant === 'success') colorStyles = "bg-green-300 hover:bg-green-400";
  if (variant === 'primary') colorStyles = "bg-yellow-400 hover:bg-yellow-300";

  const shadowStyles = active 
    ? "shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] translate-x-[2px] translate-y-[2px]"
    : "shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] active:shadow-none active:translate-x-[4px] active:translate-y-[4px]";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyles} ${colorStyles} ${shadowStyles} ${className}`}
    >
      {children}
    </button>
  );
};

// --- Main App ---
export default function App() {
  // --- State: Content ---
  const [imagePrompt, setImagePrompt] = useState('');
  const [characterImage, setCharacterImage] = useState<string | null>(null);
  const [loadedPresetName, setLoadedPresetName] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [batchSize, setBatchSize] = useState<BatchSize>(1);

  // --- State: Generation ---
  const [isGenerating, setIsGenerating] = useState(false);
  const [notification, setNotification] = useState('Ready to generate');
  const [notificationType, setNotificationType] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [previewImage, setPreviewImage] = useState<GeneratedImage | null>(null);

  // --- State: Modals ---
  const [presets, setPresets] = useState<CharacterPreset[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');

  // --- Initialization ---
  useEffect(() => {
    const storedPresets = localStorage.getItem(STORAGE_KEYS.PRESETS);
    if (storedPresets) {
      try {
        setPresets(JSON.parse(storedPresets));
      } catch (e) {
        console.error("Failed to parse presets", e);
      }
    }

    const storedPrompt = localStorage.getItem(STORAGE_KEYS.LAST_PROMPT);
    if (storedPrompt) setImagePrompt(storedPrompt);
  }, []);

  // Save prompt on change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.LAST_PROMPT, imagePrompt);
  }, [imagePrompt]);

  // --- Logic: Presets ---
  const handleSavePresetConfirm = () => {
    if (!newPresetName.trim() || !characterImage) return;
    
    const newPreset: CharacterPreset = {
      id: crypto.randomUUID(),
      name: newPresetName.trim(),
      image: characterImage,
      createdAt: Date.now()
    };
    
    const updatedPresets = [...presets, newPreset];
    setPresets(updatedPresets);
    localStorage.setItem(STORAGE_KEYS.PRESETS, JSON.stringify(updatedPresets));
    
    setShowSaveModal(false);
    setNewPresetName('');
    setNotification(`Preset "${newPreset.name}" saved.`);
    setNotificationType('success');
  };

  const handleLoadPreset = (preset: CharacterPreset) => {
    setCharacterImage(preset.image);
    setLoadedPresetName(preset.name);
    setShowLoadModal(false);
    setNotification(`Loaded preset: ${preset.name}`);
    setNotificationType('success');
  };

  const handleDeletePreset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updatedPresets = presets.filter(p => p.id !== id);
    setPresets(updatedPresets);
    localStorage.setItem(STORAGE_KEYS.PRESETS, JSON.stringify(updatedPresets));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const base64 = await fileToBase64(file);
        setCharacterImage(base64);
        setLoadedPresetName(null);
      } catch (err) {
        setNotification("Failed to upload image");
        setNotificationType('error');
      }
    }
  };

  // --- Logic: Generation ---
  const handleGenerate = async () => {
    if (!imagePrompt.trim()) {
      setNotification("Please enter a prompt");
      setNotificationType('error');
      return;
    }
    if (!characterImage) {
      setNotification("Please upload a character reference");
      setNotificationType('error');
      return;
    }

    setIsGenerating(true);
    setGeneratedImages([]); // Clear previous
    setNotificationType('loading');

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < batchSize; i++) {
      setNotification(`Generating ${i + 1}/${batchSize}...`);
      
      // Add a placeholder for this generation
      const tempId = crypto.randomUUID();
      setGeneratedImages(prev => [...prev, {
        id: tempId,
        url: '',
        timestamp: Date.now(),
        status: 'loading'
      }]);

      try {
        const response = await fetch('/.netlify/functions/gemini', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            prompt: imagePrompt,
            image: characterImage,
            aspectRatio: aspectRatio
          })
        });

        const responseText = await response.text();
        let data;
        try {
          data = responseText ? JSON.parse(responseText) : {};
        } catch (parseError) {
          console.error("Non-JSON response from server:", responseText);
          throw new Error(`Server returned an invalid response (Status: ${response.status}). If you are testing inside AI Studio, Netlify functions will not work here.`);
        }

        if (!response.ok) {
          throw new Error(data.error || `Failed to generate image (Status: ${response.status})`);
        }

        setGeneratedImages(prev => prev.map(img => 
          img.id === tempId ? { ...img, url: data.url, status: 'success' } : img
        ));
        successCount++;

      } catch (error: any) {
        console.error("Generation error:", error);
        // Update placeholder with error
        setGeneratedImages(prev => prev.map(img => 
          img.id === tempId ? { ...img, status: 'failed', error: error.message || 'Error' } : img
        ));
        failCount++;
      }
    }

    setIsGenerating(false);
    setNotification(`Done: ${successCount} success, ${failCount} failed.`);
    setNotificationType(successCount > 0 ? 'success' : 'error');
  };

  const handleDownload = (image: GeneratedImage) => {
    const link = document.createElement('a');
    link.href = image.url;
    link.download = `SyntheticGood_${image.timestamp}_${image.id.slice(0,4)}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Render ---
  return (
    <div className="max-w-md mx-auto min-h-screen pb-20 p-4 flex flex-col gap-5 font-sans">
      
      {/* A) HEADER */}
      <header className="bg-black border-[3px] border-black shadow-[6px_6px_0px_0px_rgba(255,255,255,0.5)] p-4 transform -rotate-1 mb-2">
        <h1 className="text-3xl font-black uppercase tracking-tighter leading-none">
          <span className="text-white">Synthetic</span>
          <span className="text-yellow-400">Good</span>
        </h1>
        <p className="text-white text-xs font-mono mt-1 opacity-80">Gemini 2.5 Flash Image Generator</p>
      </header>

      {/* C) CHARACTER REFERENCE */}
      <NeoCard>
        <div className="flex justify-between items-center mb-2">
          <label className="font-bold text-sm uppercase flex items-center gap-2">
            <ImageIcon size={16} /> Character Ref
          </label>
          {loadedPresetName && (
            <span className="text-[10px] bg-yellow-200 border border-black px-1 font-mono truncate max-w-[120px]">
              Loaded: {loadedPresetName}
            </span>
          )}
        </div>
        
        <div className="relative aspect-square bg-gray-100 border-[3px] border-black mb-3 flex items-center justify-center overflow-hidden group">
          {characterImage ? (
            <img src={characterImage} alt="Character" className="w-full h-full object-cover" />
          ) : (
            <div className="text-gray-400 flex flex-col items-center">
              <Upload size={32} />
              <span className="text-xs mt-1 font-mono">Upload Image</span>
            </div>
          )}
          <input 
            type="file" 
            accept="image/*" 
            onChange={handleImageUpload}
            disabled={isGenerating}
            className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
          />
        </div>

        <div className="flex gap-2">
          <NeoButton 
            className="flex-1 text-xs"
            onClick={() => setShowSaveModal(true)}
            disabled={!characterImage || isGenerating}
          >
            <Save size={14} /> Save
          </NeoButton>
          <NeoButton 
            className="flex-1 text-xs"
            onClick={() => setShowLoadModal(true)}
            disabled={isGenerating}
          >
            <FolderOpen size={14} /> Load
          </NeoButton>
        </div>
      </NeoCard>

      {/* D) PROMPT */}
      <NeoCard>
        <div className="flex justify-between items-center mb-2">
          <label className="font-bold text-sm uppercase">Prompt</label>
          <button 
            onClick={() => setImagePrompt('')} 
            disabled={isGenerating}
            className="text-xs underline hover:text-red-500 disabled:opacity-50"
          >
            Clear
          </button>
        </div>
        <textarea
          value={imagePrompt}
          onChange={(e) => setImagePrompt(e.target.value)}
          disabled={isGenerating}
          placeholder="Describe the scene, style, and action..."
          className="w-full h-32 bg-gray-100 border-[3px] border-black p-3 font-mono text-sm focus:outline-none focus:bg-yellow-50 resize-none disabled:opacity-50"
        />
      </NeoCard>

      {/* E) ASPECT RATIO */}
      <div>
        <label className="font-bold text-sm uppercase block mb-2">Aspect Ratio</label>
        <div className="grid grid-cols-4 gap-2">
          {ASPECT_RATIOS.map((ratio) => (
            <NeoButton
              key={ratio}
              active={aspectRatio === ratio}
              onClick={() => setAspectRatio(ratio)}
              disabled={isGenerating}
              className="text-xs px-1"
            >
              {ratio}
            </NeoButton>
          ))}
        </div>
      </div>

      {/* F) BATCH SIZE */}
      <div>
        <label className="font-bold text-sm uppercase block mb-2 flex justify-between">
          <span>Batch Size</span>
          <span className="text-[10px] font-mono opacity-60 normal-case">Sequential</span>
        </label>
        <div className="flex gap-2">
          {BATCH_SIZES.map((size) => (
            <NeoButton
              key={size}
              active={batchSize === size}
              onClick={() => setBatchSize(size)}
              disabled={isGenerating}
              className="flex-1 text-sm"
            >
              {size}
            </NeoButton>
          ))}
        </div>
      </div>

      {/* G) GENERATE BUTTON */}
      <button
        onClick={handleGenerate}
        disabled={!imagePrompt || !characterImage || isGenerating}
        className={`
          w-full py-6 text-3xl font-black uppercase tracking-[0.2em] transition-all
          flex items-center justify-center gap-3 border-[4px] border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]
          active:translate-x-[6px] active:translate-y-[6px] active:shadow-none
          ${isGenerating 
            ? 'bg-gray-200 text-gray-400 cursor-wait' 
            : (!imagePrompt || !characterImage)
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-yellow-400 hover:bg-yellow-300 text-black'
          }
        `}
      >
        {isGenerating ? (
          <><Loader2 className="animate-spin" size={32} /> WORKING</>
        ) : (
          <><Zap size={32} fill="currentColor" /> GAS</>
        )}
      </button>

      {/* H) CONSOLIDATED RESULTS CARD */}
      <div className="bg-white border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col">
        
        {/* 1. Status Row (Compact) */}
        <div className="h-8 px-3 flex items-center justify-between border-b-2 border-black bg-gray-50 text-[10px] font-mono uppercase tracking-wider">
          <div className="flex gap-3 text-gray-600 font-bold">
            <span>RATIO: {aspectRatio}</span>
            <span className="text-gray-300">|</span>
            <span>BATCH: {batchSize}</span>
          </div>
          <div className={`flex items-center gap-1.5 font-bold ${
            isGenerating ? 'text-blue-600' : 'text-green-600'
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${
              isGenerating ? 'bg-blue-500 animate-pulse' : 'bg-green-500'
            }`} />
            {isGenerating ? 'WORKING' : 'READY'}
          </div>
        </div>

        {/* 2. Notification Bar (Compact) */}
        <div className={`
          h-9 px-3 flex items-center gap-2 border-b-[3px] border-black text-xs font-bold font-mono
          ${notificationType === 'loading' ? 'bg-blue-50 text-blue-800' : ''}
          ${notificationType === 'success' ? 'bg-green-50 text-green-800' : ''}
          ${notificationType === 'error' ? 'bg-red-50 text-red-800' : ''}
          ${notificationType === 'idle' ? 'bg-white text-gray-500' : ''}
        `}>
          {notificationType === 'loading' && <Loader2 className="animate-spin" size={12} />}
          {notificationType === 'success' && <CheckCircle size={12} />}
          {notificationType === 'error' && <AlertCircle size={12} />}
          <span className="truncate flex-1">{notification}</span>
        </div>

        {/* 3. Result Viewer */}
        <div className="min-h-[300px] p-4 bg-gray-50/50">
          {generatedImages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-300 border-2 border-dashed border-gray-200 rounded-lg py-12">
              <ImageIcon size={48} className="mb-2 opacity-50" />
              <p className="text-xs font-mono uppercase tracking-widest">No images generated</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {generatedImages.map((img, idx) => (
                <div 
                  key={img.id} 
                  className="relative aspect-[3/4] bg-white border-[3px] border-black shadow-sm cursor-pointer hover:scale-[1.02] transition-transform group"
                  onClick={() => img.status === 'success' && setPreviewImage(img)}
                >
                  {img.status === 'loading' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100">
                      <Loader2 className="animate-spin text-black mb-2" size={24} />
                      <span className="text-[10px] font-mono animate-pulse text-gray-500">Generating...</span>
                    </div>
                  )}
                  {img.status === 'failed' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-50 p-2 text-center">
                      <AlertCircle className="text-red-500 mb-2" size={24} />
                      <span className="text-[10px] font-bold text-red-600 leading-tight mb-2">
                        {img.error || 'Failed'}
                      </span>
                      <button className="text-[9px] underline text-red-800 uppercase font-bold">Show Log</button>
                    </div>
                  )}
                  {img.status === 'success' && (
                    <>
                      <img src={img.url} alt="Result" className="w-full h-full object-cover" />
                      <div className="absolute top-1 right-1 bg-green-400 border-2 border-black w-3 h-3 rounded-full z-10" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                    </>
                  )}
                  <div className="absolute bottom-0 left-0 bg-black text-white text-[10px] px-1.5 py-0.5 font-mono border-t-2 border-r-2 border-black z-10">
                    #{idx + 1}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* MODAL: SAVE PRESET */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white border-[4px] border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full max-w-sm">
            <div className="bg-purple-200 p-3 border-b-[3px] border-black flex justify-between items-center">
              <h3 className="font-bold uppercase">Save Preset</h3>
              <button onClick={() => setShowSaveModal(false)}><X size={20} /></button>
            </div>
            <div className="p-4">
              <label className="block text-xs font-bold uppercase mb-2">Preset Name</label>
              <input 
                autoFocus
                type="text" 
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                className="w-full border-[3px] border-black p-2 mb-4 font-mono text-sm focus:bg-yellow-50 focus:outline-none"
                placeholder="e.g. Cyberpunk Girl"
              />
              <div className="flex gap-2">
                <NeoButton onClick={() => setShowSaveModal(false)} className="flex-1">Cancel</NeoButton>
                <NeoButton onClick={handleSavePresetConfirm} active className="flex-1">Save</NeoButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: LOAD PRESET */}
      {showLoadModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm">
          <div className="bg-white border-t-[4px] sm:border-[4px] border-black shadow-[0px_-4px_0px_0px_rgba(0,0,0,0.2)] sm:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full max-w-sm max-h-[80vh] flex flex-col">
            <div className="bg-blue-200 p-3 border-b-[3px] border-black flex justify-between items-center">
              <h3 className="font-bold uppercase">Load Character</h3>
              <button onClick={() => setShowLoadModal(false)}><X size={20} /></button>
            </div>
            <div className="p-4 overflow-y-auto grid grid-cols-2 gap-3">
              {presets.length === 0 ? (
                <div className="col-span-2 text-center py-8 text-gray-400 font-mono text-sm">
                  No saved presets found.
                </div>
              ) : (
                presets.map((preset) => (
                  <div key={preset.id} className="relative group">
                    <div 
                      onClick={() => handleLoadPreset(preset)}
                      className="border-[3px] border-black p-2 cursor-pointer hover:bg-yellow-100 active:bg-yellow-200 bg-white transition-colors"
                    >
                      <div className="aspect-square bg-gray-200 mb-2 border-2 border-black overflow-hidden">
                        <img src={preset.image} alt={preset.name} className="w-full h-full object-cover" />
                      </div>
                      <p className="font-bold text-xs text-center truncate">{preset.name}</p>
                    </div>
                    <button 
                      onClick={(e) => handleDeletePreset(preset.id, e)}
                      className="absolute -top-2 -right-2 bg-red-400 border-2 border-black p-1 rounded-full text-white hover:scale-110 transition-transform shadow-sm"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PREVIEW IMAGE */}
      {previewImage && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 backdrop-blur-md">
          <div className="relative max-w-lg w-full">
            <button 
              onClick={() => setPreviewImage(null)}
              className="absolute -top-12 right-0 text-white hover:text-yellow-400 transition-colors"
            >
              <X size={32} />
            </button>
            <div className="bg-white border-[4px] border-black shadow-[8px_8px_0px_0px_rgba(255,255,255,0.2)] p-2">
              <img src={previewImage.url} alt="Preview" className="w-full h-auto max-h-[70vh] object-contain border-2 border-black bg-gray-100" />
              <div className="mt-3 flex gap-2">
                <NeoButton 
                  onClick={() => handleDownload(previewImage)}
                  active
                  className="w-full py-3 uppercase tracking-wider"
                >
                  <Download size={20} /> Download Image
                </NeoButton>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
