import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, GripVertical, Menu, Layout, Save } from 'lucide-react';
import { Editor } from './components/Editor';
import { Preview } from './components/Preview';
import { Sidebar } from './components/Sidebar';
import { AIGeneratorModal } from './components/AIGeneratorModal';
import { Button } from './components/Button';
import { Diagram, Comment } from './types';
import { storageService } from './services/storageService';

// Helper to generate unique IDs
const generateId = () => Math.random().toString(36).substr(2, 9);

export default function App() {
  // --- State: Diagrams ---
  // Initialize from storage service
  const [diagrams, setDiagrams] = useState<Diagram[]>(() => storageService.loadDiagrams());

  const [activeId, setActiveId] = useState<string>(() => storageService.loadActiveId(diagrams));

  // --- State: UI ---
  const [error, setError] = useState<string | null>(null);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  
  // Split pane state
  const [leftWidthPercent, setLeftWidthPercent] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Derived state
  const activeDiagram = diagrams.find(d => d.id === activeId) || diagrams[0];

  // --- Effects ---
  
  // Persist diagrams to localStorage
  useEffect(() => {
    setSaveStatus('saving');
    const timer = setTimeout(() => {
      storageService.saveDiagrams(diagrams);
      setSaveStatus('saved');
    }, 500); // Debounce save slightly

    return () => clearTimeout(timer);
  }, [diagrams]);

  // Persist active ID
  useEffect(() => {
    storageService.saveActiveId(activeId);
  }, [activeId]);

  // Ensure activeId is valid if diagrams change significantly
  useEffect(() => {
    if (!diagrams.find(d => d.id === activeId) && diagrams.length > 0) {
      setActiveId(diagrams[0].id);
    }
  }, [diagrams, activeId]);


  // --- Handlers: Diagram Management ---

  const handleCreateDiagram = () => {
    const newDiagram: Diagram = {
      id: generateId(),
      name: `Untitled ${diagrams.length + 1}`,
      code: `graph TD\n    A[Start] --> B[New Diagram]`,
      comments: [],
      lastModified: Date.now()
    };
    setDiagrams([...diagrams, newDiagram]);
    setActiveId(newDiagram.id);
  };

  const handleDeleteDiagram = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Prevent deleting the last diagram
    if (diagrams.length <= 1) {
      alert("You must have at least one diagram.");
      return;
    }

    if (confirm('Are you sure you want to delete this diagram?')) {
      const newDiagrams = diagrams.filter(d => d.id !== id);
      setDiagrams(newDiagrams);
      
      if (id === activeId) {
        setActiveId(newDiagrams[0].id);
      }
    }
  };

  const updateActiveDiagram = (updates: Partial<Diagram>) => {
    setDiagrams(prev => prev.map(d => 
      d.id === activeId ? { ...d, ...updates, lastModified: Date.now() } : d
    ));
    // Clear error when modifying code
    if (updates.code && error) setError(null);
  };

  // --- Handlers: Comments ---

  const handleAddComment = (commentData: { x: number; y: number; content: string }) => {
    const newComment: Comment = {
      id: generateId(),
      ...commentData,
      createdAt: Date.now()
    };
    
    const currentComments = activeDiagram.comments || [];
    updateActiveDiagram({ 
      comments: [...currentComments, newComment] 
    });
  };

  const handleDeleteComment = (commentId: string) => {
    const currentComments = activeDiagram.comments || [];
    updateActiveDiagram({ 
      comments: currentComments.filter(c => c.id !== commentId) 
    });
  };

  // --- Handlers: Split Pane ---

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newLeftWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
      setLeftWidthPercent(Math.max(20, Math.min(80, newLeftWidth)));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div className="flex flex-col h-screen bg-dark-900 text-gray-200">
      
      {/* Navbar */}
      <header className="flex items-center justify-between px-4 py-2 bg-dark-800 border-b border-gray-700 shadow-md z-20 shrink-0 h-14">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 hover:bg-gray-700 rounded text-gray-400 hover:text-white lg:hidden"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center shadow-lg shadow-brand-500/20">
            <Layout className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-100 to-gray-400 hidden sm:block">
            MermaidViz
          </h1>
        </div>

        <div className="flex items-center gap-4">
          <Button 
            onClick={() => setIsAIModalOpen(true)}
            icon={<Sparkles className="w-4 h-4" />}
            className="bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 border-none h-9"
          >
            Ask AI
          </Button>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* Sidebar (Responsive) */}
        <div className={`${isSidebarOpen ? 'block' : 'hidden'} lg:block h-full`}>
           <Sidebar 
             diagrams={diagrams}
             activeId={activeId}
             onSelect={setActiveId}
             onCreate={handleCreateDiagram}
             onDelete={handleDeleteDiagram}
           />
        </div>

        {/* Workspace - Split View */}
        <main 
          ref={containerRef}
          className="flex-1 overflow-hidden flex flex-col lg:flex-row relative bg-[#0d0d0d]"
        >
          {activeDiagram ? (
            <>
              {/* Editor Pane */}
              <div 
                className="flex-1 lg:flex-none min-w-0 h-1/2 lg:h-full"
                style={{ width: `${leftWidthPercent}%` }}
              >
                <Editor 
                  code={activeDiagram.code} 
                  name={activeDiagram.name}
                  onCodeChange={(code) => updateActiveDiagram({ code })}
                  onNameChange={(name) => updateActiveDiagram({ name })}
                  error={error} 
                />
              </div>

              {/* Resizer Handle */}
              <div
                className="hidden lg:flex w-2 bg-dark-900 border-l border-r border-gray-800 hover:bg-brand-600 cursor-col-resize items-center justify-center transition-colors z-10"
                onMouseDown={handleMouseDown}
              >
                <GripVertical className="w-3 h-3 text-gray-600 pointer-events-none" />
              </div>

              {/* Preview Pane */}
              <div className="flex-1 min-w-0 h-1/2 lg:h-full p-4 bg-[#0d0d0d]">
                <Preview 
                  code={activeDiagram.code}
                  comments={activeDiagram.comments || []}
                  onAddComment={handleAddComment}
                  onDeleteComment={handleDeleteComment}
                  onError={setError}
                  onSuccess={() => setError(null)}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              Select or create a diagram
            </div>
          )}
          
          {/* Overlay while dragging */}
          {isDragging && (
            <div className="absolute inset-0 z-50 cursor-col-resize" />
          )}
        </main>
      </div>

      {/* Footer */}
      <footer className="bg-dark-900 border-t border-gray-800 px-4 py-1 text-xs text-gray-600 flex justify-between items-center shrink-0">
        <span>{diagrams.length} Diagram{diagrams.length !== 1 ? 's' : ''}</span>
        <div className="flex items-center gap-4">
          <span className={`flex items-center gap-1.5 transition-colors ${saveStatus === 'saving' ? 'text-brand-400' : 'text-green-500'}`}>
            <Save className="w-3 h-3" />
            {saveStatus === 'saving' ? 'Saving to browser...' : 'Saved to browser'}
          </span>
          <span className="opacity-50">|</span>
          <span>Mermaid.js v11 • Gemini 2.0 Flash</span>
        </div>
      </footer>

      {/* Modals */}
      <AIGeneratorModal 
        isOpen={isAIModalOpen}
        onClose={() => setIsAIModalOpen(false)}
        onGenerate={(newCode) => {
          updateActiveDiagram({ code: newCode });
          setIsAIModalOpen(false);
        }}
      />
    </div>
  );
}