#!/usr/bin/env python3

from pathlib import Path
import textwrap


ROOT = Path("/Users/andrewmarkschaffer/Documents/Codex/2026-04-29/skill-creator-users-andrewmarkschaffer-codex-skills/generated-skill-library")


SKILLS = [
    {
        "name": "html-semantic-markup",
        "description": "Use this skill when performing semantic HTML page structure, content hierarchy, forms, navigation, and accessible document markup tasks.",
        "goal": "Create clean, semantic HTML that gives the interface a meaningful structure for users, browsers, assistive technology, SEO, and maintainability.",
        "instructions": [
            "Identify the content model before writing tags: page regions, headings, actions, media, lists, and form controls.",
            "Choose semantic elements first (`header`, `main`, `section`, `article`, `nav`, `aside`, `footer`, `button`, `label`) and use `div` only when no semantic element fits.",
            "Build a valid heading hierarchy, associate labels with controls, and ensure interactive elements use the correct native element.",
            "Add only the attributes that improve meaning or behavior, including `alt`, `type`, `aria-*`, `autocomplete`, and `data-*` when justified.",
            "Review the final structure for readability, keyboard flow, and future styling flexibility before finishing.",
        ],
        "input": "A request to create or improve page markup, templates, content structure, forms, navigation, or component skeletons.",
        "output": "Semantic HTML snippets, templates, or component markup with correct document structure and accessible element choices.",
        "best_practices": [
            "Prefer native HTML behavior over custom scripting whenever possible.",
            "Preserve accessible names, labels, and heading order.",
            "Keep markup minimal and avoid wrapper-heavy DOM trees that hurt performance and maintainability.",
            "Validate that links navigate and buttons act, rather than swapping their responsibilities.",
        ],
    },
    {
        "name": "css-layout-systems",
        "description": "Use this skill when performing CSS layout work with Flexbox, Grid, spacing systems, alignment, and complex responsive composition.",
        "goal": "Build robust CSS layouts that are predictable, responsive, and easy to extend without resorting to fragile positioning hacks.",
        "instructions": [
            "Decide whether the problem is one-dimensional or two-dimensional before choosing Flexbox or Grid.",
            "Define the parent layout contract first: flow, gap, alignment, track sizing, wrapping, and overflow behavior.",
            "Use spacing, alignment, and intrinsic sizing deliberately instead of patching layouts with arbitrary margins or magic numbers.",
            "Account for small screens, large screens, and awkward content lengths while building the layout rules.",
            "Test the result against edge cases such as long labels, empty states, and unequal content blocks.",
        ],
        "input": "A request involving page sections, card grids, navigation bars, dashboards, split panes, or any layout alignment problem.",
        "output": "CSS or component styles that use Flexbox, Grid, and spacing tokens to create stable layouts.",
        "best_practices": [
            "Prefer `gap` over manual sibling margins for consistent spacing.",
            "Use `minmax()`, `auto-fit`, and intrinsic sizing to reduce breakpoint sprawl.",
            "Avoid absolute positioning for core layout unless the design truly requires layering.",
            "Keep layout logic composable so later content changes do not break the structure.",
        ],
    },
    {
        "name": "tailwind-css-development",
        "description": "Use this skill when performing Tailwind CSS styling, utility composition, component extraction, theme token usage, and Tailwind-driven UI implementation.",
        "goal": "Implement polished interfaces with Tailwind CSS while keeping utility usage intentional, readable, and aligned with the project design language.",
        "instructions": [
            "Inspect the existing Tailwind conventions before adding classes, plugins, or theme extensions.",
            "Compose utilities around layout, spacing, color, typography, and states in a clear order that is easy to scan.",
            "Extract repeated patterns into components, variants, or utility helpers instead of duplicating long class strings everywhere.",
            "Use theme tokens and configuration values rather than ad hoc arbitrary values when the system already has a design language.",
            "Check hover, focus, active, dark-mode, and responsive variants so the component behaves consistently across states.",
        ],
        "input": "A request to build or restyle components, pages, or layouts in a codebase that uses Tailwind CSS.",
        "output": "Tailwind-based markup or component code with maintainable utility classes and reusable patterns.",
        "best_practices": [
            "Keep class lists purposeful and extract repetition before it becomes noise.",
            "Prefer semantic component boundaries over giant template files full of one-off utilities.",
            "Preserve accessible color contrast, focus visibility, and responsive behavior.",
            "Avoid arbitrary values unless they are necessary to realize a specific design decision.",
        ],
    },
    {
        "name": "responsive-web-design",
        "description": "Use this skill when performing responsive interface design, breakpoint strategy, fluid sizing, adaptive layouts, and cross-device frontend behavior.",
        "goal": "Create interfaces that feel intentionally designed across phones, tablets, laptops, and large displays instead of merely shrinking or stretching.",
        "instructions": [
            "Identify the critical content, actions, and reading flow that must survive on every viewport.",
            "Start with the smallest practical layout, then progressively add complexity as screen space increases.",
            "Use fluid measurements, flexible media, and scalable type before adding many breakpoint-specific overrides.",
            "Adjust hierarchy, spacing, and component density at each breakpoint rather than only changing widths.",
            "Test for overflow, awkward wrapping, tap-target issues, and motion behavior on narrow screens.",
        ],
        "input": "A request to make a page or component responsive, or to design a layout that works well across device sizes.",
        "output": "Responsive HTML, CSS, or component code with deliberate behavior across multiple viewport ranges.",
        "best_practices": [
            "Prefer fluid layouts and intrinsic sizing over device-specific hardcoding.",
            "Optimize images, media, and layout shifts for performance on constrained devices.",
            "Keep tap targets comfortable and text readable without zooming.",
            "Treat responsiveness as a content and interaction problem, not just a width problem.",
        ],
    },
    {
        "name": "component-based-ui-development",
        "description": "Use this skill when performing component-based UI architecture, reusable interface building, props design, composition patterns, and shared component implementation.",
        "goal": "Build reusable UI components with clear responsibilities, clean APIs, and styling patterns that scale across a product.",
        "instructions": [
            "Define the component's single responsibility, public API, states, and composition boundaries before coding.",
            "Separate presentational concerns, interaction logic, and data dependencies so the component stays reusable.",
            "Design props and slots or children around real usage patterns rather than theoretical completeness.",
            "Support important states explicitly: loading, empty, error, success, disabled, and interactive variants when relevant.",
            "Review whether the component reduces duplication and improves consistency in the codebase.",
        ],
        "input": "A request to create, refactor, or expand reusable UI components or a component library.",
        "output": "Reusable component code, supporting styles, and clear interfaces for composing UI consistently.",
        "best_practices": [
            "Keep components small enough to reason about but large enough to remove meaningful duplication.",
            "Avoid prop explosions; prefer composition when variants become unwieldy.",
            "Preserve accessibility and testability across component states.",
            "Make defaults sensible so simple use cases stay simple.",
        ],
    },
    {
        "name": "react-component-development",
        "description": "Use this skill when performing React component development, hooks-based UI logic, props and state design, and React-specific rendering behavior.",
        "goal": "Create production-grade React components that fit the existing architecture, manage state clearly, and render predictably.",
        "instructions": [
            "Match the project's React patterns, file conventions, and state ownership model before adding new components.",
            "Model component state carefully: derive what can be derived and keep local state minimal but explicit.",
            "Use hooks for lifecycle, async work, and event behavior in a way that avoids stale state and unnecessary complexity.",
            "Keep render output declarative, split subcomponents when it improves clarity, and handle loading or error states intentionally.",
            "Review for rendering cost, prop clarity, and whether the component is easy to test and reuse.",
        ],
        "input": "A request to build or improve React components, hooks, interactive UI, or React page sections.",
        "output": "React components, hooks, and related styles or tests that behave correctly in the target app.",
        "best_practices": [
            "Prefer straightforward data flow over clever indirection.",
            "Respect the team's established approach to server state, client state, and side effects.",
            "Keep forms, async actions, and derived UI states explicit.",
            "Avoid premature memoization unless profiling or the codebase pattern justifies it.",
        ],
    },
    {
        "name": "ui-animations-micro-interactions",
        "description": "Use this skill when performing UI animation design, transition implementation, gesture feedback, and micro-interaction polish for web interfaces.",
        "goal": "Add motion that clarifies hierarchy, reinforces interaction, and gives the interface personality without sacrificing usability or performance.",
        "instructions": [
            "Identify the moments where motion adds meaning: entry, feedback, state change, navigation, or emphasis.",
            "Choose the simplest implementation that delivers the effect, preferring CSS transitions or transforms before heavier animation systems.",
            "Animate properties that perform well and avoid effects that trigger expensive layout or paint work when possible.",
            "Coordinate timing, easing, and sequencing so motion feels intentional and consistent with the product's tone.",
            "Verify reduced-motion behavior and ensure motion does not block core tasks or obscure content.",
        ],
        "input": "A request to animate components, add micro-interactions, improve page transitions, or polish the feel of a web UI.",
        "output": "Animation-ready component code, motion styles, or interaction logic that improves the user experience.",
        "best_practices": [
            "Use transforms and opacity for performant motion where possible.",
            "Make motion support usability rather than distract from it.",
            "Respect `prefers-reduced-motion` and keep fallbacks functional.",
            "Prefer a few memorable interactions over constant motion noise.",
        ],
    },
    {
        "name": "design-system-implementation",
        "description": "Use this skill when performing design system implementation, tokenization, shared component standards, theming, and UI consistency work.",
        "goal": "Translate a design language into reusable tokens, components, and rules that keep the product visually and behaviorally consistent.",
        "instructions": [
            "Identify the system primitives first: color, type, spacing, radius, elevation, motion, and layout tokens.",
            "Define how tokens map into components, states, and themes instead of treating them as isolated values.",
            "Implement reusable UI building blocks with clear variants, state rules, and composition guidance.",
            "Align naming and structure with the codebase so the system is easy to adopt incrementally.",
            "Review for consistency drift, duplicated styles, and missing state coverage across components.",
        ],
        "input": "A request to build or expand a design system, theme layer, token set, or shared component foundation.",
        "output": "Design tokens, themed styles, reusable components, and implementation patterns that support a unified interface.",
        "best_practices": [
            "Keep token names semantic where possible so they survive redesigns.",
            "Cover hover, focus, disabled, error, and dark or alternate themes where relevant.",
            "Document variants through code structure and examples, not only comments.",
            "Optimize for consistency and adoption, not just visual completeness.",
        ],
    },
    {
        "name": "accessibility-frontend-development",
        "description": "Use this skill when performing frontend accessibility improvements, WCAG-aligned component work, keyboard interaction design, and inclusive UI implementation.",
        "goal": "Build and improve frontend code so more people can perceive, understand, navigate, and operate the interface reliably.",
        "instructions": [
            "Identify the user flow, then inspect structure, semantics, focus order, labels, and announcements for barriers.",
            "Prefer native elements and browser behaviors first, then add ARIA only where semantic HTML is insufficient.",
            "Implement keyboard support, visible focus, and state communication for interactive components.",
            "Check contrast, motion, timing, form feedback, and error messaging against likely WCAG issues.",
            "Review the completed UI with screen-reader, keyboard, and zoom use cases in mind.",
        ],
        "input": "A request to make frontend code accessible, fix WCAG issues, improve keyboard support, or audit interaction patterns.",
        "output": "Accessible frontend code, improved semantics, interaction fixes, and guidance on remaining accessibility considerations.",
        "best_practices": [
            "Do not replace semantic HTML with ARIA-heavy custom widgets unless necessary.",
            "Ensure all interactive controls have accessible names and clear states.",
            "Keep error messages specific and programmatically associated with inputs.",
            "Treat accessibility as a product requirement, not a final polish pass.",
        ],
    },
    {
        "name": "landing-page-design",
        "description": "Use this skill when performing landing page design for marketing sites, product launches, campaign pages, and high-impact web storytelling.",
        "goal": "Design and build landing pages that communicate value fast, create a memorable first impression, and guide visitors toward action.",
        "instructions": [
            "Clarify the audience, product promise, and primary conversion action before choosing a layout direction.",
            "Create a strong above-the-fold story with clear hierarchy, emotional tone, and a visible next step.",
            "Sequence supporting sections around proof, benefits, objections, and action rather than generic filler blocks.",
            "Use typography, imagery, layout rhythm, and motion to give the page a distinctive voice.",
            "Review the final page for scannability, trust signals, and friction in the conversion path.",
        ],
        "input": "A request to design or implement a landing page, splash page, campaign page, or marketing homepage.",
        "output": "A designed and coded landing page or section set optimized for message clarity and conversion.",
        "best_practices": [
            "Keep the primary CTA clear and repeated where useful without becoming noisy.",
            "Support claims with proof: testimonials, metrics, logos, demos, or product visuals.",
            "Design mobile and desktop intentionally, especially the first screen.",
            "Optimize performance because slow marketing pages burn acquisition value.",
        ],
    },
    {
        "name": "saas-dashboard-ui-design",
        "description": "Use this skill when performing SaaS dashboard UI design, analytics interface layout, admin surfaces, and data-dense product screens.",
        "goal": "Design dashboards that balance clarity, density, hierarchy, and efficiency for users who need to monitor and act on information.",
        "instructions": [
            "Identify the user's top tasks, decisions, and alerts before arranging panels or charts.",
            "Prioritize information hierarchy so the most important metrics, changes, and actions surface first.",
            "Use a layout system that supports density without turning the screen into visual noise.",
            "Design empty, loading, warning, and error states alongside the ideal data-rich state.",
            "Review for scan speed, filter discoverability, table readability, and action clarity.",
        ],
        "input": "A request to design dashboard screens, admin panels, analytics surfaces, or operational product UI.",
        "output": "Dashboard layouts, components, and UI structure optimized for data visibility and actionability.",
        "best_practices": [
            "Use typography, spacing, and color to separate importance levels instead of decorating every card equally.",
            "Keep filters, bulk actions, and drill-down actions easy to locate.",
            "Design for real data lengths and edge states, not only polished mock data.",
            "Preserve accessibility and performance even in dense interfaces.",
        ],
    },
    {
        "name": "conversion-focused-ui-ux",
        "description": "Use this skill when performing conversion-focused UI and UX work for signup flows, checkout paths, lead capture, onboarding, and action-oriented product surfaces.",
        "goal": "Shape interface decisions around reducing friction, increasing clarity, and helping users complete a valuable action confidently.",
        "instructions": [
            "Identify the target conversion event and the main sources of friction, hesitation, or confusion.",
            "Reduce cognitive load by simplifying choices, clarifying benefits, and removing unnecessary steps.",
            "Strengthen hierarchy around the primary action with supportive copy, visual emphasis, and trust cues.",
            "Design form and interaction states so users always understand what is required and what happens next.",
            "Review the path for ambiguity, drop-off risks, and mismatches between user intent and interface language.",
        ],
        "input": "A request to improve sign-up, checkout, onboarding, lead generation, or any interface where completion rate matters.",
        "output": "UI and UX improvements, layouts, forms, or flows tuned to improve completion and reduce abandonment.",
        "best_practices": [
            "Optimize for clarity before persuasion tricks.",
            "Minimize required fields and unnecessary decisions in high-friction flows.",
            "Use error prevention and progressive disclosure to keep momentum high.",
            "Preserve user trust with honest copy, clear states, and secure interaction cues.",
        ],
    },
    {
        "name": "modern-ui-layout-patterns",
        "description": "Use this skill when performing modern web UI layout design, section composition, visual hierarchy planning, and contemporary interface structuring.",
        "goal": "Apply modern layout patterns thoughtfully so interfaces feel current, intentional, and suited to the product rather than trend-chasing clones.",
        "instructions": [
            "Read the product context first, then choose layout patterns that support the content and interaction model.",
            "Compose sections, cards, navigation, sidebars, and content rails around a clear visual hierarchy.",
            "Use asymmetry, spacing rhythm, layering, and density changes to avoid flat repetitive layouts.",
            "Balance modern visual language with practical readability and implementation constraints.",
            "Review the result for originality, structure, and whether the pattern truly helps the user task.",
        ],
        "input": "A request to design page sections, modernize an interface, choose layout patterns, or improve visual structure.",
        "output": "Layout structures, UI patterns, and coded sections that feel modern and usable.",
        "best_practices": [
            "Adopt patterns intentionally instead of copying trendy templates blindly.",
            "Use strong hierarchy, not just decoration, to signal importance.",
            "Design for content variability so the layout stays strong with real data.",
            "Avoid pattern overload that makes every section compete for attention.",
        ],
    },
    {
        "name": "mobile-first-design",
        "description": "Use this skill when performing mobile-first interface design, touch-friendly layout decisions, and smartphone-priority web experience work.",
        "goal": "Design from the constraints and opportunities of mobile first so the smallest experience is fast, clear, and easy to use.",
        "instructions": [
            "Start with the essential content and actions that must fit on a small touchscreen.",
            "Design navigation, forms, and dense content for thumb reach, readable text, and limited attention spans.",
            "Use progressive enhancement to scale the interface upward instead of cutting down a desktop layout later.",
            "Account for mobile realities such as keyboard overlays, safe areas, network constraints, and motion sensitivity.",
            "Review the result for tap comfort, scroll flow, and whether the main action remains obvious at every stage.",
        ],
        "input": "A request to create or improve mobile-first pages, responsive experiences, or smartphone-centered web interfaces.",
        "output": "Layouts and component behavior designed around mobile constraints first, with graceful expansion to larger screens.",
        "best_practices": [
            "Prioritize speed, clarity, and tap-target quality on mobile networks and devices.",
            "Keep navigation and forms simple enough to complete one-handed where possible.",
            "Avoid hiding essential information behind unnecessary taps.",
            "Scale content density carefully as screens grow larger.",
        ],
    },
    {
        "name": "rest-api-development",
        "description": "Use this skill when performing REST API endpoint design, request and response modeling, routing, resource handling, and web service implementation.",
        "goal": "Build clear, predictable REST APIs that expose resources consistently and are straightforward for clients to consume.",
        "instructions": [
            "Model the resource and its lifecycle before writing routes, handlers, or response shapes.",
            "Choose HTTP methods, status codes, and URI patterns that match the operation semantics.",
            "Validate input, authorize access, and normalize error handling at the boundary of each endpoint.",
            "Return consistent response shapes with clear success and failure contracts for clients.",
            "Review for idempotency, pagination, filtering, and versioning needs where relevant.",
        ],
        "input": "A request to create or modify REST endpoints, controllers, handlers, or API route structures.",
        "output": "API route code, request and response contracts, and related server logic for RESTful services.",
        "best_practices": [
            "Keep endpoint behavior consistent across the API surface.",
            "Separate transport concerns from domain logic where the architecture allows.",
            "Avoid leaking internal implementation details in responses.",
            "Log and observe server behavior without exposing sensitive information.",
        ],
    },
    {
        "name": "authentication-systems",
        "description": "Use this skill when performing authentication flow implementation, session handling, token strategies, login systems, and identity-related backend work.",
        "goal": "Implement authentication flows that are secure, understandable, and well integrated with the surrounding application architecture.",
        "instructions": [
            "Identify the authentication model first: session-based, token-based, federated, passwordless, or a hybrid.",
            "Map the full user journey including sign-up, login, logout, reset, refresh, verification, and failure states.",
            "Store secrets and credentials safely, hash passwords with modern algorithms, and protect transport and cookies appropriately.",
            "Enforce authorization boundaries separately from authentication so permissions stay explicit.",
            "Review for replay risks, token leakage, brute-force mitigation, and account recovery safety.",
        ],
        "input": "A request to build or improve login, signup, session management, tokens, account security, or authorization-adjacent flows.",
        "output": "Authentication and session code, middleware, handlers, or supporting data structures for secure user identity flows.",
        "best_practices": [
            "Never store plaintext secrets or passwords.",
            "Use secure cookie settings, expiration policies, and rotation strategies where relevant.",
            "Keep error messages informative without revealing account enumeration details.",
            "Design the recovery path with the same care as the happy path.",
        ],
    },
    {
        "name": "database-schema-design",
        "description": "Use this skill when performing relational or document database schema design, table modeling, indexing, and data relationship planning.",
        "goal": "Design database schemas that reflect the product domain accurately and support performance, integrity, and future evolution.",
        "instructions": [
            "Clarify the domain entities, relationships, ownership rules, and lifecycle of the data before writing schema code.",
            "Choose data structures and normalization levels that balance correctness, query needs, and operational simplicity.",
            "Define keys, constraints, indexes, and referential rules around real access patterns instead of guessing.",
            "Model timestamps, soft deletes, audit needs, and multi-tenant boundaries where relevant.",
            "Review for migration safety, query efficiency, and how the schema will evolve over time.",
        ],
        "input": "A request to design tables, collections, migrations, indexes, or persistence models for application data.",
        "output": "Schema definitions, migrations, indexes, and data model guidance aligned with the application's domain.",
        "best_practices": [
            "Protect data integrity with constraints rather than relying only on application code.",
            "Index for real query patterns, not every possible column.",
            "Name tables and fields clearly enough to survive product growth.",
            "Design migrations to be understandable and safe to run in sequence.",
        ],
    },
    {
        "name": "server-side-validation",
        "description": "Use this skill when performing server-side validation, input sanitization, business rule enforcement, and trusted boundary checks in backend code.",
        "goal": "Validate incoming data on the server so application logic only runs on trusted, well-formed, authorized input.",
        "instructions": [
            "Identify the trust boundary and treat every external input as untrusted until validated.",
            "Separate shape validation, type coercion, sanitization, and business rule validation so failure causes remain clear.",
            "Validate as close to the request boundary as practical, then pass normalized data deeper into the system.",
            "Return precise validation errors that help clients recover without exposing internal details.",
            "Review for bypass paths, inconsistent rules across endpoints, and mismatches with frontend validation.",
        ],
        "input": "A request to validate API input, sanitize payloads, enforce constraints, or harden backend request handling.",
        "output": "Validation schemas, request guards, sanitization logic, and consistent validation error behavior.",
        "best_practices": [
            "Do not rely on frontend validation for safety-critical checks.",
            "Keep validation logic centralized enough to prevent drift.",
            "Reject unexpected fields when the API contract should be strict.",
            "Log validation failures carefully without storing sensitive raw input unnecessarily.",
        ],
    },
    {
        "name": "api-error-handling",
        "description": "Use this skill when performing API error handling, failure response design, exception mapping, resilience improvements, and observability-friendly backend behavior.",
        "goal": "Handle API failures consistently so clients receive useful responses and developers can diagnose problems quickly and safely.",
        "instructions": [
            "Catalog the error types first: validation, authentication, authorization, not found, conflict, rate limit, dependency failure, and unexpected server error.",
            "Map each error type to consistent HTTP status codes and response payloads.",
            "Centralize error translation where possible so endpoints do not each invent their own failure shape.",
            "Include enough context for debugging through structured logging, tracing, or error IDs without exposing secrets to clients.",
            "Review retry behavior, user-facing messages, and how downstream failures are surfaced.",
        ],
        "input": "A request to improve API errors, exception handling, failure contracts, or backend resilience behavior.",
        "output": "Error-handling middleware, response schemas, exception mapping, and logging patterns for backend services.",
        "best_practices": [
            "Keep client-facing errors consistent and predictable.",
            "Separate operational details for logs from safe user-visible messages.",
            "Avoid swallowing exceptions without recording enough debugging context.",
            "Preserve correct status codes so clients can react intelligently.",
        ],
    },
    {
        "name": "full-stack-feature-development",
        "description": "Use this skill when performing full-stack feature development that spans frontend UI, backend logic, data flow, and end-to-end user behavior.",
        "goal": "Ship cohesive features across the stack so the user experience, server behavior, and data model all move together coherently.",
        "instructions": [
            "Trace the feature from user intent to UI states, network requests, backend rules, persistence, and side effects.",
            "Define the contracts between layers before implementing so payloads, validation, and states stay aligned.",
            "Build the smallest end-to-end slice first, then expand edge cases and polish once the path works.",
            "Handle loading, success, empty, and error states across both client and server behavior.",
            "Review the completed feature for consistency, rollback safety, and integration with existing architecture.",
        ],
        "input": "A request to implement a new feature or change that touches both frontend and backend behavior.",
        "output": "Coordinated frontend, backend, and data-layer code that delivers a complete product feature.",
        "best_practices": [
            "Favor vertical slices over disconnected layer-by-layer rewrites.",
            "Keep API contracts and UI assumptions synchronized.",
            "Add targeted verification around the core user journey.",
            "Preserve security, authorization, and validation at each boundary.",
        ],
    },
    {
        "name": "crud-application-structure",
        "description": "Use this skill when performing CRUD application architecture, resource workflows, data management screens, and create-read-update-delete product structure.",
        "goal": "Organize CRUD applications so data models, screens, forms, and backend operations remain clear as the app grows.",
        "instructions": [
            "Identify the core resources, relationships, and lifecycle actions before structuring routes or screens.",
            "Design consistent patterns for list, detail, create, edit, archive, and delete flows.",
            "Align the frontend and backend around predictable resource naming, actions, and response contracts.",
            "Support empty states, permissions, optimistic or pessimistic updates, and destructive-action safeguards intentionally.",
            "Review the overall structure for duplication, navigability, and how easily new resources can follow the same pattern.",
        ],
        "input": "A request to build or refactor a CRUD app, resource management flow, admin area, or record-based application structure.",
        "output": "Application structure, routes, screens, handlers, and patterns that support CRUD features consistently.",
        "best_practices": [
            "Use repeatable conventions so each resource does not reinvent the app structure.",
            "Make destructive actions confirmable, reversible, or auditable when appropriate.",
            "Design for real data states including empty, stale, locked, or partially loaded records.",
            "Keep the resource model simple enough for teams to extend confidently.",
        ],
    },
    {
        "name": "form-handling-validation",
        "description": "Use this skill when performing web form implementation, client-side and server-side validation coordination, form UX, and submission flow handling.",
        "goal": "Build forms that are easy to complete, validate reliably, and recover gracefully from submission errors.",
        "instructions": [
            "Clarify the user task, required fields, validation rules, and success destination before shaping the form.",
            "Design the form around input grouping, defaults, helper text, and progressive disclosure where it reduces friction.",
            "Coordinate client-side feedback with server-side validation so users get fast guidance without losing correctness.",
            "Handle pending, success, error, retry, and partial-save states intentionally.",
            "Review for accessibility, keyboard flow, field naming clarity, and resilience to interrupted submissions.",
        ],
        "input": "A request to build or improve forms, validation flows, submission UX, or form-processing integrations.",
        "output": "Form UI, validation logic, submission handlers, and error states that support reliable data entry.",
        "best_practices": [
            "Keep labels and errors specific enough that users know how to recover.",
            "Preserve entered data when recoverable errors occur.",
            "Validate near the user but enforce correctness on the server.",
            "Reduce unnecessary fields and steps in high-friction forms.",
        ],
    },
    {
        "name": "state-management",
        "description": "Use this skill when performing frontend or full-stack state management, shared UI state design, async data flow coordination, and store architecture work.",
        "goal": "Model application state so data flow stays understandable, updates remain predictable, and UI behavior scales without confusion.",
        "instructions": [
            "Classify state first: server state, local UI state, derived state, form state, or cross-cutting app state.",
            "Keep state as close to where it is used as practical, then elevate only when multiple consumers truly need it.",
            "Choose the lightest state-management pattern that fits the complexity and existing project conventions.",
            "Define loading, stale, optimistic, and error transitions clearly for async state.",
            "Review for duplicated sources of truth, unnecessary synchronization, and hard-to-debug update chains.",
        ],
        "input": "A request to manage shared state, refactor stores, coordinate async UI, or reduce data-flow complexity.",
        "output": "State models, store code, hooks, reducers, or data-flow structure that make application behavior predictable.",
        "best_practices": [
            "Avoid global state for data that can remain local.",
            "Keep a single source of truth for each piece of meaningful state.",
            "Separate derived values from writable state to reduce bugs.",
            "Use established libraries only when the problem size justifies them.",
        ],
    },
    {
        "name": "code-refactoring",
        "description": "Use this skill when performing code refactoring, structural cleanup, duplication reduction, readability improvements, and maintainability-focused code changes.",
        "goal": "Improve code structure without changing intended behavior so the system becomes easier to understand, modify, and test.",
        "instructions": [
            "Understand the current behavior and risks before moving code around.",
            "Identify the main source of complexity: duplication, naming, long functions, mixed responsibilities, or tangled dependencies.",
            "Refactor in small, behavior-preserving steps that keep the system runnable.",
            "Rename and reorganize code toward clearer boundaries and more direct intent.",
            "Review for regressions, test gaps, and whether the result is materially easier to work with.",
        ],
        "input": "A request to clean up code, reduce duplication, improve architecture, or make existing logic easier to maintain.",
        "output": "Refactored code with clearer structure, simpler responsibilities, and preserved behavior.",
        "best_practices": [
            "Prefer incremental safe changes over sweeping rewrites without verification.",
            "Keep naming specific and intention-revealing.",
            "Add or update tests when refactoring changes risk surface.",
            "Do not hide complexity by merely moving it to another file.",
        ],
    },
    {
        "name": "performance-optimization",
        "description": "Use this skill when performing frontend or backend performance optimization, bottleneck reduction, rendering improvements, and efficiency-focused code changes.",
        "goal": "Improve performance in ways that measurably reduce wasted work, latency, or resource consumption without sacrificing correctness.",
        "instructions": [
            "Identify the likely bottleneck first instead of applying random optimizations.",
            "Focus on the hottest path: rendering, network, database, bundle size, serialization, or repeated computation.",
            "Implement the smallest change that removes meaningful waste, then reassess the new bottleneck.",
            "Protect correctness, readability, and user experience while optimizing.",
            "Review the result with metrics, edge cases, and fallback behavior in mind.",
        ],
        "input": "A request to speed up pages, APIs, rendering, queries, bundle size, or runtime efficiency.",
        "output": "Performance-oriented code changes, configuration updates, or structural improvements that target a clear bottleneck.",
        "best_practices": [
            "Measure or reason from evidence before optimizing.",
            "Optimize critical paths before micro-optimizing cold code.",
            "Avoid tradeoffs that make the system opaque for negligible gains.",
            "Preserve security and accessibility while chasing speed.",
        ],
    },
    {
        "name": "debugging-issue-diagnosis",
        "description": "Use this skill when performing debugging, issue diagnosis, bug reproduction, root-cause analysis, and troubleshooting across the web stack.",
        "goal": "Find the real cause of a bug efficiently and fix it with enough confidence that the issue is unlikely to recur.",
        "instructions": [
            "Reproduce the issue or reconstruct the failing conditions as precisely as possible.",
            "Narrow the problem space by isolating inputs, layers, recent changes, and observable symptoms.",
            "Collect evidence from code paths, logs, state transitions, and assumptions before deciding on a fix.",
            "Implement the smallest fix that addresses the root cause rather than the nearest symptom.",
            "Review whether tests, guards, or diagnostics should be added to prevent regressions.",
        ],
        "input": "A request to debug a failure, investigate unexpected behavior, diagnose an issue, or explain a bug.",
        "output": "A root-cause explanation, code fix, and any relevant verification or follow-up hardening changes.",
        "best_practices": [
            "Do not guess when the system can be observed.",
            "Keep hypotheses explicit and discard them quickly when evidence disagrees.",
            "Prefer fixes that explain the bug mechanically, not cosmetically.",
            "Capture learnings in tests or checks when the bug was subtle.",
        ],
    },
    {
        "name": "security-best-practices",
        "description": "Use this skill when performing application security hardening, secure coding review, vulnerability reduction, and safety-focused web development work.",
        "goal": "Reduce security risk by applying secure design and implementation practices across frontend, backend, and infrastructure-touching code.",
        "instructions": [
            "Identify the trust boundaries, sensitive data, privileged actions, and attacker-controlled inputs first.",
            "Review the code path for common web risks such as injection, broken access control, XSS, CSRF, secrets exposure, and unsafe deserialization.",
            "Implement layered mitigations using framework-safe defaults, validation, escaping, authorization, and secure storage practices.",
            "Limit error leakage, logging exposure, and overly broad permissions throughout the flow.",
            "Review the final design for least privilege, safe defaults, and operational follow-through.",
        ],
        "input": "A request to improve security, review risky code, harden authentication or authorization, or apply secure coding practices.",
        "output": "Security-focused code changes, risk analysis, and safer implementation patterns for the target system.",
        "best_practices": [
            "Prefer deny-by-default authorization and least-privilege access.",
            "Sanitize, validate, and escape at the correct boundaries.",
            "Never expose secrets, tokens, or internal stack details unnecessarily.",
            "Treat security findings as product issues that deserve verification, not only style concerns.",
        ],
    },
]


def render_skill(skill):
    instructions = "\n".join(
        f"{index}. {line}" for index, line in enumerate(skill["instructions"], start=1)
    )
    best_practices = "\n".join(f"- {line}" for line in skill["best_practices"])
    return textwrap.dedent(
        f"""\
---
name: {skill["name"]}
description: {skill["description"]}
---

# Goal
{skill["goal"]}

# Instructions
{instructions}

# Input
{skill["input"]}

# Output
{skill["output"]}

# Best Practices
{best_practices}
"""
    )


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    for skill in SKILLS:
        skill_dir = ROOT / skill["name"]
        skill_dir.mkdir(parents=True, exist_ok=True)
        (skill_dir / "SKILL.md").write_text(render_skill(skill))
    print(f"Created {len(SKILLS)} skills in {ROOT}")


if __name__ == "__main__":
    main()
