# Graph RAG Frontend API Guide

## Base URL

Use your backend FastAPI server as the base URL.

Local example:

```text
http://localhost:8000
```

## Swagger / API Docs

These are already available from the backend:

- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`
- OpenAPI JSON: `http://localhost:8000/openapi.json`

For frontend work, `/docs` is the fastest way to inspect payloads and test endpoints manually.

## Endpoints

### 1. Health Check

**Method**

```http
GET /
```

**Purpose**

Confirms the API is running.

**Response**

```json
{
  "message": "RAG Pipeline is Running!"
}
```

### 2. Standard RAG Query

**Method**

```http
GET /query?q=...
```

**Purpose**

Runs standard vector retrieval over indexed PDFs.

**Query params**

- `q`: string, required

**Example**

```http
GET /query?q=What is the main finding across these papers?
```

**Response**

```json
{
  "answer": "The papers mainly focus on ...",
  "sources": [
    "First source snippet...",
    "Second source snippet..."
  ]
}
```

### 3. Hybrid Graph RAG Query

**Method**

```http
GET /query/hybrid?q=...
```

**Purpose**

Runs vector retrieval first, then expands with Neo4j graph relationships.

**Query params**

- `q`: string, required

**Example**

```http
GET /query/hybrid?q=What relationships exist between the retrieved papers?
```

**Response**

```json
{
  "answer": "The retrieved papers are connected through ...",
  "seed_papers": ["P0", "P2"],
  "expanded_context": [
    "Related paper title 1",
    "Related paper title 2"
  ]
}
```

### 4. Agent Query

**Method**

```http
GET /query/agent?q=...
```

**Purpose**

Runs planner, researcher, and critic workflow on top of hybrid retrieval.

**Query params**

- `q`: string, required

**Example**

```http
GET /query/agent?q=Compare the main arguments and identify conflicting conclusions.
```

**Response**

```json
{
  "plan": "1. Retrieve base papers ...",
  "answer": "Here is the synthesized answer ...",
  "critique": "VALID"
}
```

### 5. Contradiction Detection

**Method**

```http
POST /query/contradictions
Content-Type: application/json
```

**Purpose**

Compares multiple text inputs and explains contradictions between extracted claims.

**Request body**

```json
{
  "texts": [
    "Paper A claims X improves accuracy.",
    "Paper B claims X reduces accuracy."
  ]
}
```

**Response**

```json
[
  {
    "claim_1": "X improves accuracy.",
    "claim_2": "X reduces accuracy.",
    "explanation": "These claims conflict because ..."
  }
]
```

### 6. PDF Upload

**Method**

```http
POST /query/upload
Content-Type: multipart/form-data
```

**Purpose**

Uploads a PDF, stores it in backend storage, ingests it into Neo4j, and refreshes the RAG index on the next query.

**Form field**

- `file`: PDF file, required

**Response**

```json
{
  "message": "File uploaded successfully.",
  "filename": "paper.pdf",
  "stored_filename": "c6f2f1d0f8df4d2a8e6d3f4e6f7a1b2c.pdf",
  "stored_path": "data/uploads/c6f2f1d0f8df4d2a8e6d3f4e6f7a1b2c.pdf",
  "content_type": "application/pdf"
}
```

## Suggested Frontend API Layer

Create a small API module, for example:

```text
src/services/api.ts
```

Recommended functions:

- `healthCheck()`
- `queryRag(question: string)`
- `queryHybrid(question: string)`
- `queryAgent(question: string)`
- `detectContradictions(texts: string[])`
- `uploadPdf(file: File)`

## TypeScript Types

```ts
export type QueryResponse = {
  answer: string;
  sources: string[];
};

export type HybridQueryResponse = {
  answer: string;
  seed_papers: string[];
  expanded_context: string[];
};

export type AgentQueryResponse = {
  plan: string;
  answer: string;
  critique: string;
};

export type ContradictionExplanation = {
  claim_1: string;
  claim_2: string;
  explanation: string;
};

export type UploadResponse = {
  message: string;
  filename: string;
  stored_filename: string;
  stored_path: string;
  content_type: string | null;
};
```

## Example API Helper

```ts
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export async function queryRag(q: string) {
  const res = await fetch(`${API_BASE}/query?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error("Failed to run standard RAG query");
  return res.json();
}

export async function queryHybrid(q: string) {
  const res = await fetch(`${API_BASE}/query/hybrid?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error("Failed to run hybrid query");
  return res.json();
}

export async function queryAgent(q: string) {
  const res = await fetch(`${API_BASE}/query/agent?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error("Failed to run agent query");
  return res.json();
}

export async function detectContradictions(texts: string[]) {
  const res = await fetch(`${API_BASE}/query/contradictions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ texts }),
  });

  if (!res.ok) throw new Error("Failed to detect contradictions");
  return res.json();
}

export async function uploadPdf(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/query/upload`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(error || "Failed to upload PDF");
  }

  return res.json();
}
```

## Suggested UI Flow

### Upload flow

1. User selects a PDF
2. Frontend sends it to `POST /query/upload`
3. Show upload success or failure
4. Enable query actions after successful upload

### Query flow

1. User enters a question
2. Frontend calls one of:
   - `/query`
   - `/query/hybrid`
   - `/query/agent`
3. Display answer
4. Optionally render sources, seed papers, expanded context, or critique

### Contradiction flow

1. User pastes multiple text blocks
2. Frontend sends them to `/query/contradictions`
3. Render contradiction cards with explanation text

## Environment Variable for Frontend

Add this to your frontend `.env`:

```env
VITE_API_BASE_URL=http://localhost:8000
```

Then use:

```ts
const API_BASE = import.meta.env.VITE_API_BASE_URL;
```

## Important Notes

- Upload currently supports only `.pdf`
- Uploaded files are stored by the backend in `data/uploads`
- After upload, the next query rebuilds the in-memory RAG index
- If frontend and backend run on different ports, you may need CORS enabled in FastAPI
- `/docs` is the easiest way to inspect the exact live API behavior during frontend integration

## Recommended Frontend Screens

- Upload page
- Query page with tabs for `Standard`, `Hybrid`, and `Agent`
- Contradiction analysis page
- Optional debug panel showing raw API response
