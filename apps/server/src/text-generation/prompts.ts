const EARLIER_CONTENT_TRUNCATION_MARKER = "[Earlier content truncated]\n\n"

const INITIAL_THREAD_TITLE_PROMPT = `Generate a title that will help the user recognize this Noyau thread weeks later.
Return JSON with exactly one key: title.

Before answering, silently reduce the request to:
- Subject: What system, feature, or problem is this really about?
- Outcome: What does the user ultimately want to understand or change?
- Incidental instructions: What only describes how the agent should do the work?

Title the subject and outcome. Discard incidental instructions.

Editorial rules:
- 3-8 words, fewer than 40 characters.
- Use a compact noun phrase or clear action phrase.
- Capture the umbrella goal when the request lists several symptoms or steps.
- Name the product change, not the mock, plan, report, branch, or PR used to produce it.
- Models, subagents, tools, output formats, and monitoring instructions do not belong in the title unless they are themselves the topic.
- For reviews, name what is being reviewed and the relevant concern. Avoid generic titles such as "Review PR 123" when linked or attached context reveals the subject.
- For research, name the question domain rather than the requested research process.
- Do not claim the work is complete.
- Do not copy and truncate the user's message.
- Avoid project names already visible in the UI, quotes, labels, filler, and trailing punctuation.
- When a URL is the only source of the subject, remain accurate rather than guessing.`

const regenerateThreadTitlePrompt = (previousTitle: string): string =>
  `Regenerate the title for an existing Noyau thread so the user can recognize it weeks later.
The previous title was ${JSON.stringify(previousTitle)}.
Return JSON with exactly one key: title.

Determine the title in this order:
1. Read the USER messages first. Identify the latest explicit durable goal. The original subject remains the subject until the user clearly changes what the thread is about.
2. Use ASSISTANT messages to resolve vague links, unnamed code, and discovered product nouns. Do not promote one assistant finding into the thread subject unless the user adopts it as a new goal.
3. Compare that subject with the previous title. Preserve accurate scope words, especially when earlier content is truncated. Replace the previous title when it is generic, artifact-based, a completion update, or contradicted by the thread.
4. Title the durable subject and desired outcome, not the current workflow state.

Editorial rules:
- 3-8 words, fewer than 40 characters.
- Use a compact noun phrase or clear action phrase.
- Preserve the umbrella subject when later messages focus on one finding, provider, platform, or implementation detail.
- A thread progressing through research, planning, implementation, review, CI, merge, and monitoring has usually not changed subjects.
- Ignore deliverables and operations such as mocks, plans, HTML, branches, PRs, tests, CI, commits, merging, and monitoring unless they are the actual topic.
- Models, subagents, tools, output formats, and monitoring instructions do not belong in the title unless they are themselves the topic.
- Treat final operational follow-ups and assistant completion summaries as weak evidence of subject.
- For reviews, name the reviewed feature or system and its durable concern, not one finding from the review.
- For research, name the question domain rather than the research process.
- Do not claim the work is complete.
- Do not copy and truncate a thread message.
- Avoid project names already visible in the UI, PR numbers, quotes, labels, filler, and trailing punctuation.
- When a URL is the only source of the subject, remain accurate rather than guessing.
- Return a meaningfully improved title, not a cosmetic paraphrase of the previous title.`

const limitSection = (value: string, maxChars: number): string => {
  if (value.length <= maxChars) {
    return value
  }
  return `${value.slice(0, maxChars)}\n\n[truncated]`
}

const preserveMessageEnd = (message: string): string => {
  const alreadyTruncated = message.startsWith(EARLIER_CONTENT_TRUNCATION_MARKER)
  const contents = alreadyTruncated
    ? message.slice(EARLIER_CONTENT_TRUNCATION_MARKER.length)
    : message
  if (!alreadyTruncated && contents.length <= 8_000) {
    return contents
  }
  return `${EARLIER_CONTENT_TRUNCATION_MARKER}${contents.slice(-8_000)}`
}

export interface ThreadTitlePromptInput {
  readonly message: string
  readonly previousTitle?: string
}

export const buildThreadTitlePrompt = (input: ThreadTitlePromptInput): string => {
  if (input.previousTitle === undefined) {
    return `${INITIAL_THREAD_TITLE_PROMPT}\n\nUser message:\n${limitSection(input.message, 8_000)}`
  }
  return `${regenerateThreadTitlePrompt(input.previousTitle)}\n\nThread contents:\n${preserveMessageEnd(input.message)}`
}

const COMMIT_DRAFT_PROMPT = `Generate a git commit message from the working tree context.
Return JSON with keys: title, and optional body.

Rules:
- title is a single conventional-commit line, under 72 characters.
- body is optional, 1-4 short sentences, only when the change needs explanation.
- Do not wrap the title in quotes.
- Do not mention that you are an AI.`

const PULL_REQUEST_DRAFT_PROMPT = `Generate a GitHub pull request title and body from the branch context.
Return JSON with keys: title, body.

Rules:
- title is one line, under 72 characters.
- body is a short markdown summary: problem then change. No checklist.
- Do not mention that you are an AI.`

export const buildGitDraftPrompt = (kind: "commit" | "pr", context: string): string => {
  const prompt = kind === "commit" ? COMMIT_DRAFT_PROMPT : PULL_REQUEST_DRAFT_PROMPT
  return `${prompt}\n\nGit context:\n${limitSection(context, 8_000)}`
}

export const extractJsonObject = (raw: string): string => {
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  if (start === -1 || end <= start) {
    return raw.trim()
  }
  return raw.slice(start, end + 1)
}
