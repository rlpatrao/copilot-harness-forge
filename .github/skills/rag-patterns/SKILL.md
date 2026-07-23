---
name: rag-patterns
description: Reference patterns for Retrieval-Augmented Generation — chunking strategies, embedding models, vector databases, retrieval patterns, reranking, evaluation, and agentic RAG.
---

# RAG Patterns

Comprehensive reference for building RAG systems. Covers the full pipeline from chunking to evaluation.

## When to Use RAG vs Fine-Tuning vs Long Context

| Approach | Use When | Avoid When |
|----------|----------|------------|
| **RAG** | Knowledge changes frequently, need source attribution, corpus is large (>1M tokens), need to combine multiple sources | Corpus is small enough to fit in context, latency is critical (adds retrieval hop) |
| **Fine-tuning** | Need to change model behavior/style, domain-specific terminology, consistent formatting requirements | Knowledge changes frequently (retraining is expensive), need source attribution |
| **Long context** | Corpus fits in context window (<200K tokens), need full document understanding, one-off analysis | Corpus is large, need to serve many users (cost per request), knowledge changes often |
| **RAG + Fine-tuning** | Need both domain behavior and dynamic knowledge | Simple use cases where one approach suffices |

**Rule of thumb:** Start with long context. If the corpus grows beyond the window or cost becomes prohibitive, move to RAG. Fine-tune only when you need to change how the model behaves, not what it knows.

## Chunking Strategies

| Strategy | How It Works | Pros | Cons | Best For |
|----------|-------------|------|------|----------|
| **Fixed-size** | Split every N tokens with M overlap | Simple, predictable | Breaks mid-sentence, loses structure | Unstructured text, logs |
| **Semantic** | Split at sentence/paragraph boundaries using NLP | Preserves meaning | Uneven chunk sizes, needs NLP model | Articles, documentation |
| **Recursive** | Split by headers > paragraphs > sentences > tokens | Preserves hierarchy | More complex implementation | Structured documents, markdown |
| **Document-aware** | Parse document structure (HTML, PDF, code) and split at logical boundaries | Best context preservation | Needs per-format parser | Code, HTML, PDFs, legal docs |

### Recommended Defaults

- **Chunk size:** 512-1024 tokens (smaller for precision, larger for context)
- **Overlap:** 10-20% of chunk size (64-128 tokens for 512-token chunks)
- **Metadata:** Always attach: source file, section heading, page number, chunk index

### Code-Aware Chunking

For code repositories, chunk by:
1. Function/method (with docstring and type hints)
2. Class (if small enough, otherwise split by method)
3. File-level imports + module docstring as a separate chunk
4. Never split mid-function

## Embedding Model Selection

| Model | Dimensions | Context | Performance | Cost | Notes |
|-------|-----------|---------|-------------|------|-------|
| **OpenAI text-embedding-3-large** | 3072 (adjustable) | 8191 tokens | Top tier on MTEB | ~$0.13/1M tokens | Can reduce dimensions for cost savings |
| **OpenAI text-embedding-3-small** | 1536 (adjustable) | 8191 tokens | Good | ~$0.02/1M tokens | Best cost/performance ratio for most use cases |
| **Cohere embed-v3** | 1024 | 512 tokens | Competitive with OpenAI | ~$0.10/1M tokens | Native multilingual, has search/classification modes |
| **sentence-transformers (local)** | 384-1024 | 512 tokens | Varies by model | Free (compute only) | No data leaves your infra, good for sensitive data |
| **Voyage AI voyage-3** | 1024 | 32K tokens | Strong on code | ~$0.06/1M tokens | Long context, good for code retrieval |

### Selection Rules

- **Default choice:** OpenAI text-embedding-3-small — best cost/performance for most apps.
- **Sensitive data:** sentence-transformers locally — no data sent to third parties.
- **Code search:** Voyage AI voyage-3 — trained on code, long context.
- **Multilingual:** Cohere embed-v3 — native multilingual support.
- **Never mix models** in the same index. Re-embed everything if you switch models.

## Vector Database Selection

| Database | Type | Best For | Scaling | Cost Model |
|----------|------|----------|---------|------------|
| **pgvector** | Extension | Already using PostgreSQL, <1M vectors | Vertical | Free (part of PostgreSQL) |
| **Pinecone** | Managed SaaS | Production at scale, no ops team | Horizontal, managed | Pay per usage |
| **Qdrant** | Self-hosted / Cloud | Full control, filtering, hybrid search | Horizontal | Free (self-hosted) or managed |
| **ChromaDB** | Embedded | Prototyping, small datasets, local dev | Single node | Free |
| **Weaviate** | Self-hosted / Cloud | Hybrid search (vector + keyword), multi-modal | Horizontal | Free (self-hosted) or managed |

### Selection Rules

- **Already on PostgreSQL?** Start with pgvector. Migrate when you hit performance limits.
- **Prototype / hackathon?** ChromaDB — zero config, pip install.
- **Production, no ops?** Pinecone — fully managed, scales automatically.
- **Need hybrid search?** Weaviate or Qdrant — native keyword + vector support.
- **Sensitive data, on-prem?** Qdrant self-hosted — no data leaves your network.

## Retrieval Patterns

### Naive Retrieval

```
Query → Embed → Vector Search (top-K) → LLM
```

Simple but effective for straightforward Q&A. Limitations: no keyword matching, no query refinement.

### Hybrid Retrieval (Keyword + Vector)

```
Query → [Vector Search (top-K)] + [BM25/Keyword Search (top-K)] → Merge → LLM
```

Combines semantic similarity with exact keyword matching. Better recall than either alone.

```python
# Reciprocal Rank Fusion to merge results
def reciprocal_rank_fusion(results_lists: list[list], k: int = 60) -> list:
    scores = {}
    for results in results_lists:
        for rank, doc in enumerate(results):
            scores[doc.id] = scores.get(doc.id, 0) + 1 / (k + rank + 1)
    return sorted(scores.items(), key=lambda x: x[1], reverse=True)
```

### Agentic Retrieval

```
Query → Agent decides: which source? what query? → Retrieve → Evaluate → Refine query? → Retrieve again? → LLM
```

The agent controls retrieval: it can rephrase queries, pick sources, evaluate results, and iterate. Best for complex questions requiring multi-step reasoning.

```python
class AgenticRetriever:
    def retrieve(self, query: str, max_iterations: int = 3) -> list[Document]:
        for i in range(max_iterations):
            # Agent decides what to search and where
            search_plan = self.agent.plan_search(query, self.available_sources)
            results = self.execute_searches(search_plan)
            # Agent evaluates if results are sufficient
            evaluation = self.agent.evaluate_results(query, results)
            if evaluation.sufficient:
                return evaluation.selected_documents
            # Agent refines the query for next iteration
            query = evaluation.refined_query
        return results  # Return best effort after max iterations
```

### Multi-Index Retrieval

Route queries to specialized indices based on content type:

```
Query → Router → [Code Index] or [Docs Index] or [API Index] → Merge → LLM
```

## Reranking

Raw retrieval returns candidates; reranking picks the best ones.

| Method | How It Works | Quality | Latency | Cost |
|--------|-------------|---------|---------|------|
| **Cohere Rerank** | Cross-encoder API | High | ~100ms | ~$2/1K queries |
| **Cross-encoder (local)** | sentence-transformers cross-encoder | High | ~200ms | Free (compute) |
| **Reciprocal Rank Fusion** | Merge ranked lists by formula | Medium | <1ms | Free |
| **LLM-as-reranker** | Ask LLM to pick best passages | Highest | ~1-3s | LLM API cost |

### Recommended Approach

1. Retrieve top-20 with vector search
2. Rerank to top-5 with Cohere Rerank or cross-encoder
3. Pass top-5 to LLM for generation

This gives the best quality/cost tradeoff. Skip reranking only for prototypes.

## Evaluation (RAGAS Metrics)

| Metric | What It Measures | How to Compute |
|--------|-----------------|----------------|
| **Retrieval Precision** | Are retrieved docs relevant? | LLM judges each retrieved chunk for relevance to query |
| **Retrieval Recall** | Did we find all relevant docs? | Compare retrieved set against annotated ground truth |
| **Answer Faithfulness** | Is the answer grounded in retrieved context? | LLM checks if each claim in answer has supporting evidence in context |
| **Answer Relevancy** | Does the answer address the question? | LLM rates how well the answer matches the query intent |
| **Hallucination Rate** | Does the answer contain unsupported claims? | 1 - Faithfulness. Claims in answer not found in retrieved context |

### Evaluation Pipeline

```python
from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy, context_precision, context_recall

results = evaluate(
    dataset=eval_dataset,  # questions + ground truth + retrieved contexts + answers
    metrics=[faithfulness, answer_relevancy, context_precision, context_recall],
)
```

### Target Metrics

| Metric | Minimum | Good | Excellent |
|--------|---------|------|-----------|
| Retrieval Precision | >0.6 | >0.8 | >0.9 |
| Answer Faithfulness | >0.7 | >0.85 | >0.95 |
| Hallucination Rate | <0.3 | <0.15 | <0.05 |

### Rules

- Evaluate before shipping and on every retrieval pipeline change.
- Build an eval dataset of at least 50 question-answer pairs with ground truth.
- Track metrics over time — regressions mean something changed (embeddings, chunking, data).

## Agentic RAG

Agent-driven retrieval with iterative retrieve-evaluate-refine loops.

### When to Use

- Complex questions requiring information from multiple sources
- Queries that need decomposition (multi-hop reasoning)
- Dynamic knowledge bases where relevance assessment needs judgment

### Architecture

```
User Query
    │
    ▼
┌──────────────────┐
│  Planning Agent   │ ← Decomposes query into sub-questions
└──────────────────┘
    │
    ▼
┌──────────────────┐
│ Retrieval Agent   │ ← Searches relevant sources, evaluates results
└──────────────────┘
    │
    ▼
┌──────────────────┐
│ Synthesis Agent   │ ← Combines retrieved info into coherent answer
└──────────────────┘
    │
    ▼
┌──────────────────┐
│ Verification Agent│ ← Checks answer against sources, flags gaps
└──────────────────┘
```

### Key Patterns

- **Query decomposition:** Break complex questions into simple sub-queries.
- **Source selection:** Agent picks which index/DB/API to query based on the sub-query.
- **Self-evaluation:** After retrieval, agent assesses if the results are sufficient.
- **Iterative refinement:** If results are insufficient, agent reformulates and retries.
- **Citation tracking:** Every claim maps back to a specific chunk with source attribution.

## Anti-Patterns

| Anti-Pattern | Problem | Fix |
|-------------|---------|-----|
| Chunks too large (>2K tokens) | Dilutes relevance, wastes context window | Use 512-1024 token chunks |
| Chunks too small (<100 tokens) | Loses context, fragments meaning | Ensure chunks are self-contained |
| No overlap between chunks | Misses information at boundaries | Use 10-20% overlap |
| No reranking | Top-K retrieval returns many irrelevant results | Add reranking step (Cohere, cross-encoder) |
| Ignoring metadata | Cannot filter by source, date, or section | Attach metadata at indexing time |
| No evaluation | No idea if RAG is actually working | Implement RAGAS metrics from day one |
| Same embedding for all content | Code and prose have different semantics | Use specialized embeddings per content type |
| Not updating the index | Stale knowledge leads to wrong answers | Build an indexing pipeline that runs on data changes |
| Embedding queries and docs the same | Query and document have different distributions | Use asymmetric embeddings or query expansion |
