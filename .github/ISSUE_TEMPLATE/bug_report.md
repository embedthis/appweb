---
name: Bug report
about: Report a defect in Appweb
title: ''
labels: bug
assignees: ''
---

<!--
    Do NOT report security vulnerabilities here. Email security@embedthis.com instead.
    See SECURITY.md.

    Please format code and logs with triple backticks, and trim logs to the relevant portion
    rather than pasting them whole.
-->

### Environment

- Appweb version:
- OS and version:
- Hardware / architecture:
- TLS backend (OpenSSL, MbedTLS, or none):

### Build

How was it built? Paste the commands, or the premake5 options if you regenerated the projects.

```
make
```

### What happened

A clear description of the defect, and what you expected instead.

### Steps to reproduce

Prefer an isolated test case over your application, and prefer the bundled `http` client over a
browser: it is more controllable and its output is easier to read.

```
http -v http://localhost:8080/...
```

### Configuration

The relevant part of your `appweb.conf`, trimmed to what is needed to reproduce.

```
```

### Logs

Relevant excerpts only.

```
```
