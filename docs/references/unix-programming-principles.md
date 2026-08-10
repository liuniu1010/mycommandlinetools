# Unix Programming Principles for This Repository

Status: Reference guidance

Source: Eric S. Raymond, *The Art of Unix Programming*, revision 1.0,
19 September 2003. The unchanged book is stored as
`docs/references/the-art-of-unix-programming.pdf`.

This document is an independently written summary and repository-specific
interpretation. It is not part of the book and does not replace reading the source.
The principles are heuristics, not automatic requirements. Current security practices,
the repository's `AGENTS.md`, an approved design, and explicit user instructions take
precedence.

## The 17 Core Rules

The book collects these named rules in Chapter 1, principally on printed pages 35–48.
The explanations below are paraphrases.

### 1. Modularity

Build a system from small components with narrow, well-defined boundaries. A defect or
change should usually remain local instead of requiring knowledge of the whole system.

Repository application:

- Keep each CLI focused on its provider and command set.
- Extract a helper only when it creates a genuinely clearer boundary.
- Avoid coupling one tool's authentication, parsing, or output behavior to another tool.

### 2. Clarity

Prefer code that a future maintainer can understand directly over code that demonstrates
cleverness. A small performance gain rarely justifies a large increase in obscurity.

Repository application:

- Use direct control flow and descriptive names.
- Explain non-obvious provider constraints and safety decisions.
- Match the established local patterns unless deviation has a concrete benefit.

### 3. Composition

Design programs so other programs can invoke them, consume their output, and combine
them into larger workflows.

Repository application:

- Keep commands non-interactive unless interaction is essential.
- Provide stable output, meaningful exit status, and machine-readable output where it
  is useful and already consistent with the CLI.
- Keep diagnostic messages separate from data output.

### 4. Separation

Keep policy decisions separate from mechanisms, and keep user-facing interfaces
separate from the engines that perform work. They change for different reasons and at
different rates.

Repository application:

- Separate argument interpretation from provider requests where practical within a
  self-contained CLI.
- Keep URL construction, validation, transport, and presentation conceptually distinct.
- Do not bury safety policy inside low-level helpers where callers cannot see it.

### 5. Simplicity

Start with the simplest design that satisfies the real requirement. Introduce
complexity only when a demonstrated need pays for it.

Repository application:

- Prefer built-in Node.js APIs and existing patterns.
- Reject speculative configuration, abstraction, or dependencies.
- Make the common path obvious and keep exceptional paths explicit.

### 6. Parsimony

Choose a large program or framework only after smaller cooperating solutions have been
considered and shown inadequate.

Repository application:

- Preserve the repository's self-contained CLI structure.
- Do not create shared runtime infrastructure merely to remove a small duplication.
- Require concrete evidence before introducing a framework or broad refactor.

### 7. Transparency

Make behavior and relevant state visible enough that people can inspect, diagnose, and
verify the program.

Repository application:

- Produce useful errors without exposing secrets.
- Make dry-run, URL-printing, help, and read-only verification paths available when
  they materially improve safety.
- Prefer formats and control flow that tests and debugging tools can inspect.

### 8. Robustness

Robust systems usually emerge from simple, observable behavior rather than layers of
special-case recovery.

Repository application:

- Validate boundary inputs and handle empty, missing, malformed, and unexpectedly large
  inputs deliberately.
- Minimize special cases and hidden state.
- Test assumptions at provider, filesystem, subprocess, and serialization boundaries.

### 9. Representation

Place knowledge in well-structured data when that makes the executable logic smaller,
more regular, and easier to verify.

Repository application:

- Prefer tables or declarative command metadata over repetitive condition chains when
  the data model stays clear.
- Do not make a data structure more general than the real domain.
- Keep invalid states difficult to represent and distinct states distinguishable.

### 10. Least Surprise

Interfaces should align with users' existing expectations and the conventions of
similar tools. Superficial similarity with subtly different behavior is especially
dangerous.

Repository application:

- Reuse established flag names, help layout, exit behavior, and environment conventions.
- Preserve backward compatibility unless a breaking change is explicitly approved.
- Evaluate surprise from the user's perspective, not only the implementer's.

### 11. Silence

Successful routine operation should not compete for attention. Output should carry
requested data or genuinely useful information.

Repository application:

- Send requested data to standard output and diagnostics to standard error.
- Avoid startup, completion, and confirmation chatter that adds no information.
- Put detailed progress or debugging information behind an explicit verbosity option.

### 12. Repair

Recover safely when recovery is well-defined. Otherwise fail early, visibly, and close
to the cause rather than allowing delayed corruption.

Repository application:

- Reject invalid arguments before authentication or network activity.
- Return actionable errors and nonzero exit status on failure.
- Never conceal partial external side effects or pretend an operation succeeded.

### 13. Economy

Optimize primarily for human development and maintenance time unless measurement shows
that machine resources are the real constraint.

Repository application:

- Reuse reliable platform facilities and existing repository patterns.
- Automate repetitive validation and generation when the automation is simpler than the
  work it replaces.
- Avoid manual procedures that are difficult to reproduce or audit.

### 14. Generation

When repetitive, error-prone artifacts can be derived from a simpler authoritative
description, generate them rather than maintaining each copy by hand.

Repository application:

- Keep the generator input as the source of truth.
- Never hand-edit `dist/` or other generated output.
- Add generation only when the generator and its specification are simpler than manual
  maintenance.

### 15. Optimization

First establish correct behavior and a sound design. Measure real bottlenecks before
tuning them, and buy performance with the smallest possible increase in complexity.

Repository application:

- Build and verify a straightforward implementation first.
- Benchmark before adding caches, concurrency, or specialized algorithms.
- Recheck correctness and operational safety after optimization.

### 16. Diversity

No language, architecture, interface, or tool is universally best. Choose based on the
problem while retaining interoperability and open boundaries.

Repository application:

- Prefer repository conventions, but allow justified exceptions such as Playwright.
- Do not force one provider's model onto every provider.
- Judge alternatives with evidence rather than fashion or absolutism.

### 17. Extensibility

Allow foreseeable evolution without prematurely implementing speculative features.
Flexible joints are valuable; unused machinery is not.

Repository application:

- Make formats and interfaces evolvable while maintaining compatibility.
- Centralize validation and dispatch points where new commands naturally attach.
- Do not build features before they are needed merely in the name of extensibility.

## Additional Named Principles

### One focused purpose and interoperable streams

The early Unix formulation emphasized focused programs, cooperation between programs,
and simple streams as universal interfaces. For this repository, every command should
have a clear purpose and predictable input/output behavior suitable for shell workflows.

### Measure before tuning

Rob Pike's performance guidance in Chapter 1 reinforces the Optimization rule: locate
the actual bottleneck, measure it, prefer simple algorithms for ordinary input sizes,
and give data organization priority over intricate control flow.

### SPOT: Single Point of Truth

Chapter 4, printed pages 115–116, argues that each item of knowledge should have one
authoritative representation. Duplication risks inconsistency and often indicates that
the design boundary is wrong.

Repository application:

- Do not duplicate constants, schemas, command metadata, or provider mappings without a
  concrete reason.
- When code and documentation must repeat facts, consider whether one can be generated
  or mechanically checked from the other.
- Be cautious with caches: duplicated state creates synchronization obligations.

### No junk, no confusion

The book applies SPOT to data modeling: do not represent impossible states, and do not
collapse real-world states that must remain distinguishable.

Repository application:

- Distinguish missing values, empty values, defaults, authentication failure, permission
  denial, not-found responses, and provider errors when their meanings differ.
- Avoid catch-all objects whose fields can form meaningless combinations.

### Minimality

Chapter 13, printed page 357, refines “small is beautiful”: choose the shared context a
program truly needs, then make components as small as that boundary permits.

Repository application:

- A CLI may remain self-contained when authentication and provider context are tightly
  related.
- Split components when they can communicate through a smaller, clearer contract.
- Do not split merely to maximize the number of files or modules.

### Preserve information in transformations

Chapter 1 recommends that filters retain information they do not presently need when
discarding it would unnecessarily prevent later composition.

Repository application:

- Avoid lossy conversions unless the command's contract explicitly calls for them.
- Preserve provider identifiers and pagination or provenance data needed by downstream
  commands, subject to privacy and secret-handling constraints.

### Delegate or emulate familiar interfaces

Chapter 11, printed pages 290–291, recommends delegating a function to a familiar tool
when possible; when delegation is impractical, follow familiar conventions.

Repository application:

- Use the user's browser or established platform facility instead of recreating it.
- Follow common command-line conventions rather than inventing novel interaction models.

### Make messages exceptional

Chapter 11, printed pages 325–326, develops the Silence rule: routine success should be
quiet, while unexpected conditions deserve attention. Confirmation prompts should be
rare and meaningful; reversible design is often better than repeated confirmation.

## A Practical Checklist

### Architect

- Is the proposal the smallest complete design?
- Are components focused and joined by clear contracts?
- Are policy, mechanism, interface, and engine separated where their change patterns
  differ?
- Is every important fact owned by one authoritative representation?
- Are observability, failure behavior, compatibility, and future extension addressed
  without speculative machinery?

### Developer

- Is the implementation clearer and smaller than plausible alternatives?
- Does the command compose cleanly through arguments, streams, exit codes, and stable
  formats?
- Are successful output, diagnostics, and failures separated correctly?
- Is repetitive knowledge represented once rather than copied through branches?
- Was optimization driven by measurement rather than prediction?

### Tester

- Do tests verify observable contracts instead of mirroring internal implementation?
- Do they cover ordinary composition, malformed input, empty input, provider failure,
  and partial-operation risks?
- Do they check standard output, standard error, exit status, and silence on ordinary
  success where applicable?
- Do they expose hidden state, special cases, duplication, and compatibility surprises?
- Are tests deterministic, non-interactive, and free from live external side effects?

### Code reviewer

- Does the change introduce unnecessary size, coupling, duplication, hidden state, or
  cleverness?
- Does it violate established CLI expectations or make automation harder?
- Are failures early, visible, actionable, and safe?
- Are extension points flexible without implementing unrequested features?
- Do the tests demonstrate the contract and the important risks?

## Interpretation Notes

- “Textual” does not mean that every internal or external format must be plain text.
  Prefer inspectable, interoperable formats when they fit; use binary formats when the
  domain or provider requires them.
- “Be generous in what you accept” must be constrained by modern security practice.
  Accept compatible variation deliberately, but validate strictly at trust boundaries
  and never normalize hostile input into unsafe behavior.
- “Do one thing well” applies at the level of coherent user purpose. It does not require
  turning every function into a separate executable.
- “Design for extension” does not authorize speculative features, premature abstraction,
  or backward-compatibility promises the project cannot support.
- These rules sometimes pull in different directions. Good design requires explicit
  tradeoffs, evidence, and judgment rather than mechanical scoring.

## Source Locations

- Core philosophy and 17 rules: Chapter 1, printed pages 33–48.
- Practical prescriptions: Chapter 1, printed pages 49–50.
- SPOT and its data-model corollary: Chapter 4, printed pages 115–116.
- Least Surprise in interfaces: Chapter 11, printed pages 290–291.
- Silence and exceptional messages: Chapter 11, printed pages 325–326.
- Minimality and program size: Chapter 13, printed page 357.
