# Banana API

External puzzle source: `https://marcconrad.com/uob/banana/api.php?out=json`

## Response

```json
{ "question": "https://www.sanfoh.com/uob/banana/data/....png", "solution": 7 }
```

- `question`: URL of the puzzle image
- `solution`: the number hidden under the banana

The API has **no authentication and no difficulty parameter**, which is why difficulty is done in the game (see `TECHNICAL-DECISIONS.md` §11).

## How we call it (`backend/src/modules/banana/banana.service.ts`)

- Only the **backend** calls it, never the browser, so the solution never reaches the client.
- A 15 s timeout with `AbortController`, so a slow API can't hang a request.
- The response is read as text and then parsed, because the provider can label JSON as `text/html`.
- Validation:
  - non-2xx responses rejected;
  - invalid JSON rejected;
  - missing `question` or `solution` rejected;
  - the solution must be a finite number;
  - the image URL must be **HTTPS** (no mixed content, no tampered links).
- The call happens **outside** the database transaction (no DB transaction held open during network I/O), followed by a re-check inside a transaction in case another player already created the puzzle.

## Interoperability notes

- The API returns JSON over HTTP, so it's language and platform neutral.
- If the API is down, the error is reported to the player and nothing is half-saved, because the puzzle is only stored after a valid response.
- The tests mock `fetch`, so they don't depend on the third-party service being up.
