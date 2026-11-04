export interface BananaPuzzleData {
  question: string;
  solution: number;
}

function getBananaApiUrl(): string {
  return (
    process.env.BANANA_API_URL ??
    "https://marcconrad.com/uob/banana/api.php?out=json"
  );
}

export class BananaApiService {
  async fetchPuzzle(): Promise<BananaPuzzleData> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(getBananaApiUrl(), {
        method: "GET",
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`Banana API returned HTTP ${response.status}`);
      }

      // The provider may label its JSON response as text/html.
      const responseText = await response.text();

      let data: unknown;

      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error("Banana API returned invalid JSON");
      }

      if (
        typeof data !== "object" ||
        data === null ||
        !("question" in data) ||
        !("solution" in data)
      ) {
        throw new Error("Banana API response has an invalid structure");
      }

      const question = (data as { question: unknown }).question;
      const solution = (data as { solution: unknown }).solution;

      if (
        typeof question !== "string" ||
        typeof solution !== "number" ||
        !Number.isFinite(solution)
      ) {
        throw new Error("Banana API returned invalid puzzle data");
      }

      const questionUrl = new URL(question);

      if (questionUrl.protocol !== "https:") {
        throw new Error("Banana API returned a non-HTTPS image URL");
      }

      return {
        question: questionUrl.toString(),
        solution,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const bananaApiService = new BananaApiService();
