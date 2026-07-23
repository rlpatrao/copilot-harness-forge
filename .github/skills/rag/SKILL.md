---
name: rag
description: Scaffold a RAG pipeline — embedding service, vector store, retrieval service, chunking, and evaluation tests.
---

# RAG Skill

Scaffold a complete Retrieval-Augmented Generation pipeline based on the architect's design decisions.

## Usage

```
/rag
```

Also invoked by the architect when the BRD describes knowledge base or search requirements.

---

## Prerequisites

- `project-manifest.json` exists with `stack` section populated.
- Architect's design includes vector DB, embedding model, and chunking strategy decisions in `specs/design/`.

---

## Step 1 — Read Architect's Design

Read architect's design documents for:
- Vector database choice (Pinecone, Weaviate, pgvector, Chroma, Qdrant)
- Embedding model (OpenAI, Cohere, local sentence-transformers)
- Chunking strategy (fixed-size, semantic, recursive)
- Retrieval method (similarity, hybrid, MMR)
- Top-k and similarity threshold settings

---

## Step 2 — Generate Embedding Service

Generate `src/services/embedding.py`:
- Client for chosen embedding model
- Batch embedding support
- Dimension validation against vector store config
- Retry logic for API-based embeddings

---

## Step 3 — Generate Vector Store Client

Generate `src/repositories/vector_store.py`:
- Client for chosen vector database
- Index creation and management
- Upsert with metadata
- Search with filters
- Connection pooling and health checks

---

## Step 4 — Generate Retrieval Service

Generate `src/services/retrieval.py`:
- Query embedding + vector search pipeline
- Re-ranking if configured
- Context window assembly (respecting token limits)
- Source attribution (document ID, chunk ID, score)
- Fallback behavior when no relevant results found

---

## Step 5 — Generate Chunking Service

Generate `src/services/chunking.py`:
- Chunking strategy implementation per architect's choice
- Overlap configuration
- Metadata preservation (source document, position, headers)
- Format handling (plain text, markdown, HTML, PDF)

---

## Step 6 — Generate RAG Evaluation Tests

Generate `tests/test_retrieval.py`:
- Relevance tests with sample queries and expected documents
- Precision measurement (relevant results / total results)
- Faithfulness measurement (answer grounded in retrieved context)
- Latency benchmarks for retrieval
- Edge cases: empty results, ambiguous queries, multilingual input

---

## Step 7 — Wire into API Endpoints

Update or generate API endpoints that use the retrieval service:
- Search endpoint with query parameter
- Ingest endpoint for adding documents
- Health endpoint for vector store connectivity

---

## Outputs

| File | Description |
|------|-------------|
| `src/services/embedding.py` | Embedding model client |
| `src/services/retrieval.py` | Query + search + rerank pipeline |
| `src/services/chunking.py` | Document chunking logic |
| `src/repositories/vector_store.py` | Vector database client |
| `tests/test_retrieval.py` | RAG evaluation tests |

---

## References

- `.claude/skills/rag-patterns/SKILL.md` — patterns and anti-patterns for RAG implementations

---

## Gate Behavior

- Retrieval returns relevant results for sample queries
- Evaluation metrics (precision, faithfulness) above configured thresholds
- Vector store health check passes
- Chunking produces consistent output for same input

---

## Gotchas

- **Embedding dimension mismatch.** Verify the embedding model's output dimension matches the vector store index configuration.
- **Chunk overlap matters.** Zero overlap loses context at boundaries. Too much overlap wastes storage and retrieval budget.
- **Don't embed metadata as content.** Keep metadata in vector store filters, not in the embedded text.
- **Token limits are hard limits.** Assembled context must fit within the LLM's context window minus the prompt and expected output.
