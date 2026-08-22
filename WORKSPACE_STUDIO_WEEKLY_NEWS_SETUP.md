# Workspace Studio Weekly News Setup — Legacy / Fallback Only

> **Status: legacy fallback only.** The active production automation is `.github/workflows/weekly-news-gemini.yml`, which runs Gemini API + Google Search Grounding from GitHub Actions every Sunday at 19:00 Australia/Brisbane. The Workspace Studio webhook path below is retained only as a future fallback if `Send a webhook` becomes available for this Workspace tenant.
>
> Production migration to GitHub Actions was E2E-validated on 2026-08-22. Do not enable this Workspace Studio flow in parallel with the active GitHub Actions schedule, because doing so would create duplicate research runs.

Google Workspace Studio / Gemini へ `WHV Weekly News` を移行するために検討した旧設定手順。

既存サイト側のニュース処理は作り直さない。

```text
Workspace Studio schedule
  -> Ask Gemini (Web search / List)
  -> Repeat for each candidate
  -> Send a webhook
  -> /api/news/candidates/workspace-studio
  -> submitExternalCandidate()
  -> external_news_candidates (pending)
  -> existing scheduled processor
  -> relevance / dedupe / generation / grounding / risk
  -> low/medium risk publish OR high-risk review
  -> article impact / AI indexing
```

## 1. Preconditions

- Migration `0014_external_news_candidates.sql` is already applied.
- Apply `0015_workspace_studio_news_origin.sql` before enabling the Workspace flow.
- Production Vercel environment has the existing Supabase/Gemini secrets required by the news pipeline.
- Existing `Process External News Candidates` GitHub Action remains enabled.

## 2. Vercel environment variable

Create a new **scoped secret** for this integration only:

```text
WORKSPACE_STUDIO_NEWS_INGEST_SECRET=<long random value>
```

Optional:

```text
WORKSPACE_STUDIO_NEWS_INGEST_RATE_MAX=30
```

Rules:

- Do not reuse `SUPABASE_SERVICE_ROLE_KEY`.
- Do not reuse the existing `EXTERNAL_NEWS_INGEST_SECRET`.
- Use a long random value (at least 32 random bytes / roughly 43+ URL-safe characters).
- Add it to Production; add to Preview only if deliberately testing a Preview deployment.
- Redeploy after adding/changing the variable.

## 3. Workspace Studio flow

Recommended flow name:

```text
WHV Weekly News - Gemini
```

### Starter

Use **On a schedule**.

- Frequency: Weekly
- Day: Sunday
- Time: 19:00
- Time zone: Australia/Brisbane

### Step 1 - Ask Gemini

Use Gemini with **Web search enabled**.
Set the response format to **List** so each candidate can be processed independently.

Prompt:

```text
Research official Australian government primary sources for genuinely new or materially updated information relevant to Japanese Working Holiday visa (subclass 417) holders.

Time window:
- Review at least the previous 14 days from the run date so late-published corrections and updates are not missed.

Priority sources:
- Department of Home Affairs
- Australian Taxation Office (ATO)
- Fair Work Ombudsman
- Services Australia only when directly relevant
- State or Territory government sources only when directly relevant to working holiday makers (for example licence, rego, tenancy/bond, workplace matters)

Source rules:
- Use official Australian government primary sources only.
- Do not use blogs, Reddit, social media, news media, migration-agent articles, aggregators, or third-party summaries as evidence.
- Do not include an item unless you can verify an official URL, official title, and official publication date from the source.
- Do not invent or infer dates, amounts, thresholds, eligibility, or legal conclusions.
- Focus on changes that are actually useful to Japanese subclass 417 holders. Do not include generic government news merely because visa holders might exist among the audience.

Output rules:
- Return a LIST with zero or more items.
- EACH list item must be exactly one valid compact JSON object and nothing else.
- Do not wrap the whole list in JSON or Markdown code fences.
- Use this exact object shape:

{"sourceUrl":"https://...","sourceTitle":"...","sourceOrganisation":"...","sourcePublishedAt":"YYYY-MM-DD","sourceUpdatedAt":null,"evidence":{"summary":"...","facts":["..."],"numbers":[{"value":"...","context":"..."}],"dates":[{"value":"...","context":"..."}]},"categoryHint":"visa|tax|cost|site|other","evidenceOrigin":"external_research"}

Field rules:
- sourceUpdatedAt: use YYYY-MM-DD only when explicitly shown by the official source; otherwise null.
- evidence.summary: concise verified factual summary from the official source.
- evidence.facts: only facts directly supported by the official source.
- evidence.numbers: only material verified numbers, amounts, rates, thresholds or counts; use [] if none.
- evidence.dates: material verified dates and what each date means; use [] if none.
- categoryHint: choose one of visa, tax, cost, site, other.
- evidenceOrigin must be external_research.

Important:
- Do not try to publish news.
- Do not create Japanese news copy here.
- Do not try to access private user data.
- Exact duplicate detection and downstream relevance/risk/publication are handled by the WHV Compass backend, so it is safe to return a previously seen official item when the official source has genuinely changed.
- If there is no qualifying official update, return an empty list.
```

### Step 2 - Repeat for each

Repeat over the List returned by Step 1.

### Step 3 - Send a webhook

Inside the repeat block:

Method:

```text
POST
```

URL:

```text
https://whv-guide-australia.com/api/news/candidates/workspace-studio?token=<WORKSPACE_STUDIO_NEWS_INGEST_SECRET>
```

Payload:

Use the **current item from the Repeat for each step as the entire payload**.
Do not put it inside another JSON object. Each current item is already the exact JSON object expected by the endpoint.

The endpoint returns one of:

```json
{"ok":true,"id":"...","deduplicated":false,"status":"accepted"}
```

or an idempotent duplicate result:

```json
{"ok":true,"id":"...","deduplicated":true,"status":"duplicate"}
```

Validation failures return 4xx and can be inspected in Workspace Studio activity.

## 4. Why dedupe is delegated to WHV Compass

The old ChatGPT task explicitly compared findings against Supabase before insertion. Workspace Studio does not need database read access.

The existing backend already performs:

1. official URL allow-list validation and canonicalisation,
2. official-source registry resolution,
3. publication/update date validation,
4. evidence sufficiency validation,
5. deterministic evidence hashing,
6. unique `(source_url, source_evidence_hash)` ingestion dedupe,
7. downstream semantic/event dedupe before publication.

Keeping DB access out of Workspace Studio reduces credentials and preserves one authoritative safety pipeline.

## 5. Processing / notifications

The Workspace endpoint only queues candidates as `pending`.

Existing processing remains responsible for:

- relevance classification,
- duplicate confirmation,
- grounded Japanese news generation,
- risk policy,
- publication,
- article impact analysis,
- AI indexing,
- `review_required` moderator notifications.

The existing scheduled external-candidate processor remains the retry/fallback path.

## 6. Acceptance test

Before disabling the ChatGPT task:

1. Deploy this branch/migration and set the Vercel scoped secret.
2. In Workspace Studio, temporarily run the flow manually.
3. Confirm the flow completes without webhook errors.
4. Query/check `external_news_candidates` and confirm any new row has:
   - `origin = gemini_weekly`
   - `evidence_origin = external_research`
   - `status = pending` initially (or a later downstream status if already processed)
5. Re-run the same test payload and confirm no duplicate row is created.
6. Confirm no direct `news_items` write happens at ingestion.
7. Run/allow the existing candidate processor.
8. Confirm high-risk content becomes `review_required` and can be reviewed from mobile admin.
9. Confirm low/medium-risk content follows the existing publication policy.
10. Only after this test succeeds, disable the old ChatGPT `WHV Weekly News` task.

## 7. Rollback

If the active GitHub Actions + Gemini API flow becomes unreliable and Workspace Studio webhook support is later available:

- disable the active GitHub Actions weekly schedule before enabling this fallback,
- keep the existing direct government monitor and manual mobile import intact,
- use this Workspace Studio path only after a fresh acceptance test.

Do not run both weekly research schedulers in parallel. Do not remove the existing candidate inbox or shared publication pipeline.
