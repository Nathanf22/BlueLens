import { Diagram, Comment } from '../types';

const generateId = () => Math.random().toString(36).substr(2, 9);

export const useCommentHandlers = (
  activeDiagram: Diagram | undefined,
  updateActiveDiagram: (updates: Partial<Diagram>) => void
) => {
  const handleAddComment = (commentData: { x: number; y: number; content: string }) => {
    if (!activeDiagram) return;
    
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
    if (!activeDiagram) return;
    
    const currentComments = activeDiagram.comments || [];
    updateActiveDiagram({ 
      comments: currentComments.filter(c => c.id !== commentId) 
    });
  };

  return {
    handleAddComment,
    handleDeleteComment
  };
};
