# @adaptive-ds/assets-service

Process and serve site media from one Bun package. Images, video, fonts, and documents go in, sized and hashed files come out.

This is an early scaffold. The library currently exports the published package name so install, test, and release wiring can land first.

## Install

```bash
bun add @adaptive-ds/assets-service
```

## Scripts

```bash
bun run dev      # start the server entry
bun test         # bun tests
bun run build    # emit dist/
bun run format   # biome
bun run release  # git-cliff changelog + tag
```

## Links

- code: https://github.com/david1gp/assets-service
- npm: https://www.npmjs.com/package/@adaptive-ds/assets-service
- issues: https://github.com/david1gp/assets-service/issues

## License

MIT
