export interface BananaApiResponse {
  question: string;
  solution: number;
}

export interface ActivePuzzle {
  puzzleId: string;
  question: string;
  solution: number;
  attempts: number;
  expiresAt: number;
}

export interface PublicPuzzle {
  puzzleId: string;
  question: string;
}

export interface GeneratePuzzleResponse {
  success: boolean;
  message: string;
  data: PublicPuzzle;
}

export interface SubmitAnswerRequest {
  puzzleId: string;
  answer: number;
}
