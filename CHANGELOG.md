# Changelog

## [0.1.7] - 2025-11-20

### Added
- Continue CLI agent integration
- New `continue` tool with headless mode support
- Environment variable `CONTINUE_CONFIG_PATH` for config file path
- Continue-specific documentation in README

### Changed
- Updated tool list to include Continue agent
- Extended `list-agents` description to reference all three agents

### Technical Details
- Added `src/continueAgent.ts` implementing Continue CLI invocation
- Added `ContinueInvokeSchema` to type definitions
- Added `runContinueBatch` function for parallel execution
- Registered `continue` tool in MCP server

## [0.1.6] - Previous release

Initial release with Codex and Gemini agents.
