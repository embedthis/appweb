# Appweb AI Documentation

This directory contains structured documentation to assist AI agents (like Claude Code) and developers in understanding and working with the Appweb project.

These documents are AI generated and are not guaranteed to be accurate or complete.
They are provided to give AI context and a starting point for understanding the project. Use the official product documentation for the most accurate information.

## Directory Structure

This directory contents may be only partially populated as Appweb is in maintenance mode.

```
AI/
├── README.md              # This file
├── agents/                # Claude sub-agent definitions (empty - for future use)
├── skills/                # Claude skill definitions (empty - for future use)
├── prompts/               # Claude prompts (empty - for future use)
├── workflows/             # Claude workflows (empty - for future use)
├── commands/              # Claude commands (empty - for future use)
├── designs/               # Design documentation
│   └── DESIGN.md          # Comprehensive architecture (1836 lines)
├── context/               # Project context and saved progress
│   └── CONTEXT.md         # Current state and work context (300 lines)
├── plans/                 # Project plans
│   └── PLAN.md            # Current project plan and status (246 lines)
├── procedures/            # Development procedures
│   └── PROCEDURE.md       # Standard procedures (515 lines)
├── logs/                  # Change logs and session logs
│   ├── CHANGELOG.md       # User-facing change log (112 lines)
│   ├── CONVERSION_SUMMARY.md  # Test suite conversion notes (134 lines)
│   └── SESSION-2025-10-27.md  # Session activity log (299 lines)
├── references/            # External references
│   └── REFERENCES.md      # Links and resources (280 lines)
├── releases/              # Release notes (empty - for future releases)
└── archive/               # Historical documentation (empty - for future use)
```

## Quick Start

### For AI Agents (Claude Code)

1. **Start here**: [CONTEXT.md](context/CONTEXT.md) - Understand current project state
2. **Architecture**: [DESIGN.md](designs/DESIGN.md) - Comprehensive technical design
3. **Procedures**: [PROCEDURE.md](procedures/PROCEDURE.md) - How to perform common tasks
4. **Plan**: [PLAN.md](plans/PLAN.md) - Project roadmap and status
5. **References**: [REFERENCES.md](references/REFERENCES.md) - External resources

### For Developers

1. **Quick Start**: Read [../README.md](../README.md) first
2. **Build Guide**: See [../CLAUDE.md](../CLAUDE.md) and [PROCEDURE.md](procedures/PROCEDURE.md)
3. **Architecture**: Review [DESIGN.md](designs/DESIGN.md)
4. **Testing**: Follow procedures in [PROCEDURE.md](procedures/PROCEDURE.md#testing-procedures)

## Key Documents

### designs/DESIGN.md (1,836 lines)

Comprehensive architectural and implementation documentation covering:

- High-level architecture and component structure
- MPR runtime (garbage collection, threading, memory management)
- HTTP protocol stack (HTTP/1.0, HTTP/1.1, HTTP/2, WebSockets)
- ESP web framework (MVC, database, templating)
- Handler modules (CGI, FastCGI, ESP, Proxy)
- Security architecture and defense mechanisms
- Build system and cross-platform support
- Request processing flow
- Configuration system
- Performance optimization
- Deployment and operations
- Development guide
- API reference
- Complete configuration directive reference

### plans/PLAN.md (246 lines)

Current project plan documenting:

- Maintenance mode status
- Test suite modernization (completed)
- Security maintenance procedures
- Build system status
- Migration path to Ioto
- Testing strategy
- Build configurations
- Release process
- Long-term maintenance outlook

### procedures/PROCEDURE.md (515 lines)

Standard operating procedures for:

- Build procedures (standard, component-specific, IDE)
- Testing procedures (execution, debugging, development)
- Debugging procedures (logging, GDB/LLDB, memory analysis)
- Documentation procedures (generation, standards)
- Security procedures (reporting, review, updates)
- Release procedures (versioning, packaging)
- Git procedures (commit format, branch strategy)

### context/CONTEXT.md (300 lines)

Current work context including:

- Project state and recent work
- Architecture overview
- Development environment
- Test suite structure
- Component status
- Known issues
- File locations
- Common tasks
- Migration guidance

### references/REFERENCES.md (280 lines)

External references to:

- Official documentation (online and local)
- Embedthis products (Ioto, GoAhead, Builder)
- Dependencies (OpenSSL, MbedTLS, PCRE, SQLite)
- Protocols and standards
- Testing and development tools
- Security resources
- Community and support

### logs/CHANGELOG.md (112 lines)

User-facing change log:

- Reverse chronological format
- Recent test suite modernization
- Documentation structure creation
- Version history
- Change categories
- Issue reporting information

### logs/SESSION-2025-10-27.md (299 lines)

Detailed session log documenting:

- AI documentation structure creation
- Activities performed
- Files created
- Questions addressed
- Outcomes and next steps

## Maintenance

### Updating Documentation

**When to Update**:

- After implementing features or fixes
- When architecture changes
- When procedures change
- After each work session

**What to Update**:

1. **CHANGELOG.md** - Add entry for user-facing changes
2. **SESSION-{DATE}.md** - Create new session log
3. **CONTEXT.md** - Update current state
4. **DESIGN.md** - If architecture changes
5. **PLAN.md** - If priorities or status changes
6. **PROCEDURE.md** - If workflows change

### Creating Session Logs

For each work session, create `logs/SESSION-YYYY-MM-DD.md` with:

- Session overview and focus
- Activities performed
- Questions addressed
- Files created/modified
- Outcomes
- Next steps

### Archiving Documentation

When documentation becomes historical:

1. Move to `archive/` directory
2. Maintain same structure in archive
3. Update current documentation
4. Reference archived docs if needed

## Project Status

**Appweb Status**: Maintenance Mode

- ✓ Security updates ongoing
- ✓ Critical bug fixes
- ✗ No new features
- ✓ Comprehensive test suite
- ✓ Complete documentation

**Migration Path**: [Ioto Device Agent](https://www.embedthis.com/ioto/) recommended for new projects

## Support

- **Email**: support@embedthis.com
- **Security**: security@embedthis.com
- **Website**: https://www.embedthis.com/appweb/
- **Documentation**: https://www.embedthis.com/appweb/doc/

## Conventions

### Git Commit Prefixes

- `FIX:` - Bug fixes
- `DEV:` - Features, refactoring
- `CHORE:` - Build, formatting, infrastructure
- `TEST:` - Test-related changes
- `DOC:` - Documentation updates

### Documentation Style

- Markdown format
- Clear headings and structure
- Code examples where appropriate
- External links for references
- Maintain table of contents for long documents

## Related Documentation

- [../README.md](../README.md) - Project overview
- [../CLAUDE.md](../CLAUDE.md) - AI/developer guidance for this project
- [../CONTRIBUTING.md](../CONTRIBUTING.md) - Contribution guidelines
- [../../CLAUDE.md](../../CLAUDE.md) - Parent project guidance
- [../doc/](../doc/) - Generated API documentation

---

**Created**: 2025-10-27
**Last Updated**: 2025-10-27
**Maintained By**: Embedthis Software
