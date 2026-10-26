import { createContext, useContext } from 'react';

/**
 * Lets image nodes inside the editor offer "Cắt lại" for figures that were
 * cropped from the original exam pages during AI import.
 */
export interface FigureCropContextValue {
  canRecrop: (imageUrl: string) => boolean;
  /** Opens the crop UI; resolves with the new image URL, or null if cancelled. */
  recrop: (imageUrl: string) => Promise<string | null>;
  /** AI is redrawing figures right now: those without a result yet say so where they are. */
  redrawing?: boolean;
}

export const FigureCropContext = createContext<FigureCropContextValue | null>(null);

export const useFigureCrop = () => useContext(FigureCropContext);
