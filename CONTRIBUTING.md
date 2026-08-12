# Contributing to Virtual Grand Piano

Thank you for helping improve Virtual Grand Piano.

## Development workflow

1. Fork or clone the repository.
2. Create a focused feature branch from `main`.
3. Install dependencies with `npm ci`.
4. Start the development server with `npm run dev`.
5. Keep changes focused and avoid unrelated formatting churn.
6. Run `npm run check` before opening a pull request.
7. Open a pull request with a clear description, screenshots for visual changes, and testing notes.

## Commit style

Use short, imperative commit messages. Examples:

- `add pedal interaction`
- `improve string material`
- `fix exploded-view labels`

## Code guidelines

- Prefer small, composable scene-building functions.
- Keep render-loop work minimal and allocation-free where practical.
- Preserve keyboard, pointer, and touch accessibility.
- Optimize textures and geometry before adding large binary assets.
- Document non-obvious physical or musical assumptions in code.

## Issues

For bugs, include reproduction steps, browser/OS information, expected behavior, and screenshots or a short recording when visual behavior is involved.
