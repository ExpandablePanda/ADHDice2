---
name: ui-animations-micro-interactions
description: Use this skill when performing UI animation design, transition implementation, gesture feedback, and micro-interaction polish for web interfaces.
---

# Goal
Add motion that clarifies hierarchy, reinforces interaction, and gives the interface personality without sacrificing usability or performance.

# Instructions
1. Identify the moments where motion adds meaning: entry, feedback, state change, navigation, or emphasis.
2. Choose the simplest implementation that delivers the effect, preferring CSS transitions or transforms before heavier animation systems.
3. Animate properties that perform well and avoid effects that trigger expensive layout or paint work when possible.
4. Coordinate timing, easing, and sequencing so motion feels intentional and consistent with the product's tone.
5. Verify reduced-motion behavior and ensure motion does not block core tasks or obscure content.

# Input
A request to animate components, add micro-interactions, improve page transitions, or polish the feel of a web UI.

# Output
Animation-ready component code, motion styles, or interaction logic that improves the user experience.

# Best Practices
- Use transforms and opacity for performant motion where possible.
- Make motion support usability rather than distract from it.
- Respect `prefers-reduced-motion` and keep fallbacks functional.
- Prefer a few memorable interactions over constant motion noise.
